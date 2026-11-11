import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { gravityVortexMotion } from '../src/gravity-motion.js';
import { createGravityVisuals } from '../src/gravity-visuals.js';
import { GRAVITY_RULES as rules } from '../src/gravity-spell.js';

test('the bright burst front crosses the complete gameplay area before fading out', () => {
  const end = rules.warning + rules.pullDuration;
  assert.equal(gravityVortexMotion(end - .001, rules).burstRadius, 0);
  let previous = 0, crossed = false;
  for (let i = 0; i <= 30; i++) {
    const state = gravityVortexMotion(end + rules.afterglow * i / 30, rules);
    assert.ok(state.burstRadius >= previous); previous = state.burstRadius;
    if (!crossed && state.burstRadius >= rules.radius) {
      assert.ok(state.burstOpacity > .9, 'the outer edge receives a strong front'); crossed = true;
    }
  }
  assert.ok(crossed); assert.equal(gravityVortexMotion(end + rules.afterglow, rules).burstOpacity, 0);
});

test('the area burst follows the existing terrain surface and releases its borrowed geometry only once', () => {
  const scene = new THREE.Scene(), center = new THREE.Vector3(8, .5, 5);
  const visuals = createGravityVisuals(scene, rules, { heightAt: (x, z) => .03 * x + .01 * z });
  visuals.showField(center, rules.warning + rules.pullDuration + rules.afterglow * .55, true);
  const wave = scene.getObjectByName('Gravitation · letzter Flächenimpuls');
  const ground = scene.getObjectByName('Gravitationsfeld · gefärbter Bodenstrudel');
  assert.equal(wave.geometry, ground.geometry, 'no second terrain sampler or separate ring mesh');
  const positions = wave.geometry.attributes.position;
  assert.ok(Array.from({ length: positions.count }, (_, i) => Math.hypot(positions.getX(i), positions.getZ(i))).some(r => r < .01),
    'the burst geometry includes the interior');
  assert.ok(visuals.telemetry.burst.visible && visuals.telemetry.burst.radius >= rules.radius);
  assert.ok(visuals.telemetry.burst.opacity > .9 && visuals.telemetry.fieldDraws <= 15);
  let disposed = 0; wave.geometry.addEventListener('dispose', () => disposed++);
  visuals.hideField(); assert.equal(visuals.telemetry.burst.visible, false);
  assert.equal(visuals.telemetry.burst.radius, 0); assert.equal(visuals.telemetry.fieldDraws, 0);
  visuals.dispose(); visuals.dispose(); assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
});
