import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAvatarAnimator } from '../src/avatar-animation.js';
import { createCombatPoseController } from '../src/character-combat-pose.js';
import { createHandGripSocket } from '../src/hand-grip.js';
import { preparePlayerGeometry } from '../src/player-model.js';

const bytes = await readFile(new URL('../assets/characters/nebeljagd_player_base_v1.glb', import.meta.url));

async function rig() {
  const gltf = await new GLTFLoader().register(() => ({
    name: 'StanceGeometryTextureStub', loadTexture: () => Promise.resolve(new THREE.Texture()),
  })).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  preparePlayerGeometry(gltf.scene);
  const scene = new THREE.Scene(), actor = new THREE.Group(), model = new THREE.Group();
  scene.add(actor); actor.add(model); model.add(gltf.scene);
  const animator = createAvatarAnimator(gltf.scene, gltf.animations); animator.update(0);
  model.updateWorldMatrix(true, true); model.traverse(node => node.skeleton?.update());
  model.scale.setScalar(1.82 / new THREE.Box3().setFromObject(model, true).getSize(new THREE.Vector3()).y);
  model.updateWorldMatrix(true, true); model.traverse(node => node.skeleton?.update());
  model.position.y -= new THREE.Box3().setFromObject(model, true).min.y;
  const bone = name => gltf.scene.getObjectByName(`mixamorig${name}`);
  const arms = {}, legs = {};
  for (const side of ['left', 'right']) {
    const name = side === 'left' ? 'Left' : 'Right';
    arms[side] = ['Arm', 'ForeArm', 'Hand'].map(part => bone(`${name}${part}`));
    legs[side] = ['UpLeg', 'Leg', 'Foot'].map(part => bone(`${name}${part}`));
  }
  const hips = bone('Hips');
  const controller = createCombatPoseController(actor, { chest: bone('Spine2'), hips, arms, legs });
  const socket = createHandGripSocket(arms.right[2], bone('RightHandMiddle1'));
  const point = node => actor.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  return { scene, actor, model, gltf, animator, controller, socket, arms, legs, hips, point, bone };
}

const pose = (castWeight = 1, leftHandWeight = castWeight) => ({ castWeight, leftHandWeight,
  leftHand: new THREE.Vector3(.34, 1.18, .10), rightHand: new THREE.Vector3(-.26, 1.36, .54), chestTwist: .08 });
const near = (actual, expected, message, tolerance = 2e-5) => assert.ok(actual.distanceTo(expected) < tolerance, message);

test('the real idle rig widens its casting stance while preserving soles, foot orientation and staff grip', async () => {
  const { scene, actor, animator, controller, socket, arms, legs, hips, point, bone } = await rig();
  actor.position.set(8, 2, -3); actor.rotation.y = .9; actor.scale.setScalar(1.2);
  for (let frame = 0; frame < 30; frame++) {
    controller.restore(); animator.update(.04); scene.updateMatrixWorld(true);
    const baseline = Object.fromEntries(['left', 'right'].map(side => [side, {
      foot: point(legs[side][2]), rotation: legs[side][2].getWorldQuaternion(new THREE.Quaternion()),
      toe: point(bone(`${side === 'left' ? 'Left' : 'Right'}ToeBase`)),
    }]));
    const originalHips = point(hips);
    controller.apply(pose(0));
    const originalGrip = arms.right[2].worldToLocal(actor.localToWorld(socket.getPosition(actor)));
    const initialReachError = point(arms.right[2]).distanceTo(pose().rightHand);
    for (const amount of [0, .0001, .25, .5, 1, .5, 0]) {
      controller.apply(pose(amount));
      const state = controller.inspect();
      assert.equal(state.stanceWeight, amount);
      for (const side of ['left', 'right']) {
        const foot = point(legs[side][2]);
        assert.ok(Math.abs(foot.y - baseline[side].foot.y) < 2e-5, `${side} ankle stays grounded at weight ${amount}`);
        assert.ok(Math.abs(point(bone(`${side === 'left' ? 'Left' : 'Right'}ToeBase`)).y - baseline[side].toe.y) < 2e-5,
          `${side} toe keeps its authored floor height`);
        assert.ok(legs[side][2].getWorldQuaternion(new THREE.Quaternion()).angleTo(baseline[side].rotation) < 1e-6,
          'the shoe does not tilt when the knee bends');
      }
      assert.ok(point(arms.right[2]).distanceTo(pose().rightHand) <= initialReachError + .005,
        'the weight shift preserves the staff arm reach, including its anatomical reach limit');
      const gripInHand = arms.right[2].worldToLocal(actor.localToWorld(socket.getPosition(actor)));
      near(gripInHand, originalGrip, 'the grip remains fixed inside the actual palm');
      if (amount === 1) {
        const baseWidth = baseline.left.foot.x - baseline.right.foot.x;
        assert.ok(state.feet.left.x - state.feet.right.x > baseWidth + .09, 'stance becomes visibly wider');
        assert.ok(state.feet.left.z - state.feet.right.z > .10, 'left foot leads while the staff-side foot stays back');
        assert.ok(point(hips).y < originalHips.y - .02, 'hips settle enough to keep both soles down');
        near(point(arms.left[2]), pose().leftHand, 'free hand reaches the side of the ribs');
        assert.ok(state.leftArm.elbow.x > state.leftArm.hand.x, 'the elbow bends out beside the body');
        assert.ok(state.leftArm.hand.z < point(arms.right[2]).z - .3, 'the free hand remains behind the staff hand');
      }
    }
    controller.restore();
    near(point(hips), originalHips, 'recovery restores the authored hip position');
  }
});

