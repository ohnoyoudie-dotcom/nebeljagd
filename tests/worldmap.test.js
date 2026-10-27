import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateWorldmap, getWorldmapStats, pointInPolygon, zoneAt, worldToThree } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';

const base = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(base);

test('world-map data is valid, readable, has seven regions and fifty distributed spawn slots', () => {
  assert.deepEqual(validateWorldmap(base), { valid: true, errors: [], warnings: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(base)), base);
  const stats = getWorldmapStats(base);
  assert.equal(stats.regionCount, 7);
  assert.equal(stats.targetPlayers, 50);
  assert.equal(stats.spawnAreaCount, 10);
  assert.equal(stats.spawnCapacity, 50);
  assert.equal(stats.matchDurationSeconds, 1200);
  assert.ok(stats.landAreaM2 > 1e6 && stats.landAreaM2 < 1.3e6);
  assert.ok(stats.widthM > 1000 && stats.heightM > 1300);
  assert.ok(stats.walkAcrossSeconds > 220 && stats.walkAcrossSeconds < 260);
  for (const name of ['Mooswinkel', 'Mondhain', 'Wildheide']) assert.ok(base.places.some(place => place.name === name));
});

test('x/z coordinates map directly into Three and polygon boundaries count as land', () => {
  assert.deepEqual(worldToThree([-250, 320], 7), { x: -250, y: 7, z: 320 });
  const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 5], square), true);
  assert.equal(pointInPolygon([0, 5], square), true);
  assert.equal(pointInPolygon([10, 10], [...square, square[0]]), true);
  assert.equal(pointInPolygon([11, 5], square), false);
  assert.equal(pointInPolygon([5, 5], [...square].reverse()), true);
  assert.equal(pointInPolygon([NaN, 0], square), false);
});

test('fog holds for exploration, interpolates then stops at final radius', () => {
  assert.equal(zoneAt(base, -10).radius, 800);
  assert.equal(zoneAt(base, 179).radius, 800);
  assert.equal(zoneAt(base, 180).shrinking, true);
  assert.equal(zoneAt(base, 270).radius, 680);
  assert.equal(zoneAt(base, 360).radius, 560);
  assert.equal(zoneAt(base, 360).shrinking, false);
  assert.equal(zoneAt(base, 1200).radius, 20);
  assert.equal(zoneAt(base, 10000).radius, 20);
  assert.equal(zoneAt(base, 270).remainingSeconds, 930);
  assert.deepEqual(zoneAt(base, 0).center, [0, 0]);
  let last = Infinity;
  for (let second = 0; second <= 1250; second += 5) {
    const current = zoneAt(base, second).radius;
    assert.ok(current <= last);
    last = current;
  }
});

test('invalid and nonfinite geometry, duplicate ids and unsafe style attributes are rejected', () => {
  for (const alter of [
    m => { m.island.points[0][0] = Infinity; },
    m => { m.regions[0].points = [[0, 0], [100, 100], [100, 0], [0, 100]]; },
    m => { m.regions[0].points = [[0, 0], [10, 0], [20, 0]]; },
    m => { m.paths[0].points = [[0, 0], [0, 0]]; },
    m => { m.places[0].position = [NaN, 0]; },
    m => { m.places[0].id = m.places[1].id; },
    m => { m.places[0].id = ['looks-like-an-id']; },
    m => { m.regions[0].biome = ['snow']; },
    m => { m.regions[0].color = '#fff" onload="alert(1)'; },
    m => { m.regions[0].color = ['#ffffff']; },
    m => { m.regions = []; },
    m => { m.bounds.maxX = m.bounds.minX; },
    m => { m.paths[0].width = 0; },
    m => { m.spawnAreas[0].capacity = .5; },
    m => { m.spawnAreas = []; },
    m => { m.zone.phases[0].radius = 900; },
    m => { m.zone.phases[0].shrinkSeconds = 0; },
    m => { m.zone.phases[0].holdSeconds = -1; },
    m => { m.coordinateSystem.north = '+z'; },
  ]) {
    const map = copy(); alter(map);
    const validation = validateWorldmap(map);
    assert.equal(validation.valid, false, JSON.stringify(map));
    assert.ok(validation.errors.length > 0);
    assert.throws(() => renderWorldmapSvg(map), /Ungültige Weltkarte/);
  }
  for (const input of [null, [], 'text', { schemaVersion: 1 }]) assert.equal(validateWorldmap(input).valid, false);
});

test('spawn discs must fit land; changes to the coast flag affected places; region overhang is allowed', () => {
  const offshore = copy(); offshore.places[0].position = [-590, -700];
  assert.ok(validateWorldmap(offshore).errors.some(error => /außerhalb der Insel/.test(error)));
  const coast = copy(); coast.spawnAreas[0].position = [-455, -500]; coast.spawnAreas[0].radius = 100;
  assert.ok(validateWorldmap(coast).errors.some(error => /teilweise außerhalb/.test(error)));
  const overhang = copy();
  overhang.regions[0].points[0] = [-599, -719];
  assert.equal(validateWorldmap(overhang).valid, true);
  const fewer = copy(); fewer.spawnAreas[0].capacity = 4;
  assert.ok(validateWorldmap(fewer).errors.some(error => /49 Plätze für 50/.test(error)));
});

test('SVG exports named editable layers and geometry without external images or scripts', () => {
  const svg = renderWorldmapSvg(base);
  assert.match(svg, /viewBox="-600 -720 1200 1440"/);
  for (const layer of ['sea', 'island', 'regions', 'rivers', 'paths', 'places', 'spawn-areas', 'zone', 'labels', 'frame']) assert.ok(svg.includes(`id="${layer}"`));
  for (const collection of ['regions', 'paths', 'rivers', 'places', 'spawnAreas']) for (const feature of base[collection]) assert.ok(svg.includes(`data-feature-id="${feature.id}"`));
  assert.ok(svg.includes('clip-path="url(#world-island-clip)"'));
  assert.ok(!/<script|<foreignObject|\bonload=|<image/i.test(svg));
  const links = [...svg.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links.filter(link => link.startsWith('#feature-island-')), Array(3).fill(`#feature-island-${base.island.id}`));
  assert.ok(links.every(link => /^#(?:feature-island-|world-object-)/.test(link)), 'all SVG references must remain local');
  assert.ok(svg.includes('id="world-objects"'));
  for (const object of base.objects ?? []) assert.ok(svg.includes(`data-feature-id="${object.id}"`));
  assert.equal((svg.match(new RegExp(`points="${base.island.points.map(p => p.join(',')).join(' ')}"`, 'g')) ?? []).length, 1);
  assert.match(svg, /inkscape:groupmode="layer" inkscape:label="Regionen"/);
  const original = JSON.stringify(base);
  renderWorldmapSvg(base, { showZone: true, zoneRadius: 200, showGrid: true, editor: true });
  assert.equal(JSON.stringify(base), original);
});

test('names in imported JSON remain literal text in SVG, never markup', () => {
  const map = copy();
  map.name = '<svg onload="alert(1)">& map';
  map.places[0].name = '</text><script>alert(1)</script>';
  const svg = renderWorldmapSvg(map);
  assert.ok(svg.includes('&lt;svg onload=&quot;alert(1)&quot;&gt;&amp; map'));
  assert.ok(svg.includes('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/<script|<svg onload=/.test(svg));
});
