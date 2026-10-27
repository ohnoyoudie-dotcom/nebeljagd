import test from 'node:test';
import assert from 'node:assert/strict';
import { createSightModel } from '../src/visibility-model.js';

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
