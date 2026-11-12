import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { swordPrototype } from './helpers/weapon-prototypes.js';
import { createChests } from '../src/chests.js';
import { createPickups } from '../src/pickups.js';
import { RARITIES, WEAPON_TYPES, rarityVisual } from '../src/loot-tiers.js';

function setup(placements = [{ id: 'bow', kind: 'bow', rarity: 'common', position: [0, 0] }], options = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const world = { heightAt: () => 0, traceProjectile: () => null, ...options.world };
  return { scene, actor, weapons: createWeapons(scene, actor, world, null, { placements, tripoPrototypes: swordPrototype(), ...options }) };
}

const PROCEDURAL_WEAPON_TYPES = ['bow', 'fireStaff', 'iceStaff'];
const IMPORTED_WEAPONS = [
  { kind: 'sword', variant: 'kit-tripo-sword' },
  { kind: 'poisonStaff', variant: 'kit-tripo-poison-staff' },
  { kind: 'moonStaff', variant: 'kit-tripo-moon-staff' },
  { kind: 'starStaff', variant: 'kit-tripo-star-staff' },
  { kind: 'lightningStaff', variant: 'kit-tripo-lightning-staff' },
  { kind: 'hourglassStaff', variant: 'kit-tripo-hourglass-staff' },
  { kind: 'gravityStaff', variant: 'kit-tripo-gravity-staff' },
  { kind: 'bow', variant: 'kit-tripo-ornate-bow' },
];

function pbrPalette(material) {
  return { color: material.color.clone(), emissive: material.emissive.clone(),
    emissiveIntensity: material.emissiveIntensity, roughness: material.roughness,
    metalness: material.metalness, opacity: material.opacity, transparent: material.transparent,
    map: material.map, normalMap: material.normalMap, roughnessMap: material.roughnessMap,
    metalnessMap: material.metalnessMap, emissiveMap: material.emissiveMap };
}

function assertPbrPalette(material, expected, label) {
  assert.ok(material.color.equals(expected.color), `${label}: original base color`);
  assert.ok(material.emissive.equals(expected.emissive), `${label}: original emissive color`);
  for (const property of ['emissiveIntensity', 'roughness', 'metalness', 'opacity', 'transparent',
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
    assert.equal(material[property], expected[property], `${label}: original ${property}`);
  }
}

// No model processing or GLB loading is needed to check material ownership.
// Two meshes share one textured PBR material, as they may in an imported model.
function importedPrototypes() {
  const tripoPrototypes = {}, palettes = new Map(), materials = new Map();
  for (const { variant } of IMPORTED_WEAPONS) {
    const group = new THREE.Group(); group.name = variant;
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: '#784b2c', emissive: '#331c0a',
      emissiveIntensity: .15, roughness: .63, metalness: .42, map: texture, normalMap: texture,
      roughnessMap: texture, metalnessMap: texture, emissiveMap: texture });
    const geometry = new THREE.BoxGeometry(.12, 1.7, .08);
    group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    tripoPrototypes[variant] = group;
    palettes.set(variant, pbrPalette(material)); materials.set(variant, material);
  }
  return { tripoPrototypes, palettes, materials };
}

function importedMeshes(root) {
  const meshes = [];
  root.traverse(part => { if (part.isMesh && part.userData.tripoWeapon) meshes.push(part); });
  return meshes;
}

test('unarmed pickup only happens at walking reach; equipped weapons require a deliberate swap', () => {
  const { actor, weapons } = setup([
    { id: 'bow', kind: 'bow', rarity: 'common', position: [0, 0] },
    { id: 'sword', kind: 'sword', rarity: 'rare', position: [3, 0] },
  ]);
  actor.position.set(1.2, 0, 0);
  assert.equal(weapons.nearest(actor.position).id, 'bow', 'manual prompt reaches farther');
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  actor.position.x = 1;
  const pickup = weapons.tryAutoPickup(actor.position);
  assert.equal(pickup.type, 'bow'); assert.equal(pickup.automatic, true);
  actor.position.x = 3;
  assert.equal(weapons.tryAutoPickup(actor.position), null, 'walking over another item cannot swap');
  assert.equal(weapons.equipped, 'bow'); assert.equal(weapons.items[1].collected, false);
  assert.equal(weapons.interact(actor.position).type, 'sword');
  assert.equal(weapons.equippedItem.rarity, 'rare');
  assert.equal(weapons.tryAutoPickup(actor.position), null);
});

