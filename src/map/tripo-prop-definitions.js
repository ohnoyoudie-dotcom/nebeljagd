/** Source-preserving Tripo scenery, in metres with +Y up and +Z front.
 * These simple collision proxies follow the visible solid parts rather than
 * the entire bounding box (notably the wagon shafts and the well canopy).
 * Original uploads and measured bounds: assets/imported/tripo-props/inspection.json.
 */
const box = (minX, maxX, minZ, maxZ, maxY, type, extra = {}) =>
  ({ minX, maxX, minZ, maxZ, minY: 0, maxY, type, ...extra });
const circle = (x, z, radius, maxY) => ({ x, z, radius, minY: 0, maxY });
// Final prepared GLB accessor bounds, including the 8k-triangle barrel. Keeping
// this small CPU table independent of the loader lets editor/spatial tools use
// the same normalization contract without importing texture or model bytes.
const nativeBounds = {
  wagon: { min: [-.8104836940765381, 0, -1.4496817588806152], max: [.8104836940765381, 1.0860551595687866, 1.4496817588806152] },
  barrel: { min: [-.43123549222946167, 0, -.4550541043281555], max: [.43123549222946167, .9490711092948914, .4550541043281555] },
  well: { min: [-1.123389720916748, 0, -.9103109240531921], max: [1.123389720916748, 2.3992178440093994, .9103109240531921] },
  'rock-01': { min: [-.9998878240585327, 0, -.8581494092941284], max: [.9998878240585327, .5652078986167908, .8581494092941284] },
  'rock-02': { min: [-.9304180145263672, 0, -1.100463628768921], max: [.9304180145263672, 1.3078104257583618, 1.100463628768921] },
  'rock-03': { min: [-1.174299716949463, 0, -1.301117181777954], max: [1.174299716949463, 2.553933620452881, 1.301117181777954] },
};
const prop = (kind, variant, file, label, height, halfWidth, halfDepth, walls, circles = [], extra = {}) => ({
  id: `${kind}:${variant}`, kind, variant, file: `${file}.glb`, asset: `tripo-${file}`, label,
  height, nativeBounds: nativeBounds[file], targetHeight: nativeBounds[file].max[1] - nativeBounds[file].min[1],
  normalization: { scale: 1, offset: [0, 0, 0] },
  footprint: { halfWidth, halfDepth }, walls, circles, solid: true, textured: true,
  ...extra,
});

export const TRIPO_PROP_DEFINITIONS = [
  prop('wagon', 'kit-tripo-wagon', 'wagon', 'Holzkarren · Tripo', 1.1, .82, 1.46, [
    box(-.79, .79, -1.42, .35, 1.1, 'wagon'),
    box(-.48, -.33, .25, 1.45, .45, 'wagon-shaft'),
    box(.33, .48, .25, 1.45, .45, 'wagon-shaft'),
  ]),
  prop('barrel', 'kit-tripo-barrel', 'barrel', 'Holzfass · Tripo', .95, .44, .46, [
    box(-.32, .32, -.44, .44, .95, 'barrel'),
    box(-.43, .43, -.3, .3, .95, 'barrel'),
  ], [], { destructible: { health: 60, radius: .43 } }),
  prop('well', 'kit-tripo-well', 'well', 'Steinbrunnen · Tripo', 2.4, 1.14, .92, [
    box(-1.06, -.86, -.2, .2, 1.9, 'well-post'),
    box(.58, .78, -.2, .2, 1.9, 'well-post'),
    // The roof stops arrows, while its overhang never forms an invisible wall
    // at ground level. The centre is already occupied by the stone basin.
    box(-1.07, .79, -.78, .79, 2.4, 'well-roof', { minY: 1.7, projectileOnly: true }),
  ], [circle(-.18, 0, .94, .95)]),
  prop('rock', 'kit-tripo-01', 'rock-01', 'Flacher Felsen · Tripo', .56, 1.01, .87,
    [], [circle(0, 0, .78, .56), circle(-.35, 0, .55, .46), circle(.35, 0, .55, .46)]),
  prop('rock', 'kit-tripo-02', 'rock-02', 'Findling · Tripo', 1.31, .94, 1.11,
    [], [circle(0, -.2, .88, 1.31), circle(0, .2, .88, 1.1)]),
  prop('rock', 'kit-tripo-03', 'rock-03', 'Hohe Felsgruppe · Tripo', 2.55, 1.19, 1.31,
    [], [circle(0, 0, 1.04, 2.55), circle(0, -.6, .65, 1.8), circle(0, .6, .62, 1.5)]),
];

// The chest renderer owns its animated model and loot interaction separately.
// Only the fixed base stops movement: including it in sight/projectile queries
// would make the chest occlude its own E interaction and spawned contents.
export const TRIPO_CHEST_MOVEMENT_WALLS = [
  box(-.87, .87, -.575, .575, .98, 'chest', { movementOnly: true }),
];
