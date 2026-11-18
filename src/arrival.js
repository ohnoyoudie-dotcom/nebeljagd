// Survey the whole island at altitude; the descent begins only after confirmation.
export function createArrival({ duration = 6.2, height = 1600, impactDuration = 2.8 } = {}) {
  let elapsed = duration, active = false, stage = 'ground', impact = 1, startHeight = height;
  const snapshot = () => {
    const progress = stage === 'survey' ? 0 : Math.min(1, elapsed / duration);
    const ease = progress * progress * (3 - 2 * progress);
    const altitude = active ? startHeight * (1 - ease) : 0;
    const upright = Math.min(1, altitude / 9);
    return { active, stage, progress, height: altitude, startHeight, impact,
      diveTilt: stage === 'dive' ? Math.PI * .76 * Math.min(1, progress * 12) * upright : stage === 'survey' ? .8 : 0,
      landing: !active && impact < .14 ? Math.sin(impact / .14 * Math.PI) : 0 };
  };
  return {
    start(options = {}) { startHeight = options.height ?? height; elapsed = 0; active = true; stage = 'survey'; impact = 1; return snapshot(); },
    dive() { if (stage !== 'survey') return false; stage = 'dive'; elapsed = 0; return true; },
    cancel() { elapsed = duration; active = false; stage = 'ground'; impact = 1; },
    update(dt) {
      const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
      let landed = false;
      if (stage === 'dive') {
        elapsed = Math.min(duration, elapsed + delta);
        if (elapsed >= duration - 1e-8) { elapsed = duration; active = false; stage = 'ground'; impact = 0; landed = true; }
      } else if (!active) impact = Math.min(1, impact + delta / impactDuration);
      return { ...snapshot(), landed };
    }, snapshot,
  };
}

export function resolveArrivalTarget(point, { resolve, safe, heightAt, bounds, maxCorrection = 2 } = {}) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z) ||
    point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ || !safe(point)) return null;
  const result = point.clone();
  for (let i = 0; i < 3; i++) resolve(result);
  if (!safe(result) || Math.hypot(result.x-point.x,result.z-point.z) > maxCorrection) return null;
  const check = result.clone(); resolve(check);
  if (Math.hypot(check.x-result.x,check.z-result.z) > .01) return null;
  result.y = heightAt(result.x, result.z);
  return result;
}

// Air travel can cross water, walls and disconnected islands. Only landing is constrained.
export function steerArrival(position, direction, dt, { bounds, speed = 280 } = {}) {
  const length = Math.hypot(direction.x, direction.z);
  if (length > 0) position.addScaledVector(direction, speed * Math.max(0, dt) / Math.max(1, length));
  position.x = Math.max(bounds.minX, Math.min(bounds.maxX, position.x));
  position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, position.z));
  return position;
}
