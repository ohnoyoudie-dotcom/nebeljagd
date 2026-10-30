/** Old houses remain readable in imported maps, but are no longer offered for
 * new placement. Removal is explicit so a saved browser draft is never erased.
 */
export const RETIRED_HOUSE_VARIANTS = Object.freeze([
  'herbal', 'inn', 'hunter', 'kit-timber', 'kit-taverne',
]);
const retired = new Set(RETIRED_HOUSE_VARIANTS);

export function isRetiredBuilding(object) {
  return object?.kind === 'house' && retired.has(object.variant);
}

/** Returns a new map only when necessary. No proximity/name heuristics: only
 * the old generator's exact chest-<house ID> relation identifies house loot.
 * A stock chest whose generated house was already removed is an orphan too.
 */
export function removeRetiredBuildings(map) {
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const houses = objects.filter(object => object.kind === 'house');
  const removedBuildings = houses.filter(isRetiredBuilding);
  const removedIds = new Set(removedBuildings.map(object => object.id));
  const houseIds = new Set(houses.map(object => object.id));
  const removedDependents = objects.filter(object => {
    if (object.kind !== 'chest' || !object.id.startsWith('chest-')) return false;
    const houseId = object.id.slice('chest-'.length);
    return removedIds.has(houseId)
      || /^obj-house-[a-z0-9-]+$/.test(houseId) && !houseIds.has(houseId);
  });
  const removed = new Set([...removedBuildings, ...removedDependents]);
  return {
    map: removed.size ? { ...map, objects: objects.filter(object => !removed.has(object)) } : map,
    removedBuildings,
    removedDependents,
    totalRemoved: removed.size,
  };
}
