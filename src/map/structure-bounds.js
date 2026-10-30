/** World-space broadphase bounds for already rotated/scaled collision proxies.
 * Large buildings must remain solid beyond the old fixed 15 metre search area.
 */
export function collisionStructureBounds(bodies) {
  if (!bodies.length) return null;
  return bodies.reduce((bounds, body) => ({
    minX: Math.min(bounds.minX, body.minX), maxX: Math.max(bounds.maxX, body.maxX),
    minZ: Math.min(bounds.minZ, body.minZ), maxZ: Math.max(bounds.maxZ, body.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
}

export function structureContainsPoint(bounds, point, radius = 0) {
  return Boolean(bounds && point.x >= bounds.minX - radius && point.x <= bounds.maxX + radius
    && point.z >= bounds.minZ - radius && point.z <= bounds.maxZ + radius);
}

export function structureIntersectsSegment(bounds, start, end, radius = 0) {
  return Boolean(bounds && Math.max(start.x, end.x) >= bounds.minX - radius
    && Math.min(start.x, end.x) <= bounds.maxX + radius
    && Math.max(start.z, end.z) >= bounds.minZ - radius
    && Math.min(start.z, end.z) <= bounds.maxZ + radius);
}
