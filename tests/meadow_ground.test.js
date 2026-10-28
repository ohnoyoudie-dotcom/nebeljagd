import test from 'node:test';
import assert from 'node:assert/strict';
import { groundGrassSettings, regionHasGroundGrass, createGroundGrassExclusion } from '../src/meadow-ground.js';

test('dense meadow is enabled by default for green biomes and keeps non-green biomes clear', () => {
  const settings = groundGrassSettings({});
  assert.equal(settings.enabled, true);
  assert.equal(regionHasGroundGrass({ biome: 'meadow' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'forest' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'snow' }, settings), false);
  assert.equal(regionHasGroundGrass({ biome: 'dunes' }, settings), false);
});

test('old explicit ground-cover switch is still respected', () => {
  assert.equal(groundGrassSettings({ groundCover: { type: 'existing' } }).enabled, false);
  const settings = groundGrassSettings({ groundCover: { type: 'rei-grass', density: 12, height: 1.1 } });
  assert.equal(settings.enabled, true);
  assert.equal(settings.density, 12);
  assert.equal(settings.height, 1.1);
  assert.equal(regionHasGroundGrass({ biome: 'snow', groundCover: 'rei-grass' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'meadow', groundCover: 'none' }, settings), false);
});

test('ground grass leaves paths, rivers and building footprints clear', () => {
  const map = {
    paths: [{ width: 4, points: [[-10, 0], [10, 0]] }],
    rivers: [{ width: 6, points: [[0, -10], [0, 10]] }],
    objects: [
      { kind: 'house', variant: 'inn', position: [20, 20], rotation: 0, scale: 1 },
      { kind: 'crate', variant: 'kit-wood', position: [-20, -20], rotation: .4, scale: 1 },
    ],
  };
  const excluded = createGroundGrassExclusion(map);
  assert.equal(excluded(0, 0), true);
  assert.equal(excluded(20, 20), true);
  assert.equal(excluded(-20, -20), true);
  assert.equal(excluded(30, 30), false);
});
