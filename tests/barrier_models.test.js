import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Matrix4, Vector3 } from 'three';
import { createBarrierModelParts } from '../src/barrier-models.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { generateBarrierObjects, makeBarrier } from '../src/map/barriers.js';

test('new modular models stay inside their solid footprints and share a small instanced mesh', () => {
  for (const [kind, variant] of [['wall', 'kit-cut-stone'], ['fence', 'kit-cross-wood']]) {
    const definition = getEnvironmentKitDefinition(kind, variant), parts = createBarrierModelParts(variant);
    assert.equal(parts.length, 1, 'each repeated module uses one draw call per chunk');
    const { geometry, material } = parts[0], bounds = geometry.boundingBox, epsilon = 1e-6;
    assert.ok(Math.abs(bounds.min.y) < epsilon, 'the base rests on the ground');
    assert.ok(Math.abs(bounds.max.y - definition.height) < epsilon);
    assert.ok(Math.abs(bounds.min.x + definition.footprint.halfWidth) < epsilon);
    assert.ok(Math.abs(bounds.max.x - definition.footprint.halfWidth) < epsilon);
    assert.ok(bounds.min.z >= -definition.footprint.halfDepth - epsilon);
    assert.ok(bounds.max.z <= definition.footprint.halfDepth + epsilon);
    assert.ok(geometry.attributes.position.count / 3 < 4500, 'repeated scenery has a bounded triangle budget');
    for (const attr of ['position', 'normal', 'color']) assert.ok(geometry.attributes[attr].array.every(Number.isFinite));
    geometry.dispose(); material.dispose();
  }
});

test('actual model vertices preserve an authored passage when modules are shortened and scaled', () => {
  for (const [kind, variant] of [['wall', 'kit-cut-stone'], ['fence', 'kit-cross-wood']]) {
    const barrier = makeBarrier(kind, [[0, 0], [23, 0]], { variant, scale: 1.35, gaps: [{ at: 11.5, width: 3 }] });
    const [{ geometry, material }] = createBarrierModelParts(variant);
    const left = new Box3(), right = new Box3();
    for (const object of generateBarrierObjects(barrier)) {
      const transform = new Matrix4().makeScale(object.scale * object.longitudinalScale, object.scale, object.scale);
      transform.setPosition(new Vector3(object.position[0], 0, object.position[1]));
      const bounds = geometry.boundingBox.clone().applyMatrix4(transform);
      (object.position[0] < 11.5 ? left : right).union(bounds);
    }
    assert.ok(Math.abs(left.min.x) < 1e-6);
    assert.ok(Math.abs(right.max.x - 23) < 1e-6);
    assert.ok(Math.abs(right.min.x - left.max.x - 3) < 1e-6, 'coping and posts cannot intrude into the passage');
    geometry.dispose(); material.dispose();
  }
});
