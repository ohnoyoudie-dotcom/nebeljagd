import test from 'node:test';
import assert from 'node:assert/strict';
import { houseFloorFactorAt } from '../src/map/house-floor.js';

const bounds = { minX: -32.2, maxX: 32.2, minZ: -20.8, maxZ: 20.4 };
const interior = { centerX: 0, entranceHalfWidth: 2.5 };
const entrances = [
  { side: 'south', min: -2.5, max: 2.5, innerBoundary: 20.4, boundary: 24.4, depth: 1.6 },
  { side: 'west', min: 2.1, max: 7.2, innerBoundary: -32.2, boundary: -33.5, depth: 1.6 },
];
const factor = (x, z) => houseFloorFactorAt(x, z, bounds, interior, entrances);

test('both the front and side castle portals smoothly approach the same floor height', () => {
  assert.equal(factor(0, 0), 1);
  assert.equal(factor(0, 24.4), 1);
  assert.equal(factor(0, 22.4), 1, 'The projecting front portal stays at indoor height');
  assert.equal(factor(20, 22.4), null, 'No invisible elevated floor across the outside facade');
  assert.ok(Math.abs(factor(0, 25.2) - .5) < 1e-10);
  assert.equal(factor(-33.5, 4.8), 1);
  assert.equal(factor(-33, 4.8), 1, 'The projecting side portal stays at indoor height');
  assert.equal(factor(-33, 12), null);
  assert.ok(Math.abs(factor(-34.3, 4.8) - .5) < 1e-10);
  assert.equal(factor(-35.2, 4.8), null);
  assert.equal(factor(0, 26.1), null);
  assert.equal(factor(-34.3, 9), null, 'No invisible ramp beside a solid side facade');
  assert.equal(factor(4, 25.2), null, 'No invisible ramp beside the front doorway');
});

test('the existing short front ramp is preserved for houses without explicit entrances', () => {
  assert.equal(houseFloorFactorAt(0, 20.4, bounds, interior), 1);
  assert.ok(Math.abs(houseFloorFactorAt(0, 20.8, bounds, interior) - .5) < 1e-10);
  assert.equal(houseFloorFactorAt(4, 20.8, bounds, interior), null);
  assert.equal(houseFloorFactorAt(-34, 4.8, bounds, interior), null);
});

test('entrance fractions survive world-to-local rotation and uniformly scaled buildings', () => {
  for (const [rotation, scale] of [[Math.PI / 4, 1.25], [Math.PI / 2, 3]]) {
    const c = Math.cos(rotation), s = Math.sin(rotation), origin = { x: 180, z: 150, y: 2 };
    for (const [x, z] of [[0, 25.2], [-34.3, 4.8]]) {
      const wx = origin.x + scale * (c * x + s * z), wz = origin.z + scale * (-s * x + c * z);
      const localX = (c * (wx - origin.x) - s * (wz - origin.z)) / scale;
      const localZ = (s * (wx - origin.x) + c * (wz - origin.z)) / scale;
      const elevation = origin.y + .42 * scale * factor(localX, localZ);
      assert.ok(Math.abs(elevation - (origin.y + .21 * scale)) < 1e-10);
    }
  }
});
