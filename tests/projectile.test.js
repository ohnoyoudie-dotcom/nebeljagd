import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionIndex } from '../src/collision.js';

const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const point = (x, z, y = 1.2) => ({ x, y, z });

test('fast projectiles sweep a thin wall across several grid cells without tunnelling', () => {
  const wall = { minX: 12, maxX: 12.08, minZ: -2, maxZ: 2, minY: 0, maxY: 3, type: 'house' };
  const grid = createCollisionIndex([], [wall]);
  const hit = grid.traceSegment(point(-20, 0), point(30, 0));
  assert.equal(hit.type, 'house'); assert.equal(hit.collider, wall);
  close(hit.point.x, 11.94); close(hit.t, (11.94 + 20) / 50);
  assert.deepEqual(hit.normal, { x: -1, z: 0 });
});

test('tree cylinders use the combined projectile and trunk radius', () => {
  const grid = createCollisionIndex([{ x: 5, z: 1, radius: .4, minY: 0, maxY: 7, type: 'tree' }], []);
  const hit = grid.traceSegment(point(0, 1), point(10, 1), .1);
  close(hit.point.x, 4.5); close(hit.point.y, 1.2);
  assert.deepEqual(hit.normal, { x: -1, z: 0 });
  assert.equal(hit.type, 'tree');
});

test('rounded wall corners return radial normals rather than expanded-square false contacts', () => {
  const grid = createCollisionIndex([], [{ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }]);
  const hit = grid.traceSegment(point(-1, -1), point(1, 1), .2);
  close(hit.point.x, -.2 / Math.sqrt(2)); close(hit.point.z, -.2 / Math.sqrt(2));
  close(hit.normal.x, -1 / Math.sqrt(2)); close(hit.normal.z, -1 / Math.sqrt(2));
  assert.equal(grid.traceSegment(point(-.19, -.19), point(-.19, -.18), .2), null);
});

test('the nearest surface wins regardless of collider insertion order', () => {
  const far = { x: 9, z: 0, radius: 1 }, near = { x: 3, z: 0, radius: .5 };
  const grid = createCollisionIndex([far, near], [{ minX: 6, maxX: 7, minZ: -1, maxZ: 1 }]);
  assert.equal(grid.traceSegment(point(0, 0), point(20, 0)).collider, near);
});

test('arrows pass through a doorway and collide with either solid side', () => {
  const grid = createCollisionIndex([], [
    { minX: -8, maxX: -1.45, minZ: 6.82, maxZ: 7.18 },
    { minX: 1.45, maxX: 8, minZ: 6.82, maxZ: 7.18 },
  ]);
  assert.equal(grid.traceSegment(point(0, 9), point(0, 4)), null);
  assert.ok(grid.traceSegment(point(3, 9), point(3, 4)));
  assert.ok(grid.traceSegment(point(-3, 9), point(-3, 4)));
});

test('height metadata lets arrows fly above pebbles but hit descending into their height range', () => {
  const pebble = { x: 3, z: 0, radius: 1, minY: 0, maxY: .3, type: 'stone' };
  const grid = createCollisionIndex([pebble], []);
  assert.equal(grid.traceSegment(point(0, 0, 1.2), point(6, 0, 1.2)), null);
  const hit = grid.traceSegment(point(0, 0, 1), point(6, 0, 0), .05);
  assert.equal(hit.collider, pebble);
  close(hit.point.y, .35);
  close(hit.t, .65);
});

test('an initial overlap produces a finite t=0 hit and outward normal', () => {
  const grid = createCollisionIndex([{ x: 0, z: 0, radius: 1 }], []);
  const hit = grid.traceSegment(point(.2, .1), point(4, .1));
  assert.equal(hit.t, 0); close(Math.hypot(hit.normal.x, hit.normal.z), 1);
  assert.ok(hit.normal.x > 0 && hit.normal.z > 0);
  const centre = grid.traceSegment(point(0, 0), point(3, 0));
  assert.deepEqual(centre.normal, { x: -1, z: -0 });
});

test('a finite segment does not hit beyond its endpoint and stationary probes remain stable', () => {
  const grid = createCollisionIndex([{ x: 5, z: 0, radius: .5 }], []);
  assert.equal(grid.traceSegment(point(0, 0), point(3, 0)), null);
  assert.equal(grid.traceSegment(point(0, 0), point(0, 0)), null);
  const hit = grid.traceSegment(point(5, 0), point(5, 0));
  assert.equal(hit.t, 0); assert.deepEqual(hit.normal, { x: -1, z: 0 });
});
