export const ARRIVAL_TELEPORT_SECONDS = 1;
export const ARRIVAL_FADE_SECONDS = .45;

// Local arrival lifecycle. No invented roster: shared rounds require a game server.
export function createMapArrival({ selectionSeconds = 8, revealSeconds = 1.2, teleportSeconds = ARRIVAL_TELEPORT_SECONDS } = {}) {
  let stage = 'ground', elapsed = 0, target = null, settled = 1;
  const durations = { select: selectionSeconds, reveal: revealSeconds, teleport: teleportSeconds };
  const copy = p => p ? { x: p.x, y: p.y, z: p.z } : null;
  const valid = p => p && [p.x, p.y, p.z].every(Number.isFinite);
  const snapshot = () => ({ stage, active: stage !== 'ground', target: copy(target),
    remaining: Math.max(0, (durations[stage] || 0) - elapsed),
    progress: stage === 'ground' ? 1 : Math.min(1, elapsed / durations[stage]),
    height: 0, diveTilt: 0, landing: 0, impact: 1, settled });
  return {
    start(point) { target = valid(point) ? copy(point) : null; stage = 'select'; elapsed = 0; settled = 1; return snapshot(); },
    select(point) { if (stage !== 'select' || !valid(point)) return false; target = copy(point); return true; },
    cancel() { stage = 'ground'; elapsed = 0; target = null; settled = 1; },
    update(dt) {
      let delta = Math.max(0, Number.isFinite(dt) ? dt : 0), landed = false;
      if (stage === 'ground') settled = Math.min(1, settled + delta / ARRIVAL_FADE_SECONDS);
      while (stage !== 'ground' && delta > 0) {
        // A map without any safe fallback never starts on water or inside an obstacle.
        if (stage === 'select' && !target) { elapsed = Math.min(selectionSeconds, elapsed + delta); break; }
        const step = Math.min(delta, Math.max(0, durations[stage] - elapsed));
        elapsed += step; delta -= step;
        if (elapsed + 1e-8 < durations[stage]) break;
        stage = stage === 'select' ? 'reveal' : stage === 'reveal' ? 'teleport' : 'ground';
        elapsed = 0;
        if (stage === 'ground') { settled = Math.min(1, delta / ARRIVAL_FADE_SECONDS); landed = true; }
      }
      return { ...snapshot(), landed };
    }, snapshot,
  };
}

/** Inverse of the inset square island projection, independent of CSS/device pixels. */
export function islandPoint(u, v, bounds, padding = 12 / 256) {
  if (![u, v].every(Number.isFinite) || u < 0 || u > 1 || v < 0 || v > 1) return null;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / (1 - padding * 2);
  return { x: (bounds.minX + bounds.maxX) / 2 + (u - .5) * span,
    z: (bounds.minZ + bounds.maxZ) / 2 + (v - .5) * span };
}
