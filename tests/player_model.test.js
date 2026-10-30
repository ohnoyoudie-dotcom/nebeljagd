import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { preparePlayerGeometry, PLAYER_SKIN_REPAIR_VERSION } from '../src/player-model.js';

const path = new URL('../assets/characters/nebeljagd_player_base_v1.glb', import.meta.url);
globalThis.ProgressEvent ??= class ProgressEvent {};

async function loadSource() {
  const bytes = await readFile(path), jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + jsonLength).toString('base64');
  // Node has no image decoder; keep all real geometry/skin/animation accessors.
  // The browser integration test separately verifies the embedded PBR textures.
  delete json.images; delete json.textures;
  for (const material of json.materials) {
    delete material.normalTexture;
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  let mesh;
  gltf.scene.traverse(node => { if (node.isSkinnedMesh) mesh = node; });
  return { ...gltf, mesh, bytes };
}

function affectedEdges(geometry, vertices) {
  const selected = new Set(vertices), edges = [];
  for (let offset = 0; offset < geometry.index.count; offset += 3) {
    const triangle = [0, 1, 2].map(slot => geometry.index.getX(offset + slot));
    for (const a of triangle) if (selected.has(a)) {
      for (const b of triangle) if (!selected.has(b)) edges.push([a, b]);
    }
  }
  return edges;
}

function maximumEdge(scene, mesh, edges) {
  scene.updateMatrixWorld(true); mesh.skeleton.update();
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let maximum = 0;
  for (const [first, second] of edges) {
    mesh.getVertexPosition(first, a); mesh.getVertexPosition(second, b);
    maximum = Math.max(maximum, a.distanceTo(b));
  }
  return maximum;
}

test('the uploaded finger seam repair changes only four incorrect skin influences and preserves the source', async () => {
  const { scene, mesh, bytes } = await loadSource();
  const original = mesh.geometry;
  const result = preparePlayerGeometry(scene);
  assert.equal(result.version, PLAYER_SKIN_REPAIR_VERSION);
  assert.equal(result.repairedVertices, 4);
  assert.equal(result.repairs.length, 1);
  assert.equal(mesh.skeleton.bones.length, 66);
  const repaired = mesh.geometry;
  assert.notEqual(repaired, original);
  assert.deepEqual(repaired.index.array, original.index.array, 'topology is preserved');
  for (const name of ['position', 'normal', 'uv']) {
    assert.deepEqual(repaired.attributes[name].array, original.attributes[name].array, name + ' remains unchanged');
  }
  const changed = [];
  for (let vertex = 0; vertex < original.attributes.position.count; vertex++) {
    if ([0, 1, 2, 3].some(slot =>
      original.attributes.skinIndex.getComponent(vertex, slot) !== repaired.attributes.skinIndex.getComponent(vertex, slot) ||
      original.attributes.skinWeight.getComponent(vertex, slot) !== repaired.attributes.skinWeight.getComponent(vertex, slot))) changed.push(vertex);
  }
  assert.deepEqual(changed, result.repairs[0].vertices);
  for (const vertex of changed) {
    let total = 0;
    for (let slot = 0; slot < 4; slot++) {
      const weight = repaired.attributes.skinWeight.getComponent(vertex, slot);
      const bone = mesh.skeleton.bones[repaired.attributes.skinIndex.getComponent(vertex, slot)];
      if (weight > 0) assert.match(bone.name, /^mixamorigRightHand/);
      total += weight;
    }
    assert.ok(Math.abs(total - 1) < 1e-6);
    assert.equal(original.attributes.skinWeight.getX(vertex), 1, 'original attributes remain untouched');
    assert.equal(mesh.skeleton.bones[original.attributes.skinIndex.getX(vertex)].name, 'neutral_bone');
  }
  assert.equal(preparePlayerGeometry(scene), result, 'preparation is idempotent');
  assert.equal(mesh.geometry, repaired, 'repeat calls do not duplicate buffers');
  const hash = value => createHash('sha256').update(value).digest('hex');
  assert.equal(hash(await readFile(path)), hash(bytes), 'user GLB bytes are unchanged');
});

test('the repaired real mesh keeps the finger seam attached throughout every supplied animation', async () => {
  const { scene, mesh, animations } = await loadSource();
  const original = mesh.geometry;
  const result = preparePlayerGeometry(scene), fixed = mesh.geometry;
  const edges = affectedEdges(fixed, result.repairs[0].vertices);
  const mixer = new THREE.AnimationMixer(scene);
  const idle = mixer.clipAction(animations.find(clip => clip.name === 'standing_relax')).play();
  mixer.update(4);
  mesh.geometry = original;
  assert.ok(maximumEdge(scene, mesh, edges) > .1, 'original file reproduces the long detached spike');
  mesh.geometry = fixed;
  assert.ok(maximumEdge(scene, mesh, edges) < .025, 'repair removes the spike');
  idle.stop();
  for (const clip of animations) {
    const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    for (let frame = 0; frame <= 12; frame++) {
      action.reset().play(); mixer.setTime(clip.duration * frame / 12);
      assert.ok(maximumEdge(scene, mesh, edges) < .04, `${clip.name}: attached finger seam at sample ${frame}`);
      const first = mesh.getVertexPosition(result.repairs[0].vertices[0], new THREE.Vector3());
      for (const vertex of result.repairs[0].vertices.slice(1)) {
        assert.ok(mesh.getVertexPosition(vertex, new THREE.Vector3()).distanceTo(first) < 1e-7, 'UV seam copies remain coincident');
      }
    }
    action.stop();
  }
});

test('the repair does not modify an unrelated or changed model', async () => {
  const { scene, mesh } = await loadSource();
  const original = mesh.geometry;
  mesh.name = 'another-avatar';
  assert.equal(preparePlayerGeometry(scene).repairedVertices, 0);
  assert.equal(mesh.geometry, original);
  const changed = await loadSource();
  changed.mesh.geometry.attributes.position.setX(5828, -.3);
  const changedGeometry = changed.mesh.geometry;
  assert.equal(preparePlayerGeometry(changed.scene).repairedVertices, 0);
  assert.equal(changed.mesh.geometry, changedGeometry);
});
