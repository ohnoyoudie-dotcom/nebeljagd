import { WEAPON_TYPES } from '../loot-tiers.js';
import { RETIRED_SCENERY_KINDS } from './retired-scenery.js';
import { TRIPO_WALL_DEFINITION } from './tripo-wall-definition.js';
import { TRIPO_HOUSE_DEFINITIONS } from './tripo-house-definitions.js';
import { TRIPO_PROP_DEFINITIONS } from './tripo-prop-definitions.js';
import { TRIPO_WOODLAND_DEFINITIONS } from './tripo-woodland-definitions.js';
import { USER_TREE1_AVAILABLE } from './user-tree-asset.js';

const woodlandVariants = kind => TRIPO_WOODLAND_DEFINITIONS.filter(prop => prop.kind === kind)
  .map(({ variant, label, footprint }) => ({ id: variant, label,
    footprintRadius: Math.hypot(footprint.halfWidth, footprint.halfDepth),
    footprintWidth: footprint.halfWidth * 2, footprintDepth: footprint.halfDepth * 2 }));

/** Shared, local-only asset catalogue for both the map editor and 3D generator. */
export const OBJECT_CATALOG = Object.freeze([
  { kind: 'tree', label: 'Baum', defaultVariant: 'oak', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'oak', label: 'Eiche', retired: true }, { id: 'birch', label: 'Birke', retired: true }, { id: 'pine', label: 'Kiefer', retired: true }, { id: 'rei-tree01', label: 'Rei-Laubbaum 1', retired: true }, { id: 'rei-tree02', label: 'Rei-Laubbaum 2', retired: true },
      { id: 'kit-pine-high', label: 'Große Kiefer · GLB' }, { id: 'kit-pine-young', label: 'Junge Kiefer · GLB' },
      { id: 'kit-oak-green', label: 'Grüne Eiche · GLB' }, { id: 'kit-oak-autumn', label: 'Herbsteiche · GLB' },
      { id: 'kit-user-tree1', label: 'Dein Baum 1 · eigener FBX-Export', footprintRadius: .45 }] },
  { kind: 'house', label: 'Haus', defaultVariant: 'kit-tripo-tavern', defaultScale: 1, footprintRadius: 14.5,
    variants: [{ id: 'herbal', label: 'Kräuterhaus', footprintRadius: 11, retired: true }, { id: 'inn', label: 'Waldgasthaus', footprintRadius: 11, retired: true }, { id: 'hunter', label: 'Jägerhaus', footprintRadius: 11, retired: true },
      { id: 'kit-timber', label: 'Fachwerkhaus · GLB', footprintRadius: 11, retired: true }, { id: 'kit-taverne', label: 'Taverne · GLB', footprintRadius: 14.5, retired: true },
      { id: 'kit-tripo-tavern', label: 'Wirtshaus · Tripo (neu)', footprintRadius: 14.5 },
      ...TRIPO_HOUSE_DEFINITIONS.map(({ variant, label, footprint }) => ({ id: variant, label,
        footprintRadius: Math.hypot(footprint.halfWidth, footprint.halfDepth) })),
      { id: 'kit-tripo-castle', label: 'Kleines Schloss · Tripo', footprintRadius: 43, retired: true }] },
  { kind: 'flower', label: 'Blumenbeet', defaultVariant: 'rei-white', defaultScale: 1, footprintRadius: 1.3, defaultRadius: 1.5,
    variants: [{ id: 'rei-white', label: 'Rei-Blumen · Weiß' }, { id: 'rei-red', label: 'Rei-Blumen · Rot' }, { id: 'rei-gold', label: 'Rei-Blumen · Gold' }] },
  { kind: 'grass', label: 'Grasfläche', defaultVariant: 'tall', defaultScale: 1, footprintRadius: 3, defaultRadius: 3.5,
    variants: [{ id: 'tall', label: 'Hohes Versteckgras' }, { id: 'short', label: 'Niedriges Gras' }, { id: 'kit-tall', label: 'Hohes Gras · GLB' }] },
  { kind: 'rock', label: 'Felsen', defaultVariant: 'granite', defaultScale: 1, footprintRadius: 1.35,
    variants: [{ id: 'granite', label: 'Granit', retired: true }, { id: 'basalt', label: 'Dunkler Basalt', retired: true },
      { id: 'kit-cluster', label: 'Felsgruppe · GLB', retired: true }, { id: 'kit-single', label: 'Einzelfelsen · GLB', retired: true },
      { id: 'kit-tripo-01', label: 'Flacher Felsen · Tripo', footprintRadius: 1.32 },
      { id: 'kit-tripo-02', label: 'Findling · Tripo', footprintRadius: 1.45 },
      { id: 'kit-tripo-03', label: 'Hohe Felsgruppe · Tripo', footprintRadius: 1.76 }] },
  { kind: 'wagon', label: 'Holzwagen', defaultVariant: 'kit-tripo-wagon', defaultScale: 1, footprintRadius: 1.67,
    variants: [{ id: 'kit-tripo-wagon', label: 'Holzwagen · Tripo' }] },
  { kind: 'barrel', label: 'Holzfass', defaultVariant: 'kit-tripo-barrel', defaultScale: 1, footprintRadius: .63,
    variants: [{ id: 'kit-tripo-barrel', label: 'Holzfass · Tripo' }] },
  { kind: 'well', label: 'Brunnen', defaultVariant: 'kit-tripo-well', defaultScale: 1, footprintRadius: 1.45,
    variants: [{ id: 'kit-tripo-well', label: 'Steinbrunnen · Tripo' }] },
  { kind: 'mound', label: 'Bewachsene Erhöhung', defaultVariant: 'ridge', defaultScale: 1, footprintRadius: 6.5,
    variants: [{ id: 'ridge', label: 'Bewachsene Felskante' }, { id: 'knoll', label: 'Bewachsene Felskuppe' }] },
  { kind: 'bush', label: 'Strauch', defaultVariant: 'rei-bush', defaultScale: 1, footprintRadius: 1,
    variants: [{ id: 'rei-bush', label: 'Rei-Strauch' }] },
  { kind: 'ruin', label: 'Ruine', defaultVariant: 'stone', defaultScale: 1, footprintRadius: 7,
    variants: [{ id: 'stone', label: 'Steinruine' }, { id: 'kit-arch', label: 'Ruinenbogen · GLB' }] },
  { kind: 'shrine', label: 'Schrein', defaultVariant: 'magic', defaultScale: 1, footprintRadius: 1.5,
    variants: [{ id: 'magic', label: 'Magischer Schrein' }] },
  { kind: 'heart', label: 'Herz', defaultVariant: 'healing', defaultScale: 1, footprintRadius: .5,
    variants: [{ id: 'healing', label: 'Heilendes Herz' }] },
  { kind: 'chest', label: 'Holztruhe', defaultVariant: 'wood', defaultScale: 1, footprintRadius: .85,
    variants: [{ id: 'wood', label: 'Holztruhe mit Gold und Beute' }, { id: 'kit-tripo-chest', label: 'Schatztruhe · Tripo' }] },
  { kind: 'bow', label: 'Bogen', defaultVariant: 'wood', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'wood', label: 'Holzbogen' }, { id: 'kit-tripo-ornate-bow', label: 'Verzierter Bogen · Tripo' }] },
  { kind: 'sword', label: 'Schwert', defaultVariant: 'steel', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'steel', label: 'Schwert · Tripo (alter Karteneintrag)', retired: true }, { id: 'kit-tripo-sword', label: 'Schwert · Tripo' }] },
  { kind: 'fireStaff', label: 'Feuerstab', defaultVariant: 'ember', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'ember', label: 'Glutstab · Verbrennung' }, { id: 'kit-tripo-lava-staff', label: 'Feuerstab (Lavastab) · Tripo' }] },
  { kind: 'iceStaff', label: 'Eisstab', defaultVariant: 'frost', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'frost', label: 'Froststab · Verlangsamung' }, { id: 'kit-tripo-crystal-staff', label: 'Eisstab (Kristallstab) · Tripo' }] },
  { kind: 'poisonStaff', label: 'Giftstab', defaultVariant: 'kit-tripo-poison-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-poison-staff', label: 'Giftstab · Tripo' }] },
  { kind: 'moonStaff', label: 'Mondstab', defaultVariant: 'kit-tripo-moon-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-moon-staff', label: 'Mondstab · Tripo' }] },
  { kind: 'starStaff', label: 'Sternstab', defaultVariant: 'kit-tripo-star-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-star-staff', label: 'Sternstab · Tripo' }] },
  { kind: 'lightningStaff', label: 'Blitzstab', defaultVariant: 'kit-tripo-lightning-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-lightning-staff', label: 'Blitzstab · Tripo' }] },
  { kind: 'sunStaff', label: 'Sonnenstab', defaultVariant: 'kit-tripo-sun-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-sun-staff', label: 'Sonnenstab · Tripo' }] },
  { kind: 'soulStaff', label: 'Seelenrichterstab', defaultVariant: 'kit-tripo-soul-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-soul-staff', label: 'Seelenrichterstab · Tripo' }] },
  { kind: 'meteorStaff', label: 'Meteorstab', defaultVariant: 'kit-tripo-meteor-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-meteor-staff', label: 'Meteorstab · Tripo' }] },
  { kind: 'hourglassStaff', label: 'Sanduhrstab', defaultVariant: 'kit-tripo-hourglass-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-hourglass-staff', label: 'Sanduhrstab · Tripo' }] },
  { kind: 'gravityStaff', label: 'Gravitationsstab', defaultVariant: 'kit-tripo-gravity-staff', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'kit-tripo-gravity-staff', label: 'Gravitationsstab · Tripo' }] },
  // Dimensions follow the already committed environment-kit collision hints.
  // Model placement stays explicit; adding a catalogue item never adds scenery.
  { kind: 'wall', label: 'Mauer', defaultVariant: 'kit-stone', defaultScale: 1,
    footprintRadius: Math.hypot(1.6, .31), footprintWidth: 3.2, footprintDepth: .62,
    variants: [{ id: 'kit-stone', label: 'Steinmauer · GLB' },
      { id: 'kit-cut-stone', label: 'Steinmauer · Pfeiler & Abdeckung', footprintRadius: Math.hypot(2, .44), footprintWidth: 4, footprintDepth: .88 },
      { id: 'kit-tripo-wall', label: 'Steinmauer · Verwittert (Tripo)',
        footprintRadius: Math.hypot(TRIPO_WALL_DEFINITION.footprint.halfWidth, TRIPO_WALL_DEFINITION.footprint.halfDepth),
        footprintWidth: 2 * TRIPO_WALL_DEFINITION.footprint.halfWidth, footprintDepth: 2 * TRIPO_WALL_DEFINITION.footprint.halfDepth }] },
  { kind: 'fence', label: 'Zaun', defaultVariant: 'kit-cross-wood', defaultScale: 1,
    footprintRadius: Math.hypot(2, .22), footprintWidth: 4, footprintDepth: .44,
    variants: [{ id: 'kit-wood', label: 'Holzzaun · GLB', footprintRadius: Math.hypot(1.6, .2), footprintWidth: 3.2, footprintDepth: .4, retired: true },
      { id: 'kit-cross-wood', label: 'Holzzaun · Kreuzstreben', footprintRadius: Math.hypot(2, .22), footprintWidth: 4, footprintDepth: .44 }] },
  { kind: 'stump', label: 'Baumstumpf', defaultVariant: 'kit-tripo-stump-01', defaultScale: 1,
    variants: woodlandVariants('stump') },
  { kind: 'log', label: 'Liegender Stamm', defaultVariant: 'kit-tripo-log-01', defaultScale: 1,
    variants: woodlandVariants('log') },
  { kind: 'crate', label: 'Holzkiste', defaultVariant: 'kit-tripo-crate-01', defaultScale: 1,
    footprintRadius: Math.hypot(.425, .425), footprintWidth: .85, footprintDepth: .85,
    variants: [{ id: 'kit-wood', label: 'Holzkiste · GLB', retired: true }, ...woodlandVariants('crate')] },
].map(definition => Object.freeze({ ...definition,
  retired: RETIRED_SCENERY_KINDS.includes(definition.kind) || definition.variants.every(variant => variant.retired),
  variants: Object.freeze(definition.variants.map(variant => Object.freeze({
    ...variant, assetId: `${definition.kind}:${variant.id}`,
  }))),
})));

