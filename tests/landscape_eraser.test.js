import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseLandscapeAt } from '../src/map/landscape-brush.js';

const surface = (id, position, radius) => ({ id, position, radius });
function fixture() {
  return {
    island: { points: [[-100, -100], [100, -100], [100, 100], [-100, 100]] },
    regions: [{ id: 'base-meadow', biome: 'meadow', points: [[-100, -100], [100, -100], [100, 100]] }],
    objects: [{ id: 'kept-heart', kind: 'heart', position: [15, 0] }],
    landscape: {
      version: 1,
      terrain: [surface('ground-near', [0, 0], 12), surface('ground-far', [80, 80], 4)],
      biomes: [surface('biome-near', [0, 0], 12), surface('biome-far', [80, 80], 4)],
      windZones: [surface('wind-near', [0, 0], 30)],
      presets: [{ id: 'saved-preset', name: 'Meine Wiese' }],
    },
  };
}

test('surface eraser touches painted edges and returns both biome layers without changing the document', () => {
  const map = fixture(), before = structuredClone(map);
  // The cursor touches the visible edge, 15 metres from the hidden stamp centre.
  const result = eraseLandscapeAt(map, [15, 0], [15, 0], 3, 'surface');
  assert.deepEqual(result.terrainIds, ['ground-near']);
  assert.deepEqual(result.biomeIds, ['biome-near']);
  assert.deepEqual(result.windZoneIds, []);
  assert.equal(result.terrain[0], map.landscape.terrain[0]);
  assert.equal(result.biomes[0], map.landscape.biomes[0]);
  assert.deepEqual(map, before, 'history can retain the exact original document');
  assert.deepEqual(eraseLandscapeAt(map, [15.01, 0], [15.01, 0], 3, 'surface').biomeIds, [],
    'paint beyond the cursor footprint remains untouched');
});

test('fast eraser strokes cover the swept path and never extrapolate beyond its ends', () => {
  const map = fixture();
  map.landscape.terrain = [surface('between-events', [20, 6], 4), surface('before-stroke', [-10, 0], 2), surface('after-stroke', [50, 0], 2)];
  map.landscape.biomes = [surface('biome-between-events', [20, 6], 4)];
  const result = eraseLandscapeAt(map, [0, 0], [40, 0], 2, 'surface');
  assert.deepEqual(result.terrainIds, ['between-events']);
  assert.deepEqual(result.biomeIds, ['biome-between-events']);
  assert.equal(eraseLandscapeAt(map, [0, 0], [0, 0], 2, 'surface').terrainIds.length, 0);
  assert.equal(eraseLandscapeAt(map, [40, 0], [40, 0], 2, 'surface').terrainIds.length, 0);
});

test('surface and single-layer targets preserve unrelated data and wind zone selection', () => {
  const map = fixture();
  assert.deepEqual(eraseLandscapeAt(map, [15, 0], [15, 0], 3, 'terrain').biomeIds, []);
  for (const target of ['biome', 'biomes']) {
    const result = eraseLandscapeAt(map, [15, 0], [15, 0], 3, target);
    assert.deepEqual(result.biomeIds, ['biome-near']);
    assert.deepEqual(result.terrainIds, []);
  }
  assert.deepEqual(eraseLandscapeAt(map, [15, 0], [15, 0], 3, 'all').windZoneIds, []);
  assert.deepEqual(eraseLandscapeAt(map, [0, 0], [0, 0], 3, 'all').windZoneIds, ['wind-near']);
  assert.deepEqual(eraseLandscapeAt({}, [0, 0], [5, 0], 3, 'surface'),
    { terrain: [], biomes: [], windZones: [], terrainIds: [], biomeIds: [], windZoneIds: [] });
  assert.deepEqual(eraseLandscapeAt(map, [NaN, 0]).terrainIds, []);
  assert.throws(() => eraseLandscapeAt(map, [0, 0], [0, 0], 0, 'surface'), /Radius/);
});
