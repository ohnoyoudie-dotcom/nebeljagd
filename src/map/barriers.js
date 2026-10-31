import { getEnvironmentKitDefinition } from './environment-kit-definitions.js';

/** The authored centreline is independent of the selected model. Generated
 * pieces are disposable runtime data and must never be saved into objects. */
export const BARRIER_STYLES = Object.freeze([
  Object.freeze({ id: 'wall', label: 'Steinmauer', kind: 'wall', variant: 'kit-stone' }),
  Object.freeze({ id: 'wall-cut-stone', label: 'Steinmauer · Pfeiler & Abdeckung', kind: 'wall', variant: 'kit-cut-stone' }),
  Object.freeze({ id: 'wall-tripo', label: 'Steinmauer · Verwittert (Tripo)', kind: 'wall', variant: 'kit-tripo-wall' }),
  Object.freeze({ id: 'fence', label: 'Holzzaun', kind: 'fence', variant: 'kit-wood' }),
  Object.freeze({ id: 'fence-cross-wood', label: 'Holzzaun · Kreuzstreben', kind: 'fence', variant: 'kit-cross-wood' }),
]);
export const BARRIER_LIMITS = Object.freeze({ barriers: 400, points: 128, gaps: 64, length: 5000, objects: 12000 });
const EPS = 1e-7;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const point = value => Array.isArray(value) && value.length === 2 && value.every(finite);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const getBarrierStyle = barrier => typeof barrier === 'string'
  ? BARRIER_STYLES.find(style => style.id === barrier)
  : BARRIER_STYLES.find(style => style.kind === barrier?.kind && style.variant === barrier?.variant);
const expandedMaps = new WeakSet();
let counter = 0;

export function makeBarrier(styleId, points, options = {}) {
  const requested = getBarrierStyle(styleId);
  const style = options.variant ? getBarrierStyle({ kind: requested?.kind, variant: options.variant }) : requested;
  if (!style) throw new Error('Bitte Steinmauer oder Holzzaun wählen.');
  return {
    id: options.id ?? `barrier-${style.kind}-${Date.now().toString(36)}-${(++counter).toString(36)}`,
    name: options.name ?? style.label,
    kind: style.kind,
    variant: style.variant,
    points: points.map(p => [...p]),
    scale: options.scale ?? 1,
    gaps: (options.gaps ?? []).map(gap => ({ ...gap })),
  };
}

export function barrierLength(barrier) {
  const points = barrier?.points;
  if (!Array.isArray(points) || !points.every(point)) return 0;
  return points.slice(1).reduce((sum, p, i) => sum + length(points[i], p), 0);
}

/** Solid line portions, split at every corner and every opening. `at` is the
 * opening's centre distance along the entire line, in world metres. */
export function barrierSections(barrier) {
  const points = barrier?.points;
  if (!Array.isArray(points) || points.length > BARRIER_LIMITS.points || !points.every(point)) return [];
  const total = barrierLength(barrier), gaps = Array.isArray(barrier.gaps) ? barrier.gaps : [];
  const holes = gaps.slice(0, BARRIER_LIMITS.gaps).filter(gap => record(gap) && finite(gap.at) && finite(gap.width) && gap.width > 0)
    .map(gap => [Math.max(0, gap.at - gap.width / 2), Math.min(total, gap.at + gap.width / 2)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const sections = [];
  let from = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], distance = length(a, b), to = from + distance;
    if (distance <= EPS) continue;
    let cursor = from;
    const add = (start, end) => {
      if (end - start > EPS) sections.push({ a: mix(a, b, (start - from) / distance), b: mix(a, b, (end - from) / distance), from: start, to: end });
    };
    for (const [start, end] of holes) {
      if (end <= cursor || start >= to) continue;
      add(cursor, Math.min(start, to));
      cursor = Math.max(cursor, Math.min(end, to));
    }
    add(cursor, to);
    from = to;
  }
  return sections;
}

/** Use the kit's normalized conservative footprint, not the source filename's
 * nominal 3 m. Its tiny overhangs must not intrude into an authored passage. */
