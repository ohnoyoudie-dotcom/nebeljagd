const positive = value => Number.isFinite(value) ? Math.max(0, value) : 0;
export function resetDarkened(target) {
  target.darkenedRemaining = 0; target.darkenedRadius = Infinity; target.darkenedSourceId = null;
}
export function applyDarkened(target, payload = {}) {
  if (!target.alive || target.destructible) return;
  const duration = positive(payload.darken?.duration), radius = positive(payload.darken?.radius);
  if (!duration || !radius) return;
  target.darkenedRadius = target.darkenedRemaining > 0 ? Math.min(target.darkenedRadius, radius) : radius;
  target.darkenedRemaining = Math.max(target.darkenedRemaining, duration);
  target.darkenedSourceId = payload.sourceId;
}
export function updateDarkened(target, dt) {
  target.darkenedRemaining = Math.max(0, target.darkenedRemaining - positive(dt));
  if (!target.alive || target.darkenedRemaining <= 1e-8) resetDarkened(target);
}
export function effectiveSightRadius(target) {
  return Math.min(target?.blindRemaining > 0 ? target.blindRadius : Infinity,
    target?.darkenedRemaining > 0 ? target.darkenedRadius : Infinity);
}
