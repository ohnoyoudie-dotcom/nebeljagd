import * as THREE from 'three';
import { WEAPON_TYPES, weaponStats, rarityVisual } from './loot-tiers.js';

/** Ground loot, hand-aligned combat animation and swept terrain impacts. */
export function createWeapons(scene, characterGroup, world, character = null,
  { placements, heightAt = world?.heightAt, viewDistance = 100, combat = null, ownerId = 'player', isVisible = null, revealSceneryThroughFog = false } = {}) {
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.72, flatShading: true, ...extra,
  });
  const wood = material('#925631');
  const darkWood = material('#57351f');
  const leather = material('#47392c');
  const brass = material('#e6bd68', { metalness: 0.5, roughness: 0.35 });
  const steel = material('#d7e8ee', { metalness: 0.66, roughness: 0.26 });
  const steelDark = material('#83aab3', { metalness: 0.58, roughness: 0.34 });
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

  function makeSword() {
    const group = new THREE.Group();
    group.name = 'Eisenschwert';
    addMesh(group, new THREE.CylinderGeometry(0.047, 0.055, 0.37, 6), leather, 0, -0.26, 0);
    addMesh(group, new THREE.OctahedronGeometry(0.105), brass, 0, -0.48, 0);
    const guard = addMesh(group, box(0.43, 0.075, 0.12), brass, 0, -0.045, 0);
    guard.rotation.z = -0.04;
    addMesh(group, box(0.12, 0.11, 0.12), steelDark, 0, 0.04, 0);
    const blade = addMesh(group, new THREE.CylinderGeometry(0, 0.118, 0.78, 4), steel, 0, 0.48, 0);
    blade.rotation.y = Math.PI / 4;
    addMesh(group, box(0.029, 0.57, 0.012), steelDark, 0, 0.35, 0.092);
    addMesh(group, new THREE.OctahedronGeometry(0.065), gem, 0, -0.055, 0.09);
    return group;
  }

  const fireCore = material('#ffd37c', { emissive: '#ff6a17', emissiveIntensity: 2 });
  const iceCore = material('#e2fbff', { emissive: '#53cfff', emissiveIntensity: 1.5 });
  function makeStaff(type) {
    const group = new THREE.Group();
    group.name = type === 'fireStaff' ? 'Feuerstab' : 'Eisstab';
    addMesh(group, new THREE.CylinderGeometry(.038, .055, 1.6, 7), darkWood, 0, 0, 0);
    addMesh(group, new THREE.CylinderGeometry(.07, .07, .36, 7), leather, 0, -.22, 0);
    for (const y of [-.42, -.02, .58]) addMesh(group, new THREE.TorusGeometry(.074, .025, 4, 8), brass, 0, y, 0).rotation.x = Math.PI / 2;
    const core = addMesh(group, new THREE.OctahedronGeometry(.18, 0), type === 'fireStaff' ? fireCore : iceCore, 0, .87, 0);
    core.scale.set(.75, 1.5, .75);
    core.userData.elementCore = true;
    for (const x of [-1, 1]) {
      const tine = addMesh(group, new THREE.CylinderGeometry(.026, .045, .43, 5), brass, x * .13, .76, 0);
      tine.rotation.z = x * -.38;
    }
    return group;
  }
  const makeWeapon = type => type === 'bow' ? makeBow() : type === 'sword' ? makeSword() : makeStaff(type);
  function applyTier(group, rarity, clone = false) {
    const glow = rarityVisual(rarity), copies = new Map(), glowing = new Map();
    group.userData.rarity = glow.rarity;
    group.userData.rarityColor = glow.color;
    group.traverse(part => {
      if (!part.isMesh || !part.material.emissive || part.userData.elementCore) return;
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
    const stats = weaponStats(type, definition.rarity);
    const x = definition.position?.[0] ?? definition.x, z = definition.position?.[1] ?? definition.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const groundY = heightAt?.(x, z) ?? 0;
    const group = new THREE.Group();
    group.name = `${stats.name} auf dem Boden`;
    group.position.set(x, groundY, z);
    group.rotation.y = definition.rotation ?? 0;
    group.scale.setScalar(definition.scale ?? 1);
    group.userData.worldObjectId = definition.id;
    const floating = new THREE.Group();
    floating.position.y = .75;
    const visual = makeWeapon(type);
    const glow = rarityVisual(stats.rarity);
    const glowingMaterials = applyTier(visual, stats.rarity, true);
    visual.rotation.x = -Math.PI / 2;
    visual.rotation.z = -.24;
    floating.add(visual);
    group.add(floating);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: stats.color, transparent: true, opacity: .75,
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
    group.add(halo); scene.add(group);
    const item = { ...definition, ...stats, id: definition.id ?? `drop-weapon-${++dropSerial}`,
      type, x, z, phase: items.length * 1.7, groundY, group, floating, visual, ring,
      ringMaterial, glow, glowingMaterials, collected: false, dynamic: !initial, popAge: pop ? 0 : 1,
      origin: definition.origin ?? [x, z] };
    if (pop) { ring.visible = halo.visible = false; group.position.set(item.origin[0], heightAt?.(...item.origin) ?? groundY, item.origin[1]); }
    item.halo = halo;
    items.push(item);
    return item;
  }
  for (const definition of definitions) addDrop(definition, { pop: false, initial: true });

  const heldBow = makeBow();
  heldBow.position.set(.17, 1.30, .13);
  heldBow.rotation.set(0, Math.PI / 2, 0);
  heldBow.scale.setScalar(.78);
  heldBow.visible = false;
  characterGroup.add(heldBow);
  const heldSword = new THREE.Group();
  const swordVisual = makeSword();
  swordVisual.position.y = .26; // The hand is on the grip, below the crossguard.
  heldSword.add(swordVisual);
  heldSword.position.set(-.22, 1.20, .42);
  heldSword.scale.setScalar(1.10);
  heldSword.visible = false;
  characterGroup.add(heldSword);
  const heldFireStaff = makeStaff('fireStaff'), heldIceStaff = makeStaff('iceStaff');
  for (const held of [heldFireStaff, heldIceStaff]) { held.visible = false; characterGroup.add(held); }
  const heldMaterials = new Set();
  for (const held of [heldBow, heldSword, heldFireStaff, heldIceStaff]) held.traverse(part => {
    if (!part.isMesh && !part.isLine) return;
    part.material = part.material.clone();
    heldMaterials.add(part.material);
  });

  const arrowWood = material('#b77740');
  const arrowFeather = material('#ffedbf', { side: THREE.DoubleSide });
  const arrowGlow = new THREE.MeshBasicMaterial({
    color: '#ffd78c', transparent: true, opacity: 0.26,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const arrowShaftGeometry = new THREE.CylinderGeometry(0.026, 0.03, 0.69, 5);
  const arrowHeadGeometry = new THREE.ConeGeometry(0.085, 0.23, 5);
  const arrowFeatherGeometry = box(0.15, 0.024, 0.2);
  const arrowTrailGeometry = new THREE.ConeGeometry(0.085, 0.8, 5);
  function makeArrow(trailVisible = true) {
    const group = new THREE.Group();
    const shaft = addMesh(group, arrowShaftGeometry, arrowWood);
    shaft.rotation.x = Math.PI / 2;
    const head = addMesh(group, arrowHeadGeometry, steel, 0, 0, 0.43);
    head.rotation.x = Math.PI / 2;
    const feather = addMesh(group, arrowFeatherGeometry, arrowFeather, 0, 0, -0.34);
    feather.rotation.z = Math.PI / 4;
    if (trailVisible) {
      const trail = addMesh(group, arrowTrailGeometry, arrowGlow, 0, 0, -0.83);
      trail.rotation.x = Math.PI / 2; trail.castShadow = false;
      group.userData.trail = trail;
    }
    return group;
  }
  const nockedArrow = makeArrow(false);
  nockedArrow.name = 'Aufgelegter Pfeil';
  nockedArrow.position.set(.17, 1.30, .45);
  nockedArrow.visible = false;
  characterGroup.add(nockedArrow);
  nockedArrow.traverse(part => {
    if (!part.isMesh) return;
    part.material = part.material.clone(); heldMaterials.add(part.material);
  });
  const arrows = Array.from({ length: 8 }, () => {
    const group = makeArrow();
    group.name = 'Fliegender Pfeil';
    group.visible = false;
    scene.add(group);
    return { group, life: 0, mode: 'inactive', direction: 0, vx: 0, vy: 0, vz: 0 };
  });

  const slashMaterial = new THREE.MeshBasicMaterial({
    color: '#fff2ba', transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const slashPoints = [], slashIndices = [];
  for (let i = 0; i <= 28; i++) {
    const angle = -1.12 + i / 28 * 2.24;
    for (const radius of [.91, 1.09]) slashPoints.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    if (i < 28) { const a = i * 2; slashIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const slashGeometry = new THREE.BufferGeometry();
  slashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(slashPoints, 3));
  slashGeometry.setIndex(slashIndices);
  const slash = new THREE.Mesh(slashGeometry, slashMaterial);
  slash.name = 'Schwertschwung';
  slash.position.set(0, 1.25, .06);
  slash.visible = false;
  characterGroup.add(slash);

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
  const up = new THREE.Vector3(0, 1, 0);
  const leftHand = new THREE.Vector3(), rightHand = new THREE.Vector3();
  const combatPose = { weapon: null, phase: 'idle', leftHand, rightHand, chestTwist: 0 };
  let equippedType = null, equippedItem = null;
  let cooldown = 0, attackAge = -1, attackDuration = 0;
  let shotReleased = false, bowDraw = 0, swordSweep = 0;
  let attackPhase = 'idle', shotCount = 0, impactCount = 0, lastImpact = null, particleCursor = 0;
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

  function equip(item, automatic = false) {
    if (!item) return null;
    item.collected = true; item.group.visible = false;
    equippedType = item.type; equippedItem = weaponStats(item.type, item.rarity);
    for (const held of [heldBow, heldSword, heldFireStaff, heldIceStaff]) applyTier(held, equippedItem.rarity);
    slashMaterial.color.set(equippedItem.color);
    cooldown = 0; attackAge = -1; attackPhase = 'idle';
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
    if (!equippedType || cooldown > 0 || !position || characterGroup.userData.rolling) return null;
    // The bow releases after a short visible draw, in the direction the body faces.
    // A smoothed movement yaw therefore never produces a sideways arrow.
    attackAge = 0; shotReleased = false;
    attackDuration = equippedItem.cooldown;
    cooldown = attackDuration;
    attackPhase = equippedType === 'bow' ? 'draw' : equippedType === 'sword' ? 'windup' : 'channel';
    applyHeldPose();
    return { type: equippedType, message: equippedType === 'bow' ? 'Bogensehne gespannt' : equippedType === 'sword' ? 'Schwertschlag' : 'Zauber gewirkt' };
  }

  function applyHeldPose() {
    const rolling = Boolean(characterGroup.userData.rolling);
    heldBow.visible = equippedType === 'bow' && !rolling;
    heldSword.visible = equippedType === 'sword' && !rolling;
    heldFireStaff.visible = equippedType === 'fireStaff' && !rolling;
    heldIceStaff.visible = equippedType === 'iceStaff' && !rolling;
    nockedArrow.visible = equippedType === 'bow' && !rolling && (attackAge < 0 || attackAge < .23 || attackAge > .51);
    slash.visible = false;
    if (!equippedType || rolling) { character?.setCombatState?.(null); return; }
    combatPose.weapon = equippedType; combatPose.phase = attackPhase;
    if (equippedType === 'bow') {
      bowDraw = attackAge < 0 ? 0 : attackAge < .23 ? ease(0, .23, attackAge) : 1 - ease(.23, .36, attackAge);
      leftHand.set(.06, 1.34, .40);
      rightHand.set(.04, 1.35, .08 - bowDraw * .24);
      combatPose.chestTwist = -.08 - bowDraw * .07;
      character?.setCombatState?.(combatPose);
      if (character?.getHandPosition) character.getHandPosition('left', hand); else hand.copy(leftHand);
      heldBow.position.copy(hand); heldBow.position.z -= .39 * .78;
      heldBow.rotation.set(attackAge >= .23 && attackAge < .40 ? Math.sin((attackAge - .23) * 38) * .035 : 0, Math.PI / 2, 0);
      const stringPositions = heldBow.userData.bowString.geometry.attributes.position;
      stringPositions.setX(1, .02 + bowDraw * .31); stringPositions.needsUpdate = true;
      nockedArrow.position.set(hand.x, hand.y, heldBow.position.z - .02 * .78 + .34 - bowDraw * .24);
      nockedArrow.rotation.set(0, 0, 0);
    } else if (equippedType === 'sword') {
      bowDraw = 0;
      const progress = attackAge < 0 ? 0 : attackAge / attackDuration;
      const windup = attackAge < 0 ? 0 : ease(0, .24, progress);
      const strike = attackAge < 0 ? 0 : ease(.24, .66, progress);
      const recover = attackAge < 0 ? 0 : ease(.70, 1, progress);
      swordSweep = attackAge < 0 ? -.12 : THREE.MathUtils.lerp(-1.12 * windup, 1.17, strike) * (1 - recover) - .12 * recover;
      rightHand.set(THREE.MathUtils.lerp(-.22, -.38 + strike * .72, 1 - recover),
        1.22 + Math.sin(progress * Math.PI) * .09,
        .40 + Math.sin(progress * Math.PI) * .15);
      leftHand.set(.24, 1.25, .22 + strike * .05);
      combatPose.chestTwist = -.16 * windup + strike * .29 - recover * .13;
      character?.setCombatState?.(combatPose);
      if (character?.getHandPosition) character.getHandPosition('right', hand); else hand.copy(rightHand);
      heldSword.position.copy(hand);
      bladeDirection.set(Math.sin(swordSweep), attackAge < 0 ? .38 : .20 + recover * .18, Math.cos(swordSweep)).normalize();
      heldSword.quaternion.setFromUnitVectors(up, bladeDirection);
      const inStrike = attackAge >= 0 && progress > .24 && progress < .72;
      slash.visible = inStrike;
      slash.scale.setScalar(1.26);
      slashMaterial.opacity = inStrike ? Math.sin((progress - .24) / .48 * Math.PI) * .32 : 0;
    } else {
      bowDraw = swordSweep = 0;
      const pulse = attackAge >= 0 ? Math.sin(Math.min(1, attackAge / .45) * Math.PI) : 0;
      rightHand.set(-.26, 1.22 + pulse * .14, .38 + pulse * .16);
      leftHand.set(.27, 1.3, .32 + pulse * .2);
      combatPose.chestTwist = -.08 + pulse * .16;
      character?.setCombatState?.(combatPose);
      if (character?.getHandPosition) character.getHandPosition('right', hand); else hand.copy(rightHand);
      const staff = equippedType === 'fireStaff' ? heldFireStaff : heldIceStaff;
      staff.position.copy(hand); staff.position.y += .20;
      staff.rotation.set(.28 + pulse * .5, 0, -.06);
    }
  }

  function impact(arrow, hit) {
    const nx = hit.normal?.x ?? -Math.sin(arrow.direction), nz = hit.normal?.z ?? -Math.cos(arrow.direction);
    const length = Math.hypot(nx, nz) || 1, normalX = nx / length, normalZ = nz / length;
    const dot = arrow.vx * normalX + arrow.vz * normalZ;
    arrow.group.position.set(hit.point.x - Math.sin(arrow.direction) * .43 + normalX * .025,
      hit.point.y ?? arrow.group.position.y, hit.point.z - Math.cos(arrow.direction) * .43 + normalZ * .025);
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
    const angle = characterGroup.rotation.y;
    arrow.mode = 'flying'; arrow.life = 1.35; arrow.direction = angle; arrow.payload = { ...equippedItem, sourceId: ownerId };
    arrow.vx = Math.sin(angle) * 18; arrow.vz = Math.cos(angle) * 18; arrow.vy = 0;
    arrow.group.position.copy(launchCenter); arrow.group.rotation.set(0, angle, 0); arrow.group.visible = true;
    if (arrow.group.userData.trail) arrow.group.userData.trail.visible = true;
    forward.set(Math.sin(angle), 0, Math.cos(angle));
    launchOrigin.set(position.x, launchCenter.y, position.z);
    tipAfter.copy(launchCenter).addScaledVector(forward, .43);
    // Trace from the body before using the forward muzzle, so a close wall cannot
    // be skipped by spawning the projectile on its far side.
    const immediate = firstHit(launchOrigin, tipAfter, .055);
    if (immediate?.target) hitTarget(arrow, immediate);
    else if (immediate) impact(arrow, immediate);
    shotCount++;
  }

  let damageHits = 0, lastDamage = null;
  function firstHit(start, end, radius) {
    const terrain = world?.traceProjectile?.(start, end, radius);
    const entity = combat?.traceSegment(start, end, radius, ownerId);
    if (!entity) return terrain;
    if (!terrain) return entity;
    if (entity.target.destructible && terrain.collider?.objectId === entity.target.id) return entity;
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const terrainT = distance > 1e-8 ? Math.hypot(terrain.point.x - start.x, terrain.point.z - start.z) / distance : 0;
    return entity.t < terrainT - .0001 ? entity : terrain;
  }
  function hitTarget(projectile, collision) {
    lastDamage = combat.hit(collision.target, projectile.payload); damageHits++;
    projectile.life = 0; projectile.mode = 'inactive'; projectile.group.visible = false;
  }

  const spellGeometry = new THREE.IcosahedronGeometry(.14, 1);
  const spellHaloGeometry = new THREE.SphereGeometry(.24, 8, 6);
  const spellTailGeometry = new THREE.ConeGeometry(.16, .85, 7);
  const spells = Array.from({ length: 10 }, () => {
    const group = new THREE.Group(); group.name = 'Elementargeschoss';
    const core = new THREE.Mesh(spellGeometry, new THREE.MeshBasicMaterial({ color: '#ffd78b' }));
    const aura = new THREE.Mesh(spellHaloGeometry, new THREE.MeshBasicMaterial({ color: '#ff741e', transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending }));
    const tail = new THREE.Mesh(spellTailGeometry, aura.material);
    tail.rotation.x = Math.PI / 2; tail.position.z = -.43;
    group.add(core, aura, tail); group.visible = false; scene.add(group);
    return { group, core, aura, tail, life: 0, vx: 0, vz: 0, mode: 'inactive', payload: null };
  });
  function releaseSpell(position) {
    const spell = spells.find(entry => entry.life <= 0) ?? spells[0];
    const staff = equippedType === 'fireStaff' ? heldFireStaff : heldIceStaff;
    characterGroup.updateWorldMatrix(true, true); scene.updateWorldMatrix(true, false);
    launchCenter.set(0, .87, 0); staff.localToWorld(launchCenter); scene.worldToLocal(launchCenter);
    // A fixed chest-height flight plane makes the aim readable on uneven ground.
    launchCenter.y = position.y + 1.4;
    const angle = characterGroup.rotation.y;
    spell.mode = 'flying'; spell.life = 1.35; spell.direction = angle;
    spell.vx = Math.sin(angle) * 18; spell.vz = Math.cos(angle) * 18;
    spell.payload = { ...equippedItem, sourceId: ownerId };
    spell.group.position.copy(launchCenter); spell.group.rotation.set(0, angle, 0);
    spell.group.scale.setScalar(1); spell.group.visible = true; spell.tail.visible = true;
    spell.core.material.color.set(equippedType === 'fireStaff' ? '#ffe3a5' : '#e6fbff');
    spell.aura.material.color.set(equippedType === 'fireStaff' ? '#ff6b20' : '#51cfff');
    spell.aura.material.opacity = .3;
    launchOrigin.set(position.x, launchCenter.y, position.z);
    const immediate = firstHit(launchOrigin, launchCenter, .13);
    if (immediate?.target) hitTarget(spell, immediate);
    else if (immediate) spellImpact(spell, immediate);
    shotCount++;
  }
  function spellImpact(spell, collision) {
    spell.group.position.copy(collision.point); spell.mode = 'burst'; spell.life = .18;
    spell.tail.visible = false;
    impactCount++;
    lastImpact = { type: collision.type ?? 'terrain', point: { ...collision.point } };
  }
  function updateSpells(delta, time) {
    for (const spell of spells) {
      if (spell.life <= 0) continue;
      spell.life -= delta;
      if (spell.life <= 0) { spell.group.visible = false; spell.mode = 'inactive'; continue; }
      if (spell.mode === 'flying') {
        tipBefore.copy(spell.group.position);
        tipAfter.copy(tipBefore); tipAfter.x += spell.vx * delta; tipAfter.z += spell.vz * delta;
        const collision = firstHit(tipBefore, tipAfter, .13);
        if (collision?.target) hitTarget(spell, collision);
        else if (collision) spellImpact(spell, collision);
        else spell.group.position.copy(tipAfter);
        spell.core.rotation.set(time * 5, time * 7, time * 3);
      } else {
        spell.group.scale.setScalar(1 + (1 - spell.life / .18) * 3);
        spell.aura.material.opacity = .3 * spell.life / .18;
      }
      spell.group.visible = spell.life > 0 && (!isVisible || isVisible(spell.group.position));
    }
  }

  function update(dt, time, position = characterGroup.position) {
    const delta = Math.max(0, Math.min(.25, Number.isFinite(dt) ? dt : 0));
    cooldown = Math.max(0, cooldown - delta);
    for (const item of items) {
      if (item.collected) continue;
      const wave = Math.sin(time * 2.2 + item.phase);
      if (item.popAge < .65) {
        item.popAge = Math.min(.65, item.popAge + delta);
        const t = item.popAge / .65, easeOut = 1 - (1 - t) ** 2;
        const originY = heightAt?.(...item.origin) ?? item.groundY;
        item.group.position.set(THREE.MathUtils.lerp(item.origin[0], item.x, easeOut), THREE.MathUtils.lerp(originY, item.groundY, easeOut), THREE.MathUtils.lerp(item.origin[1], item.z, easeOut));
        item.floating.position.y = .72 + Math.sin(t * Math.PI) * 1.8;
        item.floating.rotation.z = Math.sin(t * Math.PI) * 1.1;
        item.ring.visible = item.halo.visible = t >= 1;
      } else { item.floating.position.y = .72 + wave * .11; item.floating.rotation.z = 0; }
      item.floating.rotation.y = Math.sin(time * .6 + item.phase) * .32;
      item.ring.scale.setScalar(1 + wave * .065); item.ringMaterial.opacity = .6 + (wave + 1) * .11;
      item.halo.scale.setScalar(1 + wave * .075);
      item.halo.material.opacity = item.glow.halo * (.9 + wave * .1);
      for (const entry of item.glowingMaterials) entry.material.emissiveIntensity = entry.strength * (1 + wave * .08);
      item.group.visible = (!position || (position.x - item.x) ** 2 + (position.z - item.z) ** 2 <= viewDistance ** 2)
        && (revealSceneryThroughFog || !isVisible || isVisible(item.group.position));
    }
    if (characterGroup.userData.rolling && attackAge >= 0) {
      attackAge = -1; attackPhase = 'idle'; shotReleased = true;
    }
    if (attackAge >= 0) {
      attackAge += delta;
      if (equippedType === 'bow') attackPhase = attackAge < .23 ? 'draw' : attackAge < .36 ? 'release' : 'recover';
      else if (equippedType.endsWith('Staff')) attackPhase = attackAge < .25 ? 'channel' : attackAge < .4 ? 'release' : 'recover';
      else {
        const p = attackAge / attackDuration;
        attackPhase = p < .24 ? 'windup' : p < .66 ? 'strike' : 'follow-through';
      }
    }
    applyHeldPose();
    if (equippedType === 'bow' && attackAge >= .23 && !shotReleased) {
      shotReleased = true; releaseArrow(position);
    }
    if (equippedType?.endsWith('Staff') && attackAge >= .25 && !shotReleased) {
      shotReleased = true; releaseSpell(position);
    }
    if (equippedType === 'sword' && attackAge >= attackDuration * .36 && !shotReleased) {
      shotReleased = true;
      for (const target of combat?.melee(position, characterGroup.rotation.y, equippedItem.range, Math.PI * .85, ownerId) ?? []) {
        const start = { x: position.x, y: position.y + 1.1, z: position.z };
        const end = { x: target.position.x, y: target.position.y + 1.1, z: target.position.z };
        const blocker = world?.traceProjectile?.(start, end, .06);
        if (!blocker || blocker.collider?.objectId === target.id) {
          lastDamage = combat.hit(target, { ...equippedItem, sourceId: ownerId }); damageHits++;
        }
      }
    }
    if (attackAge >= attackDuration && attackAge >= 0) { attackAge = -1; attackPhase = 'idle'; }
    const opacity = characterGroup.userData.concealmentOpacity ?? 1;
    for (const mat of heldMaterials) {
      const translucent = opacity < .995;
      if (mat.transparent !== translucent) { mat.transparent = translucent; mat.needsUpdate = true; }
      mat.opacity = opacity; mat.depthWrite = !translucent;
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
        tipBefore.copy(arrow.group.position).addScaledVector(forward, .43);
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

  function reset() {
    equippedType = null; equippedItem = null; cooldown = 0; attackAge = -1; attackPhase = 'idle'; bowDraw = swordSweep = 0;
    shotReleased = false; shotCount = impactCount = 0; lastImpact = null;
    heldBow.visible = heldSword.visible = heldFireStaff.visible = heldIceStaff.visible = slash.visible = nockedArrow.visible = false;
    slashMaterial.opacity = 0; character?.setCombatState?.(null);
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.dynamic) {
        scene.remove(item.group); items.splice(i, 1);
        const ownedMaterials = new Set();
        item.visual.traverse(part => {
          if (!part.isMesh && !part.isLine) return;
          part.geometry.dispose();
          if (part.userData.ownsTierMaterial || part.isLine) ownedMaterials.add(part.material);
        });
        for (const material of ownedMaterials) material.dispose();
        item.ringMaterial.dispose(); item.halo.material.dispose();
      }
      else { item.collected = false; item.group.visible = true; }
    }
    for (const spell of spells) { spell.life = 0; spell.group.visible = false; }
    damageHits = 0; lastDamage = null;
    for (const arrow of arrows) { arrow.life = 0; arrow.mode = 'inactive'; arrow.group.visible = false; }
    impactParticles.forEach((particle, index) => {
      particle.life = 0; particleTransform.position.set(0, -100, 0); particleTransform.scale.setScalar(0); particleTransform.updateMatrix();
      impactMesh.setMatrixAt(index, particleTransform.matrix);
    });
    impactMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    items,
    get equipped() { return equippedType; },
    get equippedItem() { return equippedItem ? { ...equippedItem } : null; },
    get attackCooldown() { return cooldown; },
    get telemetry() {
      bladeTip.set(0, 1.13, 0).applyQuaternion(heldSword.quaternion).multiplyScalar(heldSword.scale.y).add(heldSword.position);
      return { attackPhase, bowDraw, swordSweep, shotsFired: shotCount, impacts: impactCount, lastImpact, damageHits, lastDamage,
        equippedItem, spellsActive: spells.filter(spell => spell.life > 0).length,
        arrowsActive: arrows.filter(arrow => arrow.life > 0).length,
        arrowsFlying: arrows.filter(arrow => arrow.mode === 'flying' && arrow.life > 0).length,
        heldPose: { bow: { x: heldBow.position.x, y: heldBow.position.y, z: heldBow.position.z },
          sword: { x: heldSword.position.x, y: heldSword.position.y, z: heldSword.position.z },
          swordTip: { x: bladeTip.x, y: bladeTip.y, z: bladeTip.z } } };
    },
    nearest, interact, tryAutoPickup, attack, update, reset, addDrop,
  };
}
