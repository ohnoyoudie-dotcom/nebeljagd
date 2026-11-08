import test from 'node:test';
import assert from 'node:assert/strict';
import { createSightModel } from '../src/visibility-model.js';
import { createCollisionIndex } from '../src/collision.js';

test('sight is finite in every direction and follows the observer', () => {
  const sight = createSightModel({ radius: 18 });
  sight.update({ x: 30, y: 0, z: -42 });
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2;
    assert.equal(sight.isVisible({ x: 30 + Math.cos(angle) * 17.9, z: -42 + Math.sin(angle) * 17.9 }), true);
    assert.equal(sight.isVisible({ x: 30 + Math.cos(angle) * 18.1, z: -42 + Math.sin(angle) * 18.1 }), false);
  }
  sight.update({ x: 100, z: 100 });
  assert.equal(sight.isVisible({ x: 30, z: -42 }), false);
  assert.equal(sight.isVisible({ x: 101, z: 100 }), true);
});

test('trees and rocks cast sight shadows but distant and low objects do not', () => {
  const sight = createSightModel({ obstacles: [
    { x: 5, z: 0, radius: 1, minY: 0, maxY: 6 },
    { x: -5, z: 0, radius: 1.5, minY: 0, maxY: .3 },
    { x: 500, z: 500, radius: 3, maxY: 10 },
  ] });
  assert.equal(sight.isVisible({ x: 3, z: 0 }), true);
  assert.equal(sight.isVisible({ x: 9, z: 0 }), false);
  assert.equal(sight.isVisible({ x: 9, z: 4 }), true);
  assert.equal(sight.isVisible({ x: -9, z: 0 }), true);
  assert.equal(sight.nearbyCount, 1);
  assert.equal(sight.distanceAtAngle(0), 4);
});

test('destroyed tall blockers stop hiding what is behind them after the next sight update', () => {
  const blocker = { minX: 4, maxX: 4.8, minZ: -.4, maxZ: .4, minY: 0, maxY: 3, type: 'wall' };
  const sight = createSightModel({ obstacles: [blocker] });
  assert.equal(sight.isVisible({ x: 8, z: 0 }), false);
  blocker.destroyed = true;
  sight.update({ x: 0, y: 0, z: 0 });
  assert.equal(sight.isVisible({ x: 8, z: 0 }), true);
});

test('freestanding walls and fences hide actors and shade the ground only from 2 metres upwards', () => {
  for (const type of ['wall', 'fence']) for (const height of [.25, 1.5, 1.99, 1.9999, 2, 2.01, 3]) {
    for (const ground of [-5, 0, 20, 123.456789]) {
      const body = { type, minX: 4, maxX: 4.6, minZ: -2, maxZ: 2,
        minY: ground, maxY: ground + height, barrierHeight: height };
      const original = { ...body }, sight = createSightModel({ obstacles: [body], radius: 18 });
      sight.update({ x: 0, y: ground, z: 0 });
      const blocked = height >= 2;
      assert.equal(sight.isVisible({ x: 8, z: 0 }), !blocked, `${type} at ${height}m on ${ground}m ground`);
      assert.equal(sight.distanceAtAngle(0), blocked ? 4 : 18, 'same contour feeds the soft vision shadow');
      assert.equal(sight.distances[0], blocked ? 4 : 18);
      const collision = createCollisionIndex([], [body]), position = { x: 4.3, y: ground, z: 0 };
      collision.resolve(position, .42);
      assert.ok(Math.hypot(position.x - 4.3, position.z) > .4, 'a visible-over wall remains impassable');
      assert.ok(collision.traceSegment({ x: 0, y: ground + height / 2, z: 0 }, { x: 8, y: ground + height / 2, z: 0 }, .02), 'low projectiles hit the actual wall');
      assert.equal(collision.traceSegment({ x: 0, y: ground + height + .2, z: 0 }, { x: 8, y: ground + height + .2, z: 0 }, .02), null, 'shots above its physical top remain clear');
      assert.deepEqual(body, original, 'sight filtering must not remove or mutate physical obstacles');
    }
  }
});

