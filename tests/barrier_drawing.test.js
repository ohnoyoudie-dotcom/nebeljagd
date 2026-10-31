import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifyBarrierPoints, nearestBarrier, barrierEraseHits } from '../src/map/barrier-drawing.js';
import { makeBarrier } from '../src/map/barriers.js';

const line = (id, points) => makeBarrier('wall', points, { id });

test('freehand simplification removes hand jitter while preserving endpoints and intentional corners', () => {
  const straight = [[0, 0], [1, .1], [2, -.1], [3, .15], [4, 0]];
  const before = structuredClone(straight);
  assert.deepEqual(simplifyBarrierPoints(straight, .6), [[0, 0], [4, 0]]);
  assert.deepEqual(straight, before);
  const corner = [[0, 0], [2, .1], [5, 0], [10, 0], [10.1, 3], [10, 7], [10, 10]];
  assert.deepEqual(simplifyBarrierPoints(corner, .6), [[0, 0], [10, 0], [10, 10]]);
});

test('simplification handles short strokes and closed routes without returning input references', () => {
  assert.deepEqual(simplifyBarrierPoints([]), []);
  const single = [[1, 2]], result = simplifyBarrierPoints(single);
  assert.deepEqual(result, single);
  assert.notEqual(result[0], single[0]);
  const loop = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
  assert.deepEqual(simplifyBarrierPoints(loop, .6), loop);
});

test('nearest route gives cumulative distance after a corner and projects onto a diagonal', () => {
  const route = line('bent', [[0, 0], [12, 16], [32, 16]]);
  const onSecond = nearestBarrier([route], [22, 17], 2);
  assert.equal(onSecond.barrier, route);
  assert.equal(onSecond.at, 30);
  assert.equal(onSecond.distance, 1);
  const diagonal = nearestBarrier([route], [6.8, 7.4], 2);
  assert.ok(Math.abs(diagonal.at - 10) < 1e-8);
  assert.ok(Math.abs(diagonal.distance - 1) < 1e-8);
  assert.equal(nearestBarrier([route], [50, 40], 1), null);
});

test('nearest route chooses the closest candidate and clamps the projected position at its end', () => {
  const farther = line('far', [[0, 5], [20, 5]]), near = line('near', [[0, 0], [20, 0]]);
  const hit = nearestBarrier([farther, near], [21, 0], 6);
  assert.equal(hit.barrier, near);
  assert.equal(hit.at, 20);
  assert.equal(hit.distance, 1);
  const start = nearestBarrier([near], [-1, 0], 1);
  assert.equal(start.at, 0);
});

test('swept eraser catches crossed walls even when both sampled endpoints are far away', () => {
  const crossing = line('crossing', [[0, -10], [0, 10]]);
  const far = line('far', [[30, -10], [30, 10]]);
  const before = JSON.stringify([crossing, far]);
  assert.deepEqual(barrierEraseHits([crossing, far], [-10, 0], [10, 0], .1), [crossing]);
  assert.equal(JSON.stringify([crossing, far]), before);
});

test('swept eraser includes radius contact, endpoint contact and stationary touches without false distant hits', () => {
  const wall = line('wall', [[0, 0], [10, 0]]);
  assert.deepEqual(barrierEraseHits([wall], [1, .5], [9, .5], .5), [wall]);
  assert.deepEqual(barrierEraseHits([wall], [1, .501], [9, .501], .5), []);
  assert.deepEqual(barrierEraseHits([wall], [-2, 0], [0, 0], 0), [wall]);
  assert.deepEqual(barrierEraseHits([wall], [5, .4], [5, .4], .5), [wall]);
  assert.deepEqual(barrierEraseHits([wall], [20, 20], [20, 20], .5), []);
});