export function generateBarrierObjects(barrier) {
  if (!getBarrierStyle(barrier) || !finite(barrier.scale) || barrier.scale < .25 || barrier.scale > 3) throw new Error('Ungültiges Mauer- oder Zaunmodell.');
  if (barrierLength(barrier) > BARRIER_LIMITS.length) throw new Error('Die Strecke ist zu lang.');
  const kit = getEnvironmentKitDefinition(barrier.kind, barrier.variant);
  const moduleLength = 2 * kit.footprint.halfWidth * barrier.scale;
  const objects = [];
  for (const section of barrierSections(barrier)) {
    const size = length(section.a, section.b);
    // Distribute the small remainder over the entire straight portion instead
    // of producing a paper-thin last piece. Height and depth never stretch.
    const count = Math.max(1, Math.ceil(size / moduleLength));
    if (objects.length + count > BARRIER_LIMITS.objects) throw new Error('Zu viele Mauer- und Zaunstücke.');
    const rotation = -Math.atan2(section.b[1] - section.a[1], section.b[0] - section.a[0]);
    for (let i = 0; i < count; i++) objects.push({
      id: `${barrier.id}-segment-${objects.length}`,
      name: barrier.name,
      kind: barrier.kind,
      variant: barrier.variant,
      position: mix(section.a, section.b, (i + .5) / count),
      rotation,
      scale: barrier.scale,
      longitudinalScale: size / count / moduleLength,
      barrierId: barrier.id,
    });
  }
  return objects;
}

/** Runtime-only, immutable expansion. Repeated calls on an expanded document
 * are idempotent without trusting arbitrary imported `barrierId` metadata. */
export function expandBarrierMap(map) {
  if (!map?.barriers?.length || expandedMaps.has(map)) return map;
  if (!Array.isArray(map.barriers) || map.barriers.length > BARRIER_LIMITS.barriers) throw new Error('Ungültige Mauer- und Zaunliste.');
  const objects = [...(map.objects ?? [])];
  for (const barrier of map.barriers) {
    const generated = generateBarrierObjects(barrier);
    if (objects.length + generated.length > BARRIER_LIMITS.objects) throw new Error('Die Karte enthält zu viele Objekte einschließlich Mauern und Zäunen.');
    objects.push(...generated);
  }
  const result = { ...map, objects };
  expandedMaps.add(result);
  return result;
}

/** Check every interval made by polygon-edge intersections. Checking only the
 * endpoints or midpoint would miss narrow bays in a concave island. */
function staysOnIsland(a, b, ring, pointInPolygon) {
  const dx = b[0] - a[0], dz = b[1] - a[1], cuts = [0, 1];
  for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length], ex = d[0] - c[0], ez = d[1] - c[1];
    const determinant = dx * ez - dz * ex;
    if (Math.abs(determinant) < EPS) continue;
    const rx = c[0] - a[0], rz = c[1] - a[1];
    const t = (rx * ez - rz * ex) / determinant, u = (rx * dz - rz * dx) / determinant;
    if (t > 0 && t < 1 && u >= -EPS && u <= 1 + EPS) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  return pointInPolygon(a, ring) && pointInPolygon(b, ring)
    && cuts.slice(1).every((t, i) => pointInPolygon(mix(a, b, (cuts[i] + t) / 2), ring));
}

