import test from 'node:test';
import assert from 'node:assert/strict';
import { createGravityParticleFlow } from '../src/gravity-particles.js';
import { gravityVortexMotion } from '../src/gravity-motion.js';
import { GRAVITY_RULES as rules } from '../src/gravity-spell.js';

test('debris births are staggered with changing counts and gaps instead of one regular ring', () => {
  const flow = createGravityParticleFlow(rules, 64), out = {}, births = new Set(), counts = [];
  for (let i = 0; i < 64; i++) {
    assert.equal(flow.sample(i, .2, out).life, 0);
    for (let age = .22; age < 1.1; age += .01) if (flow.sample(i, age, out).life > .01) {
      births.add(Math.round(age * 100)); break;
    }
  }
  assert.ok(births.size > 25, 'independent starts are spread across the opening');
  for (let age = .9; age < 3.1; age += .1) {
    let active = 0;
    for (let i = 0; i < 64; i++) if (flow.sample(i, age, out).life > .01) active++;
    counts.push(active);
  }
  assert.ok(Math.min(...counts) > 10 && Math.min(...counts) < 56 && Math.max(...counts) <= 64);
  assert.ok(Math.max(...counts) - Math.min(...counts) > 7, 'intake fluctuates throughout the three seconds');
});

test('swallowed stones enter the rising sphere before disappearing, and nothing escapes after the final impulse', () => {
  const flow = createGravityParticleFlow(rules, 64), out = {}, motion = {};
  let absorbed = 0;
  for (let age = .6; age < 3.4; age += .005) for (let i = 0; i < 64; i++) {
    flow.sample(i, age, out);
    if (out.life <= .01 || out.progress < .93) continue;
    gravityVortexMotion(age, rules, motion);
    const distance = Math.hypot(out.x, out.y - motion.sphereHeight, out.z);
    assert.ok(distance < motion.sphereRadius * .6, 'the stone is inside the orb before its scale fades');
    assert.ok(out.y > .12); absorbed++;
  }
  assert.ok(absorbed > 100, 'many separate intake events visibly reach the sphere');
  for (const age of [3.4, 3.45, 3.62, 10]) for (let i = 0; i < 64; i++) {
    assert.equal(flow.sample(i, age, out).life, 0);
  }
});

test('particle positions freeze at the same age and do not depend on update order or another cast', () => {
  const flow = createGravityParticleFlow(rules, 224), out = {};
  const first = { ...flow.sample(32, 1.7, out) };
  for (let i = 223; i >= 0; i--) flow.sample(i, 3.1, out);
  assert.deepEqual(flow.sample(32, 1.7, out), first);
  const nextCast = createGravityParticleFlow(rules, 224);
  assert.deepEqual(nextCast.sample(32, 1.7, {}), first);
});
