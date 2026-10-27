import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWorldmapSvg } from '../src/map/render.js';
import { ensureLandscape, terrainSettings, vegetationSettings } from '../src/map/landscape.js';
import { makeWorldObject } from '../src/map/objects.js';

const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
test('editable SVG keeps authored terrain and wind in named layers with safe literal settings', () => {
  const map = structuredClone(base), landscape = ensureLandscape(map);
  const name = 'Boden </metadata><script>alert(1)</script>';
  landscape.terrain.push({ id: 'paint-test', name, ...terrainSettings('sand'), position: [30, -42], radius: 8, seed: 3 });
  landscape.windZones.push({ id: 'wind-test', name: 'Windschatten', position: [35, -42], radius: 12, falloff: .5, strength: 0, direction: 1 });
  const before = structuredClone(map), svg = renderWorldmapSvg(map);
  assert.match(svg, /data-layer="terrain-paint"/);
  assert.match(svg, /data-feature-type="terrain" data-feature-id="paint-test"/);
  assert.match(svg, /data-layer="wind-zones"/);
  assert.match(svg, /data-feature-type="wind" data-feature-id="wind-test"/);
  assert.match(svg, /Boden &lt;\/metadata&gt;&lt;script&gt;/);
  assert.doesNotMatch(svg, /<script|foreignObject|onload=/);
  assert.ok(svg.indexOf('id="terrain-paint"') < svg.indexOf('id="paths"'));
  assert.ok(svg.indexOf('id="wind-zones"') < svg.indexOf('id="world-objects"'));
  assert.deepEqual(map, before, 'export does not normalize or mutate authored data');
});

test('configured vegetation remains independently selectable including zero-density patches', () => {
  const map = structuredClone(base);
  const grass = makeWorldObject('grass', [30, -42], { id: 'configured-grass' });
  grass.vegetation = { ...vegetationSettings(grass), height: 3, density: 0, color: '#83b752' };
  map.objects.push(grass);
  const svg = renderWorldmapSvg(map);
  assert.match(svg, /data-feature-id="configured-grass"/);
  assert.match(svg, /Höhe 300 % · Dichte 0 %/);
  assert.match(svg, /fill="#83b752" fill-opacity="0.12"/);
  assert.equal(map.landscape, undefined, 'editing one patch does not require unrelated environment fields');
});
