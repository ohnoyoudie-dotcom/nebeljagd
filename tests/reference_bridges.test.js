import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorldSpatialModel, SEA_LEVEL } from '../src/generated-spatial.js';
import { emitTerrainTriangles } from '../src/terrain-triangulation.js';
import { ROLL_SPEED } from '../src/rules.js';

const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const spatial = createWorldSpatialModel(map);
const bridges = map.paths.filter(path => path.kind === 'bridge');
const interpolate = (a, b, t) => a.map((value, axis) => value + (b[axis] - value) * t);

function bridgeFrame(bridge) {
  const a = bridge.points[0], b = bridge.points.at(-1), length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { a, b, length, centre: interpolate(a, b, .5), dx: (b[0] - a[0]) / length, dz: (b[1] - a[1]) / length };
}

test('both inlet beds open below the shared lagoon/sea surface, while inland rivers keep their own water height', () => {
  assert.equal(bridges.length, 2);
  assert.equal(spatial.rivers.segments.length, 2);
  for (const { a, b, line } of spatial.rivers.segments) {
    assert.equal(line.seaChannel, true, line.id);
    for (let i = 0; i <= 30; i++) {
      const point = interpolate(a, b, i / 30);
      assert.equal(spatial.waterAt(...point).height, SEA_LEVEL);
      assert.ok(spatial.groundAt(...point) < SEA_LEVEL - .6, `the ${line.id} bed must lie below the water at ${point}`);
    }
  }
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/scenery-cleanup-worldmap.json', import.meta.url)));
  const oldSpatial = createWorldSpatialModel(legacy);
  assert.ok(oldSpatial.rivers.segments.some(segment => !segment.line.seaChannel));
  for (const segment of oldSpatial.rivers.segments) {
    if (segment.line.seaChannel) continue;
    const [x, z] = interpolate(segment.a, segment.b, .5), water = oldSpatial.waterAt(x, z);
    assert.equal(water.height, oldSpatial.rawLand(water.x, water.z) * .25 + .14);
  }
});

test('each bridge has continuous bank ramps, clearance above water and traversable width for walking and rolling', () => {
  for (const bridge of bridges) {
    const { a, b, dx, dz, length } = bridgeFrame(bridge);
    assert.ok(Math.abs(spatial.bridgeAt(...a).height - spatial.groundAt(...a)) <= .04);
    assert.ok(Math.abs(spatial.bridgeAt(...b).height - spatial.groundAt(...b)) <= .04);
    let previous;
    for (let step = 0; step <= 400; step++) {
      const point = interpolate(a, b, step / 400), deck = spatial.bridgeAt(...point);
      assert.ok(deck, `${bridge.id}: continuous deck`);
      if (previous !== undefined) assert.ok(Math.abs(deck.height - previous) < .08, 'the deck has no height steps');
      previous = deck.height;
      const water = spatial.waterAt(...point);
      if (water && water.distance < water.line.width / 2) assert.ok(deck.height > water.height + .5);
      for (const side of [-1, 1]) {
        const offset = (bridge.width / 2 - .8) * side;
        assert.equal(spatial.isWater(point[0] + dz * offset, point[1] - dx * offset, .42), false);
      }
    }
    for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
      const position = { x: a[0] - dx * 2, z: a[1] - dz * 2 };
      for (let step = 0; step < Math.ceil((length + 4) / (speed * .05)); step++) {
        position.x += dx * speed * .05; position.z += dz * speed * .05;
        const before = { ...position };
        spatial.resolveWaterMovement(position, .42);
        assert.ok(Math.hypot(position.x - before.x, position.z - before.z) < 1e-7, `${bridge.id}: no collision on the intended crossing`);
        assert.ok(spatial.isLand(position.x, position.z) && !spatial.isWater(position.x, position.z, .42));
      }
      assert.ok((position.x - b[0]) * dx + (position.z - b[1]) * dz > 1, `${bridge.id}: reaches the opposite bank`);
    }
  }
});

test('bridge rails stop sideways movement without teleporting a walker or a roll to a distant bank', () => {
  for (const bridge of bridges) {
    const { centre, dx, dz } = bridgeFrame(bridge);
    for (const side of [-1, 1]) for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
      const position = { x: centre[0], z: centre[1] };
      for (let step = 0; step < 40; step++) {
        const before = { ...position };
        position.x += dz * speed * .1 * side; position.z -= dx * speed * .1 * side;
        spatial.resolveWaterMovement(position, .42);
        assert.ok(Math.hypot(position.x - before.x, position.z - before.z) <= speed * .1 + 1e-7, 'no snap across the water');
        assert.equal(spatial.isWater(position.x, position.z, .42), false);
        const across = Math.abs((position.x - centre[0]) * dz - (position.z - centre[1]) * dx);
        assert.ok(across <= bridge.width / 2 - .42 + 1e-7);
      }
    }
  }
});

