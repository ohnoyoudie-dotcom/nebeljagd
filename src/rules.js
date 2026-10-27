export const MAX_HEALTH = 100;
export const START_HEALTH = 72;
export const WALK_SPEED = 5.6;
export const ROLL_SPEED = 8.8;
export const ROLL_DURATION = 0.52;
export const ROLL_COOLDOWN = 2.5;
export const ZONE = { initial: 32, minimum: 10, grace: 40, duration: 180, damage: 11 };

export function zoneAt(elapsed) {
  const progress = Math.max(0, Math.min(1, (elapsed - ZONE.grace) / ZONE.duration));
  const eased = progress * progress * (3 - 2 * progress);
  return {
    radius: ZONE.initial + (ZONE.minimum - ZONE.initial) * eased,
    progress,
    countdown: elapsed < ZONE.grace ? ZONE.grace - elapsed : Math.max(0, ZONE.grace + ZONE.duration - elapsed),
    shrinking: elapsed >= ZONE.grace && progress < 1,
  };
}

export function isInDanger(position, radius) {
  return Math.hypot(position.x, position.z) > radius;
}

export function healthAfterDamage(health, dt, inDanger) {
  return Math.max(0, health - (inDanger ? ZONE.damage * Math.max(0, dt) : 0));
}

export function healedHealth(health, amount) {
  return Math.min(MAX_HEALTH, Math.max(0, health + amount));
}
