import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrassBrushStroke, canPaintGrass, MAX_WORLD_OBJECTS } from '../src/map/grass-brush.js';

const island = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
const map = objects => ({ island: { points: island }, objects });
const positions = stroke => stroke.objects.map(object => object.position);

test('grass brush interpolates long pointer jumps independently of event density', () => {
  const single = createGrassBrushStroke(map([]), { radius: 4 });
  single.sample([-40, 0]); single.sample([40, 0]);
  const detailed = createGrassBrushStroke(map([]), { radius: 4 });
  for (let x = -40; x <= 40; x++) detailed.sample([x, 0]);
  assert.deepEqual(positions(single), positions(detailed));
  assert.ok(single.objects.length >= 18 && single.objects.length <= 21);
  for (const object of single.objects) {
    assert.equal(object.kind, 'grass'); assert.equal(object.variant, 'tall');
    assert.equal(object.radius, 4); assert.equal(object.scale, 1);
  }
  assert.equal(new Set(single.objects.map(o => o.id)).size, single.objects.length);
});

test('brush avoids density build-up when retracing existing tall grass, but can paint over short grass', () => {
  const base = map([{ kind: 'grass', variant: 'short', position: [0, 0], radius: 4, scale: 1 }]);
  const stroke = createGrassBrushStroke(base, { radius: 4 });
  stroke.sample([0, 0]); stroke.sample([30, 0]);
  const count = stroke.objects.length;
  for (let i = 0; i < 6; i++) { stroke.sample([0, 0]); stroke.sample([30, 0]); }
  assert.equal(stroke.objects.length, count);
  const next = createGrassBrushStroke(map([...base.objects, ...stroke.objects]), { radius: 4 });
  next.sample([0, 0]); next.sample([30, 0]);
  assert.equal(next.objects.length, 0);
  assert.equal(base.objects.length, 1, 'stroke sampling never mutates caller document');
});

test('whole brush footprint stays on land, including concave coastline edges', () => {
  assert.equal(canPaintGrass([99, 0], island, 4), false);
  assert.equal(canPaintGrass([80, 0], island, 4), true);
  assert.equal(canPaintGrass([101, 0], island, 4), false);
  const concave = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]];
  assert.equal(canPaintGrass([8, 8], concave, 4), false);
  const stroke = createGrassBrushStroke(map([]), { radius: 4 });
  stroke.sample([-150, 0]); stroke.sample([150, 0]);
  assert.ok(stroke.objects.length > 0);
  assert.ok(stroke.objects.every(item => Math.abs(item.position[0]) <= 96));
});

test('capacity limit and invalid inputs cannot create oversized or broken maps', () => {
  const existing = Array.from({ length: MAX_WORLD_OBJECTS - 2 }, (_, index) => ({ id: `item-${index}`, kind: 'rock' }));
  const stroke = createGrassBrushStroke(map(existing), { radius: 2 });
  stroke.sample([0, 0]); stroke.sample([50, 0]);
  assert.equal(stroke.objects.length, 2); assert.equal(stroke.full, true);
  assert.equal(existing.length, MAX_WORLD_OBJECTS - 2);
  assert.equal(stroke.sample([NaN, 1]).length, 0);
  assert.throws(() => createGrassBrushStroke(map([]), { radius: .1 }));
  assert.throws(() => createGrassBrushStroke(map([]), { radius: Infinity }));
});
