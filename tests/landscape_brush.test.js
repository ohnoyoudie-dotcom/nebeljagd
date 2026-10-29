import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVegetationStroke, createTerrainStroke, createScatterStroke, createBiomeStroke,
  createLandscapePlacementGuard, eraseLandscapeAt, LANDSCAPE_STROKE_LIMITS } from '../src/map/landscape-brush.js';
import { BIOME_PRESETS, vegetationSettings, getLandscape } from '../src/map/landscape.js';
import { validateWorldmap } from '../src/map/model.js';
import { ENVIRONMENT_KIT_DEFINITIONS, getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';

const original = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
function fixture(objects = []) {
  const map = structuredClone(original);
  map.island.points = [[-220, -220], [220, -220], [220, 220], [-220, 220]];
  map.regions = [{ id: 'fixture-region', name: 'Wiese', biome: 'meadow', color: '#5a8844', points: map.island.points, label: [-100, -100] }];
  map.paths = [{ id: 'fixture-path', name: 'Freier Weg', kind: 'main', width: 5, points: [[0, -220], [0, 220]] }];
  map.rivers = [{ id: 'fixture-river', name: 'Wasser', width: 9, points: [[-220, 50], [220, 50]] }];
  map.places = [];
  map.gameplay.spawnPosition = [125, 125];
  map.spawnAreas = [{ id: 'fixture-spawn', name: 'Start', position: [125, 125], radius: 8, capacity: 50 }];
  map.objects = objects;
  delete map.landscape;
  return map;
}
const drawing = stroke => JSON.parse(JSON.stringify({
  objects: stroke.objects.map(({ id, ...object }) => object),
  terrain: stroke.terrain.map(({ id, ...record }) => record),
  biomes: stroke.biomes.map(({ id, ...record }) => record),
}));

test('vegetation strokes interpolate fast pointer jumps reproducibly, persist all paint settings, and leave caller intact', () => {
  const map = fixture(), before = JSON.stringify(map);
  const options = { radius: 3, seed: 4711, strength: .8,
    vegetation: { type: 'swamp', height: 2.5, density: .6, heightVariation: .5,
      color: '#507d41', groundColor: true, groundBlend: .7, brightness: 1.2, saturation: .8, colorVariation: .3, edgeSoftness: .75 } };
  const fast = createVegetationStroke(map, options), slow = createVegetationStroke(map, options);
  fast.sample([-90, -110]); fast.sample([-20, -110]);
  for (let x = -90; x <= -20; x++) slow.sample([x, -110]);
  assert.deepEqual(drawing(fast), drawing(slow));
  assert.ok(fast.objects.length > 15);
  assert.equal(JSON.stringify(map), before);
  for (const object of fast.objects) {
    assert.equal(object.kind, 'grass'); assert.equal(object.variant, 'short');
    assert.equal(object.vegetation.height, 2.5); assert.equal(object.vegetation.density, .48);
    assert.equal(object.vegetation.heightVariation, .5); assert.equal(object.vegetation.groundColor, true);
    assert.equal(object.radius, 3); assert.equal(object.scale, 1);
  }
  const roundTrip = JSON.parse(JSON.stringify({ ...map, objects: fast.objects }));
  assert.equal(validateWorldmap(roundTrip).valid, true, validateWorldmap(roundTrip).errors.join('\n'));
  const retrace = createVegetationStroke(roundTrip, options);
  retrace.sample([-90, -110]); retrace.sample([-20, -110]);
  assert.equal(retrace.objects.length, 0, 'repainting the same cover does not multiply its instances');
});

test('zero density/strength paints nothing; the flowers preset keeps editable grass and actual imported blossoms', () => {
  const empty = createVegetationStroke(fixture(), { vegetation: { type: 'tall', density: 0 } });
  empty.sample([-60, -110]); assert.equal(empty.objects.length, 0);
  const noForce = createTerrainStroke(fixture(), { strength: 0 });
  noForce.sample([-60, -110]); assert.equal(noForce.terrain.length, 0);
  const flowers = createVegetationStroke(fixture(), { radius: 2, seed: 2, vegetation: { type: 'flowers' } });
  flowers.sample([-90, -110]); flowers.sample([-20, -110]);
  assert.ok(flowers.objects.some(o => o.kind === 'grass' && o.vegetation.type === 'flowers'));
  assert.ok(flowers.objects.some(o => o.kind === 'flower' && o.variant.startsWith('rei-')));
});

test('paint respects coastline, water, roads and rotated obstacle footprints without blocking open space unnecessarily', () => {
  const map = fixture([
    { id: 'house-fixture', name: 'Haus', kind: 'house', variant: 'inn', position: [40, 0], rotation: Math.PI / 4, scale: 1 },
    { id: 'mound-fixture', name: 'Kante', kind: 'mound', variant: 'ridge', position: [-45, 0], rotation: -.4, scale: 1 },
    { id: 'rock-fixture', name: 'Fels', kind: 'rock', variant: 'granite', position: [70, -15], rotation: 0, scale: 1 },
  ]);
  const guard = createLandscapePlacementGuard(map);
  assert.equal(guard.reason([219, 0], 2), 'coast');
  assert.equal(guard.reason([-20, 55], 2), 'water', 'whole footprint, not only centre, avoids river');
  assert.equal(guard.reason([4, -20], 2), 'path', 'whole footprint avoids road');
  assert.equal(guard.reason([40, 0], 1), 'structure');
  assert.equal(guard.reason([-45, 0], 1), 'structure');
  assert.equal(guard.reason([70, -15], .5), 'object');
  assert.equal(guard.reason([125, 125], .6, 'tree', 4), 'spawn');
  assert.equal(guard.reason([125, 125], 1, 'grass'), null, 'soft cover does not change existing spawn mechanics');
  assert.equal(guard.reason([40, -15], 1), null, 'open ground outside rotated house remains paintable');
  const brush = createVegetationStroke(map, { radius: 2 });
  brush.sample([-80, 0]); brush.sample([95, 0]);
  assert.ok(brush.objects.length > 5);
  for (const item of brush.objects) assert.equal(guard.reason(item.position, item.radius, 'grass'), null);
});

test('natural scatter uses saved GLB variants, variable rotation/scale, minimum distances and immutable placements', () => {
  const map = fixture(), before = JSON.stringify(map);
  const options = { radius: 35, seed: 718, scatter: { density: 1, minDistance: 4, scaleMin: .8, scaleMax: 1.3,
    clustering: .9, randomRotation: true, entries: [{ kind: 'tree', variant: 'rei-tree01', weight: .7 }, { kind: 'rock', variant: 'granite', weight: .3 }] } };
  const stroke = createScatterStroke(map, options);
  stroke.sample([-90, -100]);
  assert.ok(stroke.objects.length > 15);
  assert.equal(JSON.stringify(map), before);
  assert.ok(stroke.objects.some(o => o.variant === 'rei-tree01'));
  assert.ok(new Set(stroke.objects.map(o => o.rotation)).size > 10);
  assert.ok(new Set(stroke.objects.map(o => o.scale)).size > 10);
  for (let i = 0; i < stroke.objects.length; i++) for (let j = i + 1; j < stroke.objects.length; j++) {
    const a = stroke.objects[i], b = stroke.objects[j];
    assert.ok(Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) >= 4 - .001);
  }
  const repeat = createScatterStroke(map, options); repeat.sample([-90, -100]);
  assert.deepEqual(drawing(stroke), drawing(repeat), 'same seed gives reproducible geometry, independent IDs');
  assert.equal(validateWorldmap({ ...map, objects: stroke.objects }).valid, true);
});

