import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareAvatarAnimations, createAvatarAnimator } from '../src/avatar-animation.js';
import { preparePlayerGeometry, PLAYER_SKIN_REPAIR_VERSION } from '../src/player-model.js';
import groundProfile from '../assets/characters/player-animation-profile.json' with { type: 'json' };

const assetPath = new URL('../assets/characters/nebeljagd_player_base_v1.glb', import.meta.url);
const bytes = await readFile(assetPath);
const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
// Geometry/animation verification uses the production Three importer. Images
// are checked from the actual GLB below; real decoding is covered in WebGL.
async function load() {
  const loader = new GLTFLoader().register(() => ({
    name: 'GeometryOnlyTextureStub', loadTexture: () => Promise.resolve(new THREE.Texture()),
  }));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  preparePlayerGeometry(gltf.scene);
  return gltf;
}

function skinBounds(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3(), vertex = new THREE.Vector3();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.skeleton?.update();
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      assert.ok(vertex.toArray().every(Number.isFinite));
      box.expandByPoint(vertex);
    }
  });
  return box;
}

function sampler(model, clip) {
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true; action.play();
  return {
    at(fraction) { action.time = clip.duration * fraction; mixer.update(0); model.updateMatrixWorld(true); },
    stop() { mixer.stopAllAction(); mixer.uncacheRoot(model); },
  };
}

test('the uploaded Tripo avatar retains its real mesh, embedded PBR images and all four source clips', async () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '29232024a0a1be5b6e8d81cf48b2433d6bbd58ac5b0ccb6c035e6c5acab22624');
  assert.equal(groundProfile.sourceSha256, createHash('sha256').update(bytes).digest('hex'), 'contact profile matches the actual uploaded bytes');
  assert.equal(groundProfile.skinRepairVersion, PLAYER_SKIN_REPAIR_VERSION, 'contact profile uses the same skin fix as the game');
  assert.equal(json.asset.generator, 'Tripo');
  assert.equal(json.animations.length, 4);
  assert.ok(json.materials[0].normalTexture);
  assert.ok(json.materials[0].pbrMetallicRoughness.baseColorTexture);
  assert.ok(json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture);
  for (const image of json.images) {
    assert.ok(Number.isInteger(image.bufferView), 'texture data embedded in portable GLB');
    assert.ok(json.bufferViews[image.bufferView].byteLength > 1000);
  }
  const { scene } = await load();
  let triangles = 0;
  const bones = new Set();
  scene.traverse(node => {
    if (node.isMesh) {
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      assert.ok(node.isSkinnedMesh);
      node.skeleton.bones.forEach(bone => bones.add(bone));
    }
  });
  assert.equal(triangles, 20161);
  assert.ok(bones.size >= 60);
});

test('preparation keeps the source clips unchanged and creates a real repeating gait without the standing introduction', async () => {
  const { scene, animations } = await load();
  const source = JSON.stringify(animations.map(clip => clip.toJSON()));
  const before = [];
  scene.traverse(node => before.push([node, node.position.toArray(), node.quaternion.toArray(), node.scale.toArray()]));
  const prepared = prepareAvatarAnimations(scene, animations);
  assert.equal(prepared.roles.idle.name, 'standing_relax');
  assert.match(prepared.roles.run.name, /sprintet/);
  assert.match(prepared.roles.roll.name, /Vorwärtsrolle/);
  assert.ok(prepared.roles.run.duration > .6 && prepared.roles.run.duration < .8);
  assert.equal(JSON.stringify(animations.map(clip => clip.toJSON())), source, 'original authored animation bytes retained in memory');
  for (const [node, position, quaternion, scale] of before) {
    assert.deepEqual(node.position.toArray(), position);
    assert.deepEqual(node.quaternion.toArray(), quaternion);
    assert.deepEqual(node.scale.toArray(), scale);
  }
  const joints = [];
  scene.traverse(node => { if (node.isBone) joints.push(node); });
  const sample = sampler(scene, prepared.roles.run);
  sample.at(0);
  const first = joints.map(node => [node.position.clone(), node.quaternion.clone()]);
  sample.at(.5);
  assert.ok(joints.some((node, index) => node.quaternion.angleTo(first[index][1]) > .4), 'both legs really swing through the retained recorded gait');
  sample.at(1);
  for (let index = 0; index < joints.length; index++) {
    assert.ok(joints[index].position.distanceTo(first[index][0]) < 1e-5, `${joints[index].name} loop position`);
    assert.ok(joints[index].quaternion.angleTo(first[index][1]) < .002, `${joints[index].name} loop rotation`);
  }
  sample.stop();
});

test('the actual imported forward roll stays above the floor, folds and recovers while retaining its original rotation', async () => {
  const { scene, animations } = await load();
  const { roles } = prepareAvatarAnimations(scene, animations);
  const idle = sampler(scene, roles.idle); idle.at(0);
  const idleBox = skinBounds(scene), ground = idleBox.min.y;
  idle.stop();
  const hips = scene.getObjectByName('mixamorigHips');
  const roll = sampler(scene, roles.roll);
  let compact = Infinity, minUp = 1;
  const hipPositions = [];
  for (let frame = 0; frame <= 40; frame++) {
    roll.at(frame / 40);
    const box = skinBounds(scene);
    assert.ok(box.min.y >= ground - .004, `ground contact at sample ${frame}: ${box.min.y}`);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()));
    minUp = Math.min(minUp, up.y);
    if (frame >= 10 && frame <= 30) compact = Math.min(compact, box.getSize(new THREE.Vector3()).length());
    hipPositions.push(hips.position.clone());
  }
  assert.ok(minUp < -.65, 'the authored body actually turns upside-down');
  assert.ok(compact < 1.05, 'the body folds rather than rotating upright like a pole');
  assert.ok(skinBounds(scene).getSize(new THREE.Vector3()).y > idleBox.getSize(new THREE.Vector3()).y * .9, 'stands up again');
  assert.ok(hipPositions.every(position => Math.hypot(position.x - hipPositions[0].x, position.z - hipPositions[0].z) < .003), 'the visible avatar remains with the gameplay collider');
  roll.stop();
});

test('the actual imported animations play through the game controller without modifying its parent', async () => {
  const { scene, animations } = await load();
  const parent = new THREE.Group(); parent.add(scene);
  parent.position.set(5, 2, -3); parent.scale.setScalar(1.8); parent.rotation.y = .9;
  parent.updateMatrix(); const matrix = parent.matrix.clone();
  const animator = createAvatarAnimator(scene, animations);
  animator.update(0);
  assert.equal(animator.snapshot().activeAnimation, 'standing_relax');
  for (let i = 0; i < 10; i++) animator.update(.05, { walkWeight: 1 });
  assert.match(animator.snapshot().activeAnimation, /sprintet/);
  assert.ok(animator.startRoll());
  for (let i = 0; i < 8; i++) animator.update(.1);
  assert.equal(animator.rolling, false);
  parent.updateMatrix(); assert.deepEqual(parent.matrix.elements, matrix.elements);
});
