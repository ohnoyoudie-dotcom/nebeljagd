import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORING_OBJECT_CATALOG, OBJECT_CATALOG, PLACEMENT_OBJECT_CATALOG,
  getObjectDefinition, isObjectAvailable, isObjectPlaceable, makeWorldObject } from '../src/map/objects.js';
import { createScatterStroke, createVegetationStroke, createBiomeStroke } from '../src/map/landscape-brush.js';
import { BIOME_PRESETS } from '../src/map/landscape.js';

const retired = ['mound', 'flower', 'ruin', 'shrine', 'crate'];
const base = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
function fixture() {
  const map = structuredClone(base);
  map.island.points = [[-200, -200], [200, -200], [200, 200], [-200, 200]];
  map.regions = [{ id: 'fixture-region', name: 'Wiese', biome: 'meadow', color: '#5a8844', points: map.island.points, label: [0, 0] }];
  map.objects = []; map.paths = []; map.rivers = []; map.places = [];
  map.gameplay.spawnPosition = [125, 125];
  map.spawnAreas = [{ id: 'fixture-spawn', name: 'Start', position: [125, 125], radius: 8, capacity: 50 }];
  delete map.landscape;
  return map;
}

test('fresh authoring retires old scenery, shrine, ruins and GLB crates while keeping loot and admitted props', () => {
  assert.ok(AUTHORING_OBJECT_CATALOG.every(item => !retired.includes(item.kind)));
  for (const definition of OBJECT_CATALOG.filter(item => retired.includes(item.kind))) {
    assert.equal(isObjectAvailable(definition.kind), false);
    for (const variant of definition.variants) assert.equal(isObjectAvailable(definition.kind, variant.id), false);
  }
  for (const kind of ['heart', 'chest', 'bow', 'sword', 'fireStaff', 'iceStaff', 'poisonStaff', 'moonStaff', 'grass', 'bush', 'rock', 'wagon', 'barrel', 'well']) {
    assert.ok(AUTHORING_OBJECT_CATALOG.some(item => item.kind === kind), kind);
    assert.equal(isObjectAvailable(kind), true, kind);
  }
  assert.equal(isObjectAvailable('house', 'kit-tripo-tavern'), true);
  assert.equal(isObjectAvailable('house', 'kit-taverne'), false);
  assert.equal(isObjectAvailable('house', 'kit-tripo-castle'), false);
  assert.equal(isObjectAvailable('fence', 'kit-wood'), false);
  assert.equal(isObjectAvailable('fence', 'kit-cross-wood'), true);
  for (const variant of ['granite', 'basalt', 'kit-cluster', 'kit-single']) assert.equal(isObjectAvailable('rock', variant), false);
  for (const variant of ['kit-tripo-01', 'kit-tripo-02', 'kit-tripo-03']) assert.equal(isObjectAvailable('rock', variant), true);
});

