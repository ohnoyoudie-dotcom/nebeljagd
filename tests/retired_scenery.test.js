import test from 'node:test';
import assert from 'node:assert/strict';
import { removeRetiredScenery, isRetiredScenery } from '../src/map/retired-scenery.js';
import { AUTHORING_OBJECT_CATALOG, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { readFileSync } from 'node:fs';
import { validateWorldmap } from '../src/map/model.js';

const obj = (kind, variant, id = `${kind}-${variant}`) => makeWorldObject(kind, [30, -42], { id, variant });

test('scenery cleanup removes all retired variants while preserving every loot kind and unrelated edits', () => {
  const keep = [obj('heart', 'healing'), obj('chest', 'wood'), obj('chest', 'kit-tripo-chest'),
    obj('bow', 'wood'), obj('sword', 'steel'), obj('fireStaff', 'ember'), obj('iceStaff', 'frost'),
    obj('house', 'kit-tripo-tavern'), obj('wagon', 'kit-tripo-wagon'), obj('barrel', 'kit-tripo-barrel'),
    obj('well', 'kit-tripo-well'), obj('grass', 'tall'), obj('bush', 'rei-bush')];
  const removed = [obj('tree', 'oak'), obj('tree', 'rei-tree01'), obj('rock', 'granite'),
    obj('rock', 'kit-tripo-01'), obj('rock', 'kit-tripo-02'), obj('rock', 'kit-tripo-03'),
    obj('mound', 'ridge'), obj('mound', 'knoll'), obj('flower', 'rei-red')];
  const map = { name: 'Mein Entwurf', objects: [...keep, ...removed],
    paths: [{ id: 'my-path', points: [[0, 0], [3, 2]] }], landscape: { version: 1, wind: { strength: .7 } } };
  const before = structuredClone(map), result = removeRetiredScenery(map);
  assert.deepEqual(map, before, 'cleanup never mutates the unsaved draft');
  assert.deepEqual(result.removedObjects, removed);
  assert.deepEqual(result.map, { ...before, objects: keep });
  assert.equal(result.totalChanged, removed.length);
  assert.equal(removeRetiredScenery(result.map).map, result.map, 'repeat is a no-op');
});

test('legacy flower-meadow grass becomes ordinary meadow with all authored parameters preserved', () => {
  const grass = obj('grass', 'short');
  grass.vegetation = { type: 'flowers', height: 1.8, density: .6, color: '#567856', seed: 99 };
  const map = { objects: [grass] }, result = removeRetiredScenery(map);
  assert.equal(result.totalRemoved, 0);
  assert.equal(result.totalChanged, 1);
  assert.deepEqual(result.map.objects, [{ ...grass, vegetation: { ...grass.vegetation, type: 'meadow' } }]);
  assert.equal(grass.vegetation.type, 'flowers');
});

test('retired scenery is absent from the default map and authoring palette but legacy imports remain valid', () => {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
  assert.equal(map.objects.some(isRetiredScenery), false);
  assert.equal(AUTHORING_OBJECT_CATALOG.some(isRetiredScenery), false);
  assert.equal(removeRetiredScenery(map).totalChanged, 0);
  const legacy = { ...map, objects: [obj('tree', 'oak'), obj('rock', 'kit-tripo-03'), obj('flower', 'rei-white'), obj('mound', 'ridge')] };
  assert.deepEqual(validateWorldmap(legacy).errors, []);
  assert.deepEqual(normalizeWorldmap(legacy), legacy, 'import is preserved until explicit cleanup');
});
