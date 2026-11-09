import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { join, relative, resolve, sep } from 'node:path';

const preserved = JSON.parse(await readFile('archive/preserved-versions.json', 'utf8'));
for (const [path, expected] of Object.entries(preserved)) {
  const bytes = await readFile(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, `Preserved version changed: ${path}`);
}

// Separate derivative of the user's repaired tree; preserve both source files.
{
  const root = 'assets/imported/user-trees/styled/';
  const manifest = JSON.parse(await readFile(root + 'manifest.json', 'utf8'));
  assert.deepEqual((await readdir(root)).filter(p => p !== 'manifest.json').sort(), manifest.files.map(f => f.path).sort());
  for (const file of manifest.files) {
    assert.ok(!file.path.includes('/') && !file.path.includes('..'));
    const bytes = await readFile(root + file.path);
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const report = JSON.parse(await readFile(root + 'inspection.json', 'utf8'));
  for (const source of [report.source, report.authoringSource]) {
    assert.equal(createHash('sha256').update(await readFile(source.path)).digest('hex'), source.sha256, source.path);
  }
  const bytes = await readFile(root + 'tree1-woodland.glb');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF'); assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 700000);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const parts = gltf.meshes.flatMap(m => m.primitives);
  const treeTriangles = parts.reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);
  assert.equal(treeTriangles, report.runtime.triangles, 'Tree geometry matches its inspection');
  assert.ok(treeTriangles > 6992 && treeTriangles <= 16000, 'Rounded trunk and cupped leaves stay within 16k triangles');
  for (const part of parts) {
    assert.notEqual(part.attributes.NORMAL, undefined, 'Tree parts retain smooth normals');
    assert.notEqual(part.attributes.COLOR_0, undefined, 'Bark and foliage both carry color variation');
  }
  assert.ok(gltf.buffers.every(b => !b.uri) && gltf.images.every(i => !i.uri && i.bufferView !== undefined));
  const leaves = parts.find(p => gltf.materials[p.material].alphaMode === 'MASK');
  assert.ok(leaves && leaves.attributes.TEXCOORD_0 !== undefined && leaves.attributes.COLOR_0 !== undefined);
  assert.ok(gltf.materials[leaves.material].doubleSided && gltf.materials[leaves.material].pbrMetallicRoughness.baseColorTexture);
  assert.ok(Math.abs(Math.max(...parts.map(p => gltf.accessors[p.attributes.POSITION].max[1])) - 7.8036928) < .0001);
  console.log(JSON.stringify({ status: 'passed', package: 'user-tree-woodland', sourcePreserved: true, triangles: treeTriangles, bytes: bytes.length }));
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
for (const name of ['tripo-tavern', 'tripo-props', 'tripo-chest', 'tripo-castle', 'tripo-wall', 'tripo-houses', 'tripo-weapons', 'tripo-extra-weapons', 'tripo-projectiles', 'tripo-moon-projectile', 'tripo-star-moon', 'tripo-gravity-staff']) {
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

// Weapon uploads contain nearly two million triangles each. Validate the
// actual prepared GLBs, rather than trusting their inspection reports, before
// embedding them in the offline browser build.
const weaponBytes = { 'tripo-weapons': 0, 'tripo-extra-weapons': 0, 'tripo-star-moon': 0 };
for (const [packageName, name, length] of [
  ['tripo-weapons', 'sword', 1.25], ['tripo-weapons', 'lava-staff', 1.7], ['tripo-weapons', 'crystal-staff', 1.7],
  ['tripo-extra-weapons', 'poison-staff', 1.7], ['tripo-extra-weapons', 'moon-staff', 1.7], ['tripo-extra-weapons', 'ornate-bow', 1.35],
  ['tripo-star-moon', 'star-staff', 1.7],
]) {
  const path = `assets/imported/${packageName}/runtime/${name}.glb`;
  const bytes = await readFile(path);
  weaponBytes[packageName] += bytes.length;
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', path);
  assert.equal(bytes.readUInt32LE(4), 2, path);
  assert.equal(bytes.readUInt32LE(8), bytes.length, path);
  assert.ok(bytes.length <= 1.5 * 1024 * 1024, `${name}: browser file budget`);
  const model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(model.buffers?.length && model.buffers.every(buffer => !buffer.uri), `${name}: embedded buffers`);
  assert.ok(model.images?.length && model.images.every(image => image.bufferView !== undefined && !image.uri), `${name}: embedded textures`);
  assert.ok(model.materials?.length && model.materials.every(material =>
    material.normalTexture && material.pbrMetallicRoughness?.baseColorTexture
    && material.pbrMetallicRoughness.metallicRoughnessTexture), `${name}: original PBR channels`);
  let triangles = 0;
  let bottom = Infinity, top = -Infinity;
  for (const mesh of model.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.mode === undefined || primitive.mode === 4, `${name}: triangle primitives`);
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
      assert.notEqual(primitive.attributes[attribute], undefined, `${name}: ${attribute}`);
    }
    const position = model.accessors[primitive.attributes.POSITION];
    triangles += (primitive.indices === undefined ? position.count : model.accessors[primitive.indices].count) / 3;
    bottom = Math.min(bottom, position.min[1]);
    top = Math.max(top, position.max[1]);
  }
  assert.ok(triangles > 0 && triangles <= 12010, `${name}: 12k triangle budget (${triangles})`);
  assert.ok(bottom < 0 && top > 0, `${name}: grip-origin must lie inside the weapon`);
  assert.ok(Math.abs(top - bottom - length) <= .06, `${name}: metric length`);
  console.log(JSON.stringify({ status: 'passed', weapon: name, bytes: bytes.length, triangles, length: top - bottom }));
}
assert.ok(weaponBytes['tripo-weapons'] <= 4 * 1024 * 1024, 'Original weapon browser payload must stay within 4 MiB');
assert.ok(weaponBytes['tripo-extra-weapons'] <= 4.5 * 1024 * 1024, 'Additional weapon browser payload must stay within 4.5 MiB');

