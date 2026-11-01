import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldSpatialModel, triangulateWorldLand } from '../src/generated-spatial.js';
import { isLandPoint, pointInPolygon, polygonArea } from '../src/map/model.js';
import { ROLL_SPEED } from '../src/rules.js';

function fixture() {
  const outer = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  return {
    island: { id: 'island', name: 'Island', points: outer },
    waterAreas: [{ id: 'lagoon', name: 'Lagoon', points: [[-20, -40], [20, -40], [20, 40], [-20, 40]] }],
    regions: [{ id: 'meadow', name: 'Meadow', biome: 'meadow', color: '#80a66a', points: outer, label: [-60, 0] }],
    paths: [], rivers: [], objects: [],
  };
}

test('terrain triangulation removes multiple water polygons with either winding and repeated closing vertices', () => {
  const map = fixture();
  map.waterAreas.push({ id: 'second-lagoon', name: 'Second lagoon', points: [[40, -70], [70, -70], [55, -50]] });
  for (const reverse of [false, true]) {
    const candidate = structuredClone(map);
    for (const feature of [candidate.island, ...candidate.waterAreas]) {
      if (reverse) feature.points.reverse();
      feature.points.push([...feature.points[0]]);
    }
    const before = structuredClone(candidate), triangles = triangulateWorldLand(candidate);
    assert.deepEqual(candidate, before, 'Three normalization must not edit authored rings');
    const expected = polygonArea(candidate.island.points) - candidate.waterAreas.reduce((sum, area) => sum + polygonArea(area.points), 0);
    assert.ok(Math.abs(triangles.reduce((sum, triangle) => sum + polygonArea(triangle), 0) - expected) < 1e-8);
    for (let x = -99.37; x < 100; x += 3.7) for (let z = -99.37; z < 100; z += 3.7) {
      assert.equal(triangles.some(triangle => pointInPolygon([x, z], triangle)), isLandPoint(candidate, [x, z]), `${x},${z}`);
    }
  }
});

test('polygon water blocks movement and vegetation with shore padding even beneath a legacy river bridge', () => {
  const map = fixture();
  map.paths.push({ id: 'bridge', name: 'Legacy bridge', kind: 'bridge', width: 12, points: [[-30, 0], [30, 0]] });
  const spatial = createWorldSpatialModel(map);
  assert.equal(spatial.isLand(0, 0), false);
  assert.equal(spatial.isWater(0, 0), true);
  assert.equal(spatial.bridgeAt(0, 0), null);
  assert.equal(spatial.isLand(20, 0), false, 'water boundaries belong to the lagoon');
  assert.equal(spatial.isWater(20.4, 0), false);
  assert.equal(spatial.isWater(20.4, 0, .5), true);
  assert.equal(spatial.isWater(20.8, 0, .5), false);
  assert.ok(Math.abs(spatial.coast.closest(20.4, 0).distance - .4) < 1e-8);
  assert.ok(Math.abs(spatial.rawLand(20, 0) - .52) < 1e-8, 'inner banks use the same coast height as outer banks');
  assert.equal(spatial.waterAt(0, 0), null, 'the existing river-only projection API remains unchanged');
});

test('the runtime shore resolver stops sustained walking and forward rolls at every lagoon bank', () => {
  for (const reverse of [false, true]) {
    const map = fixture(); if (reverse) map.waterAreas[0].points.reverse();
    const spatial = createWorldSpatialModel(map);
    for (const speed of [5.6, ROLL_SPEED]) for (const [x, z, dx, dz] of [
      [-22, 0, 1, 0], [22, 0, -1, 0], [0, -42, 0, 1], [0, 42, 0, -1],
    ]) {
      const position = { x, z };
      // The live main loop caps dt at .1 s, including during the roll.
      for (let step = 0; step < 100; step++) {
        position.x += dx * speed * .1; position.z += dz * speed * .1;
        spatial.resolveShoreMovement(position, .42);
        assert.equal(spatial.isLand(position.x, position.z), true);
        assert.equal(spatial.isWater(position.x, position.z, .42), false);
      }
      assert.ok(Math.hypot(position.x - x, position.z - z) < 2, 'repeated movement cannot cross to the far bank');
    }
    const gate = { x: -30, z: -50 };
    for (let step = 0; step < 100; step++) {
      gate.x += .56; spatial.resolveShoreMovement(gate, .42);
    }
    assert.ok(gate.x > 20, 'dry land around a lagoon remains traversable');
  }
});
