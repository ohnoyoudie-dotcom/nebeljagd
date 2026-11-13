import test from 'node:test';
import assert from 'node:assert/strict';
import { applySolarStatus, updateSolarStatus, resetSolarStatus } from '../src/solar-status.js';

test('sunlight refreshes blindness without stacking durations and reveal expires separately', () => {
  const target = { alive: true }; resetSolarStatus(target);
  applySolarStatus(target, { blind: { duration: 2, radius: 3 }, reveal: 2.5 });
  updateSolarStatus(target, 1);
  applySolarStatus(target, { blind: { duration: 2, radius: 3 }, reveal: 2.5 });
  assert.equal(target.blindRemaining, 2); assert.equal(target.blindRadius, 3);
  updateSolarStatus(target, 2);
  assert.equal(target.blindRemaining, 0); assert.equal(target.blindRadius, Infinity);
  assert.equal(target.revealRemaining, .5);
  updateSolarStatus(target, .5); assert.equal(target.revealRemaining, 0);
});
test('pause, death, reset and destructible scenery keep solar statuses bounded', () => {
  const target = { alive: true }; resetSolarStatus(target);
  applySolarStatus(target, { blind: { duration: 2, radius: 3 }, reveal: 2.5 });
  for (const dt of [0, -1, NaN]) updateSolarStatus(target, dt);
  assert.equal(target.blindRemaining, 2);
  target.alive = false; updateSolarStatus(target, .1);
  assert.equal(target.blindRemaining, 0); assert.equal(target.revealRemaining, 0);
  target.alive = true; target.destructible = true;
  applySolarStatus(target, { blind: { duration: 2, radius: 3 }, reveal: 2.5 });
  assert.equal(target.blindRemaining, 0); assert.equal(target.revealRemaining, 0);
});
