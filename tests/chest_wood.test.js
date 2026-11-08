import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { textureChestInterior } from '../src/chest-wood.js';

test('only interior surfaces get shared textured wood; cut-face UVs have nonzero area', () => {
  const root = new THREE.Group(), lid = new THREE.Group(); root.add(lid);
  const outer = new THREE.MeshStandardMaterial({ map: new THREE.Texture() }); outer.name = 'Tripo exterior';
  const inner = new THREE.MeshStandardMaterial(); inner.name = 'Dark walnut interior';
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), outer);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.4, .06, .76), inner);
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .8), inner);
  root.add(shell, floor); lid.add(cap);
  const exteriorGeometry = shell.geometry;
  assert.equal(textureChestInterior(root), 2);
  assert.equal(shell.geometry, exteriorGeometry); assert.equal(shell.material, outer);
  assert.equal(floor.material, cap.material); assert.ok(cap.material.map.isDataTexture);
  assert.ok(new Set(cap.material.map.image.data).size > 60, 'grain has visible tonal detail');
  assert.equal(cap.parent, lid, 'underside remains attached to the animated lid');
  for (const mesh of [floor, cap]) {
    const uv = mesh.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i += 3) {
      const area = (uv.getX(i+1)-uv.getX(i))*(uv.getY(i+2)-uv.getY(i))-(uv.getY(i+1)-uv.getY(i))*(uv.getX(i+2)-uv.getX(i));
      assert.ok(Math.abs(area) > 1e-5, 'no collapsed UV triangles');
    }
  }
});
