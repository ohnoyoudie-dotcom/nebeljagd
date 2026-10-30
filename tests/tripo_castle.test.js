import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRIPO_CASTLE_DEFINITION as castle } from '../src/map/tripo-castle-definition.js';
import { createCollisionIndex } from '../src/collision.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const point = ([x, z], y = 1.2) => ({ x, y, z });
const index = createCollisionIndex([], castle.walls);

test('small castle preserves its original and embeds a bounded textured derivative', () => {
  const source = read('assets/inbox/castle interior 3d model.glb');
  assert.equal(hash(source), 'f4166623cf9138ad4ff672e39dbb99418489edfc6fa48f13fec3dda31cb7a4f7');
  const bytes = read('assets/imported/tripo-castle/runtime/castle.glb');
  const report = JSON.parse(read('assets/imported/tripo-castle/inspection.json'));
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.ok(bytes.length < 18 * 1024 * 1024, 'Do not embed the 68 MB source');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
  assert.ok(!gltf.extensionsRequired?.length, 'No extra online decoder required');
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(primitive.attributes[name], undefined);
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.ok(triangles > 100_000 && triangles <= 180_000);
  assert.equal(triangles, report.runtime.triangles);
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness.baseColorTexture);
    assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture);
    assert.ok(material.normalTexture);
  }
  assert.equal(castle.textured, true);
  assert.equal(castle.roofless, true);
  assert.deepEqual(castle.nativeBounds.min, report.normalization.gltfBounds[0]);
  assert.deepEqual(castle.nativeBounds.max, report.normalization.gltfBounds[1]);
});

test('both actual exterior gates and every side-room approach fit a full player capsule', () => {
  for (const route of [...castle.qaRoutes.entrances, ...castle.qaRoutes.rooms]) {
    assert.equal(index.traceSegment(point(route.from), point(route.to), .42), null, route.name);
  }
  assert.equal(castle.entrances.length, 2, 'Keep actual source openings');
});

test('castle facades, partitions and furniture stop movement and low projectiles', () => {
  const hits = [
    ['far east facade', [36, 5], [30, 5]],
    ['far west facade', [-36, -5], [-30, -5]],
    ['south facade beyond old 15m radius', [23, 25], [23, 18]],
    ['north facade', [8, -25], [8, -18]],
    ['interior partition', [8, 0], [16, 0]],
    ['large library table', [-24, -8], [-24, -19]],
  ];
  for (const [name, from, to] of hits) assert.ok(index.traceSegment(point(from), point(to), .42), name);
  const table = castle.walls.find(wall => wall.name === 'kitchen worktable');
  assert.ok(index.traceSegment(point([25, 7]), point([25, 13]), .06));
  assert.equal(index.traceSegment(point([25, 7], table.maxY + .3),
    point([25, 13], table.maxY + .3), .06), null, 'High shots clear low tables');
  const embedded = point([25, 10]);
  index.resolve(embedded, .42);
  assert.ok(embedded.z <= table.minZ - .419 || embedded.z >= table.maxZ + .419 ||
    embedded.x <= table.minX - .419 || embedded.x >= table.maxX + .419);
});

test('terrain supports the full castle footprint after rotation and scaling', () => {
  const map = JSON.parse(read('worldmap.json'));
  for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
    const scale = 1.25, c = Math.cos(rotation), s = Math.sin(rotation);
    map.objects = [{ id: 'castle-ground-check', kind: 'house', variant: castle.variant,
      position: [180, 150], rotation, scale }];
    const spatial = createWorldSpatialModel(map);
    const world = (x, z) => ({ x: 180 + scale * (c*x + s*z), z: 150 + scale * (-s*x + c*z) });
    const level = spatial.groundAt(180, 150);
    for (const x of [-35, -20, 0, 20, 35]) for (const z of [-24.3, -12, 0, 12, 24.3]) {
      const p = world(x, z);
      assert.ok(Math.abs(spatial.groundAt(p.x, p.z) - level) < 1e-8,
        'Uneven foundation at ' + [x,z,rotation].join(','));
    }
    assert.equal(spatial.refineTerrainTriangle(world(-30, 0), world(30, 0), world(0, 20)), true);
    assert.equal(spatial.refineTerrainTriangle(world(0, 0), world(1, 0), world(0, 1)), false);
  }
});
