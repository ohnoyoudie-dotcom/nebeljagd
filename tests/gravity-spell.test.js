import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createGravitySpell, GRAVITY_RULES, gravityPullStep } from '../src/gravity-spell.js';

function scenario(blocked = false) {
  const scene = new THREE.Scene();
  const world = {
    heightAt: () => 0, isLand: () => true, isWater: () => false,
    traceProjectile: blocked ? () => ({ type: 'wall' }) : () => null,
    resolveMovement: () => {},
  };
  const combat = createCombat();
  const opponentPosition = new THREE.Vector3(1.8, 0, 0);
  const opponent = combat.addTarget({ id: 'opponent', position: opponentPosition, health: 100 });
  const hits = [];
  const gravity = createGravitySpell(scene, world, combat, 'player', result => hits.push(result));
  return { scene, world, combat, gravity, opponent, hits };
}

test('gravity uses a visible warning, limited pull, one explosion and a resettable lifecycle', () => {
  const { gravity, opponent, hits } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  assert.equal(gravity.beginAim(origin, 0), true);
  gravity.aimAt(origin, { x: 0, z: 0 });
  assert.equal(gravity.telemetry.aiming, true);
  assert.equal(gravity.release({ damage: 14 }), true);
  assert.equal(gravity.telemetry.active, true);
  gravity.update(.2, origin);
  assert.equal(opponent.position.x, 1.8);
  assert.equal(opponent.health, 100);
  gravity.update(.4, origin);
  assert.ok(opponent.position.x < 1.8);
  for (let i = 0; i < 8; i++) gravity.update(.2, origin, i * .2);
  assert.ok(opponent.position.x >= .2 - 1e-6);
  assert.ok(opponent.position.x <= .5);
  assert.equal(opponent.health, 86);
  assert.equal(hits.length, 1);
  assert.equal(gravity.telemetry.active, false);
  gravity.reset();
  assert.equal(gravity.telemetry.castCount, 0);
  gravity.dispose();
});

test('gravity respects world blockers and never pulls or damages through walls', () => {
  const { gravity, opponent, hits } = scenario(true);
  const origin = new THREE.Vector3(0, 0, 0);
  gravity.beginAim(origin, 0);
  gravity.aimAt(origin, { x: 0, z: 0 });
  gravity.release({ damage: 14 });
  for (let i = 0; i < 10; i++) gravity.update(.2, origin);
  assert.equal(opponent.position.x, 1.8);
  assert.equal(opponent.health, 100);
  assert.equal(hits.length, 0);
  gravity.dispose();
});

test('gravity target is capped at ten metres and can be cancelled', () => {
  const { gravity } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  gravity.beginAim(origin, 0);
  gravity.aimAt(origin, { x: 50, z: 0 });
  assert.ok(Math.abs(gravity.telemetry.aim.x - 10) < 1e-6);
  gravity.cancelAim();
  assert.equal(gravity.release({ damage: 14 }), false);
  assert.equal(gravity.telemetry.active, false);
  gravity.dispose();
});

test('pull cannot exceed 1.5m, cross the centre or run with zero dt', () => {
  assert.equal(GRAVITY_RULES.maxPull, 1.5);
  assert.equal(gravityPullStep(2, 0, 1), 1.5);
  assert.ok(Math.abs(gravityPullStep(2, 1.4, 1) - .1) < 1e-8);
  assert.equal(gravityPullStep(.1, 0, 1), 0);
  assert.equal(gravityPullStep(2, 0, 0), 0);
});
