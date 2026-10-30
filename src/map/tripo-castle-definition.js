import inspection from '../../assets/imported/tripo-castle/inspection.json' with { type: 'json' };

/** Metric gameplay proxies measured against the prepared small castle and its
 * horizontal mesh sections. The uploaded, joined furniture stays fixed.
 * Coordinates use glTF +Y up, +Z toward the main entrance. */
const lift = .3;
const box = (name, minX, maxX, minZ, maxZ, maxY = 8.6, type = 'house-wall') =>
  ({ name, minX, maxX, minZ, maxZ, minY: 0, maxY: maxY + lift, type });
const nativeBounds = { min: inspection.normalization.gltfBounds[0], max: inspection.normalization.gltfBounds[1] };

export const TRIPO_CASTLE_DEFINITION = {
  id: 'house:kit-tripo-castle', kind: 'house', variant: 'kit-tripo-castle',
  asset: 'tripo-castle', file: 'castle.glb', label: 'Kleines Schloss · Tripo',
  textured: true, roofless: true, solid: true,
  nativeBounds, targetHeight: nativeBounds.max[1] - nativeBounds.min[1],
  height: nativeBounds.max[1] + lift,
  normalization: { scale: 1, offset: [0, -lift, 0] },
  footprint: { halfWidth: 35.1, halfDepth: 24.4 },
  terrain: { padding: 4, maxTriangleEdge: 2 },
  floorHeight: .42, insideHalfWidth: 31.2, insideHalfDepth: 20,
  entranceHalfWidth: 2.5,
  interior: { halfWidth: 31.2, halfDepth: 20, minX: -31.2, maxX: 31.2,
    minZ: -20, maxZ: 20, centerX: 0, centerZ: 0, entranceHalfWidth: 2.5 },
  floorBounds: { minX: -32.2, maxX: 32.2, minZ: -20.8, maxZ: 20.4 },
  // Only the two openings that actually exist in the user's generated mesh.
  entrances: [
    { side: 'south', center: 0, min: -2.5, max: 2.5, innerBoundary: 20.4, boundary: 24.4, depth: 1.6 },
    { side: 'west', center: 4.8, min: 2.1, max: 7.2, innerBoundary: -32.2, boundary: -33.5, depth: 1.6 },
  ],
  circles: [],
  walls: [
    box('north facade', -33.5, 33.5, -23.3, -20),
    box('east facade', 31.4, 33.5, -21, 21.8),
    box('west facade north of gate', -33.5, -31.3, -21.8, 1.8),
    box('west facade south of gate', -33.5, -31.3, 7.4, 21.8),
    box('south facade west', -33.5, -4, 19.7, 22.5),
    box('south facade east', 4, 33.5, 19.7, 22.5),
    box('main gate west pier', -4.7, -2.6, 17.8, 24.2),
    box('main gate east pier', 2.6, 4.7, 17.8, 24.2),
    // Tall partitions retain the real below-lintel archways.
    box('west partition north', -16.7, -15, -20.8, -15.9),
    box('west partition north pillar', -16.8, -14.8, -12.4, -9.8),
    box('west partition middle', -16.7, -15, -4.2, 7.9),
    box('west partition south', -16.7, -15, 12.6, 20.4),
    box('east partition north', 11.6, 13.3, -20.8, -9.9),
    box('east partition middle', 11.6, 13.3, -4.2, 5.8),
    box('east partition south', 11.6, 13.3, 10.7, 20.4),
    box('west room divider', -31.5, -21.1, -.9, 1.0),
    box('east room divider', 18.2, 31.6, -1.1, 1.1),
    // Floors/arches are not collisions. Large furniture and hearths are.
    box('library table and chairs', -27.7, -21.2, -17.2, -11.4, 2.0, 'furniture'),
    box('banquet table and chairs', 18.9, 29.1, -15.9, -10.6, 2.2, 'furniture'),
    box('guard bench and equipment', -29.9, -20.4, 12.1, 18.6, 1.9, 'furniture'),
    box('kitchen worktable', 20.6, 29.5, 9.1, 11.5, 2.0, 'furniture'),
    box('kitchen long counter', 17.6, 19.5, 11.5, 19.2, 1.9, 'furniture'),
    box('kitchen hearth', 27.6, 31.8, -1.9, 2.2, 5.8, 'furniture'),
    box('kitchen north preparation counter', 16.8, 24.3, -1.2, 1.5, 1.8, 'furniture'),
    box('throne dais and carved backing', -9.6, 7.3, -20.2, -16.2, 7.8, 'furniture'),
  ],
  // Reproducible checks in the browser and CPU collision tests.
  qaRoutes: {
    entrances: [
      { name: 'Hauptportal', from: [0, 26.2], to: [0, 16] },
      { name: 'Westtor', from: [-36, 4.8], to: [-27.5, 4.8] },
    ],
    rooms: [
      { name: 'Bibliothek', from: [-10, -7], to: [-23, -7] },
      { name: 'Wachraum', from: [-10, 10.2], to: [-24, 10.2] },
      { name: 'Speisesaal', from: [9, -7], to: [22, -7] },
      { name: 'Küche', from: [9, 8], to: [24, 8] },
      { name: 'west rooms', from: [-19, -3], to: [-19, 4] },
      { name: 'east rooms', from: [16, -3], to: [16, 4] },
    ],
    openFloor: [0, 3],
  },
};