test('legacy walls use physical height; house partitions still hide actors, crates allow sight', () => {
  for (const [type, height, blocked] of [['wall', 1.5, false], ['wall', 2, true], ['fence', 1, false], ['fence', 2, true], ['house-wall', 1.5, true], ['crate', 1, false], ['rock', 1.5, true]]) {
    const body = { type, minX: 4, maxX: 4.6, minZ: -1, maxZ: 1, minY: 20, maxY: 20 + height };
    const sight = createSightModel({ obstacles: [body] });
    sight.update({ x: 0, y: 20, z: 0 });
    assert.equal(sight.isVisible({ x: 8, z: 0 }), !blocked, type);
  }
  const sight = createSightModel({ obstacles: [{ type: 'wall', minX: 4, maxX: 4.6, minZ: -1, maxZ: 1,
    minY: 0, maxY: 3, barrierHeight: 3 }] });
  sight.update({ x: 0, y: 5, z: 0 });
  assert.equal(sight.isVisible({ x: 8, z: 0 }), true, 'observer far above the wall still sees over it');
});

test('props and every well part allow actors and the scenery contour through while retaining physical collision', () => {
  for (const [type, objectKind] of [['wagon', 'wagon'], ['wagon-shaft', 'wagon'], ['barrel', 'barrel'],
    ['well-post', 'well'], ['well-roof', 'well'], ['well', 'well'], ['crate', 'crate'], ['chest', 'chest']]) {
    for (const ground of [0, 24]) {
      const body = { type, objectKind, minX: 4, maxX: 5, minZ: -1, maxZ: 1, minY: ground, maxY: ground + 4 };
      const original = { ...body }, sight = createSightModel({ obstacles: [body] });
      sight.update({ x: 0, y: ground, z: 0 });
      assert.equal(sight.isVisible({ x: 8, z: 0 }), true, type);
      assert.equal(sight.distances[0], 18, `${type} no ground shadow`);
      const collision = createCollisionIndex([], [body]), position = { x: 4.5, y: ground, z: 0 };
      collision.resolve(position, .42);
      assert.ok(Math.abs(position.x - 4.5) + Math.abs(position.z) > .4, `${type} still solid`);
      assert.ok(collision.traceSegment({ x: 0, y: ground + 1, z: 0 }, { x: 8, y: ground + 1, z: 0 }), `${type} still stops shots`);
      assert.deepEqual(body, original);
    }
  }
});

test('a house doorway admits sight while adjacent walls conceal its rooms', () => {
  const sight = createSightModel({ obstacles: [
    { minX: 5, maxX: 5.4, minZ: -8, maxZ: -1.4 },
    { minX: 5, maxX: 5.4, minZ: 1.4, maxZ: 8 },
  ] });
  assert.equal(sight.isVisible({ x: 12, z: 0 }), true);
  assert.equal(sight.isVisible({ x: 12, z: 6 }), false);
  sight.update({ x: 8, z: 4 });
  assert.equal(sight.isVisible({ x: 12, z: 6 }), true);
  assert.equal(sight.isVisible({ x: 0, z: 4 }), false);
});

test('rotated walls use polygon corners and do not fill empty bounding box corners', () => {
  const sight = createSightModel({ obstacles: [{ minX: 4, maxX: 8, minZ: -2, maxZ: 2,
    corners: [{ x: 4, z: 0 }, { x: 6, z: -2 }, { x: 8, z: 0 }, { x: 6, z: 2 }] }] });
  assert.equal(sight.isVisible({ x: 12, z: 0 }), false);
  assert.equal(sight.isVisible({ x: 6, z: 2.8 }), true);
});

test('grass concealment hides remote entities and their bars, but preserves local view', () => {
  const sight = createSightModel();
  assert.equal(sight.isVisible({ x: 2, z: 1 }, { concealed: true }), false);
  assert.equal(sight.isVisible({ x: 2, z: 1 }, { concealed: false }), true);
  assert.equal(sight.isVisible({ x: 2, z: 1 }, { concealed: true, local: true }), true);
});

test('removed dynamic loot releases visibility material hooks on the next scene scan', async () => {
  const THREE = await import('three');
  const { createVision } = await import('../src/vision.js');
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial(), original = material.onBeforeCompile;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material); scene.add(mesh);
  const vision = createVision(scene, { spawn: { x: 0, z: 0 }, heightAt: () => 0, projectileObstacles: [] });
  assert.equal(vision.inspect().materials, 1);
  assert.notEqual(material.onBeforeCompile, original);
  scene.remove(mesh); material.dispose(); mesh.geometry.dispose();
  vision.register();
  assert.equal(vision.inspect().materials, 0);
  assert.equal(material.onBeforeCompile, original);
  vision.dispose();
});
