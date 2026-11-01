import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLandPoint, pointInPolygon, landBoundaryRings, distanceToSegment, validateWorldmap } from '../src/map/model.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
const boundarySegments = landBoundaryRings(map).flatMap(ring => ring.map((a, i) => [a, ring[(i + 1) % ring.length]]));
const gates = [
  { id: 'nordbruecke', channel: 'nordpassage', approach: [[158, -327], [213, -272]] },
  { id: 'suedbruecke', channel: 'suedpassage', approach: [[223, 316], [267, 272]] },
];
const channelDistance = (point, channel) => Math.min(...channel.points.slice(1).map((next, i) => distanceToSegment(point, channel.points[i], next)));

// Die Körperreserve wird auch an Brückenseiten berücksichtigt. Ohne Deck
// bleiben die beiden vollständigen Wasserkanäle unpassierbar.
function routeAt(point) {
  if (!isLandPoint(map, point) || boundarySegments.some(([a, b]) => distanceToSegment(point, a, b) < .8)) return null;
  const inChannel = map.rivers.some(channel => channelDistance(point, channel) < channel.width / 2 + .8);
  if (!inChannel) return { gate: 0 };
  const bridge = spatial.bridgeAt(...point, -.8);
  const index = gates.findIndex(gate => gate.id === bridge?.line.id);
  return index >= 0 ? { gate: 1 << index } : null;
}

test('the reference layout has exactly two sea channels and bridge routes with fully dry start areas', () => {
  assert.equal(map.paths.length, 2);
  assert.ok(map.paths.every(path => path.kind === 'bridge'));
  assert.equal(map.rivers.length, 2);
  assert.equal(map.waterAreas.length, 1);
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  for (const channel of map.rivers) {
    assert.ok(pointInPolygon(channel.points[0], map.waterAreas[0].points), `${channel.id}: Anschluss in der Lagune`);
    assert.ok(!pointInPolygon(channel.points.at(-1), map.island.points), `${channel.id}: Anschluss im offenen Meer`);
  }
  for (const spawn of map.spawnAreas) {
    assert.ok(routeAt(spawn.position), spawn.id);
    for (const [a, b] of boundarySegments) assert.ok(distanceToSegment(spawn.position, a, b) >= spawn.radius, `${spawn.id}: Küstenabstand`);
    for (const channel of map.rivers) assert.ok(channelDistance(spawn.position, channel) > spawn.radius + channel.width / 2, `${spawn.id}: vollständiger Kreis außerhalb des Kanals`);
  }
  assert.equal(map.spawnAreas.reduce((sum, spawn) => sum + spawn.capacity, 0), 50);
});

test('both bridge decks cross real water, keep their complete width on the land necks and have dry landings', () => {
  const withoutBridges = createWorldSpatialModel({ ...map, paths: [] });
  for (const gate of gates) {
    const bridge = map.paths.find(path => path.id === gate.id), channel = map.rivers.find(river => river.id === gate.channel);
    const [a, b] = bridge.points, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    for (const point of [a, b]) assert.ok(channelDistance(point, channel) >= channel.width / 2 + 10, `${gate.id}: mindestens zehn Meter feste Landauflage`);
    let waterSamples = 0;
    for (let step = 0; step <= 100; step++) {
      const centre = [a[0] + dx * step / 100, a[1] + dz * step / 100];
      if (withoutBridges.isWater(...centre)) waterSamples++;
      assert.ok(routeAt(centre), `${gate.id}: durchgängiger Weg bei ${centre}`);
      for (const side of [-bridge.width / 2 - .8, bridge.width / 2 + .8]) {
        const point = [centre[0] - dz / length * side, centre[1] + dx / length * side];
        assert.ok(isLandPoint(map, point), `${gate.id}: Deck reicht nicht in Außenmeer oder Lagune`);
      }
    }
    assert.ok(waterSamples > 15, `${gate.id}: wirkliche Wasserquerung statt Brücke auf trockenem Boden`);
    for (const point of gate.approach) assert.ok(routeAt(point), `${gate.id}: zugängliche Anfahrt`);
  }
});

test('biomes follow the reference: small snowy northwest, dominant green core, southwest marsh and dry south/east', () => {
  const expected = [
    [[-350, -480], 'snow'], [[-20, -270], 'meadow'], [[-350, -40], 'forest'],
    [[-250, 340], 'marsh'], [[100, 520], 'dunes'], [[375, -200], 'heath'], [[470, 175], 'volcanic'],
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
  assert.ok(share('forest') + share('meadow') > .4);
  assert.ok(share('marsh') > .06 && share('marsh') < .15);
  assert.ok(share('dunes') > .15 && share('dunes') < .25);
  assert.ok(share('heath') > .1 && share('heath') < .2);
  assert.ok(share('volcanic') > 0 && share('volcanic') < .05);
});

test('the eastern territory is reachable through either bridge and fully disconnected when both decks are removed', () => {
  // Vier-Meter-Raster mit 0,8 m Körperreserve. Entfernte Deckzellen entsprechen
  // echten Kanal-Wasserflächen; es gibt keine erfundenen Testsperren im Gelände.
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
  for (const target of [...map.places, ...map.spawnAreas]) assert.ok(all.visited[indexAt(target.position)], target.id);
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
