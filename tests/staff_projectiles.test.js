import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCollisionIndex } from '../src/collision.js';

const variants = { fireStaff: 'kit-tripo-lava-staff', iceStaff: 'kit-tripo-crystal-staff' };
const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const close = (actual, expected, message) => assert.ok(vector(actual).distanceTo(expected) < 1e-6, message);

function fixture({ type = 'fireStaff', scale = 1.2, yaw = 0, x = 0, y = 0, z = 0 } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
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
  const weapons = createWeapons(scene, actor, world, null, { tripoPrototypes: prototypes, placements: [
    { id: 'first', kind: type, variant: variants[type], position: [x, z] },
    { id: 'second', kind: other, variant: variants[other], position: [x + 3, z] },
  ] });
  assert.equal(weapons.interact(actor.position).type, type);
  return { scene, actor, weapons, traces,
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
    assert.ok(expected.y > state.lastSpellLaunch.flightHeight + .5);
    step(0);
    close(weapons.telemetry.spells[0].position, expected, 'the pending release interval is not replayed during pause');
    instance.dispose();
  }
});

test('staff projectiles descend continuously to the aiming plane and only use elapsed time after release', () => {
  const instance = fixture({ yaw: .47 });
  const { actor, weapons, step } = instance;
  weapons.attack(actor.position, actor.rotation.y); step(.25);
  const launch = weapons.telemetry.lastSpellLaunch;
  let previous = vector(launch.position);
  for (let frame = 1; frame <= 16; frame++) {
    step(.01);
    const current = vector(weapons.telemetry.spells[0].position);
    assert.ok(current.y <= previous.y + 1e-7 && current.y >= launch.flightHeight - 1e-7);
    assert.ok(previous.y - current.y < (launch.position.y - launch.flightHeight) * .15,
      'individual small frames cannot teleport the projectile to chest height');
    if (frame < 14) assert.ok(current.y > launch.flightHeight);
    assert.ok(Math.abs(Math.hypot(current.x - previous.x, current.z - previous.z) - .18) < 1e-6,
      'the existing horizontal speed is unchanged');
    previous = current;
  }
  assert.ok(Math.abs(previous.y - launch.flightHeight) < 1e-7);
  instance.dispose();

  const crossed = fixture();
  crossed.weapons.attack(crossed.actor.position, 0); crossed.step(.2); crossed.step(.08);
  const state = crossed.weapons.telemetry, origin = state.lastSpellLaunch.position, position = state.spells[0].position;
  assert.ok(Math.abs(Math.hypot(position.x - origin.x, position.z - origin.z) - 18 * .03) < 1e-7,
    'crossing release by 30 ms advances 30 ms, not the whole 80 ms frame');
  assert.ok(position.y < origin.y && position.y > state.lastSpellLaunch.flightHeight);
  crossed.dispose();
});

test('a large frame sweeps the curved launch path into a thin low obstacle that a straight chord misses', () => {
  const instance = fixture();
  const { actor, weapons, step, traces } = instance;
  weapons.attack(actor.position, 0); step(.25);
  const launch = weapons.telemetry.lastSpellLaunch, tip = vector(launch.position);
  const height = tip.y - launch.flightHeight;
  const collision = instance.setColliders([{
    minX: tip.x - .4, maxX: tip.x + .4, minZ: tip.z + 1.44, maxZ: tip.z + 1.48,
    minY: launch.flightHeight + height * .34, maxY: launch.flightHeight + height * .48,
    type: 'low-barrier',
  }]);
  const end = new THREE.Vector3(tip.x, launch.flightHeight, tip.z + 18 * .25);
  assert.equal(collision.traceSegment(tip, end, .13), null, 'the old straight-frame shortcut would miss this obstacle');
  traces.length = 0; step(.25);
  const state = weapons.telemetry;
  assert.ok(traces.length > 1, 'the descending path is checked between its endpoints');
  assert.equal(state.spellsActive, 0);
  assert.equal(state.lastImpact.type, 'low-barrier');
  assert.equal(state.effects.emitted.fireStaff.impacts, 1);
  assert.ok(state.lastImpact.point.z < tip.z + 1.44);
  for (let i = 0; i < 50; i++) step(.02);
  assert.equal(weapons.telemetry.effects.emitted.fireStaff.impacts, 1);
  instance.dispose();
});

test('switching staffs and resetting cannot carry an old launch height or release interval into a reused projectile', () => {
  const instance = fixture();
  const { actor, weapons, step } = instance;
  weapons.attack(actor.position, 0); step(.25); step(.03);
  actor.position.x = 3;
  assert.equal(weapons.interact(actor.position).type, 'iceStaff');
  weapons.attack(actor.position, 0); step(.25);
  assert.deepEqual(new Set(weapons.telemetry.spells.map(spell => spell.type)), new Set(['fireStaff', 'iceStaff']));
  weapons.reset();
  assert.equal(weapons.telemetry.lastSpellLaunch, null);
  assert.equal(weapons.telemetry.spellsActive, 0);
  assert.equal(weapons.telemetry.effects.activeTrails, 0);
  actor.position.set(0, 0, 0); actor.scale.setScalar(.8);
  weapons.interact(actor.position); weapons.attack(actor.position, 0); step(.25);
  const state = weapons.telemetry;
  assert.equal(state.shotsFired, 1);
  assert.equal(state.spellsActive, 1);
  close(state.spells[0].position, vector(state.staffTip), 'a reused slot starts at the newly scaled actor tip');
  assert.equal(state.lastSpellLaunch.type, 'fireStaff');
  assert.equal(state.lastSpellLaunch.flightHeight, 1.4);
  step(.16);
  assert.ok(Math.abs(weapons.telemetry.spells[0].position.y - 1.4) < 1e-7);
  instance.dispose();
});
