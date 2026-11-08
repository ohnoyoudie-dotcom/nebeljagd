import { ARROW_LENGTH } from './arrow-alignment.js';
import * as THREE from 'three';
import { traceRangedProjectile } from './projectile-collision.js';
import { WEAPON_TYPES, STAFF_TYPES, weaponStats, rarityVisual } from './loot-tiers.js';
import { createSpellEffects } from './spell-effects.js';
import { createSpecialWeapons } from './special-weapons.js';
import { createLootGlow } from './loot-glow.js';
import { createSwordEffects } from './sword-effects.js';
import { createSwordPose, sampleSwordPose, SWORD_PATTERNS, SWORD_COMBO_GRACE,
  SWORD_STRIKE_START, SWORD_STRIKE_END } from './sword-motion.js';

export const TRIPO_WEAPON_VARIANTS = Object.freeze({
  'kit-tripo-sword': 'sword',
  'kit-tripo-lava-staff': 'fireStaff',
  'kit-tripo-crystal-staff': 'iceStaff',
  'kit-tripo-poison-staff': 'poisonStaff',
  'kit-tripo-moon-staff': 'moonStaff',
  'kit-tripo-star-staff': 'starStaff',
  'kit-tripo-ornate-bow': 'bow',
});
export const DEFAULT_WEAPON_VARIANTS = Object.freeze({ bow: 'wood', sword: 'kit-tripo-sword', fireStaff: 'ember', iceStaff: 'frost',
  poisonStaff: 'kit-tripo-poison-staff', moonStaff: 'kit-tripo-moon-staff', starStaff: 'kit-tripo-star-staff' });
const DEFAULT_VARIANTS = DEFAULT_WEAPON_VARIANTS;
const WOOD_BOW_DRAW = .18;
export function resolveWeaponVariant(type, variant) {
  return type === 'sword' && (!variant || variant === 'steel') ? 'kit-tripo-sword' : variant ?? DEFAULT_VARIANTS[type];
}
// Separate readability on the ground from proportions at the hand.
// Keep the grip origin, measured tip and bow rig in source coordinates.
export const WEAPON_PRESENTATION_SCALE = Object.freeze({ sword: .8, bow: .88,
  fireStaff: .82, iceStaff: .82, poisonStaff: .82, moonStaff: .82, starStaff: .82 });
export const GROUND_WEAPON_SCALE = Object.freeze(Object.fromEntries(Object.entries(WEAPON_PRESENTATION_SCALE).map(([type, size]) => [type, size * 1.20])));
export const HELD_WEAPON_SCALE = Object.freeze(Object.fromEntries(Object.entries(WEAPON_PRESENTATION_SCALE).map(([type, size]) => [type, size * (type === 'bow' ? 1.18 : .88)])));

