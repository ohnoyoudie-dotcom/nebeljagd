import { STAFF_THROW_RANGE } from './staff-charge.js';

/** Shared by combat, chest loot, HUD and the map editor. */
export const RARITIES = Object.freeze({
  normal: Object.freeze({ id: 'normal', label: 'Normal', color: '#a2a6ac', multiplier: .8 }),
  common: Object.freeze({ id: 'common', label: 'Gewöhnlich', color: '#f1eee3', multiplier: 1 }),
  uncommon: Object.freeze({ id: 'uncommon', label: 'Ungewöhnlich', color: '#66d780', multiplier: 1.25 }),
  rare: Object.freeze({ id: 'rare', label: 'Selten', color: '#5aa5ff', multiplier: 1.6 }),
  epic: Object.freeze({ id: 'epic', label: 'Episch', color: '#bd78f5', multiplier: 1.9 }),
  legendary: Object.freeze({ id: 'legendary', label: 'Legendär', color: '#ffad44', multiplier: 2.15 }),
});

/** One palette and restrained glow strength for every tier-bearing item.
 * Emission/soft halos work on the existing render pass; no dynamic lights or bloom. */
const RARITY_GLOW = Object.freeze({
  normal: Object.freeze({ body: .16, accent: .65, halo: .18 }),
  common: Object.freeze({ body: .23, accent: .8, halo: .22 }),
  uncommon: Object.freeze({ body: .31, accent: 1, halo: .28 }),
  rare: Object.freeze({ body: .42, accent: 1.2, halo: .34 }),
  epic: Object.freeze({ body: .50, accent: 1.35, halo: .38 }),
  legendary: Object.freeze({ body: .58, accent: 1.5, halo: .42 }),
});

// Legacy gray "normal" remains readable in saved maps, but new rounds use
// these five tiers. A roll belongs to the item, never to a pickup interaction.
export const LOOT_RARITY_WEIGHTS = Object.freeze({ common: 55, uncommon: 27, rare: 12, epic: 5, legendary: 1 });
export function rollLootRarity(random = Math.random) {
  let roll = Math.min(1 - Number.EPSILON, Math.max(0, random())) * 100;
  for (const [tier, weight] of Object.entries(LOOT_RARITY_WEIGHTS)) {
    if (roll < weight) return tier;
    roll -= weight;
  }
  return 'common';
}

export function rarityVisual(rarity = 'common') {
  const tier = RARITIES[rarity] ?? RARITIES.common;
  return { rarity: tier.id, color: tier.color, ...RARITY_GLOW[tier.id] };
}

export const WEAPON_DEFINITIONS = Object.freeze({
  bow: Object.freeze({ type: 'bow', label: 'Holzbogen', damage: 22, cooldown: .62, range: 25, effect: null }),
  sword: Object.freeze({ type: 'sword', label: 'Eisenschwert', damage: 27, cooldown: .58, range: 2.35, effect: null }),
  fireStaff: Object.freeze({ type: 'fireStaff', label: 'Feuerstab', damage: 16, cooldown: .8, range: 23, effect: 'burn' }),
  iceStaff: Object.freeze({ type: 'iceStaff', label: 'Eisstab', damage: 19, cooldown: .85, range: 23, effect: 'slow' }),
  poisonStaff: Object.freeze({ type: 'poisonStaff', label: 'Giftstab', damage: 14, cooldown: .85, range: STAFF_THROW_RANGE, effect: 'poison' }),
  moonStaff: Object.freeze({ type: 'moonStaff', label: 'Mondstab', damage: 22, cooldown: .85, range: 12, effect: null }),
  starStaff: Object.freeze({ type: 'starStaff', label: 'Sternstab', damage: 21, cooldown: .78, range: 23, effect: null }),
  lightningStaff: Object.freeze({ type: 'lightningStaff', label: 'Blitzstab', damage: 23, cooldown: .9, range: 20, effect: 'storm' }),
  hourglassStaff: Object.freeze({ type: 'hourglassStaff', label: 'Sanduhrstab', damage: 0, cooldown: 3.1, range: STAFF_THROW_RANGE, effect: 'time' }),
  meteorStaff: Object.freeze({ type: 'meteorStaff', label: 'Meteorstab', damage: 24, cooldown: 4.6, range: STAFF_THROW_RANGE, effect: 'meteor' }),
  sunStaff: Object.freeze({ type: 'sunStaff', label: 'Sonnenstab', damage: 24, cooldown: 4.8, range: STAFF_THROW_RANGE, effect: 'solar' }),
  soulStaff: Object.freeze({ type: 'soulStaff', label: 'Seelenrichterstab', damage: 0, cooldown: 1.2, range: 18, effect: 'judgment' }),
  gravityStaff: Object.freeze({ type: 'gravityStaff', label: 'Gravitationsstab', damage: 14, cooldown: 2.8, range: STAFF_THROW_RANGE, effect: 'gravity' }),
});
export const WEAPON_TYPES = Object.freeze(Object.keys(WEAPON_DEFINITIONS));
export const STAFF_TYPES = Object.freeze(WEAPON_TYPES.filter(type => type.endsWith('Staff')));

const VARIANT_LABELS = Object.freeze({
  'kit-tripo-ornate-bow': Object.freeze({ type: 'bow', label: 'Verzierter Bogen' }),
});

export function weaponStats(type, rarity = 'common', variant = null) {
  const definition = WEAPON_DEFINITIONS[type];
  if (!definition) throw new Error(`Unbekannte Waffe: ${type}`);
  const tier = RARITIES[rarity] ?? RARITIES.common;
  const label = VARIANT_LABELS[variant]?.type === type ? VARIANT_LABELS[variant].label : definition.label;
  return {
    ...definition, label, rarity: tier.id, rarityLabel: tier.label, color: tier.color,
    name: `${label} · ${tier.label}`,
    damage: Math.round(definition.damage * tier.multiplier),
    burn: type === 'fireStaff' ? { duration: 3, damagePerSecond: 4 * tier.multiplier } : null,
    slow: type === 'iceStaff' ? { duration: 2.5, multiplier: .5 } : null,
    poison: type === 'poisonStaff' ? { duration: 3, damagePerSecond: 5 * tier.multiplier } : null,
  };
}