test('all biome presets store soft surface paint without multiplying automatic grass objects', () => {
  for (const preset of BIOME_PRESETS) {
    const map = fixture(), stroke = createBiomeStroke(map, { radius: 25, softness: .7, seed: 101, presetId: preset.id });
    stroke.sample([-90, -100]);
    assert.equal(stroke.terrain.length, 1, preset.id); assert.equal(stroke.biomes.length, 1, preset.id);
    assert.equal(stroke.objects.length, 0, 'biome painting uses automatic runtime cover instead of permanent grass objects');
    assert.equal(stroke.biomes[0].presetId, preset.id);
    assert.equal(stroke.biomes[0].softness, .7);
    assert.ok(Math.abs(stroke.terrain[0].hardness - .3) < 1e-9);
    assert.equal(stroke.terrain[0].type, preset.terrain.type);
    map.objects.push(...stroke.objects);
    map.landscape = { ...getLandscape(map), terrain: stroke.terrain, biomes: stroke.biomes };
    assert.equal(validateWorldmap(map).valid, true, `${preset.id}: ${validateWorldmap(map).errors.join('\n')}`);
    const before = JSON.stringify(map);
    const erased = eraseLandscapeAt(map, [-120, -100], [-60, -100], 2, 'terrain');
    assert.equal(erased.terrainIds.length, 1); assert.equal(erased.biomeIds.length, 0);
    assert.equal(JSON.stringify(map), before);
    const surface = eraseLandscapeAt(map, [-120, -100], [-60, -100], 2, 'surface');
    assert.equal(surface.terrainIds.length, 1); assert.equal(surface.biomeIds.length, 1);
    const all = eraseLandscapeAt(map, [-120, -100], [-60, -100], 2, 'all');
    assert.equal(all.biomeIds.length, 1);
  }
});

