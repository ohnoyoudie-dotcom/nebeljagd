import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';

const staffTypes = ['fireStaff', 'iceStaff'];

function setup() {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const poses = [];
  let latest = null, time = 0;
  const character = {
    setCombatState(pose) {
      // The runtime reuses the pose and its vectors. Snapshot each call so
      // later weapon switches cannot rewrite the observations being tested.
      latest = pose ? { weapon: pose.weapon, phase: pose.phase,
        leftHand: pose.leftHand?.clone() ?? null, rightHand: pose.rightHand?.clone() ?? null } : null;
      poses.push(latest);
    },
    getHandPosition(side, target) {
      return target.copy(latest?.[`${side}Hand`] ?? new THREE.Vector3(0, 1, 0));
    },
    getGripPosition(side, target) { return this.getHandPosition(side, target); },
  };
  const placements = ['fireStaff', 'iceStaff', 'bow', 'sword'].map((kind, index) =>
    ({ id: kind, kind, position: [index * 4, 0] }));
  const world = { worldRadius: 1000, heightAt: () => 0, traceProjectile: () => null };
  const weapons = createWeapons(scene, actor, world, character, { placements });
  return { actor, weapons, poses, get pose() { return latest; },
    equip(kind) {
      const item = weapons.items.find(item => item.type === kind && !item.collected);
      assert.ok(item, `a ${kind} pickup is available`);
      actor.position.set(item.x, item.groundY, item.z);
      assert.equal(weapons.interact(actor.position)?.type, kind);
    },
    step(delta = 1 / 60) { time += delta; weapons.update(delta, time, actor.position); },
  };
}

function assertStaffPose(pose, kind) {
  assert.equal(pose?.weapon, kind);
  assert.equal(pose.leftHand, null, 'the free arm keeps its base animation instead of receiving a casting IK target');
  assert.ok(pose.rightHand?.toArray().every(Number.isFinite), 'the staff arm still has a valid IK target');
}

test('both staffs leave the free arm animated throughout channel, release and recovery while the staff arm casts', () => {
  for (const kind of staffTypes) {
    const fixture = setup(), { actor, weapons, poses } = fixture;
    try {
      fixture.equip(kind);
      const idle = fixture.pose.rightHand.clone();
      assertStaffPose(fixture.pose, kind);
      poses.length = 0;
      assert.equal(weapons.attack(actor.position, actor.rotation.y)?.type, kind);
      for (let frame = 0; frame < 70; frame++) {
        // Casting remains one-handed while the caller moves and turns the body.
        actor.position.z += .02; actor.rotation.y += .01;
        fixture.step();
      }
      for (const pose of poses) assertStaffPose(pose, kind);
      const phases = new Set(poses.map(pose => pose.phase));
      for (const phase of ['channel', 'release', 'recover', 'idle']) assert.ok(phases.has(phase), phase);
      assert.ok(Math.max(...poses.map(pose => pose.rightHand.y)) > idle.y + .12, 'the staff arm still rises');
      assert.ok(Math.max(...poses.map(pose => pose.rightHand.z)) > idle.z + .14, 'the staff arm still extends');
      assert.ok(fixture.pose.rightHand.distanceTo(idle) < 1e-6, 'recovery returns the staff arm to its held pose');
      assert.equal(weapons.telemetry.shotsFired, 1, 'the arm change does not interrupt spell release');
    } finally { weapons.dispose(); }
  }
});

test('switching from either staff restores both arm targets for the bow and sword, including an interrupted cast', () => {
  for (const kind of staffTypes) {
    for (const next of ['bow', 'sword']) {
      const fixture = setup(), { actor, weapons, poses } = fixture;
      try {
        fixture.equip(kind); weapons.attack(actor.position, 0); fixture.step(.1);
        assertStaffPose(fixture.pose, kind);
        fixture.equip(next);
        poses.length = 0;
        assert.equal(weapons.attack(actor.position, 0)?.type, next);
        for (let frame = 0; frame < 15; frame++) fixture.step();
        for (const pose of poses) {
          assert.equal(pose?.weapon, next);
          assert.ok(pose.leftHand?.toArray().every(Number.isFinite), `${next} regains its left arm target`);
          assert.ok(pose.rightHand?.toArray().every(Number.isFinite), `${next} retains its right arm target`);
        }
        for (const staff of staffTypes) assert.equal(weapons.telemetry.effects.emitted[staff].launches, 0,
          'switching weapons before release cancels the old spell');
        fixture.equip(kind); fixture.step();
        assertStaffPose(fixture.pose, kind);
      } finally { weapons.dispose(); }
    }
  }
});

test('rolling cancels staff casting and reset clears the pose without leaking a left arm target into later weapons', () => {
  for (const kind of staffTypes) {
    const fixture = setup(), { actor, weapons } = fixture;
    try {
      fixture.equip(kind); weapons.attack(actor.position, 0); fixture.step(.1);
      actor.userData.rolling = true;
      for (let frame = 0; frame < 8; frame++) {
        fixture.step();
        assert.equal(fixture.pose, null, 'rolling releases both combat arm overrides');
      }
      assert.equal(weapons.attack(actor.position, 0), null, 'a roll cannot restart the cancelled cast');
      actor.userData.rolling = false;
      for (let frame = 0; frame < 55; frame++) {
        fixture.step();
        assertStaffPose(fixture.pose, kind);
      }
      assert.equal(weapons.telemetry.shotsFired, 0, 'the interrupted cast does not resume after rolling');
      assert.equal(weapons.telemetry.effects.channelActive, false);
      weapons.attack(actor.position, 0); fixture.step(.1);
      weapons.reset();
      assert.equal(fixture.pose, null);
      fixture.step();
      assert.equal(fixture.pose, null, 'an empty inventory keeps both arm overrides cleared');
      assert.equal(weapons.telemetry.shotsFired, 0);
      fixture.equip('bow');
      assert.ok(fixture.pose.leftHand && fixture.pose.rightHand, 'reset followed by bow pickup restores both hands');
      fixture.equip(kind); fixture.step();
      assertStaffPose(fixture.pose, kind);
    } finally { weapons.dispose(); }
  }
});
