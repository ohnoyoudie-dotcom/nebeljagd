import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gravityVortexMotion, GRAVITY_BURST_SECONDS } from '../src/gravity-motion.js';
import { createGravityVisuals } from '../src/gravity-visuals.js';
import { GRAVITY_RULES as rules } from '../src/gravity-spell.js';

test('the bright burst front crosses the complete gameplay area before fading out', () => {
  const end = rules.warning + rules.pullDuration;
  assert.equal(gravityVortexMotion(end - .001, rules).burstRadius, 0);
  let previous = 0, crossed = false;
  for (let i = 0; i <= 30; i++) {
    const state = gravityVortexMotion(end + GRAVITY_BURST_SECONDS * i / 30, rules);
    assert.ok(state.burstRadius >= previous); previous = state.burstRadius;
    if (!crossed && state.burstRadius >= rules.radius) {
      assert.ok(state.burstOpacity > .85, 'the outer edge receives a strong front'); crossed = true;
      assert.ok(gravityVortexMotion(end + GRAVITY_BURST_SECONDS * i / 30 + .1, rules).burstOpacity > .95,
        'a slow touch frame still sees the pressure front before its final fade');
    }

  }
  assert.ok(crossed); assert.equal(gravityVortexMotion(end + GRAVITY_BURST_SECONDS, rules).burstOpacity, 0);
});

test('the area burst follows the existing terrain surface and releases its borrowed geometry only once', () => {
  const scene = new THREE.Scene(), center = new THREE.Vector3(8, .5, 5);
  const visuals = createGravityVisuals(scene, rules, { heightAt: (x, z) => .03 * x + .01 * z });
  visuals.showField(center, rules.warning + rules.pullDuration + GRAVITY_BURST_SECONDS * .71, true);
  const wave = scene.getObjectByName('Gravitation · letzter Flächenimpuls');
  const ground = scene.getObjectByName('Gravitationsfeld · gefärbter Bodenstrudel');
  assert.equal(wave.geometry, ground.geometry, 'no second terrain sampler or separate ring mesh');
  const positions = wave.geometry.attributes.position;
  assert.ok(Array.from({ length: positions.count }, (_, i) => Math.hypot(positions.getX(i), positions.getZ(i))).some(r => r < .01),
    'the burst geometry includes the interior');
  assert.ok(visuals.telemetry.burst.visible && visuals.telemetry.burst.radius >= rules.radius);
  assert.ok(visuals.telemetry.burst.opacity > .85 && visuals.telemetry.fieldDraws <= 15);
  let disposed = 0; wave.geometry.addEventListener('dispose', () => disposed++);
  visuals.hideField(); assert.equal(visuals.telemetry.burst.visible, false);
  assert.equal(visuals.telemetry.burst.radius, 0); assert.equal(visuals.telemetry.fieldDraws, 0);
  visuals.dispose(); visuals.dispose(); assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
});


test('wave clears the vortex and central flash before reaching the edge and freezes deterministically', () => {
  const scene = new THREE.Scene(), center = new THREE.Vector3();
  const visuals = createGravityVisuals(scene, rules);
  const end = rules.warning + rules.pullDuration;
  visuals.showField(center, end - .04, true);
  assert.ok(visuals.telemetry.vortex.sphereVisible);
  assert.equal(visuals.telemetry.burst.visible, false);
  visuals.showField(center, end + .08, true);
  const flash = scene.getObjectByName('Gravitation · Aufblitzen beim Kollaps');
  assert.ok(flash.visible && flash.material.uniforms.uOpacity.value > 0);
  const wave = scene.getObjectByName('Gravitation · letzter Flächenimpuls');
  visuals.showField(center, end + .5, true);
  assert.equal(flash.visible, false); assert.equal(visuals.telemetry.vortex.surfaceOpacity, 0);
  assert.equal(visuals.telemetry.vortex.shellCount, 0);
  assert.ok(visuals.telemetry.burst.visible && visuals.telemetry.fieldDraws <= 2);
  const before = JSON.stringify(wave.material.uniforms);
  visuals.showField(center, end + .5, true); assert.equal(JSON.stringify(wave.material.uniforms), before);
  visuals.showField(center, end + GRAVITY_BURST_SECONDS, true);
  assert.equal(visuals.telemetry.burst.visible, false);
  visuals.dispose();
});
