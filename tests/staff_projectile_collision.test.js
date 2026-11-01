import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';

const TYPES = [
  ['fireStaff', 'kit-tripo-lava-staff', 'lava-staff'],
  ['iceStaff', 'kit-tripo-crystal-staff', 'crystal-staff'],
];
const DISTANCES = [1.2, 1.8, 2, 2.2, 2.6, 4];
const STEPS = [1 / 60, .1, .25];

function fixture(type, variant, asset, { enemyZ, boxes = [] } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  actor.scale.setScalar(1.2); // The real game's actor scale, not an unscaled test avatar.
  const bounds = JSON.parse(readFileSync(new URL(`../assets/imported/tripo-weapons/inspections/${asset}.json`, import.meta.url))).normalization.gltfBounds;
  const size = bounds[0].map((min, axis) => bounds[1][axis] - min);
  const center = bounds[0].map((min, axis) => (bounds[1][axis] + min) / 2);
  // The held-tip calculation uses these actual prepared-model bounds. A box
  // stands in for its vertices; neither the scale nor grip-to-tip height is a
  // hand-tuned shorter weapon that could hide the real launch-height bug.
  const geometry = new THREE.BoxGeometry(...size); geometry.translate(...center);
  const material = new THREE.MeshStandardMaterial();
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  const combat = createCombat();
  const target = Number.isFinite(enemyZ) ? combat.addTarget({ id: 'enemy',
    position: { x: 0, y: 0, z: enemyZ }, radius: .52, height: 2.25, maxHealth: 140 }) : null;
  const collisions = createCollisionIndex([], boxes);
  const world = { heightAt: () => 0, traceProjectile: (a, b, radius) => collisions.traceSegment(a, b, radius) };
  const weapons = createWeapons(scene, actor, world, null, { combat,
    tripoPrototypes: { [variant]: prototype },
    placements: [{ id: 'staff', kind: type, variant, position: [0, 0] }] });
  assert.equal(weapons.interact(actor.position).type, type);
  return { actor, weapons, target,
    fire(step) {
      weapons.attack(actor.position, 0);
      for (let time = step; time <= 1.25 + 1e-8; time += step) weapons.update(step, time, actor.position);
      return weapons.telemetry;
    },
    dispose() { weapons.dispose(); geometry.dispose(); material.dispose(); },
  };
}

const wall = (distance, height, type = 'front-wall') => ({
  minX: -2, maxX: 2, minZ: distance - .1, maxZ: distance + .1,
  minY: 0, maxY: height, type,
});

test('both full-height Tripo staffs hit close opponents across normal and large frames', () => {
  for (const args of TYPES) for (const distance of DISTANCES) for (const step of STEPS) {
    const f = fixture(...args, { enemyZ: distance });
    try {
      const state = f.fire(step);
      assert.equal(state.shotsFired, 1);
      assert.equal(state.damageHits, 1, `${args[0]}, enemy ${distance}m, frame ${step}s`);
      assert.equal(state.lastDamage.targetId, 'enemy');
      assert.ok(f.target.health < 140);
      assert.equal(state.spellsActive, 0, 'the first hit consumes the projectile');
      assert.equal(state.effects.emitted[args[0]].impacts, 1);
    } finally { f.dispose(); }
  }
});

test('near two- and two-and-a-half-metre walls stop both staffs without an elevated blind range', () => {
  for (const args of TYPES) for (const height of [2, 2.5]) for (const distance of DISTANCES) for (const step of STEPS) {
    const f = fixture(...args, { boxes: [wall(distance, height)] });
    try {
      const state = f.fire(step);
      assert.equal(state.lastImpact?.type, 'front-wall', `${args[0]}, wall ${height}m high at ${distance}m, frame ${step}s`);
      assert.equal(state.impacts, 1);
      assert.equal(state.spellsActive, 0);
      assert.ok(state.lastImpact.point.z <= distance + .1, 'impact occurs on the near wall, not behind it');
    } finally { f.dispose(); }
  }
});

test('close cover wins over a target and a second wall behind it, while an actual passage remains open', () => {
  for (const args of TYPES) for (const step of STEPS) {
    const blocked = fixture(...args, { enemyZ: 4, boxes: [wall(2, 2), wall(5, 3, 'rear-wall')] });
    try {
      const state = blocked.fire(step);
      assert.equal(state.lastImpact?.type, 'front-wall', `${args[0]} must hit the first wall`);
      assert.equal(state.damageHits, 0);
      assert.equal(blocked.target.health, 140, 'the target behind cover stays unharmed');
    } finally { blocked.dispose(); }
    const open = fixture(...args, { enemyZ: 4, boxes: [
      { ...wall(2, 2), maxX: -.9 }, { ...wall(2, 2), minX: .9 },
    ] });
    try {
      const state = open.fire(step);
      assert.equal(state.damageHits, 1, `${args[0]} must pass through the actual wall gap`);
      assert.equal(state.lastDamage.targetId, 'enemy');
    } finally { open.dispose(); }
  }
});

test('unobstructed flight starts at the aimed crystal and remains straight at its release height', () => {
  for (const args of TYPES) {
    const f = fixture(...args);
    try {
      f.weapons.attack(f.actor.position, 0); f.weapons.update(.25, .25, f.actor.position);
      const state = f.weapons.telemetry;
      assert.equal(state.spellsActive, 1);
      assert.deepEqual(state.lastSpellLaunch.position, state.staffTip);
      assert.deepEqual(state.spells[0].position, state.staffTip);
      assert.ok(Math.abs(state.staffTip.y - 1.4) < 1e-6, 'the physical crystal is aimed at the gameplay firing height');
      assert.equal(state.lastSpellLaunch.flightHeight, state.staffTip.y);
      for (let frame = 1; frame <= 20; frame++) {
        f.weapons.update(.02, .25 + frame * .02, f.actor.position);
        const flying = f.weapons.telemetry.spells[0].position;
        assert.ok(Math.abs(flying.y - state.staffTip.y) < 1e-6, 'the spell cannot rise or drop after launch');
        assert.ok(Math.abs(flying.z - state.staffTip.z - 18 * frame * .02) < 1e-6);
      }
    } finally { f.dispose(); }
  }
});
