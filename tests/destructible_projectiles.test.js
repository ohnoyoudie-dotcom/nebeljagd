import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createWeapons } from '../src/weapons.js';
import { weaponStats } from '../src/loot-tiers.js';
import { TRIPO_PROP_DEFINITIONS } from '../src/map/tripo-prop-definitions.js';
import { traceCombatProjectile } from '../src/projectile-collision.js';

const barrelDefinition = TRIPO_PROP_DEFINITIONS.find(p => p.kind === 'barrel');
const models = {
  bow: ['kit-tripo-ornate-bow', 'tripo-extra-weapons', 'ornate-bow'],
  fireStaff: ['kit-tripo-lava-staff', 'tripo-weapons', 'lava-staff'],
  iceStaff: ['kit-tripo-crystal-staff', 'tripo-weapons', 'crystal-staff'],
  starStaff: ['kit-tripo-star-staff', 'tripo-star-moon', 'star-staff'],
  moonStaff: ['kit-tripo-moon-staff', 'tripo-extra-weapons', 'moon-staff'],
  poisonStaff: ['kit-tripo-poison-staff', 'tripo-extra-weapons', 'poison-staff'],
};
const types = ['sword', ...Object.keys(models)];

function prototype(type) {
  const model = new THREE.Group();
  let bounds = [[-.07, -.18, -.04], [.07, 1.07, .04]], normalization = {};
  if (models[type]) {
    const [, pack, asset] = models[type];
    normalization = JSON.parse(readFileSync(new URL(`../assets/imported/${pack}/inspections/${asset}.json`, import.meta.url))).normalization;
    bounds = normalization.gltfBounds;
  }
  const size = bounds[0].map((min, axis) => bounds[1][axis] - min);
  const center = bounds[0].map((min, axis) => (bounds[1][axis] + min) / 2);
  const geometry = new THREE.BoxGeometry(...size); geometry.translate(...center);
  const material = new THREE.MeshStandardMaterial();
  model.add(new THREE.Mesh(geometry, material));
  if (normalization.tipPoint) model.userData.weaponTipPoint = normalization.tipPoint;
  if (normalization.bowRig) model.userData.bowRig = normalization.bowRig;
  return { model, geometry, material };
}

function fixture(type, { blocked = false, behind = false, step = 1 / 60 } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); actor.scale.setScalar(1.2); scene.add(actor);
  const barrelZ = type === 'sword' ? 1.6 : 4;
  const bodies = barrelDefinition.walls.map(body => ({ ...body, objectId: 'barrel',
    minZ: body.minZ + barrelZ, maxZ: body.maxZ + barrelZ }));
  const boxes = [...bodies];
  if (blocked) boxes.unshift({ minX: -3, maxX: 3, minY: 0, maxY: 8,
    minZ: type === 'sword' ? .7 : 1.7, maxZ: type === 'sword' ? .8 : 1.8, type: 'house-wall', objectId: 'house' });
  const index = createCollisionIndex([], boxes), hits = [];
  const combat = createCombat({ onHit(result) {
    hits.push(result);
    if (result.targetId === 'barrel' && result.killed) bodies.forEach(body => { body.destroyed = true; });
  } });
  const barrel = combat.addTarget({ id: 'barrel', position: { x: 0, y: 0, z: barrelZ },
    radius: barrelDefinition.destructible.radius, height: barrelDefinition.height,
    maxHealth: barrelDefinition.destructible.health, destructible: true });
  const enemy = behind ? combat.addTarget({ id: 'behind', position: { x: 0, y: 0, z: barrelZ + 2 },
    radius: .65, height: 2.25, maxHealth: 100 }) : null;
  const world = { heightAt: () => 0, worldRadius: 100,
    traceProjectile: (a, b, radius, accepts) => index.traceSegment(a, b, radius, accepts) };
  // Keep the bow at a genuine height that intersects the barrel. This isolates
  // collider-to-damage routing from downward aiming, tested separately.
  const grip = new THREE.Vector3(.15, 1, .25);
  const character = { setCombatState() {}, getGripPosition: (_, out) => out.copy(grip),
    getHandPosition: (_, out) => out.copy(grip) };
  const proto = prototype(type), variant = models[type]?.[0] ?? 'kit-tripo-sword';
  const weapons = createWeapons(scene, actor, world, character, { combat,
    tripoPrototypes: { [variant]: proto.model },
    placements: [{ id: 'weapon', kind: type, variant, rarity: 'common', position: [0, 0] }] });
  assert.equal(weapons.interact(actor.position).type, type);
  let time = 0;
  const tick = duration => {
    for (let remaining = duration; remaining > 1e-8;) {
      const delta = Math.min(step, remaining); time += delta;
      weapons.update(delta, time, actor.position); combat.update(delta); remaining -= delta;
    }
  };
  return { actor, weapons, barrel, enemy, world, combat, hits, bodies, tick,
    attack() {
      assert.ok(weapons.attack(actor.position, 0), `${type} begins an attack`);
      if (type === 'bow') assert.equal(weapons.releaseAttack(actor.position), false);
      if (type === 'poisonStaff') {
        weapons.aimAt(actor.position, barrel.position); tick(1.2); assert.equal(weapons.releaseAttack(actor.position), true);
      }
      tick(type === 'poisonStaff' ? 4.8 : 2);
    },
    reset() { combat.reset(); weapons.reset(); bodies.forEach(body => { body.destroyed = false; }); weapons.interact(actor.position); },
    dispose() { weapons.dispose(); proto.geometry.dispose(); proto.material.dispose(); },
  };
}

