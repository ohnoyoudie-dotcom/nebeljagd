/** Shared CPU-only dimensions for the project's existing GLB environment kit.
 * Horizontal axes are x/z and all dimensions are metres after glTF import.
 * Original collision metadata is preserved in the kit's source directory.
 * These bounds include the small measured fence/wall/crate overhangs; the
 * timber house uses the same deliberately opened roofless model as the game.
 */
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const wall = (minX, maxX, minZ, maxZ, maxY, type) => ({ minX, maxX, minZ, maxZ, minY: 0, maxY, type });
const circle = (radius, height) => ({ x: 0, z: 0, radius, minY: 0, maxY: height });
const entry = (kind, variant, asset, label, height, footprint, walls = [], circles = [], extra = {}) => ({
  id: `${kind}:${variant}`, kind, variant, asset, file: asset, label, height,
  footprint, walls, circles, solid: Boolean(walls.length || circles.length), ...extra,
});

const nativeDefinitions = [
  entry('tree', 'kit-pine-high', 'pine_high', 'Große Kiefer', 4.72, { halfWidth: .3, halfDepth: .3 }, [], [circle(.3, 4.72)]),
  entry('tree', 'kit-pine-young', 'pine_young', 'Junge Kiefer', 3.304, { halfWidth: .22, halfDepth: .22 }, [], [circle(.22, 3.304)]),
  entry('tree', 'kit-oak-green', 'oak_green', 'Grüne Eiche', 4.65, { halfWidth: .39, halfDepth: .39 }, [], [circle(.39, 4.65)]),
  entry('tree', 'kit-oak-autumn', 'oak_autumn', 'Herbsteiche', 4.65, { halfWidth: .39, halfDepth: .39 }, [], [circle(.39, 4.65)]),
  entry('wall', 'kit-stone', 'wall_stone_3m', 'Steinmauer', 1.41, { halfWidth: 1.68, halfDepth: .35 }, [wall(-1.68, 1.68, -.35, .35, 1.41, 'wall')]),
  entry('fence', 'kit-wood', 'fence_wood_3m', 'Holzzaun', 1.64, { halfWidth: 1.655, halfDepth: .2 }, [wall(-1.655, 1.655, -.2, .2, 1.64, 'fence')]),
  entry('ruin', 'kit-arch', 'ruin_arch', 'Ruinenbogen', 2.2, { halfWidth: 1.45, halfDepth: .385 },
    [wall(-1.45, -.75, -.385, .385, 2.2, 'ruin'), wall(.75, 1.45, -.385, .385, 2.2, 'ruin')], [], { passableCenter: true }),
  entry('rock', 'kit-cluster', 'rock_cluster', 'Felsgruppe', 1.05, { halfWidth: 1.1, halfDepth: 1.1 }, [], [circle(1.1, 1.05)]),
  entry('rock', 'kit-single', 'rock_single', 'Einzelfelsen', 1.05, { halfWidth: .85, halfDepth: .85 }, [], [circle(.85, 1.05)]),
  entry('grass', 'kit-tall', 'grass_tall_patch', 'Hohes Gras', 1.462, { halfWidth: 1.05, halfDepth: .95 }, [], [], { hidingGrass: true }),
  entry('house', 'kit-timber', 'house_timbersmall', 'Fachwerkhaus', 2.65, { halfWidth: 1.95, halfDepth: 1.75 }, [
    wall(-1.95, -1.65, -1.7, 1.7, 2.65, 'house-wall'),
    wall(1.65, 1.95, -1.7, 1.7, 2.65, 'house-wall'),
    wall(-1.65, 1.65, -1.75, -1.45, 2.65, 'house-wall'),
    wall(-1.65, -.65, 1.45, 1.75, 2.65, 'house-wall'),
    wall(.65, 1.65, 1.45, 1.75, 2.65, 'house-wall'),
    wall(-1.3, -.5, -.85, -.2, .9, 'furniture'),
  ], [], { roofless: true, floorHeight: .22, interior: { halfWidth: 1.65, halfDepth: 1.45, entranceHalfWidth: .65 },
    insideHalfWidth: 1.65, insideHalfDepth: 1.45, entranceHalfWidth: .65 }),
  entry('crate', 'kit-wood', 'crate_wood', 'Holzkiste', .76, { halfWidth: .475, halfDepth: .475 }, [wall(-.475, .475, -.475, .475, .76, 'crate')]),
];

