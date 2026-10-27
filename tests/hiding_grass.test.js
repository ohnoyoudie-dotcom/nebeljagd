import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHidingGrassGeometry, hidingGrassDetail, HIDING_GRASS_STYLE } from '../src/hiding-grass.js';

test('restored crossed stalks preserve v011 broad bases and provide a real dense, graded tuft', () => {
  const geometry = createHidingGrassGeometry();
  assert.equal(geometry.userData.sourceVersion, 'nebeljagd-3d-v011');
  assert.equal(geometry.userData.crossedStalks, 4);
  assert.ok(HIDING_GRASS_STYLE.instanceDensity * geometry.userData.crossedStalks >= 30,
    'at least the earlier low-quality meadow density without extra instance matrices');
  const p = geometry.attributes.position, c = geometry.attributes.color;
  let roots = 0, tips = 0, rootLight = 0, tipLight = 0;
  for (let i = 0; i < p.count; i++) {
    const light = c.getX(i) + c.getY(i) + c.getZ(i);
    if (p.getY(i) === 0) { roots++; rootLight += light; }
    if (p.getY(i) === 1) { tips++; tipLight += light; }
    for (const value of [p.getX(i), p.getY(i), p.getZ(i)]) assert.ok(Number.isFinite(value));
  }
  assert.ok(roots && tips);
  assert.ok(tipLight / tips > rootLight / roots * 2, 'lighter pointed tips rise from the green dense base');
  assert.ok(geometry.boundingBox.max.x - geometry.boundingBox.min.x > .5,
    'four offset stalks close the gaps left by a solitary narrow blade');
  assert.equal(geometry.boundingBox.min.y, 0);
  assert.equal(geometry.boundingBox.max.y, 1);
  geometry.dispose();
});

test('performance geometry keeps the same hiding height and width at half triangle cost', () => {
  const full = createHidingGrassGeometry(), low = createHidingGrassGeometry({ low: true });
  assert.equal(low.index.count, full.index.count / 2);
  assert.deepEqual(low.boundingBox.min.toArray(), full.boundingBox.min.toArray());
  assert.deepEqual(low.boundingBox.max.toArray(), full.boundingBox.max.toArray());
  assert.equal(low.userData.crossedStalks, full.userData.crossedStalks);
  full.dispose(); low.dispose();
});

test('local grass detail fades by nearest patch bounds and returns when approached', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(16, 2.6, 16));
  assert.deepEqual(hidingGrassDetail({ x: 8, z: 8 }, bounds, 'high'), { visible: true, low: false });
  assert.deepEqual(hidingGrassDetail({ x: 8, z: 8 }, bounds, 'low'), { visible: true, low: true });
  assert.deepEqual(hidingGrassDetail({ x: 45, z: 8 }, bounds, 'high'), { visible: true, low: true });
  assert.equal(hidingGrassDetail({ x: 65, z: 8 }, bounds, 'high').visible, false);
  assert.equal(hidingGrassDetail({ x: 51, z: 8 }, bounds, 'low').visible, false);
  assert.equal(hidingGrassDetail({ x: 35, z: 8 }, bounds, 'low').visible, true);
});
