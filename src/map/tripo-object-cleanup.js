import { isObjectPlaceable } from './objects.js';
import { AUTHORING_BARRIER_STYLES } from './barriers.js';

/** Explicit editor migration. Runtime loot and legacy map loading keep their
 * original definitions; only authored placements are removed here. */
export function removeNonTripoObjects(map) {
  const objects = Array.isArray(map?.objects) ? map.objects : [];
  const barriers = Array.isArray(map?.barriers) ? map.barriers : [];
  const keepObject = object => isObjectPlaceable(object.kind, object.variant);
  const keepBarrier = barrier => AUTHORING_BARRIER_STYLES.some(style =>
    style.kind === barrier.kind && style.variant === barrier.variant);
  const removedObjects = objects.filter(object => !keepObject(object));
  const removedBarriers = barriers.filter(barrier => !keepBarrier(barrier));
  const totalRemoved = removedObjects.length + removedBarriers.length;
  return {
    map: totalRemoved ? { ...map,
      objects: objects.filter(keepObject),
      ...(removedBarriers.length ? { barriers: barriers.filter(keepBarrier) } : {}),
    } : map,
    removedObjects, removedBarriers, totalRemoved,
  };
}
