import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const preserved = JSON.parse(await readFile('archive/preserved-versions.json', 'utf8'));
for (const [path, expected] of Object.entries(preserved)) {
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Preserved version changed: ${path}`);
}
const bytes = await readFile('assets/characters/ranger.glb');
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
assert.ok(gltf.skins?.length > 0, 'Character requires real skinning');
assert.ok(gltf.skins[0].joints.length >= 16);
for (const name of ['Idle', 'Walk']) assert.ok(gltf.animations.some(animation => animation.name === name), `Missing ${name}`);
assert.ok(gltf.buffers.every(buffer => !buffer.uri), 'GLB must contain its own buffers');
let triangles = 0;
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  assert.ok(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined);
  triangles += gltf.accessors[primitive.indices].count / 3;
}
assert.ok(triangles <= 15000, `Character triangle budget exceeded: ${triangles}`);
console.log(JSON.stringify({ status: 'passed', preservedVersions: Object.keys(preserved).length,
  character: { bytes: bytes.length, triangles, joints: gltf.skins[0].joints.length,
    clips: gltf.animations.map(animation => animation.name), sha256: createHash('sha256').update(bytes).digest('hex') } }, null, 2));

const importRoot = 'assets/imported/rei/';
const sourceRecord = JSON.parse(await readFile(importRoot + 'source-manifest.json', 'utf8'));
for (const source of sourceRecord.originals) {
  const original = await readFile(source.file);
  assert.equal(original.length, source.bytes, `Source size changed: ${source.file}`);
  assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256, `Source hash changed: ${source.file}`);
}
const imported = JSON.parse(await readFile(importRoot + 'runtime-manifest.json', 'utf8'));
const importBudgets = { 'tree01.glb': 24000, 'tree02.glb': 15000, 'bush.glb': 4500, 'bed-ground.glb': 2, 'flowers.glb': 5000 };
for (const asset of imported.runtime) {
  const payload = await readFile(importRoot + asset.file);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', asset.file);
  assert.equal(payload.readUInt32LE(4), 2);
  assert.equal(payload.readUInt32LE(8), payload.length);
  assert.equal(createHash('sha256').update(payload).digest('hex'), asset.sha256, asset.file);
  const model = JSON.parse(payload.toString('utf8', 20, 20 + payload.readUInt32LE(12)));
  assert.ok(model.buffers.every(buffer => !buffer.uri), `${asset.file} must be self contained`);
  let count = 0;
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    count += (primitive.indices === undefined ? model.accessors[primitive.attributes.POSITION].count : model.accessors[primitive.indices].count) / 3;
    if (asset.file.endsWith('flowers.glb')) assert.ok(primitive.attributes.COLOR_0 !== undefined, 'Original flower palette must survive export');
  }
  assert.equal(count, asset.triangles, asset.file);
  assert.ok(count <= importBudgets[asset.file.split('/').at(-1)], `${asset.file} exceeds its geometry budget`);
}
console.log(JSON.stringify({ importedSources: sourceRecord.originals.length, verifiedRuntimeGLBs: imported.runtime.length,
  status: 'passed', note: 'Byte/geometry checks; no independent license or hardware-performance certification.' }, null, 2));