test('manual swaps return the previous weapon at the new pickup without loss or duplication', () => {
  const placements = [
    { id: 'bow', kind: 'bow', rarity: 'legendary', position: [-5, 1], rotation: .7, scale: 1.4 },
    { id: 'sword', kind: 'sword', rarity: 'rare', position: [8, 2] },
  ];
  const original = JSON.stringify(placements);
  const heightAt = (x, z) => 2 + x * .02 + z * .01;
  const { actor, weapons } = setup(placements, { world: { heightAt } });
  const [bow, sword] = weapons.items;
  actor.position.set(-5, heightAt(-5, 1), 1);
  weapons.tryAutoPickup(actor.position);
  actor.position.set(7.4, heightAt(7.4, 2), 2);
  assert.equal(weapons.interact(actor.position).id, 'sword');
  assert.equal(bow.collected, false, 'the previous weapon must return to the ground');
  assert.equal(bow.group.visible, true);
  assert.deepEqual(bow.group.position.toArray(), [8, heightAt(8, 2), 2]);
  assert.equal(bow.group.rotation.y, .7); assert.equal(bow.group.scale.x, 1.4);
  assert.equal(bow.rarity, 'legendary');
  weapons.update(.016, 0, actor.position);
  assert.equal(bow.group.visible, true, 'the next animation frame must keep the drop visible');
  assert.equal(bow.ring.visible, true); assert.equal(bow.halo.visible, false);
  assert.equal(bow.aura.inspect().visible, true, 'the new layered aura returns with the actual dropped weapon');
  assert.equal(weapons.tryAutoPickup(actor.position), null, 'a deliberate swap must not bounce back automatically');
  for (let i = 0; i < 20; i++) {
    assert.equal(weapons.interact(actor.position).id, i % 2 ? 'sword' : 'bow');
    assert.deepEqual(weapons.items, [bow, sword], 'reuse the actual pickups instead of adding copies');
    assert.equal(weapons.items.filter(item => item.collected).length, 1);
    assert.equal(weapons.items.filter(item => item.group.visible).length, 1);
  }
  assert.equal(JSON.stringify(placements), original, 'runtime swaps do not rewrite the editor map');
  weapons.dispose();
});

test('reset restores authored positions after swaps and removes carried or dropped chest loot', () => {
  const { actor, weapons } = setup([
    { id: 'bow', kind: 'bow', position: [-4, 0] },
    { id: 'sword', kind: 'sword', position: [4, 0] },
  ]);
  actor.position.x = -4; weapons.tryAutoPickup(actor.position);
  actor.position.x = 4; weapons.interact(actor.position);
  assert.equal(weapons.items[0].x, 4, 'the first weapon moved to the swap site');
  const chestLoot = weapons.addDrop({ id: 'chest-weapon', type: 'iceStaff', rarity: 'rare', position: [12, 0] }, { pop: false });
  actor.position.x = 12;
  assert.equal(weapons.interact(actor.position).id, 'chest-weapon');
  assert.equal(weapons.items[1].x, 12);
  // Swap the dynamically created weapon out again before restarting.
  weapons.interact(actor.position);
  assert.equal(chestLoot.collected, false); assert.equal(chestLoot.group.visible, true);
  weapons.reset(); weapons.reset();
  assert.equal(weapons.equippedItem, null);
  assert.equal(chestLoot.group.parent, null);
  assert.deepEqual(weapons.items.map(item => [item.id, item.x, item.z, item.collected]), [
    ['bow', -4, 0, false], ['sword', 4, 0, false],
  ]);
  assert.deepEqual(weapons.items.map(item => item.group.position.toArray()), [[-4, 0, 0], [4, 0, 0]]);
  actor.position.x = -4;
  assert.equal(weapons.tryAutoPickup(actor.position).id, 'bow');
  assert.equal(weapons.items.length, 2);
  weapons.dispose();
});

