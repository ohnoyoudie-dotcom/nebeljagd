import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));

test('painted biome fields blend continuously over the saved soft edge', () => {
  const map = structuredClone(base);
  map.landscape = {
    version: 1,
    terrain: [],
    windZones: [],
    presets: [],
    biomes: [{
      id: 'biome-test-snow',
      name: 'Schnee-Test',
      presetId: 'snow',
      position: [0, -100],
      radius: 40,
      strength: 1,
      softness: 1,
      seed: 1,
    }],
  };
  const spatial = createWorldSpatialModel(map);
  const center = spatial.biomeWeightsAt(0, -100);
  const middle = spatial.biomeWeightsAt(20, -100);
  const edge = spatial.biomeWeightsAt(39, -100);
  const weight = (list, biome) => list.find(item => item.biome === biome)?.weight ?? 0;

  assert.ok(weight(center, 'snow') > .99);
  assert.ok(weight(middle, 'snow') > .3 && weight(middle, 'snow') < .8);
  assert.ok(weight(middle, 'meadow') > .2);
  assert.ok(weight(edge, 'snow') < .05);
  assert.equal(spatial.biomeAt(0, -100), 'snow');
  assert.equal(spatial.biomeAt(39, -100), 'meadow');
});

test('older biome stamps without softness remain readable with a soft default', () => {
  const map = structuredClone(base);
  map.landscape = {
    version: 1,
    terrain: [],
    windZones: [],
    presets: [],
    biomes: [{
      id: 'biome-old-forest',
      presetId: 'forest',
      position: [0, -100],
      radius: 30,
      strength: .8,
      seed: 2,
    }],
  };
  const spatial = createWorldSpatialModel(map);
  assert.ok(spatial.biomeWeightsAt(0, -100).some(item => item.biome === 'forest' && item.weight > .7));
});
