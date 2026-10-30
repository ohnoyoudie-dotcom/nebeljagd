import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RARITIES, WEAPON_TYPES } from './loot-tiers.js';

const TIERS = Object.keys(RARITIES);
const TYPES = WEAPON_TYPES;
function hash(text) { let value = 2166136261; for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; }

/** Stable contents: reopening/reloading the same map cannot reroll a chest. */
export function chestLoot(id, index = 0, rarity = null) {
  const seed = hash(id);
  const tier = TIERS.includes(rarity) ? rarity : TIERS[index % TIERS.length];
  const type = TYPES[seed % TYPES.length];
  const gold = 12 + seed % 14 + TIERS.indexOf(tier) * 7;
  return [
    { id: `${id}-gold-1`, type: 'gold', kind: 'gold', amount: Math.ceil(gold / 2) },
    { id: `${id}-gold-2`, type: 'gold', kind: 'gold', amount: Math.floor(gold / 2) },
    { id: `${id}-weapon`, type, kind: type, rarity: tier },
  ];
}

/** Throw towards the opener, avoiding water, shore and solid walls. The chest
 * location remains a safe fallback if an editor has placed it in a tight room. */
export function chestDropPosition(chest, opener, world, index = 0) {
  const x = chest.x, z = chest.z, groundY = world?.heightAt?.(x, z) ?? 0;
  const angle = Math.atan2((opener?.x ?? x) - x, (opener?.z ?? z + 1) - z);
  const spread = (index - 1) * .56;
  for (let attempt = 0; attempt < 12; attempt++) {
    const turn = spread + (attempt ? (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * .35 : 0);
    const distance = attempt < 8 ? 1.45 + index * .18 : .65;
    const px = x + Math.sin(angle + turn) * distance, pz = z + Math.cos(angle + turn) * distance;
    if (world?.isLand && !world.isLand(px, pz) || world?.isWater?.(px, pz)) continue;
    const py = world?.heightAt?.(px, pz) ?? groundY;
    if (Math.abs(py - groundY) > .7) continue;
    const point = new THREE.Vector3(px, py, pz);
    if (world?.resolveMovement) {
      const safe = point.clone(); world.resolveMovement(safe, .24);
      if (Math.hypot(safe.x - px, safe.z - pz) > .08) continue;
    }
    if (world?.traceProjectile?.({ x, y: groundY + .5, z }, { x: px, y: py + .5, z: pz }, .12)) continue;
    return [px, pz];
  }
  return [x, z];
}

/** Shared wooden treasure chest asset; only the hinge is animated per instance. */
function chestPrototype() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#89592f', roughness: .86 });
  const lightWood = new THREE.MeshStandardMaterial({ color: '#a87742', roughness: .8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#30251e', roughness: .88 });
  const band = new THREE.MeshStandardMaterial({ color: '#bd9653', metalness: .65, roughness: .36 });
  const iron = new THREE.MeshStandardMaterial({ color: '#4d514b', metalness: .72, roughness: .4 });
  const inside = new THREE.MeshStandardMaterial({ color: '#d1a13d', emissive: '#db8b21', emissiveIntensity: .75, roughness: .45, metalness: .6 });
  function box(parent, size, position, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(root, [1.66, .16, 1.1], [0, .12, 0], dark);
  box(root, [1.48, .08, .92], [0, .23, 0], inside);
  for (const z of [-.49, .49]) {
    for (let i = 0; i < 3; i++) box(root, [1.65, .175, .12], [0, .23 + i * .18, z], i % 2 ? wood : lightWood);
    for (const x of [-.58, .58]) box(root, [.105, .68, .14], [x, .38, z], band);
  }
  for (const x of [-.78, .78]) box(root, [.12, .56, 1.08], [x, .39, 0], wood);
  for (const x of [-.65, .65]) for (const z of [-.38, .38]) box(root, [.18, .18, .18], [x, .07, z], iron);
  const lid = new THREE.Group(); lid.name = 'chest-lid'; lid.position.set(0, .69, -.54); root.add(lid);
  // A low arched lid, modelled as broad wooden planks, with two metal straps.
  for (let plank = 0; plank < 7; plank++) {
    const z = .03 + plank * .17, lift = .2 * Math.sin(Math.PI * z / 1.1);
    box(lid, [1.72, .13, .175], [0, lift, z], plank % 2 ? wood : lightWood);
    for (const x of [-.58, .58]) box(lid, [.11, .15, .18], [x, lift + .025, z], band);
  }
  const latch = box(lid, [.23, .27, .1], [0, -.08, 1.08], band);
  box(lid, [.055, .09, .025], [0, -.095, 1.14], dark);
  latch.name = 'chest-lock';
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({
    color: '#e7b34e', transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide,
  }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = .02; halo.name = 'chest-halo'; root.add(halo);
  // Keep each chest at a handful of draw calls, even though it has many planks.
  for (const parent of [root, lid]) {
    const batches = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh || mesh === halo) continue;
      mesh.updateMatrix();
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
      if (!batches.has(mesh.material)) batches.set(mesh.material, []);
      batches.get(mesh.material).push(geometry);
      parent.remove(mesh); mesh.geometry.dispose();
    }
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      for (const part of geometries) part.dispose();
      const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    }
  }
  return root;
}

export function createChests(scene, { placements = [], heightAt = () => 0, world = null,
  isVisible = () => true, onDrop = () => {}, viewDistance = 75, revealSceneryThroughFog = false,
  tripoPrototype = null } = {}) {
  if (placements.some(object => object.kind === 'chest' && object.variant === 'kit-tripo-chest') && !tripoPrototype) {
    throw new Error('Die Tripo-Truhe muss vor dem Platzieren geladen werden.');
  }
  const prototype = chestPrototype();
  const items = placements.filter(object => object.kind === 'chest').map((definition, index) => {
    const [x, z] = definition.position, groundY = heightAt(x, z);
    const isTripo = definition.variant === 'kit-tripo-chest';
    const group = (isTripo ? tripoPrototype : prototype).clone(true); group.name = definition.name || 'Holztruhe';
    group.position.set(x, groundY, z); group.rotation.y = definition.rotation ?? 0;
    group.scale.setScalar(definition.scale ?? 1); group.userData.worldObjectId = definition.id; scene.add(group);
    return { id: definition.id, name: definition.name || 'Holztruhe', type: 'chest', kind: 'chest',
      x, z, groundY, scale: definition.scale ?? 1, rarity: definition.rarity, group,
      variant: definition.variant ?? 'wood', model: isTripo ? 'tripo' : 'procedural',
      lid: group.getObjectByName('chest-lid'), halo: group.getObjectByName('chest-halo'),
      opened: false, elapsed: 0, dropped: false, opener: null, index };
  });

  const visiblePoint = item => ({ x: item.x, y: item.groundY + .55, z: item.z });
  function reachable(item, player) {
    return !world?.traceProjectile?.({ x: player.x, y: (player.y ?? heightAt(player.x, player.z)) + .65, z: player.z }, visiblePoint(item), .03);
  }
  function nearest(player) {
    if (!player) return null;
    let best = null, distance = 2.45;
    for (const item of items) {
      if (item.opened || !isVisible(visiblePoint(item))) continue;
      const d = Math.hypot(player.x - item.x, player.z - item.z);
      if (d < distance && reachable(item, player)) { best = item; distance = d; }
    }
    return best;
  }
  function interact(player) {
    const item = nearest(player); if (!item) return null;
    item.opened = true; item.opener = { x: player.x, y: player.y, z: player.z };
    return { id: item.id, type: 'chest', message: 'Truhe geöffnet · Gold und Ausrüstung!' };
  }
  function update(dt, time, player, { visible = isVisible } = {}) {
    for (const item of items) {
      item.group.visible = (!player || Math.hypot(player.x - item.x, player.z - item.z) < viewDistance) && (revealSceneryThroughFog || visible(visiblePoint(item)));
      if (item.opened) {
        item.elapsed += Math.max(0, dt);
        const progress = Math.min(1, item.elapsed / .55);
        item.lid.rotation.x = -1.9 * (1 - Math.pow(1 - progress, 3));
        item.halo.visible = false;
        if (!item.dropped && item.elapsed >= .23) {
          item.dropped = true;
          const contents = chestLoot(item.id, item.index, item.rarity);
          contents.forEach((drop, index) => onDrop({ ...drop,
            position: chestDropPosition(item, item.opener, world ?? { heightAt }, index),
            origin: [item.x, item.z], sourceChest: item.id }, { pop: true }));
        }
      } else {
        item.halo.scale.setScalar(.95 + Math.sin(time * 1.6 + item.index) * .04);
      }
    }
  }
  return {
    items, nearest, interact, open: interact, update,
    get openedCount() { return items.filter(item => item.opened).length; },
    reset() { for (const item of items) { item.opened = false; item.elapsed = 0; item.dropped = false;
      item.opener = null; item.lid.rotation.x = 0; item.halo.visible = true; } },
    dispose() {
      for (const item of items) scene.remove(item.group);
      const geometries = new Set(), materials = new Set(), textures = new Set();
      for (const asset of [prototype, tripoPrototype].filter(Boolean)) asset.traverse(node => {
        if (node.geometry) geometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) materials.add(material);
      });
      for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
