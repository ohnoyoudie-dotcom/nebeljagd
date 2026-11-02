import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSpecialWeapons, SPECIAL_RULES } from '../src/special-weapons.js';
import { createCombat } from '../src/combat.js';

function setup(traceProjectile = () => null) {
  const scene = new THREE.Scene(), combat = createCombat(), hits = [];
  const special = createSpecialWeapons(scene, { heightAt: () => 0, traceProjectile }, combat, 'player', result => hits.push(result));
  const player = new THREE.Vector3();
  let clock = 0;
  const tick = duration => { for (let left = duration; left > 1e-8;) { const dt = Math.min(left, .02); clock += dt; special.update(dt, player, clock); left -= dt; } };
  return { scene, combat, special, player, hits, tick };
}
const payload = { type: 'moonStaff', damage: 20 };
const origin = new THREE.Vector3(0, 1.4, 0);

test('moon pierces multiple enemies once per leg and returns at exactly twelve metres', () => {
  const { combat, special, tick, hits } = setup();
  for (const z of [3, 6, 10]) combat.addTarget({ id: `enemy-${z}`, position: { x: 0, y: 0, z }, maxHealth: 100 });
  special.launchMoon(origin, 0, payload);
  assert.equal(special.launchMoon(origin, 0, payload), false);
  tick(12 / 18);
  assert.equal(special.telemetry.moon.mode, 'returning');
  assert.ok(Math.abs(special.telemetry.moon.distance - 12) < 1e-6);
  assert.equal(hits.length, 3);
  tick(1); assert.equal(special.moonBusy, false); assert.equal(hits.length, 6);
  for (const target of combat.targets.values()) assert.equal(target.health, 60);
  special.dispose();
});

test('wall contact turns the crescent before a target behind the wall; return follows the moving owner', () => {
  const { combat, special, tick, player, hits } = setup((start, end) => {
    if (start.z < 5 && end.z >= 5) return { point: new THREE.Vector3(0, 1.4, 5) };
    return null;
  });
  combat.addTarget({ id: 'front', position: { x: 0, y: 0, z: 3 }, maxHealth: 100 });
  combat.addTarget({ id: 'behind', position: { x: 0, y: 0, z: 7 }, maxHealth: 100 });
  special.launchMoon(origin, 0, payload); tick(.3);
  assert.equal(special.telemetry.moon.mode, 'returning');
  player.x = -2; tick(1);
  assert.equal(special.moonBusy, false);
  assert.ok(hits.every(hit => hit.targetId === 'front'));
  assert.equal(combat.targets.get('behind').health, 100);
  special.dispose();
});

test('poison aiming clamps range, waits for release and clouds damage only reachable targets in their area', () => {
  const { special, combat, tick, hits } = setup();
  const player = new THREE.Vector3();
  special.beginAim(player, 0); special.aimAt(player, { x: 0, z: 100 });
  assert.equal(special.telemetry.target.z, SPECIAL_RULES.poisonRange);
  tick(2); assert.equal(special.telemetry.poisonProjectiles, 0); assert.equal(hits.length, 0);
  special.aimAt(player, { x: 0, z: 6 });
  combat.addTarget({ id: 'inside', position: { x: 0, y: 0, z: 6 }, maxHealth: 100 });
  combat.addTarget({ id: 'outside', position: { x: 8, y: 0, z: 6 }, maxHealth: 100 });
  special.releasePoison(origin, { type: 'poisonStaff', damage: 18, poison: { damagePerSecond: 5 } });
  tick(.6); assert.equal(special.telemetry.clouds.length, 1);
  const remaining = special.telemetry.clouds[0].remaining;
  assert.ok(remaining > 2.7 && remaining <= 3);
  tick(1); assert.ok(combat.targets.get('inside').health < 100); assert.equal(combat.targets.get('outside').health, 100);
  combat.targets.get('inside').position.x = 8;
  const health = combat.targets.get('inside').health; tick(2);
  assert.equal(combat.targets.get('inside').health, health); assert.equal(special.telemetry.clouds.length, 0);
  special.dispose();
});

test('cancel and reset discard held aim, flying projectiles and cloud meshes without firing', () => {
  const { special, player, scene } = setup();
  const initial = scene.children.length;
  special.beginAim(player, 0); special.cancelAim();
  assert.equal(special.releasePoison(origin, payload), false);
  special.launchMoon(origin, 0, payload); special.reset();
  assert.equal(special.moonBusy, false); assert.equal(special.telemetry.aiming, false);
  assert.equal(scene.children.length, initial); special.dispose(); assert.equal(scene.children.length, 0);
});

test('paused updates cannot apply moon hits or advance a projectile', () => {
  const { special, combat, player, hits } = setup();
  combat.addTarget({ id: 'overlap', position: { x: 0, y: 0, z: 0 }, maxHealth: 100 });
  special.launchMoon(origin, 0, payload);
  special.update(0, player, 1);
  assert.equal(hits.length, 0);
  assert.equal(special.telemetry.moon.distance, 0);
  special.dispose();
});

test('a landed poison cloud lasts exactly three seconds and stops damaging at expiry', () => {
  const { special, player, combat, tick } = setup();
  const target = combat.addTarget({ id: 'inside', position: { x: 0, y: 0, z: 3 }, maxHealth: 100 });
  special.beginAim(player, 0);
  special.releasePoison(origin, { type: 'poisonStaff', damage: 18 }, { point: new THREE.Vector3(0, 0, 3) });
  assert.equal(special.telemetry.clouds[0].remaining, 3);
  tick(2.98); assert.equal(special.telemetry.clouds.length, 1);
  tick(.02); assert.equal(special.telemetry.clouds.length, 0);
  assert.ok(Math.abs(target.health - 82) < 1e-6);
  tick(1); assert.ok(Math.abs(target.health - 82) < 1e-6);
  special.dispose();
});