test('bounded gestures reject invalid input, enforce shared map budgets and cannot overwrite a terrain id through settings', () => {
  assert.throws(() => createVegetationStroke(fixture(), { radius: Infinity }));
  assert.throws(() => createVegetationStroke(fixture(), { vegetation: { height: 4 } }));
  assert.throws(() => createTerrainStroke(fixture(), { terrain: { type: 'javascript' } }));
  assert.throws(() => createScatterStroke(fixture(), { scatter: { scaleMin: 2, scaleMax: 1 } }));
  const terrain = createTerrainStroke(fixture(), { terrain: { type: 'sand', id: 'old-id', position: [1, 2], radius: 99 } });
  terrain.sample([-50, -100]);
  assert.notEqual(terrain.terrain[0].id, 'old-id'); assert.deepEqual(terrain.terrain[0].position, [-50, -100]);
  const map = fixture(Array.from({ length: 11999 }, (_, i) => ({ id: `existing-${i}` })));
  const brush = createVegetationStroke(map, { radius: 1 });
  brush.sample([-90, -100]); brush.sample([-20, -100]);
  assert.equal(brush.objects.length, 1); assert.equal(brush.full, true);
  const bounded = createScatterStroke(fixture(), { radius: 80, seed: 10, scatter: { density: 1, minDistance: .5 } });
  for (let x = -130; x < 150; x += 40) bounded.sample([x, -130]);
  assert.ok(bounded.objects.length <= LANDSCAPE_STROKE_LIMITS.objects);
  assert.deepEqual(bounded.sample([NaN, 0]), { objects: [], terrain: [], biomes: [] });
});

