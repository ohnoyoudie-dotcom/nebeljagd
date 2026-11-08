import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLandPoint, pointInPolygon, landBoundaryRings, outerLandRings, distanceToSegment, validateWorldmap } from '../src/map/model.js';
import { createWorldSpatialModel, triangulateWorldLand } from '../src/generated-spatial.js';

const map = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
const boundarySegments = landBoundaryRings(map).flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]));
const gates = [
  { id: 'nordbruecke', approach: [[158, -327], [213, -272]], gap: [185, -300] },
  { id: 'suedbruecke', approach: [[220, 315], [268, 267]], gap: [244, 291] },
];

// An den Küsten tragen die Decks den ganzen Körper auch über den freien Raum.
// Ohne Deck zählen nur trockene Punkte mit 0,8 Meter Küstenabstand als begehbar.
function routeAt(point) {
  const ground = isLandPoint(map, point) && boundarySegments.every(([a, b]) => distanceToSegment(point, a, b) >= .8);
  if (ground) return { gate: 0 };
  const bridge = spatial.bridgeAt(...point, -.8);
  const index = gates.findIndex(gate => gate.id === bridge?.line.id);
  return index >= 0 ? { gate: 1 << index } : null;
}

test('the four-biome map has two actual land masses, no planning markers and a dry game start', () => {
  assert.equal(map.paths.length, 2);
  assert.ok(map.paths.every(path => path.kind === 'bridge'));
  assert.deepEqual(map.rivers, []);
  assert.deepEqual(map.waterAreas, []);
  assert.equal(map.islets.length, 1);
  assert.equal(map.islets[0].id, 'ostinsel');
  assert.equal(outerLandRings(map).length, 2);
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  assert.deepEqual(map.spawnAreas, []);
  assert.deepEqual(map.places, []);
  assert.ok(isLandPoint(map, map.gameplay.spawnPosition));
  assert.equal(spatial.isWater(...map.gameplay.spawnPosition, .42), false);
});

test('the two bridges span genuine terrain gaps, carry their full usable width and meet dry land at both ends', () => {
  const terrain = triangulateWorldLand(map);
  const withoutBridges = createWorldSpatialModel({ ...map, paths: [] });
  for (const gate of gates) {
    const bridge = map.paths.find(path => path.id === gate.id);
    const [a, b] = bridge.points, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    assert.equal(isLandPoint(map, gate.gap), false, `${gate.id}: unter der Brückenmitte ist kein Land`);
    assert.equal(withoutBridges.isWater(...gate.gap), true, `${gate.id}: freier Raum ohne Deck unpassierbar`);
    assert.equal(terrain.some(triangle => pointInPolygon(gate.gap, triangle)), false, `${gate.id}: kein versteckter Bodensteg`);
    for (const end of [a, b]) {
      assert.ok(boundarySegments.every(([c, d]) => distanceToSegment(end, c, d) > 10), `${gate.id}: feste Landauflage`);
      for (const side of [-bridge.width / 2 - .8, bridge.width / 2 + .8]) {
        const point = [end[0] - dz / length * side, end[1] + dx / length * side];
        assert.ok(isLandPoint(map, point), `${gate.id}: gesamte Auflagenbreite auf Land`);
      }
    }
    let gapSamples = 0;
    for (let step = 0; step <= 100; step++) {
      const centre = [a[0] + dx * step / 100, a[1] + dz * step / 100];
      assert.ok(routeAt(centre), `${gate.id}: durchgängige Querung bei ${centre}`);
      if (!isLandPoint(map, centre)) {
        gapSamples++;
        assert.equal(terrain.some(triangle => pointInPolygon(centre, triangle)), false, `${gate.id}: echte Lücke bei ${centre}`);
      }
      for (const side of [-bridge.width / 2 + 1, bridge.width / 2 - 1]) {
        const point = [centre[0] - dz / length * side, centre[1] + dx / length * side];
        assert.ok(spatial.bridgeAt(...point, -.8), `${gate.id}: volle begehbare Deckbreite bei ${point}`);
      }
    }
    assert.ok(gapSamples > 20, `${gate.id}: nennenswerte Querung über den freien Raum`);
    for (const point of gate.approach) assert.ok(isLandPoint(map, point) && routeAt(point), `${gate.id}: trockene Anfahrt`);
  }
});

