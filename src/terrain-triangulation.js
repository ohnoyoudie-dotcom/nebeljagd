/** Locally refine terrain, then stitch shared edges before either rendering or
 * height sampling receives a triangle. Only extra adaptive splits need a
 * registry: the initial uniform subdivision already has matching neighbours.
 */
export function emitTerrainTriangles(source, { depth = 6, vertex, shouldRefine = () => false, emit }) {
  const leaves = [], splits = new Map();
  const pointKey = p => `${Math.round(p.x * 10000)},${Math.round(p.z * 10000)}`;
  const edgeKey = (a, b) => {
    const first = pointKey(a), second = pointKey(b);
    return first < second ? `${first}/${second}` : `${second}/${first}`;
  };
  function midpoint(a, b, adaptive) {
    const middle = vertex((a.x + b.x) / 2, (a.z + b.z) / 2);
    if (adaptive) splits.set(edgeKey(a, b), middle);
    return middle;
  }
  function subdivide(a, b, c, remaining) {
    if (!remaining && !shouldRefine(a, b, c)) { leaves.push([a, b, c]); return; }
    const adaptive = remaining === 0;
    const ab = midpoint(a, b, adaptive), bc = midpoint(b, c, adaptive), ca = midpoint(c, a, adaptive);
    const next = Math.max(0, remaining - 1);
    subdivide(a, ab, ca, next); subdivide(ab, b, bc, next);
    subdivide(ca, bc, c, next); subdivide(ab, bc, ca, next);
  }
  for (const triangle of source) subdivide(...triangle, depth);
  function appendEdge(a, b, boundary) {
    const middle = splits.get(edgeKey(a, b));
    if (middle) { appendEdge(a, middle, boundary); appendEdge(middle, b, boundary); }
    else boundary.push(a);
  }
  for (const [a, b, c] of leaves) {
    if (!splits.size || ![edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)].some(key => splits.has(key))) {
      emit(a, b, c); continue;
    }
    const boundary = [];
    appendEdge(a, b, boundary); appendEdge(b, c, boundary); appendEdge(c, a, boundary);
    // An interior fan avoids degenerate triangles along a split boundary.
    // Interpolate its centre from the original leaf instead of resampling the
    // terrain, so stitching does not introduce another height/color bulge.
    const centre = { x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3,
      y: (a.y + b.y + c.y) / 3, color: a.color.map((value, i) => (value + b.color[i] + c.color[i]) / 3) };
    for (let i = 0; i < boundary.length; i++) emit(centre, boundary[i], boundary[(i + 1) % boundary.length]);
  }
}
