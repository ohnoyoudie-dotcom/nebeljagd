import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LOOT_RARITY_WEIGHTS, rollLootRarity, weaponStats, rarityVisual } from '../src/loot-tiers.js';
import { createWeapons } from '../src/weapons.js';
import { createChests, chestLoot } from '../src/chests.js';
import { swordPrototype } from './helpers/weapon-prototypes.js';

test('weighted rolls cover five colors with progressively rarer, stronger gear', () => {
  const counts = Object.fromEntries(Object.keys(LOOT_RARITY_WEIGHTS).map(tier => [tier, 0]));
  for (let i = 0; i < 10000; i++) counts[rollLootRarity(() => (i + .5) / 10000)]++;
  assert.deepEqual(counts, { common: 5500, uncommon: 2700, rare: 1200, epic: 500, legendary: 100 });
  assert.equal(rollLootRarity(() => 0), 'common'); assert.equal(rollLootRarity(() => 1), 'legendary');
  let previous = 0;
  for (const tier of Object.keys(counts)) {
    const stats = weaponStats('sword', tier);
    assert.ok(stats.damage > previous); previous = stats.damage;
    assert.equal(stats.color, rarityVisual(tier).color);
  }
  assert.equal(weaponStats('sword', 'epic').damage, 51);
});

test('round rolls leave the map intact and survive swaps; a restart rerolls positions once', () => {
  const placements = [
    { id: 'old-sword', name: 'Waldklinge', kind: 'sword', variant: 'steel', rarity: 'normal', position: [0, 0] },
    { id: 'bow', kind: 'bow', rarity: 'legendary', position: [4, 0] },
  ];
  const before = structuredClone(placements), actor = new THREE.Group(), scene = new THREE.Scene(); scene.add(actor);
  let rolls = 0;
  const tiers = ['epic', 'common', 'rare', 'uncommon'];
  const weapons = createWeapons(scene, actor, { heightAt: () => 0 }, null, {
    placements, tripoPrototypes: swordPrototype(), rollRarity: () => tiers[rolls++],
  });
  assert.deepEqual(placements, before);
  const sword = weapons.items[0];
  assert.equal(sword.variant, 'kit-tripo-sword'); assert.equal(sword.model, 'tripo');
  weapons.interact(actor.position);
  assert.equal(weapons.equippedItem.damage, 51); assert.equal(weapons.equippedItem.rarity, 'epic');
  actor.position.x = 4; weapons.interact(actor.position);
  assert.equal(sword.rarity, 'epic'); assert.equal(rolls, 2, 'swapping does not reroll');
  weapons.addDrop({ kind: 'sword', rarity: 'legendary', position: [10, 0] }, { pop: false });
  assert.equal(rolls, 2, 'already rolled chest loot retains its rarity');
  weapons.reset();
  assert.equal(rolls, 4); assert.equal(weapons.items.length, 2);
  assert.equal(sword.rarity, 'uncommon'); assert.equal(sword.label, 'Waldklinge');
  assert.equal(sword.name, 'Waldklinge · Ungewöhnlich'); assert.equal(sword.damage, 34);
  assert.equal(sword.ringMaterial.color.getHexString(), new THREE.Color(sword.color).getHexString());
  assert.deepEqual([sword.x, sword.z], [0, 0]);
  weapons.dispose(); assert.equal(rolls, 4, 'disposal consumes no random rolls');
  assert.deepEqual(placements, before);
});

test('chest rolls once per round, releases the roll once, and rerolls only on restart', () => {
  let rolls = 0; const drops = [];
  const chests = createChests(new THREE.Scene(), {
    placements: [{ id: 'test-chest', kind: 'chest', position: [0, 0] }],
    rollRarity: () => ['epic', 'common'][rolls++], onDrop: drop => drops.push(drop),
  });
  const opener = new THREE.Vector3(0, 0, 2);
  assert.equal(rolls, 1);
  chests.interact(opener); chests.update(1, 1, opener); chests.interact(opener); chests.update(1, 2, opener);
  assert.equal(drops.length, 3); assert.equal(drops[2].rarity, 'epic'); assert.equal(rolls, 1);
  chests.reset(); chests.interact(opener); chests.update(1, 3, opener);
  assert.equal(rolls, 2); assert.equal(drops.length, 6); assert.equal(drops[5].rarity, 'common');
  // Every sword emitted without an authored variant resolves to the new default.
  let swordLoot;
  for (let i = 0; i < 100 && !swordLoot; i++) { const loot = chestLoot(`chest-${i}`, 'rare')[2]; if (loot.type === 'sword') swordLoot = loot; }
  const scene = new THREE.Scene(), actor = new THREE.Group();
  const weapons = createWeapons(scene, actor, { heightAt: () => 0 }, null, { placements: [], tripoPrototypes: swordPrototype() });
  const sword = weapons.addDrop({ ...swordLoot, position: [0, 0] }, { pop: false });
  assert.equal(sword.model, 'tripo'); assert.equal(sword.variant, 'kit-tripo-sword');
  chests.dispose(); weapons.dispose();
});
