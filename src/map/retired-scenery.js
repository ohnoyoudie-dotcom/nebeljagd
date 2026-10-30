/** Temporarily retired scenery remains readable in older map documents. New
 * art can be admitted later without deleting the original source packages. */
export const RETIRED_SCENERY_KINDS = Object.freeze(['tree', 'rock', 'mound', 'flower']);
const retired = new Set(RETIRED_SCENERY_KINDS);

export function isRetiredScenery(object) { return retired.has(object?.kind); }

/** Explicit, immutable cleanup: loot, structures, grass, terrain and custom
 * metadata stay intact. A legacy flower-meadow setting becomes ordinary meadow
 * grass, retaining its placement and all other vegetation parameters. */
export function removeRetiredScenery(map) {
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const removedObjects = objects.filter(isRetiredScenery);
  const convertedGrass = objects.filter(object => object.kind === 'grass' && object.vegetation?.type === 'flowers');
  const totalChanged = removedObjects.length + convertedGrass.length;
  return {
    map: totalChanged ? { ...map, objects: objects.filter(object => !isRetiredScenery(object)).map(object =>
      object.kind === 'grass' && object.vegetation?.type === 'flowers'
        ? { ...object, vegetation: { ...object.vegetation, type: 'meadow' } } : object) } : map,
    removedObjects, convertedGrass,
    totalRemoved: removedObjects.length, totalChanged,
  };
}
