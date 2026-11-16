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
    assert.ok(bounds.min.x >= -WALDHAUS_DEFINITION.footprint.halfWidth - .4 && bounds.max.x <= WALDHAUS_DEFINITION.footprint.halfWidth + .4, 'low exterior planting must stay within the foundation margin');
    assert.ok(bounds.min.z >= -WALDHAUS_DEFINITION.footprint.halfDepth - .8 && bounds.max.z <= WALDHAUS_DEFINITION.footprint.halfDepth + .8, 'only the two threshold steps extend beyond the floor');
    assert.ok(bounds.max.y < WALDHAUS_DEFINITION.floorHeight + WALDHAUS_DEFINITION.wallHeight + .11, 'larger floor area must not scale up wall height');
    assert.ok(model.stats.drawCalls <= 20, 'architecture should stay batched by material');
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

test('Interior doors read as open wall gaps from above and from the game camera', () => {
  for (const rotation of [0, Math.PI / 2]) {
    const model = createWaldhausModel({ rotation });
    model.group.rotation.y = rotation;
    model.group.updateMatrixWorld(true);
    try {
      for (const door of WALDHAUS_DEFINITION.interiorDoorways) {
        // The central opening must remain unbridged across its useful width.
        for (const fraction of [-.3, 0, .3]) {
          const point = new Vector3(door.x + (door.axis === 'x' ? fraction * door.width : 0),
            WALDHAUS_DEFINITION.floorHeight + .06,
            door.z + (door.axis === 'z' ? fraction * door.width : 0));
          model.group.localToWorld(point);
          const origin = point.clone().add(new Vector3(0, 6, 0));
          const ray = new Raycaster(origin, new Vector3(0, -1, 0), .001, 6);
          assert.equal(ray.intersectObject(model.group, true).length, 0,
            `interior doorway at ${door.x},${door.z} must have no overhead beam at yaw ${rotation}`);
        }
        // Check the readable upper opening from the actual fixed camera bearing.
        const opening = model.group.localToWorld(new Vector3(door.x,
          WALDHAUS_DEFINITION.floorHeight + 2.2, door.z));
        const camera = opening.clone().add(new Vector3(0, 29, 18));
        const direction = opening.clone().sub(camera);
        const ray = new Raycaster(camera, direction.clone().normalize(), .001, direction.length());
        assert.equal(ray.intersectObject(model.group, true).length, 0,
          `interior opening must stay visually open from the game camera at yaw ${rotation}`);

        // A clear wall cap alone is insufficient: the oblique camera must also
        // see the far side of the actual threshold, below the 3 m tall jambs.
        const threshold = model.group.localToWorld(new Vector3(
          door.x + (door.axis === 'x' ? -door.width / 2 + .2 : 0),
          WALDHAUS_DEFINITION.floorHeight + .025,
          door.z + (door.axis === 'z' ? -door.width / 2 + .2 : 0)));
        const thresholdCamera = threshold.clone().add(new Vector3(0, 29, 18));
        const thresholdDirection = threshold.clone().sub(thresholdCamera);
        const thresholdRay = new Raycaster(thresholdCamera, thresholdDirection.clone().normalize(),
          .001, thresholdDirection.length());
        assert.equal(thresholdRay.intersectObject(model.group, true).length, 0,
          `the threshold floor must be visible through the room doorway at yaw ${rotation}`);
      }
    } finally { model.dispose(); }
  }
});

test('Waldhaus rooms contain no baked-in furniture or decorations', () => {
  const model = createWaldhausModel();
  model.group.updateMatrixWorld(true);
  try {
    for (const room of WALDHAUS_DEFINITION.rooms) {
      for (let x = room.minX + .45; x < room.maxX - .45; x += .4) {
        const origin = new Vector3(x, WALDHAUS_DEFINITION.floorHeight + .65, room.minZ + .45);
        const ray = new Raycaster(origin, new Vector3(0, 0, 1), .001, room.maxZ - room.minZ - .9);
        assert.equal(ray.intersectObject(model.group, true).length, 0, `${room.name} must have an empty floor at x=${x}`);
      }
    }
  } finally { model.dispose(); }
});

test('Waldhaus releases each shared resource and window-light material exactly once', () => {
  for (const rotation of [0, Math.PI / 2]) {
    const model = createWaldhausModel({ rotation }), resources = new Set();
    model.group.traverse(node => {
      if (!node.isMesh) return;
      resources.add(node.geometry);
      for (const material of [node.material].flat()) resources.add(material);
    });
    assert.ok([...resources].some(resource => resource.isShaderMaterial), 'include the integrated window-light resources');
    const disposals = new Map([...resources].map(resource => [resource, 0]));
    resources.forEach(resource => resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1)));
    model.dispose();
    model.dispose();
    for (const [resource, count] of disposals) assert.equal(count, 1, `${resource.name || resource.type} must be disposed exactly once`);
  }
});
