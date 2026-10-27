import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectEraserStroke, objectEraserTargets } from '../src/map/object-eraser.js';

const item = (id, kind, x, z, extra = {}) => ({ id, kind, position: [x, z], scale: 1, ...extra });
const fixture = { island: { points: [[-100, -100], [100, -100], [100, 100], [-100, 100]] },
  regions: [{ id: 'region', points: [[-10, -10], [10, -10], [0, 10]] }],
  objects: [item('tree', 'tree', -8, 0), item('grass', 'grass', 0, 1), item('house', 'house', 8, 0),
    item('outside', 'flower', 0, 4), item('wide', 'house', 30, 0, { scale: 3 })] };

test('eraser sweeps fast pointer movement without skipping objects or changing the input map', () => {
  const before = structuredClone(fixture);
  const fast = createObjectEraserStroke(fixture, { radius: 2 });
  fast.sample([-12, 0]); fast.sample([12, 0]);
  const slow = createObjectEraserStroke(fixture, { radius: 2 });
  for (let x = -12; x <= 12; x++) slow.sample([x, 0]);
  assert.deepEqual([...fast.removedIds], [...slow.removedIds]);
  assert.deepEqual([...fast.removedIds], ['tree', 'grass', 'house']);
  assert.deepEqual(fixture, before);
  assert.equal(fast.sample([-12, 0]).length, 0, 'repeated coverage does not duplicate removals');
});

test('grass-only eraser preserves other objects and all non-object map geometry', () => {
  const stroke = createObjectEraserStroke(fixture, { radius: 2, filter: 'grass' });
  stroke.sample([-12, 0]); stroke.sample([12, 0]);
  assert.deepEqual([...stroke.removedIds], ['grass']);
  assert.equal(fixture.regions.length, 1);
  assert.equal(fixture.objects.length, 5);
});

test('hover preview and removal use the same centre rule, ignoring a large outer footprint', () => {
  assert.deepEqual(objectEraserTargets(fixture, [12, 0], { radius: 2 }), []);
  assert.deepEqual(objectEraserTargets(fixture, [30, 0], { radius: .5 }).map(o => o.id), ['wide']);
  assert.deepEqual(objectEraserTargets(fixture, [8, 0], { radius: 2, filter: 'grass' }), []);
  assert.deepEqual(objectEraserTargets(fixture, [0, 1], { radius: .5 }).map(o => o.id), ['grass']);
});

test('invalid eraser input never touches the map or corrupts the next swept segment', () => {
  for (const radius of [-1, 0, 25, NaN, Infinity]) assert.throws(() => createObjectEraserStroke(fixture, { radius }));
  assert.throws(() => createObjectEraserStroke(fixture, { filter: 'houses' }));
  const stroke = createObjectEraserStroke(fixture, { radius: 2 });
  stroke.sample([-12, 0]);
  assert.deepEqual(stroke.sample([NaN, 0]), []);
  assert.deepEqual(stroke.sample([0]), []);
  stroke.sample([12, 0]);
  assert.deepEqual([...stroke.removedIds], ['tree', 'grass', 'house']);
});
