import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { makeBarrier, generateBarrierObjects } from '../src/map/barriers.js';
import { createCollisionIndex } from '../src/collision.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = 'assets/imported/tripo-wall/';
const definition = getEnvironmentKitDefinition('wall', 'kit-tripo-wall');

test('the weathered wall preserves the uploaded source and embeds bounded original PBR textures', () => {
  const report = json(root + 'inspection.json');
  assert.equal(report.source.sha256, 'ed482de99b6325d4166df73acf69054a03c80eb24c764835baef153948d7423e');
  assert.equal(hash(read(report.source.path)), report.source.sha256);
  const bytes = read(root + 'runtime/wall.glb');
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length <= 4 * 1024 * 1024, 'repeated scenery download budget');
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.equal(gltf.extensionsRequired?.length ?? 0, 0, 'offline game needs no external decoder');
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(primitive.attributes[attribute], undefined);
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.ok(triangles <= 12000, 'repeated modules must use the optimized model');
  assert.equal(triangles, report.runtime.triangles);
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness.baseColorTexture, 'original stone colour');
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture, 'original surface response');
    assert.ok(material.normalTexture, 'original surface details');
  }
  for (const image of report.textures) assert.ok(image.runtimeSize.every(size => size <= 2048));
  assert.ok(Object.values(report.validation).every(value => value === true));
});

test('wall package contains exactly its verified files with no unrecorded runtime assets', () => {
  const manifest = json(root + 'runtime-manifest.json');
  const directory = fileURLToPath(new URL('../' + root, import.meta.url));
  const entries = readdirSync(directory, { recursive: true, withFileTypes: true });
  const actual = entries.filter(entry => entry.isFile()).map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .filter(path => path !== 'runtime-manifest.json').sort();
  assert.ok(entries.every(entry => entry.isFile() || entry.isDirectory()), 'no package symlinks');
  assert.deepEqual(actual, manifest.files.map(file => file.path).sort());
  for (const file of manifest.files) {
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
    const bytes = read(root + file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
  }
});

test('measured wall dimensions govern exact repetition, solid collision and clear passages', () => {
  const report = json(root + 'inspection.json'), bounds = report.normalization.gltfBounds;
  assert.deepEqual(definition.nativeBounds, { min: bounds[0], max: bounds[1] });
  assert.equal(definition.textured, true);
  assert.deepEqual(definition.normalization, { scale: 1, offset: [0, 0, 0] });
  assert.ok(Math.abs(bounds[0][1]) < .002, 'model rests on the ground');
  assert.ok(Math.abs(definition.footprint.halfWidth * 2 - 6) < .02);
  assert.ok(definition.footprint.halfDepth >= Math.max(Math.abs(bounds[0][2]), Math.abs(bounds[1][2])) - 1e-6);
  const collision = createCollisionIndex([], definition.walls);
  assert.ok(collision.traceSegment({ x: 0, y: .7, z: -2 }, { x: 0, y: .7, z: 2 }, .05));
  assert.equal(collision.traceSegment({ x: 0, y: definition.height + .2, z: -2 }, { x: 0, y: definition.height + .2, z: 2 }, .05), null);
  for (const scale of [.5, 1, 1.5]) {
    const route = makeBarrier('wall-tripo', [[0, 0], [31, 0]], { scale, gaps: [{ at: 15.5, width: 3 }] });
    const before = structuredClone(route), parts = generateBarrierObjects(route);
    const boxes = parts.map(part => {
      const hx = definition.footprint.halfWidth * scale * part.longitudinalScale;
      return [part.position[0] - hx, part.position[0] + hx];
    });
    assert.ok(Math.abs(boxes[0][0]) < 1e-7 && Math.abs(boxes.at(-1)[1] - 31) < 1e-7);
    for (const [a, b] of boxes) assert.ok(b <= 14 + 1e-7 || a >= 17 - 1e-7, 'no module enters the opening');
    const gaps = boxes.slice(1).map(([a], i) => a - boxes[i][1]).filter(width => width > 1e-7);
    assert.equal(gaps.length, 1); assert.ok(Math.abs(gaps[0] - 3) < 1e-7);
    assert.deepEqual(route, before, 'runtime expansion leaves authored data editable');
  }
});