/** Ground loot, hand-aligned combat animation and swept terrain impacts. */
export function createWeapons(scene, characterGroup, world, character = null,
  { placements, heightAt = world?.heightAt, viewDistance = 100, combat = null, ownerId = 'player', isVisible = null,
    revealSceneryThroughFog = false, tripoPrototypes = {}, fireProjectilePrototype = null, projectilePrototypes = {}, rollRarity = null } = {}) {
  function assertPrototype(type, variant) {
    const modelType = TRIPO_WEAPON_VARIANTS[variant];
    if (!modelType) return;
    if (modelType !== type) throw new Error(`Die Waffenvariante ${variant} passt nicht zu ${type}.`);
    if (!tripoPrototypes[variant]?.isObject3D) throw new Error(`Die Tripo-Waffe ${variant} muss vor dem Platzieren geladen werden.`);
  }
  for (const definition of placements ?? []) assertPrototype(definition.kind, resolveWeaponVariant(definition.kind, definition.variant));
  const baseMaterials = new Set();
  const material = (color, extra = {}) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: 0.72, flatShading: true, ...extra });
    baseMaterials.add(result);
    return result;
  };
  const wood = material('#925631');
  const darkWood = material('#57351f');
  const leather = material('#47392c');
  const brass = material('#e6bd68', { metalness: 0.5, roughness: 0.35 });
  const steel = material('#d7e8ee', { metalness: 0.66, roughness: 0.26 });
  const string = material('#eee4be', { emissive: '#7e8b68', emissiveIntensity: 0.2 });
  const gem = material('#8df3d6', { emissive: '#22b8a2', emissiveIntensity: 0.8 });

  const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
  function addMesh(parent, geometry, meshMaterial, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.userData.tierAccent = meshMaterial === gem || meshMaterial === brass;
    parent.add(mesh);
    return mesh;
  }

  function makeBow() {
    const group = new THREE.Group();
    group.name = 'Holzbogen';
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, -0.69, 0),
      new THREE.Vector3(-0.17, -0.52, 0),
      new THREE.Vector3(-0.34, -0.19, 0),
      new THREE.Vector3(-0.39, 0, 0),
      new THREE.Vector3(-0.34, 0.19, 0),
      new THREE.Vector3(-0.17, 0.52, 0),
      new THREE.Vector3(0.02, 0.69, 0),
    ]);
    addMesh(group, new THREE.TubeGeometry(curve, 24, 0.052, 6, false), wood);
    const bowString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(.02, -.69, 0), new THREE.Vector3(.02, 0, 0), new THREE.Vector3(.02, .69, 0),
    ]), new THREE.LineBasicMaterial({ color: '#eee4be' }));
    group.add(bowString);
    group.userData.bowString = bowString;
    addMesh(group, box(0.15, 0.26, 0.13), leather, -0.39, 0, 0);
    for (const side of [-1, 1]) {
      addMesh(group, new THREE.SphereGeometry(0.064, 6, 5), brass, 0.02, side * 0.69, 0);
      addMesh(group, box(0.075, 0.11, 0.09), darkWood, -0.18, side * 0.53, 0);
    }
    addMesh(group, new THREE.OctahedronGeometry(0.055), gem, -0.39, 0.01, 0.09);
    return group;
  }

  const fireCore = material('#ffd37c', { emissive: '#ff6a17', emissiveIntensity: 2 });
  const iceCore = material('#e2fbff', { emissive: '#53cfff', emissiveIntensity: 1.5 });
  const poisonCore = material('#c3fda3', { emissive: '#5bbf37', emissiveIntensity: 1.5 });
  const moonCore = material('#eee6ff', { emissive: '#ac8bff', emissiveIntensity: 1.5 });
  const starCore = material('#fff0b8', { emissive: '#6ebfe3', emissiveIntensity: 1.4 });
  const staffCores = { fireStaff: fireCore, iceStaff: iceCore, poisonStaff: poisonCore, moonStaff: moonCore, starStaff: starCore };
  function makeStaff(type) {
    const group = new THREE.Group();
    group.name = weaponStats(type).label;
    addMesh(group, new THREE.CylinderGeometry(.038, .055, 1.6, 7), darkWood, 0, 0, 0);
    addMesh(group, new THREE.CylinderGeometry(.07, .07, .36, 7), leather, 0, -.22, 0);
    for (const y of [-.42, -.02, .58]) addMesh(group, new THREE.TorusGeometry(.074, .025, 4, 8), brass, 0, y, 0).rotation.x = Math.PI / 2;
    const core = addMesh(group, new THREE.OctahedronGeometry(.18, 0), staffCores[type], 0, .87, 0);
    core.scale.set(.75, 1.5, .75);
    core.userData.elementCore = true;
    for (const x of [-1, 1]) {
      const tine = addMesh(group, new THREE.CylinderGeometry(.026, .045, .43, 5), brass, x * .13, .76, 0);
      tine.rotation.z = x * -.38;
    }
    return group;
  }

  function prepareImportedBowString(group, model, rig) {
    if (!rig || !Array.isArray(rig.stringLower) || !Array.isArray(rig.stringUpper)) return;
    const lower = new THREE.Vector3(...rig.stringLower), upper = new THREE.Vector3(...rig.stringUpper);
    const segment = upper.clone().sub(lower), lengthSquared = segment.lengthSq();
    if (!lengthSquared || !lower.toArray().concat(upper.toArray()).every(Number.isFinite)) return;
    const radius = Math.max(0, Number(rig.stringRadiusMetres) || 0);
    const drawDistance = Math.max(0, Number(rig.drawDistanceMetres) || 0);
    if (!radius || !drawDistance) return;
    const deformations = [], vertex = new THREE.Vector3(), nearest = new THREE.Vector3();
    model.updateMatrixWorld(true);
    model.traverse(part => {
      if (!part.isMesh || !part.geometry?.attributes.position) return;
      const localToRig = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(part.matrixWorld);
      const rigToLocal = localToRig.clone().invert();
      const displacement = new THREE.Vector3(drawDistance, 0, 0).applyMatrix4(rigToLocal)
        .sub(new THREE.Vector3().applyMatrix4(rigToLocal));
      const positions = part.geometry.attributes.position, weights = new Float32Array(positions.count);
      let count = 0;
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(localToRig);
        const t = THREE.MathUtils.clamp(vertex.clone().sub(lower).dot(segment) / lengthSquared, 0, 1);
        nearest.copy(lower).addScaledVector(segment, t);
        if (vertex.distanceToSquared(nearest) > radius * radius) continue;
        const weight = 1 - Math.abs(2 * t - 1);
        if (weight <= 1e-5) continue;
        weights[index] = weight; count++;
      }
      if (!count) return;
      // Only the held instance owns this deformable geometry. Ground pickups
      // and all other clones retain the immutable original prototype bytes.
      part.geometry = part.geometry.clone();
      part.userData.sharedWeaponGeometry = false;
      deformations.push({ positions: part.geometry.attributes.position,
        rest: part.geometry.attributes.position.array.slice(), weights, displacement, count });
    });
    group.userData.bowRig = { lower, upper, drawDistance };
    group.userData.bowStringDeformations = deformations;
  }

  function makeWeapon(type, variant = DEFAULT_VARIANTS[type], { held = false } = {}) {
    variant = resolveWeaponVariant(type, variant);
    assertPrototype(type, variant);
    let group;
    if (TRIPO_WEAPON_VARIANTS[variant]) {
      group = new THREE.Group();
      const model = tripoPrototypes[variant].clone(true), copies = new Map();
      model.traverse(part => {
        if (!part.isMesh) return;
        // The loader owns immutable geometry/textures; each instance owns only
        // its material copies, so concealment and disposal cannot affect peers.
        part.userData.sharedWeaponGeometry = true;
        part.userData.ownsWeaponMaterial = true;
        part.userData.tripoWeapon = true;
        const clone = original => {
          if (!copies.has(original)) copies.set(original, original.clone());
          return copies.get(original);
        };
        part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
      });
      group.add(model);
      const bounds = new THREE.Box3().setFromObject(model);
      group.userData.weaponTipY = bounds.max.y;
      group.userData.weaponSource = tripoPrototypes[variant].userData.weaponSource ?? null;
      const measuredTip = tripoPrototypes[variant].userData.weaponTipPoint;
      group.userData.weaponTipPoint = Array.isArray(measuredTip) && measuredTip.length === 3 && measuredTip.every(Number.isFinite)
        ? [...measuredTip] : [0, bounds.max.y, 0];
      if (held && type === 'bow') prepareImportedBowString(group, model, tripoPrototypes[variant].userData.bowRig);
      if (!held) model.position.sub(bounds.getCenter(new THREE.Vector3()));
      group.name = tripoPrototypes[variant].name;
    } else group = type === 'bow' ? makeBow() : makeStaff(type);
    Object.assign(group.userData, { weaponType: type, variant, model: TRIPO_WEAPON_VARIANTS[variant] ? 'tripo' : 'procedural' });
    return group;
  }

  function disposeWeaponVisual(visual) {
    const geometries = new Set(), materials = new Set();
    visual.traverse(part => {
      if (!part.isMesh && !part.isLine) return;
      if (!part.userData.sharedWeaponGeometry) geometries.add(part.geometry);
      if (part.userData.ownsWeaponMaterial || part.userData.ownsTierMaterial || part.isLine) {
        for (const mat of Array.isArray(part.material) ? part.material : [part.material]) materials.add(mat);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
  }

  function applyTier(group, rarity, clone = false) {
    const glow = rarityVisual(rarity), copies = new Map(), glowing = new Map();
    group.userData.rarity = glow.rarity;
    group.userData.rarityColor = glow.color;
    group.traverse(part => {
      // Preserve the imported PBR palette. The ring, halo and HUD communicate
      // rarity without repainting the sword or the elemental crystals.
      if (!part.isMesh || part.userData.tripoWeapon || !part.material.emissive || part.userData.elementCore) return;
      if (clone) {
        const original = part.material;
        if (!copies.has(original)) copies.set(original, original.clone());
        part.material = copies.get(original);
        part.userData.ownsTierMaterial = true;
      }
      if (part.userData.tierAccent) part.material.color.set(glow.color);
      part.material.emissive.set(glow.color);
      const strength = part.userData.tierAccent ? glow.accent : glow.body;
      part.material.emissiveIntensity = strength;
      glowing.set(part.material, strength);
    });
    return [...glowing].map(([material, strength]) => ({ material, strength }));
  }

  // Concentric RGBA vertices make the halo fade softly to zero at its edge.
  function makeHaloGeometry() {
    const positions = [], colors = [], indices = [], segments = 32;
    const radii = [0, .27, .65, 1.08], alphas = [.9, .65, .22, 0];
    for (let row = 0; row < radii.length; row++) {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        positions.push(Math.cos(angle) * radii[row], Math.sin(angle) * radii[row], 0);
        colors.push(1, 1, 1, alphas[row]);
        if (row && i < segments) {
          const a = (row - 1) * (segments + 1) + i, b = row * (segments + 1) + i;
          indices.push(a, b, b + 1, a, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices);
    return geometry;
  }

  const definitions = Array.isArray(placements) ? placements
    .filter(item => WEAPON_TYPES.includes(item.kind))
    .map(item => ({ ...item, type: item.kind })) : [
    { type: 'bow', position: [-4, 11] }, { type: 'sword', position: [-11, 6] },
  ];
  const ringGeometry = new THREE.RingGeometry(0.53, 0.6, 28);
  const haloGeometry = makeHaloGeometry();
  const items = [];
  let dropSerial = 0;
  function addDrop(definition, { pop = true, initial = false } = {}) {
    const type = definition.type ?? definition.kind;
    if (!WEAPON_TYPES.includes(type)) return null;
    const variant = resolveWeaponVariant(type, definition.variant);
    const rarity = initial && rollRarity ? rollRarity() : definition.rarity;
    let stats = weaponStats(type, rarity, variant);
    const generic = weaponStats(type, definition.rarity);
    const defaultNames = new Set([stats.label, stats.name, generic.label, generic.name,
      type === 'bow' ? 'Bogen' : type === 'sword' ? 'Schwert' : generic.label]);
    const authoredName = [definition.label, definition.name]
      .find(value => typeof value === 'string' && value.trim() && !defaultNames.has(value));
    if (authoredName) stats = { ...stats, label: authoredName, name: `${authoredName} · ${stats.rarityLabel}` };
    const x = definition.position?.[0] ?? definition.x, z = definition.position?.[1] ?? definition.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const visual = makeWeapon(type, variant);
    visual.scale.setScalar(GROUND_WEAPON_SCALE[type]);
    const groundY = heightAt?.(x, z) ?? 0;
    const group = new THREE.Group();
    group.name = `${stats.name} auf dem Boden`;
    group.position.set(x, groundY, z);
    group.rotation.y = definition.rotation ?? 0;
    group.scale.setScalar(definition.scale ?? 1);
    group.userData.worldObjectId = definition.id;
    const floating = new THREE.Group();
    floating.position.y = .75;
    const glow = rarityVisual(stats.rarity);
    const glowingMaterials = applyTier(visual, stats.rarity, true);
    visual.rotation.x = -Math.PI / 2;
    visual.rotation.z = -.24;
    floating.add(visual);
    group.add(floating);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: stats.color, transparent: true, opacity: .3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2; ring.position.y = .043;
    group.add(ring);
    const halo = new THREE.Mesh(haloGeometry, new THREE.MeshBasicMaterial({
      color: stats.color, transparent: true, opacity: glow.halo, vertexColors: true,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = .035;
    // The layered aura replaces this legacy diagnostic halo; never stack two
    // broad ground glows. Keep its palette data for existing item inspectors.
    halo.visible = false; group.add(halo); scene.add(group);
    const item = { ...definition, ...stats, id: definition.id ?? `drop-weapon-${++dropSerial}`,
      type, variant, model: visual.userData.model, x, z, phase: items.length * 1.7, groundY, group, floating, visual, ring,
      initialPlacement: { x, z, groundY },
      ringMaterial, glow, glowingMaterials, collected: false, dynamic: !initial, popAge: pop ? 0 : 1,
      origin: definition.origin ?? [x, z] };
    if (pop) { ring.visible = halo.visible = false; group.position.set(item.origin[0], heightAt?.(...item.origin) ?? groundY, item.origin[1]); }
    item.halo = halo;
    item.aura = createLootGlow(group, { rarity: stats.rarity, radius: 1.15, height: .68, phase: item.phase,
      heightAt, surfaceSpace: scene });
    item.aura.setVisible(!pop);
    items.push(item);
    return item;
  }
  for (const definition of definitions) addDrop(definition, { pop: false, initial: true });

  const heldBow = new THREE.Group(), bowVisual = makeWeapon('bow');
  heldBow.add(bowVisual);
  Object.assign(heldBow.userData, bowVisual.userData);
  heldBow.position.set(.17, 1.30, .13);
  heldBow.rotation.set(0, Math.PI / 2, 0);
  heldBow.scale.setScalar(.78 * HELD_WEAPON_SCALE.bow);
  heldBow.visible = false;
  characterGroup.add(heldBow);
  const heldSword = new THREE.Group();
  // Install the shared imported model only when a sword is equipped.
  Object.assign(heldSword.userData, { weaponType: 'sword', variant: null });
  heldSword.position.set(-.22, 1.20, .42);
  heldSword.scale.setScalar(1.10 * HELD_WEAPON_SCALE.sword);
  heldSword.visible = false;
  characterGroup.add(heldSword);
  const heldStaffs = Object.fromEntries(STAFF_TYPES.map(type => [type, new THREE.Group()]));
  for (const [type, held] of Object.entries(heldStaffs)) {
    // Empty containers can exist before optional imported loot is equipped;
    // the selected real variant is required and installed by selectHeldVisual.
    const visual = makeStaff(type);
    Object.assign(visual.userData, { weaponType: type, variant: null, model: 'procedural' });
    held.add(visual);
    Object.assign(held.userData, { ...visual.userData, gripOffsetY: .20, weaponTipY: .87 });
  }
  for (const held of Object.values(heldStaffs)) { held.visible = false; characterGroup.add(held); }
  const heldMaterials = new Set();
  const heldAppearance = new WeakMap();
  const heldByType = { bow: heldBow, sword: heldSword, ...heldStaffs };
  function prepareHeldMaterials(held) {
    const copies = new Map();
    held.traverse(part => {
      if (!part.isMesh && !part.isLine) return;
      const clone = original => {
        if (part.userData.ownsWeaponMaterial) return original;
        // Bow strings already belong exclusively to their visual.
        if (part.isLine) return original;
        if (!copies.has(original)) copies.set(original, original.clone());
        return copies.get(original);
      };
      part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
      part.userData.ownsWeaponMaterial = true;
      for (const mat of Array.isArray(part.material) ? part.material : [part.material]) {
        heldMaterials.add(mat);
        heldAppearance.set(mat, { transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
      }
    });
  }
  for (const held of Object.values(heldByType)) prepareHeldMaterials(held);

  function selectHeldVisual(type, variant) {
    const held = heldByType[type];
    if (held.userData.variant === variant) return held;
    const visual = makeWeapon(type, variant, { held: true });
    for (const child of [...held.children]) {
      child.traverse(part => {
        for (const mat of Array.isArray(part.material) ? part.material : [part.material]) heldMaterials.delete(mat);
      });
      held.remove(child); disposeWeaponVisual(child);
    }
    const imported = visual.userData.model === 'tripo';
    const baseScale = imported ? 1 : type === 'bow' ? .78 : type === 'sword' ? 1.10 : 1;
    held.scale.setScalar(baseScale * HELD_WEAPON_SCALE[type]);
    if (type === 'sword') visual.position.y = imported ? 0 : .26;
    held.add(visual);
    delete held.userData.bowString;
    delete held.userData.bowRig;
    delete held.userData.bowStringDeformations;
    Object.assign(held.userData, { ...visual.userData,
      gripOffsetY: imported ? 0 : .20,
      weaponTipY: imported ? visual.userData.weaponTipY : type === 'sword' ? 1.13 : .87,
      weaponTipPoint: imported ? visual.userData.weaponTipPoint : [0, type === 'sword' ? 1.13 : .87, 0] });
    prepareHeldMaterials(held);
    return held;
  }

  const arrowWood = material('#b77740');
  const arrowFeather = material('#ffedbf', { side: THREE.DoubleSide });
  const arrowShaftGeometry = new THREE.CylinderGeometry(.043, .05, ARROW_LENGTH - .23, 5);
  const arrowHeadGeometry = new THREE.ConeGeometry(.10, .23, 5);
  const arrowFeatherGeometry = box(0.15, 0.024, 0.2);
  function makeArrow() {
    const group = new THREE.Group();
    if (projectilePrototypes.arrow) {
      const model = projectilePrototypes.arrow.clone(true);
      model.traverse(part => {
        if (!part.isMesh) return;
        part.userData.sharedWeaponGeometry = true;
        part.userData.ownsWeaponMaterial = true;
        part.material = Array.isArray(part.material) ? part.material.map(m => m.clone()) : part.material.clone();
      });
      group.add(model);
      group.userData.projectileSource = model.userData.source;
    } else {
      const shaft = addMesh(group, arrowShaftGeometry, arrowWood, 0, 0, -.115);
      shaft.rotation.x = Math.PI / 2;
      const head = addMesh(group, arrowHeadGeometry, steel, 0, 0, ARROW_LENGTH / 2 - .115);
      head.rotation.x = Math.PI / 2;
      shaft.name = 'Pfeil · Holzschaft'; head.name = 'Pfeil · Metallspitze';
      for (let i = 0; i < 3; i++) {
        const feather = addMesh(group, arrowFeatherGeometry, arrowFeather, 0, 0, -ARROW_LENGTH / 2 + .12);
        feather.name = 'Pfeil · Feder'; feather.rotation.z = i * Math.PI * 2 / 3;
      }
    }
    return group;
  }
  let committedBowDirection = 0;
  let bowHolding = false, bowHoldAge = 0, bowReleaseDraw = 0;
  function trackBowAim(direction = characterGroup.rotation.y) {
    committedBowDirection = Number.isFinite(direction) ? direction : characterGroup.rotation.y;
    // Turn the complete bow stance, including both hands. A separately turning
    // bow would sweep its string through the torso during a sharp direction change.
    characterGroup.rotation.y = committedBowDirection;
  }
  function alignNockedArrow() {
    const aim = bowHolding ? committedBowDirection : characterGroup.rotation.y;
    const relative = aim - characterGroup.rotation.y;
    heldBow.rotation.y = Math.PI / 2 + relative;
    heldBow.updateMatrix();
    const rig = heldBow.userData.bowRig;
    const nock = rig ? rig.lower.clone().lerp(rig.upper,.5) : new THREE.Vector3(.02,0,0);
    nock.x += bowDraw * (rig?.drawDistance ?? WOOD_BOW_DRAW);
    nock.applyMatrix4(heldBow.matrix);
    // The flying arrow is scene-owned; keep the held arrow the same world size.
    nockedArrow.scale.set(1/characterGroup.scale.x,1/characterGroup.scale.y,1/characterGroup.scale.z);
    nockedArrow.rotation.set(0,relative,0);
    const tail = new THREE.Vector3(0,0,-ARROW_LENGTH / 2).multiply(nockedArrow.scale).applyEuler(nockedArrow.rotation);
    nockedArrow.position.copy(nock).sub(tail);
  }


  const nockedArrow = makeArrow(false);
  nockedArrow.name = 'Aufgelegter Pfeil';
  nockedArrow.position.set(.17, 1.30, .45);
  nockedArrow.visible = false;
  characterGroup.add(nockedArrow);
  prepareHeldMaterials(nockedArrow);
  const arrows = Array.from({ length: 8 }, () => {
    const group = makeArrow();
    group.name = 'Fliegender Pfeil';
    group.visible = false;
    scene.add(group);
    return { group, life: 0, mode: 'inactive', direction: 0, vx: 0, vy: 0, vz: 0 };
  });

  const swordEffects = createSwordEffects(scene, { isVisible });

  const impactCapacity = 32;
  const impactParticles = Array.from({ length: impactCapacity }, () => ({
    life: 0, duration: 1, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0,
  }));
  const impactMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.035, .035, .07),
    new THREE.MeshBasicMaterial({ color: '#e2c18a' }), impactCapacity);
  impactMesh.name = 'Pfeilaufprall · Holzsplitter';
  impactMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  impactMesh.frustumCulled = false;
  const particleTransform = new THREE.Object3D();
  for (let i = 0; i < impactCapacity; i++) {
    particleTransform.position.set(0, -100, 0); particleTransform.updateMatrix();
    impactMesh.setMatrixAt(i, particleTransform.matrix);
  }
  scene.add(impactMesh);
  const tipBefore = new THREE.Vector3(), tipAfter = new THREE.Vector3();
  const launchCenter = new THREE.Vector3(), launchOrigin = new THREE.Vector3();
  const forward = new THREE.Vector3(), hand = new THREE.Vector3();
  const bladeDirection = new THREE.Vector3(), bladeTip = new THREE.Vector3();
  const swordBase = new THREE.Vector3(), swordTip = new THREE.Vector3(), swordContact = new THREE.Vector3();
  const swordPose = createSwordPose();
  const up = new THREE.Vector3(0, 1, 0);
  const leftHand = new THREE.Vector3(), rightHand = new THREE.Vector3();
  const bowStringOffset = new THREE.Vector3();
  const combatPose = { weapon: null, phase: 'idle', leftHand, rightHand, chestTwist: 0 };
  let equippedType = null, equippedItem = null, equippedPickup = null;
  let cooldown = 0, attackAge = -1, attackDuration = 0;
  let shotReleased = false, bowDraw = 0, swordSweep = 0;
  let swordIndex = -1, swordComboRemaining = 0, swordSwingId = 0;
  let attackPhase = 'idle', shotCount = 0, impactCount = 0, lastImpact = null, particleCursor = 0;
  let lastSpellLaunch = null;
  const pickupRadius = 1.85;
  const autoPickupRadius = 1.1;
  const ease = (a, b, value) => {
    const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function nearest(position, { radius = pickupRadius } = {}) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    let result = null, bestDistanceSquared = Math.max(0, Math.min(pickupRadius, radius)) ** 2;
    const playerY = position.y ?? heightAt?.(position.x, position.z) ?? 0;
    for (const item of items) {
      if (item.collected || item.popAge < .65 || Math.abs(playerY - item.groundY) > 1.2) continue;
      const d = (position.x - item.x) ** 2 + (position.z - item.z) ** 2;
      if (d > bestDistanceSquared) continue;
      const itemPoint = { x: item.x, y: item.groundY + .65, z: item.z };
      if (isVisible && !isVisible(itemPoint)) continue;
      // Sight and reach are separate: loot must never be pulled through a wall.
      if (d > .0001 && world?.traceProjectile?.({ x: position.x, y: playerY + .65, z: position.z }, itemPoint, .03)) continue;
      bestDistanceSquared = d; result = item; item.distance = Math.sqrt(d);
    }
    return result;
  }

  function returnToGround(item, { x, z, groundY }) {
    Object.assign(item, { x, z, groundY, position: [x, z], origin: [x, z], popAge: 1, collected: false });
    item.group.position.set(x, groundY, z);
    item.aura.refreshGround();
    item.group.visible = true;
    item.floating.position.set(0, .75, 0);
    item.floating.rotation.set(0, 0, 0);
    item.ring.visible = true; item.halo.visible = false;
  }

  function equip(item, automatic = false) {
    if (!item || specials.moonBusy) return null;
    specials.cancelAim();
    const held = selectHeldVisual(item.type, item.variant);
    // Exchange the existing pickups. The new pickup's position has already
    // passed visibility, height and reach checks, so the old weapon stays
    // reachable instead of disappearing or returning to its original map spot.
    if (equippedPickup) returnToGround(equippedPickup, item);
    item.collected = true; item.group.visible = false;
    equippedPickup = item;
    equippedType = item.type;
    equippedItem = { ...weaponStats(item.type, item.rarity, item.variant), label: item.label, name: item.name,
      id: item.id, variant: item.variant, model: item.model,
      rotation: item.rotation ?? 0, scale: item.scale ?? 1 };
    bowHolding = false; bowHoldAge = 0;
    applyTier(held, equippedItem.rarity);
    clearSwordCombo();
    cooldown = 0; attackAge = -1; attackPhase = 'idle';
    spellEffects.channel(null);
    applyHeldPose();
    return { type: item.type, ...equippedItem, automatic, message: `${equippedItem.name} aufgenommen · ${equippedItem.damage} Schaden · F zum Angreifen.` };
  }

  function interact(position) { return equip(nearest(position)); }

  /** The caller gates this with the playing phase; it can never replace a weapon. */
  function tryAutoPickup(position, { enabled = true } = {}) {
    if (!enabled || equippedType || characterGroup.userData.rolling) return null;
    return equip(nearest(position, { radius: autoPickupRadius }), true);
  }

  function attack(position, direction) {
    if (!equippedType || bowHolding || cooldown > 0 || specials.moonBusy || !position || characterGroup.userData.rolling) return null;
    if (equippedType === 'poisonStaff') {
      if (!specials.beginAim(position, direction)) return null;
      return { type: equippedType, message: 'Ziel wählen und loslassen' };
    }
    committedBowDirection = Number.isFinite(direction) ? direction : characterGroup.rotation.y;
    bowHolding = equippedType === 'bow'; bowHoldAge = 0; bowReleaseDraw = 0;
    if (bowHolding) trackBowAim(direction);
    attackAge = 0; shotReleased = false;
    attackDuration = equippedItem.cooldown;
    cooldown = bowHolding ? 0 : attackDuration;
    if (equippedType === 'sword') {
      swordIndex = swordComboRemaining > 0 ? (swordIndex + 1) % SWORD_PATTERNS.length : 0;
      swordComboRemaining = attackDuration + SWORD_COMBO_GRACE;
      swordSwingId++;
      swordEffects.beginSwing({ color: equippedItem.color, pattern: SWORD_PATTERNS[swordIndex] });
    }
    attackPhase = equippedType === 'bow' ? 'draw' : equippedType === 'sword' ? 'windup' : 'channel';
    applyHeldPose();
    return { type: equippedType, message: equippedType === 'bow' ? 'Bogensehne gespannt' : equippedType === 'sword' ? 'Schwertschlag' : 'Zauber gewirkt' };
  }

  function applyHeldPose() {
    const rolling = Boolean(characterGroup.userData.rolling);
    heldBow.visible = equippedType === 'bow' && !rolling;
    heldSword.visible = equippedType === 'sword' && !rolling;
    for (const [type, held] of Object.entries(heldStaffs)) held.visible = equippedType === type && !rolling;
    nockedArrow.visible = equippedType === 'bow' && !rolling && (attackAge < 0 || attackAge < .23 || attackAge > .51);
    if (!equippedType || rolling) { character?.setCombatState?.(null); return; }
    combatPose.weapon = equippedType; combatPose.phase = attackPhase;
    combatPose.leftHand = leftHand;
    combatPose.leftHandWeight = 1; combatPose.castWeight = 0;
    combatPose.swordWeight = 0; combatPose.swordLead = 1; combatPose.chestLean = 0;
    combatPose.bowStringOffset = null;
    if (equippedType === 'bow') {
      bowDraw = bowHolding ? ease(0, .35, bowHoldAge) : attackAge < 0 ? 0 : bowReleaseDraw * (1 - ease(.23, .36, attackAge));
      // +X is the avatar's left. Keep the arrow beside the right shoulder,
      // with the left arm extended forward and the right elbow outside the ribs.
      leftHand.set(-.28, 1.42, .52);
      const rig = heldBow.userData.bowRig;
      const offset = rig ? bowStringOffset.copy(rig.lower).lerp(rig.upper, .5)
        : bowStringOffset.set(.41, 0, 0);
      offset.x += bowDraw * (rig?.drawDistance ?? WOOD_BOW_DRAW);
      offset.multiply(heldBow.scale).applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI / 2);
      combatPose.bowStringOffset = offset;
      rightHand.copy(leftHand).add(offset);
      combatPose.chestTwist = -.6;
      character?.setCombatState?.(combatPose);
      const imported = heldBow.userData.model === 'tripo';
      if (character?.getGripPosition) character.getGripPosition('left', hand);
      else if (character?.getHandPosition) character.getHandPosition('left', hand);
      else hand.copy(leftHand);
      heldBow.position.copy(hand);
      if (!imported) heldBow.position.z -= .39 * heldBow.scale.x;
      heldBow.rotation.set(attackAge >= .23 && attackAge < .40 ? Math.sin((attackAge - .23) * 38) * .035 : 0, Math.PI / 2, 0);
      if (heldBow.userData.bowString) {
        const stringPositions = heldBow.userData.bowString.geometry.attributes.position;
        stringPositions.setX(1, .02 + bowDraw * WOOD_BOW_DRAW); stringPositions.needsUpdate = true;
      }
      for (const deformation of heldBow.userData.bowStringDeformations ?? []) {
        const { positions, rest, weights, displacement } = deformation;
        for (let index = 0; index < positions.count; index++) {
          const amount = bowDraw * weights[index];
          positions.setXYZ(index, rest[index * 3] + displacement.x * amount,
            rest[index * 3 + 1] + displacement.y * amount,
            rest[index * 3 + 2] + displacement.z * amount);
        }
        positions.needsUpdate = true;
      }
      alignNockedArrow();
    } else if (equippedType === 'sword') {
      bowDraw = 0;
      const progress = attackAge < 0 ? 0 : attackAge / attackDuration;
      sampleSwordPose(swordIndex, progress, attackAge >= 0, swordPose);
      rightHand.copy(swordPose.rightHand); leftHand.copy(swordPose.leftHand);
      combatPose.chestTwist = swordPose.chestTwist; combatPose.chestLean = swordPose.chestLean;
      combatPose.swordWeight = swordPose.swordWeight; combatPose.swordLead = swordPose.swordLead;
      character?.setCombatState?.(combatPose);
      if (character?.getHandPosition) character.getHandPosition('right', hand); else hand.copy(rightHand);
      heldSword.position.copy(hand);
      bladeDirection.copy(swordPose.bladeDirection);
      swordSweep = Math.atan2(bladeDirection.x, bladeDirection.z);
      heldSword.quaternion.setFromUnitVectors(up, bladeDirection);
    } else {
      bowDraw = swordSweep = 0;
      const pulse = attackAge >= 0 ? Math.sin(Math.min(1, attackAge / .45) * Math.PI) : 0;
      rightHand.set(-.26, 1.22 + pulse * .14, .38 + pulse * .16);
      // The free hand balances the cast beside the ribs rather than punching
      // forward. Ease back to the authored arm and foot animation afterwards.
      const castWeight = attackAge < 0 ? 0 : ease(0, .16, attackAge) * (1 - ease(.36, .66, attackAge));
      leftHand.set(.34, 1.18, .10);
      combatPose.leftHandWeight = combatPose.castWeight = castWeight;
      combatPose.chestTwist = -.08 + pulse * .16;
      character?.setCombatState?.(combatPose);
      if (character?.getGripPosition) character.getGripPosition('right', hand);
      else if (character?.getHandPosition) character.getHandPosition('right', hand);
      else hand.copy(rightHand);
      const staff = heldStaffs[equippedType];
      staff.position.copy(hand); staff.position.y += staff.userData.gripOffsetY;
      // Aim the physical crystal at chest height before release. A horizontal
      // shot from an upright staff otherwise travels above ordinary opponents
      // and walls. The hand stays on its grip and the projectile stays straight.
      const cant = -.06;
      const point = staff.userData.weaponTipPoint ?? [0, staff.userData.weaponTipY, 0];
      const tipY = point[0] * staff.scale.x * Math.sin(cant) + point[1] * staff.scale.y * Math.cos(cant);
      const tipZ = point[2] * staff.scale.z;
      const tipLength = Math.max(.001, Math.hypot(tipY, tipZ));
      const localAimHeight = 1.4 / Math.max(.001, characterGroup.scale.y);
      const aimedPitch = Math.acos(THREE.MathUtils.clamp((localAimHeight - staff.position.y) / tipLength, -1, 1)) - Math.atan2(tipZ, tipY);
      // A slow frame can skip the peak pose; still use the firing pose for its
      // first release, then blend back with the existing recovery animation.
      const aimWeight = attackAge >= .16 && !shotReleased ? 1 : castWeight;
      staff.rotation.set(THREE.MathUtils.lerp(.28 + pulse * .5, aimedPitch, aimWeight), 0, cant);
    }
  }

  function clearSwordCombo() {
    swordIndex = -1; swordComboRemaining = 0; swordEffects.clear();
  }

  function measureSwordBlade() {
    characterGroup.updateWorldMatrix(true, true); scene.updateWorldMatrix(true, false);
    swordTip.fromArray(heldSword.userData.weaponTipPoint ?? [0, heldSword.userData.weaponTipY, 0]);
    // Start beyond the crossguard, so neither the hand nor grip emits a ribbon.
    swordBase.copy(swordTip).multiplyScalar(heldSword.userData.model === 'tripo' ? .27 : .35 / 1.13);
    heldSword.localToWorld(swordBase); heldSword.localToWorld(swordTip);
    scene.worldToLocal(swordBase); scene.worldToLocal(swordTip);
  }

  function impact(arrow, hit) {
    const nx = hit.normal?.x ?? -Math.sin(arrow.direction), nz = hit.normal?.z ?? -Math.cos(arrow.direction);
    const length = Math.hypot(nx, nz) || 1, normalX = nx / length, normalZ = nz / length;
    const dot = arrow.vx * normalX + arrow.vz * normalZ;
    arrow.group.position.set(hit.point.x - Math.sin(arrow.direction) * (ARROW_LENGTH / 2) + normalX * .025,
      hit.point.y ?? arrow.group.position.y, hit.point.z - Math.cos(arrow.direction) * (ARROW_LENGTH / 2) + normalZ * .025);
    arrow.vx = (arrow.vx - 2 * dot * normalX) * .22;
    arrow.vz = (arrow.vz - 2 * dot * normalZ) * .22;
    arrow.vy = 1.35;
    arrow.mode = 'bounced'; arrow.life = .46;
    arrow.group.userData.trail?.visible && (arrow.group.userData.trail.visible = false);
    impactCount++;
    lastImpact = { type: hit.type ?? 'terrain', point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: { x: normalX, z: normalZ } };
    for (let i = 0; i < 7; i++) {
      const particle = impactParticles[particleCursor++ % impactCapacity], angle = i * 2.39996 + impactCount;
      particle.life = particle.duration = .24 + (i % 3) * .045;
      particle.x = hit.point.x; particle.y = hit.point.y ?? arrow.group.position.y; particle.z = hit.point.z;
      particle.vx = normalX * .9 + Math.sin(angle) * 1.0;
      particle.vy = .6 + (i % 4) * .35;
      particle.vz = normalZ * .9 + Math.cos(angle) * 1.0;
    }
  }

  function releaseArrow(position) {
    characterGroup.updateWorldMatrix(true, true); scene.updateWorldMatrix(true, false);
    nockedArrow.getWorldPosition(launchCenter); scene.worldToLocal(launchCenter);
    const arrow = arrows.find(entry => entry.life <= 0) ?? arrows[0];
    const angle = committedBowDirection;
    arrow.mode = 'flying'; arrow.life = 1.35; arrow.direction = angle; arrow.payload = { ...equippedItem, sourceId: ownerId };
    arrow.vx = Math.sin(angle) * 18; arrow.vz = Math.cos(angle) * 18; arrow.vy = 0;
    arrow.group.position.copy(launchCenter); arrow.group.rotation.set(0, angle, 0); arrow.group.visible = true;
    if (arrow.group.userData.trail) arrow.group.userData.trail.visible = true;
    forward.set(Math.sin(angle), 0, Math.cos(angle));
    launchOrigin.set(position.x, launchCenter.y, position.z);
    tipAfter.copy(launchCenter).addScaledVector(forward, ARROW_LENGTH / 2);
    // Trace from the body before using the forward muzzle, so a close wall cannot
    // be skipped by spawning the projectile on its far side.
    const immediate = firstHit(launchOrigin, tipAfter, .055);
    if (immediate?.target) hitTarget(arrow, immediate);
    else if (immediate) impact(arrow, immediate);
    shotCount++;
  }

  let damageHits = 0, lastDamage = null;
  const blocksTarget = (collider, target) => collider?.objectId === target.id || collider?.destructibleId === target.id;
  function firstHit(start, end, radius) {
    const terrain = traceRangedProjectile(world, start, end, radius);
    const entity = combat?.traceSegment(start, end, radius, ownerId);
    if (!entity) return terrain;
    if (!terrain) return entity;
    if (entity.target.destructible && blocksTarget(terrain.collider, entity.target)) return entity;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const terrainT = distance > 1e-8 ? Math.hypot(terrain.point.x - start.x, terrain.point.z - start.z) / distance : 0;
    return entity.t < terrainT - .0001 ? entity : terrain;
  }
  function hitTarget(projectile, collision) {
    lastDamage = combat.hit(collision.target, projectile.payload); damageHits++;
    if (projectile.visual) spellImpact(projectile, collision);
    else { projectile.life = 0; projectile.mode = 'inactive'; projectile.group.visible = false; }
  }

  const spellEffects = createSpellEffects(scene, { isVisible, fireProjectilePrototype, iceProjectilePrototype: projectilePrototypes.ice });
  const specials = createSpecialWeapons(scene, world, combat, ownerId, result => {
    lastDamage = result; damageHits++;
  }, isVisible, { moonProjectilePrototype: projectilePrototypes.moon });
  const staffTip = new THREE.Vector3();
  function cancelAim() {
    specials.cancelAim();
    if (bowHolding) { bowHolding = false; bowHoldAge = 0; attackAge = -1; attackPhase = 'idle'; shotReleased = true; applyHeldPose(); }
  }
  function releaseAttack(position, direction = characterGroup.rotation.y) {
    if (bowHolding) {
      if (!position || equippedType !== 'bow' || characterGroup.userData.rolling) { cancelAim(); return false; }
      trackBowAim(direction);
      bowReleaseDraw = bowDraw; bowHolding = false;
      attackAge = .23; attackPhase = 'release'; shotReleased = true;
      cooldown = equippedItem.cooldown;
      applyHeldPose(); releaseArrow(position);
      return true;
    }
    if (!specials.aiming || equippedType !== 'poisonStaff' || characterGroup.userData.rolling) { specials.cancelAim(); return false; }
    cooldown = equippedItem.cooldown; attackAge = 0; attackDuration = cooldown;
    attackPhase = 'release'; shotReleased = true;
    getStaffTip(staffTip);
    const blocked = traceRangedProjectile(world, { x: position.x, y: position.y + 1.4, z: position.z }, staffTip, .12);
    specials.releasePoison(staffTip, equippedItem, blocked); shotCount++;
    spellEffects.fire('poisonStaff', staffTip, characterGroup.rotation.y);
    return true;
  }
  const spells = Array.from({ length: 10 }, () => {
    const visual = spellEffects.createProjectile();
    return { visual, group: visual.group, life: 0, vx: 0, vz: 0, mode: 'inactive', payload: null,
      flightHeight: 0, pendingDelta: null };
  });
  function getStaffTip(result) {
    const staff = heldStaffs[equippedType];
    characterGroup.updateWorldMatrix(true, true); scene.updateWorldMatrix(true, false);
    result.fromArray(staff.userData.weaponTipPoint ?? [0, staff.userData.weaponTipY, 0]); staff.localToWorld(result); scene.worldToLocal(result);
    return result;
  }
  function releaseSpell(position) {
    getStaffTip(staffTip); launchCenter.copy(staffTip);
    if (equippedType === 'moonStaff') {
      const angle = characterGroup.rotation.y;
      const blocked = traceRangedProjectile(world, { x: position.x, y: position.y + 1.4, z: position.z }, launchCenter, .15);
      specials.launchMoon(launchCenter, angle, equippedItem, blocked); shotCount++;
      lastSpellLaunch = { type: equippedType, direction: angle, tip: { ...staffTip }, flightHeight: launchCenter.y };
      spellEffects.fire(equippedType, staffTip, angle); return;
    }
    const spell = spells.find(entry => entry.life <= 0) ?? spells[0];
    const angle = characterGroup.rotation.y;
    spell.mode = 'flying'; spell.life = 1.35; spell.direction = angle;
    // The crystal fixes the shot's height for its whole flight. Facing sets
    // only its horizontal direction; there is no later change of flight plane.
    spell.flightHeight = launchCenter.y;
    spell.pendingDelta = Math.max(0, attackAge - .25);
    spell.vx = Math.sin(angle) * 18; spell.vz = Math.cos(angle) * 18;
    spell.payload = { ...equippedItem, sourceId: ownerId };
    spellEffects.launch(spell.visual, spell.payload.type, launchCenter, angle);
    spellEffects.fire(spell.payload.type, staffTip, angle);
    launchOrigin.set(position.x, position.y + 1.4, position.z);
    const point = vector => ({ x: vector.x, y: vector.y, z: vector.z });
    lastSpellLaunch = { type: spell.payload.type, direction: angle, tip: point(staffTip),
      position: point(spell.group.position), flightHeight: spell.flightHeight, bodyOrigin: point(launchOrigin) };
    const immediate = firstHit(launchOrigin, launchCenter, .13);
    if (immediate?.target) hitTarget(spell, immediate);
    else if (immediate) spellImpact(spell, immediate);
    shotCount++;
  }
  function spellImpact(spell, collision) {
    spell.group.position.copy(collision.point); spell.mode = 'inactive'; spell.life = 0;
    spellEffects.end(spell.visual);
    spellEffects.impact(spell.payload.type, collision.point, collision.normal, spell.direction);
    impactCount++;
    lastImpact = { type: collision.type ?? 'terrain', point: { ...collision.point } };
  }
  function updateSpells(delta, time) {
    for (const spell of spells) {
      if (spell.life <= 0) continue;
      const flightDelta = spell.pendingDelta ?? delta;
      spell.pendingDelta = null;
      if (flightDelta <= 0) continue;
      spell.life -= flightDelta;
      if (spell.life <= 0) { spellEffects.end(spell.visual); spell.mode = 'inactive'; continue; }
      tipBefore.copy(spell.group.position);
      tipAfter.copy(tipBefore); tipAfter.x += spell.vx * flightDelta; tipAfter.z += spell.vz * flightDelta;
      const collision = firstHit(tipBefore, tipAfter, .13);
      spellEffects.advance(spell.visual, tipBefore, collision?.point ?? tipAfter, flightDelta, time);
      if (collision?.target) hitTarget(spell, collision);
      else if (collision) spellImpact(spell, collision);
    }
  }

  function update(dt, time, position = characterGroup.position, direction = characterGroup.rotation.y) {
    const delta = Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0));
    cooldown = Math.max(0, cooldown - delta);
    swordComboRemaining = Math.max(0, swordComboRemaining - delta);
    if (swordComboRemaining === 0 && attackAge < 0) swordIndex = -1;
    swordEffects.update(delta);
    if (characterGroup.userData.rolling) cancelAim();
    specials.update(delta, position, time);
    for (const item of items) {
      if (item.collected) continue;
      const wave = Math.sin(time * 2.2 + item.phase);
      if (item.popAge < .65) {
        item.popAge = Math.min(.65, item.popAge + delta);
        const t = item.popAge / .65, easeOut = 1 - (1 - t) ** 2;
        const originY = heightAt?.(...item.origin) ?? item.groundY;
        item.group.position.set(THREE.MathUtils.lerp(item.origin[0], item.x, easeOut), THREE.MathUtils.lerp(originY, item.groundY, easeOut), THREE.MathUtils.lerp(item.origin[1], item.z, easeOut));
        if (t >= 1) item.aura.refreshGround();
        item.floating.position.y = .72 + Math.sin(t * Math.PI) * 1.8;
        item.floating.rotation.z = Math.sin(t * Math.PI) * 1.1;
        item.ring.visible = t >= 1;
      } else { item.floating.position.y = .72 + wave * .11; item.floating.rotation.z = 0; }
      item.floating.rotation.y = Math.sin(time * .6 + item.phase) * .32;
      item.ring.scale.setScalar(1 + wave * .065); item.ringMaterial.opacity = .26 + (wave + 1) * .035;
      item.halo.scale.setScalar(1 + wave * .075);
      item.halo.material.opacity = item.glow.halo * (.9 + wave * .1);
      item.aura.setVisible(item.popAge >= .65); item.aura.update(time);
      for (const entry of item.glowingMaterials) entry.material.emissiveIntensity = entry.strength * (1 + wave * .08);
      item.group.visible = (!position || (position.x - item.x) ** 2 + (position.z - item.z) ** 2 <= viewDistance ** 2)
        && (revealSceneryThroughFog || !isVisible || isVisible(item.group.position));
    }
    if (characterGroup.userData.rolling) {
      if (attackAge >= 0) { attackAge = -1; attackPhase = 'idle'; shotReleased = true; }
      if (swordIndex >= 0) clearSwordCombo();
    }
    if (attackAge >= 0) {
      if (bowHolding) { trackBowAim(direction); bowHoldAge += delta; attackAge = Math.min(.22, bowHoldAge); }
      else attackAge += delta;
      if (equippedType === 'bow') attackPhase = attackAge < .23 ? 'draw' : attackAge < .36 ? 'release' : 'recover';
      else if (equippedType.endsWith('Staff')) attackPhase = attackAge < .25 ? 'channel' : attackAge < .4 ? 'release' : 'recover';
      else {
        const p = attackAge / attackDuration;
        attackPhase = p < SWORD_STRIKE_START ? 'windup' : p < SWORD_STRIKE_END ? 'strike' : 'follow-through';
      }
    }
    applyHeldPose();
    const opacity = characterGroup.userData.concealmentOpacity ?? 1;
    const swordProgress = attackAge < 0 ? 0 : attackAge / attackDuration;
    if (heldSword.visible) measureSwordBlade();
    swordEffects.sample({ base: swordBase, tip: swordTip, opacity,
      active: heldSword.visible && attackAge >= 0 && swordProgress >= SWORD_STRIKE_START && swordProgress <= SWORD_STRIKE_END });
    if (equippedType?.endsWith('Staff') && attackAge >= 0 && attackAge < .25 && !shotReleased) {
      spellEffects.channel(equippedType, getStaffTip(staffTip), characterGroup.rotation.y, attackAge / .25);
    } else spellEffects.channel(null);
    if (equippedType?.endsWith('Staff') && attackAge >= .25 && !shotReleased) {
      shotReleased = true; releaseSpell(position);
    }
    if (equippedType === 'sword' && attackAge >= attackDuration * .36 && !shotReleased) {
      shotReleased = true;
      for (const target of combat?.melee(position, characterGroup.rotation.y, equippedItem.range, Math.PI * .85, ownerId) ?? []) {
        const start = { x: position.x, y: position.y + 1.1, z: position.z };
        const end = { x: target.position.x, y: target.position.y + 1.1, z: target.position.z };
        const blocker = world?.traceProjectile?.(start, end, .06);
        if (!blocker || blocksTarget(blocker.collider, target)) {
          lastDamage = combat.hit(target, { ...equippedItem, sourceId: ownerId });
          if (lastDamage) {
            damageHits++;
            const concealed = target.concealed || (world?.concealmentAt?.(end.x, end.z) ?? 0) > .01;
            if (!concealed && (!isVisible || isVisible(end))) {
              const reach = Math.hypot(end.x - start.x, end.z - start.z) || 1;
              const inset = Math.min(target.radius ?? .3, reach * .5);
              swordContact.set(end.x + (start.x - end.x) / reach * inset, end.y,
                end.z + (start.z - end.z) / reach * inset);
              swordEffects.impact({ point: swordContact, color: equippedItem.color });
            }
          }
        }
      }
    }
    if (attackAge >= attackDuration && attackAge >= 0) { attackAge = -1; attackPhase = 'idle'; }
    for (const mat of heldMaterials) {
      const translucent = opacity < .995;
      const appearance = heldAppearance.get(mat);
      const transparent = appearance.transparent || translucent;
      if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
      mat.opacity = appearance.opacity * opacity; mat.depthWrite = appearance.depthWrite && !translucent;
    }
    for (const arrow of arrows) {
      if (arrow.life <= 0) continue;
      arrow.life -= delta;
      const boundaryRadius = typeof world?.bounds === 'number' ? world.bounds : world?.worldRadius;
      if (arrow.life <= 0 || (Number.isFinite(boundaryRadius) && Math.hypot(arrow.group.position.x, arrow.group.position.z) > boundaryRadius)) {
        arrow.life = 0; arrow.mode = 'inactive'; arrow.group.visible = false; continue;
      }
      if (arrow.mode === 'flying') {
        forward.set(Math.sin(arrow.direction), 0, Math.cos(arrow.direction));
        tipBefore.copy(arrow.group.position).addScaledVector(forward, ARROW_LENGTH / 2);
        tipAfter.copy(tipBefore); tipAfter.x += arrow.vx * delta; tipAfter.z += arrow.vz * delta;
        const hit = firstHit(tipBefore, tipAfter, .055);
        if (hit?.target) hitTarget(arrow, hit);
        else if (hit) impact(arrow, hit);
        else { arrow.group.position.x += arrow.vx * delta; arrow.group.position.z += arrow.vz * delta; }
      } else {
        arrow.vy -= delta * 8.5;
        arrow.group.position.x += arrow.vx * delta; arrow.group.position.y += arrow.vy * delta; arrow.group.position.z += arrow.vz * delta;
        const floor = (world?.heightAt?.(arrow.group.position.x, arrow.group.position.z) ?? 0) + .07;
        if (arrow.group.position.y < floor) { arrow.group.position.y = floor; arrow.vx = arrow.vy = arrow.vz = 0; arrow.life = Math.min(arrow.life, .12); }
        arrow.group.rotation.set(-Math.atan2(arrow.vy, Math.hypot(arrow.vx, arrow.vz) || .1), Math.atan2(arrow.vx, arrow.vz), 0);
      }
    }
    if (isVisible) for (const arrow of arrows) arrow.group.visible = arrow.life > 0 && isVisible(arrow.group.position);
    updateSpells(delta, time);
    spellEffects.update(delta, time);
    let particlesChanged = false;
    impactParticles.forEach((particle, index) => {
      if (particle.life <= 0) return;
      particle.life -= delta; particlesChanged = true;
      particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.z += particle.vz * delta; particle.vy -= 5 * delta;
      particleTransform.position.set(particle.x, particle.life > 0 && (!isVisible || isVisible(particle)) ? particle.y : -100, particle.z);
      particleTransform.rotation.set(time * 4 + index, time * 3 + index, index);
      particleTransform.scale.setScalar(Math.max(0, particle.life / particle.duration)); particleTransform.updateMatrix();
      impactMesh.setMatrixAt(index, particleTransform.matrix);
    });
    if (particlesChanged) impactMesh.instanceMatrix.needsUpdate = true;
  }

  function reset({ reroll = true } = {}) {
    bowHolding = false; bowHoldAge = 0;
    equippedType = null; equippedItem = null; equippedPickup = null; cooldown = 0; attackAge = -1; attackPhase = 'idle'; bowDraw = swordSweep = 0;
    shotReleased = false; shotCount = impactCount = 0; lastImpact = lastSpellLaunch = null;
    for (const held of Object.values(heldByType)) held.visible = false;
    nockedArrow.visible = false;
    clearSwordCombo(); swordEffects.reset(); swordSwingId = 0; character?.setCombatState?.(null);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.dynamic) {
        scene.remove(item.group); items.splice(i, 1);
        disposeWeaponVisual(item.visual);
        item.ringMaterial.dispose(); item.halo.material.dispose(); item.aura.dispose();
      }
      else {
        if (reroll && rollRarity) {
          const stats = weaponStats(item.type, rollRarity(), item.variant);
          Object.assign(item, stats, { label: item.label, name: `${item.label} · ${stats.rarityLabel}` });
          item.group.name = `${item.name} auf dem Boden`;
          item.glow = rarityVisual(item.rarity);
          item.aura.setRarity(item.rarity);
          item.glowingMaterials = applyTier(item.visual, item.rarity);
          item.ringMaterial.color.set(item.color);
          item.halo.material.color.set(item.color);
          item.halo.material.opacity = item.glow.halo;
        }
        returnToGround(item, item.initialPlacement);
      }
    }
    for (const spell of spells) { spell.life = 0; spell.mode = 'inactive'; spell.payload = null; }
    spellEffects.reset();
    specials.reset();
    damageHits = 0; lastDamage = null;
    for (const arrow of arrows) { arrow.life = 0; arrow.mode = 'inactive'; arrow.group.visible = false; }
    impactParticles.forEach((particle, index) => {
      particle.life = 0; particleTransform.position.set(0, -100, 0); particleTransform.scale.setScalar(0); particleTransform.updateMatrix();
      impactMesh.setMatrixAt(index, particleTransform.matrix);
    });
    impactMesh.instanceMatrix.needsUpdate = true;
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    reset({ reroll: false });
    spellEffects.dispose();
    specials.dispose();
    swordEffects.dispose();
    items.forEach(item => item.aura.dispose());
    const roots = [...items.map(item => item.group), ...Object.values(heldByType), nockedArrow,
      ...arrows.map(arrow => arrow.group), impactMesh];
    const geometries = new Set([ringGeometry, haloGeometry, arrowShaftGeometry, arrowHeadGeometry, arrowFeatherGeometry]), materials = new Set(baseMaterials);
    for (const root of roots) {
      root.traverse(part => {
        if (!part.isMesh && !part.isLine) return;
        if (!part.userData.sharedWeaponGeometry) geometries.add(part.geometry);
        for (const mat of Array.isArray(part.material) ? part.material : [part.material]) materials.add(mat);
      });
      root.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const mat of materials) mat.dispose();
    heldMaterials.clear(); items.length = 0;
  }

  return {
    items,
    get equipped() { return equippedType; },
    get equippedItem() { return equippedItem ? { ...equippedItem } : null; },
    get bowHolding() { return bowHolding; },
    get attackCooldown() { return specials.moonBusy ? Math.max(.05, cooldown) : cooldown; },
    get telemetry() {
      bladeTip.fromArray(heldSword.userData.weaponTipPoint ?? [0, heldSword.userData.weaponTipY ?? 0, 0])
        .multiply(heldSword.scale).applyQuaternion(heldSword.quaternion).add(heldSword.position);
      const held = heldByType[equippedType];
      const point = vector => ({ x: vector.x, y: vector.y, z: vector.z });
      const actualHand = side => character?.getHandPosition
        ? point(character.getHandPosition(side, new THREE.Vector3())) : null;
      const hands = { left: actualHand('left'), right: actualHand('right') };
      let bowAlignment = null;
      if (equippedType === 'bow') {
        const tail = nockedArrow.localToWorld(new THREE.Vector3(0, 0, -ARROW_LENGTH / 2));
        characterGroup.worldToLocal(tail);
        const palm = character?.getGripPosition?.('right', new THREE.Vector3()) ?? rightHand;
        bowAlignment = { direction: committedBowDirection, nock: point(tail), drawPalm: point(palm), error: tail.distanceTo(palm) };
      }
      let heldGrip = null;
      if (equippedType?.endsWith('Staff') || equippedType === 'bow' && held.userData.model === 'tripo') {
        const side = equippedType === 'bow' ? 'left' : 'right';
        const wrist = new THREE.Vector3(), palm = new THREE.Vector3();
        if (character?.getHandPosition) character.getHandPosition(side, wrist); else wrist.copy(side === 'left' ? leftHand : rightHand);
        if (character?.getGripPosition) character.getGripPosition(side, palm); else palm.copy(wrist);
        const position = held.position.clone(); position.y -= held.userData.gripOffsetY ?? 0;
        heldGrip = { side, source: characterGroup.userData.characterAsset?.gripSockets?.[side]?.source
          ?? (character?.getGripPosition ? 'palm' : 'wrist'), position: point(position), wrist: point(wrist),
          palm: point(palm), error: position.distanceTo(palm), visible: held.visible };
      }
      let meshCount = 0;
      held?.traverse(part => { if (part.isMesh) meshCount++; });
      return { attackPhase, bowDraw, bowHolding, bowAlignment, swordSweep, shotsFired: shotCount, impacts: impactCount, lastImpact, damageHits, lastDamage,
        swordCombo: { index: swordIndex + 1, pattern: SWORD_PATTERNS[swordIndex] ?? null, swingId: swordSwingId,
          active: equippedType === 'sword' && attackAge >= 0, progress: equippedType === 'sword' && attackAge >= 0 ? Math.min(1, attackAge / attackDuration) : 0,
          remaining: swordComboRemaining },
        swordTrail: swordEffects.inspect(), swordBlade: { base: point(swordBase), tip: point(swordTip) },
        equippedItem, spellsActive: spells.filter(spell => spell.life > 0).length,
        effects: spellEffects.telemetry, special: specials.telemetry, heldGrip, hands, lastSpellLaunch,
        rigPose: character?.inspectCombatPose?.() ?? null,
        staffTip: equippedType?.endsWith('Staff') ? point(getStaffTip(new THREE.Vector3())) : null,
        spells: spells.filter(spell => spell.life > 0).map(spell => ({ type: spell.payload.type, mode: spell.mode,
          visible: spell.group.visible, position: { x: spell.group.position.x, y: spell.group.position.y, z: spell.group.position.z } })),
        heldModel: held ? { type: equippedType, variant: held.userData.variant, model: held.userData.model,
          source: held.userData.weaponSource ?? null,
          visible: held.visible, meshCount, presentationScale: HELD_WEAPON_SCALE[equippedType],
          groundPresentationScale: GROUND_WEAPON_SCALE[equippedType],
          stringVertices: (held.userData.bowStringDeformations ?? []).reduce((total, part) => total + part.count, 0) } : null,
        arrowsActive: arrows.filter(arrow => arrow.life > 0).length,
        arrows: arrows.filter(arrow => arrow.life > 0).map(arrow => ({ mode: arrow.mode, direction: arrow.direction, position: point(arrow.group.position) })),
        arrowsFlying: arrows.filter(arrow => arrow.mode === 'flying' && arrow.life > 0).length,
        lootAuras: items.filter(item => !item.collected).map(item => ({ id: item.id, visible: item.group.visible, ...item.aura.inspect() })),
        arrowModel: projectilePrototypes.arrow ? { ...projectilePrototypes.arrow.userData } : null,
        importedArrowsFlying: arrows.filter(arrow => arrow.mode === 'flying' && arrow.life > 0 && arrow.group.userData.projectileSource).length,
        heldPose: { bow: { x: heldBow.position.x, y: heldBow.position.y, z: heldBow.position.z },
          sword: { x: heldSword.position.x, y: heldSword.position.y, z: heldSword.position.z },
          swordTip: { x: bladeTip.x, y: bladeTip.y, z: bladeTip.z } } };
    },
    nearest, interact, tryAutoPickup, attack, releaseAttack,
    aimAt: (position, point) => specials.aimAt(position, point), cancelAim,
    update, reset, addDrop, dispose,
  };
}
