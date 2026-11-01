import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBJECT_CATALOG, isObjectPlaceable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { BARRIER_STYLES, makeBarrier } from '../src/map/barriers.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { validateWorldmap } from '../src/map/model.js';

test('explicit cleanup removes every disallowed placement and preserves current Tripo models and drawn routes', () => {
  const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
  const objects = OBJECT_CATALOG.flatMap(item => item.variants.map(variant => makeWorldObject(item.kind, [30, -42], {
    id: `${item.kind}-${variant.id}`, variant: variant.id, name: `Custom ${variant.id}`, scale: 1.3, rotation: .4,
  })));
  const barriers = BARRIER_STYLES.map(style => makeBarrier(style.id, [[-30, 20], [30, 20]], {
    id: `route-${style.id}`, height: 2.5, gaps: [{ at: 20, width: 3 }],
  }));
  const map = { ...base, objects, barriers };
  const before = structuredClone(map), result = removeNonTripoObjects(map);
  assert.deepEqual(map, before, 'input stays intact for Undo');
  assert.deepEqual(normalizeWorldmap(map), before, 'import never silently discards old objects');
  assert.deepEqual(result.map.objects, objects.filter(object => isObjectPlaceable(object.kind, object.variant)));
  assert.equal(result.map.objects.length, 12);
  assert.deepEqual(result.map.barriers, barriers.filter(barrier => barrier.variant !== 'kit-wood'));
  assert.equal(result.map.barriers.length, 4);
  const { objects: ignoredObjects, barriers: ignoredBarriers, ...rest } = result.map;
  const { objects: previousObjects, barriers: previousBarriers, ...previousRest } = before;
  assert.deepEqual(rest, previousRest, 'terrain, regions, paths, starts and metadata are unchanged');
  assert.deepEqual(validateWorldmap(result.map).errors, []);
  assert.equal(removeNonTripoObjects(result.map).map, result.map, 'repeat is a no-op');
});

test('shipped map is already clean and missing optional collections are not invented', () => {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
  assert.equal(removeNonTripoObjects(map).totalRemoved, 0);
  const empty = { name: 'Empty draft' };
  assert.equal(removeNonTripoObjects(empty).map, empty);
});
