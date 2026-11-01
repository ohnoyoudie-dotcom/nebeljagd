import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSpatialModel, triangulateWorldLand, SEA_LEVEL } from '../src/generated-spatial.js';
import { isLandPoint, pointInPolygon, polygonArea } from '../src/map/model.js';
import { emitTerrainTriangles } from '../src/terrain-triangulation.js';
import { ROLL_SPEED } from '../src/rules.js';

const authored = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const interpolate = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);
const frame = bridge => {
  const a = bridge.points[0], b = bridge.points.at(-1), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { a, b, length, dx: (b[0] - a[0]) / length, dz: (b[1] - a[1]) / length, centre: interpolate(a, b, .5) };
};

function fixture() {
  return {
    island: { id: 'mainland', name: 'Hauptland', points: [[-100, -100], [-10, -100], [-10, 100], [-100, 100]] },
    islets: [{ id: 'eastland', name: 'Ostland', points: [[10, -100], [100, -100], [100, 100], [10, 100]] }],
    waterAreas: [], rivers: [], objects: [],
    paths: [{ id: 'crossing', name: 'Brücke', kind: 'bridge', width: 10, points: [[-30, 0], [30, 0]] }],
    regions: [{ id: 'forest', name: 'Grünland', biome: 'forest', color: '#648252',
      points: [[-100, -100], [100, -100], [100, 100], [-100, 100]], label: [-50, 0] }],
    gameplay: { walkSpeedMetersPerSecond: 5.6 },
  };
}

test('separate land polygons and their holes triangulate without inventing terrain across the open gap', () => {
  const base = fixture();
  base.waterAreas = [
    { id: 'west-lake', name: 'Westsee', points: [[-70, 40], [-50, 40], [-50, 60], [-70, 60]] },
    { id: 'east-lake', name: 'Ostsee', points: [[50, 40], [70, 40], [70, 60], [50, 60]] },
  ];
  for (const reverse of [false, true]) {
    const map = structuredClone(base);
    for (const area of [map.island, ...map.islets, ...map.waterAreas]) {
      if (reverse) area.points.reverse();
      area.points.push([...area.points[0]]);
    }
    const before = structuredClone(map), triangles = triangulateWorldLand(map);
    const expected = [map.island, ...map.islets].reduce((sum, area) => sum + polygonArea(area.points), 0)
      - map.waterAreas.reduce((sum, area) => sum + polygonArea(area.points), 0);
    assert.ok(Math.abs(triangles.reduce((sum, triangle) => sum + polygonArea(triangle), 0) - expected) < 1e-7);
    assert.deepEqual(map, before, 'triangulation must not normalize authored rings in place');
    for (let x = -99.37; x < 100; x += 3.7) for (let z = -99.41; z < 100; z += 3.7) {
      assert.equal(triangles.some(triangle => pointInPolygon([x, z], triangle)), isLandPoint(map, [x, z]), `${x},${z}`);
    }
    for (const point of [[0, 0], [0, 50], [-60, 50], [60, 50]]) {
      assert.ok(!triangles.some(triangle => pointInPolygon(point, triangle)), `actual empty surface at ${point}`);
    }
  }
});

test('a bridge is traversable over sea while the empty gap remains non-land and has no river projection', () => {
  const map = fixture(), spatial = createWorldSpatialModel(map);
  const withoutBridge = createWorldSpatialModel({ ...map, paths: [] });
  assert.equal(spatial.isLand(0, 0), false);
  assert.equal(spatial.waterAt(0, 0), null);
  assert.equal(spatial.isWater(0, 0), false);
  assert.ok(spatial.bridgeAt(0, 0).height > SEA_LEVEL + .5);
  assert.equal(withoutBridge.isWater(0, 0), true);
  assert.equal(spatial.isWater(0, 20), true);
  assert.equal(spatial.isLand(50, 0), true, 'the secondary landmass is real dry terrain');
  assert.equal(spatial.isWater(50, 0), false);
});

