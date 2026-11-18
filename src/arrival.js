// Start immediately; ten seconds leave enough steering time to cross the island.
export function createArrival({ duration = 10, height = 1600, impactDuration = 2.8 } = {}) {
  let elapsed = duration, active = false, stage = 'ground', impact = 1, startHeight = height, waitingForLanding = false;
  const snapshot = () => {
    const progress = Math.min(1, elapsed / duration);
    const ease = progress * progress * (3 - 2 * progress);
    const altitude = active ? startHeight * (1 - ease) : 0;
    const upright = Math.min(1, altitude / 9);
    return { active, stage, progress, height: altitude, startHeight, impact, waitingForLanding,
      diveTilt: stage === 'dive' ? Math.PI * .76 * Math.min(1, progress * 12) * upright : 0,
      landing: !active && impact < .14 ? Math.sin(impact / .14 * Math.PI) : 0 };
  };
  return {
    start(options = {}) { startHeight = options.height ?? height; elapsed = 0; active = true; stage = 'dive'; impact = 1; waitingForLanding = false; return snapshot(); },
    cancel() { elapsed = duration; active = false; stage = 'ground'; impact = 1; waitingForLanding = false; },
    update(dt, { canLand = true } = {}) {
      const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
      let landed = false;
      if (stage === 'dive') {
        const limit = canLand ? duration : Math.max(elapsed, duration * .95);
        elapsed = Math.min(limit, elapsed + delta);
        waitingForLanding = !canLand && elapsed >= limit;
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

// Slow near the ground for precise steering; keep hovering travel usable over water.
export function arrivalSteeringSpeed(arrival, span) {
  if (arrival.waitingForLanding) return span * .12;
  const t = Math.max(0, Math.min(1, (arrival.height - 15) / 240));
  return 8 + (span * .2 - 8) * t * t * (3 - 2 * t);
}

// The ground and sea are centimetres apart but kilometres from the aerial camera.
// A 10cm near plane loses that depth precision and makes their surfaces flicker.
export function arrivalCameraNear(height) {
  return Math.max(.1, Math.min(5, height * .035));
}