test('a tiny arm weight causes a tiny pose change and recovery restores every touched bone', async () => {
  const { gltf, controller, arms, point } = await rig();
  const originals = new Map();
  gltf.scene.traverse(node => { if (node.isBone) originals.set(node,
    { position: node.position.clone(), rotation: node.quaternion.clone() }); });
  controller.apply({ ...pose(0), chestTwist: 0 });
  const restingHand = point(arms.left[2]), restingElbow = arms.left[1].quaternion.clone();
  controller.apply({ ...pose(0, .0001), chestTwist: 0 });
  assert.ok(point(arms.left[2]).distanceTo(restingHand) < .0001, 'entry does not snap the free arm');
  assert.ok(arms.left[1].quaternion.angleTo(restingElbow) < .001, 'the elbow cannot jump to the IK bend plane');
  let previous = restingHand;
  for (const amount of [.25, .5, .75, 1, .75, .5, .25, 0]) {
    controller.apply({ ...pose(0, amount), chestTwist: 0 });
    const hand = point(arms.left[2]);
    assert.ok(hand.distanceTo(previous) < .12, 'counterpose blends smoothly in both directions');
    previous = hand;
  }
  near(previous, restingHand, 'zero weight leaves the authored free arm untouched');
  controller.apply(pose(1)); controller.apply(null);
  for (const [bone, original] of originals) {
    near(bone.position, original.position, `${bone.name} position restored`, 1e-8);
    assert.deepEqual(bone.quaternion.toArray(), original.rotation.toArray(), `${bone.name} rotation restored`);
  }
});

test('the standing foot pose fades out before running and releases completely for roll and reset', async () => {
  const { scene, animator, controller, legs, hips, point } = await rig();
  let previousWeight = Infinity;
  for (const walkWeight of [0, .05, .1, .15, .2, .25, 1]) {
    controller.apply(pose(1), { walkWeight });
    assert.ok(controller.inspect().stanceWeight <= previousWeight);
    previousWeight = controller.inspect().stanceWeight;
  }
  assert.equal(previousWeight, 0, 'running never receives the standing foot correction');
  const travelled = [];
  for (let frame = 0; frame < 30; frame++) {
    controller.restore(); animator.update(.04, { walkWeight: 1, playbackSpeed: 1 }); scene.updateMatrixWorld(true);
    const feet = ['left', 'right'].map(side => point(legs[side][2])), hip = point(hips);
    controller.apply(pose(1), { walkWeight: 1 });
    for (const [index, side] of ['left', 'right'].entries()) near(point(legs[side][2]), feet[index], 'running foot follows the actual gait');
    near(point(hips), hip, 'running hips receive no stance lowering');
    travelled.push(feet[0]);
  }
  assert.ok(travelled.some(foot => foot.distanceTo(travelled[0]) > .15), 'the fixture exercises a moving foot');
  controller.restore(); animator.startRoll(); animator.update(.12); scene.updateMatrixWorld(true);
  const rolled = point(legs.left[2]);
  controller.apply(null);
  near(point(legs.left[2]), rolled, 'clearing combat leaves the authored roll alone');
  assert.equal(controller.inspect().stanceWeight, 0);
  animator.reset(); scene.updateMatrixWorld(true);
  const reset = point(legs.left[2]);
  controller.apply(pose(1)); controller.restore();
  near(point(legs.left[2]), reset, 'restart does not retain the prior wide stance');
});
