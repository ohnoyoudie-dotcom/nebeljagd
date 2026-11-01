import inspection from '../../assets/imported/tripo-houses/inspections/house-02.json' with { type: 'json' };

/** Measured proxies for the owner's textured, roofless house 2. Coordinates
 * follow glTF: Y up, +Z at the main entrance. Furniture remains part of the
 * original joined textured mesh. See tripo-houses/previews for mesh sections. */
const lift = .3;
const box = (name, minX, maxX, minZ, maxZ, maxY = 3.95, type = 'house-wall') =>
  ({ name, minX, maxX, minZ, maxZ, minY: 0, maxY: maxY + lift, type });
const nativeBounds = { min: inspection.normalization.gltfBounds[0], max: inspection.normalization.gltfBounds[1] };

export const TRIPO_HOUSE_DEFINITIONS = [{
  id: 'house:kit-tripo-house-02', kind: 'house', variant: 'kit-tripo-house-02',
  asset: 'tripo-house-02', file: 'house-02.glb', label: 'Wohnhaus 2 · Tripo',
  textured: true, roofless: true, solid: true,
  nativeBounds, targetHeight: nativeBounds.max[1] - nativeBounds.min[1],
  height: nativeBounds.max[1] + lift,
  normalization: { scale: 1, offset: [0, -lift, 0] },
  footprint: { halfWidth: 11.02, halfDepth: 11.01 },
  terrain: { padding: 3, maxTriangleEdge: 2 },
  floorHeight: .34, insideHalfWidth: 9.65, insideHalfDepth: 9.65,
  entranceHalfWidth: 1,
  interior: { halfWidth: 9.65, halfDepth: 9.65, minX: -9.65, maxX: 9.65,
    minZ: -9.65, maxZ: 9.65, centerX: 0, centerZ: 0, entranceHalfWidth: 1 },
  floorBounds: { minX: -10.35, maxX: 10.35, minZ: -10.35, maxZ: 10.35 },
  entrances: [
    { side: 'south', center: 0, min: -1, max: 1, innerBoundary: 10.35, boundary: 10.9, depth: .8 },
    { side: 'north', center: 6.72, min: 6.05, max: 7.4, innerBoundary: -10.35, boundary: -10.8, depth: .8 },
  ],
  circles: [],
  walls: [
    box('west facade', -10.75, -9.65, -10.6, 10.7),
    box('east facade', 9.65, 10.75, -10.6, 10.7),
    box('north facade west of kitchen doorway', -9.65, 6.05, -10.75, -9.65),
    box('north facade east of kitchen doorway', 7.4, 9.65, -10.75, -9.65),
    box('south facade west of entrance', -9.65, -1, 9.7, 10.75),
    box('south facade east of entrance', 1, 9.65, 9.7, 10.75),
    // Two broad, real openings connect the front room to bedroom and kitchen.
    box('bedroom south partition', -9.65, -3.95, -.55, .55, 3.9),
    box('bedroom kitchen divider', -.52, .52, -9.65, .45, 3.9),
    box('kitchen south partition', 3.95, 9.65, -.55, .55, 3.9),
    // Furnishing outlines measured from the source and reduced mesh sections.
    box('bed', -8.2, -4.7, -9.65, -4.75, 1.9, 'furniture'),
    box('bedside table', -9.65, -8.15, -9.65, -8.2, 1.35, 'furniture'),
    box('wardrobe', -3.4, -1.2, -9.65, -8.5, 2.8, 'furniture'),
    box('kitchen worktable', .55, 3.1, -9.65, -8.35, 1.5, 'furniture'),
    box('kitchen hearth', 3.1, 5.65, -9.65, -8.05, 4.05, 'furniture'),
    box('kitchen writing desk', 7.95, 9.65, -9.65, -8.15, 1.55, 'furniture'),
    box('kitchen chair', 8.05, 9.2, -7.2, -6.15, 1.5, 'furniture'),
    box('sofa', -8.85, -5.4, .9, 2.55, 1.6, 'furniture'),
    box('living room hearth', 5.75, 8.7, .55, 1.5, 3.85, 'furniture'),
    box('armchair', 7.65, 9.45, 2.35, 4.25, 1.8, 'furniture'),
    box('dining table', -1.35, 1.35, 4.15, 6.1, 1.4, 'furniture'),
    box('dining chair north', -.6, .6, 3.35, 4.15, 1.8, 'furniture'),
    box('dining chair south', -.6, .6, 6.1, 6.9, 1.8, 'furniture'),
    box('dining chair west', -2.15, -1.35, 4.45, 5.7, 1.8, 'furniture'),
    box('dining chair east', 1.35, 2.15, 4.45, 5.7, 1.8, 'furniture'),
  ],
  qaRoutes: {
    entrances: [
      { name: 'Haupteingang', from: [0, 12], to: [0, 8] },
      { name: 'Küchenausgang', from: [6.72, -12], to: [6.72, -7] },
    ],
    rooms: [
      { name: 'Schlafzimmer', from: [-2.3, 2], to: [-2.3, -3] },
      { name: 'Küche', from: [2.3, 2], to: [2.3, -4] },
      { name: 'Wohnraum westlicher Gang', from: [-3.1, 8], to: [-3.1, 1.8] },
    ],
    openFloor: [0, 1.8],
  },
}];
