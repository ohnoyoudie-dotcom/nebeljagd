import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyMap } from '../src/lobby-map.js';
import { validateWorldmap, isLandPoint } from '../src/map/model.js';
import { getObjectFootprintRadius, isObjectAvailable } from '../src/map/objects.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

test('practice meadow is a complete, valid, independent runtime document', () => {
  const first = createLobbyMap(), expected = createLobbyMap();
  assert.deepEqual(validateWorldmap(first), { valid: true, errors: [], warnings: [] });
  assert.equal(first.bounds.maxX - first.bounds.minX, 120);
  assert.equal(first.bounds.maxZ - first.bounds.minZ, 120);
  first.objects[0].position[0] = 500;
  first.island.points[0][0] = 500;
  first.gameplay.spawnPosition[0] = 500;
  assert.deepEqual(createLobbyMap(), expected);
  assert.notDeepEqual(first.island.points, first.regions[0].points);
});

test('practice meadow offers all imported weapons and ample approved props without blocking the start', () => {
  const map = createLobbyMap(), spawn = map.gameplay.spawnPosition;
  assert.ok(map.objects.length >= 35);
  const positions = new Set(map.objects.map(object => object.position.join(',')));
  assert.equal(positions.size, map.objects.length);
  for (const [kind, variant] of [['sword', 'kit-tripo-sword'], ['iceStaff', 'kit-tripo-crystal-staff'], ['fireStaff', 'kit-tripo-lava-staff']]) {
    assert.ok(map.objects.some(object => object.kind === kind && object.variant === variant
      && Math.hypot(object.position[0] - spawn[0], object.position[1] - spawn[1]) <= 6));
  }
  assert.ok(map.objects.filter(object => object.kind === 'chest').length >= 5);
  for (const object of map.objects) {
    assert.ok(isObjectAvailable(object.kind, object.variant), `${object.id} must use an approved asset`);
    assert.ok(isLandPoint(map, object.position), `${object.id} must be on land`);
    assert.ok(Math.hypot(object.position[0] - spawn[0], object.position[1] - spawn[1])
      > getObjectFootprintRadius(object.kind, object.variant) * object.scale + 2, `${object.id} blocks the starting area`);
  }
});

test('practice terrain and training sites stay dry, green and gently graded', () => {
  const map = createLobbyMap(), spatial = createWorldSpatialModel(map);
  assert.deepEqual(map.rivers, []);
  const heights = [];
  for (let x = -45; x <= 45; x += 5) for (let z = -45; z <= 45; z += 5) {
    assert.equal(spatial.isWater(x, z), false);
    assert.equal(spatial.biomeAt(x, z), 'meadow');
    heights.push(spatial.groundAt(x, z));
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) < 1.5);
  for (const [dx, dz] of [[-5, 9], [5, 12], [12, 4]]) {
    const site = [map.gameplay.spawnPosition[0] + dx, map.gameplay.spawnPosition[1] + dz];
    assert.equal(spatial.isWater(...site), false);
    for (const object of map.objects) assert.ok(Math.hypot(object.position[0] - site[0], object.position[1] - site[1])
      > getObjectFootprintRadius(object.kind, object.variant) * object.scale + 2, `${object.id} crowds a practice actor`);
  }
  assert.equal(map.zone.damagePerSecond, 0);
  assert.ok(map.zone.phases.every(phase => phase.radius > Math.hypot(60, 60)));
});
