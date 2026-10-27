import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONE, zoneAt, isInDanger, healthAfterDamage, healedHealth } from '../src/rules.js';

test('zone gives a grace period, shrinks continuously, and keeps a final refuge', () => {
  assert.equal(zoneAt(0).radius, ZONE.initial);
  assert.equal(zoneAt(ZONE.grace).radius, ZONE.initial);
  let previous = ZONE.initial;
  for (let time = 0; time < 1000; time += 0.5) {
    const zone = zoneAt(time);
    assert.ok(zone.radius <= previous);
    assert.ok(zone.radius >= ZONE.minimum);
    assert.ok(zone.countdown >= 0);
    previous = zone.radius;
  }
  assert.equal(zoneAt(ZONE.grace + ZONE.duration).radius, ZONE.minimum);
});

test('danger follows the circular boundary, including diagonal positions', () => {
  assert.equal(isInDanger({ x: 6, z: 8 }, 10), false);
  assert.equal(isInDanger({ x: 8, z: 8 }, 10), true);
  assert.equal(isInDanger({ x: -11, z: 0 }, 10), true);
});

test('damage is time-based, safe ground does not hurt, and healing is capped', () => {
  const oneStep = healthAfterDamage(100, 1, true);
  let manySteps = 100;
  for (let i = 0; i < 60; i++) manySteps = healthAfterDamage(manySteps, 1 / 60, true);
  assert.ok(Math.abs(oneStep - manySteps) < 1e-8);
  assert.equal(healthAfterDamage(72, 2, false), 72);
  assert.equal(healthAfterDamage(2, 1, true), 0);
  assert.equal(healedHealth(90, 25), 100);
});
