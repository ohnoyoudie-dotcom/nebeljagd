import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChests, chestLoot, chestDropPosition } from '../src/chests.js';
import { createPickups } from '../src/pickups.js';

const placement = { id: 'test-chest', name: 'Testtruhe', kind: 'chest', variant: 'wood', position: [10, 20], scale: 1, rotation: .7 };
const ground = () => 12;
const opener = new THREE.Vector3(10, 12, 22);
const openWorld = { heightAt: ground, isLand: () => true, isWater: () => false, traceProjectile: () => null };

test('a chest opens once, animates its hinge and releases deterministic gold plus a weapon', () => {
  const drops = [];
  const scene = new THREE.Scene();
  const chests = createChests(scene, { placements: [placement], heightAt: ground, world: openWorld,
    onDrop: (item, options) => drops.push({ item, options }) });
  assert.equal(chests.nearest(new THREE.Vector3(10, 12, 24)), null);
  assert.equal(chests.nearest(opener).id, placement.id);
  assert.equal(chests.interact(opener).type, 'chest');
  assert.equal(chests.interact(opener), null, 'opened chest cannot be farmed');
  chests.update(.1, .1, opener);
  assert.equal(drops.length, 0, 'loot waits until the lid starts opening');
  assert.ok(chests.items[0].lid.rotation.x < 0);
  chests.update(.2, .3, opener);
  assert.equal(drops.length, 3);
  assert.equal(drops.filter(drop => drop.item.type === 'gold').length, 2);
  assert.ok(drops.find(drop => drop.item.rarity));
  for (const drop of drops) {
    assert.deepEqual(drop.item.origin, placement.position);
    assert.equal(drop.options.pop, true);
    assert.ok(Math.hypot(drop.item.position[0] - placement.position[0], drop.item.position[1] - placement.position[1]) < 2);
  }
  chests.update(10, 10.3, opener);
  assert.equal(drops.length, 3, 'animation cannot release another reward');
  assert.equal(chests.openedCount, 1);
  chests.reset();
  assert.equal(chests.items[0].lid.rotation.x, 0);
  chests.interact(opener); chests.update(.3, .3, opener);
  assert.deepEqual(drops.slice(3), drops.slice(0, 3), 'new round restores the same chest rewards');
  chests.dispose(); assert.equal(scene.children.length, 0);
});

test('hidden or wall-separated chests cannot be opened even within interaction range', () => {
  const hidden = createChests(new THREE.Scene(), { placements: [placement], heightAt: ground, isVisible: () => false });
  assert.equal(hidden.nearest(opener), null); assert.equal(hidden.interact(opener), null);
  hidden.update(0, 0, opener); assert.equal(hidden.items[0].group.visible, false);
  const blocked = createChests(new THREE.Scene(), { placements: [placement], heightAt: ground,
    world: { ...openWorld, traceProjectile: () => ({ type: 'wall' }) } });
  assert.equal(blocked.interact(opener), null);
  assert.equal(blocked.openedCount, 0);
});

test('gold flies out before it can be collected and resets without leaving duplicate loot', () => {
  const scene = new THREE.Scene(), collected = [];
  const pickups = createPickups(scene, { placements: [], heightAt: ground, world: openWorld });
  const gold = pickups.addDrop({ id: 'coins', type: 'gold', amount: 17, position: [10, 22], origin: [10, 20] }, { pop: true });
  assert.equal(gold.visual.geometry.type, 'CylinderGeometry', 'gold uses coins, not diamond geometry');
  pickups.update(.25, .25, opener, { onCollect: item => collected.push(item) });
  assert.equal(collected.length, 0);
  assert.ok(gold.group.position.y > 12, 'coins rise above the chest');
  pickups.update(.4, .65, opener, { onCollect: item => collected.push(item) });
  assert.deepEqual(collected, [{ id: 'coins', type: 'gold', amount: 17 }]);
  assert.equal(gold.group.visible, false);
  pickups.update(1, 1.65, opener, { onCollect: item => collected.push(item) });
  assert.equal(collected.length, 1);
  const another = pickups.addDrop({ type: 'gold', amount: 3, position: [30, 20] }, { pop: false });
  assert.equal(gold.ring.material, another.ring.material);
  assert.equal(gold.halo.material, another.halo.material);
  assert.equal(gold.visual.geometry, another.visual.geometry);
  let sharedDisposals = 0;
  for (const resource of [gold.ring.material, gold.halo.material, gold.visual.geometry]) {
    resource.addEventListener('dispose', () => sharedDisposals++);
  }
  pickups.reset(); assert.equal(pickups.items.length, 0); assert.equal(gold.group.parent, null);
  assert.equal(another.group.parent, null);
  assert.equal(sharedDisposals, 0, 'reset preserves pooled GPU resources for future chest drops');
});

test('coins cannot be collected through fog, walls or while paused', () => {
  let blocked = true, visible = false;
  const pickups = createPickups(new THREE.Scene(), { placements: [], heightAt: ground,
    isVisible: () => visible, world: { ...openWorld, traceProjectile: () => blocked ? {} : null } });
  const gold = pickups.addDrop({ type: 'gold', amount: 9, position: [10, 22] }, { pop: false });
  pickups.update(.1, .1, opener); assert.equal(gold.collected, false); assert.equal(gold.group.visible, false);
  visible = true; pickups.update(.1, .2, opener); assert.equal(gold.collected, false);
  blocked = false; pickups.update(.1, .3, opener, { canCollect: false }); assert.equal(gold.collected, false);
  pickups.update(.1, .4, opener); assert.equal(gold.collected, true);
});

test('drop placement avoids water and walls and chest loot spans all weapon families and tiers', () => {
  const world = { ...openWorld, isWater: (x) => x < 10, traceProjectile: (start, end) => end.z > 21.3 ? {} : null };
  for (let index = 0; index < 3; index++) {
    const point = chestDropPosition({ x: 10, z: 20 }, opener, world, index);
    assert.ok(point[0] >= 10); assert.ok(point[1] <= 21.3);
  }
  const weapons = new Set(), tiers = new Set();
  for (let index = 0; index < 40; index++) {
    const loot = chestLoot(`chest-${index}`, index);
    assert.deepEqual(loot, chestLoot(`chest-${index}`, index));
    weapons.add(loot[2].type); tiers.add(loot[2].rarity);
    assert.ok(loot[0].amount + loot[1].amount > 10);
  }
  assert.equal(weapons.size, 4); assert.equal(tiers.size, 5);
});
