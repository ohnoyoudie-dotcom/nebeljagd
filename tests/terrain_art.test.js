import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { terrainPalette, cobbleCells } from '../src/terrain-art.js';

test('woodland colours become greener while non-green biomes and authored variations remain distinct', () => {
  const source = new THREE.Color('#80a66a');
  const meadow = terrainPalette('meadow', '#80a66a');
  assert.ok(meadow.g / meadow.r > source.g / source.r);
  assert.ok(meadow.b / meadow.r > source.b / source.r, 'cooler green rather than yellow olive');
  for (const biome of ['snow', 'heath', 'volcanic', 'dunes']) {
    assert.deepEqual(terrainPalette(biome, '#aabbcc'), new THREE.Color('#aabbcc'));
  }
  assert.notDeepEqual(terrainPalette('meadow', '#80a66a'), terrainPalette('meadow', '#a9b675'), 'editor colour still affects the material');
  assert.notDeepEqual(terrainPalette('forest', '#4c8065'), meadow);
});

test('paving pattern is deterministic, irregular and covers each row without extra world geometry', () => {
  const cells = cobbleCells();
  assert.deepEqual(cobbleCells(), cells);
  assert.notDeepEqual(cobbleCells(7111), cells);
  assert.equal(cells.length, 25);
  assert.equal(new Set(cells.map(cell => cell.cy)).size, 25, 'rows are deliberately staggered and jittered');
  for (const cell of cells) {
    assert.ok(cell.points.length >= 3 && cell.points.length <= 10);
    assert.ok(cell.points.flat().every(Number.isFinite));
    assert.ok(cell.tint >= .79 && cell.tint <= 1.02);
    let area = 0;
    for (let i = 0; i < cell.points.length; i++) {
      const a = cell.points[i], b = cell.points[(i + 1) % cell.points.length];
      area += a[0] * b[1] - b[0] * a[1];
    }
    assert.ok(area > .02 && area < .12, 'each irregular stone has useful footprint');
  }
});
