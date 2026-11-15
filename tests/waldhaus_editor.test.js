import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACEMENT_OBJECT_CATALOG, getObjectFootprintRadius, isObjectPlaceable,
  makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { removeRetiredBuildings } from '../src/map/retired-buildings.js';
import { WALDHAUS_DEFINITION, WALDHAUS_FURNITURE } from '../src/map/waldhaus-definition.js';

const base = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
const schema = JSON.parse(readFileSync(new URL('../worldmap.schema.json', import.meta.url)));
const house = (options = {}) => makeWorldObject('house', [30, -42], { variant: 'waldhaus', id: 'waldhaus-editor-test', ...options });

test('Waldhaus is a named, placeable project model with the actual playable footprint', () => {
  const variant = PLACEMENT_OBJECT_CATALOG.find(entry => entry.kind === 'house').variants.find(entry => entry.id === 'waldhaus');
  assert.equal(variant?.label, 'Waldhaus');
  assert.equal(isObjectPlaceable('house', 'waldhaus'), true);
  assert.equal(house().name, 'Waldhaus');
  assert.equal(variant.footprintWidth, WALDHAUS_DEFINITION.footprint.halfWidth * 2);
  assert.equal(variant.footprintDepth, WALDHAUS_DEFINITION.footprint.halfDepth * 2);
  assert.equal(getObjectFootprintRadius('house', 'waldhaus'), 7.5);
  const asset = getVariantAsset('house', 'waldhaus');
  assert.equal(asset.label, 'Waldhaus');
  assert.equal(asset.format, 'procedural');
  assert.equal(asset.previewKind, 'render');
  assert.ok(asset.sourcePaths.includes('src/waldhaus-model.js'));
  assert.doesNotMatch(asset.sourceLabel, /Tripo/);
  assert.equal(asset.provenance, undefined, 'an original project house does not claim an imported asset source');
});

test('Waldhaus survives rotated, scaled save/import and both old-model cleanup actions', () => {
  const object = house({ name: 'Haus am Waldrand', rotation: Math.PI / 2, scale: 1.35 });
  const map = { ...structuredClone(base), objects: [object] };
  const rule = schema.$defs.worldObject.allOf.find(entry => entry.if?.properties?.kind?.const === 'house');
  assert.ok(rule.then.properties.variant.enum.includes('waldhaus'));
  assert.deepEqual(validateWorldmap(map).errors, []);
  const restored = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(restored, map);
  assert.deepEqual(removeRetiredBuildings(restored).map.objects, [object]);
  assert.deepEqual(removeNonTripoObjects(restored).map.objects, [object]);
  const svg = renderWorldmapSvg(restored);
  assert.match(svg, /data-object-variant="waldhaus" transform="translate\(30 -42\) rotate\(-90\) scale\(1\.35\)"/);
  assert.match(svg, /<title>Haus am Waldrand · waldhaus-editor-test<\/title>/);
});

test('placed Waldhaus floor plans show three rooms, two real entrances and their shared furniture layout', () => {
  const map = { ...structuredClone(base), objects: [house(), house({ id: 'waldhaus-second', rotation: .7 })] };
  const svg = renderWorldmapSvg(map);
  assert.equal((svg.match(/id="world-object-house-waldhaus"/g) ?? []).length, 1);
  assert.equal((svg.match(/href="#world-object-house-waldhaus"/g) ?? []).length, 2);
  assert.equal((svg.match(/data-waldhaus-room=/g) ?? []).length, 3);
  assert.equal((svg.match(/data-waldhaus-entrance=/g) ?? []).length, 2);
  assert.equal((svg.match(/data-waldhaus-wall=/g) ?? []).length, WALDHAUS_DEFINITION.architecturalWalls.length);
  assert.equal((svg.match(/data-waldhaus-fixture=/g) ?? []).length, WALDHAUS_FURNITURE.length);
  assert.match(svg, /<g id="world-object-house-waldhaus"><rect x="-6" y="-4\.5" width="12" height="9"/);
  assert.match(svg, /<circle r="7\.5" fill="transparent" pointer-events="all"\/><use href="#world-object-house-waldhaus"/);
  assert.doesNotMatch(renderWorldmapSvg(base), /world-object-house-waldhaus/, 'registering the house does not change an existing map until it is placed');
});