test('an unreachable second weapon cannot discard the currently held one', () => {
  let blocked = false;
  const { actor, weapons } = setup([
    { id: 'bow', kind: 'bow', position: [0, 0] },
    { id: 'sword', kind: 'sword', position: [4, 0] },
  ], { world: { traceProjectile: () => blocked ? { type: 'wall' } : null } });
  weapons.tryAutoPickup(actor.position);
  actor.position.x = 3;
  blocked = true;
  assert.equal(weapons.interact(actor.position), null);
  assert.equal(weapons.equippedItem.id, 'bow');
  assert.equal(weapons.items[0].collected, true);
  assert.equal(weapons.items[0].group.visible, false);
  assert.equal(weapons.items[1].collected, false);
  weapons.dispose();
});

test('ready/pause, rolls, fog, walls and raised floors never pull loot into the hand', () => {
  let visible = true, blocked = false;
  const { actor, weapons } = setup(undefined, { isVisible: () => visible,
    world: { traceProjectile: () => blocked ? { type: 'house' } : null } });
  actor.position.set(.6, 0, 0);
  assert.equal(weapons.tryAutoPickup(actor.position, { enabled: false }), null);
  actor.userData.rolling = true;
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  actor.userData.rolling = false; visible = false;
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  visible = true; blocked = true;
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  assert.equal(weapons.interact(actor.position), null, 'E cannot pull through walls either');
  blocked = false; actor.position.y = 3;
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  actor.position.y = 0;
  assert.equal(weapons.tryAutoPickup(actor.position).type, 'bow');
});

test('chest weapons finish their flight before automatic pickup; paused time does not land them', () => {
  const { actor, weapons } = setup([]);
  const drop = weapons.addDrop({ type: 'iceStaff', rarity: 'legendary', position: [.2, .1], origin: [0, 0] });
  weapons.update(0, 2, actor.position);
  assert.equal(drop.popAge, 0);
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  for (let i = 0; i < 7; i++) weapons.update(.1, i * .1, actor.position);
  assert.equal(weapons.tryAutoPickup(actor.position).type, 'iceStaff');
  assert.equal(weapons.equippedItem.rarity, 'legendary');
  weapons.reset();
  assert.equal(weapons.equipped, null); assert.equal(weapons.items.length, 0);
});

test('procedural weapon bodies and every pickup accent and fading halo follow the selected rarity', () => {
  const placements = [];
  for (const kind of WEAPON_TYPES) for (const rarity of Object.keys(RARITIES)) {
    placements.push({ id: `${kind}-${rarity}`, kind, rarity, position: [placements.length * 3, 0] });
  }
  const { tripoPrototypes, palettes, materials } = importedPrototypes();
  const { actor, weapons } = setup(placements, { tripoPrototypes });
  const proceduralTypesChecked = new Set();
  weapons.update(.1, 1, actor.position);
  for (const item of weapons.items) {
    const color = new THREE.Color(RARITIES[item.rarity].color);
    assert.ok(item.ringMaterial.color.equals(color), item.id);
    assert.ok(item.halo.material.color.equals(color), item.id);
    assert.equal(item.halo.material.vertexColors, true);
    const alpha = item.halo.geometry.attributes.color;
    assert.equal(alpha.itemSize, 4);
    assert.ok(alpha.getW(0) > .8);
    assert.equal(alpha.getW(alpha.count - 1), 0, 'halo has no hard outer disc');
    if (PROCEDURAL_WEAPON_TYPES.includes(item.type)) {
      proceduralTypesChecked.add(item.type);
      assert.equal(item.model, 'procedural');
      let body = 0, accents = 0;
      item.visual.traverse(part => {
        if (!part.isMesh || part.userData.elementCore) return;
        assert.ok(part.material.emissive.equals(color), `${item.id} actual model emission`);
        assert.ok(part.material.emissiveIntensity > .1);
        part.userData.tierAccent ? accents++ : body++;
      });
      assert.ok(body > 0 && accents > 0, `${item.id} glows beyond its selection ring`);
    } else {
      assert.equal(item.model, 'tripo', `${item.id} uses its real imported default`);
      const meshes = importedMeshes(item.visual);
      assert.equal(meshes.length, 2, `${item.id} keeps both source meshes`);
      for (const mesh of meshes) {
        assert.notEqual(mesh.material, materials.get(item.variant));
        assertPbrPalette(mesh.material, palettes.get(item.variant), item.id);
      }
      assert.equal(item.glowingMaterials.length, 0, `${item.id} never pulses or repaints its imported PBR material`);
    }
    assert.equal(item.visual.userData.rarityColor, RARITIES[item.rarity].color);
    assert.equal(item.glow.halo, rarityVisual(item.rarity).halo);
  }
  assert.deepEqual([...proceduralTypesChecked].sort(), [...PROCEDURAL_WEAPON_TYPES].sort());
  for (const [variant, material] of materials) assertPbrPalette(material, palettes.get(variant), `${variant} prototype`);
  weapons.dispose();
});

