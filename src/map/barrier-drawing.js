import { distanceToSegment } from './model.js';

/** Keep intentional bends, remove redundant pointer samples and hand jitter. */
export function simplifyBarrierPoints(points, tolerance = .6) {
  if (points.length < 3) return points.map(point => [...point]);
  let index = 0, farthest = tolerance;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = distanceToSegment(points[i], points[0], points.at(-1));
    if (distance > farthest) { farthest = distance; index = i; }
  }
  if (!index) return [[...points[0]], [...points.at(-1)]];
  return [...simplifyBarrierPoints(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyBarrierPoints(points.slice(index), tolerance)];
}

/** Distance along the authored route, independent of its current GLB module length. */
export function nearestBarrier(barriers, point, reach) {
  let best = null;
  for (const barrier of barriers) {
    let offset = 0;
    for (let i = 1; i < barrier.points.length; i++) {
      const a = barrier.points[i - 1], b = barrier.points[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (!length) continue;
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (length * length)));
      const distance = Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
      if (distance <= reach && (!best || distance < best.distance)) best = { barrier, distance, at: offset + t * length };
      offset += length;
    }
  }
  return best;
}

/** A swept eraser cannot skip a thin wall between two fast pointer events. */
export function barrierEraseHits(barriers, from, to, radius) {
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return barriers.filter(barrier => barrier.points.slice(1).some((b, i) => {
    const a = barrier.points[i];
    const minDistance = Math.min(distanceToSegment(a, from, to), distanceToSegment(b, from, to), distanceToSegment(from, a, b), distanceToSegment(to, a, b));
    if (minDistance <= radius) return true;
    return cross(from, to, a) * cross(from, to, b) < 0 && cross(a, b, from) * cross(a, b, to) < 0;
  }));
}
