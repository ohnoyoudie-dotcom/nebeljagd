import { distanceToSegment } from './model.js';

export const ERASER_MIN_RADIUS = .5;
export const ERASER_MAX_RADIUS = 24;
const validPoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

/** Erase complete objects by their saved centre. A house or a broad grass patch
 * is not unexpectedly removed just because its outer edge touches the cursor.
 * Swept segments cover every point between pointer events, even a quick stroke.
 */
export function createObjectEraserStroke(map, { radius = 4, filter = 'all' } = {}) {
  if (!Number.isFinite(radius) || radius < ERASER_MIN_RADIUS || radius > ERASER_MAX_RADIUS) throw new Error('Ungültiger Radiergummi-Radius.');
  if (!['all', 'grass'].includes(filter)) throw new Error('Ungültiger Radiergummi-Filter.');
  const candidates = (map.objects ?? []).filter(item => item && typeof item.id === 'string'
    && validPoint(item.position) && (filter === 'all' || item.kind === 'grass'));
  const removedIds = new Set(), objects = [];
  let previous = null;

  function sample(point) {
    if (!validPoint(point)) return [];
    const start = previous ?? point;
    const removed = [];
    for (const item of candidates) {
      if (removedIds.has(item.id)) continue;
      if (distanceToSegment(item.position, start, point) <= radius) {
        removedIds.add(item.id); objects.push(item); removed.push(item);
      }
    }
    previous = [...point];
    return removed;
  }
  return { radius, filter, objects, removedIds, sample };
}

/** Same centre rule as a stroke, used to show the exact hover targets. */
export function objectEraserTargets(map, point, { radius = 4, filter = 'all' } = {}) {
  if (!validPoint(point)) return [];
  return createObjectEraserStroke(map, { radius, filter }).sample(point);
}
