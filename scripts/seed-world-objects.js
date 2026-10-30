import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { distanceToSegment, pointInPolygon, validateWorldmap } from '../src/map/model.js';
import { getObjectDefinition, makeWorldObject } from '../src/map/objects.js';

function randomFactory(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const rounded = value => Math.round(value * 100) / 100;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function lineDistance(point, line) {
  let nearest = Infinity;
  for (let i = 1; i < line.points.length; i++) nearest = Math.min(nearest, distanceToSegment(point, line.points[i - 1], line.points[i]));
  return nearest;
}

/** Explicit generation is an authoring operation, never a hidden runtime scatter. */
export function seedWorldObjects(map, { seed = 271026 } = {}) {
  const random = randomFactory(seed), objects = [], counts = {};
  const { minX, minZ, maxX, maxZ } = map.bounds;
  const coast = map.island.points;
  const onLand = (position, margin = 0) => pointInPolygon(position, coast) && !coast.some((a, i) => distanceToSegment(position, a, coast[(i + 1) % coast.length]) < margin);
  const awayWater = (position, margin = 0) => map.rivers.every(river => lineDistance(position, river) > river.width / 2 + margin);
  const awayPath = (position, margin = 0) => map.paths.every(path => lineDistance(position, path) > path.width / 2 + margin);
  const regionAt = position => [...map.regions].reverse().find(region => pointInPolygon(position, region.points));
  const monuments = [];
  const spacing = new Map();
  const spacingSize = 8;
  const cell = position => [Math.floor(position[0] / spacingSize), Math.floor(position[1] / spacingSize)];
  const separated = (position, clearance) => {
    const [cx, cz] = cell(position);
    for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
      for (const item of spacing.get(`${x},${z}`) ?? []) if (distance(position, item.position) < clearance + item.clearance) return false;
    }
    return true;
  };
  function add(kind, position, options = {}, clearance = 0) {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const id = options.id ?? `obj-${kind}-${String(counts[kind]).padStart(4, '0')}`;
    const result = makeWorldObject(kind, position.map(rounded), {
      ...options, id, name: options.name ?? `${getObjectDefinition(kind).label} ${counts[kind]}`,
      rotation: rounded(options.rotation ?? random() * Math.PI * 2), scale: rounded(options.scale ?? 1),
    });
    objects.push(result);
    if (clearance) {
      const key = cell(position).join(',');
      if (!spacing.has(key)) spacing.set(key, []);
      spacing.get(key).push({ position: result.position, clearance });
    }
    return result;
  }
  const starter = [30, -42];
  const clearSpawn = (position, margin = 0) => distance(position, starter) > 8 + margin && map.spawnAreas.every(spawn => distance(position, spawn.position) > spawn.radius + margin);
  const clearBuildings = (position, margin = 0) => monuments.every(monument => distance(position, monument.position) > (monument.kind === 'ruin' ? 10 : 4) + margin);
  const safe = (position, margin = 0) => onLand(position, margin + 3) && awayWater(position, margin + 2);

  // Buildings are now placed explicitly in the editor from the new Tripo
  // catalogue. Reseeding scenery must not revive the retired house collection
  // or create replacement inns automatically at village markers.
  // Ruins and shrines are explicit game objects at existing atlas markers.
  for (const place of map.places.filter(place => ['ruin', 'shrine'].includes(place.kind))) {
    if (safe(place.position, place.kind === 'ruin' ? 5 : 1)) monuments.push(add(place.kind, place.position, { id: `obj-${place.kind}-${place.id}`, name: place.name, rotation: 0 }));
  }
  // Curated user assets close to the starting area are easy to find.
  for (const [position, variant] of [[[46, -47], 'rei-tree01'], [[12, -45], 'rei-tree02']]) {
    if (safe(position, 1) && clearBuildings(position, 1)) add('tree', position, { variant, name: `Rei-Baum · Auenwacht ${variant.slice(-2)}`, scale: 1 }, 2.2);
  }
  for (const [position, variant] of [[[22, -48], 'rei-white'], [[25, -48], 'rei-red'], [[38, -48], 'rei-gold']]) {
    if (safe(position, 1)) add('flower', position, { variant, radius: 1.25, name: `Auenwacht · ${variant}` });
  }
  for (const position of [[44, -44], [13, -40]]) if (safe(position, 1)) add('bush', position, { name: 'Auenwacht · Rei-Strauch', scale: .9 }, .8);
  add('bow', [34, -39], { id: 'obj-bow-start', name: 'Bogen am Start', rotation: .3 });
  add('sword', [26, -39], { id: 'obj-sword-start', name: 'Schwert am Start', rotation: -.3 });
  add('heart', [38, -42], { id: 'obj-heart-start', name: 'Herz am Start' });
  add('chest', [28, -35], { id: 'obj-chest-start', name: 'Holztruhe am Start' });

  const treeWeights = { forest: 1, marsh: .62, meadow: .48, heath: .35, snow: .5, volcanic: .13, dunes: .12 };
  let attempts = 0;
  while ((counts.tree ?? 0) < 2600 && attempts++ < 160000) {
    const position = [minX + random() * (maxX - minX), minZ + random() * (maxZ - minZ)];
    if (!safe(position, 4) || !clearSpawn(position, 4) || !clearBuildings(position, 4) || !awayPath(position, 3) || !separated(position, 2.6)) continue;
    const biome = regionAt(position)?.biome ?? 'meadow';
    const cluster = .55 + .45 * Math.sin(position[0] * .027 + Math.sin(position[1] * .02) * 2) ** 2;
    if (random() > (treeWeights[biome] ?? .4) * cluster) continue;
    const variant = biome === 'snow' || biome === 'volcanic' ? 'pine' : biome === 'heath' ? 'birch' : random() < .19 ? 'birch' : random() < .15 ? 'pine' : 'oak';
    add('tree', position, { variant, scale: .75 + random() * .6 }, 2.6);
  }
  const scatter = (kind, target, margin, extra, options) => {
    let tries = 0;
    while ((counts[kind] ?? 0) < target && tries++ < target * 180) {
      const position = [minX + random() * (maxX - minX), minZ + random() * (maxZ - minZ)];
      if (!safe(position, margin) || !clearSpawn(position, margin / 2) || !clearBuildings(position, margin) || !awayPath(position, margin) || !extra(position)) continue;
      add(kind, position, options(position), kind === 'rock' ? 1.6 : 0);
    }
  };
  scatter('rock', 280, 2, p => separated(p, 1.6), p => ({ variant: regionAt(p)?.biome === 'volcanic' ? 'basalt' : 'granite', scale: .6 + random() * 1.1 }));
  scatter('grass', 740, 3, p => ['meadow', 'forest', 'marsh', 'heath'].includes(regionAt(p)?.biome), () => ({ variant: random() < .75 ? 'tall' : 'short', radius: rounded(2 + random() * 5), scale: .8 + random() * .4 }));
  // Dense grass close to the start can be tried without walking across the map.
  if (safe([10, -30], 4) && clearBuildings([10, -30], 4)) add('grass', [10, -30], { id: 'obj-grass-start', name: 'Versteckgras am Start', variant: 'tall', radius: 3.5 });
  scatter('bush', 130, 1.5, p => ['forest', 'marsh', 'meadow'].includes(regionAt(p)?.biome), () => ({ scale: .65 + random() * .6 }));

  // Flower patches stay editable and are distributed independently of houses.
  scatter('flower', 125, 1.5, p => ['forest', 'meadow', 'heath'].includes(regionAt(p)?.biome), () => ({ variant: ['rei-white', 'rei-red', 'rei-gold'][Math.floor(random() * 3)], radius: rounded(1 + random() * 1.5), scale: .8 + random() * .4 }));
  // A few visible stones and grass clumps frame the starter's open fighting area.
  for (const [kind, position] of [['rock', [51, -27]], ['rock', [5, -32]], ['tree', [46, -22]], ['tree', [12, -19]]]) {
    if (safe(position, 2) && clearBuildings(position, 2) && awayPath(position, 2)) add(kind, position, { scale: .85 });
  }
  for (const place of map.places) {
    for (const [i, kind] of ['heart', 'chest', 'bow', 'sword'].entries()) {
      const position = [place.position[0] + 12 + (i % 2) * 4, place.position[1] + 13 + Math.floor(i / 2) * 4];
      if (safe(position, 1) && clearBuildings(position, .7)) add(kind, position, { name: `${place.name} · ${getObjectDefinition(kind).label}` });
    }
  }
  // New loot is authored after the scenery, preserving the original seeded island.
  add('fireStaff', [35, -34], { id: 'obj-fireStaff-start', name: 'Feuerstab am Start', rotation: .3, rarity: 'rare' });
  add('iceStaff', [23, -35], { id: 'obj-iceStaff-start', name: 'Eisstab am Start', rotation: -.3, rarity: 'uncommon' });
  const tiers = ['normal', 'common', 'uncommon', 'rare', 'legendary'];
  let weaponIndex = 0;
  for (const item of objects) if (item.kind === 'bow' || item.kind === 'sword') item.rarity = tiers[weaponIndex++ % tiers.length];
  objects.find(item => item.id === 'obj-bow-start').rarity = 'common';
  objects.find(item => item.id === 'obj-sword-start').rarity = 'normal';
  // A few authored ledges demonstrate solid, vegetated cover without changing
  // the established scatter or closing the village's roads and entrances.
  // Append after the old random sequence so every existing placement stays put.
  const occupiedRadius = item => {
    if (item.kind === 'grass' || item.kind === 'flower') return item.radius * item.scale + .5;
    if (item.kind === 'mound') return (item.variant === 'ridge' ? 6.5 : 4) * item.scale;
    return ({ house: 11.5, tree: 1, rock: 1.6, bush: 1.5, ruin: 8, shrine: 2, chest: 1.4,
      bow: .9, sword: .9, fireStaff: .9, iceStaff: .9, heart: .9 }[item.kind] ?? 1) * item.scale;
  };
  for (const [id, variant, position, rotation, name] of [
    ['obj-mound-auenwacht-east', 'knoll', [41, -34], .2, 'Auenwacht · Bewachsene Felskuppe'],
    ['obj-mound-cottage-east', 'knoll', [47, -58], -.35, 'Auenwacht · Bewachsene Felskuppe am Südostrand'],
    ['obj-mound-south-clearing', 'ridge', [31, -6], -.2, 'Südliche Lichtung · Bewachsene Felskante'],
    ['obj-mound-west-meadow', 'ridge', [-34, -75], .6, 'Westliche Wiese · Bewachsene Felskante'],
  ]) {
    const radius = variant === 'ridge' ? 6.5 : 4;
    if (!safe(position, radius) || !awayPath(position, radius + 1) || !clearSpawn(position, radius + 1)) continue;
    if (objects.some(item => distance(position, item.position) < radius + occupiedRadius(item) + 1)) continue;
    add('mound', position, { id, variant, rotation, name }, radius);
  }
  for (const [id, position, rotation, name] of [
    ['obj-crate-mondhain-01', [198, -429], .35, 'Mondhain · Holzkiste am Nordpfad'],
    ['obj-crate-mondhain-02', [222, -399], .8, 'Mondhain · Holzkiste am Ostpfad'],
    ['obj-crate-mooswinkel-01', [-372, -51], .6, 'Mooswinkel · Holzkiste am Nordrand'],
    ['obj-crate-mooswinkel-02', [-348, -81], .1, 'Mooswinkel · Holzkiste am Südwestweg'],
    ['obj-crate-auenwacht-01', [6, -39], .45, 'Auenwacht · Holzkiste am Nordostweg'],
    ['obj-crate-auenwacht-02', [18, -90], .9, 'Auenwacht · Holzkiste am Südweg'],
    ['obj-crate-wildheide-01', [-111, 168], .4, 'Wildheide · Holzkiste am Nordwestpfad'],
    ['obj-crate-wildheide-02', [-48, 159], .2, 'Wildheide · Holzkiste am Ostpfad'],
    ['obj-crate-moorlicht-01', [-321, 318], .2, 'Moorlicht · Holzkiste am Nordpfad'],
    ['obj-crate-moorlicht-02', [-312, 381], .6, 'Moorlicht · Holzkiste am Südostpfad'],
  ]) add('crate', position, { id, variant: 'kit-wood', rotation, name }, .7);
  return objects;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const file = resolve('worldmap.json');
  const map = JSON.parse(await readFile(file, 'utf8'));
  if (map.objects?.length && !process.argv.includes('--replace')) throw new Error('Die Karte enthält bereits editierbare Objekte. Zum bewussten Ersetzen --replace verwenden.');
  map.objects = seedWorldObjects(map);
  const result = validateWorldmap(map);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  // Keep each explicit prop on one line so hand edits and diffs remain readable.
  const main = JSON.stringify({ ...map, objects: undefined }, null, 2).trimEnd();
  const content = `${main.slice(0, -1).trimEnd()},\n  "objects": [\n${map.objects.map(item => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]\n}\n`;
  await writeFile(file, content);
  console.log(JSON.stringify(map.objects.reduce((counts, item) => { counts[item.kind] = (counts[item.kind] ?? 0) + 1; return counts; }, {}), null, 2));
}
