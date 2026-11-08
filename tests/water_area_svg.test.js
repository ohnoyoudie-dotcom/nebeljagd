import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderWorldmapSvg } from '../src/map/render.js';
import { validateWorldmap } from '../src/map/model.js';

function fixture() {
  const map = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
  const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  map.bounds = { minX: -120, minZ: -120, maxX: 120, maxZ: 120 };
  map.island.points = square;
  map.regions = [{ id: 'meadow', name: 'Wiese', biome: 'meadow', color: '#80a66a', points: square, label: [-60, 0] }];
  map.paths = []; map.rivers = []; map.objects = []; map.barriers = []; map.places = [];
  map.spawnAreas = [{ id: 'start', name: 'Start', position: [-60, -60], radius: 8, capacity: 50 }];
  map.gameplay.spawnPosition = [-60, -60]; map.zone.center = [-60, -60];
  delete map.landscape; delete map.waterAreas; delete map.islets;
  return map;
}

test('SVG water areas use a real land cutout and stay independently selectable below placed objects', () => {
  const map = fixture();
  map.waterAreas = [{ id: 'lagoon', name: 'Lagune <Test>', points: [[-25, -25], [25, -25], [25, 25], [-25, 25]] }];
  assert.deepEqual(validateWorldmap(map).errors, []);
  const before = JSON.stringify(map);
  const svg = renderWorldmapSvg(map, { editor: true });
  assert.match(svg, /<path id="feature-island-[^"]+"[^>]+fill-rule="evenodd" clip-rule="evenodd"/);
  assert.match(svg, /<clipPath id="world-island-clip"><use [^>]+clip-rule="evenodd"/);
  assert.ok(svg.includes('M-25,-25L25,-25L25,25L-25,25Z'), 'the lake boundary is part of the cutout path');
  assert.match(svg, /data-feature-type="waterArea" data-feature-id="lagoon"/);
  assert.ok(svg.includes('Lagune &lt;Test&gt;'));
  assert.ok(svg.indexOf('id="water-areas"') < svg.indexOf('id="world-objects"'));
  assert.equal(JSON.stringify(map), before, 'rendering never mutates authored geometry');
});

test('legacy SVGs without water areas retain the original polygon form', () => {
  const map = fixture(), absent = renderWorldmapSvg(map);
  assert.match(absent, /<polygon id="feature-island-/);
  assert.ok(!absent.includes('id="water-areas"'));
  assert.ok(!absent.includes('clip-rule="evenodd"'));
  assert.equal(renderWorldmapSvg({ ...map, waterAreas: [] }), absent);
});
