import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLootGlow } from '../src/loot-glow.js';

test('rarity ground light follows the sampled surface through transformed roots and relocated loot', () => {
  const scene = new THREE.Scene(), surface = new THREE.Group(), item = new THREE.Group();
  scene.add(surface); surface.add(item);
  surface.position.set(6, 2, -9); surface.rotation.set(.08, .4, -.05); surface.scale.set(1.3, 1.1, 1.6);
  item.position.set(-5, 1.1, 27); item.rotation.set(.04, .8, -.03); item.scale.set(1.4, .9, 1.2);
  let samples = 0;
  const heightAt = (x, z) => { samples++; return 1.1 + .08 * x + .015 * z + .12 * Math.sin(x * .7); };
  const aura = createLootGlow(item, { rarity: 'rare', radius: 1.15, heightAt, surfaceSpace: surface });
  const ground = aura.group.children[0], sprite = aura.group.children[1];
  const assertFits = () => {
    ground.updateWorldMatrix(true, false);
    const point = new THREE.Vector3();
    const position = ground.geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index);
      surface.worldToLocal(ground.localToWorld(point));
      assert.ok(Math.abs(point.y - (heightAt(point.x, point.z) + .047)) < 1e-6,
        'every ground-light vertex stays above the actual surface in its coordinate space');
    }
  };
  assert.ok(ground.geometry.attributes.position.count > 4);
  assertFits();
  const afterPlacement = samples;
  const groundGeometry = ground.geometry, spriteGeometry = sprite.geometry;
  for (let index = 0; index < 120; index++) aura.update(index / 60);
  assert.equal(samples, afterPlacement, 'animation never resamples terrain or replaces geometry');
  assert.equal(ground.geometry, groundGeometry); assert.equal(sprite.geometry, spriteGeometry);
  item.position.set(3, 2, 31); item.rotation.y = -.6; item.scale.set(1.1, 1.3, .8);
  aura.refreshGround(); assertFits();
  const firstRefresh = ground.geometry.attributes.position.array.slice();
  aura.refreshGround();
  assert.deepEqual(ground.geometry.attributes.position.array, firstRefresh, 'refresh uses the original UV grid, not accumulated deformation');
  assert.equal(aura.inspect().groundRefreshes, 3);
  assert.equal(aura.inspect().depthTested, true);
  assert.equal(aura.inspect().drawCalls, 2);
  aura.dispose();
});

test('conforming ground geometry is owned while sprites remain shared and dispose only after the last aura', () => {
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group(); scene.add(a, b);
  const first = createLootGlow(a, { heightAt: () => 0 });
  const second = createLootGlow(b, { heightAt: () => 0 });
  assert.notEqual(first.group.children[0].geometry, second.group.children[0].geometry);
  assert.equal(first.group.children[1].geometry, second.group.children[1].geometry);
  let firstGroundDisposed = 0, secondGroundDisposed = 0, spritesDisposed = 0;
  first.group.children[0].geometry.addEventListener('dispose', () => firstGroundDisposed++);
  second.group.children[0].geometry.addEventListener('dispose', () => secondGroundDisposed++);
  first.group.children[1].geometry.addEventListener('dispose', () => spritesDisposed++);
  first.dispose(); first.dispose();
  assert.equal(firstGroundDisposed, 1); assert.equal(secondGroundDisposed, 0); assert.equal(spritesDisposed, 0);
  second.dispose();
  assert.equal(secondGroundDisposed, 1); assert.equal(spritesDisposed, 1);
  assert.equal(a.children.length + b.children.length, 0);
});
