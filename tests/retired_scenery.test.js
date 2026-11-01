import test from 'node:test';
import assert from 'node:assert/strict';
import { removeRetiredScenery, isRetiredScenery } from '../src/map/retired-scenery.js';
import { AUTHORING_OBJECT_CATALOG, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { readFileSync } from 'node:fs';
import { validateWorldmap } from '../src/map/model.js';
import { AUTHORING_BARRIER_STYLES, makeBarrier } from '../src/map/barriers.js';

const obj = (kind, variant, id = `${kind}-${variant}`) => makeWorldObject(kind, [30, -42], { id, variant });

test('scenery cleanup removes all retired variants while preserving every loot kind and unrelated edits', () => {
  const keep = [obj('heart', 'healing'), obj('chest', 'wood'), obj('chest', 'kit-tripo-chest'),
    obj('bow', 'wood'), obj('sword', 'steel'), obj('fireStaff', 'ember'), obj('iceStaff', 'frost'),
    obj('house', 'kit-tripo-tavern'), obj('wagon', 'kit-tripo-wagon'), obj('barrel', 'kit-tripo-barrel'),
    obj('well', 'kit-tripo-well'), obj('grass', 'tall'), obj('bush', 'rei-bush'),
    obj('rock', 'kit-tripo-01'), obj('rock', 'kit-tripo-02'), obj('rock', 'kit-tripo-03')];
  const removed = [obj('tree', 'oak'), obj('tree', 'rei-tree01'), obj('rock', 'granite'),
    obj('rock', 'basalt'), obj('rock', 'kit-cluster'), obj('rock', 'kit-single'),
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

test('retired shrine, ruins, GLB crates and fence routes are removed without altering newer fences or walls', () => {
  const old = [obj('shrine', 'magic'), obj('ruin', 'stone'), obj('ruin', 'kit-arch'), obj('crate', 'kit-wood'), obj('fence', 'kit-wood')];
  const keep = [obj('fence', 'kit-cross-wood'), obj('wall', 'kit-tripo-wall'), obj('chest', 'kit-tripo-chest'), obj('barrel', 'kit-tripo-barrel')];
  const oldRoute = makeBarrier('fence', [[-20, 0], [20, 0]], { id: 'retired-route', height: 3 });
  const currentRoute = makeBarrier('fence-cross-wood', [[-20, 10], [20, 10]], { id: 'current-route', height: 2, gaps: [{ at: 20, width: 3 }] });
  const map = { name: 'Persönliche Karte', objects: [...old, ...keep], barriers: [oldRoute, currentRoute], landscape: { version: 1 } };
  const before = structuredClone(map), result = removeRetiredScenery(map);
  assert.deepEqual(map, before, 'the unsaved draft is not mutated');
  assert.deepEqual(result.map, { ...before, objects: keep, barriers: [currentRoute] });
  assert.deepEqual(result.removedObjects, old);
  assert.deepEqual(result.removedBarriers, [oldRoute]);
  assert.equal(result.totalRemoved, 6);
  assert.equal(removeRetiredScenery(result.map).map, result.map);
  assert.equal(AUTHORING_BARRIER_STYLES.some(style => style.variant === 'kit-wood'), false);
  assert.equal(AUTHORING_BARRIER_STYLES.some(style => style.variant === 'kit-cross-wood'), true);
  assert.deepEqual(normalizeWorldmap(map), before, 'legacy import remains recoverable until explicit cleanup');
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

test('retired scenery is absent from the authoring palette while authored maps and legacy imports remain valid', () => {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
  assert.equal(AUTHORING_OBJECT_CATALOG.some(isRetiredScenery), false);
  assert.deepEqual(normalizeWorldmap(map), map, 'loading the map never silently removes later user placements');
  const clean = { ...map, objects: [obj('grass', 'tall'), obj('chest', 'kit-tripo-chest'), obj('house', 'kit-tripo-tavern')] };
  assert.equal(removeRetiredScenery(clean).totalChanged, 0);
  const legacy = { ...map, objects: [obj('tree', 'oak'), obj('rock', 'granite'), obj('flower', 'rei-white'), obj('mound', 'ridge')] };
  assert.deepEqual(validateWorldmap(legacy).errors, []);
  assert.deepEqual(normalizeWorldmap(legacy), legacy, 'import is preserved until explicit cleanup');
  assert.deepEqual(removeRetiredScenery(legacy).removedObjects, legacy.objects);
});