test('exactly four biomes cover the map: snowy northwest, green core, southwest swamp and sandy south/east', () => {
  assert.equal(map.regions.length, 4);
  assert.deepEqual(map.regions.map(region => region.biome).sort(), ['dunes', 'forest', 'marsh', 'snow']);
  const expected = [
    [[-350, -480], 'snow'], [[-20, -270], 'forest'], [[-350, -40], 'forest'],
    [[-250, 340], 'marsh'], [[100, 520], 'dunes'], [[375, -200], 'dunes'], [[470, 175], 'dunes'],
  ];
  for (const [point, biome] of expected) assert.equal(spatial.biomeAt(...point), biome, point.join(','));
  const counts = new Map(); let total = 0;
  for (let x = -599.27; x < 600; x += 8) for (let z = -719.43; z < 720; z += 8) {
    const point = [x, z]; if (!isLandPoint(map, point)) continue;
    const covering = map.regions.filter(region => pointInPolygon(point, region.points));
    assert.ok(covering.length, `keine Biomlücke bei ${point}`);
    for (const region of covering) if (covering.length > 1) assert.ok(region.points.some((a, i) => distanceToSegment(point, a, region.points[(i + 1) % region.points.length]) < 1e-6), `keine überlagerten Biome bei ${point}`);
    const biome = covering.at(-1).biome;
    counts.set(biome, (counts.get(biome) ?? 0) + 1); total++;
  }
  const share = biome => (counts.get(biome) ?? 0) / total;
  assert.ok(share('snow') > .12 && share('snow') < .2);
  assert.ok(share('forest') > .4 && share('forest') < .5);
  assert.ok(share('marsh') > .06 && share('marsh') < .15);
  assert.ok(share('dunes') > .28 && share('dunes') < .36);
});

test('the eastern territory is reachable through either bridge and fully disconnected when both decks are removed', () => {
  // Vier-Meter-Raster mit 0,8 m Körperreserve. Entfernte Deckzellen entsprechen
  // dem echten freien Raum zwischen den Küsten; es gibt keine erfundenen Testsperren im Gelände.
  const step = 4, columns = Math.ceil((map.bounds.maxX - map.bounds.minX) / step);
  const rows = Math.ceil((map.bounds.maxZ - map.bounds.minZ) / step);
  const land = new Uint8Array(columns * rows), gateBits = new Uint8Array(land.length);
  const pointAt = index => [map.bounds.minX + (index % columns + .5) * step,
    map.bounds.minZ + (Math.floor(index / columns) + .5) * step];
  const indexAt = point => Math.floor((point[1] - map.bounds.minZ) / step) * columns + Math.floor((point[0] - map.bounds.minX) / step);
  for (let index = 0; index < land.length; index++) {
    const route = routeAt(pointAt(index)); if (!route) continue;
    land[index] = 1; gateBits[index] = route.gate;
  }
  function flood(mask, start) {
    const visited = new Uint8Array(land.length), queue = new Int32Array(land.length);
    let head = 0, tail = 0;
    const origin = indexAt(start);
    assert.ok(land[origin] && !(gateBits[origin] & mask), `trockener Start ${start}`);
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
  assert.equal(all.count, land.reduce((sum, value) => sum + value, 0), 'gesamte begehbare Insel verbunden');
  for (const target of map.objects) assert.ok(all.visited[indexAt(target.position)], target.id);
  for (const mask of [1, 2]) assert.ok(flood(mask, start).visited[indexAt(east)], `verbleibende Brücke bei Maske ${mask}`);
  const mainland = flood(3, start), territory = flood(3, east);
  assert.equal(mainland.visited[indexAt(east)], 0, 'keine dritte Verbindung neben den Brücken');
  assert.ok(territory.count * step * step > 100_000, 'großer spielbarer Ostbereich');
  for (let index = 0; index < land.length; index++) if (land[index] && !(gateBits[index] & 3)) {
    assert.equal(mainland.visited[index] + territory.visited[index], 1, 'ohne Brücken genau zwei getrennte Landbereiche');
  }
  for (const gate of gates) {
    assert.ok(mainland.visited[indexAt(gate.approach[0])], `${gate.id}: westliche Anfahrt`);
    assert.ok(territory.visited[indexAt(gate.approach[1])], `${gate.id}: östliche Anfahrt`);
  }
});
