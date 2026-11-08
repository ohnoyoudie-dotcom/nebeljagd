import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { canPaintGrass, createGrassBrushStroke } from '../src/map/grass-brush.js';
import { createLandscapePlacementGuard } from '../src/map/landscape-brush.js';

function fixture() {
  const map = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
  map.bounds = { minX: -160, maxX: 160, minZ: -120, maxZ: 120 };
  map.island = { id: 'mainland', name: 'Hauptland', points: [[-140, -90], [-20, -90], [-20, 90], [-140, 90]] };
  map.islets = [{ id: 'east', name: 'Ostland <Test>', points: [[20, -90], [140, -90], [140, 90], [20, 90]] }];
  map.waterAreas = [{ id: 'east-lake', name: 'See', points: [[70, 35], [95, 35], [95, 65], [70, 65]] }];
  map.regions = [{ id: 'forest', name: 'Wald', biome: 'forest', color: '#397b43',
    points: [[-150, -100], [150, -100], [150, 100], [-150, 100]], label: [-80, 0] }];
  map.paths = [
    { id: 'gap-bridge', name: 'Brücke', kind: 'bridge', width: 10, points: [[-40, -30], [40, -30]] },
    { id: 'land-trail', name: 'Weg', kind: 'trail', width: 4, points: [[-120, 10], [120, 10]] },
  ];
  map.rivers = []; map.places = []; map.objects = []; map.barriers = [];
  map.spawnAreas = [{ id: 'start', name: 'Start', position: [-90, 50], radius: 8, capacity: 50 }];
  map.gameplay.spawnPosition = [-90, 50]; map.zone.center = [-90, 50];
  delete map.landscape;
  return map;
}

test('SVG clips geography to both land surfaces and their own holes while keeping gap bridges visible', () => {
  const map = fixture(), before = structuredClone(map);
  assert.deepEqual(validateWorldmap(map).errors, []);
  const svg = renderWorldmapSvg(map, { editor: true });
  assert.match(svg, /<clipPath id="world-island-clip"><use href="#world-land-shape" clip-rule="evenodd"/);
  assert.match(svg, /<path id="world-land-shape"[^>]+fill-rule="evenodd" clip-rule="evenodd"/);
  assert.match(svg, /data-feature-type="islet" data-feature-id="east"/);
  assert.ok(svg.includes('Ostland &lt;Test&gt;'));
  const easternShape = svg.match(/<path id="feature-islet-east"[^>]+>/)?.[0];
  assert.ok(easternShape?.includes('M70,35L95,35L95,65L70,65Z'), 'the eastern lake is cut out of its own island');
  const primaryShape = svg.match(/<(?:path|polygon) id="feature-island-mainland"[^>]+>/)?.[0];
  assert.ok(!primaryShape.includes('70,35'), 'the lake must not be assigned to the main coast');
  const pathsLayer = svg.match(/<g id="paths"[^>]+>/)?.[0];
  const bridge = svg.match(/<g id="feature-path-gap-bridge"[^>]+>/)?.[0];
  const trail = svg.match(/<g id="feature-path-land-trail"[^>]+>/)?.[0];
  assert.ok(pathsLayer && !pathsLayer.includes('clip-path'), 'bridge ancestor cannot clip away the open span');
  assert.ok(bridge && !bridge.includes('clip-path'), 'a real gap bridge is visible between shores');
  assert.ok(trail?.includes('clip-path="url(#world-island-clip)"'), 'ordinary trails remain on land');
  assert.deepEqual(map, before, 'rendering leaves authored geometry unchanged');
});

test('grass and scenery accept both land surfaces while keeping open gaps, inner holes and bridge approaches clear', () => {
  const map = fixture(), guard = createLandscapePlacementGuard(map);
  for (const point of [[-70, 0], [70, 0]]) {
    assert.equal(canPaintGrass(point, map, 2), true);
    assert.equal(guard.reason(point, 2, 'grass'), null);
  }
  for (const point of [[0, 0], [22, 0], [80, 50], [68, 50], [-30, -30], [30, -30]]) {
    assert.equal(canPaintGrass(point, map, 3), false, point.join(','));
    assert.ok(guard.reason(point, 3, 'grass'), point.join(','));
  }
  const stroke = createGrassBrushStroke(map, { radius: 2 });
  stroke.sample([-90, 0]); stroke.sample([90, 0]);
  assert.ok(stroke.objects.some(item => item.position[0] < -20));
  assert.ok(stroke.objects.some(item => item.position[0] > 20));
  for (const item of stroke.objects) assert.equal(canPaintGrass(item.position, map, item.radius), true);
  assert.deepEqual(map.objects, []);
});

test('absent and empty islets preserve the same legacy SVG and brush contract', () => {
  const map = fixture();
  delete map.islets; map.waterAreas = []; map.paths = [];
  assert.equal(renderWorldmapSvg(map), renderWorldmapSvg({ ...map, islets: [] }));
  assert.equal(canPaintGrass([-60, 0], map, 2), canPaintGrass([-60, 0], map.island.points, 2));
  assert.equal(canPaintGrass([60, 0], map, 2), false);
});
