import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createChests } from '../src/chests.js';
import { createPickups } from '../src/pickups.js';
import { RARITIES, WEAPON_TYPES, rarityVisual } from '../src/loot-tiers.js';

function setup(placements = [{ id: 'bow', kind: 'bow', rarity: 'common', position: [0, 0] }], options = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const world = { heightAt: () => 0, traceProjectile: () => null, ...options.world };
  return { scene, actor, weapons: createWeapons(scene, actor, world, null, { placements, ...options }) };
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

test('every weapon uses the same rarity hue on its actual body, accents and fading halo', () => {
  const placements = [];
  for (const kind of WEAPON_TYPES) for (const rarity of Object.keys(RARITIES)) {
    placements.push({ id: `${kind}-${rarity}`, kind, rarity, position: [placements.length * 3, 0] });
  }
  const { actor, weapons } = setup(placements);
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
    let body = 0, accents = 0;
    item.visual.traverse(part => {
      if (!part.isMesh || part.userData.elementCore) return;
      assert.ok(part.material.emissive.equals(color), `${item.id} actual model emission`);
      assert.ok(part.material.emissiveIntensity > .1);
      part.userData.tierAccent ? accents++ : body++;
    });
    assert.ok(body > 0 && accents > 0, `${item.id} glows beyond its selection ring`);
    assert.equal(item.visual.userData.rarityColor, RARITIES[item.rarity].color);
    assert.equal(item.glow.halo, rarityVisual(item.rarity).halo);
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
