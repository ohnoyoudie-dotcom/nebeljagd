import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionIndex } from '../src/collision.js';

test('walls block inward motion while preserving tangential sliding', () => {
  const grid = createCollisionIndex([], [{ minX: 0, maxX: .3, minZ: -5, maxZ: 5 }]);
  const p = { x: -.5, z: -2 };
  for (let step = 0; step < 30; step++) {
    p.x += .1; p.z += .1; grid.resolve(p, .42);
    assert.ok(p.x <= -.42 + 1e-6);
  }
  assert.ok(p.z > .9, 'player slides along the wall');
});

test('wide doorway remains traversable; adjacent front walls remain solid', () => {
  const grid = createCollisionIndex([], [
    { minX: -8, maxX: -1.45, minZ: 6.82, maxZ: 7.18 },
    { minX: 1.45, maxX: 8, minZ: 6.82, maxZ: 7.18 },
  ]);
  const p = { x: 0, z: 9 }, blocked = { x: 4, z: 9 };
  for (let i = 0; i < 35; i++) {
    p.z -= .14; blocked.z -= .14;
    grid.resolve(p, .42); grid.resolve(blocked, .42);
  }
  assert.ok(p.z < 5, 'actual player diameter fits the entrance');
  assert.ok(blocked.z >= 7.6 - 1e-6);
});

test('spatial grid resolves touching circles across cell boundaries', () => {
  const grid = createCollisionIndex([{ x: 4.05, z: 0, radius: .5 }], []);
  const p = { x: 3.8, z: .1 };
  grid.resolve(p, .42);
  assert.ok(Math.hypot(p.x - 4.05, p.z) >= .92 - 1e-6);
  assert.equal(grid.size, 1);
});
