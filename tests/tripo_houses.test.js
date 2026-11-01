import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { getObjectFootprintRadius, isObjectAvailable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { getVariantAsset, getVariantPreviewSvg } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { createGroundGrassExclusion } from '../src/meadow-ground.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';
import { createCollisionIndex } from '../src/collision.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const json = path => JSON.parse(read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const variant = 'kit-tripo-house-02';
const house = getEnvironmentKitDefinition('house', variant);
const base = json('worldmap.json');
const point = ([x, z], y = 1.2) => ({ x, y, z });

function imageSize(bytes) {
  if (bytes.subarray(1, 4).toString('ascii') === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Embedded texture must be a PNG or JPEG');
  let offset = 2;
  while (offset + 4 < bytes.length) {
    assert.equal(bytes[offset++], 0xff, 'Valid JPEG segment');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += length;
  }
  assert.fail('JPEG texture has no dimensions');
}

test('Wohnhaus 2 preserves its textured upload and embeds a bounded, self-contained runtime model', () => {
  const source = read('assets/inbox/medieval house interior 3d model 2.glb');
  assert.equal(hash(source), 'fc0dc4ab96b6cad1cdaea62d11940adb54389d3227fd85e7a5330c57e2c5ac12');
  const bytes = read('assets/imported/tripo-houses/runtime/house-02.glb');
  const report = json('assets/imported/tripo-houses/inspections/house-02.json');
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.ok(bytes.length < 9 * 1024 * 1024, 'The browser must not embed the 65 MB source');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12), binaryOffset = 20 + jsonLength + 8;
  const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  assert.ok(gltf.buffers.every(buffer => !buffer.uri));
  assert.ok(!gltf.extensionsRequired?.length, 'No network decoder should be required');
  assert.equal(gltf.images.length, 3);
  for (const image of gltf.images) {
    assert.ok(image.bufferView !== undefined && !image.uri, 'Textures must be embedded for offline play');
    const view = gltf.bufferViews[image.bufferView];
    const dimensions = imageSize(bytes.subarray(binaryOffset + (view.byteOffset ?? 0), binaryOffset + (view.byteOffset ?? 0) + view.byteLength));
    assert.ok(dimensions.every(value => value > 0 && value <= 2048), `${dimensions} exceeds the texture budget`);
  }
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
      assert.notEqual(primitive.attributes[name], undefined, `${name} must survive simplification`);
      const accessor = gltf.accessors[primitive.attributes[name]], view = gltf.bufferViews[accessor.bufferView];
      assert.equal(accessor.componentType, 5126);
      const components = name === 'TEXCOORD_0' ? 2 : 3, stride = view.byteStride ?? components * 4;
      const start = binaryOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let i = 0; i < accessor.count; i++) for (let component = 0; component < components; component++) {
        assert.ok(Number.isFinite(bytes.readFloatLE(start + stride * i + component * 4)), `${name} contains a nonfinite value`);
      }
    }
    triangles += gltf.accessors[primitive.indices].count / 3;
  }
  assert.ok(triangles > 20_000 && triangles <= 120_000);
  assert.equal(triangles, report.runtime.triangles);
  for (const material of gltf.materials) {
    assert.ok(material.pbrMetallicRoughness?.baseColorTexture);
    assert.ok(material.pbrMetallicRoughness?.metallicRoughnessTexture);
    assert.ok(material.normalTexture);
  }
  assert.equal(house.textured, true);
  assert.equal(house.roofless, true);
  assert.deepEqual(house.nativeBounds.min, report.normalization.gltfBounds[0]);
  assert.deepEqual(house.nativeBounds.max, report.normalization.gltfBounds[1]);
  assert.ok(Math.abs(house.nativeBounds.max[0] - house.nativeBounds.min[0] - 22) < .05, 'Same approximate width as the approved tavern');
});

test('Wohnhaus 2 is independently placeable, textured in the catalogue and roundtrips through JSON and SVG', () => {
  assert.equal(isObjectAvailable('house', variant), true);
  assert.equal(isObjectAvailable('house', 'kit-tripo-house-01'), false, 'Do not advertise the removed untextured first model');
  const rule = json('worldmap.schema.json').$defs.worldObject.allOf.find(entry => entry.if?.properties?.kind?.const === 'house');
  assert.ok(rule.then.properties.variant.enum.includes(variant));
  const object = makeWorldObject('house', [180, 150], { id: 'house-02-roundtrip', variant, rotation: Math.PI / 3, scale: 1.25 });
  const map = { ...structuredClone(base), objects: [object] };
  assert.deepEqual(validateWorldmap(map).errors, []);
  assert.deepEqual(normalizeWorldmap(JSON.parse(JSON.stringify(map))).objects, [object]);
  const asset = getVariantAsset('house', variant);
  assert.equal(asset.label, 'Wohnhaus 2 · Tripo');
  assert.equal(asset.sourcePaths[0], 'assets/imported/tripo-houses/runtime/house-02.glb');
  assert.equal(asset.sourcePaths[1], 'assets/inbox/medieval house interior 3d model 2.glb');
  assert.ok(getVariantPreviewSvg('house', variant).includes('data:image/webp;base64,'));
  assert.ok(getObjectFootprintRadius('house', variant) >= Math.hypot(house.footprint.halfWidth, house.footprint.halfDepth));
  const svg = renderWorldmapSvg(map);
  assert.ok(svg.includes('data-object-variant="kit-tripo-house-02"'));
  const symbolId = svg.match(/data-feature-id="house-02-roundtrip"[^]*?<use href="#([^"]+)"/)?.[1];
  assert.equal(symbolId, 'world-object-house-tripo-02', 'Use the measured floor plan instead of a generic cottage');
  const symbol = svg.match(new RegExp(`<g id="${symbolId}">([^]*?)</g>`))?.[1];
  assert.ok(symbol, 'Referenced house floor plan must be embedded in the export');
  const floorWidth = Number(symbol.match(/<rect[^>]*\swidth="([^"]+)"/)?.[1]);
  assert.ok(floorWidth >= 22 && floorWidth < 22.1, 'Floor plan covers the full 22 m building');
});

