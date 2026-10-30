import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { createCollisionIndex } from '../src/collision.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tavern = getEnvironmentKitDefinition('house', 'kit-tripo-tavern');
const index = createCollisionIndex([], tavern.walls);
const point = (x, z, y = 1) => ({ x, y, z });

test('the Tripo tavern preserves its upload and ships a bounded, self-contained textured GLB', () => {
  const source = read('assets/inbox/medieval tavern interior 3d model.glb');
  assert.equal(hash(source), '343d7cf86820f13cae0f6081bd66be66df79769d0b65cb067618f2a2f96d2f1f');
  const bytes = read('assets/imported/tripo-tavern/runtime/tavern.glb');
  const report = JSON.parse(read('assets/imported/tripo-tavern/inspection.json'));
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.ok(bytes.length < 8 * 1024 * 1024, 'The editor must not embed the 65 MB provider source');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.ok(!gltf.extensionsRequired?.length, 'No decoder or external service should be needed');
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(primitive.attributes[name], undefined);
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.ok(triangles > 20_000 && triangles <= 120_000);
  assert.equal(triangles, report.runtime.triangles);
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(material.normalTexture);
  }
  assert.deepEqual(tavern.normalization, { scale: 1, offset: [0, -.3, 0] });
  const bounds = report.normalization.gltfBounds;
  assert.deepEqual(tavern.nativeBounds, { min: bounds[0], max: bounds[1] });
  assert.ok(tavern.footprint.halfWidth >= Math.max(Math.abs(bounds[0][0]), Math.abs(bounds[1][0])));
  assert.ok(tavern.footprint.halfDepth >= Math.max(Math.abs(bounds[0][2]), Math.abs(bounds[1][2])));
});

test('both Tripo inn entrances and both kitchen approaches fit the full player radius', () => {
  const routes = [
    ['front entry', point(0, 10), point(0, 5)],
    ['rear entry', point(-1.1, -10), point(-1.1, -4)],
    ['kitchen west door', point(1, -2.3), point(5, -2.3)],
    ['kitchen south door', point(5.75, 2), point(5.75, -2.3)],
    ['clear main hall', point(0, 6), point(0, -5)],
  ];
  for (const [name, from, to] of routes) assert.equal(index.traceSegment(from, to, .42), null, name);
});

test('solid facade, partitions and dining furniture stop movement and low shots', () => {
  assert.ok(index.traceSegment(point(5, 10), point(5, 7), .42), 'front facade');
  assert.ok(index.traceSegment(point(1, -5), point(5, -5), .42), 'kitchen wall');
  assert.ok(index.traceSegment(point(-6.5, 6, 1.2), point(-6.5, 2, 1.2), .06), 'low shot hits table');
  assert.equal(index.traceSegment(point(-6.5, 6, 2), point(-6.5, 2, 2), .06), null, 'high shot passes above table');
  const embedded = point(-6.5, 3.5);
  index.resolve(embedded, .42);
  assert.ok(embedded.z <= 2.2 - .42 || embedded.z >= 5.06 + .42 || embedded.x <= -8.75 - .42 || embedded.x >= -4.7 + .42);
});

test('large and rotated Tripo inns flatten their full footprint and refine only nearby terrain', () => {
  const map = JSON.parse(read('worldmap.json'));
  for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
    const scale = 1.25, c = Math.cos(rotation), s = Math.sin(rotation);
    map.objects = [{ id: 'tavern-terrain-test', kind: 'house', variant: 'kit-tripo-tavern', position: [180, 150], rotation, scale }];
    const spatial = createWorldSpatialModel(map);
    const toWorld = (x, z) => ({ x: 180 + scale * (c * x + s * z), z: 150 + scale * (-s * x + c * z) });
    const level = spatial.groundAt(180, 150);
    for (const x of [-11, -5, 0, 5, 11]) for (const z of [-8.8, -4, 0, 4, 8.8]) {
      const p = toWorld(x, z);
      assert.ok(Math.abs(spatial.groundAt(p.x, p.z) - level) < 1e-8, `Uneven foundation at ${x},${z} / ${rotation}`);
    }
    assert.equal(spatial.refineTerrainTriangle(toWorld(-10, 0), toWorld(10, 0), toWorld(0, 8)), true);
    assert.equal(spatial.refineTerrainTriangle(toWorld(0, 0), toWorld(1, 0), toWorld(0, 1)), false);
    assert.equal(spatial.refineTerrainTriangle({ x: -400, z: -400 }, { x: -380, z: -400 }, { x: -400, z: -380 }), false);
  }
});