test('existing kit walls, fences, crates and compact houses guard their actual rotated/scaled footprints and keep arch centres open', () => {
  const placements = [
    { id: 'kit-wall', name: 'Mauer', kind: 'wall', variant: 'kit-stone', position: [-150, -120], rotation: Math.PI / 2, scale: 1.5 },
    { id: 'kit-fence', name: 'Zaun', kind: 'fence', variant: 'kit-wood', position: [-120, -120], rotation: .3, scale: .8 },
    { id: 'kit-crate', name: 'Kiste', kind: 'crate', variant: 'kit-wood', position: [-90, -120], rotation: Math.PI / 4, scale: 2 },
    { id: 'kit-house', name: 'Haus', kind: 'house', variant: 'kit-timber', position: [-150, -80], rotation: .4, scale: 1 },
    { id: 'kit-arch', name: 'Bogen', kind: 'ruin', variant: 'kit-arch', position: [-90, -80], rotation: -.6, scale: 1 },
  ];
  const map = fixture(placements), guard = createLandscapePlacementGuard(map);
  const toWorld = (item, x, z) => [item.position[0] + item.scale * (Math.cos(item.rotation) * x + Math.sin(item.rotation) * z),
    item.position[1] + item.scale * (-Math.sin(item.rotation) * x + Math.cos(item.rotation) * z)];
  for (const item of placements.slice(0, 3)) {
    const bounds = getEnvironmentKitDefinition(item.kind, item.variant), body = bounds.walls[0];
    assert.equal(guard.reason(toWorld(item, (body.minX + body.maxX) / 2, (body.minZ + body.maxZ) / 2), .5, 'grass'), 'structure', item.id);
    assert.equal(guard.reason(toWorld(item, 0, 3), .5, 'grass'), null, `${item.id} must not block remote open ground`);
  }
  const house = placements[3];
  assert.equal(guard.reason(house.position, .5, 'grass'), 'structure', 'preserve house floor');
  assert.equal(guard.reason(toWorld(house, 5, 0), .5, 'grass'), null, 'kit house must not inherit the large procedural cottage footprint');
  const arch = placements[4], definition = getEnvironmentKitDefinition(arch.kind, arch.variant);
  const { scale, offset } = definition.normalization;
  assert.equal(guard.reason(toWorld(arch, -offset[0] * scale, -offset[2] * scale), .15, 'grass'), null, 'arch gap stays a gap');
  const pillar = definition.walls[0];
  assert.equal(guard.reason(toWorld(arch, (pillar.minX + pillar.maxX) / 2, (pillar.minZ + pillar.maxZ) / 2), .15, 'grass'), 'structure');
  const scatter = createScatterStroke(map, { radius: 35, seed: 17, scatter: { density: .8, entries: [{ kind: 'tree', variant: 'kit-oak-autumn', weight: 1 }] } });
  scatter.sample([-120, -110]);
  assert.ok(scatter.objects.length > 5);
  for (const item of scatter.objects) {
    assert.equal(item.variant, 'kit-oak-autumn');
    assert.equal(guard.reason(item.position, getEnvironmentKitDefinition(item.kind, item.variant).circles[0].radius * item.scale, 'tree', 4), null);
  }
  const glbGrass = createScatterStroke(fixture(), { radius: 12, seed: 11, scatter: { density: .5, entries: [{ kind: 'grass', variant: 'kit-tall', weight: 1 }] } });
  glbGrass.sample([-90, -100]);
  assert.ok(glbGrass.objects.length > 0);
  assert.ok(glbGrass.objects.every(item => item.variant === 'kit-tall'), 'explicit imported grass variant is retained');
});

test('shared kit normalization preserves the existing model sizes and recentered collider geometry without browser imports', () => {
  assert.equal(ENVIRONMENT_KIT_DEFINITIONS.length, 13);
  for (const definition of ENVIRONMENT_KIT_DEFINITIONS) {
    const { nativeBounds, normalization, targetHeight } = definition;
    assert.ok(Math.abs((nativeBounds.max[1] - nativeBounds.min[1]) * normalization.scale - targetHeight) < 1e-8);
    assert.equal(getEnvironmentKitDefinition(definition.kind, definition.variant), definition);
    assert.ok(Object.isFrozen(definition));
  }
  const house = getEnvironmentKitDefinition('house', 'kit-timber');
  assert.equal(house.targetHeight, 5.5);
  assert.ok(house.entranceHalfWidth * 2 > 1.8);
  assert.ok(house.footprint.halfWidth > 2.7 && house.footprint.halfWidth < 2.8);
  const tree = getEnvironmentKitDefinition('tree', 'kit-oak-green');
  assert.notEqual(tree.circles[0].x, 0, 'off-centre authored trunk follows the visible model');
});
