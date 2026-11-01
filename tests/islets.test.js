import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorldmapStats, isLandPoint, outerLandRings, waterBoundaryRings, landBoundaryRings, validateWorldmap } from '../src/map/model.js';
import { makeBarrier } from '../src/map/barriers.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { parseWorldDocument } from '../src/map/runtime-document.js';

const rectangle = (x1, z1, x2, z2) => [[x1, z1], [x2, z1], [x2, z2], [x1, z2]];
const polygon = (id, points) => ({ id, name: id, points });
function fixture() {
  const mainland = rectangle(-100, -60, -20, 60);
  return {
    schemaVersion: 1, id: 'split-island-test', name: 'Getrennte Landflächen',
    coordinateSystem: { units: 'meters', north: '-z', horizontalAxes: ['x', 'z'], metersPerUnit: 1 },
    bounds: { minX: -150, minZ: -150, maxX: 180, maxZ: 150 },
    gameplay: { targetPlayers: 1, walkSpeedMetersPerSecond: 5, spawnPosition: [-50, 0] },
    island: polygon('mainland', mainland),
    regions: [{ id: 'region', name: 'Wald', biome: 'forest', color: '#558844', points: rectangle(-100, -60, 140, 60), label: [-50, 0] }],
    paths: [], rivers: [], places: [], objects: [], barriers: [],
    spawnAreas: [{ id: 'spawn', name: 'Start', position: [-50, 0], radius: 5, capacity: 1 }],
    zone: { center: [-50, 0], initialRadius: 250, damagePerSecond: 1,
      phases: [{ id: 'phase', name: 'Nebel', holdSeconds: 120, shrinkSeconds: 120, radius: 20 }] },
  };
}
function splitFixture() {
  return { ...fixture(), islets: [polygon('east', rectangle(20, -40, 100, 40))] };
}

test('legacy islands remain unchanged and separated land is optional without inferred connecting ground', () => {
  const legacy = fixture(), before = structuredClone(legacy);
  assert.deepEqual(validateWorldmap(legacy), { valid: true, errors: [], warnings: [] });
  assert.deepEqual(normalizeWorldmap(legacy), before);
  assert.equal(Object.hasOwn(parseWorldDocument(JSON.stringify(legacy)), 'islets'), false);
  assert.deepEqual(outerLandRings(legacy), [legacy.island.points]);
  assert.deepEqual(waterBoundaryRings(legacy), []);
  assert.equal(getWorldmapStats(legacy).landAreaM2, 9600);
  const map = splitFixture(), snapshot = structuredClone(map);
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  assert.equal(isLandPoint(map, [-50, 0]), true);
  assert.equal(isLandPoint(map, [50, 0]), true);
  assert.equal(isLandPoint(map, [20, 0]), true, 'the islet shoreline is terrain');
  assert.equal(isLandPoint(map, [0, 0]), false, 'there is real empty space between islands');
  assert.equal(isLandPoint(map, [120, 0]), false);
  const stats = getWorldmapStats(map);
  assert.equal(stats.landAreaM2, 16000);
  assert.equal(stats.widthM, 200);
  assert.equal(stats.heightM, 120);
  assert.deepEqual(landBoundaryRings(map), [map.island.points, map.islets[0].points]);
  assert.deepEqual(parseWorldDocument(JSON.stringify(map)), snapshot);
  assert.deepEqual(map, snapshot, 'validation and queries never rewrite stored geometry');
});

test('water holes belong to a single land component and are subtracted once from combined land', () => {
  for (const reversed of [false, true]) {
    const map = splitFixture();
    map.waterAreas = [polygon('west-lake', rectangle(-85, -20, -65, 20)), polygon('east-lake', rectangle(60, -10, 80, 10))];
    if (reversed) for (const item of [map.island, ...map.islets, ...map.waterAreas]) {
      item.points.reverse(); item.points.push([...item.points[0]]);
    }
    assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
    assert.equal(getWorldmapStats(map).landAreaM2, 14800);
    assert.equal(outerLandRings(map).length, 2);
    assert.equal(waterBoundaryRings(map).length, 2);
    assert.equal(landBoundaryRings(map).length, 4);
    assert.equal(isLandPoint(map, [-75, 0]), false);
    assert.equal(isLandPoint(map, [70, 0]), false);
    assert.equal(isLandPoint(map, [60, 0]), false, 'water-hole edges remain water');
    assert.equal(isLandPoint(map, [50, 0]), true);
  }
  for (const points of [rectangle(-25, -10, 25, 10), rectangle(0, -10, 25, 10), rectangle(20, -10, 40, 10)]) {
    const map = splitFixture(); map.waterAreas = [polygon('bad-lake', points)];
    assert.equal(validateWorldmap(map).valid, false, 'holes cannot cross an empty gap or touch an exterior shore');
  }
});

