import { pointInPolygon, distanceToSegment } from './model.js';
import { getObjectDefinition, makeWorldObject } from './objects.js';
import { BIOME_PRESETS, VEGETATION_TYPES, TERRAIN_TYPES, LANDSCAPE_LIMITS, getLandscape, vegetationSettings, terrainSettings } from './landscape.js';
import { getMoundDefinition } from '../overgrown-mounds.js';
import { getEnvironmentKitDefinition } from './environment-kit-definitions.js';

/** Landscape gestures create ordinary saved records, never hidden runtime props.
 * Callers append the returned arrays and commit the whole gesture once. */
export const LANDSCAPE_STROKE_LIMITS = Object.freeze({ objects: 256, terrain: 512, biomes: 256 });
const MAX_OBJECTS = 12000, CELL = 16, TAU = Math.PI * 2;
const pointValid = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = n => Math.round(n * 1000) / 1000;
let stampCounter = 0;
const id = kind => `paint-${kind}-${Date.now().toString(36)}-${(++stampCounter).toString(36)}`;
function randomSource(seed) {
  let state = seed >>> 0;
  return () => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}
function number(value, fallback, min, max, label) {
  const n = value ?? fallback;
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label}: Wert muss zwischen ${min} und ${max} liegen.`);
  return n;
}
const validSeed = value => number(value, 1, 0, 4294967295, 'Zufallswert') >>> 0;
const localPoint = (point, item) => {
  const dx = point[0] - item.position[0], dz = point[1] - item.position[1], c = Math.cos(item.rotation ?? 0), s = Math.sin(item.rotation ?? 0);
  return [(c * dx - s * dz) / (item.scale ?? 1), (s * dx + c * dz) / (item.scale ?? 1)];
};
const rectDistance = (p, minX, maxX, minZ, maxZ) => Math.hypot(Math.max(minX - p[0], 0, p[0] - maxX), Math.max(minZ - p[1], 0, p[1] - maxZ));
const large = kind => ['tree', 'rock', 'house', 'mound', 'ruin', 'shrine', 'wall', 'fence', 'crate', 'wagon', 'barrel', 'well'].includes(kind);
const collisionRadius = item => {
  const kit = getEnvironmentKitDefinition(item.kind, item.variant);
  if (kit?.circles.length) return kit.circles[0].radius * (item.scale ?? 1);
  if (kit?.walls.length) return Math.hypot(kit.footprint.halfWidth, kit.footprint.halfDepth) * (item.scale ?? 1);
  return (item.kind === 'tree' ? item.variant === 'birch' ? .3 : .6 : item.kind === 'rock' ? 1.35 : item.kind === 'shrine' ? 1 : item.kind === 'bush' ? .7 : item.kind === 'grass' || item.kind === 'flower' ? item.radius ?? 1 : .6) * (item.scale ?? 1);
};
const objectBound = item => {
  const kit = getEnvironmentKitDefinition(item.kind, item.variant);
  if (kit?.solid) return Math.hypot(kit.footprint.halfWidth, kit.footprint.halfDepth) * (item.scale ?? 1);
  return item.kind === 'house' ? 14 * (item.scale ?? 1) : item.kind === 'ruin' ? 8 * (item.scale ?? 1) : item.kind === 'mound' ? 7 * (item.scale ?? 1) : collisionRadius(item);
};

function cellsIndex() {
  const cells = new Map();
  function add(record, position, radius) {
    for (let x = Math.floor((position[0] - radius) / CELL); x <= Math.floor((position[0] + radius) / CELL); x++) {
      for (let z = Math.floor((position[1] - radius) / CELL); z <= Math.floor((position[1] + radius) / CELL); z++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(record);
      }
    }
  }
  function near(position, radius = 0) {
    const found = new Set();
    for (let x = Math.floor((position[0] - radius) / CELL); x <= Math.floor((position[0] + radius) / CELL); x++) {
      for (let z = Math.floor((position[1] - radius) / CELL); z <= Math.floor((position[1] + radius) / CELL); z++) {
        for (const record of cells.get(`${x},${z}`) ?? []) found.add(record);
      }
    }
    return found;
  }
  return { add, near };
}

/** Conservative scenery placement: preserve traversable roads, spawn space,
 * water and existing structures. Rotated houses and mound footprints are tested
 * in their own coordinates, not as large circles around their centres. */
export function createLandscapePlacementGuard(map) {
  const objects = cellsIndex(), segments = cellsIndex();
  const addObject = item => {
    if (pointValid(item?.position)) objects.add(item, item.position, objectBound(item));
  };
  for (const item of map.objects ?? []) addObject(item);
  for (const [kind, lines] of [['water', map.rivers ?? []], ['path', map.paths ?? []]]) {
    for (const line of lines) for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i], half = line.width / 2;
      const record = { a, b, half, kind };
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const count = Math.max(1, Math.ceil(length / CELL));
      for (let j = 0; j <= count; j++) segments.add(record, [a[0] + (b[0] - a[0]) * j / count, a[1] + (b[1] - a[1]) * j / count], CELL + half);
    }
  }
  function reason(position, radius = 0, kind = 'grass', minDistance = 0, type) {
    if (!pointValid(position) || !pointInPolygon(position, map.island.points)) return 'coast';
    if (map.island.points.some((p, i, ring) => distanceToSegment(position, p, ring[(i + 1) % ring.length]) < radius)) return 'coast';
    for (const segment of segments.near(position, radius)) {
      if (distanceToSegment(position, segment.a, segment.b) < segment.half + radius + .3) return segment.kind;
    }
    // Ground paint is cosmetic: it can pass beneath scenery and across roads,
    // but its use below calls reason only for the centre's land/water checks.
    if (large(kind)) {
      const start = map.gameplay?.spawnPosition;
      if (pointValid(start) && Math.hypot(position[0] - start[0], position[1] - start[1]) < radius + 3) return 'spawn';
      for (const spawn of map.spawnAreas ?? []) if (Math.hypot(position[0] - spawn.position[0], position[1] - spawn.position[1]) < spawn.radius + radius + 1) return 'spawn';
    }
    for (const item of objects.near(position, Math.max(radius + .4, minDistance))) {
      const d = Math.hypot(position[0] - item.position[0], position[1] - item.position[1]);
      const scale = item.scale ?? 1, p = localPoint(position, item), margin = (radius + .35) / scale;
      const kit = getEnvironmentKitDefinition(item.kind, item.variant);
      if (kit?.solid) {
        if (kit.walls.some(body => rectDistance(p, body.minX, body.maxX, body.minZ, body.maxZ) < margin)
          || kit.circles.some(body => Math.hypot(p[0] - body.x, p[1] - body.z) < body.radius + margin)) return 'structure';
        // Preserve the small open house's floor and entrance, without applying
        // the much larger footprint of the original procedural cottages.
        if (item.kind === 'house' && (rectDistance(p, -kit.footprint.halfWidth, kit.footprint.halfWidth,
          -kit.footprint.halfDepth, kit.footprint.halfDepth) < margin
          || rectDistance(p, -kit.entranceHalfWidth, kit.entranceHalfWidth, kit.footprint.halfDepth, kit.footprint.halfDepth + 1) < margin)) return 'structure';
      } else if (item.kind === 'house') {
        if (rectDistance(p, -8.5, 8.5, -7.5, 7.5) < margin || rectDistance(p, -2.5, 2.5, 7, 10) < margin) return 'structure';
      } else if (item.kind === 'ruin') {
        if (rectDistance(p, -5.5, 5.5, -5.5, 5.5) < margin) return 'structure';
      } else if (item.kind === 'mound') {
        const columns = getMoundDefinition(item.variant).columns;
        if (columns.some(([a, b, c, d]) => rectDistance(p, a, b, c, d) < margin)) return 'structure';
      } else if (['tree', 'rock', 'shrine'].includes(item.kind) && d < collisionRadius(item) + radius + .35) return 'object';
      if (large(kind) && large(item.kind) && d < minDistance) return 'spacing';
      // Painted cover may surround trees, but repeatedly tracing the same area
      // must not silently multiply all its grass meshes.
      if (kind === 'grass' && item.kind === 'grass' && (!type || vegetationSettings(item).type === type)
        && d < (radius + collisionRadius(item)) * .42) return 'spacing';
      if (kind === 'flower' && item.kind === 'flower' && d < (radius + collisionRadius(item)) * .55) return 'spacing';
      if (kind === 'bush' && item.kind === 'bush' && d < radius + collisionRadius(item)) return 'spacing';
      // Loot and chests should remain reachable and readable.
      if (large(kind) && ['chest', 'heart', 'bow', 'sword', 'fireStaff', 'iceStaff'].includes(item.kind) && d < radius + 1.5) return 'loot';
    }
    return null;
  }
  function terrainReason(position, radius = 0) {
    if (!pointValid(position) || !pointInPolygon(position, map.island.points)) return 'coast';
    for (const segment of segments.near(position)) if (segment.kind === 'water' && distanceToSegment(position, segment.a, segment.b) < segment.half) return 'water';
    return null;
  }
  return { reason, terrainReason, addObject };
}

function strokeBase(map, options, stamp, { vegetation = false } = {}) {
  const radius = number(options.radius, vegetation ? 4 : 12, .5, vegetation ? 20 : 80, 'Pinselradius');
  const strength = number(options.strength, 1, 0, 1, 'Pinselstärke');
  const seed = validSeed(options.seed ?? options.vegetation?.seed ?? options.scatter?.seed);
  const random = randomSource(seed), saved = getLandscape(map), guard = createLandscapePlacementGuard(map);
  const objects = [], terrain = [], biomes = [], reasonCounts = {};
  const objectRoom = Math.max(0, Math.min(options.maxObjects ?? MAX_OBJECTS, MAX_OBJECTS) - (map.objects?.length ?? 0));
  const terrainRoom = Math.max(0, LANDSCAPE_LIMITS.terrain - saved.terrain.length);
  const biomeRoom = Math.max(0, LANDSCAPE_LIMITS.biomes - saved.biomes.length);
  let previous = null, nextDistance = 0, full = false, skipped = 0;
  const spacing = Math.max(.35, radius * .65);
  const skippedAt = reason => { skipped++; reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1; };
  function addObject(object) {
    if (objects.length >= Math.min(objectRoom, LANDSCAPE_STROKE_LIMITS.objects)) { full = true; skippedAt('capacity'); return false; }
    objects.push(object); guard.addObject(object); return true;
  }
  function addTerrain(item) {
    if (terrain.length >= Math.min(terrainRoom, LANDSCAPE_STROKE_LIMITS.terrain)) { full = true; skippedAt('capacity'); return false; }
    terrain.push(item); return true;
  }
  function addBiome(item) {
    if (biomes.length >= Math.min(biomeRoom, LANDSCAPE_STROKE_LIMITS.biomes)) { full = true; skippedAt('capacity'); return false; }
    biomes.push(item); return true;
  }
  const context = { map, radius, strength, seed, random, guard, objects, terrain, biomes, addObject, addTerrain, addBiome, skippedAt, get full() { return full; } };
  function sample(point) {
    const startCounts = [objects.length, terrain.length, biomes.length];
    if (!pointValid(point) || full || strength === 0) return { objects: [], terrain: [], biomes: [] };
    if (!previous) { stamp(point, context); nextDistance = spacing; }
    else {
      const dx = point[0] - previous[0], dz = point[1] - previous[1], length = Math.hypot(dx, dz);
      let distance = nextDistance;
      while (distance <= length + 1e-8 && !full) {
        stamp([previous[0] + dx / length * distance, previous[1] + dz / length * distance], context);
        distance += spacing;
      }
      nextDistance = Math.max(.00001, distance - length);
    }
    previous = [...point];
    return { objects: objects.slice(startCounts[0]), terrain: terrain.slice(startCounts[1]), biomes: biomes.slice(startCounts[2]) };
  }
  return { radius, strength, seed, spacing, objects, terrain, biomes, reasonCounts, sample,
    get full() { return full; }, get skipped() { return skipped; } };
}

function vegetationOptions(options) {
  const settings = vegetationSettings({ kind: 'grass', variant: options.vegetation?.type === 'short' ? 'short' : 'tall', vegetation: options.vegetation });
  const definition = VEGETATION_TYPES.find(item => item.id === settings.type);
  if (!definition) throw new Error('Unbekannter Vegetationstyp.');
  settings.density = number(settings.density, 1, 0, 1, 'Vegetationsdichte');
  settings.height = number(settings.height, 1, .25, 3, 'Vegetationshöhe');
  settings.heightVariation = number(settings.heightVariation, .12, 0, .5, 'Höhenvariation');
  return { settings, definition };
}
function vegetationStamp(point, context, configuration, radius = context.radius) {
  const { settings, definition } = configuration, { random, guard, strength } = context;
  if (settings.density * strength === 0) return;
  const reason = guard.reason(point, radius, 'grass', 0, settings.type);
  if (reason) { context.skippedAt(reason); return; }
  const object = makeWorldObject('grass', point.map(round), { variant: definition.variant, radius: round(radius),
    name: `${definition.label} · Pinsel`, rotation: round(random() * TAU), scale: 1 });
  object.vegetation = { ...settings, density: round(settings.density * strength), seed: Math.floor(random() * 4294967296) };
  context.addObject(object);
  // Blumenwiese still uses the imported Rei blossoms. Its ground-cover record
  // remains an ordinary grass patch with all height/density settings editable.
  if (settings.type === 'flowers' && !context.full && random() < .8 * strength) {
    const flower = makeWorldObject('flower', point.map(round), { variant: ['rei-white', 'rei-red', 'rei-gold'][Math.floor(random() * 3)],
      radius: clamp(radius * .45, .5, 3), name: 'Blumenwiese · Blüten', rotation: round(random() * TAU), scale: .8 + random() * .4 });
    context.addObject(flower);
  }
}

export function createVegetationStroke(map, options = {}) {
  const config = vegetationOptions(options);
  return strokeBase(map, options, (point, context) => vegetationStamp(point, context, config), { vegetation: true });
}
function terrainOptions(options) {
  const result = terrainSettings(options.terrain?.type);
  for (const key of ['type', 'color', 'hardness', 'strength', 'variation']) if (options.terrain?.[key] !== undefined) result[key] = options.terrain[key];
  if (!TERRAIN_TYPES.some(type => type.id === result.type)) throw new Error('Unbekannte Bodenart.');
  if (!/^#[a-fA-F0-9]{6}$/.test(result.color)) throw new Error('Die Bodenfarbe benötigt #RRGGBB.');
  result.strength = number(result.strength, .8, 0, 1, 'Bodenstärke');
  result.hardness = number(result.hardness, .3, 0, 1, 'Pinselhärte');
  result.variation = number(result.variation, .18, 0, 1, 'Bodenvariation');
  return result;
}
function terrainStamp(point, context, config) {
  if (config.strength * context.strength === 0) return false;
  const reason = context.guard.terrainReason(point);
  if (reason) { context.skippedAt(reason); return false; }
  return context.addTerrain({ id: id('terrain'), name: 'Gemalter Boden', ...config,
    position: point.map(round), radius: context.radius, strength: round(config.strength * context.strength), seed: Math.floor(context.random() * 4294967296) });
}
export function createTerrainStroke(map, options = {}) {
  const config = terrainOptions(options);
  return strokeBase(map, options, (point, context) => terrainStamp(point, context, config));
}

function scatterOptions(options = {}) {
  const defaults = { density: .4, minDistance: 4, scaleMin: .8, scaleMax: 1.3, clustering: .65, randomRotation: true,
    entries: [{ kind: 'tree', variant: 'rei-tree01', weight: .3 }, { kind: 'bush', variant: 'rei-bush', weight: .2 },
      { kind: 'grass', variant: 'short', weight: .3 }, { kind: 'rock', variant: 'granite', weight: .1 }, { kind: 'flower', variant: 'rei-white', weight: .1 }] };
  const result = { ...defaults, ...options.scatter };
  for (const [key, min, max] of [['density', 0, 1], ['minDistance', .5, 30], ['scaleMin', .25, 3], ['scaleMax', .25, 3], ['clustering', 0, 1]]) result[key] = number(result[key], defaults[key], min, max, key);
  if (result.scaleMin > result.scaleMax) throw new Error('Die kleinste Objektgröße darf die größte nicht überschreiten.');
  result.entries = result.entries.filter(entry => ['tree', 'bush', 'grass', 'rock', 'flower'].includes(entry.kind)
    && getObjectDefinition(entry.kind)?.variants.some(v => v.id === entry.variant) && Number.isFinite(entry.weight) && entry.weight > 0);
  if (!result.entries.length) throw new Error('Die Verteilung benötigt mindestens eine vorhandene Vegetations- oder Landschaftsvariante.');
  return result;
}
function scatterStamp(point, context, scatter, vegetation) {
  const { radius, random, guard, strength } = context;
  if (scatter.density * strength === 0) return;
  const target = Math.min(64, Math.max(1, Math.round(Math.PI * radius * radius / Math.max(2, scatter.minDistance) ** 2 * scatter.density * strength * .32)));
  const clusters = Array.from({ length: 3 }, () => {
    const angle = random() * TAU, reach = Math.sqrt(random()) * radius * .65;
    return [point[0] + Math.cos(angle) * reach, point[1] + Math.sin(angle) * reach];
  });
  const totalWeight = scatter.entries.reduce((sum, item) => sum + item.weight, 0);
  let placed = 0;
  for (let attempt = 0; attempt < target * 18 && placed < target && !context.full; attempt++) {
    let p;
    if (random() < scatter.clustering) {
      const center = clusters[Math.floor(random() * clusters.length)];
      p = [center[0] + (random() + random() - 1) * radius * .42, center[1] + (random() + random() - 1) * radius * .42];
    } else {
      const angle = random() * TAU, reach = Math.sqrt(random()) * radius;
      p = [point[0] + Math.cos(angle) * reach, point[1] + Math.sin(angle) * reach];
    }
    if (Math.hypot(p[0] - point[0], p[1] - point[1]) > radius) continue;
    let pick = random() * totalWeight;
    const entry = scatter.entries.find(item => (pick -= item.weight) <= 0) ?? scatter.entries.at(-1);
    const scale = round(scatter.scaleMin + random() * (scatter.scaleMax - scatter.scaleMin));
    const patchRadius = entry.kind === 'grass' ? clamp(radius * (.08 + random() * .08), .5, 3.5) : entry.kind === 'flower' ? .5 + random() * .75 : undefined;
    const object = makeWorldObject(entry.kind, p.map(round), { variant: entry.variant, radius: patchRadius,
      rotation: scatter.randomRotation ? round(random() * TAU) : 0, scale, name: `${getObjectDefinition(entry.kind).label} · Verteilung` });
    if (entry.kind === 'grass') {
      const settings = vegetation ?? vegetationSettings(object);
      object.variant = entry.variant === 'kit-tall' ? entry.variant : VEGETATION_TYPES.find(type => type.id === settings.type)?.variant ?? entry.variant;
      object.vegetation = { ...settings, seed: Math.floor(random() * 4294967296) };
      if (object.vegetation.density === 0) continue;
    }
    const reason = guard.reason(object.position, collisionRadius(object), object.kind, scatter.minDistance, object.vegetation?.type);
    if (reason) { context.skippedAt(reason); continue; }
    if (context.addObject(object)) placed++;
  }
}
export function createScatterStroke(map, options = {}) {
  const scatter = scatterOptions(options), vegetation = options.vegetation ? vegetationOptions(options).settings : null;
  return strokeBase(map, options, (point, context) => scatterStamp(point, context, scatter, vegetation));
}
export function createBiomeStroke(map, options = {}) {
  const preset = options.preset ?? BIOME_PRESETS.find(item => item.id === options.presetId) ?? BIOME_PRESETS[0];
  const softness = number(options.softness, .6, 0, 1, 'Biom-Übergang');
  // The biome brush owns the surface identity. Detailed object scatter stays a
  // separate opt-in tool so painting a meadow no longer creates hundreds of
  // permanent grass objects. Runtime ground cover follows the saved biome field.
  const terrain = terrainOptions({ terrain: { ...preset.terrain, hardness: 1 - softness } });
  const presetId = preset.id ?? options.presetId ?? 'meadow';
  return strokeBase(map, options, (point, context) => {
    if (!terrainStamp(point, context, terrain)) return;
    context.addBiome({ id: id('biome'), name: preset.label ?? preset.name ?? 'Gemaltes Biom', presetId,
      position: point.map(round), radius: context.radius, strength: context.strength, softness,
      seed: Math.floor(context.random() * 4294967296) });
  });
}

/** Same swept-centre semantics as the object eraser. Returning references and
 * IDs lets the existing editor's snapshot history restore the exact documents. */
export function eraseLandscapeAt(map, start, end = start, radius = 4, target = 'terrain') {
  if (!pointValid(start) || !pointValid(end)) return { terrain: [], biomes: [], windZones: [], terrainIds: [], biomeIds: [], windZoneIds: [] };
  number(radius, 4, .5, 80, 'Radiergummi-Radius');
  const landscape = getLandscape(map), result = { terrain: [], biomes: [], windZones: [] };
  const keys = target === 'all' ? ['terrain', 'biomes', 'windZones']
    : target === 'surface' ? ['terrain', 'biomes']
    : target === 'biome' || target === 'biomes' ? ['biomes']
    : target === 'wind' || target === 'windZones' ? ['windZones'] : ['terrain'];
  for (const key of keys) result[key] = landscape[key].filter(item => distanceToSegment(item.position, start, end) <= radius);
  return { ...result, terrainIds: result.terrain.map(item => item.id), biomeIds: result.biomes.map(item => item.id), windZoneIds: result.windZones.map(item => item.id) };
}
