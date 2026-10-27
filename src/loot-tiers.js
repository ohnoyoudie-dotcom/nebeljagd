/** Shared by combat, chest loot, HUD and the map editor. */
export const RARITIES = Object.freeze({
  normal: Object.freeze({ id: 'normal', label: 'Normal', color: '#a2a6ac', multiplier: .8 }),
  common: Object.freeze({ id: 'common', label: 'Gewöhnlich', color: '#f1eee3', multiplier: 1 }),
  uncommon: Object.freeze({ id: 'uncommon', label: 'Ungewöhnlich', color: '#66d780', multiplier: 1.25 }),
  rare: Object.freeze({ id: 'rare', label: 'Selten', color: '#5aa5ff', multiplier: 1.6 }),
  legendary: Object.freeze({ id: 'legendary', label: 'Legendär', color: '#ffad44', multiplier: 2.15 }),
});

/** One palette and restrained glow strength for every tier-bearing item.
 * Emission/soft halos work on the existing render pass; no dynamic lights or bloom. */
const RARITY_GLOW = Object.freeze({
  normal: Object.freeze({ body: .16, accent: .65, halo: .18 }),
  common: Object.freeze({ body: .23, accent: .8, halo: .22 }),
  uncommon: Object.freeze({ body: .31, accent: 1, halo: .28 }),
  rare: Object.freeze({ body: .42, accent: 1.2, halo: .34 }),
  legendary: Object.freeze({ body: .58, accent: 1.5, halo: .42 }),
});

export function rarityVisual(rarity = 'common') {
  const tier = RARITIES[rarity] ?? RARITIES.common;
  return { rarity: tier.id, color: tier.color, ...RARITY_GLOW[tier.id] };
}

export const WEAPON_DEFINITIONS = Object.freeze({
  bow: Object.freeze({ type: 'bow', label: 'Holzbogen', damage: 22, cooldown: .62, range: 25, effect: null }),
  sword: Object.freeze({ type: 'sword', label: 'Eisenschwert', damage: 27, cooldown: .58, range: 2.35, effect: null }),
  fireStaff: Object.freeze({ type: 'fireStaff', label: 'Feuerstab', damage: 16, cooldown: .8, range: 23, effect: 'burn' }),
  iceStaff: Object.freeze({ type: 'iceStaff', label: 'Eisstab', damage: 19, cooldown: .85, range: 23, effect: 'slow' }),
});
export const WEAPON_TYPES = Object.freeze(Object.keys(WEAPON_DEFINITIONS));

export function weaponStats(type, rarity = 'common') {
  const definition = WEAPON_DEFINITIONS[type];
  if (!definition) throw new Error(`Unbekannte Waffe: ${type}`);
  const tier = RARITIES[rarity] ?? RARITIES.common;
  return {
    ...definition, rarity: tier.id, rarityLabel: tier.label, color: tier.color,
    name: `${definition.label} · ${tier.label}`,
    damage: Math.round(definition.damage * tier.multiplier),
    burn: type === 'fireStaff' ? { duration: 3, damagePerSecond: 4 * tier.multiplier } : null,
    slow: type === 'iceStaff' ? { duration: 2.5, multiplier: .5 } : null,
  };
}