/** Only fresh placement is restricted; legacy definitions still validate and
 * render saved maps until the user deliberately applies the cleanup action. */
export const AUTHORING_OBJECT_CATALOG = Object.freeze(OBJECT_CATALOG.filter(definition => !definition.retired));

/** Only approved models are placeable. Previous GLB trees remain readable in
 * saved maps, but are not offered in the editor until a valid replacement exists. */
const placementAssetIds = new Set([
  // Old GLB trees are excluded; the user's real GLB is included only if installed.
  ...(USER_TREE1_AVAILABLE ? ['tree:kit-user-tree1'] : []),
  'house:kit-tripo-tavern', 'house:kit-tripo-house-02',
  'rock:kit-tripo-01', 'rock:kit-tripo-02', 'rock:kit-tripo-03',
  'wagon:kit-tripo-wagon', 'barrel:kit-tripo-barrel', 'well:kit-tripo-well',
  'chest:kit-tripo-chest',
  ...TRIPO_WOODLAND_DEFINITIONS.map(prop => prop.id),
  'sunStaff:kit-tripo-sun-staff',
  'soulStaff:kit-tripo-soul-staff',
  'sword:kit-tripo-sword', 'fireStaff:kit-tripo-lava-staff', 'iceStaff:kit-tripo-crystal-staff',
  'bow:kit-tripo-ornate-bow', 'poisonStaff:kit-tripo-poison-staff', 'moonStaff:kit-tripo-moon-staff', 'starStaff:kit-tripo-star-staff', 'hourglassStaff:kit-tripo-hourglass-staff', 'meteorStaff:kit-tripo-meteor-staff', 'gravityStaff:kit-tripo-gravity-staff', 'lightningStaff:kit-tripo-lightning-staff',
]);
export const PLACEMENT_OBJECT_CATALOG = Object.freeze(AUTHORING_OBJECT_CATALOG.flatMap(definition => {
  const variants = definition.variants.filter(variant => !variant.retired && placementAssetIds.has(variant.assetId));
  if (!variants.length) return [];
  return [Object.freeze({ ...definition,
    label: definition.kind === 'chest' ? 'Schatztruhe' : definition.label,
    defaultVariant: variants.some(variant => variant.id === definition.defaultVariant)
      ? definition.defaultVariant : variants[0].id,
    variants: Object.freeze(variants),
  })];
}));
const placementDefinitions = new Map(PLACEMENT_OBJECT_CATALOG.map(definition => [definition.kind, definition]));
export function isObjectPlaceable(kind, variant) {
  const definition = placementDefinitions.get(kind);
  return !!definition && (variant === undefined || definition.variants.some(entry => entry.id === variant));
}

