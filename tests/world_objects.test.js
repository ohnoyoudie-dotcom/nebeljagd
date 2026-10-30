import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateWorldmap, getWorldmapStats, distanceToSegment, pointInPolygon } from '../src/map/model.js';
import { OBJECT_CATALOG, getObjectDefinition, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { seedWorldObjects } from '../scripts/seed-world-objects.js';
import { isRetiredBuilding } from '../src/map/retired-buildings.js';
import { isRetiredScenery } from '../src/map/retired-scenery.js';

// Fixed authored-map fixture: users may freely clear or rearrange worldmap.json.
const base = JSON.parse(readFileSync(new URL('./fixtures/scenery-cleanup-worldmap.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(base);
const lineDistance = (point, line) => Math.min(...line.points.slice(1).map((next, i) => distanceToSegment(point, line.points[i], next)));

test('world objects are persisted editable instances while the authoring generator remains deterministic', () => {
  assert.ok(base.objects.length > 900 && base.objects.length < 1100);
  const seeded = seedWorldObjects(base, { seed: 271026 });
  assert.deepEqual(seedWorldObjects(base, { seed: 271026 }), seeded);
  assert.ok(seeded.length > 900, 'authoring generator retains grass, bushes, loot and other active scenery');
  assert.deepEqual(validateWorldmap(base), { valid: true, errors: [], warnings: [] });
  const stats = getWorldmapStats(base);
  assert.equal(seeded.some(isRetiredScenery), false, 'Explicit reseeding must not bring retired scenery back');
  // Authoring restrictions must not reject objects deliberately added through
  // an older editor or imported by the map owner after the one-time cleanup.
  assert.deepEqual(normalizeWorldmap(base).objects, base.objects);
  assert.equal(seeded.some(isRetiredBuilding), false);
  assert.equal(seeded.some(item => item.kind === 'house'), false, 'Explicit scenery reseeding must not bring old houses back');
  assert.equal(seeded.some(item => item.id.startsWith('chest-obj-house-')), false, 'No orphaned stock chests from retired houses');
  assert.ok(stats.objectCounts.grass >= 500);
  assert.equal(stats.objectCount, base.objects.length);
  assert.equal(new Set(base.objects.map(item => item.id)).size, base.objects.length);
  for (const item of base.objects) assert.equal(pointInPolygon(item.position, base.island.points), true);
});

test('spawn approach and starter loot remain explicit and accessible', () => {
  assert.deepEqual(base.gameplay.spawnPosition, [30, -42]);
  const starter = Object.fromEntries(base.objects.filter(item => item.id.endsWith('-start')).map(item => [item.kind, item]));
  assert.deepEqual(starter.bow.position, [34, -39]);
  assert.deepEqual(starter.sword.position, [26, -39]);
  assert.deepEqual(starter.heart.position, [38, -42]);
  assert.deepEqual(starter.chest.position, [28, -35], 'Unrelated starter loot remains available');
  assert.equal(base.objects.some(item => item.id === 'obj-house-auenwacht-01'), false);
});

test('remaining seeded grass and bushes keep paths, rivers and distributed starts open', () => {
  const scattered = seedWorldObjects(base).filter(item => ['grass', 'bush'].includes(item.kind) && item.id !== 'obj-grass-start');
  assert.ok(scattered.length > 800, 'The clearance test must inspect actual surviving scenery');
  for (const item of scattered) {
    for (const path of base.paths) assert.ok(lineDistance(item.position, path) > path.width / 2 + 1, `${item.id} blocks ${path.id}`);
    for (const river of base.rivers) assert.ok(lineDistance(item.position, river) > river.width / 2 + 1, `${item.id} intersects ${river.id}`);
    for (const spawn of base.spawnAreas) assert.ok(Math.hypot(item.position[0] - spawn.position[0], item.position[1] - spawn.position[1]) > spawn.radius, `${item.id} blocks start ${spawn.id}`);
  }
});

test('retiring scenery preserves the original loot and remaining seeded placements while allowing new authored objects', () => {
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const lootKinds = new Set(['heart', 'chest', 'bow', 'sword', 'fireStaff', 'iceStaff']);
  // Original generator IDs use "obj-"; later manual placements use
  // "object-" and must not invalidate the preservation proof for these 66.
  const loot = base.objects.filter(item => lootKinds.has(item.kind) && item.id.startsWith('obj-'));
  assert.equal(loot.length, 66);
  // Captured from work 39c269f before retiring tree/rock/mound/flower. This
  // covers IDs, positions, rotations, scales, names and weapon rarities.
  assert.equal(hash(loot), 'da72d212dce2d310926d2862f9ec1fdfd9e8731359346ea6b6fa7ac48bff02af');
  assert.equal(hash(seedWorldObjects(base)), 'd217cfe11c1550a3cd6997d1f8070b3cfc01c3c3cfa21cfa6a6dbac73ae8548d',
    'Filtering retired scenery must not advance random draws differently or move surviving seeded objects');
});

test('every catalogue variant can be made, normalized and validated without hidden generation', () => {
  for (const definition of OBJECT_CATALOG) for (const variant of definition.variants) {
    const item = makeWorldObject(definition.kind, [30, -42], { id: `test-${definition.kind}`, variant: variant.id });
    const candidate = clone(); candidate.objects = [item];
    assert.equal(validateWorldmap(candidate).valid, true, JSON.stringify(validateWorldmap(candidate)));
    assert.equal(getObjectDefinition(item.kind), definition);
  }
  assert.equal(getObjectDefinition('script'), null);
  assert.throws(() => makeWorldObject('script', [0, 0]), /Unbekannte Objektart/);
  const old = clone(); delete old.objects;
  assert.equal(validateWorldmap(old).valid, true);
  const normalized = normalizeWorldmap(old);
  assert.deepEqual(normalized.objects, []);
  assert.equal(old.objects, undefined);
  const copy = normalizeWorldmap(base); copy.objects[0].position[0] += 10;
  assert.notEqual(copy.objects[0].position[0], base.objects[0].position[0]);
});

test('unsafe or unrenderable object imports fail before entering the scene', () => {
  for (const alter of [
    m => { m.objects[0].id = m.id; },
    m => { m.objects[0].id = m.places[0].id; },
    m => { m.objects[0].kind = 'script'; },
    m => { m.objects[0].kind = ['house']; },
    m => { m.objects[0].variant = 'external-model'; },
    m => { m.objects[0].variant = ['herbal']; },
    m => { m.objects[0].position = [590, -700]; },
    m => { m.objects[0].position[0] = Infinity; },
    m => { m.objects[0].scale = 0; },
    m => { m.objects[0].scale = 4; },
    m => { m.objects[0].rotation = '90deg'; },
    m => { m.objects[0].rotation = 99; },
    m => { m.objects[0].name = { toString: 'tree' }; },
    m => { m.objects = Array(12001).fill(m.objects[0]); },
    m => { m.objects = {}; },
    m => { m.objects = [makeWorldObject('grass', [30, -42], { radius: .1 })]; },
    m => { m.objects = [makeWorldObject('flower', [30, -42], { radius: Infinity })]; },
    m => { m.gameplay.spawnPosition = [590, -700]; },
  ]) {
    const candidate = clone(); alter(candidate);
    assert.equal(validateWorldmap(candidate).valid, false);
  }
});

test('chests replace crystals and every weapon tier survives authoring and export', async () => {
  const { RARITIES, WEAPON_TYPES } = await import('../src/loot-tiers.js');
  const { renderWorldmapSvg } = await import('../src/map/render.js');
  const map = clone(); map.objects = [];
  assert.equal(base.objects.some(item => item.kind === 'crystal'), false);
  const chests = base.objects.filter(item => item.kind === 'chest' && item.id.startsWith('obj-'));
  assert.equal(chests.length, 16, 'Remaining outdoor and starter chests survive the building cleanup');
  assert.ok(chests.some(item => item.id === 'obj-chest-start'));
  assert.equal(chests.some(item => item.id.startsWith('chest-obj-house-')), false);
  for (const type of WEAPON_TYPES) for (const rarity of Object.keys(RARITIES)) {
    const item = makeWorldObject(type, [30, -42], { id: `tier-${type}-${rarity}`, rarity });
    map.objects.push(item);
  }
  map.objects.push(makeWorldObject('chest', [28, -35], { id: 'test-chest' }));
  const roundtrip = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(roundtrip, map);
  assert.equal(validateWorldmap(roundtrip).valid, true);
  const svg = renderWorldmapSvg(roundtrip);
  for (const rarity of Object.values(RARITIES)) {
    assert.ok(svg.includes(`data-rarity="${rarity.id}"`));
    assert.ok(svg.includes(`stroke="${rarity.color}"`));
  }
  for (const type of ['chest', 'fireStaff', 'iceStaff']) assert.ok(svg.includes(`href="#world-object-${type}"`));
  for (const rarity of ['epic', '__proto__', ['rare'], {}, null]) {
    const invalid = structuredClone(roundtrip); invalid.objects[0].rarity = rarity;
    assert.equal(validateWorldmap(invalid).valid, false);
  }
  const invalid = structuredClone(roundtrip); invalid.objects.at(-1).rarity = 'rare';
  assert.equal(validateWorldmap(invalid).valid, false, 'a chest has no weapon damage rarity');
});

test('old crystal and ungraded weapon imports migrate without changing IDs or locations', () => {
  const old = clone();
  old.objects = [
    { id: 'old-crystal', name: 'Waldkristall am Fluss', kind: 'crystal', variant: 'forest', position: [28, -35], rotation: .4, scale: 1 },
    { id: 'old-bow', name: 'Alter Bogen', kind: 'bow', variant: 'wood', position: [34, -39], rotation: 0, scale: 1 },
  ];
  const normalized = normalizeWorldmap(old);
  assert.equal(normalized.objects[0].kind, 'chest');
  assert.equal(normalized.objects[0].variant, 'wood');
  assert.equal(normalized.objects[0].id, 'old-crystal');
  assert.equal(normalized.objects[0].name, 'Holztruhe am Fluss');
  assert.deepEqual(normalized.objects[0].position, [28, -35]);
  assert.equal(normalized.objects[1].rarity, 'common');
  assert.equal(validateWorldmap(normalized).valid, true);
  assert.equal(old.objects[0].kind, 'crystal', 'normalization does not mutate the uploaded document');
  assert.equal(old.objects[1].rarity, undefined);
});
