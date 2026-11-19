export const ARRIVAL_TELEPORT_SECONDS = 2.8;
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

// Shared clock keeps the aperture, visibility and existing walk animation in sync.
export function portalArrivalPose(arrival) {
  const active = arrival?.stage === 'teleport';
  const age = active ? arrival.progress * ARRIVAL_TELEPORT_SECONDS : 0;
  const walk = Math.max(0, Math.min(1, (age - 1.05) / 1.1));
  const eased = walk * walk * (3 - 2 * walk);
  return { visible: !arrival?.active || active && age >= 1.05,
    walking: active && walk > 0 && walk < 1, offsetZ: active && walk < 1 ? -1.05 * (1 - eased) : 0,
    speed: active ? 1.05 / 1.1 * 6 * walk * (1 - walk) : 0, age };
}

export function arrivalMapView(bounds, focus, zoom = 1) {
  const fullSpan = Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)/(1-24/256);
  const span = fullSpan / Math.max(1,Math.min(4,zoom));
  const cx=(bounds.minX+bounds.maxX)/2,cz=(bounds.minZ+bounds.maxZ)/2;
  const margin=(fullSpan-span)/2;
  return {span, x:Math.max(cx-margin,Math.min(cx+margin,focus?.x??cx)),
    z:Math.max(cz-margin,Math.min(cz+margin,focus?.z??cz))};
}
export function arrivalViewPoint(u,v,view) {
  if (![u,v].every(Number.isFinite)||u<0||u>1||v<0||v>1)return null;
  return {x:view.x+(u-.5)*view.span,z:view.z+(v-.5)*view.span};
}
export function moveArrivalCursor(cursor, dx, dz, dt, bounds, zoom = 1) {
  const length=Math.hypot(dx,dz); if(!length)return {...cursor};
  const speed=Math.max(bounds.maxX-bounds.minX,bounds.maxZ-bounds.minZ)*.28/zoom;
  return {x:Math.max(bounds.minX,Math.min(bounds.maxX,cursor.x+dx/length*speed*dt)),
    z:Math.max(bounds.minZ,Math.min(bounds.maxZ,cursor.z+dz/length*speed*dt))};
}
