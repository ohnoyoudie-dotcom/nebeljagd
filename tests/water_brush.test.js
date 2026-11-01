import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canPaintGrass, createGrassBrushStroke } from '../src/map/grass-brush.js';
import { getObjectFootprintRadius } from '../src/map/objects.js';
import { createLandscapePlacementGuard, createVegetationStroke, createScatterStroke, createTerrainStroke, createBiomeStroke } from '../src/map/landscape-brush.js';

function fixture() {
  const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
  map.island.points = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  map.regions = [{ id: 'brush-region', name: 'Wiese', biome: 'meadow', color: '#5a8844', points: map.island.points, label: [-60, 0] }];
  map.waterAreas = [{ id: 'brush-water', name: 'Gewässer', points: [[-20, -20], [20, -20], [20, 20], [-20, 20]] }];
  map.objects = []; map.paths = []; map.rivers = []; map.places = []; map.barriers = [];
  delete map.islets;
  map.spawnAreas = []; map.gameplay.spawnPosition = [-80, -80];
  delete map.landscape;
  return map;
}

test('grass footprint accepts old ring callers and protects every shore with a full map', () => {
  const map = fixture();
  assert.equal(canPaintGrass([0, 0], map.island.points, 2), true, 'legacy outer-ring API remains supported');
  assert.equal(canPaintGrass([0, 0], map, 2), false);
  assert.equal(canPaintGrass([20, 0], map, 2), false, 'inner shoreline is water');
  assert.equal(canPaintGrass([21, 0], map, 2), false, 'centre is dry but the footprint crosses the shore');
  assert.equal(canPaintGrass([23, 0], map, 2), true);
  assert.equal(canPaintGrass([99, 0], map, 2), false, 'outer shoreline is still protected');
  const stroke = createGrassBrushStroke(map, { radius: 2 });
  stroke.sample([-45, 0]); stroke.sample([45, 0]);
  assert.ok(stroke.objects.length > 4);
  for (const item of stroke.objects) assert.equal(canPaintGrass(item.position, map, item.radius), true);
  assert.deepEqual(map.objects, []);
});

test('river connections to a lagoon stay clear of scenery, including banks and bridge crossings', () => {
  const map = fixture();
  map.rivers = [{ id: 'channel', name: 'Kanal', width: 12, points: [[0, -10], [0, -110]] }];
  map.paths = [{ id: 'bridge', name: 'Brücke', kind: 'bridge', width: 6, points: [[-15, -50], [15, -50]] }];
  assert.equal(canPaintGrass([0, -50], map.island.points, 2), true, 'legacy outer-ring calls retain their original meaning');
  assert.equal(canPaintGrass([0, -50], map, 2), false, 'bridge decks must stay free of grass and object footprints');
  assert.equal(canPaintGrass([7, -50], map, 2), false, 'a dry centre does not permit overhanging the channel bank');
  assert.equal(canPaintGrass([9, -50], map, 2), false, 'dry bridge approaches remain clear too');
  assert.equal(canPaintGrass([9, -56], map, 2), true);
  assert.equal(canPaintGrass([0, -80], map, 2), false, 'open channel water blocks placements away from the bridge too');
  const stroke = createGrassBrushStroke(map, { radius: 2 });
  stroke.sample([-35, -50]); stroke.sample([35, -50]);
  assert.ok(stroke.objects.length > 4);
  for (const item of stroke.objects) assert.equal(canPaintGrass(item.position, map, item.radius), true);
  assert.deepEqual(map.objects, [], 'the placement guard does not change authored objects');
});

test('vegetation and Tripo scatter cannot put any footprint into an inner water area', () => {
  const map = fixture(), guard = createLandscapePlacementGuard(map);
  assert.equal(guard.reason([0, 0], 1, 'rock'), 'coast');
  assert.equal(guard.reason([21, 0], 2, 'rock'), 'coast');
  assert.equal(guard.terrainReason([0, 0]), 'coast');
  for (const stroke of [
    createVegetationStroke(map, { radius: 8, seed: 9 }),
    createScatterStroke(map, { radius: 12, seed: 5, scatter: { density: 1, entries: [{ kind: 'rock', variant: 'kit-tripo-01', weight: 1 }] } }),
  ]) {
    stroke.sample([-50, 0]); stroke.sample([50, 0]);
    assert.ok(stroke.objects.length > 0);
    for (const item of stroke.objects) assert.equal(guard.reason(item.position,
      (item.kind === 'grass' ? item.radius : getObjectFootprintRadius(item.kind, item.variant)) * item.scale, item.kind), null);
  }
});

test('ground and biome brushes skip stamps centred in inner water without modifying the water polygon', () => {
  const map = fixture(), before = structuredClone(map.waterAreas);
  for (const stroke of [createTerrainStroke(map, { radius: 2 }), createBiomeStroke(map, { radius: 2 })]) {
    stroke.sample([0, 0]);
    assert.equal(stroke.terrain.length, 0);
    assert.equal(stroke.biomes.length, 0);
    stroke.sample([50, 0]);
    assert.ok(stroke.terrain.length > 0);
    for (const stamp of stroke.terrain) assert.equal(createLandscapePlacementGuard(map).terrainReason(stamp.position), null);
  }
  assert.deepEqual(map.waterAreas, before);
});
