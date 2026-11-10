import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createGravitySpell, GRAVITY_RULES, gravityPullStep } from '../src/gravity-spell.js';

function scenario(blocked = false, visible = () => true) {
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
  const gravity = createGravitySpell(scene, world, combat, 'player', result => hits.push(result), visible);
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

test('gravity grows its reachable distance while held and can be cancelled without casting', () => {
  const { gravity } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  gravity.beginAim(origin, 0);
  gravity.aimAt(origin, { x: 50, z: 0 });
  assert.equal(gravity.telemetry.aim.x, 0);
  gravity.update(1.5, origin);
  assert.ok(Math.abs(gravity.telemetry.aim.x - 5) < 1e-6);
  gravity.update(1.5, origin);
  assert.ok(Math.abs(gravity.telemetry.aim.x - 10) < 1e-6);
  gravity.cancelAim();
  assert.equal(gravity.release({ damage: 14 }), false);
  assert.equal(gravity.telemetry.active, false);
  gravity.dispose();
});

test('hold duration controls placement up to ten metres in three seconds, never the field size or damage', () => {
  for (const [held, distance] of [[0, 0], [.6, 2], [1.5, 5], [2.99, 10 * 2.99 / 3], [3, 10], [5, 10]]) {
    const { gravity } = scenario();
    const origin = new THREE.Vector3();
    gravity.beginAim(origin, 0); gravity.aimAt(origin, { x: 100, z: 0 });
    gravity.update(held, origin);
    assert.ok(Math.abs(gravity.telemetry.aim.x - distance) < 1e-8);
    assert.equal(gravity.telemetry.radius, 3.2);
    const before = gravity.telemetry;
    gravity.update(0, origin, 500); assert.deepEqual(gravity.telemetry, before, 'pause freezes charge and visuals');
    gravity.aimAt(origin, { x: -100, z: 0 });
    assert.ok(Math.abs(gravity.telemetry.aim.x + distance) < 1e-8, 'mouse changes direction at the current charge');
    gravity.release({ damage: 14 });
    assert.ok(Math.abs(gravity.telemetry.center.x + distance) < 1e-8);
    assert.equal(gravity.release({ damage: 14 }), false, 'release never fires twice');
    gravity.dispose();
  }
});

test('nearby targets are not overshot and the range follows a moving caster', () => {
  const { gravity, scene } = scenario();
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0); gravity.aimAt(origin, { x: 2, z: 0 }); gravity.update(3, origin);
  assert.equal(gravity.telemetry.aim.x, 2);
  origin.set(4, 0, -2); gravity.aimAt(origin, { x: 100, z: 100 }); gravity.update(.1, origin);
  assert.ok(Math.abs(Math.hypot(gravity.telemetry.aim.x - 4, gravity.telemetry.aim.z + 2) - 10) < 1e-8);
  assert.equal(scene.getObjectByName('Gravitationsstab · wachsende Reichweite').position.x, 4);
  gravity.cancelAim();
  gravity.beginAim(origin, 0); assert.equal(gravity.telemetry.aimRange.radius, 0, 'each press starts a fresh charge');
  gravity.dispose();
});

test('the larger field pulls and hits targets at three metres, with one hit and no damage during warning or pull', () => {
  const { gravity, combat, opponent, hits } = scenario();
  const origin = new THREE.Vector3(); opponent.position.x = 3.1;
  const outside = combat.addTarget({ id: 'outside', position: new THREE.Vector3(3.8, 0, 0), health: 100 });
  const owner = combat.addTarget({ id: 'player', position: new THREE.Vector3(), health: 100 });
  gravity.beginAim(origin, 0); gravity.release({ damage: 14 });
  gravity.update(.4, origin); assert.equal(opponent.position.x, 3.1);
  gravity.update(.98, origin); assert.equal(opponent.health, 100);
  assert.ok(opponent.position.x < 3.1 && opponent.position.x >= 1.6);
  gravity.update(.03, origin); assert.equal(opponent.health, 86); assert.equal(hits.length, 1);
  gravity.update(.6, origin); assert.equal(hits.length, 1);
  assert.equal(outside.health, 100); assert.equal(outside.position.x, 3.8); assert.equal(owner.health, 100);
  gravity.dispose();
});

