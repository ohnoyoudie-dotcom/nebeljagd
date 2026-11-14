import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSunVisuals } from '../src/sun-visuals.js';
import { SUN_RULES } from '../src/sun-spell.js';

test('solar ground light follows a hillside throughout expansion and when recast elsewhere', () => {
  const scene = new THREE.Scene(), ground = p => .2 * p.x + Math.sin(p.z * .4) * .7;
  const fx = createSunVisuals(scene, SUN_RULES, ground);
  const disk = scene.getObjectByName('Wachsende Sonnenhelligkeit'), beam = scene.getObjectByName('Sonnenkern');
  const point = new THREE.Vector3();
  for (const center of [{ x: 2, z: 1 }, { x: -7, z: 12 }]) {
    for (const age of [.05, .4, 1.1, 3.1]) {
      fx.show(center, age); scene.updateMatrixWorld(true);
      const positions = disk.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 17) {
        point.fromBufferAttribute(positions, i).applyMatrix4(disk.matrixWorld);
        assert.ok(Math.abs(point.y - ground(point) - .065) < 1e-6, 'light surface must stay just above the terrain');
      }
      const [minimum] = fx.telemetry.terrainHeightRange;
      assert.ok(beam.material.uniforms.uFloor.value < minimum, 'the volume extends below the lowest ground, leaving no flat cut through the hill');
      assert.equal(fx.telemetry.groundProfile, 'terrain-following');
    }
  }
  let disposed = false; beam.material.uniforms.uTerrain.value.addEventListener('dispose', () => { disposed = true; });
  fx.dispose(); assert.ok(disposed); assert.equal(scene.children.length, 0);
});
