import { WEAPON_TYPES } from '../loot-tiers.js';

/** Shared, local-only asset catalogue for both the map editor and 3D generator. */
export const OBJECT_CATALOG = Object.freeze([
  { kind: 'tree', label: 'Baum', defaultVariant: 'oak', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'oak', label: 'Eiche' }, { id: 'birch', label: 'Birke' }, { id: 'pine', label: 'Kiefer' }, { id: 'rei-tree01', label: 'Rei-Laubbaum 1' }, { id: 'rei-tree02', label: 'Rei-Laubbaum 2' },
      { id: 'kit-pine-high', label: 'Große Kiefer · GLB' }, { id: 'kit-pine-young', label: 'Junge Kiefer · GLB' },
      { id: 'kit-oak-green', label: 'Grüne Eiche · GLB' }, { id: 'kit-oak-autumn', label: 'Herbsteiche · GLB' }] },
  { kind: 'house', label: 'Haus', defaultVariant: 'kit-tripo-tavern', defaultScale: 1, footprintRadius: 14.5,
    variants: [{ id: 'herbal', label: 'Kräuterhaus', footprintRadius: 11, retired: true }, { id: 'inn', label: 'Waldgasthaus', footprintRadius: 11, retired: true }, { id: 'hunter', label: 'Jägerhaus', footprintRadius: 11, retired: true },
      { id: 'kit-timber', label: 'Fachwerkhaus · GLB', footprintRadius: 11, retired: true }, { id: 'kit-taverne', label: 'Taverne · GLB', footprintRadius: 14.5, retired: true },
      { id: 'kit-tripo-tavern', label: 'Wirtshaus · Tripo (neu)', footprintRadius: 14.5 }] },
  { kind: 'flower', label: 'Blumenbeet', defaultVariant: 'rei-white', defaultScale: 1, footprintRadius: 1.3, defaultRadius: 1.5,
    variants: [{ id: 'rei-white', label: 'Rei-Blumen · Weiß' }, { id: 'rei-red', label: 'Rei-Blumen · Rot' }, { id: 'rei-gold', label: 'Rei-Blumen · Gold' }] },
  { kind: 'grass', label: 'Grasfläche', defaultVariant: 'tall', defaultScale: 1, footprintRadius: 3, defaultRadius: 3.5,
    variants: [{ id: 'tall', label: 'Hohes Versteckgras' }, { id: 'short', label: 'Niedriges Gras' }, { id: 'kit-tall', label: 'Hohes Gras · GLB' }] },
  { kind: 'rock', label: 'Felsen', defaultVariant: 'granite', defaultScale: 1, footprintRadius: 1.35,
    variants: [{ id: 'granite', label: 'Granit' }, { id: 'basalt', label: 'Dunkler Basalt' },
      { id: 'kit-cluster', label: 'Felsgruppe · GLB' }, { id: 'kit-single', label: 'Einzelfelsen · GLB' },
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
    variants: [{ id: 'wood', label: 'Holzbogen' }] },
  { kind: 'sword', label: 'Schwert', defaultVariant: 'steel', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'steel', label: 'Stahlschwert' }] },
  { kind: 'fireStaff', label: 'Feuerstab', defaultVariant: 'ember', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'ember', label: 'Glutstab · Verbrennung' }] },
  { kind: 'iceStaff', label: 'Eisstab', defaultVariant: 'frost', defaultScale: 1, footprintRadius: .65,
    variants: [{ id: 'frost', label: 'Froststab · Verlangsamung' }] },
  // Dimensions follow the already committed environment-kit collision hints.
  // Model placement stays explicit; adding a catalogue item never adds scenery.
  { kind: 'wall', label: 'Mauer', defaultVariant: 'kit-stone', defaultScale: 1,
    footprintRadius: Math.hypot(1.6, .31), footprintWidth: 3.2, footprintDepth: .62,
    variants: [{ id: 'kit-stone', label: 'Steinmauer · GLB' }] },
  { kind: 'fence', label: 'Zaun', defaultVariant: 'kit-wood', defaultScale: 1,
    footprintRadius: Math.hypot(1.6, .2), footprintWidth: 3.2, footprintDepth: .4,
    variants: [{ id: 'kit-wood', label: 'Holzzaun · GLB' }] },
  { kind: 'crate', label: 'Holzkiste', defaultVariant: 'kit-wood', defaultScale: 1,
    footprintRadius: Math.hypot(.425, .425), footprintWidth: .85, footprintDepth: .85,
    variants: [{ id: 'kit-wood', label: 'Holzkiste · GLB' }] },
].map(definition => Object.freeze({ ...definition,
  variants: Object.freeze(definition.variants.map(variant => Object.freeze({
    ...variant, assetId: `${definition.kind}:${variant.id}`,
  }))),
})));

const definitions = new Map(OBJECT_CATALOG.map(item => [item.kind, item]));
let objectCounter = 0;
export function getObjectDefinition(kind) { return definitions.get(kind) ?? null; }
export function getObjectFootprintRadius(kind, variant) {
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
