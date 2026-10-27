import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMoundPrototype, getMoundDefinition, moundCollisionWalls, moundFootprint, createMoundMovementResolver } from '../src/overgrown-mounds.js';
import { createCollisionIndex } from '../src/collision.js';
import { createSightModel } from '../src/visibility-model.js';
import { pointInPolygon } from '../src/map/model.js';

function pose(rotation, scale, x = 21, z = -9) {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return {
    world: p => ({ x: x + scale * (c * p.x + s * p.z), y: (p.y ?? 0) * scale, z: z + scale * (-s * p.x + c * p.z) }),
    local: p => ({ x: (c * (p.x - x) - s * (p.z - z)) / scale, y: (p.y ?? 0) / scale, z: (s * (p.x - x) + c * (p.z - z)) / scale }),
  };
}

test('raised ledges share their actual ground footprint with solid movement and projectile collision', () => {
  for (const variant of ['ridge', 'knoll']) {
    const definition = getMoundDefinition(variant), walls = moundCollisionWalls(variant), outline = moundFootprint(variant);
    const collision = createCollisionIndex([], walls);
    // Sample both corners and concave ledges: collision must not fill space
    // outside the drawn base or leave walkable holes in the raised top.
    for (let x = -definition.halfWidth - .1; x < definition.halfWidth + .1; x += .21) {
      for (let z = -definition.halfDepth - .1; z < definition.halfDepth + .1; z += .21) {
        const solid = walls.some(w => x >= w.minX - 1e-8 && x <= w.maxX + 1e-8 && z >= w.minZ - 1e-8 && z <= w.maxZ + 1e-8);
        assert.equal(solid, pointInPolygon([x, z], outline), `${variant} at ${x},${z}`);
      }
    }
    const hit = collision.traceSegment({ x: 0, y: 1.2, z: 6 }, { x: 0, y: 1.2, z: -6 }, .05);
    assert.equal(hit.type, 'mound'); assert.ok(hit.t < .5);
    assert.equal(collision.traceSegment({ x: 0, y: 5, z: 6 }, { x: 0, y: 5, z: -6 }, .05), null);
    const traveller = { x: 0, z: 2.7 };
    collision.resolve(traveller, .42);
    assert.ok(traveller.z >= 2.92 - 1e-9, 'the upper surface is blocked at its outer edge');
  }
});

test('rotation and scaling keep ledge collision and vision aligned with the same visible footprint', () => {
  for (const variant of ['ridge', 'knoll']) for (const rotation of [0, Math.PI / 3, -Math.PI / 2]) {
    const scale = 1.35, transform = pose(rotation, scale), walls = moundCollisionWalls(variant);
    const collision = createCollisionIndex([], walls);
    const start = transform.world({ x: 0, y: 1.1, z: 5 }), end = transform.world({ x: 0, y: 1.1, z: -5 });
    const hit = collision.traceSegment(transform.local(start), transform.local(end), .06 / scale);
    assert.equal(hit.type, 'mound');
    const worldHit = transform.world(hit.point), localHit = transform.local(worldHit);
    assert.ok(Math.abs(localHit.z - (2.5 + .06 / scale)) < 1e-8);
    const worldWalls = walls.map(w => {
      const corners = [[w.minX,w.minZ],[w.maxX,w.minZ],[w.maxX,w.maxZ],[w.minX,w.maxZ]]
        .map(([x,z]) => transform.world({x,z}));
      return { ...w, minX:Math.min(...corners.map(p=>p.x)), maxX:Math.max(...corners.map(p=>p.x)),
        minZ:Math.min(...corners.map(p=>p.z)), maxZ:Math.max(...corners.map(p=>p.z)), maxY:w.maxY*scale, corners };
    });
    const sight = createSightModel({ obstacles: worldWalls, radius: 18 });
    sight.update(start); assert.equal(sight.isVisible(end), false);
    assert.equal(sight.isVisible(transform.world({x:0,y:1.1,z:4})), true);
  }
});

test('mounds have a broad planted top with a bounded three-part local model', () => {
  for (const variant of ['ridge', 'knoll']) {
    const model = createMoundPrototype(variant);
    assert.equal(model.parts.length, 3);
    assert.ok(model.height >= 2.6);
    let triangles = 0;
    for (const part of model.parts) {
      const position = part.geometry.attributes.position;
      assert.ok(position.count > 0);
      assert.ok([...position.array].every(Number.isFinite));
      assert.equal(part.geometry.attributes.color.count, position.count);
      triangles += (part.geometry.index?.count ?? position.count) / 3;
    }
    assert.ok(triangles < 2500, `per-model triangle budget: ${triangles}`);
    const base = model.parts[0].geometry.boundingBox;
    assert.equal(base.min.x, -model.footprint.halfWidth);
    assert.equal(base.max.x, model.footprint.halfWidth);
    assert.ok(model.parts[1].geometry.boundingBox.min.y > 2.35, 'the turf is truly raised, not a ground decal');
    for (const part of model.parts) { part.geometry.dispose(); part.material.dispose(); }
  }
  assert.throws(() => createMoundPrototype('missing'));
});


test('a player can never be trapped in internal strip seams and slides along the exterior', () => {
  for (const variant of ['ridge', 'knoll']) {
    const resolve = createMoundMovementResolver(variant), walls = moundCollisionWalls(variant);
    for (let x = -2.5; x < 2.5; x += .25) for (let z = -2; z < 2; z += .25) {
      const position = { x, z };
      resolve(position, .42);
      assert.ok(!walls.some(w => position.x > w.minX && position.x < w.maxX && position.z > w.minZ && position.z < w.maxZ), `${variant} spawn ${x},${z} stays inside`);
      const after = {...position}; resolve(position,.42);
      assert.ok(Math.hypot(position.x-after.x,position.z-after.z)<1e-7,'resolved point stays stable');
    }
    const position = { x: 0, z: 2.7 };
    resolve(position,.42);
    assert.ok(position.z>=2.92);
    position.x += .1; resolve(position,.42);
    assert.ok(Math.abs(position.x-.1)<1e-8,'tangential movement remains possible');
  }
});
