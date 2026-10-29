import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Use the same glTF importer and CPU skinning as the renderer. This checks the
// exported file, including weights and animations, rather than the generator.
const path = new URL('../assets/characters/adventurer.glb', import.meta.url);
const asset = readFile(path).then(bytes => new GLTFLoader().parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ''));
const expectedClips = ['Idle_Nebeljagd', 'Run_Nebeljagd', 'Roll_Nebeljagd'];
const normalizedName = name => name.replace(/[^a-z]/gi, '').toLowerCase();

function meshes(scene) {
  const result = [];
  scene.traverse(node => { if (node.isMesh) result.push(node); });
  return result;
}

function updateSkin(scene) {
  scene.updateMatrixWorld(true);
  for (const mesh of meshes(scene)) mesh.skeleton?.update();
}

function bounds(scene) {
  updateSkin(scene);
  const box = new THREE.Box3(), vertex = new THREE.Vector3();
  for (const mesh of meshes(scene)) {
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      assert.ok(vertex.toArray().every(Number.isFinite), `${mesh.name}: finite skinned position`);
      box.expandByPoint(vertex);
    }
  }
  return box;
}

function bone(scene, name) {
  let found;
  scene.traverse(node => {
    if (node.isBone && normalizedName(node.name) === normalizedName(name)) found = node;
  });
  assert.ok(found, `humanoid joint ${name} exists`);
  return found;
}

function poseSampler(gltf, name) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = THREE.AnimationClip.findByName(gltf.animations, name);
  assert.ok(clip, `actual GLB includes ${name}`);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  return {
    duration: clip.duration,
    at(time) {
      action.reset().play();
      mixer.setTime(time);
      updateSkin(gltf.scene);
    },
    stop() { mixer.stopAllAction(); updateSkin(gltf.scene); },
  };
}

test('the neutral avatar is a modular, humanoid, metre-scale skinned GLB within its triangle budget', async () => {
  const gltf = await asset;
  const parts = meshes(gltf.scene);
  assert.ok(parts.length >= 5 && parts.length <= 32, 'distinct outfit modules with bounded draw calls');
  let triangles = 0;
  const materials = new Set();
  for (const mesh of parts) {
    assert.ok(mesh.isSkinnedMesh, `${mesh.name} follows the actual skeleton`);
    const geometry = mesh.geometry;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    assert.ok(geometry.attributes.normal, `${mesh.name} has exported normals`);
    const weights = geometry.attributes.skinWeight, joints = geometry.attributes.skinIndex;
    assert.equal(weights.count, geometry.attributes.position.count);
    assert.equal(joints.count, weights.count);
    for (let index = 0; index < weights.count; index++) {
      let sum = 0;
      for (let slot = 0; slot < 4; slot++) {
        const weight = weights.getComponent(index, slot), joint = joints.getComponent(index, slot);
        assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
        assert.ok(joint >= 0 && joint < mesh.skeleton.bones.length);
        sum += weight;
      }
      assert.ok(Math.abs(sum - 1) < .002, `${mesh.name}: normalized vertex weights`);
    }
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      assert.ok(mat.isMeshStandardMaterial, 'glTF PBR material');
      assert.ok(mat.roughness >= .25 && mat.roughness <= 1);
      assert.ok(mat.metalness >= 0 && mat.metalness <= 1);
      materials.add(mat.name);
    }
  }
  assert.ok(triangles >= 12000 && triangles <= 25000, `${triangles} triangles vs requested 12–25k`);
  assert.ok(materials.size >= 5 && materials.size <= 8, 'skin, hair, cloth, leather and metal separation');
  for (const name of ['Root', 'Pelvis', 'Spine', 'Chest', 'Neck', 'Head',
    ...['L', 'R'].flatMap(side => ['Clavicle', 'UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin', 'Foot'].map(name => name + side))]) {
    bone(gltf.scene, name);
  }
  const size = bounds(gltf.scene).getSize(new THREE.Vector3());
  assert.ok(size.y >= 1.8 && size.y <= 1.9, `${size.y}m height`);
  assert.ok(size.x < 1.3 && size.z < .7, 'human silhouette, not permanent equipment');
  assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), expectedClips.toSorted());
});

