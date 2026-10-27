import { pointInPolygon, distanceToSegment } from './model.js';
import { makeWorldObject } from './objects.js';

export const MAX_WORLD_OBJECTS = 12000;
export const GRASS_BRUSH_MIN_RADIUS = 1;
export const GRASS_BRUSH_MAX_RADIUS = 16;

/** Keep the whole brush footprint on land, including concave coastline edges. */
export function canPaintGrass(point, island, radius) {
  if (!Array.isArray(point) || !point.every(Number.isFinite) || !pointInPolygon(point, island)) return false;
  for (let i = 0; i < island.length; i++) {
    if (distanceToSegment(point, island[i], island[(i + 1) % island.length]) < radius) return false;
  }
  return true;
}

/** One pointer gesture, independent of frame rate or pointer event density.
 * It only returns new ordinary world objects; the caller commits/undoes once.
 */
export function createGrassBrushStroke(map, { radius = 4, maxObjects = MAX_WORLD_OBJECTS } = {}) {
  if (!Number.isFinite(radius) || radius < GRASS_BRUSH_MIN_RADIUS || radius > GRASS_BRUSH_MAX_RADIUS) throw new Error('Ungültiger Gras-Pinselradius.');
  const spacing = radius * 1.05;
  const cellSize = Math.max(2, radius * 2);
  const cells = new Map(), objects = [];
  const room = Math.max(0, Math.min(MAX_WORLD_OBJECTS, maxObjects) - (map.objects?.length ?? 0));
  let maxRadius = radius, previous = null, nextDistance = spacing, full = false, skipped = 0;
  function addToIndex(position, itemRadius) {
    const key = `${Math.floor(position[0] / cellSize)},${Math.floor(position[1] / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ position, radius: itemRadius });
    maxRadius = Math.max(maxRadius, itemRadius);
  }
  for (const item of map.objects ?? []) if (item.kind === 'grass' && item.variant === 'tall') {
    addToIndex(item.position, (item.radius ?? 3.5) * (item.scale ?? 1));
  }
  function covered(point) {
    const reach = (radius + maxRadius) * .45;
    for (let x = Math.floor((point[0] - reach) / cellSize); x <= Math.floor((point[0] + reach) / cellSize); x++) {
      for (let z = Math.floor((point[1] - reach) / cellSize); z <= Math.floor((point[1] + reach) / cellSize); z++) {
        for (const item of cells.get(`${x},${z}`) ?? []) {
          if (Math.hypot(point[0] - item.position[0], point[1] - item.position[1]) < (radius + item.radius) * .45) return true;
        }
      }
    }
    return false;
  }
  function stamp(point) {
    if (objects.length >= room) { full = true; return; }
    const position = point.map(value => Math.round(value * 100) / 100);
    if (!canPaintGrass(position, map.island.points, radius) || covered(position)) { skipped++; return; }
    const item = makeWorldObject('grass', position, { variant: 'tall', radius, name: 'Versteckgras · Pinsel', rotation: 0, scale: 1 });
    objects.push(item); addToIndex(position, radius);
  }
  function sample(point) {
    if (!Array.isArray(point) || !point.every(Number.isFinite)) return [];
    const before = objects.length;
    if (!previous) stamp(point);
    else {
      const dx = point[0] - previous[0], dz = point[1] - previous[1], length = Math.hypot(dx, dz);
      let distance = nextDistance;
      while (distance <= length && !full) {
        stamp([previous[0] + dx / length * distance, previous[1] + dz / length * distance]);
        distance += spacing;
      }
      nextDistance = Math.max(.0001, distance - length);
    }
    previous = [...point];
    return objects.slice(before);
  }
  return { radius, spacing, objects, sample, get full() { return full; }, get skipped() { return skipped; } };
}
