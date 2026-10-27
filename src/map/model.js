import { RARITIES, WEAPON_TYPES } from '../loot-tiers.js';
import { getObjectDefinition } from './objects.js';
import { validateLandscape } from './landscape.js';

/** Nebeljagd map contract v1. Coordinates are world meters: north = -z. */
const LIMIT = 1e7;
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;
const HEX = /^#[a-fA-F0-9]{6}$/;
const identifier = value => typeof value === 'string' && ID.test(value);
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= LIMIT;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const coordinate = value => Array.isArray(value) && value.length === 2 && value.every(finite);
const text = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b-\u001f]/.test(value);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const openRing = points => points.length > 1 && same(points[0], points.at(-1)) ? points.slice(0, -1) : points;

export function polygonArea(points) {
  const ring = openRing(points);
  return Math.abs(ring.reduce((sum, point, i) => {
    const next = ring[(i + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

export function distanceToSegment(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz;
  const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length2)) : 0;
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}

/** Boundary points count as inside. Works for clockwise and counter-clockwise rings. */
export function pointInPolygon(point, points) {
  if (!coordinate(point) || !Array.isArray(points) || points.length < 3 || !points.every(coordinate)) return false;
  const ring = openRing(points);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (distanceToSegment(point, a, b) < 1e-7) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function intersects(a, b, c, d) {
  const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), s = cross(c, d, b);
  const eps = 1e-7;
  return ((p > eps && q < -eps) || (p < -eps && q > eps)) && ((r > eps && s < -eps) || (r < -eps && s > eps))
    || Math.abs(p) < eps && distanceToSegment(c, a, b) < eps
    || Math.abs(q) < eps && distanceToSegment(d, a, b) < eps
    || Math.abs(r) < eps && distanceToSegment(a, c, d) < eps
    || Math.abs(s) < eps && distanceToSegment(b, c, d) < eps;
}

/** Return validation messages, never execute imported content or mutate the map. */
export function validateWorldmap(map) {
  const errors = [], warnings = [], ids = new Set();
  const error = message => errors.push(message);
  if (!object(map)) return { valid: false, errors: ['Die Kartendatei muss ein JSON-Objekt sein.'], warnings };
  if (map.schemaVersion !== 1) error('schemaVersion muss 1 sein.');
  if (!identifier(map.id)) error('Die Karten-ID muss ein kurzer Bezeichner sein.');
  else ids.add(map.id);
  if (!text(map.name)) error('Der Kartenname fehlt oder ist zu lang.');
  if (map.description !== undefined && !text(map.description, 3000)) error('Die Kartenbeschreibung ist ungültig.');
  const cs = map.coordinateSystem;
  if (!object(cs) || cs.units !== 'meters' || cs.north !== '-z' || cs.metersPerUnit !== 1 || JSON.stringify(cs.horizontalAxes) !== '["x","z"]') error('coordinateSystem benötigt Meter, Achsen x/z, north=-z und metersPerUnit=1.');
  const bounds = map.bounds;
  const boundsValid = object(bounds) && ['minX', 'minZ', 'maxX', 'maxZ'].every(key => finite(bounds[key])) && bounds.minX < bounds.maxX && bounds.minZ < bounds.maxZ;
  if (!boundsValid) error('bounds benötigt endliche, aufsteigende minX/maxX und minZ/maxZ.');
  const inBounds = point => !boundsValid || point[0] >= bounds.minX && point[0] <= bounds.maxX && point[1] >= bounds.minZ && point[1] <= bounds.maxZ;
  function checkPoint(point, label) {
    if (!coordinate(point)) { error(`${label}: Punkt benötigt zwei endliche Zahlen [x, z].`); return false; }
    if (!inBounds(point)) error(`${label}: Punkt liegt außerhalb des Kartenrahmens.`);
    return true;
  }
  function common(item, label) {
    if (!object(item)) { error(`${label}: Ein Objekt wird erwartet.`); return false; }
    if (!identifier(item.id)) error(`${label}: Ungültige ID.`);
    else if (ids.has(item.id)) error(`${label}: Die ID ${item.id} wird mehrfach verwendet.`);
    else ids.add(item.id);
    if (!text(item.name)) error(`${label}: Ungültiger Name.`);
    return true;
  }
  function points(item, label, polygon) {
    if (!Array.isArray(item.points) || item.points.length < (polygon ? 3 : 2) || item.points.length > 500) { error(`${label}: Benötigt ${polygon ? '3' : '2'} bis 500 Punkte.`); return false; }
    if (!item.points.map((p, i) => checkPoint(p, `${label} · Punkt ${i + 1}`)).every(Boolean)) return false;
    const ring = polygon ? openRing(item.points) : item.points;
    if (ring.length < (polygon ? 3 : 2)) { error(`${label}: Zu wenige unterschiedliche Punkte.`); return false; }
    for (let i = 1; i < ring.length; i++) if (same(ring[i - 1], ring[i])) error(`${label}: Benachbarte Punkte dürfen nicht identisch sein.`);
    if (polygon) {
      if (polygonArea(ring) < 1) error(`${label}: Das Polygon besitzt keine nutzbare Fläche.`);
      let crossing = false;
      for (let i = 0; i < ring.length && !crossing; i++) for (let j = i + 1; j < ring.length; j++) {
        if (j === i + 1 || i === 0 && j === ring.length - 1) continue;
        if (intersects(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) { crossing = true; break; }
      }
      if (crossing) error(`${label}: Das Polygon schneidet sich selbst.`);
    }
    return true;
  }
  const game = map.gameplay;
  if (!object(game) || !Number.isInteger(game.targetPlayers) || game.targetPlayers < 1 || game.targetPlayers > 1000 || !finite(game.walkSpeedMetersPerSecond) || game.walkSpeedMetersPerSecond <= 0 || game.walkSpeedMetersPerSecond > 100) error('gameplay benötigt 1–1000 Zielspieler und eine positive Laufgeschwindigkeit bis 100 m/s.');
  const islandValid = common(map.island, 'Insel') && points(map.island, 'Insel', true);
  if (object(game) && game.spawnPosition !== undefined && checkPoint(game.spawnPosition, 'Spielstart') && islandValid && !pointInPolygon(game.spawnPosition, map.island.points)) error('Der Spielstart liegt außerhalb der Insel.');
  const collections = [['regions', 100], ['paths', 300], ['rivers', 100], ['places', 500], ['spawnAreas', 200]];
  for (const [key, limit] of collections) if (!Array.isArray(map[key]) || map[key].length > limit) error(`${key} muss eine Liste mit höchstens ${limit} Einträgen sein.`);
  if (Array.isArray(map.regions) && map.regions.length < 1) error('Die Karte benötigt mindestens eine Region.');
  if (Array.isArray(map.spawnAreas) && map.spawnAreas.length < 1) error('Die Karte benötigt mindestens einen Startbereich.');
  for (const region of Array.isArray(map.regions) ? map.regions.slice(0, 100) : []) {
    if (!common(region, 'Region')) continue;
    const valid = points(region, `Region ${region.id}`, true);
    checkPoint(region.label, `Beschriftung ${region.id}`);
    if (!identifier(region.biome)) error(`Region ${region.id}: Ungültiges Biom.`);
    if (!(typeof region.color === 'string' && HEX.test(region.color))) error(`Region ${region.id}: Farbe benötigt #RRGGBB.`);
    if (valid && coordinate(region.label) && !pointInPolygon(region.label, region.points)) warnings.push(`Beschriftung von ${region.name} liegt außerhalb ihrer Region.`);
  }
  for (const key of ['paths', 'rivers']) for (const line of Array.isArray(map[key]) ? map[key].slice(0, key === 'paths' ? 300 : 100) : []) {
    if (!common(line, key === 'paths' ? 'Weg' : 'Fluss')) continue;
    points(line, `${key} ${line.id}`, false);
    if (!finite(line.width) || line.width <= 0 || line.width > 200) error(`${line.id}: Breite muss größer als 0 und höchstens 200 Meter sein.`);
    if (key === 'paths' && !['main', 'trail', 'bridge'].includes(line.kind)) error(`${line.id}: Unbekannte Wegart.`);
  }
  for (const place of Array.isArray(map.places) ? map.places.slice(0, 500) : []) {
    if (!common(place, 'Ort')) continue;
    if (checkPoint(place.position, `Ort ${place.id}`) && islandValid && !pointInPolygon(place.position, map.island.points)) error(`Ort ${place.name} liegt außerhalb der Insel.`);
    if (!['village', 'ruin', 'shrine', 'landmark', 'harbor'].includes(place.kind)) error(`${place.id}: Unbekannte Ortsart.`);
  }
  let capacity = 0;
  const spawns = Array.isArray(map.spawnAreas) ? map.spawnAreas.slice(0, 200) : [];
  for (const spawn of spawns) {
    if (!common(spawn, 'Startbereich')) continue;
    const positionValid = checkPoint(spawn.position, `Startbereich ${spawn.id}`);
    const radiusValid = finite(spawn.radius) && spawn.radius > 0 && spawn.radius <= 500;
    if (!radiusValid) error(`${spawn.id}: Startradius muss größer als 0 und höchstens 500 Meter sein.`);
    if (!Number.isInteger(spawn.capacity) || spawn.capacity < 1 || spawn.capacity > 1000) error(`${spawn.id}: Kapazität muss eine ganze Zahl von 1 bis 1000 sein.`);
    else capacity += spawn.capacity;
    if (positionValid && islandValid) {
      const ring = openRing(map.island.points);
      if (!pointInPolygon(spawn.position, ring) || radiusValid && ring.some((a, i) => distanceToSegment(spawn.position, a, ring[(i + 1) % ring.length]) < spawn.radius)) error(`Startbereich ${spawn.name} liegt teilweise außerhalb der Insel.`);
    }
  }
  if (object(game) && Number.isInteger(game.targetPlayers) && capacity < game.targetPlayers) error(`Startbereiche bieten ${capacity} Plätze für ${game.targetPlayers} Zielspieler.`);
  for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) {
    const a = spawns[i], b = spawns[j];
    if (object(a) && object(b) && coordinate(a.position) && coordinate(b.position) && finite(a.radius) && finite(b.radius) && Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]) < a.radius + b.radius) warnings.push(`Startbereiche ${a.name} und ${b.name} überlappen sich.`);
  }
  // Explicit placements are the only source of 3D scenery. Legacy schematic
  // maps may omit the collection; normalization adds an empty list, not props.
  if (map.objects !== undefined && (!Array.isArray(map.objects) || map.objects.length > 12000)) error('objects muss eine Liste mit höchstens 12000 Einträgen sein.');
  for (const item of Array.isArray(map.objects) ? map.objects.slice(0, 12000) : []) {
    if (!common(item, 'Weltobjekt')) continue;
    const definition = getObjectDefinition(item.kind);
    if (!definition) error(`${item.id}: Unbekannte Objektart.`);
    else if (!definition.variants.some(variant => variant.id === item.variant)) error(`${item.id}: Unbekannte Variante für ${definition.label}.`);
    if (item.rarity !== undefined && (typeof item.rarity !== 'string' || !Object.hasOwn(RARITIES, item.rarity) || !WEAPON_TYPES.includes(item.kind))) error(`${item.id}: Seltenheit muss einer gültigen Waffenstufe entsprechen.`);
    if (checkPoint(item.position, `Weltobjekt ${item.id}`) && islandValid && !pointInPolygon(item.position, map.island.points)) error(`Weltobjekt ${item.name} liegt außerhalb der Insel.`);
    if (!finite(item.rotation) || Math.abs(item.rotation) > Math.PI * 20) error(`${item.id}: Drehung muss in Radiant zwischen -20π und 20π liegen.`);
    if (!finite(item.scale) || item.scale < .25 || item.scale > 3) error(`${item.id}: Größe muss zwischen 0,25 und 3 liegen.`);
    if (['grass', 'flower'].includes(item.kind) && (!finite(item.radius) || item.radius < .5 || item.radius > 20)) error(`${item.id}: Flächenradius muss zwischen 0,5 und 20 Metern liegen.`);
    for (const key of ['radius', 'width', 'depth']) if (item[key] !== undefined && (!finite(item[key]) || item[key] < .25 || item[key] > 100)) error(`${item.id}: ${key} muss zwischen 0,25 und 100 liegen.`);
  }
  const zone = map.zone;
  if (!object(zone)) error('Die Nebelzone fehlt.');
  else {
    const centerValid = checkPoint(zone.center, 'Nebelzentrum');
    if (centerValid && islandValid && !pointInPolygon(zone.center, map.island.points)) error('Das Nebelzentrum muss auf der Insel liegen.');
    if (!finite(zone.initialRadius) || zone.initialRadius <= 0 || zone.initialRadius > LIMIT) error('Die Nebelzone benötigt einen positiven Anfangsradius.');
    if (!finite(zone.damagePerSecond) || zone.damagePerSecond < 0 || zone.damagePerSecond > 1000) error('Nebelschaden muss zwischen 0 und 1000 liegen.');
    if (!Array.isArray(zone.phases) || zone.phases.length < 1 || zone.phases.length > 20) error('Die Nebelzone benötigt 1 bis 20 Phasen.');
    let previousRadius = zone.initialRadius;
    for (const phase of Array.isArray(zone.phases) ? zone.phases.slice(0, 20) : []) {
      if (!common(phase, 'Nebelphase')) continue;
      if (!finite(phase.holdSeconds) || phase.holdSeconds < 0 || phase.holdSeconds > 7200) error(`${phase.id}: Ungültige Wartezeit.`);
      if (!finite(phase.shrinkSeconds) || phase.shrinkSeconds <= 0 || phase.shrinkSeconds > 7200) error(`${phase.id}: Schrumpfzeit muss größer als 0 sein.`);
      if (!finite(phase.radius) || phase.radius <= 0 || phase.radius >= previousRadius) error(`${phase.id}: Der Radius muss positiv und kleiner als in der vorigen Phase sein.`);
      previousRadius = phase.radius;
    }
    if (centerValid && islandValid && finite(zone.initialRadius) && map.island.points.some(point => Math.hypot(point[0] - zone.center[0], point[1] - zone.center[1]) > zone.initialRadius)) warnings.push('Teile der Insel liegen bereits am Anfang im Nebel.');
  }
  errors.push(...validateLandscape(map, { ids, checkPoint }));
  return { valid: errors.length === 0, errors, warnings };
}

export function getWorldmapStats(map) {
  const xs = map.island.points.map(point => point[0]), zs = map.island.points.map(point => point[1]);
  const widthM = Math.max(...xs) - Math.min(...xs), heightM = Math.max(...zs) - Math.min(...zs);
  const landAreaM2 = polygonArea(map.island.points);
  return {
    landAreaM2, widthM, heightM,
    walkAcrossSeconds: Math.max(widthM, heightM) / map.gameplay.walkSpeedMetersPerSecond,
    spawnCapacity: map.spawnAreas.reduce((sum, spawn) => sum + spawn.capacity, 0),
    matchDurationSeconds: map.zone.phases.reduce((sum, phase) => sum + phase.holdSeconds + phase.shrinkSeconds, 0),
    targetPlayers: map.gameplay.targetPlayers, areaPerPlayerM2: landAreaM2 / map.gameplay.targetPlayers,
    regionCount: map.regions.length, pathCount: map.paths.length, riverCount: map.rivers.length, placeCount: map.places.length, spawnAreaCount: map.spawnAreas.length,
    objectCount: map.objects?.length ?? 0,
    objectCounts: (map.objects ?? []).reduce((counts, item) => { counts[item.kind] = (counts[item.kind] ?? 0) + 1; return counts; }, {}),
  };
}

/** Pure planning preview: holds then linearly shrinks each phase, final radius persists. */
export function zoneAt(map, elapsed) {
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  let left = time, radius = map.zone.initialRadius;
  const total = map.zone.phases.reduce((sum, phase) => sum + phase.holdSeconds + phase.shrinkSeconds, 0);
  for (const phase of map.zone.phases) {
    if (left < phase.holdSeconds) return { center: [...map.zone.center], radius, phase: phase.id, remainingSeconds: Math.max(0, total - time), phaseRemainingSeconds: phase.holdSeconds + phase.shrinkSeconds - left, shrinking: false };
    left -= phase.holdSeconds;
    if (left < phase.shrinkSeconds) return { center: [...map.zone.center], radius: radius + (phase.radius - radius) * left / phase.shrinkSeconds, phase: phase.id, remainingSeconds: Math.max(0, total - time), phaseRemainingSeconds: phase.shrinkSeconds - left, shrinking: true };
    left -= phase.shrinkSeconds;
    radius = phase.radius;
  }
  return { center: [...map.zone.center], radius, phase: map.zone.phases.at(-1)?.id ?? 'finale', remainingSeconds: 0, phaseRemainingSeconds: 0, shrinking: false };
}

export function worldToThree([x, z], height = 0) { return { x, y: height, z }; }
