import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { getLandscape, ensureLandscape, vegetationSettings, terrainSettings,
  WIND_DEFAULTS, VEGETATION_TYPES, TERRAIN_TYPES, BIOME_PRESETS,
  LANDSCAPE_LIMITS, validateLandscape } from '../src/map/landscape.js';

const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
function paintedMap() {
  const map = structuredClone(base), landscape = ensureLandscape(map);
  landscape.terrain = TERRAIN_TYPES.map((type, i) => ({ id: `paint-${i}`, name: type.label,
    position: [30 + i, -42], radius: 5, ...terrainSettings(type.id), seed: i }));
  landscape.windZones = [{ id: 'wind-shelter', name: 'Windschatten', position: [32, -40],
    radius: 14, falloff: .6, strength: 0, direction: Math.PI }];
  landscape.biomes = BIOME_PRESETS.map((preset, i) => ({ id: `biome-${i}`, presetId: preset.id,
    position: [30 + i, -42], radius: 10, strength: .6, seed: i }));
  landscape.presets = BIOME_PRESETS.map((preset, i) => ({ id: `saved-${i}`, name: preset.label,
    terrain: structuredClone(preset.terrain), vegetation: structuredClone(preset.vegetation),
    scatter: structuredClone(preset.scatter), wind: { ...WIND_DEFAULTS }, brushRadius: 8 }));
  map.objects.find(item => item.kind === 'grass').vegetation = {
    ...VEGETATION_TYPES.find(type => type.id === 'swamp').settings,
    height: 2.3, density: .65, groundColor: true, groundBlend: .8, heightVariation: .5,
  };
  return map;
}

test('reading old maps preserves all placements, document bytes and legacy vegetation defaults', () => {
  const map = structuredClone(base);
  delete map.landscape;
  const before = JSON.stringify(map);
  const landscape = getLandscape(map);
  assert.equal(map.landscape, undefined);
  assert.deepEqual(landscape.wind, WIND_DEFAULTS);
  assert.deepEqual(landscape.terrain, []);
  for (const variant of ['short', 'tall']) {
    const settings = vegetationSettings({ kind: 'grass', variant });
    assert.equal(settings.type, variant);
    assert.equal(settings.height, 1);
    assert.equal(settings.density, 1);
  }
  assert.equal(vegetationSettings({ variant: 'short', vegetation: { height: 2 } }).height, 2);
  assert.equal(JSON.stringify(map), before);
  assert.equal(validateWorldmap(map).valid, true);
  landscape.terrain.push({ localOnly: true });
  assert.deepEqual(getLandscape(map).terrain, []);
  assert.equal(getLandscape({ landscape: { version: 1, wind: { enabled: false } } }).wind.enabled, false);
  assert.equal(getLandscape({ landscape: { version: 1, wind: { enabled: false } } }).wind.speed, 1);
});

test('all seven vegetation types, nine grounds and nine saved biomes round-trip with wind zones', () => {
  assert.equal(VEGETATION_TYPES.length, 7);
  assert.equal(TERRAIN_TYPES.length, 9);
  assert.equal(BIOME_PRESETS.length, 9);
  const map = paintedMap(), validation = validateWorldmap(map);
  assert.deepEqual(validation.errors, []);
  const reloaded = JSON.parse(JSON.stringify(map));
  assert.deepEqual(reloaded, map);
  assert.equal(validateWorldmap(reloaded).valid, true);
  assert.deepEqual(reloaded.objects.map(o => [o.id, o.position, o.rotation, o.scale]),
    base.objects.map(o => [o.id, o.position, o.rotation, o.scale]));
  assert.deepEqual(reloaded.paths, base.paths);
  assert.deepEqual(reloaded.zone, base.zone);
  assert.equal(reloaded.landscape.windZones[0].strength, 0);
  const saved = reloaded.landscape.presets[0];
  saved.vegetation.height = .25;
  assert.equal(BIOME_PRESETS[0].vegetation.height, 1, 'editing a saved preset cannot modify built-in defaults');
});

