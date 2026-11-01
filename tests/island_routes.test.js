import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pointInPolygon, distanceToSegment } from '../src/map/model.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
const routes = map.paths.filter(path => path.kind !== 'bridge');
const segments = line => line.points.slice(1).map((b, index) => [line.points[index], b]);

test('authored routes and both shoulders stay on land or their real bridges', () => {
  for (const path of routes) for (const [a, b] of segments(path)) {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const steps = Math.ceil(length / 2), margin = path.width / 2 + .5;
    for (let step = 0; step <= steps; step++) for (const side of [-1, 0, 1]) {
      const point = [a[0] + dx * step / steps - dz / length * side * margin,
        a[1] + dz * step / steps + dx / length * side * margin];
      assert.equal(pointInPolygon(point, map.island.points), true, `${path.id}: coast at ${point}`);
      assert.equal(spatial.isWater(...point), false, `${path.id}: unbridged water at ${point}`);
    }
  }
});

test('every named destination has a route and all routes form one connected network', () => {
  for (const place of map.places) {
    const distance = Math.min(...routes.flatMap(path => segments(path).map(([a, b]) => distanceToSegment(place.position, a, b))));
    assert.ok(distance < .5, `${place.id}: no road reaches this destination`);
  }
  const reached = new Set([routes[0].id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of routes.filter(path => !reached.has(path.id))) {
      const linked = routes.filter(path => reached.has(path.id)).some(path =>
        candidate.points.some(point => segments(path).some(([a, b]) => distanceToSegment(point, a, b) < .1))
        || path.points.some(point => segments(candidate).some(([a, b]) => distanceToSegment(point, a, b) < .1)));
      if (linked) { reached.add(candidate.id); changed = true; }
    }
  }
  assert.equal(reached.size, routes.length, 'every path must connect to the island network');
});

test('distributed starting discs avoid the ocean and river channels completely', () => {
  for (const spawn of map.spawnAreas) {
    assert.equal(pointInPolygon(spawn.position, map.island.points), true, spawn.id);
    for (const [a, b] of segments({ points: [...map.island.points, map.island.points[0]] })) {
      assert.ok(distanceToSegment(spawn.position, a, b) >= spawn.radius, `${spawn.id}: coast reaches start circle`);
    }
    for (const river of map.rivers) for (const [a, b] of segments(river)) {
      assert.ok(distanceToSegment(spawn.position, a, b) >= spawn.radius + river.width / 2,
        `${spawn.id}: river ${river.id} reaches start circle`);
    }
  }
});
