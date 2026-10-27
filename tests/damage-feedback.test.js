import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDamageFeedback, createDamageFeedbackState } from '../src/damage-feedback.js';
import { createHealthBars } from '../src/health-bars.js';
import { createCombat } from '../src/combat.js';

const actor = () => ({ id: 'enemy', position: { x: 2, y: 1, z: 3 } });

test('authoritative damage changes immediately while bar fill falls and flashes over time', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const bars = createHealthBars(scene), feedback = createDamageFeedbackState();
  const target = actor();
  bars.add(target.id, { position: new THREE.Vector3(2, 1, 3), health: 100 });
  const combat = createCombat({ onHit: (hit, entity) => {
    bars.set(entity.id, { health: entity.health }); feedback.addHit(hit, entity);
  } });
  combat.addTarget({ ...target, health: 100 });
  combat.hit(target.id, { damage: 27, type: 'sword' });
  let bar = bars.inspect()[0];
  assert.equal(combat.targets.get(target.id).health, 73);
  assert.equal(bar.health, 73, 'bar health agrees synchronously with combat');
  assert.equal(bar.displayedRatio, 1, 'only the drawn fill is animated');
  assert.ok(bar.flash > 0);
  bars.update(camera, { dt: .05 });
  bar = bars.inspect()[0];
  assert.ok(bar.displayedRatio > .73 && bar.displayedRatio < 1);
  assert.ok(bar.flash > 0);
  assert.ok(Math.abs(scene.children[0].geometry.attributes.healthRatio.array[0] - .73) < 1e-6);
  const atPause = { ...bar }; bars.update(camera, { dt: 0 });
  assert.equal(bars.inspect()[0].displayedRatio, atPause.displayedRatio);
  assert.equal(bars.inspect()[0].flash, atPause.flash);
  bars.update(camera, { dt: .3 });
  assert.ok(Math.abs(bars.inspect()[0].displayedRatio - .73) < .005);
  assert.equal(bars.inspect()[0].flash, 0);
  assert.deepEqual(feedback.inspect().active.map(({ amount, text }) => [amount, text]), [[27, '27']]);
  bars.set(target.id, { health: 100, snap: true }); bars.reset();
  assert.equal(bars.inspect()[0].displayedRatio, 1);
  bars.dispose();
});

test('burn ticks coalesce into readable numbers without delaying health or running during pause', () => {
  const feedback = createDamageFeedbackState();
  const target = actor();
  for (let i = 0; i < 21; i++) {
    feedback.addHit({ damage: .1, type: 'burn' }, target);
    feedback.update(1 / 60);
  }
  const s = feedback.inspect();
  assert.equal(s.active.length, 1);
  assert.ok(Math.abs(s.active[0].amount - 2.1) < 1e-9);
  assert.equal(s.active[0].text, '2.1');
  assert.equal(s.pending.length, 0);
  const age = s.active[0].age; feedback.update(0);
  assert.equal(feedback.inspect().active[0].age, age);
  feedback.update(1);
  assert.equal(feedback.inspect().active.length, 0);
});

test('hidden hits and health effects never disclose a target or reappear after reveal', () => {
  let visible = true;
  const feedback = createDamageFeedbackState({ isVisible: () => visible });
  const target = actor();
  feedback.addHit({ damage: 22, type: 'bow' }, target);
  feedback.addHit({ damage: .1, type: 'burn' }, target);
  visible = false; feedback.update(0);
  assert.equal(feedback.inspect().active.length, 0); assert.equal(feedback.inspect().pending.length, 0);
  assert.equal(feedback.addHit({ damage: 40, type: 'sword' }, target), false);
  visible = true; feedback.update(.5);
  assert.equal(feedback.inspect().active.length, 0);
  target.concealed = true;
  assert.equal(feedback.addHit({ damage: 12 }, target), false);
  target.local = true;
  assert.equal(feedback.addHit({ damage: 2, type: 'zone' }, target), true, 'local damage remains readable in grass');
  feedback.update(.35); assert.equal(feedback.inspect().active.length, 1);
  feedback.reset(); assert.equal(feedback.inspect().active.length, 0);
});

test('damage text capacity is bounded and all glyphs share one instanced renderer', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const feedback = createDamageFeedback(scene, { capacity: 2 });
  const target = actor();
  feedback.addHit({ damage: 18 }, target);
  feedback.addHit({ damage: 29 }, target);
  feedback.addHit({ damage: 35 }, target);
  feedback.update(.02, camera);
  assert.equal(feedback.inspect().active.length, 2);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0].count, 4, 'two two-digit values use four instances');
  const before = new THREE.Matrix4(); scene.children[0].getMatrixAt(0, before);
  feedback.update(.2, camera);
  const after = new THREE.Matrix4(); scene.children[0].getMatrixAt(0, after);
  assert.ok(after.elements[13] > before.elements[13], 'numbers visibly rise above the impact');
  feedback.reset(); assert.equal(scene.children[0].count, 0);
  feedback.dispose(); assert.equal(scene.children.length, 0);
});
