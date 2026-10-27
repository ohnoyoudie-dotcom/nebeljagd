import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createWeapons } from '../src/weapons.js';
import { RARITIES, WEAPON_TYPES, weaponStats } from '../src/loot-tiers.js';

function setup(type = 'bow', rarity = 'common', { wallZ = null, targetZ = 4, visible = () => true } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const combat = createCombat();
  const target = combat.addTarget({ id: 'target', position: { x: 0, y: 0, z: targetZ }, radius: .65, maxHealth: 1000 });
  const world = { heightAt: () => 0, worldRadius: 500,
    traceProjectile(start, end) {
      if (wallZ === null || start.z > wallZ || end.z < wallZ || end.z === start.z) return null;
      const t = (wallZ - start.z) / (end.z - start.z);
      return { type: 'house', point: { x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t, z: wallZ }, normal: { x: 0, z: -1 } };
    } };
  const weapons = createWeapons(scene, actor, world, null, {
    combat, isVisible: visible, placements: [{ id: 'weapon', kind: type, rarity, position: [0, 0] }],
  });
  return { scene, actor, combat, target, weapons };
}

function attackOnce(instance, seconds = .9) {
  const { actor, weapons } = instance;
  weapons.interact(actor.position);
  weapons.attack(actor.position, 0);
  for (let time = 0; time < seconds; time += .04) weapons.update(.04, time, actor.position);
}

test('all five tiers increase the actual damage dealt for each weapon', () => {
  for (const type of WEAPON_TYPES) {
    let previous = 0;
    for (const rarity of Object.keys(RARITIES)) {
      const instance = setup(type, rarity, { targetZ: type === 'sword' ? 1.6 : 4 });
      attackOnce(instance);
      const damage = 1000 - instance.target.health;
      assert.equal(damage, weaponStats(type, rarity).damage, `${type}/${rarity} real hit`);
      assert.ok(damage > previous, `${type}/${rarity} increases damage`);
      assert.equal(instance.weapons.telemetry.damageHits, 1, 'single swing/projectile hits only once');
      assert.equal(instance.weapons.equippedItem.rarity, rarity);
      previous = damage;
    }
  }
});

test('burn damage integrates exact active time and ice slows then restores movement', () => {
  const fire = setup('fireStaff', 'rare'); attackOnce(fire);
  const directHealth = fire.target.health;
  assert.equal(fire.target.burnRemaining, 3);
  fire.combat.update(1.25); fire.combat.update(3);
  assert.ok(Math.abs(fire.target.health - (directHealth - 3 * weaponStats('fireStaff', 'rare').burn.damagePerSecond)) < 1e-7);
  assert.equal(fire.target.burnRemaining, 0);
  const afterBurn = fire.target.health; fire.combat.update(10);
  assert.equal(fire.target.health, afterBurn, 'burn cannot continue after expiry');

  const ice = setup('iceStaff'); attackOnce(ice);
  assert.equal(ice.target.speedMultiplier, .5);
  ice.combat.update(2.4); assert.equal(ice.target.speedMultiplier, .5);
  ice.combat.update(.11); assert.equal(ice.target.speedMultiplier, 1);
});

test('walls stop both elemental spells and melee, nearer targets intercept arrows first', () => {
  for (const type of WEAPON_TYPES) {
    const blocked = setup(type, 'legendary', { wallZ: .8, targetZ: type === 'sword' ? 1.6 : 4 });
    attackOnce(blocked);
    assert.equal(blocked.target.health, 1000, `${type} cannot damage through a wall`);
  }
  const front = setup('bow', 'common', { wallZ: 5, targetZ: 2 }); attackOnce(front);
  assert.equal(front.target.health, 1000 - weaponStats('bow').damage);
  assert.equal(front.weapons.telemetry.impacts, 0, 'target receives hit before far wall');
});

test('swept projectile collision does not skip a thin target at high speed', () => {
  const combat = createCombat();
  combat.addTarget({ id: 'owner', position: { x: 0, y: 0, z: 0 } });
  const near = combat.addTarget({ id: 'near', position: { x: 0, y: 0, z: 3 }, radius: .1 });
  combat.addTarget({ id: 'far', position: { x: 0, y: 0, z: 7 }, radius: .1 });
  const hit = combat.traceSegment({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 15 }, .05, 'owner');
  assert.equal(hit.target, near);
  assert.ok(hit.t > 0 && hit.t < .2);
  assert.equal(combat.traceSegment({ x: 0, y: 20, z: 0 }, { x: 0, y: 20, z: 15 }, .05, 'owner'), null, 'high projectile misses low targets');
});

test('concealed loot cannot be picked up; chest drops land once and disappear on reset', () => {
  let visible = false;
  const instance = setup('bow', 'common', { visible: () => visible });
  assert.equal(instance.weapons.nearest(instance.actor.position), null);
  assert.equal(instance.weapons.interact(instance.actor.position), null);
  visible = true;
  assert.equal(instance.weapons.interact(instance.actor.position).type, 'bow');
  const drop = instance.weapons.addDrop({ id: 'chest-loot', type: 'fireStaff', rarity: 'legendary', position: [.5, .5], origin: [0, 0] }, { pop: true });
  assert.equal(instance.weapons.nearest(instance.actor.position), null, 'airborne drop cannot be collected');
  for (let time = 0; time < 1; time += .1) instance.weapons.update(.1, time, instance.actor.position);
  assert.equal(instance.weapons.nearest(instance.actor.position).id, 'chest-loot');
  assert.equal(drop.group.position.x, .5);
  instance.weapons.reset();
  assert.equal(instance.weapons.items.length, 1);
  assert.equal(drop.group.parent, null);
  assert.equal(instance.weapons.equippedItem, null);
});

test('dead targets stop taking hits and reset clears every temporary status', () => {
  const combat = createCombat();
  const target = combat.addTarget({ id: 'test', position: { x: 0, y: 0, z: 0 }, maxHealth: 20 });
  combat.hit(target, { damage: 5, burn: { duration: 3, damagePerSecond: 10 }, slow: { duration: 4, multiplier: .5 } });
  combat.update(2);
  assert.equal(target.health, 0); assert.equal(target.alive, false);
  assert.equal(combat.hit(target, { damage: 5 }), null);
  combat.reset();
  assert.equal(target.health, 20); assert.equal(target.alive, true);
  assert.equal(target.burnRemaining, 0); assert.equal(target.slowRemaining, 0); assert.equal(target.speedMultiplier, 1);
});