test('exported idle and running clips loop without a pose jump or locomotion drift', async () => {
  const gltf = await asset;
  const joints = [];
  gltf.scene.traverse(node => { if (node.isBone) joints.push(node); });
  const positions = () => joints.map(node => node.getWorldPosition(new THREE.Vector3()));
  const rotations = () => joints.map(node => node.getWorldQuaternion(new THREE.Quaternion()));
  for (const name of expectedClips.slice(0, 2)) {
    const sampler = poseSampler(gltf, name);
    assert.ok(sampler.duration >= .4 && sampler.duration <= 4);
    sampler.at(0); const start = positions(), startRotations = rotations();
    sampler.at(sampler.duration / 4); const animated = positions();
    assert.ok(animated.some((point, i) => point.distanceTo(start[i]) > .003), `${name} moves bones`);
    sampler.at(sampler.duration); const end = positions(), endRotations = rotations();
    for (let i = 0; i < joints.length; i++) {
      assert.ok(start[i].distanceTo(end[i]) < .002, `${name} ${joints[i].name} loop position`);
      assert.ok(startRotations[i].angleTo(endRotations[i]) < .005, `${name} ${joints[i].name} loop rotation`);
    }
    sampler.stop();
  }
});

test('the actual exported roll turns forward once, tucks the body, and keeps it at ground level', async () => {
  const gltf = await asset, sampler = poseSampler(gltf, 'Roll_Nebeljagd');
  const root = bone(gltf.scene, 'Root'), pelvis = bone(gltf.scene, 'Pelvis');
  const leftFoot = bone(gltf.scene, 'FootL'), rightFoot = bone(gltf.scene, 'FootR');
  const signedRotation = new THREE.Vector3();
  let previousQuaternion, minFootDistance = Infinity, standingFootDistance, compact = Infinity;
  for (let step = 0; step <= 40; step++) {
    const fraction = step / 40;
    sampler.at(sampler.duration * fraction);
    const quaternion = root.getWorldQuaternion(new THREE.Quaternion());
    if (previousQuaternion) {
      const delta = quaternion.clone().multiply(previousQuaternion.clone().invert()).normalize();
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const sine = Math.hypot(delta.x, delta.y, delta.z);
      if (sine > 1e-8) signedRotation.addScaledVector(new THREE.Vector3(delta.x, delta.y, delta.z), 2 * Math.atan2(sine, delta.w) / sine);
    }
    previousQuaternion = quaternion;
    const hip = pelvis.getWorldPosition(new THREE.Vector3());
    const footDistance = (leftFoot.getWorldPosition(new THREE.Vector3()).distanceTo(hip)
      + rightFoot.getWorldPosition(new THREE.Vector3()).distanceTo(hip)) / 2;
    if (step === 0) standingFootDistance = footDistance;
    if (fraction >= .2 && fraction <= .8) {
      minFootDistance = Math.min(minFootDistance, footDistance);
      const box = bounds(gltf.scene), size = box.getSize(new THREE.Vector3());
      compact = Math.min(compact, Math.max(size.x, size.y, size.z));
      assert.ok(box.min.y > -.12 && box.min.y < .18, `grounded roll at ${fraction}: minY ${box.min.y}`);
    }
  }
  assert.ok(Math.abs(signedRotation.x - Math.PI * 2) < .06, `${signedRotation.x} rad forward X rotation`);
  assert.ok(Math.abs(signedRotation.y) < .04 && Math.abs(signedRotation.z) < .04, 'no side spin/cartwheel');
  assert.ok(minFootDistance < standingFootDistance * .73, 'knees draw feet toward pelvis rather than spinning a standing model');
  assert.ok(compact < 1.45, `body folds into compact roll: ${compact}m`);
  const ended = bounds(gltf.scene);
  assert.ok(ended.min.y > -.05 && ended.min.y < .08);
  assert.ok(ended.getSize(new THREE.Vector3()).y >= 1.75, 'upright at the end');
  sampler.stop();
});