test('malformed, overlapping, touching and nested islets are rejected without throwing', () => {
  const mutations = [
    map => { map.islets = null; },
    map => { map.islets = {}; },
    map => { map.islets = Array(51).fill(polygon('east', rectangle(20, -40, 100, 40))); },
    map => { map.islets = [null]; },
    map => { map.islets[0].id = 'mainland'; },
    map => { map.islets[0].points = [[20, 0], [30, 0]]; },
    map => { map.islets[0].points = [[20, 0], [30, NaN], [40, 10]]; },
    map => { map.islets[0].points = [[20, -40], [100, 40], [20, 40], [100, -40]]; },
    map => { map.islets[0].points = rectangle(20, -40, 181, 40); },
    map => { map.islets[0].points = rectangle(-40, -40, 100, 40); },
    map => { map.islets[0].points = rectangle(-20, -40, 100, 40); },
    map => { map.islets[0].points = [[-20, 60], [0, 80], [10, 60]]; },
    map => { map.islets[0].points = rectangle(-80, -30, -40, 30); },
    map => { map.islets[0].points = rectangle(-120, -80, 120, 80); },
    map => { map.islets.push(polygon('overlap', rectangle(80, -30, 120, 30))); },
    map => { map.islets.push(polygon('touch', rectangle(100, -30, 140, 30))); },
    map => { map.islets.push(polygon('nested', rectangle(40, -20, 80, 20))); },
  ];
  for (const mutate of mutations) {
    const map = splitFixture(); mutate(map);
    assert.equal(validateWorldmap(map).valid, false, JSON.stringify(map.islets));
  }
  const map = splitFixture();
  map.islets.push(polygon('separate', rectangle(120, -20, 140, 20)));
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
});

test('starts, placements and barriers can occupy secondary islands but cannot cross the empty gap', () => {
  const map = splitFixture();
  map.gameplay.spawnPosition = [50, 0]; map.spawnAreas[0].position = [50, 0]; map.zone.center = [50, 0];
  map.places = [{ id: 'east-marker', name: 'Ost', kind: 'landmark', position: [70, 20] }];
  map.objects = [makeWorldObject('chest', [70, -20], { id: 'east-chest', variant: 'kit-tripo-chest' })];
  map.barriers = [makeBarrier('wall', [[30, -25], [80, -25]], { id: 'east-wall' })];
  assert.deepEqual(validateWorldmap(map), { valid: true, errors: [], warnings: [] });
  for (const mutate of [
    candidate => { candidate.gameplay.spawnPosition = [0, 0]; },
    candidate => { candidate.zone.center = [0, 0]; },
    candidate => { candidate.places[0].position = [0, 0]; },
    candidate => { candidate.objects[0].position = [0, 0]; },
    candidate => { candidate.spawnAreas[0].position = [0, 0]; },
    candidate => { candidate.spawnAreas[0].position = [24, 0]; },
    candidate => { candidate.barriers[0].points = [[-50, 25], [50, 25]]; },
  ]) {
    const candidate = structuredClone(map); mutate(candidate);
    assert.equal(validateWorldmap(candidate).valid, false);
  }
  const tangent = structuredClone(map); tangent.spawnAreas[0].position = [25, 0];
  assert.equal(validateWorldmap(tangent).valid, true, 'a circle may remain tangent to a dry outer shore');
});

test('fog coverage warnings inspect every land component without treating a bridge as terrain', () => {
  const map = splitFixture(); map.zone.initialRadius = 100;
  assert.equal(validateWorldmap(fixture()).warnings.length, 0);
  assert.ok(validateWorldmap(map).warnings.some(message => /bereits am Anfang im Nebel/.test(message)));
  map.paths = [{ id: 'gap-bridge', name: 'Brücke über freie Lücke', kind: 'bridge', width: 8, points: [[-30, 0], [30, 0]] }];
  assert.equal(validateWorldmap(map).valid, true, 'a bridge route can span the gap without river data');
  assert.equal(isLandPoint(map, [0, 0]), false, 'walkable deck surfaces do not become terrain');
});
