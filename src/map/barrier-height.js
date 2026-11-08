import { getEnvironmentKitDefinition } from './environment-kit-definitions.js';

/** Absolute height overrides affect only local Y. Legacy maps without height
 * retain their original model proportions, including the saved overall scale. */
export const BARRIER_SIGHT_HEIGHT = 2;
export const BARRIER_HEIGHT_LIMITS = Object.freeze({ min: .25, max: 8 });
/** Shared sight/ranged rule, evaluated in world metres even for rotated kits. */
export function isLowSightBarrier(collider) {
  const body = collider?.worldBody ?? collider;
  if (body?.type !== 'wall' && body?.type !== 'fence') return false;
  return (body.barrierHeight ?? ((body.maxY ?? Infinity) - (body.minY ?? 0))) < BARRIER_SIGHT_HEIGHT;
}
export const isHeightAdjustable = object => ['wall', 'fence'].includes(object?.kind);
export const isValidBarrierHeight = value => typeof value === 'number' && Number.isFinite(value)
  && value >= BARRIER_HEIGHT_LIMITS.min && value <= BARRIER_HEIGHT_LIMITS.max;

export function getBarrierHeight(object) {
  if (!isHeightAdjustable(object)) return null;
  if (isValidBarrierHeight(object.height)) return object.height;
  const definition = getEnvironmentKitDefinition(object.kind, object.variant);
  return definition ? (definition.targetHeight ?? definition.height) * (object.scale ?? 1) : null;
}

export function getBarrierHeightScale(object) {
  if (!isHeightAdjustable(object)) return 1;
  const definition = getEnvironmentKitDefinition(object.kind, object.variant);
  const natural = (definition?.targetHeight ?? definition?.height) * (object.scale ?? 1);
  return natural > 0 ? getBarrierHeight(object) / natural : 1;
}

export function barrierHeightHint(object) {
  const height = getBarrierHeight(object);
  if (height === null) return '';
  return `${height.toLocaleString('de-DE', { maximumFractionDigits: 2 })} m · ${height >= BARRIER_SIGHT_HEIGHT ? 'Blockiert Sicht' : 'Sicht darüber frei'} · Blockiert Bewegung`;
}
