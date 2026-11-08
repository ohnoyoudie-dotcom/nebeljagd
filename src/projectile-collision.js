import { isLowSightBarrier } from './map/barrier-height.js';

const blocksFlight = collider => !isLowSightBarrier(collider);

/** Ranged shots clear sight-permeable barriers. Physical reach checks retain
 * their full colliders, as do props, house walls and higher barriers. */
export function traceRangedProjectile(world, start, end, radius) {
  return world?.traceProjectile?.(start, end, radius, blocksFlight);
}

export const colliderBlocksTarget = (collider, target) => Boolean(target &&
  (collider?.objectId === target.id || collider?.destructibleId === target.id));

/** Resolve the actual solid surface independently of a combat target's simpler
 * cylinder. An outer stave/corner can be struck before that cylinder enters the
 * current frame's segment, and still belongs to the same breakable object. */
export function colliderTarget(combat, collider, excludeId) {
  const target = combat?.targets?.get(collider?.destructibleId ?? collider?.objectId);
  return target?.destructible && target.alive && target.targetable !== false && target.id !== excludeId ? target : null;
}

export function traceCombatProjectile(world, combat, start, end, radius, excludeId) {
  const terrain = traceRangedProjectile(world, start, end, radius);
  const entity = combat?.traceSegment(start, end, radius, excludeId);
  if (!terrain) return entity;
  const target = colliderTarget(combat, terrain.collider, excludeId);
  const contact = target ? { ...terrain, target } : terrain;
  if (!entity || entity.target === target) return contact;
  const dx = end.x - start.x, dy = (end.y ?? 0) - (start.y ?? 0), dz = end.z - start.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  const terrainT = Number.isFinite(terrain.t) ? terrain.t : distanceSquared > 1e-12
    ? ((terrain.point.x - start.x) * dx + ((terrain.point.y ?? 0) - (start.y ?? 0)) * dy + (terrain.point.z - start.z) * dz) / distanceSquared : 0;
  return entity.t < terrainT - .0001 ? entity : contact;
}

/** Top-down controls provide yaw only. Pitch down at a visible breakable prop
 * already on that exact horizontal ray, never rotate toward an off-axis prop
 * or aim through an earlier target/solid obstruction. */
export function aimBowAtDestructible(world, combat, origin, direction, range, excludeId, isVisible) {
  const dx = Math.sin(direction), dz = Math.cos(direction), arrowRadius = .055;
  let best = null;
  for (const target of combat?.targets?.values() ?? []) {
    if (!target.destructible || !target.alive || target.targetable === false || target.id === excludeId) continue;
    const x = target.position.x - origin.x, z = target.position.z - origin.z;
    const along = x * dx + z * dz, lateral = x * dz - z * dx;
    // Include the existing swept-arrow radius in this candidate filter. The
    // unchanged physical collider below still has the final say on every hit.
    if (along <= .05 || along > range || Math.abs(lateral) > target.radius + arrowRadius || best && along >= best.distance) continue;
    const bottom = target.position.y ?? 0, height = target.height ?? 1;
    if (origin.y <= bottom + height) continue;
    const pitch = Math.min(.6, Math.atan2(origin.y - (bottom + height * .6), along));
    const point = { x: origin.x + dx * along, y: origin.y - Math.tan(pitch) * along, z: origin.z + dz * along };
    if (isVisible && !isVisible(point)) continue;
    const contact = traceCombatProjectile(world, combat, origin, point, arrowRadius, excludeId);
    if (contact?.target !== target || !colliderBlocksTarget(contact.collider, target)) continue;
    best = { targetId: target.id, distance: along, pitch };
  }
  return best;
}