test('new imported staffs and ornate bow preserve textured PBR across rarity pulses and independent pickup and held instances', () => {
  for (const { kind, variant } of IMPORTED_WEAPONS) {
    const { tripoPrototypes, palettes, materials } = importedPrototypes();
    const palette = palettes.get(variant), prototypeMaterial = materials.get(variant);
    const { actor, weapons } = setup([
      { id: `${variant}-rare`, kind, variant, rarity: 'rare', position: [0, 0] },
      { id: `${variant}-legendary`, kind, variant, rarity: 'legendary', position: [5, 0] },
    ], { tripoPrototypes });
    const [rare, legendary] = weapons.items;
    const rareMeshes = importedMeshes(rare.visual), legendaryMeshes = importedMeshes(legendary.visual);
    const rareMaterial = rareMeshes[0].material, legendaryMaterial = legendaryMeshes[0].material;
    assert.equal(rareMeshes[1].material, rareMaterial, `${variant}: shared within one model`);
    assert.equal(legendaryMeshes[1].material, legendaryMaterial);
    assert.notEqual(rareMaterial, legendaryMaterial, `${variant}: separate pickup instances`);
    assert.notEqual(rareMaterial, prototypeMaterial);
    assert.notEqual(legendaryMaterial, prototypeMaterial);
    for (let frame = 0; frame < 6; frame++) {
      const time = frame * .37;
      weapons.update(.1, time, actor.position);
      for (const item of [rare, legendary]) {
        assertPbrPalette(importedMeshes(item.visual)[0].material, palette, item.id);
        const glow = rarityVisual(item.rarity), color = new THREE.Color(glow.color);
        assert.ok(item.ringMaterial.color.equals(color), `${item.id}: rarity ring`);
        assert.ok(item.halo.material.color.equals(color), `${item.id}: rarity halo`);
        const wave = Math.sin(time * 2.2 + item.phase);
        assert.ok(Math.abs(item.halo.material.opacity - glow.halo * (.9 + wave * .1)) < 1e-12);
        assert.equal(item.visual.userData.rarityColor, glow.color);
      }
      assertPbrPalette(prototypeMaterial, palette, `${variant}: immutable prototype`);
    }
    assert.equal(weapons.interact(actor.position).variant, variant);
    const held = actor.children.find(group => group.userData.variant === variant && group.visible);
    assert.ok(held, `${variant}: selected held model`);
    const heldMeshes = importedMeshes(held), heldMaterial = heldMeshes[0].material;
    assert.equal(heldMeshes[1].material, heldMaterial);
    for (const other of [rareMaterial, legendaryMaterial, prototypeMaterial]) assert.notEqual(heldMaterial, other);
    assertPbrPalette(heldMaterial, palette, `${variant}: held original PBR`);
    heldMaterial.color.set('#010203'); heldMaterial.opacity = .2;
    heldMaterial.emissive.set('#040506'); heldMaterial.emissiveIntensity = 3;
    for (const [name, material] of [['ground rare', rareMaterial], ['ground legendary', legendaryMaterial], ['prototype', prototypeMaterial]]) {
      assertPbrPalette(material, palette, `${variant}: ${name} unaffected by held material changes`);
    }
    rareMaterial.color.set('#fedcba'); rareMaterial.emissiveIntensity = 7;
    assertPbrPalette(legendaryMaterial, palette, `${variant}: second pickup unaffected by first`);
    assertPbrPalette(prototypeMaterial, palette, `${variant}: source unaffected by first pickup`);
    weapons.dispose();
  }
});

