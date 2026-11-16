/** Waldhaus shell in metres. Layout, model, floor plan and collision agree. */
const floorHeight = .18;
const wallHeight = 3;
const wallThickness = .3;
const box = (name, minX, maxX, minZ, maxZ) => ({
  name, minX, maxX, minZ, maxZ, minY: 0, maxY: floorHeight + wallHeight, type: 'house-wall',
});

// Furnishings will be separate editor objects, never baked into this building.
export const WALDHAUS_FURNITURE = Object.freeze([]);

const architecturalWalls = [
  box('west facade', -8, -7.7, -6, 6),
  box('east facade', 7.7, 8, -6, 6),
  box('north facade west', -7.7, -4.7, -6, -5.7),
  box('north facade east', -2.5, 7.7, -6, -5.7),
  box('south facade west', -7.7, -4.9, 5.7, 6),
  box('south facade east', -2.3, 7.7, 5.7, 6),
  box('room divider north', 2.05, 2.35, -5.7, -4.3),
  box('room divider middle', 2.05, 2.35, -1.7, 1.7),
  box('room divider south', 2.05, 2.35, 4.3, 5.7),
  box('side room partition', 2.35, 7.7, -.15, .15),
];
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const WALDHAUS_DEFINITION = freeze({
  id: 'house:waldhaus', kind: 'house', variant: 'waldhaus', label: 'Waldhaus',
  asset: 'waldhaus', file: null, procedural: true, proceduralHouse: true,
  textured: true, roofless: true, solid: true,
  height: floorHeight + wallHeight, targetHeight: floorHeight + wallHeight,
  normalization: { scale: 1, offset: [0, 0, 0] },
  footprint: { halfWidth: 8, halfDepth: 6 },
  terrain: { padding: 1.2, maxTriangleEdge: 1 },
  floorHeight, wallHeight, wallThickness,
  insideHalfWidth: 7.7, insideHalfDepth: 5.7, entranceHalfWidth: 1.3,
  interior: {
    halfWidth: 7.7, halfDepth: 5.7, minX: -7.7, maxX: 7.7, minZ: -5.7, maxZ: 5.7,
    centerX: 0, centerZ: 0, entranceHalfWidth: 1.3,
  },
  floorBounds: { minX: -8, maxX: 8, minZ: -6, maxZ: 6 },
  entrances: [
    { name: 'Haupteingang', side: 'south', center: -3.6, min: -4.9, max: -2.3,
      innerBoundary: 5.7, boundary: 6, depth: .8 },
    { name: 'Hinterausgang', side: 'north', center: -3.6, min: -4.7, max: -2.5,
      innerBoundary: -5.7, boundary: -6, depth: .8 },
  ],
  interiorDoorways: [
    { name: 'Durchgang Nebenraum 1', x: 2.2, z: -3, width: 2.6, axis: 'z' },
    { name: 'Durchgang Nebenraum 2', x: 2.2, z: 3, width: 2.6, axis: 'z' },
  ],
  // Closed glazed windows are architectural details, not extra passages.
  windows: [
    { name: 'Fenster Hauptraum hinten', side: 'north', center: .2, boundary: -5.69,
      x: .2, z: -5.69, width: 1.6, height: 1.4, sillHeight: 1.1 },
    { name: 'Fenster Nebenraum 1', side: 'north', center: 5.3, boundary: -5.69,
      x: 5.3, z: -5.69, width: 1.6, height: 1.4, sillHeight: 1.1 },
    { name: 'Fenster Nebenraum 2', side: 'east', center: 3, boundary: 7.69,
      x: 7.69, z: 3, width: 1.6, height: 1.4, sillHeight: 1.1 },
    { name: 'Fenster Hauptraum seitlich', side: 'west', center: 1.5, boundary: -7.69,
      x: -7.69, z: 1.5, width: 1.6, height: 1.4, sillHeight: 1.1 },
  ],
  rooms: [
    { name: 'Hauptraum', minX: -7.7, maxX: 2.05, minZ: -5.7, maxZ: 5.7 },
    { name: 'Nebenraum 1', minX: 2.35, maxX: 7.7, minZ: -5.7, maxZ: -.15 },
    { name: 'Nebenraum 2', minX: 2.35, maxX: 7.7, minZ: .15, maxZ: 5.7 },
  ],
  circles: [], architecturalWalls, walls: architecturalWalls,
  qaRoutes: {
    entrances: [
      { name: 'Haupteingang', from: [-3.6, 7.5], to: [-3.6, 4.5] },
      { name: 'Hinterausgang', from: [-3.6, -7.5], to: [-3.6, -4.5] },
    ],
    rooms: [
      { name: 'Nebenraum 1', from: [.7, -3], to: [4.2, -3] },
      { name: 'Nebenraum 2', from: [.7, 3], to: [4.2, 3] },
      { name: 'Hauptraum', from: [-3.6, 4.5], to: [-3.6, -4.5] },
    ],
    openFloor: [-3.6, 2],
    clearedFurniture: [
      { name: 'ehemaliger Esstisch', from: [-.6, 1.8], to: [-.6, -.9] },
      { name: 'ehemaliges Bett', from: [4.65, -4], to: [4.65, -.8] },
      { name: 'ehemalige Truhe', from: [3.65, 2.8], to: [3.65, 4.2] },
    ],
  },
});
