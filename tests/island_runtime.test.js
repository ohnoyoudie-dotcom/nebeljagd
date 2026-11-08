import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSpatialModel, triangulateWorldLand } from '../src/generated-spatial.js';
import { pointInPolygon, polygonArea, outerLandRings, waterBoundaryRings } from '../src/map/model.js';

const map = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
// This is the same source triangulation consumed by createGeneratedWorld.
// Uniform/adaptive refinement has its separate seam tests.
const triangles = triangulateWorldLand(map);

test('runtime island triangulation follows the concave coastline without filling bays or losing land', () => {
  assert.ok(triangles.length > 0);
  const area = triangles.reduce((sum, triangle) => sum + polygonArea(triangle), 0);
  const landArea = outerLandRings(map).reduce((sum, ring) => sum + polygonArea(ring), 0) - waterBoundaryRings(map).reduce((sum, ring) => sum + polygonArea(ring), 0);
  assert.ok(Math.abs(area - landArea) < 1e-6);
  for (const triangle of triangles) {
    assert.ok(polygonArea(triangle) > 1e-8, 'no degenerate source triangles');
    const center = [0, 1].map(axis => triangle.reduce((sum, point) => sum + point[axis], 0) / 3);
    assert.ok(spatial.isLand(...center), `terrain triangle must remain on land at ${center}`);
  }
  let land = 0, sea = 0;
  for (let x = map.bounds.minX + 12.5; x < map.bounds.maxX; x += 25) {
    for (let z = map.bounds.minZ + 12.5; z < map.bounds.maxZ; z += 25) {
      const inside = spatial.isLand(x, z);
      const rendered = triangles.some(triangle => pointInPolygon([x, z], triangle));
      assert.equal(rendered, inside, `rendered terrain and runtime coastline agree at ${x},${z}`);
      if (inside) land++; else sea++;
    }
  }
  assert.ok(land > 100 && sea > 100, 'sample both land and surrounding water');
});

test('the current island has explicit biome coverage and finite runtime ground/color samples', () => {
  let samples = 0;
  const seen = new Set();
  for (let x = map.bounds.minX + 6; x < map.bounds.maxX; x += 12) {
    for (let z = map.bounds.minZ + 6; z < map.bounds.maxZ; z += 12) {
      if (!spatial.isLand(x, z)) continue;
      const covering = map.regions.filter(region => pointInPolygon([x, z], region.points));
      assert.ok(covering.length, `land at ${x},${z} must not use the first-region fallback`);
      assert.equal(spatial.regionAt(x, z).id, covering.at(-1).id);
      const weights = spatial.biomeWeightsAt(x, z);
      assert.ok(weights.every(entry => Number.isFinite(entry.weight) && entry.weight > 0));
      assert.ok(Number.isFinite(spatial.groundAt(x, z)));
      const color = spatial.baseColorAt(x, z);
      assert.ok([color.r, color.g, color.b].every(Number.isFinite));
      seen.add(spatial.regionAt(x, z).biome); samples++;
    }
  }
  assert.ok(samples > 1000);
  assert.deepEqual([...seen].sort(), [...new Set(map.regions.map(region => region.biome))].sort());
  const spawn = map.gameplay.spawnPosition;
  assert.ok(spatial.isLand(...spawn) && !spatial.isWater(...spawn, .42), 'normal game start stays on dry land');
  for (const area of map.spawnAreas) {
    assert.ok(spatial.isLand(...area.position) && !spatial.isWater(...area.position, .42), area.id);
  }
});
