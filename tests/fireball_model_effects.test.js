import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';
import { createFireballMaterial } from '../src/fireball-material.js';

test('uploaded fire model uses independent animated materials without replacing ice or modifying the source', () => {
  const prototype = new THREE.Group();
  const original = new THREE.MeshStandardMaterial({ color: '#dd5c12' });
  const geometry = new THREE.IcosahedronGeometry(.2);
  prototype.add(new THREE.Mesh(geometry, original));
  const effects = createSpellEffects(new THREE.Scene(), { fireProjectilePrototype: prototype });
  const visual = effects.createProjectile(), point = new THREE.Vector3(0, 1.4, 0);
  effects.launch(visual, 'fireStaff', point);
  assert.ok(visual.fireModel.visible);
  assert.equal(visual.hotCore.visible, false);
  assert.equal(effects.telemetry.importedFireProjectiles, 1);
  assert.notEqual(visual.fireModel.children[0].material, original);
  assert.equal(visual.fireModel.children[0].geometry, geometry);
  assert.equal(original.userData.fireballShader, undefined);
  assert.ok(visual.fireModel.children[0].material.userData.fireballShader);
  effects.launch(visual, 'iceStaff', point);
  assert.equal(visual.fireModel.visible, false); assert.ok(visual.ice.visible);
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  effects.dispose(); assert.equal(disposed, 0, 'prototype resources remain owned by the model loader');
  geometry.dispose(); original.dispose();
});

test('fire emits a short, bounded smoke wake; pause, fog, expiry and reset retain their meaning', () => {
  let visible = true;
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, { isVisible: () => visible });
  const visual = effects.createProjectile(), a = new THREE.Vector3(0, 1.4, 0), b = new THREE.Vector3(0, 1.4, 3);
  effects.launch(visual, 'fireStaff', a); effects.advance(visual, a, b, .1, .1); effects.update(.1, .1);
  assert.ok(effects.telemetry.activeSmoke > 0 && effects.telemetry.visibleSmoke > 0);
  assert.ok(effects.telemetry.activeParticles > 0, 'the existing sparks remain alongside the smoke');
  const count = scene.children.length, sprites = scene.children.filter(p => p.name === 'Feuerball · kleine Rauchspur');
  assert.equal(sprites.length, 24);
  const before = sprites.map(p => [p.position.y, p.material.opacity]);
  effects.update(0, 100); assert.deepEqual(sprites.map(p => [p.position.y, p.material.opacity]), before);
  visible = false; effects.update(0, 100); assert.equal(effects.telemetry.visibleSmoke, 0);
  visible = true;
  for (let i = 0; i < 60; i++) effects.advance(visual, a, b, .1, i);
  assert.equal(scene.children.length, count); assert.ok(effects.telemetry.activeSmoke <= 24);
  for (let i = 0; i < 4; i++) effects.update(.2, i);
  assert.equal(effects.telemetry.activeSmoke, 0);
  effects.launch(visual, 'iceStaff', a); effects.advance(visual, a, b, .1, .1);
  assert.equal(effects.telemetry.activeSmoke, 0, 'ice does not acquire a fire smoke wake');
  effects.launch(visual, 'fireStaff', a); effects.advance(visual, a, b, .1, .1); effects.reset();
  assert.equal(effects.telemetry.activeSmoke, 0); assert.equal(effects.telemetry.visibleSmoke, 0);
  effects.dispose();
});

test('fire shader shares the simulation clock and preserves source PBR texture ownership', () => {
  const map = new THREE.Texture(), source = new THREE.MeshStandardMaterial({ map });
  const clock = { value: 0 }, material = createFireballMaterial(source, clock);
  const shader = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <emissivemap_fragment>' };
  material.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uFireballTime, clock);
  assert.match(shader.fragmentShader, /firePulse/);
  assert.equal(material.map, map); assert.equal(source.emissiveIntensity, 1);
  material.dispose(); source.dispose(); map.dispose();
});
