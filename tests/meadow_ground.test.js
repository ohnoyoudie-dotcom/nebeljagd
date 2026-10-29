import test from 'node:test';
import assert from 'node:assert/strict';
import { groundGrassSettings, regionHasGroundGrass, grassBiomeProfile, grassBiomeBlend, createGroundGrassExclusion } from '../src/meadow-ground.js';

test('dense meadow adapts automatically across grassy biomes including snow', () => {
  const settings = groundGrassSettings({});
  assert.equal(settings.enabled, true);
  assert.equal(regionHasGroundGrass({ biome: 'meadow' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'forest' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'heath' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'marsh' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'snow' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'dunes' }, settings), false);
  const meadow = grassBiomeProfile('meadow'), snow = grassBiomeProfile('snow');
  assert.equal(snow.snowy, true);
  assert.equal(snow.baseDensity, .22);
  assert.equal(snow.detailDensity, .30);
  assert.equal(snow.baseHeight, .58);
  assert.equal(snow.detailHeight, .72);
  assert.equal(snow.color, '#9daaa1');
  assert.ok(snow.baseDensity < meadow.baseDensity * .25);
  assert.ok(snow.detailDensity < meadow.detailDensity * .35);
});

test('soft biome weights blend both grass layers independently and fade into bare biomes', () => {
  const meadow = grassBiomeProfile('meadow'), snow = grassBiomeProfile('snow');
  const mixed = grassBiomeBlend([{ biome: 'meadow', weight: .5 }, { biome: 'snow', weight: .5 }]);
  assert.ok(mixed.baseDensity < meadow.baseDensity && mixed.baseDensity > snow.baseDensity);
  assert.ok(mixed.detailDensity < meadow.detailDensity && mixed.detailDensity > snow.detailDensity);
  assert.ok(mixed.baseHeight < meadow.baseHeight && mixed.baseHeight > snow.baseHeight);
  assert.ok(mixed.detailHeight < meadow.detailHeight && mixed.detailHeight > snow.detailHeight);
  assert.ok(mixed.snowWeight > .49 && mixed.snowWeight < .51);
  assert.ok(mixed.supportedWeight > .99);
  const fading = grassBiomeBlend([{ biome: 'meadow', weight: .4 }, { biome: 'dunes', weight: .6 }]);
  assert.ok(fading.baseDensity > .39 && fading.baseDensity < .41, 'short grass fades into a non-grass biome');
  assert.ok(fading.detailDensity > .39 && fading.detailDensity < .41, 'long grass fades independently into a non-grass biome');
});

test('forest, heath and marsh each have distinct short/tall layer behavior', () => {
  const meadow = grassBiomeProfile('meadow'), forest = grassBiomeProfile('forest');
  const heath = grassBiomeProfile('heath'), marsh = grassBiomeProfile('marsh');
  assert.ok(forest.baseDensity < meadow.baseDensity && forest.detailDensity < meadow.detailDensity);
  assert.ok(heath.baseHeight < meadow.baseHeight && heath.detailHeight < meadow.detailHeight);
  assert.ok(marsh.baseDensity < meadow.baseDensity);
  assert.ok(marsh.detailDensity > forest.detailDensity);
  assert.ok(marsh.detailHeight > meadow.detailHeight);
  assert.notEqual(forest.color, meadow.color);
  assert.notEqual(heath.color, meadow.color);
  assert.notEqual(marsh.color, meadow.color);
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