// Exact POSITION accessor bounds of the twelve original, transform-free GLBs.
// Keep the already-published target sizes: changing these would move a placed
// kit model's visible walls away from its existing saved map footprint.
const nativeBounds = {
  crate_wood: { min: [-.4749999940395355, -2.663606772023842e-17, -.4749999940395355], max: [.4749999940395355, .7599999904632568, .4749999940395355] },
  fence_wood_3m: { min: [-1.6549999713897705, .014999999664723873, -.18907295167446136], max: [1.6549999713897705, 1.6399999856948853, .1899999976158142] },
  grass_tall_patch: { min: [-1.0425810813903809, -.001220995793119073, -.9051030278205872], max: [.9508611559867859, 1.4609380960464478, .9794574975967407] },
  house_timbersmall: { min: [-2.209258794784546, -1.0409497585229437e-16, -1.9900000095367432], max: [2.209258794784546, 3.884999990463257, 1.9600000381469727] },
  oak_autumn: { min: [-2.3030779361724854, -1.6364453202187693e-17, -2.342846393585205], max: [2.439729928970337, 4.641620635986328, 2.412564277648926] },
  oak_green: { min: [-2.2403969764709473, -1.6364453202187693e-17, -2.42873215675354], max: [2.4475886821746826, 4.649390697479248, 2.4283318519592285] },
  pine_high: { min: [-1.292724370956421, -.00891934148967266, -1.1961528062820435], max: [1.2080544233322144, 4.71999979019165, 1.282026767730713] },
  pine_young: { min: [-.8900949358940125, -.00624353950843215, -.9852011203765869], max: [.8683046102523804, 3.303999900817871, .83296138048172] },
  rock_cluster: { min: [-1.202743649482727, -.09022360295057297, -.7767540216445923], max: [1.0572478771209717, .9857407808303833, .9518477916717529] },
  rock_single: { min: [-1.0055701732635498, -.08905074000358582, -.7659748196601868], max: [1.0195907354354858, 1.0043984651565552, .7714471220970154] },
  ruin_arch: { min: [-1.6366324424743652, -.018988467752933502, -.6278529167175293], max: [1.9579108953475952, 2.39277982711792, .4085088074207306] },
  wall_stone_3m: { min: [-1.682736873626709, .04500000178813934, -.3480740785598755], max: [1.6721457242965698, 1.4035049676895142, .3502883017063141] },
};
const targetHeights = { pine_high: 7.2, pine_young: 4.2, oak_green: 5.8, oak_autumn: 5.8,
  wall_stone_3m: 1.5, fence_wood_3m: 1.5, ruin_arch: 3.5, rock_cluster: 1.7,
  rock_single: 1.6, grass_tall_patch: 1.95, house_timbersmall: 5.5, crate_wood: 1 };

export const ENVIRONMENT_KIT_DEFINITIONS = freeze(nativeDefinitions.map(definition => {
  const bounds = nativeBounds[definition.asset], targetHeight = targetHeights[definition.asset];
  const scale = targetHeight / (bounds.max[1] - bounds.min[1]);
  const offset = [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1], (bounds.min[2] + bounds.max[2]) / 2];
  const x = value => (value - offset[0]) * scale, y = value => (value - offset[1]) * scale, z = value => (value - offset[2]) * scale;
  const footprint = { halfWidth: Math.max(Math.abs(x(-definition.footprint.halfWidth)), Math.abs(x(definition.footprint.halfWidth))),
    halfDepth: Math.max(Math.abs(z(-definition.footprint.halfDepth)), Math.abs(z(definition.footprint.halfDepth))) };
  const walls = definition.walls.map(wall => ({ ...wall, minX: x(wall.minX), maxX: x(wall.maxX), minZ: z(wall.minZ), maxZ: z(wall.maxZ), minY: Math.max(0, y(wall.minY)), maxY: y(wall.maxY) }));
  const circles = definition.circles.map(circle => ({ ...circle, x: x(circle.x), z: z(circle.z), radius: circle.radius * scale, minY: 0, maxY: targetHeight }));
  const interior = definition.interior ? { halfWidth: definition.interior.halfWidth * scale, halfDepth: definition.interior.halfDepth * scale,
    minX: x(-definition.interior.halfWidth), maxX: x(definition.interior.halfWidth), minZ: z(-definition.interior.halfDepth), maxZ: z(definition.interior.halfDepth),
    centerX: x(0), centerZ: z(0), entranceHalfWidth: definition.entranceHalfWidth * scale } : undefined;
  return { ...definition, nativeBounds: bounds, targetHeight, normalization: { scale, offset }, footprint, walls, circles,
    height: y(definition.height), ...(interior ? { interior, insideHalfWidth: interior.halfWidth, insideHalfDepth: interior.halfDepth,
      entranceHalfWidth: interior.entranceHalfWidth, floorHeight: y(definition.floorHeight),
      floorBounds: { minX: x(-definition.footprint.halfWidth), maxX: x(definition.footprint.halfWidth), minZ: z(-definition.footprint.halfDepth), maxZ: z(definition.footprint.halfDepth) } } : {}) };
}));

const byId = new Map(ENVIRONMENT_KIT_DEFINITIONS.map(definition => [definition.id, definition]));
export function getEnvironmentKitDefinition(kind, variant) { return byId.get(`${kind}:${variant}`) ?? null; }
