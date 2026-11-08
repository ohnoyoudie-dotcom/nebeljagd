import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCollisionIndex } from '../src/collision.js';
import { createSightModel } from '../src/visibility-model.js';
import { traceRangedProjectile } from '../src/projectile-collision.js';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { createSpecialWeapons } from '../src/special-weapons.js';

const prototypes = Object.fromEntries([
  ['tripo-weapons', 'lava-staff'], ['tripo-weapons', 'crystal-staff'],
  ['tripo-extra-weapons', 'poison-staff'], ['tripo-extra-weapons', 'moon-staff'], ['tripo-star-moon', 'star-staff'],
].map(([folder, id]) => {
  const info = JSON.parse(readFileSync(new URL(`../assets/imported/${folder}/inspections/${id}.json`, import.meta.url))).normalization;
  const [min, max] = info.gltfBounds, geometry = new THREE.BoxGeometry(...min.map((v, i) => max[i] - v));
  geometry.translate(...min.map((v, i) => (max[i] + v) / 2));
  const model = new THREE.Group(); model.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  if (info.tipPoint) model.userData.weaponTipPoint = info.tipPoint;
  return ['kit-tripo-' + id, model];
}));

const wall = (height, z = 3, type = 'wall', base = 0) => ({ type,
  minX: -2, maxX: 2, minZ: z - .1, maxZ: z + .1, minY: base, maxY: base + height });
function worldFor(bodies) {
  const index = createCollisionIndex([], bodies);
  return { heightAt: () => 0, traceProjectile: (...args) => index.traceSegment(...args), index };
}

test('ranged clearance agrees with sight at the two-metre boundary, including elevated and scaled barriers', () => {
  for (const type of ['wall', 'fence']) for (const base of [-5, 0, 20]) for (const height of [1.5, 1.99, 2, 2.01]) {
    const body = wall(height, 3, type, base), world = worldFor([body]);
    const start = { x: 0, y: base + 1.4, z: 0 }, end = { ...start, z: 6 };
    const sight = createSightModel({ obstacles: [body] }); sight.update({ ...start, y: base });
    assert.equal(sight.isVisible(end), height < 2);
    assert.equal(Boolean(traceRangedProjectile(world, start, end, .15)), height >= 2);
    assert.ok(world.traceProjectile(start, end, .15), 'physical reach still meets the barrier');
    const position = { x: 0, z: 3 }; world.index.resolve(position, .42);
    assert.ok(Math.abs(position.z - 3) > .4, 'movement remains blocked');
  }
  const local = { ...wall(1), worldBody: { ...wall(2), barrierHeight: 2 } };
  const start = { x: 0, y: .7, z: 0 }, end = { ...start, z: 6 };
  assert.ok(traceRangedProjectile(worldFor([local]), start, end, .05), 'world metres govern a scaled local collider');
});

test('skipping low cover finds the next solid obstacle and preserves house walls, props and openings', () => {
  const start = { x: 0, y: 1.4, z: 0 }, end = { ...start, z: 10 };
  const low = wall(1.99, 2), high = wall(2, 6);
  const world = worldFor([low, high]);
  assert.equal(traceRangedProjectile(world, start, end, .13).collider, high);
  high.destroyed = true; assert.equal(traceRangedProjectile(world, start, end, .13), null);
  for (const type of ['house-wall', 'crate', 'barrel', 'well-post', 'tree']) {
    const prop = wall(1.99, 3, type);
    assert.equal(traceRangedProjectile(worldFor([prop]), start, end, .13).collider, prop, type);
  }
  assert.equal(traceRangedProjectile(worldFor([{ ...wall(3), maxX: -1 }, { ...wall(3), minX: 1 }]), start, end, .13), null);
});

test('arrows, fire, ice, star and moon shots clear low walls/fences at the muzzle and in flight', () => {
  for (const type of ['bow', 'fireStaff', 'iceStaff', 'starStaff', 'moonStaff'])
    for (const kind of ['wall', 'fence']) for (const height of [1.99, 2]) for (const distance of [.6, 3]) for (const dt of [1/60, .25]) {
      const scene = new THREE.Scene(), actor = new THREE.Group(); actor.scale.setScalar(1.2); scene.add(actor);
      const combat = createCombat(), target = combat.addTarget({ id: 'target', position: { x: 0, y: 0, z: 6 }, radius: .65, height: 2.25, maxHealth: 200 });
      const world = worldFor([wall(height, distance, kind)]);
      const variant = { fireStaff: 'kit-tripo-lava-staff', iceStaff: 'kit-tripo-crystal-staff' }[type];
      const weapons = createWeapons(scene, actor, world, null, { combat, tripoPrototypes: prototypes, placements: [{ id: 'weapon', kind: type, variant, position: [0, 0] }] });
      try {
        weapons.interact(actor.position); weapons.attack(actor.position, 0);
        if (type === 'bow') weapons.releaseAttack(actor.position);
        for (let t = dt; t <= 2 + 1e-7; t += dt) weapons.update(dt, t, actor.position);
        assert.equal(target.health < 200, height < 2, `${type}, ${kind} ${height}m at ${distance}m, dt=${dt}`);
        if (type === 'moonStaff') assert.equal(weapons.telemetry.special.moonImpacts.bursts, height < 2 ? 0 : 1);
      } finally { weapons.dispose(); }
    }
});

test('poison clears low cover at release and descent while high cover still intercepts its arc', () => {
  for (const height of [1.99, 2]) {
    const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
    const weapons = createWeapons(scene, actor, worldFor([wall(height, .6)]), null,
      { tripoPrototypes: prototypes, placements: [{ id: 'poison', kind: 'poisonStaff', position: [0, 0] }] });
    try {
      weapons.interact(actor.position); weapons.attack(actor.position, 0); weapons.aimAt(actor.position, { x: 0, z: 10 });
      assert.equal(weapons.releaseAttack(actor.position), true);
      assert.equal(weapons.telemetry.special.poisonProjectiles, height < 2 ? 1 : 0);
    } finally { weapons.dispose(); }
  }
  for (const height of [1.99, 8]) for (const dt of [1/60, .25]) {
    const scene = new THREE.Scene(), player = new THREE.Vector3();
    const special = createSpecialWeapons(scene, worldFor([wall(height, 9.5)]), null, 'player', () => {});
    try {
      special.beginAim(player, 0); special.aimAt(player, { x: 0, z: 10 });
      special.releasePoison(new THREE.Vector3(0, 1.4, .8), { type: 'poisonStaff' });
      for (let t = dt; t < 2; t += dt) special.update(dt, player, t);
      const cloud = special.telemetry.clouds[0]; assert.ok(cloud);
      assert.equal(cloud.position.z >= 9.99, height < 2, 'low cover cannot stop a descending projectile');
    } finally { special.dispose(); }
  }
});