test('rarity materials stay independent and dynamic glow resources are released on reset', () => {
  const { weapons } = setup([{ id: 'base', kind: 'bow', rarity: 'common', position: [0, 0] }]);
  const drop = weapons.addDrop({ type: 'bow', rarity: 'legendary', position: [.3, .2] });
  const baseMaterial = weapons.items[0].glowingMaterials[0].material;
  const dropMaterial = drop.glowingMaterials[0].material;
  assert.notEqual(baseMaterial, dropMaterial);
  let droppedDisposed = 0, baseDisposed = 0;
  dropMaterial.addEventListener('dispose', () => droppedDisposed++);
  baseMaterial.addEventListener('dispose', () => baseDisposed++);
  weapons.reset();
  assert.equal(droppedDisposed, 1, 'shared within one model, disposed once');
  assert.equal(baseDisposed, 0);
  assert.equal(weapons.items.length, 1);
  assert.equal(weapons.items[0].rarity, 'common');
});

test('popped chest loot reveals its terrain-conforming aura after landing and releases it on reset', () => {
  const heightAt = (x, z) => .02 * x + .05 * Math.sin(x * 2) + z * .03;
  const { actor, weapons } = setup([], { world: { heightAt } });
  const drop = weapons.addDrop({ type: 'bow', rarity: 'epic', position: [6, 3], origin: [0, 0] });
  assert.equal(drop.aura.inspect().visible, false, 'the aura waits for the flying chest reward to land');
  for (let frame = 0; frame < 7; frame++) weapons.update(.1, frame * .1, actor.position);
  assert.equal(drop.aura.inspect().visible, true, 'the completed .65-second pop must reveal its aura');
  assert.deepEqual(drop.group.position.toArray(), [6, heightAt(6, 3), 3]);
  const ground = drop.aura.group.getObjectByName('Beute – Licht auf dem Boden');
  const vertices = ground.geometry.attributes.position, point = new THREE.Vector3();
  ground.updateWorldMatrix(true, false);
  for (let i = 0; i < vertices.count; i++) {
    point.fromBufferAttribute(vertices, i).applyMatrix4(ground.matrixWorld);
    const clearance = point.y - heightAt(point.x, point.z);
    assert.ok(clearance > .02 && clearance < .10, 'landed aura follows the destination terrain');
  }
  weapons.reset();
  assert.equal(drop.aura.inspect().visible, false);
  assert.equal(drop.group.parent, null);
  weapons.dispose();
});


test('translucent fog can reveal scenery without enabling pickup or chest interaction', () => {
  let visible = false;
  const options = { isVisible: () => visible, revealSceneryThroughFog: true };
  const { actor, scene, weapons } = setup(undefined, options);
  const chests = createChests(scene, { ...options, placements: [{ id: 'chest', kind: 'chest', position: [.5, 0] }] });
  const pickups = createPickups(scene, { ...options, placements: [{ id: 'heart', kind: 'heart', position: [.5, 0] }] });
  let collected = 0;
  weapons.update(.1, 0, actor.position); chests.update(.1, 0, actor.position);
  pickups.update(.1, 0, actor.position, { health: 50, onCollect: () => collected++ });
  assert.equal(weapons.items[0].group.visible, true);
  assert.equal(chests.items[0].group.visible, true);
  assert.equal(pickups.items[0].group.visible, true);
  assert.equal(weapons.tryAutoPickup(actor.position), null);
  assert.equal(chests.interact(actor.position), null);
  assert.equal(collected, 0);
  visible = true;
  assert.equal(weapons.tryAutoPickup(actor.position).type, 'bow');
  assert.equal(chests.interact(actor.position).type, 'chest');
  pickups.update(.1, .1, actor.position, { health: 50, onCollect: () => collected++ });
  assert.equal(collected, 1);
});
