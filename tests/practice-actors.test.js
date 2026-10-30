import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createPracticeActors } from '../src/practice-actors.js';

function fixture() {
  const combat = createCombat(), bars = new Map();
  const world = { spawn: { x: 0, z: 0 }, houses: [], heightAt: () => 0, isLand: () => true,
    isWater: () => false, concealmentAt: () => 0, resolveMovement: position => position };
  let canSee = true;
  const healthBars = { add: (id, value) => bars.set(id, value),
    set: (id, value) => Object.assign(bars.get(id), value), remove: id => bars.delete(id) };
  const actors = createPracticeActors(new THREE.Scene(), { world, combat, healthBars, vision: { isVisible: () => canSee } });
  return { actors, combat, bars, world, setVisible: value => { canSee = value; } };
}

test('ice really slows practice patrol distance and burn reduces its displayed health', () => {
  const { actors, combat, bars } = fixture();
  actors.update(.1, .1);
  const normalDistance = actors.inspect()[0].travelled;
  actors.reset();
  const target = combat.targets.get('practice-1');
  combat.hit(target, { damage: 10, slow: { duration: 3, multiplier: .4 }, burn: { duration: 2, damagePerSecond: 6 } });
  combat.update(.1); actors.update(.1, .2);
  const slowed = actors.inspect()[0];
  assert.ok(Math.abs(slowed.travelled / normalDistance - .4) < .00001);
  assert.equal(slowed.health, 129.4);
  assert.equal(bars.get('practice-1').health, slowed.health);
  assert.ok(slowed.burnRemaining > 0 && slowed.slowRemaining > 0);
  actors.dispose();
  assert.equal(combat.targets.size, 0); assert.equal(bars.size, 0);
});

test('hidden practice actors and bars reveal nothing; defeated actors stop until reset', () => {
  const { actors, combat, bars, setVisible, world } = fixture();
  setVisible(false); actors.update(.1, .1);
  assert.ok(actors.inspect().every(actor => !actor.visible));
  assert.ok([...bars.values()].every(bar => !bar.visible));
  setVisible(true); world.concealmentAt = () => 1; actors.update(.1, .2);
  assert.ok(actors.inspect().every(actor => !actor.visible));
  world.concealmentAt = () => 0;
  combat.hit('practice-1', { damage: 200 }); actors.update(.1, .3);
  const defeated = actors.inspect()[0]; actors.update(.1, .4);
  assert.equal(actors.inspect()[0].travelled, defeated.travelled);
  assert.equal(bars.get('practice-1').visible, false);
  actors.reset(); actors.update(.1, .5);
  assert.equal(actors.inspect()[0].health, 140);
  assert.equal(actors.inspect()[0].alive, true);
  actors.dispose();
});

test('player and live practice opponents keep solid personal space', () => {
  const { actors } = fixture();
  const opponent = actors.inspect()[0], player = { x: opponent.position.x, z: opponent.position.z };
  actors.update(.1, .1, player);
  const still = actors.inspect()[0];
  assert.equal(still.travelled, 0, 'an opponent turns instead of walking through the player');
  actors.resolvePlayerMovement(player, .42);
  assert.ok(Math.hypot(player.x - still.position.x, player.z - still.position.z) >= .94 - 1e-6);
  actors.dispose();
});

test('an imported island without safe practice space does not create figures in water', () => {
  const combat = createCombat();
  const actors = createPracticeActors(new THREE.Scene(), { world: {
    spawn: { x: 0, z: 0 }, isLand: () => true, isWater: () => true,
  }, combat });
  assert.deepEqual(actors.inspect(), []); assert.equal(combat.targets.size, 0);
  actors.dispose();
});

test('large rotated buildings do not get practice figures spawned in their outer rooms', () => {
  for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
    const combat = createCombat();
    const actors = createPracticeActors(new THREE.Scene(), { world: {
      spawn: { x: 0, z: 0 }, houses: [{ x: 0, z: 0, halfWidth: 35, halfDepth: 26, scale: 1, rotation }],
      isLand: () => true, isWater: () => false, heightAt: () => .42,
      resolveMovement: position => position,
    }, combat });
    assert.deepEqual(actors.inspect(), [], 'Every nearby candidate is inside the castle despite a walkable floor');
    assert.equal(combat.targets.size, 0);
    actors.dispose();
  }
});
