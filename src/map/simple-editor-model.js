import { PLACEMENT_OBJECT_CATALOG } from './objects.js';
import { WEAPON_TYPES } from '../loot-tiers.js';

export const SIMPLE_TOOLS = [
  ['land', 'Landschaft', 'paint', 'biomes', 'biome'],
  ['paths', 'Wege', 'paint', 'terrain', 'terrain'],
  ['rocks', 'Hindernisse', 'paint', 'obstacles', 'obstacleDraw'],
  ['objects', 'Objekte', 'objects', 'place', 'place'],
  ['move', 'Verschieben', null, null, 'select'],
  ['erase', 'Radieren', 'erase', null, null],
];
export const LIBRARY_GROUPS = [['all','Alles'],['nature','Natur'],['houses','Häuser'],['decor','Deko'],['loot','Beute'],['weapons','Waffen']];
export const friendlyLabel = label => label.replace(/\s*·\s*(?:GLB|Tripo(?: \(neu\))?)$/i,'').replace(/\s*·\s*Grundrissvorschau$/,'');
export function libraryGroup(kind, variant) {
  if (WEAPON_TYPES.includes(kind)) return 'weapons';
  if (kind === 'house') return 'houses';
  if (['chest','barrel','crate','heart'].includes(kind)) return 'loot';
  if (kind === 'nature') return /arch|pillar|ruin|signpost|lantern|walkway|fence/.test(variant) ? 'decor' : 'nature';
  return ['tree','bush','grass','flower','rock','stump','log','mound'].includes(kind) ? 'nature' : 'decor';
}
export const LIBRARY_ITEMS = PLACEMENT_OBJECT_CATALOG.flatMap(d => d.variants.map(v => ({
  kind:d.kind, variant:v.id, label:friendlyLabel(v.label), group:libraryGroup(d.kind,v.id), search:`${v.label} ${d.label}`,
})));
const searchable = s => s.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss');
export function filterLibrary(group, query='') {
  const words=searchable(query).trim().split(/\s+/).filter(Boolean);
  return LIBRARY_ITEMS.filter(item=>(group==='all'||group===item.group)&&words.every(word=>searchable(item.search).includes(word)));
}
