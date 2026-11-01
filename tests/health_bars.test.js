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

test('level-ups keep the same green bar and add one 25 HP segment each time', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const bars = createHealthBars(scene);
  bars.add('player', { position: new THREE.Vector3(), health: 72, maxHealth: 100, level: 1, local: true });
  const mesh = scene.children[0], positions = [...mesh.geometry.attributes.position.array];
  const atlas = mesh.material.uniforms.levelAtlas.value;
  let baseline;
  for (const [level, health, maximum] of [[1, 72, 100], [2, 97, 125], [3, 122, 150]]) {
    bars.set('player', { level, health, maxHealth: maximum });
    bars.update(camera);
    const current = bars.inspect()[0];
    if (!baseline) baseline = current;
    assert.equal(current.level, level);
    assert.equal(current.levelLabel, String(level));
    assert.equal(current.segmentCount, level + 3);
    assert.equal(current.healthPerSegment, 25);
    assert.equal(current.barWidth, baseline.barWidth);
    assert.deepEqual(current.barBounds, baseline.barBounds);
    assert.ok(current.levelBounds.right < current.barBounds.left, 'level remains to the left of the whole bar');
    assert.equal(mesh.geometry.attributes.healthUnits.array[0], maximum / 25);
    assert.ok(Math.abs(mesh.geometry.attributes.healthRatio.array[0] - health / maximum) < 1e-6);
    assert.ok(Math.abs(current.displayedRatio - health / maximum) < 1e-6, 'level-up has no stale orange damage strip');
    assert.deepEqual([...mesh.geometry.attributes.position.array], positions, 'no geometry growth or rebuild');
    assert.equal(mesh.material.uniforms.levelAtlas.value, atlas, 'one immutable atlas handles every level');
  }
  bars.set('player', { health: 72, maxHealth: 100, level: 1, snap: true });
  bars.reset(); bars.update(camera);
  assert.equal(bars.inspect()[0].level, 1);
  assert.equal(bars.inspect()[0].segmentCount, 4);
  assert.ok(Math.abs(bars.inspect()[0].displayedRatio - .72) < 1e-6);
  bars.dispose();
});

test('partial HP segments and larger levels remain within reserved left label space', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const bars = createHealthBars(scene);
  bars.add('npc', { position: new THREE.Vector3(), maxHealth: 140, health: 140, level: 12 });
  bars.update(camera);
  const mesh = scene.children[0]; mesh.geometry.computeBoundingBox();
  assert.equal(bars.inspect()[0].segmentCount, 6, 'the final section represents the remaining 15 HP');
  assert.ok(Math.abs(mesh.geometry.attributes.healthUnits.array[0] - 5.6) < 1e-6, 'ticks retain exact 25 HP spacing');
  const width = bars.inspect()[0].barWidth;
  for (const [level, label] of [[12, '12'], [1234, '1234'], [12345, '12k'], [1200000, '1.2M'], [9007199254740991, '9P']]) {
    bars.set('npc', { level }); bars.update(camera);
    const result = bars.inspect()[0];
    assert.equal(result.level, level, 'compact labels never cap the actual level');
    assert.equal(result.levelLabel, label);
    assert.equal(result.barWidth, width);
    assert.ok(result.levelBounds.left >= mesh.geometry.boundingBox.min.x, 'entire label stays on its quad');
    assert.ok(result.levelBounds.right < result.barBounds.left, 'digits never overlap the bar');
    assert.equal(mesh.geometry.attributes.levelLength.array[0], label.length);
  }
  // Capacity changes with unchanged current HP must update the ratio immediately.
  bars.set('npc', { health: 100 }); bars.update(camera);
  bars.set('npc', { maxHealth: 200 }); bars.update(camera);
  assert.equal(bars.inspect()[0].displayedRatio, .5);
  bars.dispose();
});

test('level labels share health-bar concealment, corpse hiding and texture lifetime', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const bars = createHealthBars(scene);
  bars.add('local', { position: new THREE.Vector3(), local: true, health: 0, level: 3 });
  bars.add('opponent', { position: new THREE.Vector3(2, 0, 1), health: 50, level: 9 });
  const mesh = scene.children[0], matrix = new THREE.Matrix4();
  bars.update(camera);
  assert.equal(scene.children.length, 1, 'bar and text still use one instanced draw call');
  bars.set('opponent', { concealed: true }); bars.update(camera);
  mesh.getMatrixAt(1, matrix);
  assert.equal(matrix.elements[0], 0, 'concealment removes the entire badge and bar');
  assert.equal(bars.inspect()[1].visible, false);
  bars.set('opponent', { concealed: false, health: 0 }); bars.update(camera);
  assert.equal(bars.inspect()[1].visible, false, 'a defeated opponent reveals no level badge');
  assert.equal(bars.inspect()[0].visible, true, 'local death retains the local health readout');
  let disposedTextures = 0;
  mesh.material.uniforms.levelAtlas.value.addEventListener('dispose', () => disposedTextures++);
  bars.dispose();
  assert.equal(disposedTextures, 1);
  assert.equal(scene.children.length, 0);
});
