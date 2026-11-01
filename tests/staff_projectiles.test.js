import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCollisionIndex } from '../src/collision.js';
import { createCombat } from '../src/combat.js';
import { weaponStats } from '../src/loot-tiers.js';

const variants = { fireStaff: 'kit-tripo-lava-staff', iceStaff: 'kit-tripo-crystal-staff' };
const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const close = (actual, expected, message) => assert.ok(vector(actual).distanceTo(expected) < 1e-6, message);

function fixture({ type = 'fireStaff', scale = 1.2, yaw = 0, x = 0, y = 0, z = 0 } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(), combat = createCombat(); scene.add(actor);
  actor.position.set(x, y, z); actor.scale.setScalar(scale); actor.rotation.y = yaw;
  const prototypes = Object.fromEntries(Object.entries(variants).map(([kind, variant]) => {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(.14, 1.7, .08);
    geometry.translate(0, kind === 'fireStaff' ? .5 : .42, 0); geometry.computeBoundingBox();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#588b9e' }));
    mesh.name = `${variant}-model`; group.add(mesh); return [variant, group];
  }));
  let collision = null, time = 0;
  const traces = [];
  const world = { worldRadius: 500, heightAt: () => y,
    traceProjectile(start, end, radius) {
      traces.push({ start: vector(start), end: vector(end), radius });
      return collision?.traceSegment(start, end, radius) ?? null;
    } };
  const other = type === 'fireStaff' ? 'iceStaff' : 'fireStaff';
  const weapons = createWeapons(scene, actor, world, null, { combat, tripoPrototypes: prototypes, placements: [
    { id: 'first', kind: type, variant: variants[type], position: [x, z] },
    { id: 'second', kind: other, variant: variants[other], position: [x + 3, z] },
  ] });
  assert.equal(weapons.interact(actor.position).type, type);
  return { scene, actor, combat, weapons, traces,
    step(dt) { time += dt; weapons.update(dt, time, actor.position); },
    setColliders(boxes) { collision = createCollisionIndex([], boxes); return collision; },
    dispose() {
      weapons.dispose();
      for (const prototype of Object.values(prototypes)) prototype.traverse(part => {
        if (part.isMesh) { part.geometry.dispose(); part.material.dispose(); }
      });
    } };
}

test('both imported staffs release exactly from their transformed model tip at the release instant', () => {
  for (const type of Object.keys(variants)) {
    const instance = fixture({ type, scale: 1.3, yaw: .73, x: 7, y: 1.2, z: -4 });
    const { scene, actor, weapons, step } = instance;
    scene.position.set(-3, 2, 5); scene.rotation.y = -.21; scene.scale.setScalar(.8);
    weapons.attack(actor.position, actor.rotation.y); step(.25);
    scene.updateMatrixWorld(true);
    const held = actor.children.find(child => child.userData.weaponType === type);
    const model = held.getObjectByName(`${variants[type]}-model`);
    const expected = scene.worldToLocal(model.localToWorld(new THREE.Vector3(0, model.geometry.boundingBox.max.y, 0)));
    const state = weapons.telemetry;
    assert.equal(state.shotsFired, 1);
    assert.equal(state.spellsActive, 1);
    close(state.staffTip, expected, 'the inspector reports the actual visible crystal tip');
    close(state.lastSpellLaunch.position, expected, 'the launch event is at that same physical point');
    close(state.spells[0].position, expected, 'a frame ending exactly at release cannot advance the new projectile');
    assert.equal(state.lastSpellLaunch.flightHeight, state.lastSpellLaunch.position.y);
    assert.ok(Math.abs(expected.y - actor.position.y - 1.4) < 1e-6,
      'the physical crystal aims at body-relative firing height despite actor and scene transforms');
    step(0);
    close(weapons.telemetry.spells[0].position, expected, 'the pending release interval is not replayed during pause');
    instance.dispose();
  }
});

test('both staffs fly straight at crystal height for their full lifetime in every facing direction', () => {
  for (const type of Object.keys(variants)) for (const yaw of [0, .47, Math.PI / 2, -1.2]) {
    const instance = fixture({ type, yaw });
    const { actor, weapons, step } = instance;
    weapons.attack(actor.position, actor.rotation.y); step(.25);
    const launch = weapons.telemetry.lastSpellLaunch;
    for (let frame = 1; frame <= 65; frame++) {
      step(.02);
      const current = weapons.telemetry.spells[0].position;
      assert.equal(current.y, launch.position.y, 'height stays fixed, including after the former transition time');
      const elapsed = frame * .02;
      const expected = new THREE.Vector3(launch.position.x + Math.sin(yaw) * 18 * elapsed,
        launch.position.y, launch.position.z + Math.cos(yaw) * 18 * elapsed);
      close(current, expected, 'every point lies on the same horizontal ray at the existing speed');
    }
    step(.06);
    assert.equal(weapons.telemetry.spellsActive, 0, 'the original projectile lifetime is retained');
    instance.dispose();
  }

  const crossed = fixture();
  crossed.weapons.attack(crossed.actor.position, 0); crossed.step(.2); crossed.step(.08);
  const state = crossed.weapons.telemetry, origin = state.lastSpellLaunch.position, position = state.spells[0].position;
  assert.ok(Math.abs(Math.hypot(position.x - origin.x, position.z - origin.z) - 18 * .03) < 1e-7,
    'crossing release by 30 ms advances 30 ms, not the whole 80 ms frame');
  assert.equal(position.y, origin.y);
  crossed.dispose();

  for (const type of Object.keys(variants)) {
    const coarse = fixture({ type, y: 2.3 });
    coarse.weapons.attack(coarse.actor.position, 0); coarse.step(.24); coarse.step(.25);
    const state = coarse.weapons.telemetry, launch = state.lastSpellLaunch;
    assert.equal(state.shotsFired, 1);
    assert.ok(Math.abs(launch.position.y - 3.7) < 1e-6,
      'a frame skipping the peak casting pose still releases the physically aimed crystal');
    assert.ok(Math.abs(Math.hypot(state.spells[0].position.x - launch.position.x,
      state.spells[0].position.z - launch.position.z) - 18 * .24) < 1e-6);
    assert.equal(state.spells[0].position.y, launch.position.y);
    coarse.dispose();
  }
});

