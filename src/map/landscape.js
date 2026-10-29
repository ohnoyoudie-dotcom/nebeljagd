/** Optional landscape extension v1. Old worldmap v1 files stay byte-for-byte
 * unchanged until a landscape tool is used. Numbers exposed as percentages in
 * the editor are stored as fractions; directions are radians in the x/z plane.
 * This module is data-only so editor, renderer and validation share one contract.
 */
const freeze = value => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const clone = value => JSON.parse(JSON.stringify(value));
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export const LANDSCAPE_LIMITS = freeze({ terrain: 4096, windZones: 32, biomes: 2048, presets: 32 });
export const WIND_DEFAULTS = freeze({ enabled: true, strength: .35, speed: 1,
  direction: .65, gusts: true, gustStrength: .35, gustFrequency: .18, turbulence: .2 });

const vegetationBase = { height: 1, density: 1, heightVariation: .12,
  color: '#799754', groundColor: false, groundBlend: .55, brightness: 1,
  saturation: 1, colorVariation: .14, edgeSoftness: .3, seed: 1 };
const vegetationType = (id, label, variant, overrides) => ({ id, label, variant,
  settings: { ...vegetationBase, type: id, ...overrides } });
export const VEGETATION_TYPES = freeze([
  vegetationType('short', 'Kurzes Wiesengras', 'short', { color: '#719c52' }),
  vegetationType('meadow', 'Mittelhohe Wiese', 'short', { color: '#87a35d', heightVariation: .2 }),
  vegetationType('tall', 'Hohes Versteckgras', 'tall', { color: '#799754' }),
  vegetationType('dry', 'Trockenes Gras', 'short', { color: '#b6a363', saturation: .75 }),
  vegetationType('forest', 'Dunkles Waldgras', 'short', { color: '#426b46', brightness: .85 }),
  vegetationType('swamp', 'Sumpfgras', 'short', { color: '#71884d', heightVariation: .25 }),
  vegetationType('flowers', 'Blumenwiese', 'short', { color: '#7c9c59', density: .75, heightVariation: .25 }),
]);
export const TERRAIN_TYPES = freeze([
  { id: 'meadow', label: 'Grüne Wiese', color: '#4e854b', variation: .18 },
  { id: 'forest', label: 'Dunkler Waldboden', color: '#3c5741', variation: .2 },
  { id: 'earth', label: 'Erde', color: '#8b7757', variation: .17 },
  { id: 'sand', label: 'Sand', color: '#c9ad70', variation: .12 },
  { id: 'mud', label: 'Schlamm', color: '#655c45', variation: .15 },
  { id: 'stone', label: 'Stein', color: '#899184', variation: .15 },
  { id: 'rock', label: 'Fels', color: '#61685e', variation: .23 },
  { id: 'snow', label: 'Schnee', color: '#dce7e8', variation: .08 },
  { id: 'cobble', label: 'Gepflasterter Weg', color: '#a0a38d', variation: .14 },
]);
const typeById = new Map(VEGETATION_TYPES.map(type => [type.id, type]));
const terrainById = new Map(TERRAIN_TYPES.map(type => [type.id, type]));
const scatter = (density, entries, extras = {}) => ({ density, minDistance: 3,
  scaleMin: .8, scaleMax: 1.25, clustering: .65, randomRotation: true, seed: 1,
  entries: entries.map(([kind, variant, weight]) => ({ kind, variant, weight })), ...extras });
const biome = (id, label, terrain, vegetation, distribution, overrides = {}) => ({ id, label,
  terrain: { type: terrain, color: terrainById.get(terrain).color,
    hardness: .3, strength: .8, variation: terrainById.get(terrain).variation },
  vegetation: { ...typeById.get(vegetation).settings, groundColor: true, ...overrides },
  scatter: distribution });
