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
  assert.equal(special.telemetry.target.z, 0, 'aim starts at the player');
  tick(.3); assert.ok(Math.abs(special.telemetry.target.z-3)<1e-8);
  tick(.3); assert.ok(Math.abs(special.telemetry.target.z-6)<1e-8);
  tick(1.4); assert.equal(special.telemetry.target.z, SPECIAL_RULES.poisonRange); assert.equal(special.telemetry.poisonProjectiles, 0); assert.equal(hits.length, 0);
  special.aimAt(player, { x: 0, z: 6 });
  combat.addTarget({ id: 'inside', position: { x: 0, y: 0, z: 6 }, maxHealth: 100 });
  combat.addTarget({ id: 'outside', position: { x: 8, y: 0, z: 6 }, maxHealth: 100 });
  special.releasePoison(origin, { type: 'poisonStaff', damage: 18, poison: { damagePerSecond: 5 } });
  tick(.9); assert.equal(special.telemetry.clouds.length, 1);
  const remaining = special.telemetry.clouds[0].remaining;
  assert.ok(remaining > 2.7 && remaining <= 3);
  tick(1); assert.ok(combat.targets.get('inside').health < 100); assert.equal(combat.targets.get('outside').health, 100);
  combat.targets.get('inside').position.x = 8;
  const health = combat.targets.get('inside').health; tick(2);
  assert.equal(combat.targets.get('inside').health, health); assert.equal(special.telemetry.clouds.length, 0);
  special.dispose();
});

test('poison flies a high, slow artillery arc, freezes on pause and lands on the aimed terrain', () => {
  const { special, player, tick } = setup();
  special.beginAim(player, 0); special.aimAt(player, { x: 0, z: 12 }); special.update(SPECIAL_RULES.poisonChargeSeconds, player, 0);
  special.releasePoison(origin, { type: 'poisonStaff', damage: 18 });
  const flight = special.telemetry.poisonFlights[0];
  assert.ok(flight.duration > 1.4 && flight.duration < 1.5, '12 m shot takes about 1.42 seconds');
  tick(flight.duration / 2);
  const middle = special.telemetry.poisonFlights[0];
  assert.ok(middle.position.y > 4.7 && middle.position.y < 4.8, 'apex clears ordinary cover');
  assert.ok(Math.abs(middle.position.z - 6) < 1e-6);
  special.update(0, player, 100);
  assert.deepEqual(special.telemetry.poisonFlights[0], middle);
  tick(flight.duration / 2);
  assert.equal(special.telemetry.poisonProjectiles, 0);
  assert.equal(special.telemetry.clouds.length, 1);
  assert.ok(Math.abs(special.telemetry.clouds[0].position.z - 12) < 1e-6);
  assert.ok(Math.abs(special.telemetry.clouds[0].remaining - 3) < 1e-6);
  special.dispose();
});

test('a long frame sweeps the curved poison path over low cover and into a tall wall without tunnelling', () => {
  for (const height of [2, 6]) {
    const { special, player } = setup((start, end) => {
      if (start.z < 6 && end.z >= 6) {
        const t = (6 - start.z) / (end.z - start.z);
        const point = start.clone().lerp(end, t);
        if (point.y < height) return { point, t };
      }
      return null;
    });
    special.beginAim(player, 0); special.aimAt(player, { x: 0, z: 12 }); special.update(SPECIAL_RULES.poisonChargeSeconds, player, 0);
    special.releasePoison(origin, { type: 'poisonStaff', damage: 18 });
    const duration = special.telemetry.poisonFlights[0].duration;
    special.update(duration + .2, player, duration + .2);
    assert.equal(special.telemetry.poisonProjectiles, 0);
    const cloud = special.telemetry.clouds[0];
    assert.ok(Math.abs(cloud.position.z - (height === 2 ? 12 : 6)) < 1e-6);
    const postImpact = height === 2 ? .2 : duration / 2 + .2;
    assert.ok(Math.abs(cloud.remaining - (3 - postImpact)) < 1e-6, 'cloud time starts at contact, not at frame start');
    special.dispose();
  }
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


test('artillery range follows the character, clamps distant targets and disappears on cancel or release', () => {
  const { special, player, tick, scene } = setup();
  special.beginAim(player, 0);
  const range = scene.getObjectByName('Giftstab · maximale Reichweite');
  assert.ok(range.visible);
  assert.equal(special.telemetry.aimRange.radius, 0);
  player.set(4, 0, -2); tick(1.2);
  assert.equal(range.position.x, 4); assert.equal(range.position.z, -2);
  special.aimAt(player, { x: 100, z: 100 });
  assert.ok(Math.abs(Math.hypot(special.telemetry.target.x-4, special.telemetry.target.z+2)-12)<1e-8);
  special.cancelAim(); assert.equal(range.visible, false);
  special.beginAim(player, 0); special.releasePoison(origin, payload);
  assert.equal(range.visible, false); assert.equal(special.telemetry.aimRange, null);
  special.dispose();
});


test('hold duration alone controls short and long throws, pause freezes charge and the mouse direction can change', () => {
  for (const [hold,distance] of [[0,0],[.2,2],[.6,6],[1.2,12],[4,12]]) {
    const { special, player, tick } = setup();
    special.beginAim(player, 0); special.aimAt(player, {x:30,z:0});
    tick(hold);
    assert.ok(Math.abs(special.telemetry.target.x-distance)<1e-7);
    assert.equal(special.telemetry.target.z,0);
    const before=special.telemetry.aimRange;
    special.update(0,player,100);assert.deepEqual(special.telemetry.aimRange,before);
    special.aimAt(player,{x:-30,z:0});
    assert.ok(Math.abs(special.telemetry.target.x+distance)<1e-7);
    special.releasePoison(origin,payload);
    assert.ok(Math.abs(special.telemetry.poisonFlights[0].target.x+distance)<1e-7);
    assert.equal(special.releasePoison(origin,payload),false);
    special.beginAim(player,0);assert.equal(special.telemetry.aimRange.radius,0,'each press starts near again');
    special.aimAt(player,{x:2,z:0});tick(2);
    assert.equal(special.telemetry.target.x,2,'full charge never overshoots a nearby mouse target');
    special.dispose();
  }
});
