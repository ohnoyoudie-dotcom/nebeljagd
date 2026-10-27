import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHealthBars } from '../src/health-bars.js';

test('health bars hide opponents outside vision and in grass without revealing their health', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const bars = createHealthBars(scene);
  const localPosition = new THREE.Vector3(2, 1, 3);
  bars.add('local', { position: localPosition, health: 75, local: true, concealed: true });
  bars.add('visible', { position: new THREE.Vector3(3, 0, 4), health: 50 });
  bars.add('behind-wall', { position: new THREE.Vector3(30, 0, 4) });
  bars.add('grass', { position: new THREE.Vector3(4, 0, 5), concealed: true });
  bars.update(camera, { isVisible: point => point.x < 10 });
  assert.deepEqual(bars.inspect().map(bar => [bar.id, bar.visible]), [
    ['local', true], ['visible', true], ['behind-wall', false], ['grass', false],
  ]);
  assert.equal(scene.children.length, 1, 'one instanced renderer handles every actor');
  const mesh = scene.children[0];
  assert.equal(mesh.count, 4);
  assert.equal(mesh.geometry.attributes.healthRatio.array[0], .75);
  assert.equal(mesh.geometry.attributes.healthRatio.array[1], .5);
  localPosition.set(7, 4, 8);
  bars.set('visible', { health: 20, maxHealth: 80 });
  bars.update(camera, { isVisible: () => false });
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 7, 'bar follows the live position reference');
  assert.ok(Math.abs(matrix.elements[13] - 6.8) < 1e-5, 'bar stays above the character on raised ground');
  assert.equal(mesh.geometry.attributes.healthRatio.array[1], .25);
  assert.equal(bars.inspect()[0].visible, true, 'local health remains readable');
  bars.remove('behind-wall');
  bars.update(camera);
  assert.equal(mesh.count, 3);
  bars.dispose(); assert.equal(scene.children.length, 0);
});