export function validateBarriers(map, { ids, checkPoint, pointInPolygon, islandValid }) {
  const errors = [], valid = [];
  if (map.barriers === undefined) return errors;
  if (!Array.isArray(map.barriers) || map.barriers.length > BARRIER_LIMITS.barriers) return [`barriers muss eine Liste mit höchstens ${BARRIER_LIMITS.barriers} Strecken sein.`];
  for (const barrier of map.barriers) {
    const before = errors.length, label = `Mauer/Zaun ${typeof barrier?.name === 'string' ? barrier.name : ''}`;
    if (!record(barrier)) { errors.push('Mauer/Zaun: Ein Objekt wird erwartet.'); continue; }
    // Leave space for deterministic runtime segment suffixes in the standard
    // 80-character world object ID contract.
    if (typeof barrier.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,55}$/.test(barrier.id)) errors.push(`${label}: Ungültige ID (höchstens 56 Zeichen).`);
    else if (ids.has(barrier.id)) errors.push(`${label}: Die ID ${barrier.id} wird mehrfach verwendet.`);
    else ids.add(barrier.id);
    if (typeof barrier.name !== 'string' || !barrier.name.trim() || barrier.name.length > 120 || /[\u0000-\u0008\u000b-\u001f]/.test(barrier.name)) errors.push(`${label}: Ungültiger Name.`);
    if (!getBarrierStyle(barrier)) errors.push(`${label}: Bitte eine bekannte Mauer- oder Zaunvariante wählen.`);
    if (!finite(barrier.scale) || barrier.scale < .25 || barrier.scale > 3) errors.push(`${label}: Größe muss zwischen 0,25 und 3 liegen.`);
    let geometryValid = Array.isArray(barrier.points) && barrier.points.length >= 2 && barrier.points.length <= BARRIER_LIMITS.points;
    if (!geometryValid) errors.push(`${label}: Eine Strecke benötigt 2 bis ${BARRIER_LIMITS.points} Punkte.`);
    else {
      geometryValid = barrier.points.map((p, index) => checkPoint(p, `${label} · Punkt ${index + 1}`)).every(Boolean) && barrier.points.every(point);
      if (!geometryValid) errors.push(`${label}: Die Punkte sind ungültig.`);
      else {
        for (let i = 1; i < barrier.points.length; i++) {
          if (length(barrier.points[i - 1], barrier.points[i]) < .1) errors.push(`${label}: Benachbarte Punkte müssen mindestens 10 cm auseinanderliegen.`);
          if (islandValid && !staysOnIsland(barrier.points[i - 1], barrier.points[i], map.island.points, pointInPolygon)) errors.push(`${label}: Die Strecke muss vollständig auf der Insel liegen.`);
        }
        if (barrierLength(barrier) > BARRIER_LIMITS.length) errors.push(`${label}: Die Strecke darf höchstens ${BARRIER_LIMITS.length} m lang sein.`);
      }
    }
    if (!Array.isArray(barrier.gaps) || barrier.gaps.length > BARRIER_LIMITS.gaps) errors.push(`${label}: Durchgänge müssen eine Liste mit höchstens ${BARRIER_LIMITS.gaps} Einträgen sein.`);
    else {
      const total = geometryValid ? barrierLength(barrier) : 0;
      const intervals = [];
      for (const gap of barrier.gaps) {
        if (!record(gap) || !finite(gap.at) || !finite(gap.width) || gap.width < 1 || gap.width > 30) { errors.push(`${label}: Ein Durchgang benötigt eine gültige Position und 1–30 m Breite.`); continue; }
        if (geometryValid && (gap.at - gap.width / 2 < -EPS || gap.at + gap.width / 2 > total + EPS)) errors.push(`${label}: Ein Durchgang liegt außerhalb der Strecke.`);
        intervals.push([gap.at - gap.width / 2, gap.at + gap.width / 2]);
      }
      intervals.sort((a, b) => a[0] - b[0]);
      if (intervals.some((gap, index) => index > 0 && gap[0] < intervals[index - 1][1] - EPS)) errors.push(`${label}: Durchgänge dürfen sich nicht überlappen.`);
      if (geometryValid && total > 0 && barrierSections(barrier).length === 0) errors.push(`${label}: Ein Durchgang darf nicht die gesamte Strecke entfernen.`);
    }
    if (errors.length === before) valid.push(barrier);
  }
  let count = Array.isArray(map.objects) ? map.objects.length : 0;
  for (const barrier of valid) {
    let pieces;
    try { pieces = generateBarrierObjects(barrier); } catch (error) { errors.push(error.message); continue; }
    count += pieces.length;
    for (const piece of pieces) {
      if (ids.has(piece.id)) errors.push(`Mauer/Zaun ${barrier.name}: Die erzeugte Objekt-ID ${piece.id} wird bereits verwendet.`);
      else ids.add(piece.id);
    }
    if (count > BARRIER_LIMITS.objects) { errors.push(`Objekte, Mauern und Zäune dürfen zusammen höchstens ${BARRIER_LIMITS.objects} Bauteile ergeben.`); break; }
  }
  return errors;
}
