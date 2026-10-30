/** Height fraction from ground (0) to a house's measured floor (1).
 * Coordinates, floor bounds and entrances are unscaled local x/z metres.
 */
export function houseFloorFactorAt(x, z, bounds, interior, entrances) {
  if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) return 1;
  const ramps = entrances?.length ? entrances : [{
    side: 'south', min: interior.centerX - interior.entranceHalfWidth,
    max: interior.centerX + interior.entranceHalfWidth, boundary: bounds.maxZ, depth: .8,
  }];
  for (const ramp of ramps) {
    const horizontal = ramp.side === 'east' || ramp.side === 'west';
    const cross = horizontal ? z : x, along = horizontal ? x : z;
    if (cross < ramp.min || cross > ramp.max) continue;
    // Portals can project past the main facade. Only their actual walkway
    // receives the indoor height, not an invisible shelf across the facade.
    if (Number.isFinite(ramp.innerBoundary) && along >= Math.min(ramp.innerBoundary, ramp.boundary)
      && along <= Math.max(ramp.innerBoundary, ramp.boundary)) return 1;
    const distance = (ramp.side === 'west' || ramp.side === 'north')
      ? ramp.boundary - along : along - ramp.boundary;
    if (distance >= 0 && distance < ramp.depth) {
      return 1 - distance / ramp.depth;
    }
  }
  return null;
}
