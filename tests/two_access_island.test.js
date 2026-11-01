import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLandPoint, landBoundaryRings, distanceToSegment, validateWorldmap } from '../src/map/model.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
const boundarySegments = landBoundaryRings(map).flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]));
const gates = [
  { name: 'north', shore: [195, -310], lagoon: [175, -290], approach: [[165, -320], [205, -280]] },
  { name: 'south', shore: [255, 300], lagoon: [233, 282], approach: [[231, 307], [257, 275]] },
];

test('the free map has no authored roads, rivers or bridges and retains valid dry starting discs', () => {
  assert.deepEqual(map.paths, []);
  assert.deepEqual(map.rivers, []);
  assert.equal(map.waterAreas.length, 1);
  assert.equal(map.waterAreas[0].id, 'goldheide-lagune');
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  for (const spawn of map.spawnAreas) {
    assert.equal(spatial.isLand(...spawn.position), true, spawn.id);
    assert.equal(spatial.isWater(...spawn.position), false, spawn.id);
    for (const [a, b] of boundarySegments) assert.ok(distanceToSegment(spawn.position, a, b) >= spawn.radius,
      `${spawn.id}: water reaches its starting circle`);
  }
  assert.equal(map.spawnAreas.reduce((sum, spawn) => sum + spawn.capacity, 0), 50);
});

test('both eastern land entrances are narrow, genuinely dry passages with room for a moving player', () => {
  for (const gate of gates) {
    const width = Math.hypot(gate.shore[0] - gate.lagoon[0], gate.shore[1] - gate.lagoon[1]);
    assert.ok(width >= 15 && width <= 30, `${gate.name}: deliberate narrow entrance`);
    for (const end of [gate.shore, gate.lagoon]) assert.ok(boundarySegments.some(([a, b]) => distanceToSegment(end, a, b) < 1e-7));
    const [a, b] = gate.approach;
    for (let step = 0; step <= 100; step++) {
      const point = a.map((value, axis) => value + (b[axis] - value) * step / 100);
      assert.equal(spatial.isLand(...point), true, `${gate.name}: passage crosses water at ${point}`);
      assert.equal(spatial.isWater(...point), false, `${gate.name}: passage is blocked by water at ${point}`);
      assert.ok(boundarySegments.every(([c, d]) => distanceToSegment(point, c, d) > .8),
        `${gate.name}: passage is too close to water for the player`);
    }
  }
});

test('the eastern territory has exactly two connections: either entrance works, closing both isolates it', () => {
  // Four-metre routing cells with player-radius clearance. Gates are only
  // virtual test cuts; the actual map contains no walls or hidden blockers.
  const step = 4, columns = Math.ceil((map.bounds.maxX - map.bounds.minX) / step);
  const rows = Math.ceil((map.bounds.maxZ - map.bounds.minZ) / step);
  const land = new Uint8Array(columns * rows), gateBits = new Uint8Array(land.length);
  const pointAt = index => [map.bounds.minX + (index % columns + .5) * step,
    map.bounds.minZ + (Math.floor(index / columns) + .5) * step];
  const indexAt = point => Math.floor((point[1] - map.bounds.minZ) / step) * columns + Math.floor((point[0] - map.bounds.minX) / step);
  for (let index = 0; index < land.length; index++) {
    const point = pointAt(index);
    if (!isLandPoint(map, point) || boundarySegments.some(([a, b]) => distanceToSegment(point, a, b) < .8)) continue;
    land[index] = 1;
    gates.forEach((gate, gateIndex) => {
      if (distanceToSegment(point, gate.shore, gate.lagoon) < step * 1.1) gateBits[index] |= 1 << gateIndex;
    });
  }
  function flood(mask, start) {
    const visited = new Uint8Array(land.length), queue = new Int32Array(land.length);
    let head = 0, tail = 0;
    const origin = indexAt(start);
    assert.ok(land[origin] && !(gateBits[origin] & mask), `dry origin ${start}`);
    visited[origin] = 1; queue[tail++] = origin;
    while (head < tail) {
      const current = queue[head++], column = current % columns, row = Math.floor(current / columns);
      for (const next of [column > 0 ? current - 1 : -1, column + 1 < columns ? current + 1 : -1,
        row > 0 ? current - columns : -1, row + 1 < rows ? current + columns : -1]) {
        if (next < 0 || !land[next] || gateBits[next] & mask || visited[next]) continue;
        visited[next] = 1; queue[tail++] = next;
      }
    }
    return { visited, count: tail };
  }
  const start = map.gameplay.spawnPosition, east = [360, 120];
  const all = flood(0, start);
  assert.equal(all.count, land.reduce((sum, value) => sum + value, 0), 'all walkable land is connected with both entrances open');
  for (const target of [...map.places, ...map.spawnAreas]) assert.ok(all.visited[indexAt(target.position)], target.id);
  for (const mask of [1, 2]) assert.ok(flood(mask, start).visited[indexAt(east)], `remaining entrance must work with cut mask ${mask}`);
  const mainland = flood(3, start), territory = flood(3, east);
  assert.equal(mainland.visited[indexAt(east)], 0, 'there must be no third connection');
  assert.ok(territory.count * step * step > 100_000, 'the eastern territory is a substantial playable area');
  for (let index = 0; index < land.length; index++) {
    if (land[index] && !(gateBits[index] & 3)) assert.equal(mainland.visited[index] + territory.visited[index], 1,
      'closing both entrances must form exactly two components');
  }
  for (const gate of gates) {
    assert.ok(mainland.visited[indexAt(gate.approach[0])], `${gate.name}: mainland approach`);
    assert.ok(territory.visited[indexAt(gate.approach[1])], `${gate.name}: territory approach`);
  }
});