const definitions = new Map(OBJECT_CATALOG.map(item => [item.kind, item]));
let objectCounter = 0;
export function getObjectDefinition(kind) { return definitions.get(kind) ?? null; }
export function isObjectAvailable(kind, variant) {
  const definition = getObjectDefinition(kind);
  if (!definition || definition.retired) return false;
  return variant === undefined || definition.variants.some(entry => entry.id === variant && !entry.retired);
}
export function getObjectFootprintRadius(kind, variant) {
  const prop = TRIPO_PROP_DEFINITIONS.find(entry => entry.kind === kind && entry.variant === variant);
  if (prop) return Math.hypot(prop.footprint.halfWidth, prop.footprint.halfDepth);
  const definition = getObjectDefinition(kind);
  return definition?.variants.find(entry => entry.id === variant)?.footprintRadius ?? definition?.footprintRadius ?? 1;
}

/** No provider calls or randomness beyond a new editor object's unique ID. */
export function makeWorldObject(kind, position, options = {}) {
  const definition = getObjectDefinition(kind);
  if (!definition) throw new Error(`Unbekannte Objektart: ${kind}`);
  return {
    id: options.id ?? `object-${kind}-${Date.now().toString(36)}-${(++objectCounter).toString(36)}`,
    name: options.name ?? definition.label,
    kind,
    variant: options.variant ?? definition.defaultVariant,
    position: [...position],
    rotation: options.rotation ?? 0,
    scale: options.scale ?? definition.defaultScale,
    ...(options.height !== undefined ? { height: options.height } : {}),
    ...(WEAPON_TYPES.includes(kind) ? { rarity: options.rarity ?? 'common' } : {}),
    ...(definition.defaultRadius ? { radius: options.radius ?? definition.defaultRadius } : {}),
  };
}

/** Old map files remain importable; normalize never invents uneditable scenery. */
export function normalizeWorldmap(map) {
  const result = JSON.parse(JSON.stringify(map));
  if (result && typeof result === 'object' && !Array.isArray(result) && result.objects === undefined) result.objects = [];
  if (Array.isArray(result?.objects)) for (const item of result.objects) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    // Keep saved IDs and locations stable while migrating retired collectible crystals.
    if (item.kind === 'crystal' && item.variant === 'forest') {
      item.kind = 'chest'; item.variant = 'wood';
      if (typeof item.name === 'string') item.name = item.name.replace(/Waldkristall|Kristall/g, 'Holztruhe');
    }
    if (WEAPON_TYPES.includes(item.kind) && item.rarity === undefined) item.rarity = 'common';
  }
  return result;
}
