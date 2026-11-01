import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RARITIES, WEAPON_TYPES } from '../src/loot-tiers.js';
import { PLACEMENT_OBJECT_CATALOG, getObjectDefinition, isObjectPlaceable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { createLandscapePlacementGuard } from '../src/map/landscape-brush.js';

const project = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));
const schema = JSON.parse(readFileSync(new URL('../worldmap.schema.json', import.meta.url))).$defs.worldObject;
const additions = [
  { kind: 'bow', variant: 'kit-tripo-ornate-bow', asset: 'ornate-bow', original: 'ornate bow 3d model' },
  { kind: 'poisonStaff', variant: 'kit-tripo-poison-staff', asset: 'poison-staff', original: 'Poison staff 3d model' },
  { kind: 'moonStaff', variant: 'kit-tripo-moon-staff', asset: 'moon-staff', original: 'Moon staff 3d model' },
];

test('the three new uploaded weapons are explicit active placements with their own model provenance', () => {
  for (const { kind, variant, asset: filename, original } of additions) {
    const definition = PLACEMENT_OBJECT_CATALOG.find(item => item.kind === kind);
    assert.ok(definition, kind);
    assert.equal(definition.defaultVariant, variant);
    assert.ok(definition.variants.some(item => item.id === variant));
    assert.equal(isObjectPlaceable(kind, variant), true);
    const asset = getVariantAsset(kind, variant);
    assert.equal(asset.renderer, 'src/tripo-weapons.js');
    assert.equal(asset.provenance, 'assets/imported/tripo-extra-weapons/provenance.json');
    assert.deepEqual(asset.sourcePaths, [
      `assets/imported/tripo-extra-weapons/runtime/${filename}.glb`, `assets/inbox/${original}.glb`,
    ]);
  }
  assert.equal(isObjectPlaceable('bow', 'wood'), false, 'the old bow remains importable but is not advertised as the new model');
  assert.ok(getObjectDefinition('bow').variants.some(item => item.id === 'wood'));
});

test('new weapon instances and every rarity survive JSON import, cleanup and validation without changing the project map', () => {
  const before = structuredClone(project);
  for (const { kind, variant } of additions) for (const rarity of Object.keys(RARITIES)) {
    assert.ok(WEAPON_TYPES.includes(kind), kind);
    const object = makeWorldObject(kind, [30, -42], { id: `new-${kind}-${rarity}`, variant, rarity,
      name: `Eigenes ${kind}`, rotation: .7, scale: 1.4 });
    const candidate = { ...structuredClone(project), objects: [object] };
    const roundTrip = normalizeWorldmap(JSON.parse(JSON.stringify(candidate)));
    assert.deepEqual(roundTrip, candidate);
    assert.deepEqual(validateWorldmap(roundTrip).errors, []);
    assert.equal(removeNonTripoObjects(roundTrip).map, roundTrip);
    const other = additions.find(item => item.kind !== kind);
    roundTrip.objects[0].variant = other.variant;
    assert.equal(validateWorldmap(roundTrip).valid, false, 'an unrelated uploaded model cannot silently become this weapon');
  }
  assert.deepEqual(project, before);
});

test('portable JSON schema permits the same new variants and weapon rarity as runtime validation', () => {
  const rarityKinds = schema.allOf.find(rule => rule.if.required?.includes('rarity')).then.properties.kind.enum;
  for (const { kind, variant } of additions) {
    assert.ok(schema.properties.kind.enum.includes(kind), kind);
    assert.ok(rarityKinds.includes(kind), kind);
    const variants = schema.allOf.find(rule => rule.if.properties?.kind?.const === kind).then.properties.variant.enum;
    assert.ok(variants.includes(variant), variant);
  }
  const oldBow = makeWorldObject('bow', [30, -42], { variant: 'wood', rarity: 'rare' });
  assert.equal(validateWorldmap({ ...structuredClone(project), objects: [oldBow] }).valid, true);
});

test('new staffs have portable selectable SVG symbols while maps without them retain their authored SVG', () => {
  const before = renderWorldmapSvg(project, { showSpawns: false, showZone: false, showLabels: false });
  assert.equal(before, readFileSync(new URL('../worldmap.svg', import.meta.url), 'utf8'));
  const objects = additions.map(({ kind, variant }, index) => makeWorldObject(kind, [30 + 3 * index, -42], {
    id: `svg-${kind}`, variant, rarity: 'legendary', rotation: .35,
  }));
  const svg = renderWorldmapSvg({ ...structuredClone(project), objects });
  for (const { kind } of additions) {
    assert.ok(svg.includes(`data-object-kind="${kind}"`), kind);
    assert.ok(svg.includes(`href="#world-object-${kind}"`), kind);
    assert.ok(svg.includes(`id="world-object-${kind}"`), kind);
  }
  assert.ok(!before.includes('world-object-poisonStaff'));
  assert.ok(!before.includes('world-object-moonStaff'));
});

test('large scenery scatter keeps all three new weapon pickups reachable', () => {
  const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
  for (const { kind, variant } of additions) {
    const object = makeWorldObject(kind, [0, 0], { id: `clearance-${kind}`, variant });
    const map = { ...structuredClone(project), island: { ...project.island, points: square },
      islets: [], waterAreas: [], paths: [], rivers: [], spawnAreas: [], objects: [object] };
    assert.equal(createLandscapePlacementGuard(map).reason([0, 0], .5, 'rock'), 'loot', kind);
  }
});
