import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPickups } from '../src/pickups.js';
import { createWeapons } from '../src/weapons.js';

const objects = [
  { id: 'map-heart', name: 'Bergherz', kind: 'heart', variant: 'healing', position: [210, -240], rotation: .6, scale: 1.5 },
  { id: 'map-crystal', name: 'Kristall', kind: 'crystal', variant: 'forest', position: [205, -240], rotation: -.8, scale: .8 },
  { id: 'map-bow', name: 'Bogen', kind: 'bow', variant: 'wood', position: [220, -240], rotation: .4, scale: 1.2 },
  { id: 'map-sword', name: 'Schwert', kind: 'sword', variant: 'steel', position: [225, -240], rotation: 1.1, scale: .9 },
  { id: 'map-tree', name: 'Baum', kind: 'tree', variant: 'oak', position: [230, -240], rotation: 0, scale: 1 },
];
const heightAt = (x, z) => 12 + x * .01 - z * .005;

test('map loot is authoritative, preserves placement transforms and never adds legacy loot', () => {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const snapshot = JSON.stringify(objects);
  const pickups = createPickups(scene, { placements: objects, heightAt });
  const weapons = createWeapons(scene, actor, { worldRadius: 900, heightAt }, null, { placements: objects, heightAt });
  assert.deepEqual(pickups.items.map(item => item.id), ['map-heart'], 'legacy diamonds no longer spawn as currency');
  assert.deepEqual(weapons.items.map(item => item.id), ['map-bow', 'map-sword']);
  for (const item of [...pickups.items, ...weapons.items]) {
    const source = objects.find(object => object.id === item.id);
    assert.deepEqual(item.group.position.toArray(), [source.position[0], heightAt(...source.position), source.position[1]]);
    assert.equal(item.group.rotation.y, source.rotation);
    assert.equal(item.group.scale.x, source.scale);
    assert.equal(item.group.userData.worldObjectId, source.id);
  }
  assert.equal(JSON.stringify(objects), snapshot, 'runtime animation must not mutate editable map data');

  const emptyPickups = createPickups(new THREE.Scene(), { placements: [], heightAt });
  const emptyWeapons = createWeapons(new THREE.Scene(), new THREE.Group(), { heightAt }, null, { placements: [] });
  assert.equal(emptyPickups.items.length, 0);
  assert.equal(emptyWeapons.items.length, 0);
});

test('map hearts collect on their edited coordinates, respect full health and pause, then reset', () => {
  const pickups = createPickups(new THREE.Scene(), { placements: objects, heightAt });
  const position = new THREE.Vector3(210, heightAt(210, -240), -240);
  const collected = [];
  pickups.update(.016, 0, position, { health: 100, maxHealth: 100, onCollect: event => collected.push(event) });
  assert.equal(pickups.items[0].collected, false, 'full health leaves the heart on the map');
  pickups.update(.016, .016, position, { health: 90, canCollect: false, onCollect: event => collected.push(event) });
  assert.equal(pickups.items[0].collected, false, 'paused or ready view cannot collect');
  pickups.update(.016, .032, position, { health: 90, maxHealth: 100, onCollect: event => collected.push(event) });
  assert.deepEqual(collected, [{ id: 'map-heart', type: 'heart', amount: 10 }]);
  assert.equal(pickups.items[0].group.visible, false);
  assert.equal(pickups.collectedCount, 1);
  const particles = pickups.items[0].group.parent.children.find(child => child.isPoints);
  assert.ok(particles.geometry.attributes.position.getY(0) > heightAt(210, -240), 'collection particles originate above the actual hill');
  pickups.reset();
  assert.equal(pickups.collectedCount, 0);
  assert.equal(pickups.items[0].collected, false);
});

test('map weapon pickup uses edited world coordinates and nearby visibility preserves its state', () => {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const weapons = createWeapons(scene, actor, { worldRadius: 900, heightAt }, null, { placements: objects, heightAt });
  const bowPosition = new THREE.Vector3(220, heightAt(220, -240), -240);
  assert.equal(weapons.nearest(new THREE.Vector3(-4, 0, 11)), null, 'old bow position is no longer loot');
  weapons.update(.016, 0, new THREE.Vector3(0, 0, 0));
  assert.ok(weapons.items.every(item => !item.group.visible));
  assert.ok(weapons.items.every(item => !item.collected), 'distance culling must not consume loot');
  weapons.update(.016, .016, bowPosition);
  assert.ok(weapons.items.every(item => item.group.visible));
  assert.equal(weapons.interact(bowPosition).type, 'bow');
  assert.equal(weapons.items[0].collected, true);
  assert.equal(weapons.equipped, 'bow');
  weapons.update(.016, .032, bowPosition);
  assert.equal(weapons.items[0].group.visible, false, 'animation does not resurrect collected weapons');
  weapons.reset();
  assert.equal(weapons.equipped, null);
  assert.equal(weapons.items[0].collected, false);
});

test('ready/pause visibility can use the real viewer without proximity collection', () => {
  const pickups = createPickups(new THREE.Scene(), { placements: objects, heightAt });
  const viewer = new THREE.Vector3(210, 0, -240);
  pickups.update(.016, 0, new THREE.Vector3(1000, 0, 1000), { viewerPosition: viewer });
  assert.ok(pickups.items.every(item => item.group.visible));
  assert.ok(pickups.items.every(item => !item.collected));
  pickups.update(.016, .016, new THREE.Vector3(1000, 0, 1000));
  assert.ok(pickups.items.every(item => !item.group.visible));
  pickups.update(.016, .032, viewer, { canCollect: false, health: 70 });
  assert.ok(pickups.items.every(item => item.group.visible));
  assert.ok(pickups.items.every(item => !item.collected));
});