test('rotated and scaled Wohnhaus 2 keeps grass outside its foundation and terrain level under every corner', () => {
  const { halfWidth: hx, halfDepth: hz } = house.footprint;
  for (const [rotation, scale] of [[0, 1], [Math.PI / 4, 1.25], [Math.PI / 2, 2]]) {
    const object = makeWorldObject('house', [180, 150], { variant, rotation, scale });
    const map = { ...structuredClone(base), objects: [object] };
    const excluded = createGroundGrassExclusion({ objects: [object], paths: [], rivers: [] }, { padding: 0 });
    const spatial = createWorldSpatialModel(map), level = spatial.groundAt(180, 150);
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const world = (x, z) => ({ x: 180 + scale * (c * x + s * z), z: 150 + scale * (-s * x + c * z) });
    for (const x of [-hx + .1, 0, hx - .1]) for (const z of [-hz + .1, 0, hz - .1]) {
      const p = world(x, z);
      assert.equal(excluded(p.x, p.z), true, 'No grass through the interior or outer corners');
      assert.ok(Math.abs(spatial.groundAt(p.x, p.z) - level) < 1e-8, 'The complete foundation must rest on level terrain');
    }
    for (const [x, z] of [[hx + .1, 0], [0, hz + .1]]) {
      const p = world(x, z); assert.equal(excluded(p.x, p.z), false, 'Grass reaches the outside edge without a bare halo');
    }
    assert.equal(spatial.refineTerrainTriangle(world(-hx, 0), world(hx, 0), world(0, hz)), true);
    assert.equal(spatial.refineTerrainTriangle({ x: -400, z: -400 }, { x: -380, z: -400 }, { x: -400, z: -380 }), false);
  }
});

test('the exterior entrance and bedroom/kitchen approaches fit a full player capsule', () => {
  const index = createCollisionIndex([], house.walls);
  assert.ok(house.qaRoutes.entrances.length > 0 && house.qaRoutes.rooms.length >= 2);
  for (const route of [...house.qaRoutes.entrances, ...house.qaRoutes.rooms]) {
    assert.equal(index.traceSegment(point(route.from), point(route.to), .42), null, route.name);
    // Walking samples also verify the actual movement resolver, which ignores Y.
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, p = point(route.from.map((value, axis) => value + (route.to[axis] - value) * t));
      const original = { ...p }; index.resolve(p, .42);
      assert.ok(Math.hypot(p.x - original.x, p.z - original.z) < 1e-7, route.name);
    }
  }
  for (const entrance of house.entrances) {
    assert.ok(entrance.max - entrance.min > 1.2, 'The actual entrance admits the player with clearance');
    const x = (entrance.min + entrance.max) / 2, direction = entrance.side === 'south' ? 1 : -1;
    const start = entrance.boundary + direction * (entrance.depth + .01);
    assert.equal(houseFloorFactorAt(x, start, house.floorBounds, house.interior, house.entrances), null);
    assert.ok(houseFloorFactorAt(x, entrance.boundary + direction * entrance.depth / 2, house.floorBounds, house.interior, house.entrances) > 0);
  }
  assert.equal(houseFloorFactorAt(0, 0, house.floorBounds, house.interior, house.entrances), 1);
});

test('the house facades, room partitions and fixed furnishing stop movement while high shots clear low furniture', () => {
  const index = createCollisionIndex([], house.walls);
  for (const [name, from, to] of [
    ['south facade', [5, 12], [5, 8]],
    ['west facade', [-12, 3], [-9, 3]],
    ['east facade', [12, -3], [9, -3]],
    ['bedroom south partition', [-4.7, 2], [-4.7, -2]],
    ['bedroom/kitchen divider', [-2, -5], [2, -5]],
  ]) assert.equal(index.traceSegment(point(from), point(to), .42)?.type, 'house-wall', name);
  assert.equal(index.traceSegment(point([0, 8]), point([0, 3]), .06)?.type, 'furniture', 'Dining furniture stops low shots');
  assert.equal(index.traceSegment(point([0, 8], 3), point([0, 3], 3), .06), null, 'High shots clear the table and chairs');
  const embedded = point([0, 5]), before = { ...embedded };
  index.resolve(embedded, .42);
  assert.ok(Math.hypot(embedded.x - before.x, embedded.z - before.z) > .42, 'The table cannot be walked through');
  assert.ok(!house.walls.some(body => embedded.x > body.minX && embedded.x < body.maxX && embedded.z > body.minZ && embedded.z < body.maxZ));
});
