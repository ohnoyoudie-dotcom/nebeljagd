// Rebuild the uploaded player's ground-contact offsets once, offline. Runtime
// only reads the small table; it never skins every vertex to repair animation.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareAvatarAnimations } from '../src/avatar-animation.js';
import { preparePlayerGeometry, PLAYER_SKIN_REPAIR_VERSION } from '../src/player-model.js';

const source = 'assets/characters/nebeljagd_player_base_v1.glb';
const bytes = await readFile(new URL(`../${source}`, import.meta.url));
const loader = new GLTFLoader().register(() => ({
  name: 'ProfileGeometryOnly', loadTexture: () => Promise.resolve(new THREE.Texture()),
}));
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
preparePlayerGeometry(gltf.scene);
const { roles, diagnostics } = prepareAvatarAnimations(gltf.scene, gltf.animations, { grounding: false });
const model = gltf.scene, mixer = new THREE.AnimationMixer(model), meshes = [];
model.traverse(node => { if (node.isMesh) meshes.push(node); });
const vertex = new THREE.Vector3();
function minimumY() {
  model.updateMatrixWorld(true);
  let lowest = Infinity;
  for (const mesh of meshes) {
    mesh.skeleton?.update();
    for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
      mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
      lowest = Math.min(lowest, vertex.y);
    }
  }
  return lowest;
}
const idle = mixer.clipAction(roles.idle).play();
mixer.update(0);
const ground = minimumY();
idle.stop();
if (!Number.isFinite(ground)) throw new Error('The uploaded player has no finite skinned ground contact.');
const sampleRate = 48, grounding = {};
for (const role of ['run', 'roll']) {
  const clip = roles[role];
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true; action.play();
  const count = Math.ceil(clip.duration * sampleRate), times = [], offsets = [];
  for (let frame = 0; frame <= count; frame++) {
    const time = clip.duration * frame / count;
    action.time = time; mixer.update(0);
    times.push(time); offsets.push(Math.max(0, ground - minimumY()));
  }
  action.stop(); grounding[role] = { duration: clip.duration, times, offsets };
}
const profile = {
  source,
  sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  skinRepairVersion: PLAYER_SKIN_REPAIR_VERSION,
  sourceClips: Object.fromEntries(Object.entries(roles).map(([role, clip]) => [role, {
    name: clip.name, duration: gltf.animations.find(sourceClip => sourceClip.name === clip.name).duration,
  }])),
  runSourceWindow: diagnostics.runSourceWindow,
  sampleRate,
  grounding,
};
const output = new URL('../assets/characters/player-animation-profile.json', import.meta.url);
await writeFile(output, JSON.stringify(profile, null, 2) + '\n');
console.log(`Player contact profile: ${sampleRate} Hz, source ${profile.sourceSha256}, ${PLAYER_SKIN_REPAIR_VERSION}`);