export const BIOME_PRESETS = freeze([
  biome('meadow', 'Wiese', 'meadow', 'meadow', scatter(.25, [['grass', 'short', .75], ['flower', 'rei-white', .25]])),
  biome('forest', 'Wald', 'forest', 'forest', scatter(.5, [['tree', 'rei-tree01', .45], ['bush', 'rei-bush', .2], ['grass', 'short', .25], ['rock', 'granite', .1]], { minDistance: 4 })),
  biome('heath', 'Heide', 'earth', 'dry', scatter(.22, [['grass', 'short', .65], ['flower', 'rei-gold', .2], ['rock', 'granite', .15]], { minDistance: 4 }), { color: '#a69a58', density: .58, groundBlend: .62, saturation: .72 }),
  biome('autumn', 'Herbstwald', 'earth', 'dry', scatter(.4, [['tree', 'kit-oak-autumn', .6], ['grass', 'short', .3], ['flower', 'rei-gold', .1]], { minDistance: 4 }), { color: '#b49455', groundBlend: .6 }),
  biome('swamp', 'Moor', 'mud', 'swamp', scatter(.45, [['grass', 'short', .65], ['bush', 'rei-bush', .25], ['tree', 'rei-tree02', .1]])),
  biome('desert', 'Wüste', 'sand', 'dry', scatter(.12, [['rock', 'granite', .6], ['grass', 'short', .4]], { minDistance: 5 }), { density: .3, groundBlend: .65 }),
  biome('snow', 'Schnee', 'snow', 'short', scatter(.18, [['tree', 'pine', .65], ['rock', 'granite', .25], ['grass', 'short', .1]], { minDistance: 5 }), { color: '#9aa792', density: .3, groundBlend: .7, saturation: .65 }),
  biome('rock', 'Felslandschaft', 'rock', 'forest', scatter(.3, [['rock', 'basalt', .65], ['rock', 'granite', .2], ['grass', 'short', .15]], { minDistance: 3.5 }), { density: .4 }),
  biome('village', 'Dorf und Bauernhof', 'earth', 'meadow', scatter(.18, [['grass', 'short', .5], ['flower', 'rei-gold', .25], ['flower', 'rei-white', .15], ['bush', 'rei-bush', .1]], { minDistance: 2.5 })),
]);

const BIOME_RUNTIME_IDS = freeze({
  meadow: 'meadow', forest: 'forest', heath: 'heath', autumn: 'forest',
  swamp: 'marsh', desert: 'dunes', snow: 'snow', rock: 'volcanic', village: 'meadow',
});
export function biomeRuntimeId(id) { return BIOME_RUNTIME_IDS[id] ?? id ?? 'meadow'; }
export const PRIMARY_BIOME_IDS = freeze(['meadow', 'forest', 'heath', 'swamp', 'snow']);

/** A read of an old map neither migrates it nor adds saved objects. Lists refer
 * to the existing document; callers must explicitly clone before editing. */
export function getLandscape(map) {
  const stored = record(map?.landscape) ? map.landscape : {};
  return { version: 1, terrain: stored.terrain ?? [],
    wind: { ...WIND_DEFAULTS, ...(record(stored.wind) ? stored.wind : {}) },
    windZones: stored.windZones ?? [], biomes: stored.biomes ?? [], presets: stored.presets ?? [] };
}
export function ensureLandscape(map) {
  map.landscape = getLandscape(map);
  return map.landscape;
}
export function vegetationSettings(object) {
  const stored = record(object?.vegetation) ? object.vegetation : {};
  const fallback = object?.kind === 'flower' ? 'flowers' : object?.variant === 'short' ? 'short' : 'tall';
  const type = typeById.get(stored.type) ?? typeById.get(fallback);
  return { ...type.settings, ...stored };
}
export function terrainSettings(type = 'meadow') {
  const value = terrainById.get(type) ?? terrainById.get('meadow');
  return { type: value.id, color: value.color, hardness: .3, strength: .8, variation: value.variation };
}
export function biomePreset(id) { const value = BIOME_PRESETS.find(item => item.id === id); return value ? clone(value) : null; }

const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const HEX = /^#[a-fA-F0-9]{6}$/;
const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !/[\u0000-\u0008\u000b-\u001f]/.test(value);
const inRange = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const UINT = value => Number.isInteger(value) && inRange(value, 0, 4294967295);
const vegetationRanges = { height: [.25, 3], density: [0, 1], heightVariation: [0, .5], groundBlend: [0, 1],
  brightness: [.25, 2], saturation: [0, 2], colorVariation: [0, 1], edgeSoftness: [0, 1] };
const windRanges = { strength: [0, 1], speed: [0, 5], direction: [-Math.PI * 20, Math.PI * 20],
  gustStrength: [0, 1], gustFrequency: [0, 2], turbulence: [0, 1] };