test('large-frame sweeps respect the real heights of obstacles and targets', () => {
  for (const type of Object.keys(variants)) {
    const instance = fixture({ type });
    const { actor, weapons, step } = instance;
    weapons.attack(actor.position, 0); step(.25);
    const tip = vector(weapons.telemetry.lastSpellLaunch.position);
    const box = (distance, minY, maxY, kind) => ({ minX: tip.x - .4, maxX: tip.x + .4,
      minZ: tip.z + distance, maxZ: tip.z + distance + .04, minY, maxY, type: kind });
    instance.setColliders([
      box(1.2, 0, tip.y - .3, 'low-barrier'),
      box(2.0, tip.y + .3, tip.y + 1, 'overhead-barrier'),
      box(3.0, tip.y - .2, tip.y + .2, 'crystal-height-barrier'),
    ]);
    step(.25);
    const state = weapons.telemetry;
    assert.equal(state.spellsActive, 0);
    assert.equal(state.lastImpact.type, 'crystal-height-barrier');
    assert.equal(state.lastImpact.point.y, tip.y);
    assert.ok(Math.abs(state.lastImpact.point.z - (tip.z + 3 - .13)) < 1e-7);
    for (let i = 0; i < 50; i++) step(.02);
    assert.equal(weapons.telemetry.effects.emitted[type].impacts, 1);
    instance.dispose();

    const targets = fixture({ type });
    targets.weapons.attack(targets.actor.position, 0); targets.step(.25);
    const start = targets.weapons.telemetry.lastSpellLaunch.position;
    const low = targets.combat.addTarget({ id: 'below-firing-plane-target',
      position: { x: start.x, y: 0, z: start.z + 1.5 }, height: .7, maxHealth: 500 });
    const tall = targets.combat.addTarget({ id: 'ordinary-height-opponent',
      position: { x: start.x, y: 0, z: start.z + 3.5 }, height: 2.25, maxHealth: 500 });
    assert.ok(start.y > low.height + .13 && start.y < tall.height,
      'only the low target lies below the actual firing plane');
    targets.step(.25);
    const hit = targets.weapons.telemetry;
    assert.equal(low.health, 500, 'a target below the actual flight ray is not silently made taller');
    assert.equal(tall.health, 500 - weaponStats(type).damage);
    assert.equal(hit.damageHits, 1);
    assert.equal(hit.effects.latestImpact.point.y, start.y);
    assert.equal(type === 'fireStaff' ? tall.burnRemaining : tall.slowRemaining,
      type === 'fireStaff' ? weaponStats(type).burn.duration : weaponStats(type).slow.duration);
    targets.dispose();
  }
});

test('switching staffs and resetting cannot carry an old launch height or release interval into a reused projectile', () => {
  const instance = fixture();
  const { actor, weapons, step } = instance;
  weapons.attack(actor.position, 0); step(.25); step(.03);
  const oldHeight = weapons.telemetry.lastSpellLaunch.position.y;
  actor.position.x = 3;
  assert.equal(weapons.interact(actor.position).type, 'iceStaff');
  weapons.attack(actor.position, 0); step(.25);
  assert.deepEqual(new Set(weapons.telemetry.spells.map(spell => spell.type)), new Set(['fireStaff', 'iceStaff']));
  weapons.reset();
  assert.equal(weapons.telemetry.lastSpellLaunch, null);
  assert.equal(weapons.telemetry.spellsActive, 0);
  assert.equal(weapons.telemetry.effects.activeTrails, 0);
  actor.position.set(0, 0, 0); actor.scale.setScalar(.8);
  weapons.interact(actor.position);
  actor.position.y = 2.5;
  weapons.attack(actor.position, 0); step(.25);
  const state = weapons.telemetry;
  assert.equal(state.shotsFired, 1);
  assert.equal(state.spellsActive, 1);
  close(state.spells[0].position, vector(state.staffTip), 'a reused slot starts at the newly scaled actor tip');
  assert.equal(state.lastSpellLaunch.type, 'fireStaff');
  assert.equal(state.lastSpellLaunch.flightHeight, state.lastSpellLaunch.position.y);
  assert.ok(Math.abs(state.lastSpellLaunch.flightHeight - oldHeight) > .5,
    'the elevated actor has a new firing height after reset');
  assert.ok(Math.abs(state.lastSpellLaunch.flightHeight - 3.9) < 1e-6,
    'firing height follows the new ground level even when the actor is rescaled');
  step(.16);
  assert.equal(weapons.telemetry.spells[0].position.y, state.lastSpellLaunch.flightHeight);
  instance.dispose();
});
