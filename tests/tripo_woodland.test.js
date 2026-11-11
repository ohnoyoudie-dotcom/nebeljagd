import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { TRIPO_WOODLAND_DEFINITIONS as props } from '../src/map/tripo-woodland-definitions.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { isObjectPlaceable, makeWorldObject, normalizeWorldmap, getObjectFootprintRadius } from '../src/map/objects.js';
import { getVariantAsset, getVariantPreviewSvg } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { removeRetiredScenery } from '../src/map/retired-scenery.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { createCollisionIndex } from '../src/collision.js';
import { createLobbyMap } from '../src/lobby-map.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('six distinct woodland derivatives retain the six uploaded originals, embedded PBR and browser budgets', () => {
  const inspection = JSON.parse(read('assets/imported/tripo-woodland/inspection.json'));
  assert.equal(inspection.assets.length, 6);
  assert.equal(new Set(inspection.assets.map(a => a.source.sha256)).size, 6);
  assert.equal(new Set(inspection.assets.map(a => a.runtime.sha256)).size, 6);
  let totalBytes = 0;
  for (const record of inspection.assets) {
    assert.equal(hash(read(record.source.path)), record.source.sha256);
    const bytes = read(record.runtime.path);
    assert.equal(hash(bytes), record.runtime.sha256);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    assert.ok(bytes.length < record.policy.fileLimitBytes);
    totalBytes += bytes.length;
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    assert.ok(gltf.buffers.every(b => !b.uri));
    assert.equal(gltf.images.length, 3);
    assert.ok(gltf.images.every(i => !i.uri && i.bufferView !== undefined));
    assert.equal(gltf.extensionsRequired?.length ?? 0, 0);
    const parts = gltf.meshes.flatMap(m => m.primitives);
    assert.ok(parts.reduce((n, p) => n + gltf.accessors[p.indices].count / 3, 0) <= record.policy.triangleBudget);
    for (const part of parts) {
      for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(part.attributes[attr], undefined);
      const material = gltf.materials[part.material];
      assert.ok(material.normalTexture && material.pbrMetallicRoughness.baseColorTexture
        && material.pbrMetallicRoughness.metallicRoughnessTexture);
    }
    const prop = props.find(p => p.file === `${record.id}.glb`);
    assert.deepEqual(prop.nativeBounds, { min: record.normalization.gltfBounds[0], max: record.normalization.gltfBounds[1] });
    assert.ok(Math.abs(prop.nativeBounds.min[1]) < .002, 'on ground');
    assert.ok(Math.abs(prop.nativeBounds.min[0] + prop.nativeBounds.max[0]) < .002, 'centered X');
    assert.ok(Math.abs(prop.nativeBounds.min[2] + prop.nativeBounds.max[2]) < .002, 'centered Z');
    if (prop.kind === 'log') assert.ok(prop.footprint.halfDepth * 2 > prop.height * 2, 'lying along Z');
    assert.equal(getEnvironmentKitDefinition(prop.kind, prop.variant), prop);
    assert.equal(getObjectFootprintRadius(prop.kind, prop.variant), Math.hypot(prop.footprint.halfWidth, prop.footprint.halfDepth));
  }
  assert.ok(totalBytes < 12 * 1024 * 1024, 'combined six-model browser payload');
});

test('all six placeable variants retain transforms through JSON, SVG, schema and cleanup without changing the project map', () => {
  const original = read('worldmap.json');
  const schema = JSON.parse(read('worldmap.schema.json')).$defs.worldObject;
  const map = createLobbyMap();
  map.objects = props.map((prop, i) => {
    assert.equal(isObjectPlaceable(prop.kind, prop.variant), true);
    assert.ok(schema.properties.kind.enum.includes(prop.kind));
    const rule = schema.allOf.find(r => r.if?.properties?.kind?.const === prop.kind);
    assert.ok(rule.then.properties.variant.enum.includes(prop.variant));
    const asset = getVariantAsset(prop.kind, prop.variant);
    assert.ok(asset.sourcePaths.includes(prop.source));
    assert.ok(getVariantPreviewSvg(prop.kind, prop.variant).includes('data:image/webp;base64,'));
    return makeWorldObject(prop.kind, [-12 + i * 4, 4], { id: `woodland-${i}`, variant: prop.variant, rotation: i * .25, scale: 1 + i * .1 });
  });
  assert.deepEqual(validateWorldmap(map).errors, []);
  const reopened = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(reopened.objects, map.objects);
  assert.equal(removeRetiredScenery(reopened).totalRemoved, 0);
  assert.equal(removeNonTripoObjects(reopened).totalRemoved, 0);
  const svg = renderWorldmapSvg(reopened, { editor: true, showObjects: true });
  assert.ok(!svg.includes('NaN'));
  for (const prop of props) {
    assert.ok(svg.includes(`id="world-object-${prop.variant}"`));
    assert.ok(svg.includes(`href="#world-object-${prop.variant}"`));
  }
  assert.equal(hash(read('worldmap.json')), hash(original));
  assert.equal(isObjectPlaceable('crate', 'kit-wood'), false, 'legacy crate stays retired');
});

test('woodland solids stop walking and low shots; high shots clear them and broken crates clear collisions', () => {
  for (const prop of props) {
    const circles = structuredClone(prop.circles), walls = structuredClone(prop.walls);
    const collisions = createCollisionIndex(circles, walls);
    const point = { x: 0, z: 0, y: .2 };
    collisions.resolve(point, .42);
    assert.ok(Math.hypot(point.x, point.z) > .4, prop.id);
    const ray = y => [{ x: -3, z: 0, y }, { x: 3, z: 0, y }];
    assert.ok(collisions.traceSegment(...ray(prop.height * .5), .02), prop.id);
    assert.equal(collisions.traceSegment(...ray(prop.height + .2), .02), null, prop.id);
    if (prop.kind === 'crate') {
      assert.equal(prop.destructible.health, 55);
      walls.forEach(wall => { wall.destroyed = true; });
      assert.equal(collisions.traceSegment(...ray(.2), .02), null);
    }
  }
});