test('walking and rolling cross each complete open-gap bridge in both directions without shore snaps', () => {
  assert.equal(authored.islets?.length, 1, 'the current eastern area is a separate landmass');
  assert.deepEqual(authored.rivers, []);
  for (const map of [fixture(), authored]) {
    const spatial = createWorldSpatialModel(map);
    for (const bridge of map.paths.filter(path => path.kind === 'bridge')) {
      const { a, b, dx, dz, length } = frame(bridge);
      assert.equal(spatial.isLand(...interpolate(a, b, .5)), false, bridge.id);
      for (const direction of [-1, 1]) for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
        const start = direction === 1 ? a : b, end = direction === 1 ? b : a;
        const position = { x: start[0] - dx * direction * 2, z: start[1] - dz * direction * 2 };
        let seaDeckSamples = 0;
        for (let step = 0; step < Math.ceil((length + 4) / (speed * .05)); step++) {
          position.x += dx * direction * speed * .05; position.z += dz * direction * speed * .05;
          const candidate = { ...position };
          spatial.resolveWaterMovement(position, .42);
          assert.ok(Math.hypot(position.x - candidate.x, position.z - candidate.z) < 1e-7, `${bridge.id}: no shore snap on the deck`);
          assert.equal(spatial.isWater(position.x, position.z, .42), false);
          if (!spatial.isLand(position.x, position.z)) {
            seaDeckSamples++;
            assert.ok(spatial.bridgeAt(position.x, position.z, -.42));
          }
        }
        assert.ok(seaDeckSamples > 5, 'the crossing actually walks above absent terrain');
        assert.ok(spatial.isLand(position.x, position.z));
        assert.ok((position.x - end[0]) * dx * direction + (position.z - end[1]) * dz * direction > 1);
      }
    }
  }
});

test('open-gap bridge edges stop lateral walking and rolls without teleporting to either shore', () => {
  for (const map of [fixture(), authored]) {
    const spatial = createWorldSpatialModel(map);
    for (const bridge of map.paths.filter(path => path.kind === 'bridge')) {
      const { centre, dx, dz } = frame(bridge);
      for (const side of [-1, 1]) for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
        const position = { x: centre[0], z: centre[1] };
        for (let step = 0; step < 40; step++) {
          const before = { ...position };
          position.x += dz * speed * .1 * side; position.z -= dx * speed * .1 * side;
          spatial.resolveWaterMovement(position, .42);
          assert.ok(Math.hypot(position.x - before.x, position.z - before.z) <= speed * .1 + 1e-7, bridge.id);
          assert.equal(spatial.isLand(position.x, position.z), false, 'side collision stays on the deck above the gap');
          assert.equal(spatial.isWater(position.x, position.z, .42), false);
          const across = Math.abs((position.x - centre[0]) * dz - (position.z - centre[1]) * dx);
          assert.ok(across <= bridge.width / 2 - .42 + 1e-7, `${bridge.id}: whole player body fits the deck`);
        }
      }
    }
  }
});

test('removing bridge decks leaves the sea gaps impassable for sustained walking and rolling', () => {
  for (const map of [fixture(), authored]) {
    const spatial = createWorldSpatialModel({ ...map, paths: [] });
    for (const bridge of map.paths.filter(path => path.kind === 'bridge')) {
      const { a, b, dx, dz, length } = frame(bridge);
      for (const direction of [-1, 1]) for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
        const start = direction === 1 ? a : b;
        const position = { x: start[0], z: start[1] };
        for (let step = 0; step < 150; step++) {
          position.x += dx * direction * speed * .1; position.z += dz * direction * speed * .1;
          spatial.resolveWaterMovement(position, .42);
          assert.ok(spatial.isLand(position.x, position.z));
          assert.equal(spatial.isWater(position.x, position.z), false);
        }
        assert.ok((position.x - start[0]) * dx * direction + (position.z - start[1]) * dz * direction < length / 2,
          `${bridge.id}: no crossing without a deck`);
      }
    }
  }
});

