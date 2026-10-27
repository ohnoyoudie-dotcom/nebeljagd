/** Renderer-independent combat. Health/status belong to entities, not visuals. */
export function createCombat({ onHit } = {}) {
  const targets = new Map();
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function addTarget(definition) {
    if (!definition?.id || !definition.position) throw new Error('Combat target needs id and position.');
    if (targets.has(definition.id)) throw new Error(`Duplicate combat target: ${definition.id}`);
    const maxHealth = Math.max(1, finite(definition.maxHealth, 100));
    const target = {
      ...definition, radius: Math.max(.05, finite(definition.radius, .45)), maxHealth,
      health: clamp(finite(definition.health, maxHealth), 0, maxHealth),
      burnRemaining: 0, burnDamagePerSecond: 0, slowRemaining: 0, slowFactor: 1,
      hitFlash: 0,
      get alive() { return this.health > 0; },
      get speedMultiplier() { return this.slowRemaining > 0 ? this.slowFactor : 1; },
    };
    target.initialHealth = target.health;
    targets.set(target.id, target);
    return target;
  }

  function hit(targetOrId, payload = {}) {
    const target = typeof targetOrId === 'string' ? targets.get(targetOrId) : targetOrId;
    if (!target || !target.alive || target.id === payload.sourceId) return null;
    const before = target.health;
    target.health = Math.max(0, target.health - Math.max(0, finite(payload.damage, 0)));
    target.hitFlash = .16;
    if (payload.burn && target.alive) {
      target.burnRemaining = Math.max(target.burnRemaining, Math.max(0, finite(payload.burn.duration, 0)));
      target.burnDamagePerSecond = Math.max(target.burnDamagePerSecond, Math.max(0, finite(payload.burn.damagePerSecond, 0)));
    }
    if (payload.slow && target.alive) {
      target.slowRemaining = Math.max(target.slowRemaining, Math.max(0, finite(payload.slow.duration, 0)));
      target.slowFactor = Math.min(target.slowFactor, clamp(finite(payload.slow.multiplier, 1), .1, 1));
    }
    const result = { targetId: target.id, damage: before - target.health, health: target.health,
      killed: !target.alive, sourceId: payload.sourceId, type: payload.type ?? 'direct' };
    onHit?.(result, target);
    return result;
  }

  function update(dt) {
    const delta = Math.max(0, finite(dt, 0));
    for (const target of targets.values()) {
      target.hitFlash = Math.max(0, target.hitFlash - delta);
      if (target.alive && target.burnRemaining > 0) {
        hit(target, { damage: Math.min(delta, target.burnRemaining) * target.burnDamagePerSecond, type: 'burn' });
      }
      target.burnRemaining = Math.max(0, target.burnRemaining - delta);
      target.slowRemaining = Math.max(0, target.slowRemaining - delta);
      if (!target.burnRemaining) target.burnDamagePerSecond = 0;
      if (!target.slowRemaining) target.slowFactor = 1;
      if (!target.alive) { target.burnRemaining = target.slowRemaining = 0; target.slowFactor = 1; }
    }
  }

  function reset() {
    for (const target of targets.values()) {
      target.health = target.initialHealth;
      target.burnRemaining = target.burnDamagePerSecond = target.slowRemaining = target.hitFlash = 0;
      target.slowFactor = 1;
    }
  }

  function traceSegment(start, end, radius = 0, excludeId) {
    const dx = end.x - start.x, dz = end.z - start.z, distanceSquared = dx * dx + dz * dz;
    let nearest = null;
    for (const target of targets.values()) {
      if (!target.alive || target.id === excludeId || target.targetable === false) continue;
      const tx = start.x - target.position.x, tz = start.z - target.position.z;
      const reach = target.radius + radius;
      const c = tx * tx + tz * tz - reach * reach;
      let t = 0;
      if (c > 0) {
        if (distanceSquared < 1e-12) continue;
        const b = tx * dx + tz * dz;
        const discriminant = b * b - distanceSquared * c;
        if (discriminant < 0) continue;
        t = (-b - Math.sqrt(discriminant)) / distanceSquared;
        if (t < 0 || t > 1) continue;
      }
      const y = (start.y ?? 0) + ((end.y ?? 0) - (start.y ?? 0)) * t;
      // Targets are upright capsules in plan view. Prevent hits through hills/floors.
      if (y < (target.position.y ?? 0) - radius || y > (target.position.y ?? 0) + (target.height ?? 2.3) + radius) continue;
      if (!nearest || t < nearest.t) nearest = { target, t,
        point: { x: start.x + dx * t, y, z: start.z + dz * t } };
    }
    return nearest;
  }

  function melee(position, direction, range = 2.35, arc = Math.PI * .8, excludeId) {
    const hits = [];
    for (const target of targets.values()) {
      if (!target.alive || target.id === excludeId || target.targetable === false) continue;
      const dx = target.position.x - position.x, dz = target.position.z - position.z;
      if (Math.hypot(dx, dz) > range + target.radius || Math.abs((target.position.y ?? 0) - (position.y ?? 0)) > 2) continue;
      const angle = Math.atan2(dx, dz) - direction;
      if (Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= arc / 2) hits.push(target);
    }
    return hits;
  }

  return { targets, addTarget, removeTarget: id => targets.delete(id), hit, update, reset, traceSegment, melee };
}
