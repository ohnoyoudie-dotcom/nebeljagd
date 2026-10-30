/** Measured gameplay proxy for the user's roofless Tripo inn. Metres, Y up,
 * +Z front. The source and preparation report live in assets/imported/tripo-tavern.
 * Furniture stays fixed: the uploaded model is a single joined textured mesh.
 */
const box = (minX, maxX, minZ, maxZ, maxY, type = 'house-wall') =>
  ({ minX, maxX, minZ, maxZ, minY: 0, maxY, type });

export const TRIPO_TAVERN_DEFINITION = {
  id: 'house:kit-tripo-tavern', kind: 'house', variant: 'kit-tripo-tavern',
  asset: 'tripo-tavern', file: 'tavern.glb', label: 'Wirtshaus · Tripo (neu)',
  height: 5.054, targetHeight: 5.641580939292908,
  nativeBounds: { min: [-10.997231483459473, -.8879193067550659, -8.885022163391113],
    max: [11.000926971435547, 4.753661632537842, 8.885710716247559] },
  // Raise the slightly uneven reconstructed floor above the terrain plane;
  // the original stone foundation extends below it and closes the perimeter.
  normalization: { scale: 1, offset: [0, -.3, 0] },
  footprint: { halfWidth: 11.01, halfDepth: 8.89 },
  terrain: { padding: 3, maxTriangleEdge: 2 },
  roofless: true, solid: true, floorHeight: .42,
  insideHalfWidth: 9.8, insideHalfDepth: 7.6, entranceHalfWidth: 1.4,
  interior: { halfWidth: 9.8, halfDepth: 7.6, minX: -9.8, maxX: 9.8,
    minZ: -7.6, maxZ: 7.6, centerX: 0, centerZ: 0, entranceHalfWidth: 1.4 },
  floorBounds: { minX: -10.5, maxX: 10.5, minZ: -8.4, maxZ: 8.4 },
  circles: [],
  walls: [
    box(-10.75, -9.8, -8.45, 8.45, 4.65),
    box(9.8, 10.75, -8.45, 8.45, 4.65),
    box(-9.8, -1.5, 7.65, 8.5, 4.65),
    box(1.4, 9.8, 7.65, 8.5, 4.65),
    box(-9.8, -2.35, -8.5, -7.65, 4.65),
    box(0, 9.8, -8.5, -7.65, 4.65),
    // Kitchen walls: openings in both partitions preserve two approaches.
    box(2.55, 3.25, -7.65, -3.5, 4.2),
    box(2.55, 3.25, -1.1, .45, 4.2),
    box(3.25, 4.7, -.35, .45, 4.2),
    box(6.8, 9.8, -.35, .45, 4.2),
    // Tables, benches, counter, stools, hearths and kitchen worktop.
    box(-8.75, -4.7, 2.2, 5.06, 1.46, 'furniture'),
    box(-8.75, -4.7, -2.05, .88, 1.44, 'furniture'),
    box(-7.6, -2.3, -7.7, -4.65, 1.8, 'furniture'),
    box(-9.8, -7.45, -7.65, -5.25, 4.5, 'furniture'),
    box(5.8, 8.65, -7.65, -5.9, 4.5, 'furniture'),
    box(8.65, 9.8, -7.55, -4.85, 1.3, 'furniture'),
    box(7.0, 9.8, -1.05, 1.15, 1.0, 'furniture'),
  ].map(body => ({ ...body, maxY: body.maxY + .3 })),
};
