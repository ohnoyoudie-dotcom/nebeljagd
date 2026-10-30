import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { getObjectFootprintRadius, isObjectAvailable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { createGroundGrassExclusion } from '../src/meadow-ground.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const base = read('worldmap.json'), schema = read('worldmap.schema.json');
const variant = 'kit-tripo-castle';
const castle = getEnvironmentKitDefinition('house', variant);

test('small Tripo castle is a distinct selectable building that survives map save and import', () => {
  assert.equal(isObjectAvailable('house', variant), true);
  const rule = schema.$defs.worldObject.allOf.find(entry => entry.if?.properties?.kind?.const === 'house');
  assert.ok(rule.then.properties.variant.enum.includes(variant));
  const object = makeWorldObject('house', [180, 150], { id: 'castle-roundtrip', variant, rotation: Math.PI / 4, scale: 1.25 });
  const map = { ...structuredClone(base), objects: [object] };
  assert.deepEqual(validateWorldmap(map).errors, []);
  assert.deepEqual(normalizeWorldmap(JSON.parse(JSON.stringify(map))).objects, [object]);
  const asset = getVariantAsset('house', variant);
  assert.equal(asset.label, 'Kleines Schloss · Tripo');
  assert.equal(asset.sourcePaths[0], 'assets/imported/tripo-castle/runtime/castle.glb');
  assert.equal(asset.sourcePaths[1], 'assets/inbox/castle interior 3d model.glb');
  assert.equal(castle.textured, true);
  assert.equal(castle.roofless, true);
});

test('castle editor symbol and selection cover the measured large building rather than a cottage', () => {
  const { halfWidth, halfDepth } = castle.footprint;
  assert.ok(halfWidth >= 34 && halfDepth >= 20);
  assert.ok(getObjectFootprintRadius('house', variant) >= Math.hypot(halfWidth, halfDepth));
  const object = makeWorldObject('house', [180, 150], { id: 'castle-svg', variant });
  const svg = renderWorldmapSvg({ ...structuredClone(base), objects: [object] });
  assert.ok(svg.includes('id="world-object-house-tripo-castle"'));
  assert.ok(svg.includes('href="#world-object-house-tripo-castle"'));
  assert.ok(svg.includes('data-object-variant="kit-tripo-castle"'));
});

test('grass exclusion follows the complete castle footprint when rotated and scaled', () => {
  const { halfWidth: hx, halfDepth: hz } = castle.footprint;
  for (const [rotation, scale] of [[0, 1], [Math.PI / 4, 1.25], [Math.PI / 2, 3]]) {
    const object = makeWorldObject('house', [180, 150], { variant, rotation, scale });
    const excluded = createGroundGrassExclusion({ objects: [object], paths: [], rivers: [] }, { padding: 0 });
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const point = (x, z) => [180 + scale * (c * x + s * z), 150 + scale * (-s * x + c * z)];
    for (const x of [-hx + .1, 0, hx - .1]) for (const z of [-hz + .1, 0, hz - .1]) {
      assert.equal(excluded(...point(x, z)), true, 'No grass through outer rooms or corners');
    }
    assert.equal(excluded(...point(hx + 1, 0)), false, 'Outside grass remains available');
    assert.equal(excluded(...point(0, hz + 1)), false);
  }
});

test('castle terrain plateau covers all corners after rotation without flattening distant ground', () => {
  const { halfWidth: hx, halfDepth: hz } = castle.footprint;
  for (const rotation of [0, Math.PI / 4, Math.PI / 2]) {
    const scale = 1.3;
    const object = makeWorldObject('house', [180, 150], { variant, rotation, scale });
    const spatial = createWorldSpatialModel({ ...structuredClone(base), objects: [object] });
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const point = (x, z) => ({ x: 180 + scale * (c * x + s * z), z: 150 + scale * (-s * x + c * z) });
    const height = spatial.groundAt(180, 150);
    for (const x of [-hx, 0, hx]) for (const z of [-hz, 0, hz]) {
      const p = point(x, z);
      assert.ok(Math.abs(spatial.groundAt(p.x, p.z) - height) < 1e-8);
    }
    assert.equal(spatial.refineTerrainTriangle(point(-hx, 0), point(hx, 0), point(0, hz)), true);
    assert.equal(spatial.refineTerrainTriangle({ x: -400, z: -400 }, { x: -380, z: -400 }, { x: -400, z: -380 }), false);
  }
});