test('individual placement only offers approved Tripo assets; old trees remain legacy objects', () => {
  const expected = ['house:kit-tripo-tavern', 'house:kit-tripo-house-02',
    'rock:kit-tripo-01', 'rock:kit-tripo-02', 'rock:kit-tripo-03',
    'wagon:kit-tripo-wagon', 'barrel:kit-tripo-barrel', 'well:kit-tripo-well', 'chest:kit-tripo-chest',
    'bow:kit-tripo-ornate-bow', 'sword:kit-tripo-sword', 'fireStaff:kit-tripo-lava-staff', 'iceStaff:kit-tripo-crystal-staff',
    'poisonStaff:kit-tripo-poison-staff', 'moonStaff:kit-tripo-moon-staff', 'starStaff:kit-tripo-star-staff',
    'gravityStaff:kit-tripo-gravity-staff'];
  assert.deepEqual(PLACEMENT_OBJECT_CATALOG.map(definition => definition.kind), ['house', 'rock', 'wagon', 'barrel', 'well', 'chest', 'bow', 'sword', 'fireStaff', 'iceStaff', 'poisonStaff', 'moonStaff', 'starStaff', 'gravityStaff']);
  assert.deepEqual(PLACEMENT_OBJECT_CATALOG.flatMap(definition => definition.variants.map(variant => variant.assetId)), expected);
  for (const definition of PLACEMENT_OBJECT_CATALOG) {
    assert.equal(isObjectPlaceable(definition.kind), true);
    assert.equal(isObjectPlaceable(definition.kind, definition.defaultVariant), true);
  }
  for (const definition of OBJECT_CATALOG) for (const variant of definition.variants) {
    assert.equal(isObjectPlaceable(definition.kind, variant.id), expected.includes(variant.assetId), variant.assetId);
  }
  assert.equal(isObjectPlaceable('missing'), false);
  assert.equal(isObjectPlaceable('house', 'missing'), false);
  assert.equal(PLACEMENT_OBJECT_CATALOG.find(definition => definition.kind === 'chest').defaultVariant, 'kit-tripo-chest');
  assert.equal(PLACEMENT_OBJECT_CATALOG.find(definition => definition.kind === 'rock').defaultVariant, 'kit-tripo-01');
  assert.equal(getObjectDefinition('chest').defaultVariant, 'wood', 'legacy and loot defaults are independent of the palette');
  assert.equal(getObjectDefinition('rock').defaultVariant, 'granite');
  assert.equal(makeWorldObject('chest', [0, 0]).variant, 'wood');
  assert.equal(isObjectAvailable('sword', 'steel'), false, 'old sword is retired from new placements; saved entries still resolve to the Tripo sword');
  assert.equal(PLACEMENT_OBJECT_CATALOG.find(definition => definition.kind === 'bow').defaultVariant, 'kit-tripo-ornate-bow');
  assert.equal(getObjectDefinition('bow').defaultVariant, 'wood', 'existing maps and chest bow drops retain their old default');
  assert.equal(makeWorldObject('bow', [0, 0]).variant, 'wood');
  assert.equal(isObjectAvailable('bow', 'wood'), true);
  assert.equal(isObjectPlaceable('bow', 'wood'), false, 'the old bow stays compatible without replacing the newly admitted model');
});

test('mixed saved presets filter retired scenery without mutating their document or losing allowed scatter', () => {
  const map = fixture();
  const scatter = { density: 1, minDistance: 2, entries: [
    { kind: 'tree', variant: 'oak', weight: 10 },
    { kind: 'rock', variant: 'kit-tripo-03', weight: 10 },
    { kind: 'rock', variant: 'granite', weight: 10 },
    { kind: 'mound', variant: 'ridge', weight: 10 },
    { kind: 'flower', variant: 'rei-white', weight: 10 },
    { kind: 'bush', variant: 'rei-bush', weight: 1 },
    { kind: 'grass', variant: 'short', weight: 1 },
  ] };
  const before = structuredClone(scatter);
  const stroke = createScatterStroke(map, { radius: 18, seed: 5, scatter });
  stroke.sample([-60, -60]);
  assert.ok(stroke.objects.length > 2);
  assert.ok(stroke.objects.every(item => item.kind === 'rock' && item.variant === 'kit-tripo-03'));
  assert.deepEqual(scatter, before);
  assert.deepEqual(map.objects, []);
  for (const entry of before.entries.filter(entry => entry.variant !== 'kit-tripo-03')) {
    assert.throws(() => createScatterStroke(map, { scatter: { entries: [entry] } }), /aktuell verfügbare/);
  }
});

test('legacy flower brush and biome presets cannot recreate removed objects', () => {
  const settings = { type: 'flowers', height: 1.7, density: .6, color: '#779966' };
  const stroke = createVegetationStroke(fixture(), { radius: 2, seed: 5, vegetation: settings });
  stroke.sample([-80, -60]); stroke.sample([-20, -60]);
  assert.ok(stroke.objects.length > 5);
  for (const object of stroke.objects) {
    assert.equal(object.kind, 'grass'); assert.equal(object.vegetation.type, 'meadow');
    assert.equal(object.vegetation.height, 1.7); assert.equal(object.vegetation.color, '#779966');
  }
  assert.equal(settings.type, 'flowers', 'saved source settings remain intact');
  for (const preset of BIOME_PRESETS) {
    const paint = createBiomeStroke(fixture(), { radius: 8, preset, seed: 2 });
    paint.sample([-60, -60]);
    assert.equal(paint.objects.length, 0, preset.id);
    assert.equal(paint.biomes.length, 1, preset.id);
  }
});