// The actual uploaded crescent replaces the temporary procedural projectile.
{
  const path = 'assets/imported/tripo-star-moon/runtime/moon-crescent.glb';
  const bytes = await readFile(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', path);
  assert.equal(bytes.readUInt32LE(4), 2, path);
  assert.equal(bytes.readUInt32LE(8), bytes.length, path);
  const model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(model.buffers?.length && model.buffers.every(buffer => !buffer.uri), 'Moon: embedded buffers');
  assert.ok(model.images?.length && model.images.every(image => !image.uri && image.bufferView !== undefined), 'Moon: embedded textures');
  assert.ok(!(model.extensionsRequired ?? []).some(name => /draco|meshopt|basisu/i.test(name)), 'Moon: no external decoder');
  assert.ok(model.materials?.length && model.materials.every(material => material.normalTexture
    && material.pbrMetallicRoughness?.baseColorTexture && material.pbrMetallicRoughness.metallicRoughnessTexture), 'Moon: original PBR channels');
  let triangles = 0;
  for (const mesh of model.meshes) for (const part of mesh.primitives) {
    assert.ok(part.mode === undefined || part.mode === 4, 'Moon: triangle primitives');
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(part.attributes[attribute], undefined, `Moon: ${attribute}`);
    triangles += (part.indices === undefined ? model.accessors[part.attributes.POSITION].count : model.accessors[part.indices].count) / 3;
  }
  assert.ok(triangles > 0 && triangles <= 6010, `Moon: 6k triangle budget (${triangles})`);
  assert.ok(bytes.length <= 1024 * 1024, 'Moon: compact projectile file');
  assert.ok(bytes.length + weaponBytes['tripo-star-moon'] <= 2 * 1024 * 1024, 'Star and moon: combined browser payload below 2 MiB');
  console.log(JSON.stringify({ status: 'passed', projectile: 'moon-crescent', bytes: bytes.length, triangles, sourceUnchanged: true }));
}

// The uploaded fire stays untouched; only the inspected small derivative ships.
{
  const record = JSON.parse(await readFile('assets/imported/tripo-fireball/inspection.json', 'utf8'));
  const source = await readFile(record.source);
  const runtime = await readFile('assets/imported/tripo-fireball/runtime/fireball.glb');
  assert.equal(createHash('sha256').update(source).digest('hex'), '48be7b6326161097ac628d6d52cede7a3c1f202a3e7a3309741d4144ece02f65');
  assert.equal(createHash('sha256').update(runtime).digest('hex'), record.runtime.sha256);
  assert.ok(Object.values(record.validation).every(Boolean));
  assert.ok(record.runtime.triangles <= 6000 && runtime.length <= 1536 * 1024);
  assert.ok(record.textures.every(texture => Math.max(...texture.runtimeSize) <= 512));
  console.log(JSON.stringify({ status: 'passed', package: 'tripo-fireball', triangles: record.runtime.triangles, bytes: runtime.length, sourceUnchanged: true }));
}