test('the actual island triangulation stays empty under bridge gaps and below the full width of all four dry landings', () => {
  const spatial = createWorldSpatialModel(authored), bridges = authored.paths.filter(path => path.kind === 'bridge');
  const source = triangulateWorldLand(authored), cells = new Map(), cellSize = 3;
  const bounds = bridges.map(bridge => {
    const { a, b } = frame(bridge), margin = bridge.width / 2 + 12;
    return { minX: Math.min(a[0], b[0]) - margin, maxX: Math.max(a[0], b[0]) + margin,
      minZ: Math.min(a[1], b[1]) - margin, maxZ: Math.max(a[1], b[1]) + margin };
  });
  const vertex = (x, z) => ({ x, z, y: spatial.groundAt(x, z), color: [1, 1, 1] });
  emitTerrainTriangles(source.map(triangle => triangle.map(point => vertex(...point))), {
    depth: 6, vertex, shouldRefine: spatial.refineTerrainTriangle,
    emit: (...triangle) => {
      const minX = Math.min(...triangle.map(point => point.x)), maxX = Math.max(...triangle.map(point => point.x));
      const minZ = Math.min(...triangle.map(point => point.z)), maxZ = Math.max(...triangle.map(point => point.z));
      if (!bounds.some(box => maxX >= box.minX && minX <= box.maxX && maxZ >= box.minZ && minZ <= box.maxZ)) return;
      for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
        for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(triangle);
        }
      }
    },
  });
  function renderedHeight(x, z) {
    for (const [a, b, c] of cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-12) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
      if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return u * a.y + v * b.y + (1 - u - v) * c.y;
    }
    return undefined;
  }
  for (const bridge of bridges) {
    const { a, b, dx, dz, length } = frame(bridge), rows = Math.ceil(length / .5), columns = Math.ceil(bridge.width / .5);
    let gapSamples = 0, bankSamples = 0;
    for (let row = 0; row <= rows; row++) {
      const point = interpolate(a, b, row / rows), deck = spatial.bridgeAt(...point).height;
      for (let column = 0; column <= columns; column++) {
        const across = bridge.width * (column / columns - .5), x = point[0] + dz * across, z = point[1] - dx * across;
        const surface = renderedHeight(x, z);
        if (spatial.isLand(x, z)) {
          bankSamples++;
          assert.ok(Number.isFinite(surface), `${bridge.id}: landing terrain exists`);
          assert.ok(surface < deck - .02, `${bridge.id}: terrain remains beneath every visible deck edge at ${x},${z}`);
        } else {
          gapSamples++;
          assert.equal(surface, undefined, `${bridge.id}: no hidden ground under the open gap at ${x},${z}`);
        }
      }
    }
    assert.ok(gapSamples > 50 && bankSamples > 50, 'check both the real gap and full dry bridge ends');
    for (const [end, sign] of [[a, -1], [b, 1]]) for (let column = 0; column <= columns; column++) {
      const across = bridge.width * (column / columns - .5), x = end[0] + dz * across, z = end[1] - dx * across;
      const deck = spatial.bridgeAt(...end).height;
      assert.ok(Math.abs(renderedHeight(x + dx * sign * .1, z + dz * sign * .1) - deck) < .08,
        `${bridge.id}: complete landing width joins its deck without a step`);
      let previous = renderedHeight(x, z);
      for (let step = 1; step <= 40; step++) {
        const next = renderedHeight(x + dx * sign * step * .25, z + dz * sign * step * .25);
        assert.ok(Number.isFinite(next));
        assert.ok(Math.abs(next - previous) < .15, `${bridge.id}: the bank approach blends gradually`);
        previous = next;
      }
    }
  }
});