test('unbridged water beside either crossing cannot be crossed by sustained walking or rolling', () => {
  for (const bridge of bridges) {
    const { centre, dx, dz } = bridgeFrame(bridge), channel = spatial.waterAt(...centre);
    for (const side of [-1, 1]) for (const speed of [map.gameplay.walkSpeedMetersPerSecond, ROLL_SPEED]) {
      const across = (bridge.width / 2 + 3) * side;
      const origin = [centre[0] + dz * across - dx * (channel.line.width / 2 + 4),
        centre[1] - dx * across - dz * (channel.line.width / 2 + 4)];
      assert.ok(spatial.isLand(...origin) && !spatial.isWater(...origin), `${bridge.id}: valid approach beside the bridge`);
      const position = { x: origin[0], z: origin[1] };
      for (let step = 0; step < 100; step++) {
        position.x += dx * speed * .1; position.z += dz * speed * .1;
        spatial.resolveWaterMovement(position, .42);
        assert.ok(spatial.isLand(position.x, position.z) && !spatial.isWater(position.x, position.z));
      }
      assert.ok((position.x - centre[0]) * dx + (position.z - centre[1]) * dz < 0, 'the player stays on the approach bank');
    }
  }
});

test('actual locally refined terrain triangles keep the narrow channel below the sea plane', () => {
  for (const bridge of bridges) {
    const { centre } = bridgeFrame(bridge), triangles = [];
    const vertex = (x, z) => ({ x, z, y: spatial.groundAt(x, z), color: [1, 1, 1] });
    const square = [[-23, -23], [23, -23], [23, 23], [-23, 23]].map(point => vertex(centre[0] + point[0], centre[1] + point[1]));
    emitTerrainTriangles([[square[0], square[1], square[2]], [square[0], square[2], square[3]]],
      { depth: 0, vertex, shouldRefine: spatial.refineTerrainTriangle, emit: (...triangle) => triangles.push(triangle) });
    for (let x = centre[0] - 18; x <= centre[0] + 18; x += 2) for (let z = centre[1] - 18; z <= centre[1] + 18; z += 2) {
      const water = spatial.waterAt(x, z);
      if (!spatial.isLand(x, z) || water.distance > water.line.width / 2 - 1.5) continue;
      let surface;
      for (const [a, b, c] of triangles) {
        const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
        if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) { surface = u * a.y + v * b.y + (1 - u - v) * c.y; break; }
      }
      assert.ok(surface < SEA_LEVEL - .4, `${bridge.id}: visible channel bed ${x},${z} must be submerged (${surface})`);
    }
  }
});

test('triangulated banks stay beneath the whole deck width and meet all four landings without a height step', () => {
  for (const bridge of bridges) {
    const { a, b, dx, dz, length } = bridgeFrame(bridge), cells = new Map(), cellSize = 3;
    const vertex = (x, z) => ({ x, z, y: spatial.groundAt(x, z), color: [1, 1, 1] });
    // Offset source diagonals deliberately: the regression must not depend on
    // a terrain edge accidentally matching a bridge end or its long centreline.
    const minX = Math.min(a[0], b[0]) - 13.7, maxX = Math.max(a[0], b[0]) + 14.3;
    const minZ = Math.min(a[1], b[1]) - 13.1, maxZ = Math.max(a[1], b[1]) + 14.9;
    const square = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]].map(point => vertex(...point));
    emitTerrainTriangles([[square[0], square[1], square[2]], [square[0], square[2], square[3]]], {
      depth: 0, vertex, shouldRefine: spatial.refineTerrainTriangle,
      emit: (...triangle) => {
        const loX = Math.floor(Math.min(...triangle.map(p => p.x)) / cellSize), hiX = Math.floor(Math.max(...triangle.map(p => p.x)) / cellSize);
        const loZ = Math.floor(Math.min(...triangle.map(p => p.z)) / cellSize), hiZ = Math.floor(Math.max(...triangle.map(p => p.z)) / cellSize);
        for (let x = loX; x <= hiX; x++) for (let z = loZ; z <= hiZ; z++) {
          const key = `${x},${z}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(triangle);
        }
      },
    });
    const renderedHeight = (x, z) => {
      for (const [a, b, c] of cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
        const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
        if (u >= -1e-7 && v >= -1e-7 && u + v <= 1.0000001) return u * a.y + v * b.y + (1 - u - v) * c.y;
      }
      assert.fail(`missing terrain surface at ${x},${z}`);
    };
    // Sample every half-metre across all planks, not only the centre that had
    // hidden the earlier bank-through-deck regression in the runtime test.
    const rows = Math.ceil(length / .5), columns = Math.ceil(bridge.width / .5);
    for (let row = 0; row <= rows; row++) {
      const centre = interpolate(a, b, row / rows), deck = spatial.bridgeAt(...centre).height;
      for (let column = 0; column <= columns; column++) {
        const across = bridge.width * (column / columns - .5), x = centre[0] + dz * across, z = centre[1] - dx * across;
        assert.ok(spatial.groundAt(x, z) < deck - .025, `${bridge.id}: authored bank clips a plank at ${x},${z}`);
        assert.ok(renderedHeight(x, z) < deck - .02, `${bridge.id}: triangulated bank clips a plank at ${x},${z}`);
      }
    }
    for (const [end, sign] of [[a, -1], [b, 1]]) for (let column = 0; column <= columns; column++) {
      const across = bridge.width * (column / columns - .5), x = end[0] + dz * across, z = end[1] - dx * across;
      const deck = spatial.bridgeAt(...end).height;
      assert.ok(Math.abs(renderedHeight(x + dx * sign * .1, z + dz * sign * .1) - deck) < .06,
        `${bridge.id}: the complete landing width meets its deck`);
      let previous = renderedHeight(x, z);
      for (let step = 1; step <= 40; step++) {
        const current = renderedHeight(x + dx * sign * step * .25, z + dz * sign * step * .25);
        assert.ok(Math.abs(current - previous) < .12, `${bridge.id}: approach blends gradually into the bank`);
        previous = current;
      }
    }
  }
});
