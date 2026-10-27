import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { TERRAIN_TYPES, ensureLandscape, terrainSettings } from '../src/map/landscape.js';
import { createTerrainPaintIndex, terrainStampWeight, sampleTerrainPaint, applyTerrainPaint, terrainSurfaceDetail } from '../src/map/terrain-paint.js';
import { bakeTerrainPaint, terrainPaintTextureSize, TERRAIN_PAINT_BUDGET } from '../src/terrain-paint-renderer.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

const baseMap = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const stamp = (options = {}) => ({ id: 'paint-test', name: 'Bodentest', ...terrainSettings('sand'),
  position: [30, -42], radius: 8, hardness: .2, strength: 1, seed: 19, ...options });

test('soft paint has an irregular smooth shoulder while hard paint remains within its radius', () => {
  const soft = stamp(), hard = stamp({ hardness: 1 });
  assert.equal(terrainStampWeight(soft, 30, -42), 1);
  assert.ok(terrainStampWeight(soft, 35, -42) < terrainStampWeight(hard, 35, -42));
  for (const source of [soft, hard]) {
    assert.equal(terrainStampWeight(source, 38, -42), 0);
    assert.equal(terrainStampWeight(source, 42, -42), 0);
  }
  const around = Array.from({ length: 16 }, (_, i) => terrainStampWeight(soft, 30 + Math.cos(i) * 7, -42 + Math.sin(i) * 7));
  assert.ok(Math.max(...around) - Math.min(...around) > .005);
  assert.equal(terrainStampWeight(stamp({ strength: 0 }), 30, -42), 0);
});

test('paint index preserves ordering and vegetation samples the same blended ground palette', () => {
  const first = stamp({ color: '#aa7733', strength: .5, variation: 0 });
  const second = stamp({ id: 'paint-top', color: '#445566', strength: .25, variation: 0 });
  const distant = stamp({ id: 'paint-far', position: [400, 400] });
  const index = createTerrainPaintIndex([first, second, distant]);
  assert.deepEqual(index.near(30, -42).map(item => item.id), ['paint-test', 'paint-top']);
  assert.deepEqual(index.overlapping({ minX: 29, maxX: 31, minZ: -43, maxZ: -41 }).map(item => item.id), ['paint-test', 'paint-top']);
  const result = sampleTerrainPaint(index, 30, -42), a = new THREE.Color(first.color), b = new THREE.Color(second.color);
  assert.equal(result.alpha, .625);
  for (const channel of ['r', 'g', 'b']) assert.ok(Math.abs(result[channel] - (a[channel] * .5 * .75 + b[channel] * .25) / .625) < 1e-7);
  const original = new THREE.Color('#447744'), expected = original.clone().lerp(new THREE.Color(result.r, result.g, result.b), result.alpha);
  assert.equal(applyTerrainPaint(index, 30, -42, original), original);
  assert.deepEqual(original.toArray(), expected.toArray());
});

test('all nine painted soils retain editable colours, distinguishable details and tiny curved footprints', () => {
  const colors = new Set(), surfaces = new Set();
  for (const type of TERRAIN_TYPES) {
    const index = createTerrainPaintIndex([stamp({ ...terrainSettings(type.id), radius: .5, strength: 1, variation: 0 })]);
    colors.add(sampleTerrainPaint(index, 30, -42).r.toFixed(5));
    surfaces.add(terrainSurfaceDetail(type.id, 30.25, -41.75).toFixed(5));
    const bytes = bakeTerrainPaint(index, { minX: 29, maxX: 31, minZ: -43, maxZ: -41 }, 32, 32);
    const alpha = bytes.filter((_, i) => i % 4 === 3);
    assert.ok(alpha.some(value => value > 200), type.id);
    assert.ok(alpha.some(value => value > 0 && value < 200), type.id);
    assert.equal(alpha[0], 0); assert.equal(alpha.at(-1), 0);
  }
  assert.equal(colors.size, 9); assert.equal(surfaces.size, 9);
});

test('paint changes ground colour without changing coast, river, bridge or house heights', () => {
  const map = structuredClone(baseMap), beforeObjects = JSON.stringify(map.objects);
  ensureLandscape(map).terrain.push(stamp({ color: '#b7a27a', variation: 0 }));
  const before = createWorldSpatialModel(baseMap), after = createWorldSpatialModel(map);
  assert.notDeepEqual(before.colorAt(30, -42).toArray(), after.colorAt(30, -42).toArray());
  assert.deepEqual(before.colorAt(100, 100).toArray(), after.colorAt(100, 100).toArray());
  for (const [x, z] of [[30, -42], [30, -60], [35, -60], [-60, -215], [0, 0], [-599, -719]]) {
    assert.equal(after.groundAt(x, z), before.groundAt(x, z));
    assert.equal(after.isLand(x, z), before.isLand(x, z));
    assert.equal(after.isWater(x, z), before.isWater(x, z));
    assert.deepEqual(after.bridgeAt(x, z), before.bridgeAt(x, z));
  }
  assert.equal(JSON.stringify(map.objects), beforeObjects);
  assert.deepEqual(after.baseColorAt(30, -42).toArray(), before.baseColorAt(30, -42).toArray());
});

test('paint tiles stay within quality and memory budgets instead of allocating an island-sized texture', () => {
  const bounds = { minX: -4, maxX: 75, minZ: -5, maxZ: 74 };
  for (const quality of ['low', 'high']) for (const visible of [1, 16, 64, 256]) {
    const result = terrainPaintTextureSize(bounds, quality, TERRAIN_PAINT_BUDGET[quality] / visible);
    assert.ok(result.bytes * visible <= TERRAIN_PAINT_BUDGET[quality]);
    assert.ok(result.width <= (quality === 'low' ? 256 : 512));
    assert.ok(result.height <= (quality === 'low' ? 256 : 512));
  }
});