test('physical barrel rim contacts apply damage before the smaller combat cylinder is reached', () => {
  const f = fixture('bow');
  try {
    const start = { x: .6, y: 1.2, z: 3.5 }, end = { x: .6, y: 1.2, z: 3.6 };
    assert.equal(f.combat.traceSegment(start, end, .055, 'player'), null,
      'this short frame ends before entering the cylindrical combat proxy');
    const solid = f.world.traceProjectile(start, end, .055);
    assert.equal(solid?.collider.objectId, 'barrel', 'the same frame touches the actual solid rim');
    const hit = traceCombatProjectile(f.world, f.combat, start, end, .055, 'player');
    assert.equal(hit?.target, f.barrel);
    assert.deepEqual(hit.point, solid.point, 'impact stays on the physical collider');
    const over = traceCombatProjectile(f.world, f.combat,
      { x: 0, y: 3, z: 3 }, { x: 0, y: 3, z: 5 }, .055, 'player');
    assert.equal(over, null, 'shots genuinely above the prop do not hit an inflated invisible box');
    f.combat.hit(f.barrel, { damage: 60, sourceId: 'player' });
    assert.equal(traceCombatProjectile(f.world, f.combat, start, end, .055, 'player'), null);
    f.reset();
    assert.equal(traceCombatProjectile(f.world, f.combat, start, end, .055, 'player')?.target, f.barrel);
    assert.equal(f.barrel.health, 60);
  } finally { f.dispose(); }
});

test('every weapon damages and eventually breaks the same 60-health barrel on real contact', () => {
  for (const type of types) for (const step of [1 / 60, .25]) {
    const f = fixture(type, { step });
    try {
      f.attack();
      assert.ok(f.barrel.health < 60, `${type} at ${step}s must damage the barrel`);
      assert.ok(f.hits.some(hit => hit.targetId === 'barrel' && hit.damage > 0));
      if (!['poisonStaff', 'moonStaff', 'fireStaff'].includes(type)) {
        assert.equal(f.barrel.health, 60 - weaponStats(type, 'common').damage);
      }
      for (let casts = 1; f.barrel.alive && casts < 8; casts++) f.attack();
      assert.equal(f.barrel.health, 0, `${type} can destroy the barrel without a sword swap`);
      assert.ok(f.bodies.every(body => body.destroyed));
      assert.equal(f.hits.filter(hit => hit.killed).length, 1, 'one destruction per life');
    } finally { f.dispose(); }
  }
});

test('collider damage routing preserves a nearer enemy and never invents damageable scenery', () => {
  const f = fixture('bow');
  try {
    const enemy = f.combat.addTarget({ id: 'front', position: { x: .6, y: 0, z: 2 }, radius: .2, height: 2, maxHealth: 100 });
    const hit = traceCombatProjectile(f.world, f.combat,
      { x: .6, y: 1.2, z: 1 }, { x: .6, y: 1.2, z: 5 }, .055, 'player');
    assert.equal(hit?.target, enemy, 'a farther barrel surface cannot steal the nearer entity hit');
    const start = { x: .6, y: 1.2, z: 3.5 }, end = { x: .6, y: 1.2, z: 3.6 };
    for (const state of [{ targetable: false, destructible: true }, { targetable: true, destructible: false }]) {
      Object.assign(f.barrel, state);
      const contact = traceCombatProjectile(f.world, f.combat, start, end, .055, 'player');
      assert.equal(contact?.target, undefined, 'only live targetable breakable scenery accepts collider damage');
      assert.equal(contact?.collider.objectId, 'barrel', 'the physical obstacle still stops the projectile');
    }
  } finally { f.dispose(); }
});

test('solid house cover still protects barrels from all seven weapons, including poison clouds', () => {
  for (const type of types) {
    const f = fixture(type, { blocked: true });
    try {
      f.attack();
      assert.equal(f.barrel.health, 60, `${type} cannot route damage through an unrelated wall`);
      assert.equal(f.hits.length, 0);
    } finally { f.dispose(); }
  }
});

test('a surviving barrel consumes ordinary projectiles and shields the enemy behind it', () => {
  for (const type of ['bow', 'fireStaff', 'iceStaff', 'starStaff', 'moonStaff']) {
    const f = fixture(type, { behind: true });
    try {
      f.attack();
      assert.ok(f.barrel.health > 0 && f.barrel.health < 60, `${type} hit the barrel`);
      assert.equal(f.enemy.health, 100, `${type} stops at the surviving barrel`);
    } finally { f.dispose(); }
  }
});
