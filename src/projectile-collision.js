import { isLowSightBarrier } from './map/barrier-height.js';

const blocksFlight = collider => !isLowSightBarrier(collider);

/** Ranged shots clear sight-permeable barriers. Physical reach checks retain
 * their full colliders, as do props, house walls and higher barriers. */
export function traceRangedProjectile(world, start, end, radius) {
  return world?.traceProjectile?.(start, end, radius, blocksFlight);
}
