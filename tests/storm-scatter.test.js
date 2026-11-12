import test from 'node:test';
import assert from 'node:assert/strict';
import { createStormScatter } from '../src/storm-scatter.js';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('storm landings cover the disk with independent angles instead of a rotating ring', () => {
  const radius = 4.8, points = createStormScatter(radius, 2048, seeded(734));
  const quadrants = [0, 0, 0, 0]; let central = 0, outer = 0, angularCorrelation = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], distance = Math.hypot(p.x, p.z);
    assert.ok(Number.isFinite(distance) && distance <= radius && distance > 0);
    quadrants[(p.x >= 0 ? 1 : 0) + (p.z >= 0 ? 2 : 0)]++;
    if (distance < radius * .5) central++;
    if (distance > radius * .7) outer++;
    if (i) {
      const previous = points[i - 1];
      angularCorrelation += (p.x * previous.x + p.z * previous.z) / (distance * Math.hypot(previous.x, previous.z));
    }
  }
  for (const count of quadrants) assert.ok(count > 400 && count < 650);
  assert.ok(central > 450 && central < 700, 'landings include the center, not only an annulus');
  assert.ok(outer > 750, 'landings also reach the outer area');
  assert.ok(Math.abs(angularCorrelation / (points.length - 1)) < .08, 'successive angles must not follow a fixed step');
});

test('successive casts use fresh samples while an injected seed can reproduce a cast', () => {
  const random = seeded(91), first = createStormScatter(4.8, 25, random), second = createStormScatter(4.8, 25, random);
  assert.notDeepEqual(first, second);
  assert.deepEqual(first, createStormScatter(4.8, 25, seeded(91)));
  assert.equal(new Set(first.map(p => `${p.x},${p.z}`)).size, 25);
});
