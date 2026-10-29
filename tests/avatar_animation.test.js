import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_CLIPS, createAvatarAnimator } from '../src/avatar-animation.js';
import { ROLL_DURATION } from '../src/rules.js';

function fixture() {
  const model = new THREE.Group();
  model.position.set(8, 2, 4); model.rotation.y = .7; model.scale.setScalar(1.2);
  const root = new THREE.Bone(); root.name = 'Root'; model.add(root);
  const idle = new THREE.AnimationClip(AVATAR_CLIPS.idle, 2, [
    new THREE.VectorKeyframeTrack('Root.position', [0, 1, 2], [0, .94, 0, 0, .95, 0, 0, .94, 0]),
    new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, 2], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const run = new THREE.AnimationClip(AVATAR_CLIPS.run, .6, [
    new THREE.VectorKeyframeTrack('Root.position', [0, .3, .6], [0, .94, 0, 0, 1, 0, 0, .94, 0]),
    new THREE.QuaternionKeyframeTrack('Root.quaternion', [0, .6], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);
  const times = [0, .2, .4, .6, .8];
  const rotations = times.flatMap(t => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t / .8 * Math.PI * 2).toArray());
  const roll = new THREE.AnimationClip(AVATAR_CLIPS.roll, .8, [
    new THREE.QuaternionKeyframeTrack('Root.quaternion', times, rotations),
    new THREE.VectorKeyframeTrack('Root.position', [0, .4, .8], [0, .94, 0, 0, .45, 0, 0, .94, 0]),
  ]);
  const clips = [idle, run, roll];
  return { model, root, clips, animator: createAvatarAnimator(model, clips) };
}

function advance(animator, seconds, input = {}) {
  for (let left = seconds; left > 1e-8; left -= .01) animator.update(Math.min(.01, left), input);
}

test('the authored roll reaches the exact inverted pose once without rotating or scaling the model parent', () => {
  const { animator, model, root } = fixture();
  model.updateMatrix();
  const matrix = model.matrix.clone();
  assert.equal(animator.startRoll(), true);
  advance(animator, ROLL_DURATION / 2, { walkWeight: .6 });
  assert.equal(animator.startRoll(), false, 'repeated input cannot restart a running roll');
  assert.ok(Math.abs(animator.snapshot().rollProgress - .5) < 1e-6);
  assert.ok(root.quaternion.angleTo(new THREE.Quaternion(1, 0, 0, 0)) < 1e-6, 'the baked shoulder roll reaches upside-down');
  assert.ok(Math.abs(root.position.y - .45) < 1e-6, 'the authored tuck height is retained');
  model.updateMatrix(); assert.deepEqual(model.matrix.elements, matrix.elements);
  advance(animator, ROLL_DURATION / 2);
  assert.equal(animator.rolling, false);
  assert.equal(animator.snapshot().activeAnimation, AVATAR_CLIPS.idle);
  assert.ok(root.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  advance(animator, .5); assert.equal(animator.rolling, false, 'LoopOnce never starts a second turn');
});

test('pause and freeze retain the exact roll pose; reset restores locomotion and allows a fresh roll', () => {
  const { animator, root } = fixture();
  animator.startRoll(); advance(animator, .25);
  const before = animator.snapshot(), pose = root.quaternion.clone();
  animator.update(0); animator.update(.1, { frozen: true });
  assert.deepEqual(animator.snapshot(), before);
  assert.deepEqual(root.quaternion.toArray(), pose.toArray());
  animator.reset();
  assert.equal(animator.rolling, false);
  assert.ok(root.quaternion.angleTo(new THREE.Quaternion()) < 1e-6);
  assert.equal(animator.startRoll(), true);
});

test('idle/run blending retains animation updates and requires all three authored clips', () => {
  const { animator, root, model, clips } = fixture();
  advance(animator, .25, { walkWeight: 1, playbackSpeed: 1 });
  assert.equal(animator.snapshot().activeAnimation, AVATAR_CLIPS.run);
  assert.ok(root.position.y > .94);
  const runningHeight = root.position.y;
  animator.update(.1, { walkWeight: .5, playbackSpeed: .6 });
  assert.notEqual(root.position.y, runningHeight, 'fade-out does not freeze the gait');
  assert.throws(() => createAvatarAnimator(model, clips.slice(0, 2)), /Roll_Nebeljagd/);
});
