import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/combat.js';

function setup(options = {}) {
  const hits = [], defeats = [];
  const combat = createCombat({ onHit: hit => hits.push(hit), onDefeat: hit => defeats.push(hit) });
  const target = combat.addTarget({ id: 'target', position: { x: 0, y: 0, z: 0 }, maxHealth: 100, ...options });
  return { combat, target, hits, defeats };
}

test('poison integrates only its active duration, including a longer final frame', () => {
  const { combat, target, hits } = setup();
  combat.hit(target, { damage: 7, type: 'poisonStaff', sourceId: 'caster',
    poison: { duration: 2.5, damagePerSecond: 4 } });
  combat.update(.75); combat.update(4);
  assert.equal(target.health, 83);
  assert.equal(target.poisonRemaining, 0);
  assert.equal(target.poisonDamagePerSecond, 0);
  assert.equal(target.poisonSourceId, undefined);
  assert.deepEqual(hits.slice(1).map(({damage, sourceId, type}) => ({damage, sourceId, type})), [
    { damage: 3, sourceId: 'caster', type: 'poison' },
    { damage: 7, sourceId: 'caster', type: 'poison' },
  ]);
  combat.update(100);
  assert.equal(target.health, 83, 'expired poison never continues dealing damage');
});

test('burn, poison and slow coexist while retaining independent caster credit', () => {
  const { combat, target, hits } = setup();
  combat.hit(target, { sourceId: 'fire-caster', burn: { duration: 2, damagePerSecond: 3 } });
  combat.hit(target, { sourceId: 'poison-caster', poison: { duration: 3, damagePerSecond: 5 },
    slow: { duration: 1, multiplier: .5 } });
  combat.update(.5);
  assert.equal(target.health, 96);
  assert.equal(target.speedMultiplier, .5);
  assert.equal(target.burnSourceId, 'fire-caster');
  assert.equal(target.poisonSourceId, 'poison-caster');
  assert.deepEqual(hits.slice(-2).map(({type, sourceId}) => ({type, sourceId})), [
    { type: 'burn', sourceId: 'fire-caster' },
    { type: 'poison', sourceId: 'poison-caster' },
  ]);
  combat.update(10);
  assert.equal(target.health, 79);
  assert.equal(target.speedMultiplier, 1);
});

test('weaker poison refresh preserves stronger credit while equal or stronger refresh can claim it', () => {
  const { combat, target } = setup();
  combat.hit(target, { sourceId: 'strong', poison: { duration: 2, damagePerSecond: 5 } });
  combat.hit(target, { sourceId: 'weak', poison: { duration: 3, damagePerSecond: 2 } });
  assert.equal(target.poisonSourceId, 'strong');
  assert.equal(target.poisonRemaining, 3);
  assert.equal(target.poisonDamagePerSecond, 5);
  combat.hit(target, { sourceId: 'equal', poison: { duration: 1, damagePerSecond: 5 } });
  assert.equal(target.poisonSourceId, 'equal');
  combat.hit(target, { sourceId: 'strongest', poison: { duration: 1, damagePerSecond: 6 } });
  assert.equal(target.poisonSourceId, 'strongest');
  assert.equal(target.poisonRemaining, 3);
});

test('poison defeat fires once with its caster and clears every temporary effect', () => {
  const { combat, target, defeats } = setup({ maxHealth: 10 });
  combat.hit(target, { sourceId: 'fire-caster', burn: { duration: 10, damagePerSecond: 1 } });
  combat.hit(target, { sourceId: 'poison-caster', poison: { duration: 3, damagePerSecond: 10 },
    slow: { duration: 5, multiplier: .5 } });
  combat.update(2); combat.update(2);
  assert.equal(target.health, 0);
  assert.equal(defeats.length, 1);
  assert.equal(defeats[0].sourceId, 'poison-caster');
  assert.equal(defeats[0].type, 'poison');
  for (const field of ['burnRemaining', 'burnDamagePerSecond', 'poisonRemaining', 'poisonDamagePerSecond', 'slowRemaining']) {
    assert.equal(target[field], 0, field);
  }
  assert.equal(target.poisonSourceId, undefined);
  assert.equal(target.speedMultiplier, 1);
  assert.equal(combat.hit(target, { damage: 1, poison: { duration: 2, damagePerSecond: 2 } }), null);
});

test('reset clears poison and invalid or self-directed payloads never apply it', () => {
  const { combat, target } = setup();
  for (const poison of [{duration: -1, damagePerSecond: 4}, {duration: 1, damagePerSecond: NaN}, {duration: Infinity, damagePerSecond: 4}]) {
    combat.hit(target, { poison });
    assert.equal(target.poisonRemaining, 0);
  }
  assert.equal(combat.hit(target, { sourceId: target.id, poison: { duration: 3, damagePerSecond: 4 } }), null);
  combat.hit(target, { damage: 6, sourceId: 'caster', poison: { duration: 3, damagePerSecond: 4 } });
  combat.update(.25);
  combat.reset();
  assert.equal(target.health, 100);
  assert.equal(target.poisonRemaining, 0);
  assert.equal(target.poisonDamagePerSecond, 0);
  assert.equal(target.poisonSourceId, undefined);
  combat.update(10);
  assert.equal(target.health, 100);
});
