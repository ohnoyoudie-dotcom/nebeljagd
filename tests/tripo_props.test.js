import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRIPO_PROP_DEFINITIONS, TRIPO_CHEST_MOVEMENT_WALLS } from '../src/map/tripo-prop-definitions.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { createCollisionIndex } from '../src/collision.js';
import { createSightModel } from '../src/visibility-model.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = ['wagon', 'barrel', 'well', 'rock-01', 'rock-02', 'rock-03'];
const definition = id => TRIPO_PROP_DEFINITIONS.find(item => item.file === `${id}.glb`);
const point = (x, z, y = .4) => ({ x, y, z });

test('six Tripo props preserve their original uploads and carry bounded embedded PBR models', () => {
  for (const id of ids) {
    const report = JSON.parse(read(`assets/imported/tripo-props/inspections/${id}.json`));
    assert.equal(hash(read(report.source.path)), report.source.sha256, `${id} original upload`);
    const bytes = read(report.runtime.path);
    assert.equal(hash(bytes), report.runtime.sha256, `${id} runtime checksum`);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.ok(bytes.length < 4 * 1024 * 1024, `${id} repeated scenery budget`);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(gltf.buffers.every(buffer => !buffer.uri));
    assert.equal(gltf.images.length, 3);
    assert.ok(gltf.images.every(image => image.bufferView !== undefined && !image.uri));
    assert.equal(gltf.extensionsRequired?.length ?? 0, 0, 'no network decoder dependency');
    let triangles = 0;
    for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
      for (const attribute of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(primitive.attributes[attribute], undefined, `${id} ${attribute}`);
      triangles += gltf.accessors[primitive.indices].count / 3;
    }
    assert.ok(triangles <= report.policy.triangleBudget, `${id} triangle budget`);
    assert.equal(triangles, report.runtime.triangles);
    for (const material of gltf.materials) {
      assert.ok(material.pbrMetallicRoughness.baseColorTexture, `${id} authored colour`);
      assert.ok(material.pbrMetallicRoughness.metallicRoughnessTexture, `${id} authored surface`);
      assert.ok(material.normalTexture, `${id} authored normal map`);
    }
    const prop = definition(id), bounds = report.normalization.gltfBounds;
    assert.deepEqual(prop.nativeBounds, { min: bounds[0], max: bounds[1] }, `${id} measured runtime bounds`);
    assert.equal(getEnvironmentKitDefinition(prop.kind, prop.variant), prop);
    assert.equal(prop.textured, true);
    assert.deepEqual(prop.normalization, { scale: 1, offset: [0, 0, 0] });
    assert.ok(Math.abs(bounds[0][1]) < .002, `${id} grounded`);
    assert.ok(prop.footprint.halfWidth >= Math.max(Math.abs(bounds[0][0]), Math.abs(bounds[1][0])), `${id} editor width`);
    assert.ok(prop.footprint.halfDepth >= Math.max(Math.abs(bounds[0][2]), Math.abs(bounds[1][2])), `${id} editor depth`);
    assert.ok(Math.abs(prop.height - bounds[1][1]) < .04, `${id} gameplay height matches model`);
  }
});

test('Tripo scenery stops walking through solids and allows shots above low rocks and shafts', () => {
  for (const id of ids) {
    const prop = definition(id);
    const index = createCollisionIndex(prop.circles, prop.walls.filter(body => !body.projectileOnly));
    const start = point(0, 0);
    index.resolve(start, .42);
    assert.ok(Math.hypot(start.x, start.z) > .5, `${id} pushes player out of solid footprint`);
  }
  const rock = definition('rock-01'), rockIndex = createCollisionIndex(rock.circles, rock.walls);
  assert.ok(rockIndex.traceSegment(point(-2, 0), point(2, 0), .06), 'low shot hits the flat stone');
  assert.equal(rockIndex.traceSegment(point(-2, 0, 1.2), point(2, 0, 1.2), .06), null, 'arrows clear the flat stone');
  const wagon = definition('wagon'), wagonIndex = createCollisionIndex(wagon.circles, wagon.walls);
  assert.ok(wagonIndex.traceSegment(point(-2, -.5, .8), point(2, -.5, .8), .06), 'arrow hits the cargo box');
  assert.equal(wagonIndex.traceSegment(point(-2, .95, .8), point(2, .95, .8), .06), null, 'empty space above the handles remains open');
  assert.equal(wagonIndex.traceSegment(point(0, 2, .3), point(0, .6, .3), .06), null, 'shaft gap is not a solid wall');
});

test('well canopy stops high arrows without blocking walking under its outside overhang', () => {
  const well = definition('well');
  const projectiles = createCollisionIndex(well.circles, well.walls);
  const movement = createCollisionIndex(well.circles, well.walls.filter(body => !body.projectileOnly));
  const beside = point(1.1, .8), before = { ...beside };
  movement.resolve(beside, .15);
  assert.deepEqual(beside, before, 'roof outline does not create an invisible ground wall');
  assert.ok(projectiles.traceSegment(point(-2, .68, 2), point(2, .68, 2), .06), 'canopy blocks an elevated projectile');
  assert.equal(projectiles.traceSegment(point(-2, .8, 1.1), point(2, .8, 1.1), .03), null, 'space below roof remains clear above the basin');
});

test('barrel collisions and sight obstruction disappear after destruction and return on reset', () => {
  const barrel = definition('barrel');
  assert.equal(barrel.destructible.health, 60);
  const walls = structuredClone(barrel.walls);
  const index = createCollisionIndex([], walls);
  const sight = createSightModel({ obstacles: walls, radius: 12 });
  sight.update(point(-3, 0, 0));
  assert.equal(sight.isVisible(point(3, 0, 0)), false);
  assert.ok(index.traceSegment(point(-3, 0), point(3, 0), .06));
  for (const body of walls) body.destroyed = true;
  sight.update(point(-3, 0, 0));
  assert.equal(sight.isVisible(point(3, 0, 0)), true);
  assert.equal(index.traceSegment(point(-3, 0), point(3, 0), .06), null);
  const cleared = point(0, 0); index.resolve(cleared, .42);
  assert.deepEqual(cleared, point(0, 0));
  for (const body of walls) body.destroyed = false;
  sight.update(point(-3, 0, 0));
  assert.equal(sight.isVisible(point(3, 0, 0)), false);
  assert.ok(index.traceSegment(point(-3, 0), point(3, 0), .06));
});

test('animated chest base stops a rotated, scaled player without becoming its own visibility blocker', () => {
  const movement = createCollisionIndex([], TRIPO_CHEST_MOVEMENT_WALLS);
  const rayQueries = createCollisionIndex([], TRIPO_CHEST_MOVEMENT_WALLS.filter(body => !body.movementOnly));
  const rotation = Math.PI / 4, scale = 1.1, c = Math.cos(rotation), s = Math.sin(rotation);
  const toWorld = p => ({ x: 13 + scale * (c * p.x + s * p.z), z: -8 + scale * (-s * p.x + c * p.z) });
  const toLocal = p => ({ x: (c * (p.x - 13) - s * (p.z + 8)) / scale, z: (s * (p.x - 13) + c * (p.z + 8)) / scale });
  const approaching = toLocal(toWorld(point(0, .7)));
  movement.resolve(approaching, .42 / scale);
  assert.ok(approaching.z >= .575 + .42 / scale - 1e-8, 'player stays outside visible chest base');
  assert.equal(rayQueries.traceSegment(point(0, 2, .5), point(0, 0, .5)), null, 'E and loot rays can reach the chest centre');
});
