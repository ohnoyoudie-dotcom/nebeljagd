import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildBorderStonePlacements, paintedPathCoverage, createPathBorderStones, BORDER_STONE_RULES } from '../src/path-border-stones.js';
import { createTerrainPaintIndex } from '../src/map/terrain-paint.js';

const stamp = (x, z, type = 'cobble', radius = 2.5) => ({ position: [x, z], radius, strength: 1, hardness: .72, seed: 1, type });
const path = (kind = 'main', z = 0, length = 100) => ({ kind, width: 4, points: [[0, z], [length, z]] });
const distanceToRoute = (point, route) => {
  let distance = Infinity;
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point.x - a[0]) * dx + (point.z - a[1]) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(point.x - a[0] - dx * t, point.z - a[1] - dz * t));
  }
  return distance;
};

test('overlapping painted strokes retain one exterior border, without mutating or reshuffling the map', () => {
  const map = { paths: [], landscape: { terrain: Array.from({ length: 24 }, (_, i) => stamp(0, i * .8)) } };
  const before = JSON.stringify(map), index = createTerrainPaintIndex(map), stones = buildBorderStonePlacements(map, index);
  assert.ok(stones.length > 15, 'a surviving broken border is still visible');
  assert.deepEqual(stones, buildBorderStonePlacements(map));
  assert.equal(JSON.stringify(map), before);
  for (const p of stones) {
    assert.ok(Math.abs(paintedPathCoverage(index, p.contourX, p.contourZ) - .5) < .16,
      'the nominal border follows the union contour');
    assert.ok(Math.hypot(p.x - p.contourX, p.z - p.contourZ) < .7, 'variation stays on the path shoulder');
    if (p.z > 1 && p.z < 16) assert.ok(Math.abs(p.x) > 1.5, 'overlapping stamp interiors remain clear');
  }
  map.landscape.terrain.push(stamp(0, 8, 'meadow', 35));
  assert.equal(buildBorderStonePlacements(map).length, 0, 'newer grass covers the old path and its border');
});

test('worn borders have clustered missing sections and substantially different stone silhouettes', () => {
  const diagnostics = {};
  const stones = buildBorderStonePlacements({ paths: [path()] }, undefined, diagnostics);
  assert.ok(stones.length > 50);
  const contours = new Map();
  for (const stone of stones) {
    if (!contours.has(stone.contourId)) contours.set(stone.contourId, []);
    contours.get(stone.contourId).push(stone);
  }
  assert.equal(contours.size, 2, 'both shoulders have their own broken border');
  for (const contour of contours.values()) {
    contour.sort((a, b) => a.along - b.along);
    const gaps = contour.slice(1).map((stone, i) => stone.along - contour[i].along - (stone.length + contour[i].length) / 2);
    assert.ok(gaps.filter(gap => gap > 1).length >= 3, 'several full sections are missing, rather than uniform joint spacing');
    assert.ok(gaps.filter(gap => gap < .35).length >= 6, 'remaining stones survive in groups');
  }
  assert.ok(Math.max(...stones.map(p => p.length)) / Math.min(...stones.map(p => p.length)) > 2);
  assert.ok(Math.max(...stones.map(p => p.width)) / Math.min(...stones.map(p => p.width)) > 2);
  assert.equal(new Set(stones.map(p => p.shape)).size, 3);
  assert.ok(Math.max(...stones.map(p => p.direction)) - Math.min(...stones.map(p => p.direction)) > .5,
    'individual stones turn independently of the straight path');
  const offsets = stones.map(p => p.z - p.contourZ);
  assert.ok(Math.max(...offsets) - Math.min(...offsets) > .15, 'the edge is not a mechanically straight row');
  assert.ok(diagnostics.gapCount >= 6);
  assert.ok(diagnostics.gaps.length <= 120, 'inspection data has a bounded size');
  for (const gap of diagnostics.gaps) for (const stone of contours.get(gap.contourId) ?? []) {
    assert.ok(stone.along + stone.length / 2 <= gap.start || stone.along - stone.length / 2 >= gap.end,
      'reported missing sections are real gaps in the placement geometry');
  }
});

test('different painted path materials share their outer contour and leave crossings open', () => {
  const terrain = [];
  for (let coordinate = -14; coordinate <= 14; coordinate += .8) {
    terrain.push(stamp(coordinate, 0, 'earth'));
    terrain.push(stamp(0, coordinate, 'cobble'));
  }
  const map = { paths: [], landscape: { terrain } }, index = createTerrainPaintIndex(map);
  const stones = buildBorderStonePlacements(map, index);
  assert.ok(stones.some(p => p.style === 'earth'));
  assert.ok(stones.some(p => p.style === 'cobble'));
  for (const stone of stones) {
    assert.ok(!(Math.abs(stone.x) < 1.7 && Math.abs(stone.z) < 1.7), 'no material seam crosses the shared interior');
    assert.ok(Math.abs(paintedPathCoverage(index, stone.contourX, stone.contourZ, null) - .5) < .16);
  }
  assert.ok(paintedPathCoverage(index, 0, 0, null) > .99);
  assert.ok(paintedPathCoverage(index, 8, 0, 'earth') > .99);
  assert.ok(paintedPathCoverage(index, 0, 8) > .99, 'legacy default coverage remains cobble-specific');
});

