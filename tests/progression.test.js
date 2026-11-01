import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/combat.js';
import { createProgressionState, awardDefeat } from '../src/progression.js';
import { healedHealth } from '../src/rules.js';

function arena(playerId = 'player') {
  const state = createProgressionState(), defeats = [], awards = [];
  const combat = createCombat({ onDefeat(result, target) {
    defeats.push(result);
    const awarded = awardDefeat(state, result, target, { playerId });
    if (awarded) awards.push(awarded);
  } });
  const add = (id, extra = {}) => combat.addTarget({ id, position: { x: 0, y: 0, z: 0 },
    maxHealth: 40, ...extra });
  return { state, combat, add, defeats, awards };
}

test('neutral and player defeats each add one level and 25 current/max health without erasing old damage', () => {
  const { state, combat, add, awards } = arena();
  assert.deepEqual(state, { level: 1, maxHealth: 100, health: 72, defeats: 0 });
  const neutral = add('neutral', { neutral: true });
  combat.hit(neutral, { damage: 39, sourceId: 'player' });
  assert.equal(state.level, 1, 'damage alone grants no level');
  combat.hit(neutral, { damage: 99, sourceId: 'player' });
  assert.deepEqual(state, { level: 2, maxHealth: 125, health: 97, defeats: 1 });
  const opponent = add('other-player', { player: true });
  combat.hit(opponent, { damage: 40, sourceId: 'player' });
  assert.deepEqual(state, { level: 3, maxHealth: 150, health: 122, defeats: 2 });
  assert.deepEqual(awards.map(result => [result.level, result.healthGained]), [[2, 25], [3, 25]]);
  assert.equal(state.maxHealth - state.health, 28, 'damage deficit survives both victories');
});

test('one living-to-dead transition grants one reward and a new round resets health, level and attribution', () => {
  const { state, combat, add, defeats, awards } = arena();
  const target = add('enemy');
  combat.hit(target, { damage: 100, sourceId: 'player' });
  assert.equal(combat.hit(target, { damage: 100, sourceId: 'player' }), null);
  combat.update(10);
  assert.equal(defeats.length, 1); assert.equal(awards.length, 1);
  combat.reset(); Object.assign(state, createProgressionState());
  assert.deepEqual(state, { level: 1, maxHealth: 100, health: 72, defeats: 0 });
  assert.equal(target.health, 40); assert.equal(target.burnSourceId, undefined);
  combat.hit(target, { damage: 100, sourceId: 'player' });
  assert.equal(defeats.length, 2); assert.equal(state.level, 2);
});

test('destructible scenery, self hits, uncredited damage and another attacker grant the local player no level', () => {
  const { state, combat, add, awards } = arena();
  const initial = { ...state };
  combat.hit(add('crate', { destructible: true }), { damage: 40, sourceId: 'player' });
  combat.hit(add('non-rewarding-scenery', { progressionReward: false }), { damage: 40, sourceId: 'player' });
  assert.equal(combat.hit(add('player'), { damage: 100, sourceId: 'player' }), null);
  combat.hit(add('environment-kill'), { damage: 40 });
  combat.hit(add('rival-kill'), { damage: 40, sourceId: 'rival' });
  assert.deepEqual(state, initial); assert.equal(awards.length, 0);
  assert.equal(awardDefeat(state, { killed: true, sourceId: 'player', targetId: 'player' }, { id: 'player' }), null);
});

test('the same progression rule credits arbitrary player ids without granting the local observer a reward', () => {
  const { state, combat, add } = arena('remote-player-42');
  combat.hit(add('another-player', { player: true }), { damage: 40, sourceId: 'remote-player-42' });
  assert.equal(state.level, 2); assert.equal(state.maxHealth, 125);
  combat.hit(add('local-player-kill'), { damage: 40, sourceId: 'player' });
  assert.equal(state.level, 2);
});

test('fatal burn ticks retain their caster and cannot award another level after death', () => {
  const { state, combat, add, defeats } = arena();
  const target = add('burning-enemy');
  combat.hit(target, { damage: 15, sourceId: 'player', burn: { duration: 3, damagePerSecond: 10 } });
  assert.equal(state.level, 1);
  combat.update(2.5);
  assert.equal(state.level, 2);
  assert.deepEqual(defeats.map(({ sourceId, type }) => ({ sourceId, type })), [{ sourceId: 'player', type: 'burn' }]);
  assert.equal(target.burnSourceId, undefined);
  assert.equal(target.burnDamagePerSecond, 0);
  combat.update(20); assert.equal(state.level, 2);
});

test('stronger burns retain credit across weaker refreshes; equal strength belongs to the latest caster', () => {
  const { state, combat, add, defeats } = arena();
  const stronger = add('stronger-burn');
  combat.hit(stronger, { sourceId: 'player', burn: { duration: 3, damagePerSecond: 20 } });
  combat.hit(stronger, { sourceId: 'rival', burn: { duration: 4, damagePerSecond: 5 } });
  combat.update(2);
  assert.equal(state.level, 2); assert.equal(defeats[0].sourceId, 'player');
  const equal = add('equal-burn');
  combat.hit(equal, { sourceId: 'player', burn: { duration: 3, damagePerSecond: 20 } });
  combat.hit(equal, { sourceId: 'rival', burn: { duration: 3, damagePerSecond: 20 } });
  combat.update(2);
  assert.equal(defeats[1].sourceId, 'rival'); assert.equal(state.level, 2);
});

test('burn attribution expires and resets, while an immediate finishing blow credits its own attacker', () => {
  const { combat, add, defeats } = arena();
  const target = add('enemy');
  combat.hit(target, { sourceId: 'player', burn: { duration: 1, damagePerSecond: 2 } });
  combat.update(1); assert.equal(target.burnSourceId, undefined);
  combat.hit(target, { sourceId: 'player', burn: { duration: 3, damagePerSecond: 5 } });
  combat.reset(); assert.equal(target.burnSourceId, undefined); assert.equal(target.burnRemaining, 0);
  combat.hit(target, { sourceId: 'player', burn: { duration: 3, damagePerSecond: 5 } });
  combat.hit(target, { sourceId: 'rival', damage: 40 });
  assert.equal(defeats[0].sourceId, 'rival'); assert.equal(defeats[0].type, 'direct');
});

test('level rewards never revive a dead player and heart healing obeys the expanded health cap', () => {
  const { state, combat, add } = arena();
  combat.hit(add('first-enemy'), { damage: 40, sourceId: 'player' });
  assert.equal(healedHealth(state.health, 25, state.maxHealth), 122);
  assert.equal(healedHealth(122, 25, state.maxHealth), 125);
  assert.equal(healedHealth(90, 25), 100, 'legacy callers retain the original cap');
  state.health = 0;
  combat.hit(add('posthumous-enemy'), { damage: 40, sourceId: 'player' });
  assert.equal(state.level, 2); assert.equal(state.health, 0); assert.equal(state.maxHealth, 125);
});
