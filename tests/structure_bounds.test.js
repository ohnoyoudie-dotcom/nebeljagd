import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionIndex } from '../src/collision.js';
import { collisionStructureBounds, structureContainsPoint, structureIntersectsSegment } from '../src/map/structure-bounds.js';

const wall = { minX: -35, maxX: -34, minZ: -24, maxZ: 24, minY: 0, maxY: 6, type: 'house-wall' };
const localIndex = createCollisionIndex([], [wall]);
const origin = { x: 180, z: -70 };

function transformed(rotation, scale) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const world = ({ x, z, y = 1 }) => ({ x: origin.x + scale * (c * x + s * z),
    z: origin.z + scale * (-s * x + c * z), y: y * scale });
  const corners = [[wall.minX, wall.minZ], [wall.maxX, wall.minZ], [wall.maxX, wall.maxZ], [wall.minX, wall.maxZ]]
    .map(([x, z]) => world({ x, z }));
  const body = { minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)),
    minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)) };
  return { world, bounds: collisionStructureBounds([body]) };
}

test('large facade movement collision is considered beyond 15 metres, including rotation and scale', () => {
  for (const [rotation, scale] of [[0, 1], [Math.PI / 4, 1.25], [Math.PI / 2, 3]]) {
    const { world, bounds } = transformed(rotation, scale);
    const local = { x: -34.5, z: 8, y: 1 }, radius = .42;
    const position = world(local);
    assert.ok(Math.max(Math.abs(position.x - origin.x), Math.abs(position.z - origin.z)) > 15 * scale);
    assert.equal(structureContainsPoint(bounds, position, radius), true, 'broadphase must not skip the remote facade');
    localIndex.resolve(local, radius / scale);
    assert.ok(local.x < wall.minX || local.x > wall.maxX, 'the collision index pushes the player out of the solid wall');
    assert.equal(structureContainsPoint(bounds, world({ x: -80, z: 0 }), radius), false);
  }
});

test('projectiles encounter a large facade even when the whole shot remains outside the former 15 metre gate', () => {
  for (const [rotation, scale] of [[0, 1], [Math.PI / 4, 1.5], [Math.PI / 2, 3]]) {
    const { world, bounds } = transformed(rotation, scale);
    const start = { x: -39, z: 3, y: 1 }, end = { x: -32, z: 3, y: 1 };
    assert.equal(structureIntersectsSegment(bounds, world(start), world(end), .06), true);
    assert.ok(localIndex.traceSegment(start, end, .06 / scale), 'the wall blocks the arrow once broadphase allows the test');
    assert.equal(structureIntersectsSegment(bounds, world({ x: -80, z: -5 }), world({ x: -75, z: 5 }), .06), false);
  }
});

test('bounds include every solid proxy and radius contact, while empty structures are skipped', () => {
  const bounds = collisionStructureBounds([wall, { minX: 33, maxX: 35, minZ: -25, maxZ: 25 }]);
  assert.deepEqual(bounds, { minX: -35, maxX: 35, minZ: -25, maxZ: 25 });
  assert.equal(structureContainsPoint(bounds, { x: 35.4, z: 0 }, .42), true);
  assert.equal(structureIntersectsSegment(bounds, { x: -36, z: 25.05 }, { x: 36, z: 25.05 }, .06), true);
  assert.equal(collisionStructureBounds([]), null);
  assert.equal(structureContainsPoint(null, { x: 0, z: 0 }), false);
  assert.equal(structureIntersectsSegment(null, { x: 0, z: 0 }, { x: 1, z: 1 }), false);
});
