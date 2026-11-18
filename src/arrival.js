// Ground position remains authoritative; height is a presentation offset only.
export function createArrival({ duration = 3.8, height = 24 } = {}) {
  let elapsed = duration, active = false, impact = 1;
  const snapshot = () => {
    const progress = Math.min(1, elapsed / duration);
    // Accelerate into the descent, then brake gently for a readable landing.
    const ease = progress * progress * (3 - 2 * progress);
    return { active, progress, height: active ? height * (1 - ease) : 0,
      impact, landing: !active && impact < 1 ? Math.sin(impact * Math.PI) : 0 };
  };
  return {
    start() { elapsed = 0; active = true; impact = 1; return snapshot(); },
    cancel() { elapsed = duration; active = false; impact = 1; },
    update(dt) {
      const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
      let landed = false;
      if (active) {
        elapsed = Math.min(duration, elapsed + delta);
        if (elapsed >= duration - 1e-8) { elapsed = duration; active = false; impact = 0; landed = true; }
      } else impact = Math.min(1, impact + delta / .65);
      return { ...snapshot(), landed };
    },
    snapshot,
  };
}

// Reject unsafe steering without snapping the airborne player to another shore.
export function steerArrival(position, direction, dt, { resolve, safe, speed = 5 } = {}) {
  const previous = position.clone();
  const length = Math.hypot(direction.x, direction.z);
  if (length > 0) position.addScaledVector(direction, speed * Math.max(0, dt) / Math.max(1, length));
  resolve(position);
  if (!safe(position) || Math.hypot(position.x - previous.x, position.z - previous.z) > speed * dt + .5) position.copy(previous);
  return position;
}
