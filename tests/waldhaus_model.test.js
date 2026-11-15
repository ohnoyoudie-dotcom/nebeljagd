import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Raycaster, Vector3 } from 'three';
import { createWaldhausModel } from '../src/waldhaus-model.js';
import { WALDHAUS_DEFINITION } from '../src/map/waldhaus-definition.js';

test('Waldhaus produces finite, compact geometry without a browser canvas', () => {
  const model = createWaldhausModel();
  try {
    model.group.traverse(node => {
      if (!node.isMesh) return;
      for (const value of node.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
    });
    const bounds = new Box3().setFromObject(model.group);
    assert.ok(bounds.min.x >= -6.05 && bounds.max.x <= 6.05, 'wall trim must stay near the shared footprint');
    assert.ok(bounds.min.z >= -5.3 && bounds.max.z <= 5.3, 'only the two threshold steps extend beyond the floor');
    assert.ok(model.stats.drawCalls <= 20, 'static furnishings should stay batched by material');
    assert.ok(model.stats.triangles < 75000);
    assert.equal(model.roof.visible, false);
  } finally { model.dispose(); }
});

test('Waldhaus visible frames and stonework leave both exits and room doors clear', () => {
  const model = createWaldhausModel();
  model.group.updateMatrixWorld(true);
  try {
    for (const route of [...WALDHAUS_DEFINITION.qaRoutes.entrances, ...WALDHAUS_DEFINITION.qaRoutes.rooms]) {
      for (const height of [.75, 1.6, 2.2]) {
        const from = new Vector3(route.from[0], height + WALDHAUS_DEFINITION.floorHeight, route.from[1]);
        const to = new Vector3(route.to[0], from.y, route.to[1]);
        const direction = to.clone().sub(from);
        const ray = new Raycaster(from, direction.clone().normalize(), .001, direction.length());
        const hits = ray.intersectObject(model.group, true);
        assert.equal(hits.length, 0, `${route.name} should remain visibly clear at ${height} m`);
      }
    }
  } finally { model.dispose(); }
});

test('Waldhaus releases each shared material and geometry once', () => {
  const model = createWaldhausModel(), resources = new Set();
  model.group.traverse(node => { if (node.isMesh) { resources.add(node.geometry); resources.add(node.material); } });
  let disposed = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => disposed++));
  model.dispose();
  model.dispose();
  assert.equal(disposed, resources.size);
});