test('the spatial vortex freezes on pause, respects visibility and releases its reusable resources', () => {
  let visible = true;
  const { gravity, scene } = scenario(false, () => visible); const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0); gravity.release({ damage: 14 }); gravity.update(.9, origin);
  const core = scene.getObjectByName('Gravitationsfeld · Singularität');
  const funnel = scene.getObjectByName('Gravitationsfeld · gekrümmter Sog');
  const debris = scene.getObjectByName('Gravitationsfeld · schwebende Trümmer');
  assert.ok(core.position.y > .8 && core.visible, 'the singularity floats above the ground');
  const bounds = new THREE.Box3().setFromBufferAttribute(funnel.geometry.attributes.position);
  assert.ok(bounds.max.y - bounds.min.y > 1, 'the vortex has physical height');
  assert.equal(debris.count, 56); assert.equal(gravity.telemetry.visuals.dustCount, 120);
  assert.ok(gravity.telemetry.visuals.fieldDraws <= 15, 'bounded effect draw count');
  const matrix = Array.from(debris.instanceMatrix.array), clock = funnel.material.uniforms.uAge.value;
  gravity.update(0, origin, 200);
  assert.deepEqual(Array.from(debris.instanceMatrix.array), matrix); assert.equal(funnel.material.uniforms.uAge.value, clock);
  visible = false; gravity.update(.02, origin); assert.equal(gravity.telemetry.visuals.fieldVisible, false);
  visible = true; gravity.update(.02, origin); assert.equal(gravity.telemetry.visuals.fieldVisible, true);
  let disposed = 0; funnel.geometry.addEventListener('dispose', () => disposed++);
  gravity.reset(); assert.equal(gravity.telemetry.visuals.fieldVisible, false);
  gravity.dispose(); assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
});

test('pull cannot exceed 1.5m, cross the centre or run with zero dt', () => {
  assert.equal(GRAVITY_RULES.maxPull, 1.5);
  assert.equal(gravityPullStep(2, 0, 1), 1.5);
  assert.ok(Math.abs(gravityPullStep(2, 1.4, 1) - .1) < 1e-8);
  assert.equal(gravityPullStep(.1, 0, 1), 0);
  assert.equal(gravityPullStep(2, 0, 0), 0);
});

test('enhanced gravity effect shows ground dust, victim tethers and a double shockwave without altering combat timing', () => {
  const { gravity, scene, opponent } = scenario();
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0);
  gravity.release({ damage: 14 });
  gravity.update(.2, origin, .2);
  assert.equal(opponent.health, 100, 'warning is non-damaging');
  const dust = scene.getObjectByName('Gravitationsfeld · angehobener Bodenstaub');
  const marker = scene.getObjectByName('Gravitation · Zugkraft am Gegner 1');
  const tether = scene.getObjectByName('Gravitation · Energiezüge zum Gegner');
  assert.ok(dust && marker && tether, 'visual-only reaction layers exist');
  gravity.update(.5, origin, .7);
  assert.equal(gravity.telemetry.visuals.phase, 'pull');
  assert.ok(dust.visible && marker.visible && tether.visible);
  assert.ok(tether.geometry.drawRange.count > 0);
  assert.ok(opponent.gravityVisual?.remaining > 0, 'actual movement drives the character response');
  assert.equal(opponent.health, 100, 'still no damage during pulling');
  gravity.update(.72, origin, 1.42);
  assert.equal(opponent.health, 86);
  assert.equal(gravity.telemetry.visuals.phase, 'collapse');
  assert.ok(scene.getObjectByName('Gravitation · Aufblitzen beim Kollaps').visible);
  gravity.reset();
  assert.equal(marker.visible, false);
  assert.equal(gravity.telemetry.visuals.affectedCount, 0);
  gravity.dispose();
});

test('target energy strands do not reveal an enemy hidden from the caster', () => {
  const { gravity, scene, opponent } = scenario(false, p => p.x < 1);
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0);
  gravity.release({ damage: 14 });
  gravity.update(.8, origin);
  assert.equal(gravity.telemetry.visuals.fieldVisible, true);
  assert.equal(gravity.telemetry.visuals.affectedCount, 0);
  assert.equal(scene.getObjectByName('Gravitation · Energiezüge zum Gegner').visible, false);
  assert.ok(opponent.position.x < 1.8, 'hidden target still receives the normal pull');
  gravity.dispose();
});
