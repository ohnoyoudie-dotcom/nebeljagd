import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSpatialModel } from '../src/generated-spatial.js';
import { makeWorldObject } from '../src/map/objects.js';

// Keep the historical crate and bridge fixtures separate from editable project content.
const map = JSON.parse(readFileSync(new URL('./fixtures/scenery-cleanup-worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);

test('generated geography follows editable coast, regions and house plateaus', () => {
  assert.equal(spatial.isLand(30, -42), true);
  assert.equal(spatial.isLand(-599, -719), false);
  for (const region of map.regions) assert.equal(spatial.regionAt(...region.label).biome, region.biome);
  const withHouse = structuredClone(map);
  withHouse.objects.push(makeWorldObject('house', [30, -60], { id: 'test-house-plateau' }));
  const houseTerrain = createWorldSpatialModel(withHouse);
  const center = houseTerrain.groundAt(30, -60);
  assert.ok(Number.isFinite(center));
  assert.ok(Math.abs(houseTerrain.groundAt(35, -60) - center) < 1e-6);
  const modified = structuredClone(map);
  modified.island.points = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  const other = createWorldSpatialModel(modified);
  assert.equal(other.isLand(200, 0), false);
  assert.equal(spatial.isLand(200, 0), true);
});

test('all stored bridges are walkable at river intersections while ordinary water blocks movement', () => {
  const segmentIntersection = (a, b, c, d) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], ex = d[0] - c[0], ez = d[1] - c[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-8) return null;
    const t = ((c[0] - a[0]) * ez - (c[1] - a[1]) * ex) / den;
    const u = ((c[0] - a[0]) * dz - (c[1] - a[1]) * dx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + dx * t, a[1] + dz * t] : null;
  };
  for (const bridge of map.paths.filter(path => path.kind === 'bridge')) {
    let crossing;
    for (const river of map.rivers) for (let i = 1; i < river.points.length; i++) crossing ??= segmentIntersection(bridge.points[0], bridge.points.at(-1), river.points[i - 1], river.points[i]);
    assert.ok(crossing, `${bridge.id} must cross a river`);
    assert.equal(spatial.isWater(...crossing), false);
    assert.ok(spatial.bridgeAt(...crossing));
  }
  assert.equal(spatial.isWater(-60, -215), true);
  assert.equal(spatial.isWater(30, -42), false);
});

test('ten editable wooden crates are placed on land outside buildings and paths', () => {
  const crates = map.objects.filter(object => object.kind === 'crate');
  assert.equal(crates.length, 10);
  assert.ok(crates.every(crate => crate.variant === 'kit-wood' && spatial.isLand(...crate.position) && !spatial.isWater(...crate.position, .9)));
  assert.equal(new Set(crates.map(crate => crate.id)).size, crates.length);
});
