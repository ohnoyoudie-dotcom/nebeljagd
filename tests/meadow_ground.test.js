import test from 'node:test';
import assert from 'node:assert/strict';
import { groundGrassSettings, regionHasGroundGrass, grassBiomeProfile, grassBiomeBlend, createGroundGrassExclusion } from '../src/meadow-ground.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';

test('dense meadow adapts automatically across grassy biomes including snow', () => {
  const settings = groundGrassSettings({});
  assert.equal(settings.enabled, true);
  assert.equal(regionHasGroundGrass({ biome: 'meadow' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'forest' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'heath' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'marsh' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'snow' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'dunes' }, settings), true);
  assert.equal(regionHasGroundGrass({ biome: 'volcanic' }, settings), true);
  const meadow = grassBiomeProfile('meadow'), snow = grassBiomeProfile('snow');
  assert.equal(snow.snowy, true);
  assert.equal(snow.baseDensity, 0);
  assert.equal(snow.detailDensity, .12);
  assert.equal(snow.baseHeight, .45);
  assert.equal(snow.detailHeight, .62);
  assert.equal(snow.detailColor, '#687a70');
  assert.equal(snow.baseDensity, 0);
  assert.ok(snow.detailDensity < meadow.detailDensity * .15);
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
  const fading = grassBiomeBlend([{ biome: 'meadow', weight: .4 }, { biome: 'water', weight: .6 }]);
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

test('dunes and volcanic ground keep only sparse dry cover', () => {
  const dunes = grassBiomeProfile('dunes'), volcanic = grassBiomeProfile('volcanic');
  assert.ok(dunes.baseDensity < .2 && dunes.detailDensity < .2);
  assert.ok(volcanic.baseDensity <= .1 && volcanic.detailDensity < .15);
  assert.ok(dunes.baseHeight < .6 && volcanic.baseHeight <= .5);
  assert.notEqual(dunes.color, volcanic.color);
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

test('grass meets normalized model edges without a bare margin, including rotated and scaled objects', () => {
  const models = [
    ['house', 'kit-tripo-tavern'], ['house', 'kit-tripo-castle'], ['house', 'kit-timber'], ['house', 'kit-taverne'],
    ['crate', 'kit-wood'], ['barrel', 'kit-tripo-barrel'], ['wagon', 'kit-tripo-wagon'], ['well', 'kit-tripo-well'],
  ];
  for (const [kind, variant] of models) for (const [rotation, scale] of [[0, 1], [.63, .5], [Math.PI / 2, 2]]) {
    const object = { kind, variant, position: [35, -23], rotation, scale };
    const { halfWidth: hx, halfDepth: hz } = getEnvironmentKitDefinition(kind, variant).footprint;
    const c = Math.cos(rotation), s = Math.sin(rotation);
    const at = (x, z) => [35 + scale * (c * x + s * z), -23 + scale * (-s * x + c * z)];
    const map = { objects: [object] }, original = structuredClone(map);
    const excluded = createGroundGrassExclusion(map);
    for (const side of [-1, 1]) {
      assert.equal(excluded(...at(side * (hx + .02), 0)), false, `${variant}: grass beside x edge`);
      assert.equal(excluded(...at(0, side * (hz + .02))), false, `${variant}: grass beside z edge`);
      assert.equal(excluded(...at(side * (hx - .02), side * (hz - .02))), true, `${variant}: no roots through corners/floors`);
    }
    assert.equal(excluded(...at(0, 0)), true, `${variant}: floor remains clear`);
    assert.deepEqual(map, original, 'placement data is unchanged');
  }
});

test('road and river clearances stay independent of scenery, including the snow-cover caller', () => {
  const map = { paths: [{ width: 4, points: [[-10, 0], [10, 0]] }],
    rivers: [{ width: 6, points: [[20, -10], [20, 10]] }],
    objects: [{ kind: 'house', variant: 'kit-tripo-tavern', position: [50, 50], rotation: 0, scale: 1 }] };
  for (const padding of [.55, .18, 0]) {
    const excluded = createGroundGrassExclusion(map, { padding });
    assert.equal(excluded(0, 2 + padding - .01), true);
    assert.equal(excluded(0, 2 + padding + .01), false);
    assert.equal(excluded(23 + padding - .01, 0), true);
    assert.equal(excluded(23 + padding + .01, 0), false);
    assert.equal(excluded(61.03, 50), false, 'path padding must never clear a border around the tavern');
    assert.equal(excluded(50, 50), true);
  }
});

test('legacy cottages keep grass at the stone plinth with only the actual porch cut out', () => {
  const excluded = createGroundGrassExclusion({ objects: [{ kind: 'house', variant: 'inn', position: [0, 0], rotation: 0, scale: 1 }] });
  assert.equal(excluded(8.35, 0), false);
  assert.equal(excluded(5, 7.35), false);
  assert.equal(excluded(0, 0), true);
  assert.equal(excluded(0, 8.9), true);
  assert.equal(excluded(2.25, 8), false, 'porch must not clear the entire front facade');
});

test('chests do not create a large empty rectangle around their base', () => {
  for (const [variant, hx, hz] of [['wood', .86, .63], ['kit-tripo-chest', .87, .575]]) {
    const excluded = createGroundGrassExclusion({ objects: [{ kind: 'chest', variant, position: [0, 0], rotation: 0, scale: 1 }] });
    assert.equal(excluded(hx + .02, 0), false);
    assert.equal(excluded(0, hz + .02), false);
    assert.equal(excluded(0, 0), true);
  }
});
