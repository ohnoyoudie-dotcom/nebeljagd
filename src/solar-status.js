const positive = value => Number.isFinite(value) ? Math.max(0, value) : 0;

export function resetSolarStatus(target) {
  target.blindRemaining = target.revealRemaining = 0;
  target.blindRadius = Infinity;
}

export function applySolarStatus(target, { blind, reveal } = {}) {
  if (!target.alive || target.destructible) return;
  const duration = positive(blind?.duration), radius = positive(blind?.radius);
  if (duration > 0 && radius > 0) {
    target.blindRadius = target.blindRemaining > 0 ? Math.min(target.blindRadius, radius) : radius;
    target.blindRemaining = Math.max(target.blindRemaining, duration);
  }
  target.revealRemaining = Math.max(target.revealRemaining, positive(reveal));
}

export function updateSolarStatus(target, dt) {
  if (!target.alive) { resetSolarStatus(target); return; }
  const delta = positive(dt);
  target.blindRemaining = Math.max(0, target.blindRemaining - delta);
  target.revealRemaining = Math.max(0, target.revealRemaining - delta);
  if (!target.blindRemaining) target.blindRadius = Infinity;
}