test('landscape imports reject nonfinite values, unsupported shaders, invalid types and oversized lists', () => {
  const bad = [
    map => { map.landscape.version = 2; },
    map => { map.landscape.wind = []; },
    map => { map.landscape.wind.enabled = 'yes'; },
    map => { map.landscape.wind.speed = Infinity; },
    map => { map.landscape.wind.shader = 'alert(1)'; },
    map => { map.landscape.windZones[0].radius = 251; },
    map => { map.landscape.windZones[0].direction = NaN; },
    map => { map.landscape.terrain[0].color = '#fff" onload="x'; },
    map => { map.landscape.terrain[0].hardness = 1.1; },
    map => { map.landscape.terrain[0].position = [NaN, 0]; },
    map => { map.landscape.terrain[0].type = 'lava<script>'; },
    map => { map.landscape.terrain[0].seed = -1; },
    map => { map.landscape.terrain = Array(LANDSCAPE_LIMITS.terrain + 1).fill(null); },
    map => { map.landscape.presets[0].scatter.minDistance = 0; },
    map => { map.landscape.presets[0].scatter.scaleMin = 2; map.landscape.presets[0].scatter.scaleMax = 1; },
    map => { map.landscape.presets[0].scatter.entries[0].variant = 'remote://model.glb'; },
    map => { map.landscape.presets[0].scatter.entries = []; },
    map => { map.landscape.presets[0].vegetation.heightVariation = .51; },
    map => { map.landscape.presets[0].vegetation.groundColor = 1; },
    map => { map.landscape.presets[0].vegetation.density = -1; },
    map => { map.landscape.presets[0].vegetation.height = 3.01; },
    map => { map.landscape.biomes[0].presetId = '../outside'; },
    map => { map.objects.find(o => o.kind === 'grass').vegetation.type = 'unsupported'; },
    map => { map.objects.find(o => o.kind === 'house').vegetation = { type: 'tall' }; },
    map => { map.landscape = JSON.parse('{"version":1,"__proto__":{"polluted":true}}'); },
  ];
  for (const [index, alter] of bad.entries()) {
    const map = paintedMap(); alter(map);
    assert.equal(validateWorldmap(map).valid, false, `malformed case ${index} must be rejected`);
  }
  assert.equal({}.polluted, undefined);
});

test('landscape feature IDs share the map namespace and imported paint cannot escape bounds', () => {
  for (const collection of ['terrain', 'windZones', 'biomes', 'presets']) {
    const map = paintedMap(); map.landscape[collection][0].id = map.objects[0].id;
    assert.ok(validateWorldmap(map).errors.some(error => /mehrfach/.test(error)), collection);
  }
  const map = paintedMap(); map.landscape.terrain[0].position = [map.bounds.maxX + 1, 0];
  assert.ok(validateWorldmap(map).errors.some(error => /Kartenrahmen/.test(error)));
  assert.ok(validateLandscape(map).some(error => /Kartenrahmen/.test(error)));
});

test('saved paint and wind zones require every rendered value, while settings may use defaults', () => {
  const required = {
    terrain: ['id', 'name', 'type', 'position', 'radius', 'color', 'hardness', 'strength', 'variation', 'seed'],
    windZones: ['id', 'name', 'position', 'radius', 'falloff', 'strength', 'direction'],
  };
  for (const [collection, fields] of Object.entries(required)) for (const field of fields) {
    const map = paintedMap(); delete map.landscape[collection][0][field];
    assert.equal(validateWorldmap(map).valid, false, `${collection}.${field} is required`);
    assert.throws(() => renderWorldmapSvg(map), /Ungültige Weltkarte/, `${collection}.${field} cannot reach SVG rendering`);
  }
  const map = paintedMap();
  map.landscape.wind = { enabled: false };
  map.objects.find(item => item.kind === 'grass').vegetation = { height: 1.25 };
  map.landscape.presets[0] = { id: 'partial-preset', name: 'Partielle Vorlage',
    vegetation: { density: .4 }, terrain: { type: 'sand' }, wind: { enabled: false }, scatter: { density: .2 } };
  assert.equal(validateWorldmap(map).valid, true, 'partial editable settings are resolved through their existing defaults');
  const svg = renderWorldmapSvg(map);
  assert.ok(!/NaN|undefined/.test(svg), 'accepted terrain and wind fields yield finite SVG attributes');
});

test('null features fail cleanly and landscape IDs cannot shadow later fog-phase IDs', () => {
  for (const collection of ['terrain', 'windZones', 'biomes', 'presets']) {
    const map = paintedMap(); map.landscape[collection][0] = null;
    assert.equal(validateWorldmap(map).valid, false, `${collection} null entry must not throw`);
  }
  const vegetation = paintedMap(); vegetation.objects.find(item => item.kind === 'grass').vegetation = null;
  assert.equal(validateWorldmap(vegetation).valid, false);
  for (const collection of ['terrain', 'windZones', 'biomes', 'presets']) {
    const map = paintedMap(); map.landscape[collection][0].id = map.zone.phases[0].id;
    assert.ok(validateWorldmap(map).errors.some(error => /mehrfach/.test(error)), `${collection} shares fog-phase namespace`);
  }
});
