import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';
import { createElementMaterial, setElementMaterial } from '../src/spell-effect-materials.js';
import { createDamageFeedbackState } from '../src/damage-feedback.js';

test('poison and moon shots keep their own element identity without recoloring earlier fire or ice', () => {
  const scene = new THREE.Scene(), effects = createSpellEffects(scene);
  const point = new THREE.Vector3(0, 1.4, 0);
  const fire = effects.createProjectile(), ice = effects.createProjectile();
  effects.launch(fire, 'fireStaff', point);
  effects.launch(ice, 'iceStaff', point);
  const fireColor = fire.hotCore.material.color.getHex();
  const iceColor = ice.iceMists[0].material.uniforms.uMid.value.getHex();
  const poison = effects.createProjectile(), moon = effects.createProjectile();
  effects.launch(poison, 'poisonStaff', point);
  effects.launch(moon, 'moonStaff', point);
  assert.equal(poison.type, 'poisonStaff');
  assert.equal(moon.type, 'moonStaff');
  assert.equal(fire.hotCore.material.color.getHex(), fireColor);
  assert.equal(ice.iceMists[0].material.uniforms.uMid.value.getHex(), iceColor);
  assert.notEqual(poison.hotCore.material, fire.hotCore.material);
  assert.notEqual(moon.crystal.material, ice.crystal.material);
  const green = poison.fireTongues[0].material.uniforms.uMid.value;
  assert.ok(green.g > green.r && green.g > green.b, 'the poison body is green');
  const lavender = moon.iceMists[0].material.uniforms.uMid.value;
  assert.ok(lavender.b > lavender.g && lavender.r > lavender.g, 'moonlight is pale purple');
  assert.equal(poison.fire.visible, true);
  assert.equal(moon.ice.visible, true);
  effects.impact('poisonStaff', point);
  effects.impact('moonStaff', point);
  assert.deepEqual(effects.telemetry.emitted.poisonStaff, { launches: 1, impacts: 1 });
  assert.deepEqual(effects.telemetry.emitted.moonStaff, { launches: 1, impacts: 1 });
  assert.equal(effects.telemetry.emitted.fireStaff.impacts, 0);
  assert.equal(effects.telemetry.emitted.iceStaff.impacts, 0);
  effects.reset();
  assert.equal(effects.telemetry.emitted.poisonStaff.launches, 0);
  assert.equal(effects.telemetry.emitted.moonStaff.impacts, 0);
  effects.dispose();
});

test('new spell types respect fog, pause and bounded VFX reset just like the existing staffs', () => {
  let visible = false;
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, { isVisible: () => visible });
  const point = new THREE.Vector3(0, 1.4, 0);
  for (const type of ['poisonStaff', 'moonStaff']) {
    effects.launch(effects.createProjectile(), type, point);
    effects.channel(type, point, 0, .5);
    effects.fire(type, point);
    effects.impact(type, point);
  }
  effects.update(.02);
  assert.equal(effects.telemetry.visibleProjectiles, 0);
  assert.equal(effects.telemetry.visibleParticles, 0);
  assert.equal(effects.telemetry.channelVisible, false);
  assert.ok(effects.telemetry.bursts.every(burst => !burst.visible));
  visible = true;
  effects.update(0);
  assert.equal(effects.telemetry.visibleProjectiles, 2);
  assert.ok(effects.telemetry.visibleParticles > 0);
  const paused = effects.telemetry;
  effects.update(0, 1000);
  assert.deepEqual(effects.telemetry, paused);
  effects.reset();
  assert.equal(effects.telemetry.activeParticles, 0);
  assert.equal(effects.telemetry.activeBursts, 0);
  assert.equal(effects.telemetry.channelActive, false);
  effects.dispose();
});

test('element shaders retain matching family and cloud palettes for poison and moon', () => {
  const material = createElementMaterial('cloud', { value: 0 }, { type: 'poisonStaff' });
  assert.equal(material.uniforms.uIce.value, 0);
  assert.equal(material.uniforms.uCloudTint.value, 1);
  setElementMaterial(material, 'moonStaff');
  assert.equal(material.uniforms.uIce.value, 1);
  assert.equal(material.uniforms.uCloudTint.value, 1);
  setElementMaterial(material, 'fireStaff');
  assert.equal(material.uniforms.uIce.value, 0);
  assert.equal(material.uniforms.uCloudTint.value, 0);
  material.dispose();
});

test('poison ticks coalesce into green feedback without exposing hidden damage', () => {
  let visible = true;
  const feedback = createDamageFeedbackState({ isVisible: () => visible });
  const target = { id: 'poisoned-target', position: { x: 0, y: 0, z: 0 } };
  for (let i = 0; i < 21; i++) {
    feedback.addHit({ type: 'poison', damage: .2 }, target);
    feedback.update(1 / 60);
  }
  assert.equal(feedback.inspect().active.length, 1);
  assert.equal(feedback.inspect().active[0].text, '4.2');
  assert.equal(feedback.entries.find(entry => entry.remaining > 0).color, '#b7e883');
  feedback.addHit({ type: 'poison', damage: .2 }, target);
  visible = false;
  feedback.update(0);
  assert.equal(feedback.inspect().active.length, 0);
  assert.equal(feedback.inspect().pending.length, 0);
  visible = true;
  feedback.update(.5);
  assert.equal(feedback.inspect().active.length, 0);
});
