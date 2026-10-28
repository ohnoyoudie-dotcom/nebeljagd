import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OBJECT_CATALOG, getObjectDefinition, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { getVariantAsset, ASSET_CATALOG } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { ensureLandscape, vegetationSettings, BIOME_PRESETS } from '../src/map/landscape.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const base = JSON.parse(read('worldmap.json'));
const schema = JSON.parse(read('worldmap.schema.json'));
const kit = [
  ['tree', 'kit-pine-high', 'pine_high'], ['tree', 'kit-pine-young', 'pine_young'],
  ['tree', 'kit-oak-green', 'oak_green'], ['tree', 'kit-oak-autumn', 'oak_autumn'],
  ['wall', 'kit-stone', 'wall_stone_3m'], ['fence', 'kit-wood', 'fence_wood_3m'],
  ['ruin', 'kit-arch', 'ruin_arch'], ['rock', 'kit-cluster', 'rock_cluster'],
  ['rock', 'kit-single', 'rock_single'], ['grass', 'kit-tall', 'grass_tall_patch'],
  ['house', 'kit-timber', 'house_timbersmall'], ['crate', 'kit-wood', 'crate_wood'],
];

test('the twelve original environment-kit variants preserve map imports and match structural schema enums', () => {
  const map = structuredClone(base);
  for (const [kind, variant] of kit) {
    const object = makeWorldObject(kind, [30, -42], { variant, id: `kit-test-${kind}-${variant}` });
    map.objects.push(object);
    assert.ok(schema.$defs.worldObject.properties.kind.enum.includes(kind));
    const rule = schema.$defs.worldObject.allOf.find(entry => entry.if?.properties?.kind?.const === kind);
    assert.ok(rule?.then.properties.variant.enum.includes(variant), `${kind}:${variant} must be schema-valid`);
  }
  assert.deepEqual(validateWorldmap(map).errors, []);
  assert.deepEqual(normalizeWorldmap(map), map, 'existing kit imports never silently substitute or drop objects');
  assert.deepEqual(map.objects.slice(0, base.objects.length), base.objects);
  assert.equal(vegetationSettings({ kind: 'grass', variant: 'kit-tall' }).type, 'tall');
  assert.equal(OBJECT_CATALOG.flatMap(def => def.variants).length, 39);
  assert.equal(ASSET_CATALOG.length, 39);
});

test('the uploaded tavern GLB is a valid selectable map asset with a traversable main entrance', () => {
  const bytes = read('Blender/Taverne.glb');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.ok((gltf.buffers ?? []).every(buffer => !buffer.uri), 'The project keeps a self-contained GLB source');
  assert.equal(gltf.images?.length ?? 0, 0);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    triangles += (primitive.indices === undefined ? gltf.accessors[primitive.attributes.POSITION].count : gltf.accessors[primitive.indices].count) / 3;
  }
  assert.ok(triangles > 100_000 && triangles < 150_000, `Unexpected source triangle count: ${triangles}`);
  const asset = getVariantAsset('house', 'kit-taverne');
  assert.equal(asset.format, 'glb');
  assert.deepEqual(asset.sourcePaths, ['Blender/Taverne.glb']);
  const tavern = makeWorldObject('house', [30, -42], { variant: 'kit-taverne', id: 'kit-test-taverne' });
  const map = structuredClone(base); map.objects.push(tavern);
  assert.deepEqual(validateWorldmap(map).errors, []);
  const definition = getObjectDefinition('house');
  assert.ok(definition.variants.some(variant => variant.id === tavern.variant));
});

test('kit catalogue sources match the committed manifest bytes and the package footprint hints', () => {
  const manifest = JSON.parse(read('Blender/nebeljagd_umwelt_kit_v1/manifest.json'));
  const hints = JSON.parse(read('Blender/nebeljagd_umwelt_kit_v1/Kollisionen_und_Interaktionen.json'));
  for (const [kind, variant, name] of kit) {
    const asset = getVariantAsset(kind, variant);
    assert.equal(asset.format, 'glb');
    assert.equal(asset.status, 'available');
    assert.equal(asset.provenance, 'Blender/nebeljagd_umwelt_kit_v1/manifest.json');
    const expected = manifest.assets.find(item => item.name === name);
    assert.equal(asset.sourcePaths[0], `Blender/nebeljagd_umwelt_kit_v1/${expected.file}`);
    assert.equal(createHash('sha256').update(read(asset.sourcePaths[0])).digest('hex'), expected.sha256);
    if (['wall', 'fence', 'crate'].includes(kind)) {
      const definition = getObjectDefinition(kind), [width, depth] = hints.objects[name].size_xyz;
      assert.equal(definition.footprintWidth, width);
      assert.equal(definition.footprintDepth, depth);
      assert.equal(definition.footprintRadius, Math.hypot(width / 2, depth / 2));
    }
  }
});

test('scatter presets accept kit vegetation and rocks, autumn uses the real autumn asset, and wrong kind variants fail', () => {
  const map = structuredClone(base), landscape = ensureLandscape(map);
  const entries = kit.filter(([kind]) => ['tree', 'grass', 'rock'].includes(kind)).map(([kind, variant]) => ({ kind, variant, weight: 1 }));
  landscape.presets.push({ id: 'kit-scatter', name: 'Umwelt-Kit verteilen', scatter: { density: .4, entries } });
  assert.deepEqual(validateWorldmap(map).errors, []);
  for (const entry of entries) {
    const rule = schema.$defs.landscapeScatterEntry.allOf.find(rule => rule.if.properties.kind.const === entry.kind);
    assert.ok(rule.then.properties.variant.enum.includes(entry.variant));
  }
  const autumn = BIOME_PRESETS.find(item => item.id === 'autumn');
  assert.ok(autumn.scatter.entries.some(item => item.kind === 'tree' && item.variant === 'kit-oak-autumn'));
  for (const [kind, variant] of [['wall', 'kit-wood'], ['fence', 'kit-stone'], ['house', 'kit-arch'], ['grass', 'kit-single']]) {
    const invalid = structuredClone(base);
    invalid.objects.push(makeWorldObject(kind, [30, -42], { variant }));
    assert.equal(validateWorldmap(invalid).valid, false, `${kind}:${variant}`);
  }
  landscape.presets[0].scatter.entries.push({ kind: 'wall', variant: 'kit-stone', weight: 1 });
  assert.equal(validateWorldmap(map).valid, false, 'automatic natural scatter still uses only its five intended categories');
});
