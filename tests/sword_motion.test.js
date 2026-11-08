import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { weaponStats } from '../src/loot-tiers.js';
import { createSwordPose, sampleSwordPose } from '../src/sword-motion.js';
import { swordPrototype } from './helpers/weapon-prototypes.js';

function setup(t, { targetZ = 1.6, health = 1000, wall = false, concealed = false } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const defeats = [];
  const combat = createCombat({ onDefeat: result => defeats.push(result) });
  const target = combat.addTarget({ id: 'enemy', position: { x: 0, y: 0, z: targetZ }, radius: .5,
    maxHealth: health, concealed });
  const world = { heightAt: () => 0, traceProjectile(start, end) {
    return wall && end.z > .8 ? { type: 'wall', point: { x: 0, y: 1, z: .8 } } : null;
  } };
  const weapons = createWeapons(scene, actor, world, null, { combat, tripoPrototypes: swordPrototype(), placements: [
    { id: 'sword', kind: 'sword', rarity: 'common', position: [0, 0] },
    { id: 'bow', kind: 'bow', rarity: 'common', position: [4, 0] },
  ] });
  assert.ok(Object.values(weapons.telemetry.heldPose.swordTip).every(Number.isFinite),
    'the lazy imported sword has finite telemetry before its first pickup');
  weapons.interact(actor.position); t.after(() => weapons.dispose());
  let time = 0;
  const advance = seconds => {
    let remaining = seconds;
    while (remaining > 1e-8) { const dt = Math.min(1 / 60, remaining); time += dt; weapons.update(dt, time); remaining -= dt; }
  };
  const attack = () => weapons.attack(actor.position, actor.rotation.y);
  return { scene, actor, target, weapons, defeats, advance, attack };
}

test('accepted sword attacks alternate three distinct motions without changing cooldown or damage', t => {
  const { weapons, target, advance, attack } = setup(t);
  const expected = ['forehand', 'backhand', 'overhead', 'forehand'];
  const damage = weaponStats('sword', 'common').damage;
  for (let index = 0; index < expected.length; index++) {
    assert.ok(attack());
    assert.equal(weapons.attackCooldown, .58);
    assert.equal(weapons.telemetry.swordCombo.pattern, expected[index]);
    assert.equal(weapons.telemetry.swordCombo.swingId, index + 1);
    for (let n = 0; n < 8; n++) assert.equal(attack(), null, 'cooldown rejects repeated input');
    assert.equal(weapons.telemetry.swordCombo.swingId, index + 1, 'rejected input cannot consume a combo step');
    advance(.2);
    assert.equal(target.health, 1000 - index * damage, 'preparation cannot deal early damage');
    advance(.4);
    assert.equal(target.health, 1000 - (index + 1) * damage, 'each swing deals exactly the original damage once');
    assert.equal(weapons.telemetry.damageHits, index + 1);
    assert.equal(weapons.telemetry.swordCombo.active, false);
  }
  const health = target.health; advance(.8);
  assert.equal(target.health, health, 'holding no input cannot create an extra attack');
});

test('combo expires after a pause, equipment changes, rolls and reset; canceled windup never hits', t => {
  const { actor, weapons, target, advance, attack } = setup(t);
  attack(); advance(1.6);
  assert.equal(weapons.telemetry.swordCombo.index, 0);
  attack(); assert.equal(weapons.telemetry.swordCombo.pattern, 'forehand'); advance(.6);
  attack(); assert.equal(weapons.telemetry.swordCombo.pattern, 'backhand'); advance(.1);
  const health = target.health;
  actor.userData.rolling = true; advance(.5);
  assert.equal(target.health, health, 'rolling cancels an attack before contact');
  assert.equal(weapons.telemetry.swordCombo.index, 0);
  assert.equal(weapons.telemetry.swordTrail.sampleCount, 0);
  assert.equal(weapons.telemetry.swordTrail.activeGlints, 0);
  assert.equal(attack(), null);
  actor.userData.rolling = false;
  attack(); assert.equal(weapons.telemetry.swordCombo.pattern, 'forehand'); advance(.6);
  actor.position.x = 4; weapons.interact(actor.position);
  assert.equal(weapons.equipped, 'bow'); assert.equal(weapons.telemetry.swordCombo.index, 0);
  weapons.interact(actor.position);
  assert.equal(weapons.equipped, 'sword'); attack();
  assert.equal(weapons.telemetry.swordCombo.pattern, 'forehand');
  weapons.reset(); advance(.8);
  assert.equal(target.health, health - weaponStats('sword', 'common').damage);
  assert.equal(weapons.telemetry.swordCombo.swingId, 0);
  assert.equal(weapons.telemetry.swordCombo.active, false);
  assert.equal(weapons.telemetry.swordTrail.swingCount, 0);
});