test('path types receive distinct sparse themes while ordinary soft natural ground stays unbordered', () => {
  const styles = ['cobble', 'earth', 'forest', 'sand', 'stone', 'mud', 'snow', 'rock'];
  const terrain = styles.flatMap((type, row) => Array.from({ length: 40 }, (_, i) => stamp(i * .8, row * 12, type)));
  const stones = buildBorderStonePlacements({ paths: [], landscape: { terrain } });
  assert.deepEqual([...new Set(stones.map(p => p.style))].sort(), [...styles].sort());
  const averageHeight = type => {
    const group = stones.filter(p => p.style === type);
    assert.ok(group.length >= 5, `${type} has visible surviving edge details`);
    return group.reduce((sum, p) => sum + p.height, 0) / group.length;
  };
  assert.ok(averageHeight('cobble') > averageHeight('mud') * 1.25, 'marsh pebbles are lower than surviving main-road stones');
  assert.ok(averageHeight('cobble') > averageHeight('snow') * 1.25, 'snow stones look embedded rather than like a curb');
  const softGround = styles.filter(type => type !== 'cobble').map((type, i) => ({ ...stamp(i * 70, 0, type, 30), hardness: .3, strength: .8 }));
  assert.deepEqual(buildBorderStonePlacements({ paths: [], landscape: { terrain: softGround } }), [],
    'biome ground must not gain a stone fence');
  const routes = buildBorderStonePlacements({ paths: [path('trail')] });
  assert.ok(routes.length > 10);
  assert.ok(routes.every(p => p.style === 'earth'));
});

test('route borders follow bends and leave all road and bridge junctions clear', () => {
  const routes = [
    { kind: 'main', width: 4, points: [[-22, 0], [0, 0], [22, 6]] },
    { kind: 'trail', width: 4, points: [[0, -22], [0, 22]] },
    { kind: 'bridge', width: 5, points: [[13, -12], [13, 12]] },
  ];
  const stones = buildBorderStonePlacements({ paths: routes });
  assert.ok(stones.length > 30);
  assert.ok(stones.every(p => Number.isFinite(p.direction) && p.width > 0 && p.height > 0));
  assert.ok(stones.every(p => !(Math.abs(p.x) < 1.7 && Math.abs(p.z) < 1.7)), 'crossing interior stays open');
  assert.ok(stones.every(p => distanceToRoute(p, routes[2]) >= routes[2].width / 2 - .15),
    'no stones cross bridge approaches or deck');
  assert.deepEqual(buildBorderStonePlacements({ paths: routes.map(p => ({ ...p, kind: 'bridge' })) }), []);
});

test('all border themes share the fixed global geometry budget', () => {
  const stones = buildBorderStonePlacements({ paths: [path('main', 0, 10000), path('trail', 20, 10000)] });
  assert.equal(stones.length, BORDER_STONE_RULES.maximum);
  assert.ok(stones.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
});

test('stone instances align with actual sloping ground, filter water, cull and dispose once', () => {
  const root = new THREE.Group(), heightAt = (x, z) => 3 + x * .11 - z * .07;
  const map = { paths: [path('main', 0, 40)] };
  const stones = createPathBorderStones(root, map, heightAt, (x, z) => x < 25 && z > 0);
  assert.ok(stones.stats.count > 8);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  const expectedNormal = new THREE.Vector3(-.11, 1, .07).normalize();
  let instances = 0;
  const geometries = new Set(), materials = new Set();
  for (const mesh of root.children) {
    instances += mesh.count;
    geometries.add(mesh.geometry); materials.add(mesh.material);
    assert.ok(mesh.boundingBox && mesh.boundingSphere);
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); matrix.decompose(position, quaternion, scale);
      assert.ok(position.x < 25 && position.z > 0, 'water/land filtering happens before rendering');
      assert.ok(Math.abs(position.y - heightAt(position.x, position.z)) < .06, 'the center rests at the sampled terrain height');
      assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).dot(expectedNormal) > .985,
        'each stone follows the slope instead of floating level');
    }
  }
  assert.equal(instances, stones.stats.count);
  assert.equal(stones.stats.batches, root.children.length);
  assert.ok(stones.stats.batches <= stones.stats.chunks * 3, 'shape variation stays within three instanced batches per chunk');
  assert.equal(stones.stats.byStyle.cobble.count, instances);
  assert.ok(stones.stats.byStyle.cobble.minLength > 0 && stones.stats.byStyle.cobble.maxLength > stones.stats.byStyle.cobble.minLength);
  assert.ok(stones.stats.samples.length <= 12, 'inspection remains bounded per style');
  stones.update({ x: 1000, z: 1000 }); assert.equal(stones.stats.visibleChunks, 0);
  stones.update({ x: 0, z: 0 }); assert.ok(stones.stats.visibleChunks > 0);
  let geometryDisposals = 0, materialDisposals = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of materials) material.addEventListener('dispose', () => materialDisposals++);
  stones.dispose();
  assert.equal(root.children.length, 0);
  assert.equal(geometryDisposals, geometries.size);
  assert.equal(materialDisposals, materials.size);
});
