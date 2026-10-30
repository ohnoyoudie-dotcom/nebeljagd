import test from 'node:test';
import assert from 'node:assert/strict';
import { emitTerrainTriangles } from '../src/terrain-triangulation.js';

const vertex = (x, z) => ({ x, z, y: x * x + z * z, color: [x / 4, z / 4, .5] });
const source = () => {
  const a = vertex(0, 0), b = vertex(4, 0), c = vertex(4, 4), d = vertex(0, 4);
  return [[a, b, c], [a, c, d]];
};
const area = ([a, b, c]) => ((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
const pointKey = p => `${p.x.toFixed(8)},${p.z.toFixed(8)}`;
function edgesOf(triangles) {
  const edges = new Map();
  for (const triangle of triangles) for (let i = 0; i < 3; i++) {
    const a = triangle[i], b = triangle[(i + 1) % 3], key = [pointKey(a), pointKey(b)].sort().join('/');
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([a, b]);
  }
  return edges;
}
function assertClosedSquare(triangles) {
  assert.ok(triangles.every(triangle => area(triangle) > 1e-10), 'no inverted or zero-area fan triangles');
  assert.ok(Math.abs(triangles.reduce((sum, triangle) => sum + area(triangle), 0) - 16) < 1e-9, 'coverage area is preserved');
  for (const segments of edgesOf(triangles).values()) {
    const [a, b] = segments[0];
    const exterior = (a.x === b.x && [0, 4].includes(a.x)) || (a.z === b.z && [0, 4].includes(a.z));
    assert.equal(segments.length, exterior ? 1 : 2, `no dangling interior edge ${pointKey(a)} → ${pointKey(b)}`);
    if (!exterior) for (const endpoint of segments[0]) {
      const peer = segments[1].find(p => pointKey(p) === pointKey(endpoint));
      assert.equal(peer.y, endpoint.y, 'shared edge has exactly the same height on both sides');
      assert.deepEqual(peer.color, endpoint.color);
    }
  }
}

test('absent adaptive refinement preserves original leaves and uniform subdivision', () => {
  const original = source(), unchanged = [];
  emitTerrainTriangles(original, { depth: 0, vertex: () => { throw Error('unexpected refinement'); }, emit: (...triangle) => unchanged.push(triangle) });
  assert.deepEqual(unchanged, original);
  const uniform = [];
  emitTerrainTriangles(source(), { depth: 1, vertex, emit: (...triangle) => uniform.push(triangle) });
  assert.equal(uniform.length, 8);
  assertClosedSquare(uniform);
});

test('recursive one-sided refinement stitches nonlinear terrain without cracks or lost coverage', () => {
  const triangles = [];
  const shouldRefine = (a, b, c) => a.z + b.z + c.z > a.x + b.x + c.x
    && Math.max(Math.hypot(a.x - b.x, a.z - b.z), Math.hypot(b.x - c.x, b.z - c.z), Math.hypot(c.x - a.x, c.z - a.z)) > 1.5;
  emitTerrainTriangles(source(), { depth: 0, vertex, shouldRefine, emit: (...triangle) => triangles.push(triangle) });
  assertClosedSquare(triangles);
  const seam = [...edgesOf(triangles).values()].filter(segments => segments[0].every(p => p.x === p.z));
  assert.equal(seam.length, 4, 'the coarse neighbour accepts all recursive seam subdivisions');
  assert.ok(seam.every(segments => segments.length === 2));
  const midpoint = triangles.flat().find(p => p.x === 2 && p.z === 2);
  assert.equal(midpoint.y, 8, 'retain sampled midpoint, not the old coarse edge height of 16');
  const centre = triangles.flat().find(p => Math.abs(p.x - 8 / 3) < 1e-10 && Math.abs(p.z - 4 / 3) < 1e-10);
  assert.ok(centre, 'the coarse neighbour uses an interior fan');
  assert.equal(centre.y, 16, 'fan centre retains the original triangle-interpolated height');
  assert.deepEqual(centre.color, [2 / 3, 1 / 3, .5]);
});
