/** Renderer-independent combat. Health/status belong to entities, not visuals. */
export function createCombat({ onHit, onDefeat } = {}) {
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
      burnRemaining: 0, burnDamagePerSecond: 0, burnSourceId: undefined, slowRemaining: 0, slowFactor: 1,
      poisonRemaining: 0, poisonDamagePerSecond: 0, poisonSourceId: undefined,
      hitFlash: 0, stunRemaining: 0,
      timeSlows: new Map(),
      get alive() { return this.health > 0; },
      get speedMultiplier() {
        if (this.stunRemaining > 0) return 0;
        let factor = this.slowRemaining > 0 ? this.slowFactor : 1;
        for (const slow of this.timeSlows.values()) factor = Math.min(factor, 1 - (1 - slow.factor) * Math.min(1, slow.remaining / .12));
        return factor;
      },
      get canAct() { return this.alive && this.stunRemaining <= 0; },
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
      const duration = Math.max(0, finite(payload.burn.duration, 0));
      const damagePerSecond = Math.max(0, finite(payload.burn.damagePerSecond, 0));
      if (duration > 0 && damagePerSecond > 0) {
        // A stronger burn owns its ongoing damage; an equal-strength refresh
        // belongs to the latest caster. A weaker refresh cannot steal credit.
        if (!target.burnRemaining || damagePerSecond >= target.burnDamagePerSecond) {
          target.burnSourceId = payload.sourceId;
        }
        target.burnRemaining = Math.max(target.burnRemaining, duration);
        target.burnDamagePerSecond = Math.max(target.burnDamagePerSecond, damagePerSecond);
      }
    }
    if (payload.poison && target.alive) {
      const duration = Math.max(0, finite(payload.poison.duration, 0));
      const damagePerSecond = Math.max(0, finite(payload.poison.damagePerSecond, 0));
      if (duration > 0 && damagePerSecond > 0) {
        // Poison has its own caster and timing; applying fire cannot claim it,
        // and a weak refresh cannot steal an existing stronger poison's kill.
        if (!target.poisonRemaining || damagePerSecond >= target.poisonDamagePerSecond) {
          target.poisonSourceId = payload.sourceId;
        }
        target.poisonRemaining = Math.max(target.poisonRemaining, duration);
        target.poisonDamagePerSecond = Math.max(target.poisonDamagePerSecond, damagePerSecond);
      }
    }
    if (payload.slow && target.alive) {
      target.slowRemaining = Math.max(target.slowRemaining, Math.max(0, finite(payload.slow.duration, 0)));
      target.slowFactor = Math.min(target.slowFactor, clamp(finite(payload.slow.multiplier, 1), .1, 1));
    }
    if (target.alive && !target.destructible) target.stunRemaining = Math.max(target.stunRemaining, Math.max(0, finite(payload.stun, 0)));
    const result = { targetId: target.id, damage: before - target.health, health: target.health,
      killed: !target.alive, sourceId: payload.sourceId, type: payload.type ?? 'direct' };
    if (result.killed) {
      target.timeSlows.clear();
      target.stunRemaining = 0;
      target.burnRemaining = target.burnDamagePerSecond = target.slowRemaining = 0;
      target.burnSourceId = undefined;
      target.poisonRemaining = target.poisonDamagePerSecond = 0;
      target.poisonSourceId = undefined;
      target.slowFactor = 1;
    }
    onHit?.(result, target);
    // hit() rejects already-dead targets, so one life can emit only one defeat.
    if (result.killed) onDefeat?.(result, target);
    return result;
  }

  function setTimeSlow(target, source, multiplier, duration = .25) {
    if (!target?.alive || !Number.isFinite(multiplier)) return;
    const entry = target.timeSlows.get(source) ?? {};
    entry.factor = clamp(multiplier, .35, 1); entry.remaining = Math.max(0, finite(duration, .25));
    target.timeSlows.set(source, entry);
  }

  function update(dt) {
    const delta = Math.max(0, finite(dt, 0));
    for (const target of targets.values()) {
      for (const [source, slow] of target.timeSlows) {
        slow.remaining -= delta;
        if (slow.remaining <= 0 || !target.alive) target.timeSlows.delete(source);
      }
      target.hitFlash = Math.max(0, target.hitFlash - delta);
      if (target.alive && target.burnRemaining > 0) {
        hit(target, { damage: Math.min(delta, target.burnRemaining) * target.burnDamagePerSecond,
          sourceId: target.burnSourceId, type: 'burn' });
      }
      if (target.alive && target.poisonRemaining > 0) {
        hit(target, { damage: Math.min(delta, target.poisonRemaining) * target.poisonDamagePerSecond,
          sourceId: target.poisonSourceId, type: 'poison' });
      }
      target.burnRemaining = Math.max(0, target.burnRemaining - delta);
      target.poisonRemaining = Math.max(0, target.poisonRemaining - delta);
      target.slowRemaining = Math.max(0, target.slowRemaining - delta);
      target.stunRemaining = target.alive ? Math.max(0, target.stunRemaining - delta) : 0;
      if (!target.burnRemaining) { target.burnDamagePerSecond = 0; target.burnSourceId = undefined; }
      if (!target.poisonRemaining) { target.poisonDamagePerSecond = 0; target.poisonSourceId = undefined; }
      if (!target.slowRemaining) target.slowFactor = 1;
      if (!target.alive) { target.burnRemaining = target.poisonRemaining = target.slowRemaining = 0; target.slowFactor = 1; }
    }
  }

  function reset() {
    for (const target of targets.values()) {
      target.timeSlows.clear();
      target.health = target.initialHealth;
      target.stunRemaining = 0;
      target.burnRemaining = target.burnDamagePerSecond = target.slowRemaining = target.hitFlash = 0;
      target.burnSourceId = undefined;
      target.poisonRemaining = target.poisonDamagePerSecond = 0;
      target.poisonSourceId = undefined;
      target.slowFactor = 1;
    }
  }

  function traceSegment(start, end, radius = 0, excludeId, ignoredTargets = null) {
    const dx = end.x - start.x, dz = end.z - start.z, distanceSquared = dx * dx + dz * dz;
    const startY = start.y ?? 0, dy = (end.y ?? 0) - startY;
    const projectileRadius = Math.max(0, finite(radius, 0));
    const epsilon = 1e-9;
    let nearest = null;
    for (const target of targets.values()) {
      if (!target.alive || target.id === excludeId || target.targetable === false || ignoredTargets?.has(target.id)) continue;
      const tx = start.x - target.position.x, tz = start.z - target.position.z;
      const reach = target.radius + projectileRadius;
      const c = tx * tx + tz * tz - reach * reach;
      let radialEntry = -Infinity, radialExit = Infinity;
      if (distanceSquared < 1e-12) {
        if (c > epsilon) continue;
      } else {
        const b = tx * dx + tz * dz;
        const discriminant = b * b - distanceSquared * c;
        if (discriminant < -epsilon) continue;
        const root = Math.sqrt(Math.max(0, discriminant));
        radialEntry = (-b - root) / distanceSquared;
        radialExit = (-b + root) / distanceSquared;
      }
      // Intersect the full horizontal and vertical intervals. A descending
      // spell may enter above the head and reach the body later in this same
      // segment; testing height only at horizontal entry would miss that hit.
      const minY = (target.position.y ?? 0) - projectileRadius;
      const maxY = (target.position.y ?? 0) + (target.height ?? 2.3) + projectileRadius;
      let verticalEntry = -Infinity, verticalExit = Infinity;
      if (Math.abs(dy) < epsilon) {
        if (startY < minY - epsilon || startY > maxY + epsilon) continue;
      } else {
        const a = (minY - startY) / dy, b = (maxY - startY) / dy;
        verticalEntry = Math.min(a, b); verticalExit = Math.max(a, b);
      }
      const t = Math.max(0, radialEntry, verticalEntry);
      const exit = Math.min(1, radialExit, verticalExit);
      if (t > exit + epsilon) continue;
      const y = startY + dy * t;
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

  return { targets, addTarget, removeTarget: id => targets.delete(id), hit, setTimeSlow, update, reset, traceSegment, melee };
}
