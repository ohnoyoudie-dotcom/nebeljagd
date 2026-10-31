import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { join, relative, resolve, sep } from 'node:path';

const preserved = JSON.parse(await readFile('archive/preserved-versions.json', 'utf8'));
for (const [path, expected] of Object.entries(preserved)) {
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Preserved version changed: ${path}`);
}
const bytes = await readFile('assets/characters/adventurer.glb');
assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
assert.equal(bytes.readUInt32LE(4), 2);
assert.equal(bytes.readUInt32LE(8), bytes.length);
assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
assert.ok(gltf.skins?.length > 0, 'Character requires real skinning');
assert.ok(gltf.skins[0].joints.length >= 16);
for (const name of ['Idle_Nebeljagd', 'Run_Nebeljagd', 'Roll_Nebeljagd']) assert.ok(gltf.animations.some(animation => animation.name === name), `Missing ${name}`);
assert.ok(gltf.buffers.every(buffer => !buffer.uri), 'GLB must contain its own buffers');
let triangles = 0;
for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
  assert.ok(primitive.attributes.JOINTS_0 !== undefined && primitive.attributes.WEIGHTS_0 !== undefined);
  triangles += gltf.accessors[primitive.indices].count / 3;
}
assert.ok(triangles >= 12000 && triangles <= 25000, `Character must stay within its 12k–25k triangle budget: ${triangles}`);
console.log(JSON.stringify({ status: 'passed', preservedVersions: Object.keys(preserved).length,
  previousCharacter: { bytes: bytes.length, triangles, joints: gltf.skins[0].joints.length,
    clips: gltf.animations.map(animation => animation.name), sha256: createHash('sha256').update(bytes).digest('hex') } }, null, 2));

// The user-supplied animated avatar is used by both the game and its review page.
// Keep the upload unchanged, including its embedded 2K material maps.
const playerPath = 'assets/characters/nebeljagd_player_base_v1.glb';
const player = await readFile(playerPath);
assert.equal(player.toString('ascii', 0, 4), 'glTF');
assert.equal(player.readUInt32LE(4), 2);
assert.equal(player.readUInt32LE(8), player.length);
assert.equal(player.readUInt32LE(16), 0x4e4f534a);
const playerHash = createHash('sha256').update(player).digest('hex');
assert.equal(playerHash, '29232024a0a1be5b6e8d81cf48b2433d6bbd58ac5b0ccb6c035e6c5acab22624', 'Original uploaded avatar bytes must be preserved');
const uploaded = await readFile('public/assets/characters/player/nebeljagd_player_base_v1.glb');
assert.ok(player.equals(uploaded), 'Bundled avatar must match the user upload');
const playerGltf = JSON.parse(player.toString('utf8', 20, 20 + player.readUInt32LE(12)));
assert.ok(playerGltf.skins?.[0]?.joints.length >= 60, 'Imported avatar needs its full humanoid rig');
assert.ok(playerGltf.buffers.every(buffer => !buffer.uri), 'Avatar buffers must be embedded');
assert.equal(playerGltf.images.length, 3);
assert.ok(playerGltf.images.every(image => image.bufferView !== undefined && !image.uri), 'All material textures must be embedded');
for (const pattern of [/standing_relax/, /sprint/i, /Vorwärtsrolle/]) {
  assert.ok(playerGltf.animations.some(clip => pattern.test(clip.name)), `Missing imported movement: ${pattern}`);
}
let playerTriangles = 0;
for (const mesh of playerGltf.meshes) for (const primitive of mesh.primitives) {
  for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']) {
    assert.notEqual(primitive.attributes[attribute], undefined, `Missing avatar attribute ${attribute}`);
  }
  playerTriangles += playerGltf.accessors[primitive.indices].count / 3;
}
assert.equal(playerTriangles, 20161);
for (const material of playerGltf.materials) {
  assert.ok(material.normalTexture && material.pbrMetallicRoughness.baseColorTexture
    && material.pbrMetallicRoughness.metallicRoughnessTexture, 'Preserve complete textured PBR material');
}
console.log(JSON.stringify({ status: 'passed', activeCharacter: { source: playerPath, bytes: player.length,
  triangles: playerTriangles, joints: playerGltf.skins[0].joints.length,
  clips: playerGltf.animations.map(clip => clip.name), embeddedTextures: playerGltf.images.length,
  sha256: playerHash } }, null, 2));

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

// User-supplied Tripo uploads stay untouched. Prepared packages carry a closed
// file roster so browser builds cannot silently use a different derivative.
for (const name of ['tripo-tavern', 'tripo-props', 'tripo-chest', 'tripo-castle', 'tripo-wall']) {
  const root = `assets/imported/${name}/`;
  const manifest = JSON.parse(await readFile(root + 'runtime-manifest.json', 'utf8'));
  const sources = manifest.sources ?? [manifest.source];
  for (const source of sources) {
    assert.ok(source?.path?.startsWith('assets/inbox/') && !source.path.includes('..'), `Invalid source: ${name}`);
    const bytes = await readFile(source.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256, `Original changed: ${source.path}`);
  }
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  assert.ok(files.every(entry => entry.isFile() || entry.isDirectory()), `${name}: only regular package files`);
  const actualPaths = files.filter(entry => entry.isFile()).map(entry => relative(resolve(root), resolve(join(entry.parentPath, entry.name))).split(sep).join('/'))
    .filter(path => path !== 'runtime-manifest.json').sort();
  assert.deepEqual(actualPaths, manifest.files.map(file => file.path).sort(), `${name}: closed package roster`);
  for (const file of manifest.files) {
    assert.ok(file.path && !file.path.startsWith('/') && !file.path.split('/').includes('..'), `${name}: safe relative path`);
    const bytes = await readFile(root + file.path);
    assert.equal(bytes.length, file.bytes, `${name}/${file.path}: length`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${name}/${file.path}: digest`);
  }
  console.log(JSON.stringify({ status: 'passed', package: name, originals: sources.length, verifiedFiles: manifest.files.length }));
}
