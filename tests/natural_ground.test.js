import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyMap } from '../src/lobby-map.js';
import { validateWorldmap } from '../src/map/model.js';
import { PATH_BRUSH_PRESETS, pathBrushSettings, ensureLandscape } from '../src/map/landscape.js';
import { createTerrainStroke } from '../src/map/landscape-brush.js';
import { createTerrainPaintIndex, sampleTerrainPaint, terrainSurfaceTint } from '../src/map/terrain-paint.js';
import { groundGrassSettings } from '../src/meadow-ground.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

test('all way presets form continuous soft paths and survive the existing map contract without vegetation', () => {
  for (const preset of PATH_BRUSH_PRESETS) {
    const map = createLobbyMap(), original = structuredClone(map.objects);
    const stroke = createTerrainStroke(map, { radius: 2.5, terrain: pathBrushSettings(preset.id), seed: 14 });
    stroke.sample([-8, -5]); stroke.sample([8, -5]);
    ensureLandscape(map).terrain.push(...stroke.terrain);
    assert.deepEqual(map.objects, original);
    const restored = JSON.parse(JSON.stringify(map));
    assert.ok(validateWorldmap(restored).valid, preset.id);
    const index = createTerrainPaintIndex(restored);
    for (let x = -8; x <= 8; x += .2) assert.ok(sampleTerrainPaint(index, x, -5).alpha > .95, `${preset.id}: gap at ${x}`);
    assert.ok(sampleTerrainPaint(index, 0, -2.9).alpha < .8, 'soft shoulder');
    assert.equal(sampleTerrainPaint(index, 0, -1).alpha, 0);
  }
});

test('natural soils have deterministic colour variation without geometry or automatic grass', () => {
  assert.equal(groundGrassSettings(createLobbyMap()).enabled, false);
  for (const type of ['meadow','forest','marsh','heath','snow','dunes','volcanic']) {
    const first = terrainSurfaceTint(type, 0, 0), second = terrainSurfaceTint(type, 9, 13);
    assert.deepEqual(first, terrainSurfaceTint(type, 0, 0));
    assert.notDeepEqual(first, second);
    assert.ok(Object.values(first).every(value => value > .65 && value < 1.4));
  }
  assert.notDeepEqual(terrainSurfaceTint('snow', 0, 0), terrainSurfaceTint('forest', 0, 0));
});

test('regional colours cross a smooth seam without affecting the saved map', () => {
  const map = createLobbyMap();
  map.regions = [
    {...map.regions[0], id:'left', biome:'forest', color:'#45643b', points:[[-100,-100],[0,-100],[0,100],[-100,100]]},
    {...map.regions[0], id:'right', biome:'snow', color:'#e5edf1', points:[[0,-100],[100,-100],[100,100],[0,100]]},
  ];
  const saved = JSON.stringify(map), spatial = createWorldSpatialModel(map);
  const a = spatial.baseColorAt(-.01, 0), b = spatial.baseColorAt(.01, 0);
  assert.ok(Math.abs(a.r-b.r) < .002 && Math.abs(a.g-b.g) < .002);
  assert.ok(spatial.baseColorAt(-18,0).r > spatial.baseColorAt(-50,0).r, 'transition starts before the boundary');
  assert.equal(JSON.stringify(map), saved);
});
