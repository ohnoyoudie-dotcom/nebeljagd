/** Temporarily retired scenery remains readable in older map documents. New
 * art can be admitted later without deleting the original source packages. */
export const RETIRED_SCENERY_KINDS = Object.freeze(['mound', 'flower', 'ruin', 'shrine']);
const retired = new Set(RETIRED_SCENERY_KINDS);
// Keep legacy tree shapes retired; explicitly placed GLB trees survive cleanup.
const retiredVariants = new Set(['tree:oak', 'tree:birch', 'tree:pine', 'tree:rei-tree01', 'tree:rei-tree02',
  'fence:kit-wood', 'crate:kit-wood',
  'rock:granite', 'rock:basalt', 'rock:kit-cluster', 'rock:kit-single']);

export function isRetiredScenery(object) { return retired.has(object?.kind) || retiredVariants.has(`${object?.kind}:${object?.variant}`); }

/** Explicit, immutable cleanup: loot, structures, grass, terrain and custom
 * metadata stay intact. A legacy flower-meadow setting becomes ordinary meadow
 * grass, retaining its placement and all other vegetation parameters. */
export function removeRetiredScenery(map) {
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const removedObjects = objects.filter(isRetiredScenery);
  const barriers = Array.isArray(map?.barriers) ? map.barriers : [];
  const removedBarriers = barriers.filter(isRetiredScenery);
  const convertedGrass = objects.filter(object => object.kind === 'grass' && object.vegetation?.type === 'flowers');
  const totalRemoved = removedObjects.length + removedBarriers.length;
  const totalChanged = totalRemoved + convertedGrass.length;
  return {
    map: totalChanged ? { ...map, objects: objects.filter(object => !isRetiredScenery(object)).map(object =>
      object.kind === 'grass' && object.vegetation?.type === 'flowers'
        ? { ...object, vegetation: { ...object.vegetation, type: 'meadow' } } : object),
      ...(removedBarriers.length ? { barriers: barriers.filter(barrier => !isRetiredScenery(barrier)) } : {}) } : map,
    removedObjects, removedBarriers, convertedGrass,
    totalRemoved, totalChanged,
  };
}