test('every pattern respects walls, original melee reach and one defeat per target', t => {
  for (const options of [{ wall: true }, { targetZ: 5 }]) {
    const { target, weapons, advance, attack } = setup(t, options);
    for (let i = 0; i < 3; i++) { attack(); advance(.6); }
    assert.equal(target.health, 1000);
    assert.equal(weapons.telemetry.damageHits, 0);
    assert.equal(weapons.telemetry.swordTrail.impactCount, 0, 'misses and blocked attacks create no hit sparks');
  }
  const { target, defeats, advance, attack } = setup(t, { health: 1 });
  for (let i = 0; i < 4; i++) { attack(); advance(.6); }
  assert.equal(target.health, 0); assert.equal(defeats.length, 1, 'trails and later swings cannot award phantom kills');
});

test('hit sparks require a confirmed visible target and the trail follows player concealment', t => {
  for (const concealed of [false, true]) {
    const { actor, weapons, target, advance, attack } = setup(t, { concealed });
    actor.userData.concealmentOpacity = .45;
    attack(); advance(.25);
    assert.equal(weapons.telemetry.damageHits, 1);
    assert.ok(target.health < 1000, 'concealment does not alter actual melee damage');
    assert.equal(weapons.telemetry.swordTrail.impactCount, concealed ? 0 : 1,
      'a hidden enemy cannot be revealed by a hit sparkle');
    assert.equal(weapons.telemetry.swordTrail.opacity, .45);
    advance(.6);
    assert.equal(weapons.telemetry.swordTrail.trailActive, false, 'the blade trail clears after its short tail');
    assert.equal(weapons.telemetry.swordTrail.activeGlints, 0);
  }
});

test('forehand descends, backhand rises, overhead drops vertically, and all recover smoothly to guard', () => {
  const paths = [0, 1, 2].map(index => {
    const result = createSwordPose(), start = {}, end = {};
    const tip = p => {
      sampleSwordPose(index, p, true, result);
      return result.rightHand.clone().addScaledVector(result.bladeDirection, .8);
    };
    start.tip = tip(.18); end.tip = tip(.54);
    let previous = tip(0), largestStep = 0;
    for (let frame = 1; frame <= 60; frame++) {
      const current = tip(frame / 60); largestStep = Math.max(largestStep, current.distanceTo(previous)); previous = current;
    }
    assert.ok(largestStep < .27, 'a swing has no discontinuous blade jump');
    const resting = sampleSwordPose(index, 0, false, createSwordPose());
    assert.ok(result.rightHand.distanceTo(resting.rightHand) < 1e-12);
    assert.ok(result.bladeDirection.distanceTo(resting.bladeDirection) < 1e-12);
    assert.equal(result.swordWeight, 0); assert.equal(result.chestLean, 0);
    return { start: start.tip, end: end.tip };
  });
  assert.ok(paths[0].end.x - paths[0].start.x > 1.8 && paths[0].end.y < paths[0].start.y - .7);
  assert.ok(paths[1].end.x - paths[1].start.x < -1.8 && paths[1].end.y > paths[1].start.y + .7);
  assert.ok(paths[2].start.y - paths[2].end.y > 1.8 && Math.abs(paths[2].end.x - paths[2].start.x) < .2);
});

test('trail anchors follow the transformed physical blade and exclude the grip', t => {
  const { scene, actor, weapons, advance, attack } = setup(t, { targetZ: 5 });
  scene.position.set(7, 3, -8); scene.rotation.y = -.4; scene.scale.setScalar(1.2);
  actor.position.set(5, 2, -4); actor.rotation.y = .8; actor.scale.setScalar(1.3);
  attack(); advance(.28);
  const held = actor.children.find(child => child.userData.weaponType === 'sword');
  assert.equal(held.userData.model, 'tripo');
  assert.equal(held.userData.variant, 'kit-tripo-sword');
  const measuredTip = new THREE.Vector3().fromArray(held.userData.weaponTipPoint);
  const expectedTip = scene.worldToLocal(held.localToWorld(measuredTip.clone()));
  const expectedBase = scene.worldToLocal(held.localToWorld(measuredTip.clone().multiplyScalar(.27)));
  const anchors = weapons.telemetry.swordBlade;
  const vector = p => new THREE.Vector3(p.x, p.y, p.z);
  assert.ok(vector(anchors.tip).distanceTo(expectedTip) < 1e-10);
  assert.ok(vector(anchors.base).distanceTo(expectedBase) < 1e-10);
  assert.ok(vector(weapons.telemetry.swordTrail.latestTip).distanceTo(expectedTip) < 1e-10);
  assert.ok(vector(weapons.telemetry.swordTrail.latestBase).distanceTo(expectedBase) < 1e-10);
  assert.ok(expectedBase.distanceTo(scene.worldToLocal(held.getWorldPosition(new THREE.Vector3()))) > .2,
    'the imported blade begins beyond the hand and crossguard');
});
