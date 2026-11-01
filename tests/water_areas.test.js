import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorldmapStats, isLandPoint, landBoundaryRings, validateWorldmap } from '../src/map/model.js';
import { makeBarrier } from '../src/map/barriers.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';

const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
const rectangle = (x1, z1, x2, z2) => [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
const area = (points = rectangle(10, -30, 30, 30), id = 'lagoon') => ({ id, name: 'Lagune', points });
function fixture() {
  return {
    schemaVersion: 1, id: 'water-test-map', name: 'Wasserflächen-Test',
    coordinateSystem: { units: 'meters', north: '-z', horizontalAxes: ['x', 'z'], metersPerUnit: 1 },
    bounds: { minX: -150, minZ: -150, maxX: 150, maxZ: 150 },
    gameplay: { targetPlayers: 1, walkSpeedMetersPerSecond: 5, spawnPosition: [-50, 0] },
    island: { id: 'island', name: 'Insel', points: square },
    regions: [{ id: 'region', name: 'Wiese', biome: 'meadow', color: '#558844', points: square, label: [-50, 0] }],
    paths: [], rivers: [], places: [], objects: [], barriers: [],
    spawnAreas: [{ id: 'spawn', name: 'Start', position: [-50, 0], radius: 5, capacity: 1 }],
    zone: { center: [0, 0], initialRadius: 200, damagePerSecond: 1,
      phases: [{ id: 'phase', name: 'Nebel', holdSeconds: 120, shrinkSeconds: 120, radius: 20 }] },
  };
}

test('water areas remain optional and legacy normalization never invents or removes geometry', () => {
  const legacy = fixture(), snapshot = structuredClone(legacy);
  assert.deepEqual(validateWorldmap(legacy), { valid: true, errors: [], warnings: [] });
  assert.deepEqual(normalizeWorldmap(legacy), snapshot);
  assert.equal(Object.hasOwn(normalizeWorldmap(legacy), 'waterAreas'), false);
  assert.equal(getWorldmapStats(legacy).landAreaM2, 40000);
  assert.deepEqual(landBoundaryRings(legacy), [square]);
  assert.equal(isLandPoint(legacy, [20, 0]), true);
  const empty = { ...legacy, waterAreas: [] };
  assert.deepEqual(validateWorldmap(empty), { valid: true, errors: [], warnings: [] });
  assert.equal(getWorldmapStats(empty).landAreaM2, 40000);
  assert.deepEqual(legacy, snapshot);
});

test('inland water is subtracted from land including its shoreline, independent of winding or closed rings', () => {
  for (const points of [rectangle(10, -30, 30, 30), rectangle(10, -30, 30, 30).reverse(),
    [...rectangle(10, -30, 30, 30), [10, -30]]]) {
    const map = { ...fixture(), waterAreas: [area(points)] }, before = structuredClone(map);
    assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
    assert.equal(getWorldmapStats(map).landAreaM2, 38800);
    assert.deepEqual(landBoundaryRings(map), [square, points]);
    assert.equal(isLandPoint(map, [20, 0]), false);
    assert.equal(isLandPoint(map, [10, 0]), false);
    assert.equal(isLandPoint(map, [10, -30]), false);
    assert.equal(isLandPoint(map, [9, 0]), true);
    assert.equal(isLandPoint(map, [100, 0]), true, 'outer shoreline keeps legacy semantics');
    assert.equal(isLandPoint(map, [101, 0]), false);
    assert.deepEqual(normalizeWorldmap(map), before);
    assert.deepEqual(map, before);
  }
});

test('malformed, crossing, tangent, overlapping and nested water polygons are rejected without throwing', () => {
  const mutations = [
    map => { map.waterAreas = null; },
    map => { map.waterAreas = {}; },
    map => { map.waterAreas = Array(51).fill(area()); },
    map => { map.waterAreas = [null]; },
    map => { map.waterAreas = [area([[10, -30], [20, 0]])]; },
    map => { map.waterAreas = [area([[10, -30], [NaN, 30], [30, 0]])]; },
    map => { map.waterAreas = [area([[10, -30], [30, 30], [10, 30], [30, -30]])]; },
    map => { map.waterAreas = [area(rectangle(90, -30, 110, 30))]; },
    map => { map.waterAreas = [area(rectangle(70, -30, 100, 30))]; },
    map => { map.waterAreas = [area([[90, -10], [100, 0], [90, 10]])]; },
    map => { map.waterAreas = [area(undefined, 'island')]; },
    map => { map.waterAreas = [area(), area(rectangle(25, -40, 45, 20), 'overlap')]; },
    map => { map.waterAreas = [area(), area(rectangle(30, -20, 45, 20), 'edge-touch')]; },
    map => { map.waterAreas = [area(), area(rectangle(30, 30, 40, 40), 'corner-touch')]; },
    map => { map.waterAreas = [area(), area(rectangle(15, -10, 25, 10), 'nested')]; },
    map => { map.waterAreas = [area(rectangle(15, -10, 25, 10), 'nested'), area()]; },
    map => { map.waterAreas = [area(rectangle(-110, -110, 110, 110))]; },
  ];
  for (const mutate of mutations) {
    const map = fixture(); mutate(map);
    const result = validateWorldmap(map);
    assert.equal(result.valid, false, JSON.stringify(map.waterAreas));
    assert.ok(result.errors.some(error => /Wasserfl|waterAreas|mehrfach/.test(error)), result.errors.join('\n'));
  }
  const concave = fixture();
  concave.island.points = [[-100, -100], [100, -100], [100, 100], [40, 100], [40, -10], [10, -10], [10, 100], [-100, 100]];
  concave.waterAreas = [area(rectangle(-20, 20, 70, 40))];
  assert.equal(validateWorldmap(concave).valid, false, 'vertices inside alone cannot permit an edge across an external bay');
});

test('each explicit placement and whole start circle must avoid inland water', () => {
  const mutations = [
    map => { map.gameplay.spawnPosition = [20, 0]; },
    map => { map.zone.center = [20, 0]; },
    map => { map.places = [{ id: 'place', name: 'Ort', kind: 'landmark', position: [20, 0] }]; },
    map => { map.objects = [makeWorldObject('chest', [20, 0], { id: 'test-chest', variant: 'kit-tripo-chest' })]; },
    map => { map.spawnAreas[0].position = [20, 0]; },
    map => { map.spawnAreas[0].position = [7, 0]; },
    map => { map.spawnAreas[0].position = [5, 0]; },
  ];
  for (const mutate of mutations) {
    const map = { ...fixture(), waterAreas: [area()] }; mutate(map);
    assert.equal(validateWorldmap(map).valid, false);
  }
  const map = { ...fixture(), waterAreas: [area()] };
  map.spawnAreas[0].position = [4, 0];
  assert.equal(validateWorldmap(map).valid, true);
});

test('barrier validation detects crossing or touching a water hole even with both endpoints on land', () => {
  for (const points of [[[-20, 0], [50, 0]], [[-20, -30], [50, -30]], [[0, -40], [20, -20]]]) {
    const map = { ...fixture(), waterAreas: [area()], barriers: [makeBarrier('wall', points, { id: 'crossing-wall' })] };
    assert.ok(validateWorldmap(map).errors.some(error => /Strecke.*außerhalb der Wasserflächen/.test(error)), JSON.stringify(points));
  }
  const map = { ...fixture(), waterAreas: [area()], barriers: [makeBarrier('wall', [[-20, -31], [50, -31]], { id: 'dry-wall' })] };
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  map.barriers[0].points = [[-20, 0], [50, 0]];
  map.barriers[0].gaps = [{ at: 40, width: 25 }];
  assert.equal(validateWorldmap(map).valid, false, 'a barrier gap is not a bridge over a lake');
});
