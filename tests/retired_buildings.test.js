import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { removeRetiredBuildings, isRetiredBuilding } from '../src/map/retired-buildings.js';
import { validateWorldmap } from '../src/map/model.js';

const object = (id, kind, variant, position = [10, -10]) => ({
  id, name: id, kind, variant, position, scale: 1, rotation: .4,
});

test('old-building cleanup preserves the Tripo inn, its loot and unrelated draft edits', () => {
  const map = {
    name: 'Mein weitergebauter Entwurf',
    landscape: { version: 1, wind: { strength: .7 } },
    paths: [{ id: 'my-path', points: [[0, 0], [5, 5]] }],
    objects: [
      object('obj-house-old', 'house', 'herbal'),
      object('my-old-tavern', 'house', 'kit-taverne'),
      object('chest-obj-house-old', 'chest', 'wood'),
      object('chest-my-old-tavern', 'chest', 'wood'),
      object('obj-house-new', 'house', 'kit-tripo-tavern'),
      object('chest-obj-house-new', 'chest', 'wood'),
      object('my-loot', 'chest', 'wood'),
      object('my-tree', 'tree', 'oak'),
      object('next-building', 'house', 'future-tripo-model'),
      object('flower-at-old-house', 'flower', 'rei-white'),
    ],
  };
  const before = structuredClone(map), result = removeRetiredBuildings(map);
  assert.deepEqual(map, before, 'The unsaved source draft remains unchanged');
  assert.equal(result.removedBuildings.length, 2);
  assert.equal(result.removedDependents.length, 2);
  assert.equal(result.totalRemoved, 4);
  assert.deepEqual(result.map, { ...before, objects: before.objects.slice(4) });
  assert.equal(removeRetiredBuildings(result.map).map, result.map, 'Cleanup is idempotent');
});

test('cleanup removes only unambiguously orphaned generated house stock chests', () => {
  const items = [
    object('chest-obj-house-auenwacht-03', 'chest', 'wood'),
    object('chest-unknown-custom-house', 'chest', 'wood'),
    object('chest-obj-house-new', 'chest', 'wood'),
    object('obj-house-new', 'house', 'kit-tripo-tavern'),
    object('chest-obj-house-not-loot', 'rock', 'granite'),
  ];
  const result = removeRetiredBuildings({ objects: items });
  assert.equal(result.removedBuildings.length, 0);
  assert.deepEqual(result.removedDependents.map(item => item.id), ['chest-obj-house-auenwacht-03']);
  assert.deepEqual(result.map.objects, items.slice(1));
});

test('default project map contains no retired buildings or their stock chests', () => {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
  assert.equal(map.objects.some(isRetiredBuilding), false);
  assert.equal(removeRetiredBuildings(map).totalRemoved, 0);
  assert.equal(validateWorldmap(map).valid, true);
});

test('legacy buildings remain valid when explicitly imported for recovery', () => {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
  map.objects = [object('old-import-house', 'house', 'herbal', [30, -60])];
  assert.equal(validateWorldmap(map).valid, true);
  assert.equal(isRetiredBuilding(map.objects[0]), true);
});