const terrainRanges = { hardness: [0, 1], strength: [0, 1], variation: [0, 1] };
const scatterRanges = { density: [0, 1], minDistance: [.5, 30], scaleMin: [.25, 3], scaleMax: [.25, 3], clustering: [0, 1] };
const scatterVariants = { tree: ['oak', 'birch', 'pine', 'rei-tree01', 'rei-tree02', 'kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn'], bush: ['rei-bush'],
  grass: ['short', 'tall', 'kit-tall'], rock: ['granite', 'basalt', 'kit-cluster', 'kit-single'], flower: ['rei-white', 'rei-red', 'rei-gold'] };

/** Strict extension validation is separate from older permissive map fields.
 * There is no imported code, URL, shader or unbounded recursive preset format. */
export function validateLandscape(map, { ids = new Set(), checkPoint } = {}) {
  const errors = [], add = message => errors.push(message);
  const shape = (value, keys, label) => {
    if (!record(value)) { add(`${label}: Ein Objekt wird erwartet.`); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) add(`${label}: Unbekannte Eigenschaft ${key}.`);
    return true;
  };
  const ranges = (value, definitions, label) => {
    for (const [key, [min, max]] of Object.entries(definitions)) if (value[key] !== undefined && !inRange(value[key], min, max)) add(`${label}: ${key} muss zwischen ${min} und ${max} liegen.`);
  };
  const required = (value, keys, label) => {
    for (const key of keys) if (value[key] === undefined) add(`${label}: ${key} fehlt.`);
  };
  const color = (value, label) => { if (value !== undefined && (typeof value !== 'string' || !HEX.test(value))) add(`${label}: Farbe benötigt #RRGGBB.`); };
  const seed = (value, label) => { if (value !== undefined && !UINT(value)) add(`${label}: seed muss eine ganze Zahl von 0 bis 4294967295 sein.`); };
  const flag = (value, label) => { if (value !== undefined && typeof value !== 'boolean') add(`${label}: Ein Wahrheitswert wird erwartet.`); };
  const identity = (value, label, nameRequired = true) => {
    if (!(typeof value.id === 'string' && ID.test(value.id))) add(`${label}: Ungültige ID.`);
    else if (ids.has(value.id)) add(`${label}: Die ID ${value.id} wird mehrfach verwendet.`);
    else ids.add(value.id);
    if ((nameRequired || value.name !== undefined) && !text(value.name)) add(`${label}: Ungültiger Name.`);
  };
  const point = (value, label) => {
    if (checkPoint) return checkPoint(value, label);
    if (!Array.isArray(value) || value.length !== 2 || !value.every(n => inRange(n, -1e7, 1e7))) { add(`${label}: Punkt benötigt zwei endliche Zahlen [x, z].`); return false; }
    if (record(map?.bounds) && (value[0] < map.bounds.minX || value[0] > map.bounds.maxX || value[1] < map.bounds.minZ || value[1] > map.bounds.maxZ)) add(`${label}: Punkt liegt außerhalb des Kartenrahmens.`);
    return true;
  };
  const vegetation = (value, label) => {
    if (!shape(value, ['type', ...Object.keys(vegetationRanges), 'color', 'groundColor', 'seed'], label)) return;
    if (value.type !== undefined && !typeById.has(value.type)) add(`${label}: Unbekannter Vegetationstyp.`);
    ranges(value, vegetationRanges, label); color(value.color, label); seed(value.seed, label); flag(value.groundColor, `${label} groundColor`);
  };
  const wind = (value, label) => {
    if (!shape(value, [...Object.keys(windRanges), 'enabled', 'gusts'], label)) return;
    ranges(value, windRanges, label); flag(value.enabled, `${label} enabled`); flag(value.gusts, `${label} gusts`);
  };
  const terrain = (value, label, stamp = false) => {
    if (!shape(value, ['type', 'color', ...Object.keys(terrainRanges), ...(stamp ? ['id', 'name', 'position', 'radius', 'seed'] : [])], label)) return;
    if (!terrainById.has(value.type)) add(`${label}: Unbekannte Bodenart.`);
    ranges(value, terrainRanges, label); color(value.color, label);
    if (stamp) {
      // Saved paint is an explicit result, not a partial brush preset. SVG and
      // game sampling can therefore read these values without inventing defaults.
      required(value, ['color', 'hardness', 'strength', 'variation', 'seed'], label);
      identity(value, label); point(value.position, label); seed(value.seed, label);
      if (!inRange(value.radius, .5, 80)) add(`${label}: Radius muss zwischen 0,5 und 80 liegen.`);
    }
  };
  const distribution = (value, label) => {
    if (!shape(value, [...Object.keys(scatterRanges), 'randomRotation', 'seed', 'entries'], label)) return;
    ranges(value, scatterRanges, label); flag(value.randomRotation, label); seed(value.seed, label);
    if (value.scaleMin !== undefined && value.scaleMax !== undefined && value.scaleMin > value.scaleMax) add(`${label}: Die minimale Größe darf nicht größer als die maximale Größe sein.`);
    if (value.entries !== undefined) {
      if (!Array.isArray(value.entries) || value.entries.length > 16 || value.entries.length < 1) { add(`${label}: entries benötigt 1 bis 16 Einträge.`); return; }
      for (const entry of value.entries) if (shape(entry, ['kind', 'variant', 'weight'], label)) {
        if (!Object.hasOwn(scatterVariants, entry.kind) || !scatterVariants[entry.kind]?.includes(entry.variant)) add(`${label}: Unbekanntes Verteilungsmodell.`);
        if (!inRange(entry.weight, 0, 1)) add(`${label}: Gewicht muss zwischen 0 und 1 liegen.`);
      }
    }
  };
  for (const object of Array.isArray(map?.objects) ? map.objects.slice(0, 12000) : []) if (record(object) && object.vegetation !== undefined) {
    if (!['grass', 'flower'].includes(object.kind)) add(`${object.id}: Vegetationseinstellungen gelten nur für Gras- und Blumenflächen.`);
    vegetation(object.vegetation, `Vegetation ${object.id}`);
  }
  if (map?.landscape === undefined) return errors;
  const extension = map.landscape;
  if (!shape(extension, ['version', 'terrain', 'wind', 'windZones', 'biomes', 'presets'], 'Landschaft')) return errors;
  if (extension.version !== 1) add('Landschaft: version muss 1 sein.');
  if (extension.wind !== undefined) wind(extension.wind, 'Wind');
  const list = key => {
    if (extension[key] === undefined) return [];
    if (!Array.isArray(extension[key]) || extension[key].length > LANDSCAPE_LIMITS[key]) { add(`Landschaft: ${key} benötigt höchstens ${LANDSCAPE_LIMITS[key]} Einträge.`); return []; }
    return extension[key];
  };
  for (const item of list('terrain')) terrain(item, 'Bodenfläche', true);
  for (const item of list('windZones')) if (shape(item, ['id', 'name', 'position', 'radius', 'falloff', 'strength', 'direction'], 'Windzone')) {
    identity(item, 'Windzone'); point(item.position, 'Windzone');
    required(item, ['falloff', 'strength', 'direction'], 'Windzone');
    if (!inRange(item.radius, .5, 250)) add('Windzone: Radius muss zwischen 0,5 und 250 liegen.');
    ranges(item, { falloff: [0, 1], strength: [0, 1], direction: windRanges.direction }, 'Windzone');
  }
  for (const item of list('biomes')) if (shape(item, ['id', 'name', 'presetId', 'position', 'radius', 'strength', 'softness', 'seed'], 'Biomfläche')) {
    identity(item, 'Biomfläche', false); point(item.position, 'Biomfläche'); seed(item.seed, 'Biomfläche');
    if (!(typeof item.presetId === 'string' && ID.test(item.presetId))) add('Biomfläche: Ungültige Preset-ID.');
    if (!inRange(item.radius, .5, 80)) add('Biomfläche: Radius muss zwischen 0,5 und 80 liegen.');
    ranges(item, { strength: [0, 1], softness: [0, 1] }, 'Biomfläche');
  }
  for (const item of list('presets')) if (shape(item, ['id', 'name', 'terrain', 'vegetation', 'scatter', 'wind', 'brushRadius'], 'Landschaftsvorlage')) {
    identity(item, 'Landschaftsvorlage');
    if (item.terrain !== undefined) terrain(item.terrain, 'Vorlagenboden');
    if (item.vegetation !== undefined) vegetation(item.vegetation, 'Vorlagenvegetation');
    if (item.scatter !== undefined) distribution(item.scatter, 'Vorlagenverteilung');
    if (item.wind !== undefined) wind(item.wind, 'Vorlagenwind');
    if (item.brushRadius !== undefined && !inRange(item.brushRadius, .5, 80)) add('Vorlage: Pinselradius muss zwischen 0,5 und 80 liegen.');
  }
  return errors;
}
