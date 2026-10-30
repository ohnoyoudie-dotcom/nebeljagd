import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUTHORING_OBJECT_CATALOG, OBJECT_CATALOG, isObjectAvailable } from '../src/map/objects.js';
import { createScatterStroke, createVegetationStroke, createBiomeStroke } from '../src/map/landscape-brush.js';
import { BIOME_PRESETS } from '../src/map/landscape.js';

const retired = ['tree', 'rock', 'mound', 'flower'];
const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
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

test('fresh authoring retires the four scenery kinds including Tripo rocks while keeping loot and admitted props', () => {
  assert.ok(AUTHORING_OBJECT_CATALOG.every(item => !retired.includes(item.kind)));
  for (const definition of OBJECT_CATALOG.filter(item => retired.includes(item.kind))) {
    assert.equal(isObjectAvailable(definition.kind), false);
    for (const variant of definition.variants) assert.equal(isObjectAvailable(definition.kind, variant.id), false);
  }
  for (const kind of ['heart', 'chest', 'bow', 'sword', 'fireStaff', 'iceStaff', 'grass', 'bush', 'wagon', 'barrel', 'well']) {
    assert.ok(AUTHORING_OBJECT_CATALOG.some(item => item.kind === kind), kind);
    assert.equal(isObjectAvailable(kind), true, kind);
  }
  assert.equal(isObjectAvailable('house', 'kit-tripo-tavern'), true);
  assert.equal(isObjectAvailable('house', 'kit-taverne'), false);
});

test('mixed saved presets filter retired scenery without mutating their document or losing allowed scatter', () => {
  const map = fixture();
  const scatter = { density: 1, minDistance: 2, entries: [
    { kind: 'tree', variant: 'oak', weight: 10 },
    { kind: 'rock', variant: 'kit-tripo-03', weight: 10 },
    { kind: 'mound', variant: 'ridge', weight: 10 },
    { kind: 'flower', variant: 'rei-white', weight: 10 },
    { kind: 'bush', variant: 'rei-bush', weight: 1 },
    { kind: 'grass', variant: 'short', weight: 1 },
  ] };
  const before = structuredClone(scatter);
  const stroke = createScatterStroke(map, { radius: 18, seed: 5, scatter });
  stroke.sample([-60, -60]);
  assert.ok(stroke.objects.length > 2);
  assert.ok(stroke.objects.every(item => ['bush', 'grass'].includes(item.kind)));
  assert.deepEqual(scatter, before);
  assert.deepEqual(map.objects, []);
  for (const entry of before.entries.slice(0, 4)) {
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
