import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarAnimator } from '../src/avatar-animation.js';
import { preparePlayerGeometry } from '../src/player-model.js';
import { createHandGripSocket } from '../src/hand-grip.js';

const asset = new URL('../assets/characters/nebeljagd_player_base_v1.glb', import.meta.url);
const bytes = await readFile(asset);

async function actualRig() {
  const loader = new GLTFLoader().register(() => ({
    name: 'GripGeometryTextureStub', loadTexture: () => Promise.resolve(new THREE.Texture()),
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  preparePlayerGeometry(gltf.scene);
  const scene = new THREE.Scene(), outer = new THREE.Group(), actor = new THREE.Group(), normalization = new THREE.Group();
  outer.position.set(5, 2, -3); outer.rotation.set(.1, .8, 0); outer.scale.set(1.8, 1.3, 1.8);
  actor.position.set(-8, .3, 7); actor.rotation.y = -.4; actor.scale.setScalar(1.2);
  normalization.scale.setScalar(1.85);
  scene.add(outer); outer.add(actor); actor.add(normalization); normalization.add(gltf.scene);
  const animator = createAvatarAnimator(gltf.scene, gltf.animations); animator.update(0);
  const hand = gltf.scene.getObjectByName('mixamorigRightHand');
  const finger = gltf.scene.getObjectByName('mixamorigRightHandMiddle1');
  assert.ok(hand?.isBone && finger?.isBone, 'use the uploaded wrist and actual middle-finger root');
  return { scene, outer, actor, normalization, gltf, animator, hand, finger,
    socket: createHandGripSocket(hand, finger) };
}

function localPosition(node, actor) {
  return actor.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
}

test('the uploaded animated rig carries the grip inside its palm instead of at its wrist', async () => {
  const { scene, actor, gltf, animator, hand, finger, socket } = await actualRig();
  assert.equal(socket.source, 'palm');
  const originalClips = JSON.stringify(gltf.animations.map(clip => clip.toJSON()));
  const positions = [], result = new THREE.Vector3();
  for (let frame = 0; frame < 30; frame++) {
    animator.update(.04, { walkWeight: frame < 6 ? 0 : 1, playbackSpeed: 1 });
    scene.updateMatrixWorld(true);
    const wrist = localPosition(hand, actor), knuckle = localPosition(finger, actor);
    const handRotation = hand.quaternion.clone(), fingerRotation = finger.quaternion.clone();
    assert.equal(socket.getPosition(actor, result), result, 'the caller can reuse one vector each frame');
    assert.ok(result.toArray().every(Number.isFinite));
    const axis = knuckle.clone().sub(wrist), offset = result.clone().sub(wrist);
    const along = offset.dot(axis) / axis.lengthSq();
    assert.ok(along > .60 && along < .75, 'the grip stays in the anatomical palm band while the arm moves');
    assert.ok(offset.clone().addScaledVector(axis, -along).length() < .002);
    assert.ok(result.distanceTo(wrist) > .06, 'a wrist-origin attachment would leave the visible handle outside the palm');
    assert.ok(result.distanceTo(knuckle) > .02, 'the grip does not follow the finger tip');
    assert.deepEqual(hand.quaternion.toArray(), handRotation.toArray(), 'reading a socket must not twist the wrist');
    assert.deepEqual(finger.quaternion.toArray(), fingerRotation.toArray(), 'reading a socket preserves authored fingers');
    positions.push(result.clone());
  }
  assert.ok(positions.some(point => point.distanceTo(positions[0]) > .03), 'the actual uploaded gait moves the grip');
  assert.equal(JSON.stringify(gltf.animations.map(clip => clip.toJSON())), originalClips);
  assert.equal(createHash('sha256').update(await readFile(asset)).digest('hex'),
    '29232024a0a1be5b6e8d81cf48b2433d6bbd58ac5b0ccb6c035e6c5acab22624');
});

test('the palm socket follows wrist rotation and avatar normalization and returns after an animation reset', async () => {
  const { scene, outer, actor, normalization, animator, hand, finger, socket } = await actualRig();
  scene.updateMatrixWorld(true);
  const initial = socket.getPosition(actor), initialFingerRotation = finger.quaternion.clone();
  const initialHandRotation = hand.quaternion.clone();
  const wristPoint = hand.worldToLocal(actor.localToWorld(initial.clone()));

  // Moving the entire level or facing a different direction must not introduce
  // a world-axis offset into a character-local attachment.
  outer.position.set(-11, 6, 4); outer.rotation.set(-.2, 2.1, .15); outer.scale.set(.8, 1.6, 1.1);
  actor.position.set(14, 3, -5); actor.rotation.y = 1.9;
  scene.updateMatrixWorld(true);
  assert.ok(socket.getPosition(actor).distanceTo(initial) < 1e-6);

  // Curling a finger leaves the palm socket fixed; turning the wrist carries it.
  finger.rotation.x += .4; scene.updateMatrixWorld(true);
  assert.ok(socket.getPosition(actor).distanceTo(initial) < 1e-6);
  finger.quaternion.copy(initialFingerRotation);
  hand.rotation.z += .6; normalization.scale.setScalar(2.15); scene.updateMatrixWorld(true);
  const shifted = socket.getPosition(actor);
  const shiftedInHand = hand.worldToLocal(actor.localToWorld(shifted.clone()));
  assert.ok(shiftedInHand.distanceTo(wristPoint) < 1e-6, 'the calibrated location remains fixed inside the hand');
  assert.ok(shifted.distanceTo(initial) > .03);

  normalization.scale.setScalar(1.85); hand.quaternion.copy(initialHandRotation);
  for (let frame = 0; frame < 12; frame++) animator.update(.05, { walkWeight: 1, playbackSpeed: 1 });
  animator.reset(); animator.update(0); scene.updateMatrixWorld(true);
  assert.ok(socket.getPosition(actor).distanceTo(initial) < 1e-6, 'reset restores the original attachment without recalibrating it');
});

test('rigs without finger landmarks retain a finite wrist attachment and missing hands use the conventional fallback', () => {
  const scene = new THREE.Scene(), actor = new THREE.Group(), hand = new THREE.Bone();
  scene.add(actor); actor.add(hand);
  actor.position.set(3, 1, 7); actor.rotation.y = .9; actor.scale.setScalar(1.4);
  hand.position.set(-.2, 1.2, .4); hand.rotation.set(.3, -.2, .1);
  const wrist = createHandGripSocket(hand, null);
  assert.equal(wrist.source, 'wrist');
  assert.ok(wrist.getPosition(actor).distanceTo(hand.position) < 1e-6);
  hand.position.z += .2; scene.updateMatrixWorld(true);
  assert.ok(wrist.getPosition(actor).distanceTo(hand.position) < 1e-6);
  const missing = createHandGripSocket(null, null);
  assert.equal(missing.source, 'wrist');
  assert.deepEqual(missing.getPosition(actor).toArray(), [0, 1.2, .4]);
});
