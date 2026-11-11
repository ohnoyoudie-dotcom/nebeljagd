import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';

test('Void follows the arc and spins on its flight axis without changing shared model resources', () => {
  const geometry = new THREE.ConeGeometry(.25, 1), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  prototype.userData.source = 'assets/inbox/Void Projektil.glb';
  let visible = true, sharedDisposals = 0, copyDisposals = 0;
  for (const resource of [geometry, texture, material]) resource.addEventListener('dispose', () => sharedDisposals++);
  const scene = new THREE.Scene();
  const effects = createSpellEffects(scene, { gravityProjectilePrototype: prototype, isVisible: () => visible });
  const visual = effects.createProjectile(), second = effects.createProjectile();
  const copy = visual.gravityModel.children[0];
  copy.material.addEventListener('dispose', () => copyDisposals++);
  assert.equal(copy.geometry, geometry);
  assert.equal(copy.material.map, texture);
  assert.equal(copy.material.emissiveMap, texture);
  assert.notEqual(copy.material, material);
  assert.notEqual(copy.material, second.gravityModel.children[0].material);
  assert.equal(material.emissive.getHex(), 0);
  assert.equal(material.emissiveMap, null);
  const from = new THREE.Vector3(0, 1, 0), to = new THREE.Vector3(1, 2, 3);
  effects.launch(visual, 'gravityStaff', from, 1.2);
  assert.deepEqual(visual.group.scale.toArray(), [.8, .8, .8], 'model, halo and orbiting energy shrink together');
  assert.equal(visual.gravityCore.visible, false);
  assert.ok(visual.gravityModel.visible);
  assert.equal(effects.telemetry.importedGravityProjectiles, 1);
  assert.equal(effects.telemetry.gravityModel.source, prototype.userData.source);
  effects.advance(visual, from, to, .1, .1);
  const direction = to.clone().sub(from).normalize();
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(visual.group.quaternion).dot(direction) > .99999);
  assert.ok(visual.gravityModel.rotation.z > .6);
  assert.deepEqual(visual.group.position, to);
  assert.equal(visual.gravityParticles.count, 8);
  const rotation = visual.gravityModel.rotation.clone(), orientation = visual.group.quaternion.clone();
  effects.advance(visual, to, from, 0, 100);
  effects.update(0, 100);
  assert.deepEqual(visual.gravityModel.rotation.toArray(), rotation.toArray());
  assert.deepEqual(visual.group.quaternion.toArray(), orientation.toArray());
  assert.deepEqual(prototype.rotation.toArray(), [0, 0, 0, 'XYZ']);
  visible = false; effects.update(0);
  assert.equal(visual.group.visible, false);
  assert.equal(effects.telemetry.visibleImportedGravityProjectiles, 0);
  visible = true;
  effects.end(visual);
  assert.equal(effects.telemetry.importedGravityProjectiles, 0);
  effects.launch(visual, 'fireStaff', from);
  assert.deepEqual(visual.group.scale.toArray(), [1, 1, 1], 'pooled gravity scale never shrinks another weapon');
  assert.equal(visual.gravity.visible, false);
  assert.equal(visual.gravityModel.visible, false);
  effects.launch(visual, 'gravityStaff', from);
  assert.equal(visual.gravityModel.rotation.z, 0, 'pooled projectile resets its spin');
  effects.reset(); assert.equal(effects.telemetry.importedGravityProjectiles, 0);
  effects.dispose(); effects.dispose();
  assert.equal(copyDisposals, 1);
  assert.equal(sharedDisposals, 0, 'geometry and textures remain owned by the model loader');
  assert.equal(scene.children.length, 0);
  geometry.dispose(); material.dispose(); texture.dispose();
});

test('gravity retains its procedural fallback for model-free simulations', () => {
  const effects = createSpellEffects(new THREE.Scene()), visual = effects.createProjectile();
  effects.launch(visual, 'gravityStaff', new THREE.Vector3(0, 1, 0));
  assert.ok(visual.gravityCore.visible && visual.gravity.visible);
  assert.equal(effects.telemetry.importedGravityProjectiles, 0);
  effects.dispose();
});

test('a northward Void throw does not flip at the top of its arc', () => {
  const effects = createSpellEffects(new THREE.Scene(), { gravityProjectilePrototype: new THREE.Group() });
  const visual = effects.createProjectile();
  const points = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1.01, -1),
    new THREE.Vector3(0, 1.01, -2), new THREE.Vector3(0, 1, -3)];
  effects.launch(visual, 'gravityStaff', points[0], Math.PI);
  let previous;
  for (let i = 1; i < points.length; i++) {
    effects.advance(visual, points[i - 1], points[i], .1, i * .1);
    if (previous) assert.ok(previous.angleTo(visual.group.quaternion) < .03, 'orientation stays continuous across the apex');
    previous = visual.group.quaternion.clone();
  }
  effects.dispose();
});
