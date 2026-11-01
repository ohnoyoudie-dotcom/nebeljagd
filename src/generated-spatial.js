import * as THREE from 'three';
import { pointInPolygon, distanceToSegment, isLandPoint, landBoundaryRings } from './map/model.js';
import { terrainPalette } from './terrain-art.js';
import { createTerrainPaintIndex, applyTerrainPaint } from './map/terrain-paint.js';
import { getLandscape, biomeRuntimeId } from './map/landscape.js';
import { getEnvironmentKitDefinition } from './map/environment-kit-definitions.js';

const CHUNK = 64;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function projection(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length = dx * dx + dz * dz;
  const t = length ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / length, 0, 1) : 0;
  const px = a[0] + dx * t, pz = a[1] + dz * t;
  return { x: px, z: pz, t, dx, dz, distance: Math.hypot(x - px, z - pz) };
}

/** Triangulate actual dry land; water polygons are holes, not painted overlays.
 * Work on copies because Three removes repeated closing vertices in place. */
export function triangulateWorldLand(map) {
  const [outline, ...holes] = landBoundaryRings(map).map(ring => ring.map(([x, z]) => new THREE.Vector2(x, z)));
  const indices = THREE.ShapeUtils.triangulateShape(outline, holes);
  const points = [outline, ...holes].flat().map(point => [point.x, point.y]);
  return indices.map(triangle => triangle.map(index => points[index]));
}

function segmentIndex(lines, padding = 0, cellSize = 32) {
  const cells = new Map(), segments = [];
  for (const line of lines) for (let i = 1; i < line.points.length; i++) {
    const a = line.points[i - 1], b = line.points[i], margin = padding + (line.width ?? 0) / 2;
    const segment = { a, b, line }; segments.push(segment);
    for (let x = Math.floor((Math.min(a[0], b[0]) - margin) / cellSize); x <= Math.floor((Math.max(a[0], b[0]) + margin) / cellSize); x++) {
      for (let z = Math.floor((Math.min(a[1], b[1]) - margin) / cellSize); z <= Math.floor((Math.max(a[1], b[1]) + margin) / cellSize); z++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(segment);
      }
    }
  }
  return {
    segments,
    near(x, z) { return cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []; },
    closest(x, z) {
      let result = null;
      for (const segment of this.near(x, z)) {
        const candidate = projection(x, z, segment.a, segment.b);
        if (!result || candidate.distance < result.distance) result = { ...candidate, ...segment };
      }
      return result;
    },
  };
}

/** Deterministic CPU geometry shared by rendering, movement and local inspection. */
export function createWorldSpatialModel(map) {
  const terrainPaint = createTerrainPaintIndex(map), paintScratch = {};
  const regions = map.regions.map(region => ({ ...region, colorValue: terrainPalette(region.biome, region.color),
    minX: Math.min(...region.points.map(p => p[0])), maxX: Math.max(...region.points.map(p => p[0])),
    minZ: Math.min(...region.points.map(p => p[1])), maxZ: Math.max(...region.points.map(p => p[1])) }));
  const paintedBiomes = getLandscape(map).biomes.map((item, order) => ({
    ...item, order, softness: Number.isFinite(item.softness) ? clamp(item.softness, 0, 1) : .6,
    runtimeBiome: biomeRuntimeId(item.presetId),
  }));
  const biomeCells = new Map(), biomeCellSize = 64;
  for (const item of paintedBiomes) {
    const radius = item.radius ?? 0;
    for (let gx = Math.floor((item.position[0] - radius) / biomeCellSize); gx <= Math.floor((item.position[0] + radius) / biomeCellSize); gx++) {
      for (let gz = Math.floor((item.position[1] - radius) / biomeCellSize); gz <= Math.floor((item.position[1] + radius) / biomeCellSize); gz++) {
        const key = `${gx},${gz}`; if (!biomeCells.has(key)) biomeCells.set(key, []); biomeCells.get(key).push(item);
      }
    }
  }
  const coast = segmentIndex(landBoundaryRings(map).map(ring => ({ points: [...ring, ring[0]], width: 0 })), 30);
  const waterAreas = (map.waterAreas ?? []).map(area => ({ ...area,
    minX: Math.min(...area.points.map(point => point[0])), maxX: Math.max(...area.points.map(point => point[0])),
    minZ: Math.min(...area.points.map(point => point[1])), maxZ: Math.max(...area.points.map(point => point[1])) }));
  const isLand = (x, z) => isLandPoint(map, [x, z]);
  function inWaterArea(x, z, padding = 0) {
    return waterAreas.some(area => {
      if (x < area.minX - padding || x > area.maxX + padding || z < area.minZ - padding || z > area.maxZ + padding) return false;
      if (pointInPolygon([x, z], area.points)) return true;
      return padding > 0 && area.points.some((point, i, ring) => distanceToSegment([x, z], point, ring[(i + 1) % ring.length]) < padding);
    });
  }
  const rivers = segmentIndex(map.rivers, 14);
  const bridges = segmentIndex(map.paths.filter(path => path.kind === 'bridge'), 2);
  const houseSites = (map.objects ?? []).filter(item => item.kind === 'house');
  const houseCells = new Map();
  const refinedHouseSites = [];
  const regionAt = (x, z) => [...regions].reverse().find(region => x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ && pointInPolygon([x, z], region.points)) ?? regions[0];
  function biomeHeight(biome, x, z) {
    const wave = Math.sin(x * .013 + Math.sin(z * .009) * 1.4) * .55 + Math.cos(z * .016 - x * .004) * .45;
    if (biome === 'snow') return 9 + 16 * (wave * .5 + .5) ** 2 + 2 * Math.sin(x * .047 + z * .02);
    if (biome === 'volcanic') return 5 + 15 * Math.abs(wave) + 1.1 * Math.cos(x * .049 - z * .03);
    if (biome === 'forest') return 1.4 + 2.8 * (wave + 1) / 2;
    if (biome === 'marsh') return .65 + .22 * wave;
    if (biome === 'dunes') return 1.5 + 2.1 * (Math.sin(x * .024 + z * .016) * .5 + .5);
    if (biome === 'heath') return 1.6 + 1.3 * (wave + 1) / 2;
    return 1.15 + .35 * wave + .12 * Math.sin(x * .06 + z * .04);
  }
  function regionWeights(x, z) {
    const weights = [];
    for (const region of regions) {
      if (x < region.minX - 24 || x > region.maxX + 24 || z < region.minZ - 24 || z > region.maxZ + 24) continue;
      const inside = pointInPolygon([x, z], region.points);
      let distance = 24;
      for (let i = 0; i < region.points.length; i++) distance = Math.min(distance, distanceToSegment([x, z], region.points[i], region.points[(i + 1) % region.points.length]));
      const weight = inside ? 1 + distance / 24 : Math.max(0, 1 - distance / 24);
      if (weight > 0) weights.push([region, weight]);
    }
    if (!weights.length) weights.push([regionAt(x, z), 1]);
    return weights;
  }
  function biomeWeightsAt(x, z) {
    const weights = new Map();
    let baseTotal = 0;
    for (const [region, weight] of regionWeights(x, z)) {
      const biome = region.biome;
      weights.set(biome, (weights.get(biome) ?? 0) + weight);
      baseTotal += weight;
    }
    if (baseTotal > 0) for (const [biome, weight] of weights) weights.set(biome, weight / baseTotal);
    const candidates = biomeCells.get(`${Math.floor(x / biomeCellSize)},${Math.floor(z / biomeCellSize)}`) ?? [];
    for (const item of candidates) {
      const distance = Math.hypot(x - item.position[0], z - item.position[1]);
      if (distance > item.radius) continue;
      const softness = item.softness;
      const inner = item.radius * (1 - softness);
      const edge = softness <= .0001 ? 1 : 1 - smooth(inner, item.radius, distance);
      const influence = clamp((item.strength ?? 1) * edge, 0, 1);
      if (influence <= .0001) continue;
      for (const [biome, weight] of weights) weights.set(biome, weight * (1 - influence));
      weights.set(item.runtimeBiome, (weights.get(item.runtimeBiome) ?? 0) + influence);
    }
    let total = 0;
    for (const weight of weights.values()) total += weight;
    if (total <= .0001) return [{ biome: regionAt(x, z).biome, weight: 1 }];
    return [...weights.entries()]
      .map(([biome, weight]) => ({ biome, weight: weight / total }))
      .filter(item => item.weight > .001)
      .sort((a, b) => b.weight - a.weight);
  }
  function biomeAt(x, z) { return biomeWeightsAt(x, z)[0]?.biome ?? regionAt(x, z).biome; }
  function rawLand(x, z) {
    let total = 0, value = 0;
    for (const [region, weight] of regionWeights(x, z)) { total += weight; value += biomeHeight(region.biome, x, z) * weight; }
    let height = value / total;
    const shore = coast.closest(x, z);
    if (shore && shore.distance < 24) height = THREE.MathUtils.lerp(.52, height, smooth(0, 24, shore.distance));
    return height;
  }
  const waterAt = (x, z) => {
    const hit = rivers.closest(x, z);
    return hit ? { ...hit, height: rawLand(hit.x, hit.z) * .25 + .14 } : null;
  };
  function baseGround(x, z) {
    let height = rawLand(x, z);
    const water = waterAt(x, z);
    if (water) height = THREE.MathUtils.lerp(water.height - .7, height, smooth(water.line.width / 2 - .3, water.line.width / 2 + 11, water.distance));
    return height;
  }
  for (const house of houseSites) {
    const scale = house.scale ?? 1, definition = getEnvironmentKitDefinition('house', house.variant);
    const terrain = definition?.terrain;
    const halfWidth = (terrain ? definition.footprint.halfWidth + terrain.padding : 9.3) * scale;
    const halfDepth = (terrain ? definition.footprint.halfDepth + terrain.padding : 9.1) * scale;
    const radius = Math.hypot(halfWidth, halfDepth), margin = Math.max(17 * scale, radius) + 7;
    const record = { ...house, halfWidth, halfDepth, radius,
      maxTriangleEdge: terrain ? terrain.maxTriangleEdge * scale : null,
      plateau: baseGround(...house.position), cos: Math.cos(house.rotation ?? 0), sin: Math.sin(house.rotation ?? 0) };
    if (terrain) refinedHouseSites.push(record);
    for (let x = Math.floor((house.position[0] - margin) / CHUNK); x <= Math.floor((house.position[0] + margin) / CHUNK); x++) for (let z = Math.floor((house.position[1] - margin) / CHUNK); z <= Math.floor((house.position[1] + margin) / CHUNK); z++) {
      const key = `${x},${z}`; if (!houseCells.has(key)) houseCells.set(key, []); houseCells.get(key).push(record);
    }
  }
  function groundAt(x, z) {
    let height = baseGround(x, z);
    for (const house of houseCells.get(`${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`) ?? []) {
      const dx = x - house.position[0], dz = z - house.position[1];
      const lx = house.cos * dx - house.sin * dz, lz = house.sin * dx + house.cos * dz;
      const outside = Math.max(Math.abs(lx) - house.halfWidth, Math.abs(lz) - house.halfDepth);
      height = THREE.MathUtils.lerp(house.plateau, height, smooth(0, 6.5, outside));
    }
    return height;
  }
  function refineTerrainTriangle(a, b, c) {
    if (!refinedHouseSites.length) return false;
    const edge2 = (p, q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2;
    const longest2 = Math.max(edge2(a, b), edge2(b, c), edge2(c, a));
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    // The normal island mesh can span an entire room with one triangle. Only
    // refine locally so every vertex beneath this floor lies on its plateau.
    return refinedHouseSites.some(house => longest2 > house.maxTriangleEdge ** 2
      && maxX >= house.position[0] - house.radius && minX <= house.position[0] + house.radius
      && maxZ >= house.position[1] - house.radius && minZ <= house.position[1] + house.radius);
  }
  function bridgeAt(x, z, padding = 0) {
    // River bridges do not turn a polygonal lagoon into traversable land.
    if (inWaterArea(x, z)) return null;
    for (const segment of bridges.near(x, z)) {
      const dx = segment.b[0] - segment.a[0], dz = segment.b[1] - segment.a[1];
      const along = ((x - segment.a[0]) * dx + (z - segment.a[1]) * dz) / (dx * dx + dz * dz);
      if (along < 0 || along > 1) continue;
      const p = projection(x, z, segment.a, segment.b);
      if (p.distance <= segment.line.width / 2 + padding) {
        const water = waterAt(x, z);
        return { ...p, line: segment.line, height: (water?.height ?? baseGround(x, z)) + .67 };
      }
    }
    return null;
  }
  function baseColorAt(x, z, target = new THREE.Color()) {
    target.setRGB(0, 0, 0); let total = 0;
    for (const [region, weight] of regionWeights(x, z)) {
      target.r += region.colorValue.r * weight; target.g += region.colorValue.g * weight; target.b += region.colorValue.b * weight; total += weight;
    }
    // Broad green washes stay legible under trees and provide a soft painted
    // floor. Variation stays deterministic and does not change terrain height.
    const broad = Math.sin(x * .075 + Math.sin(z * .061) * 1.7) * Math.cos(z * .081 - x * .022);
    const patches = Math.sin(x * .19 - z * .13) * Math.cos(z * .23 + x * .07);
    target.multiplyScalar((.94 + .10 * broad + .035 * patches) / total);
    const shore = coast.closest(x, z);
    if (shore?.distance < 3.2) target.lerp(new THREE.Color('#c9bb87'), (1 - shore.distance / 3.2) * .75);
    return target;
  }
  function colorAt(x, z, target = new THREE.Color()) {
    baseColorAt(x, z, target);
    return terrainPaint.length ? applyTerrainPaint(terrainPaint, x, z, target, false, paintScratch) : target;
  }
  function resolveShoreMovement(position, radius = .42) {
    let shore = coast.closest(position.x, position.z);
    if (!isLand(position.x, position.z) || shore && shore.distance < radius + .04) {
      if (!shore) {
        let minimum = Infinity;
        for (const segment of coast.segments) {
          const candidate = projection(position.x, position.z, segment.a, segment.b);
          if (candidate.distance < minimum) { shore = candidate; minimum = candidate.distance; }
        }
      }
      if (shore) {
        const length = Math.hypot(shore.dx, shore.dz) || 1;
        let nx = -shore.dz / length, nz = shore.dx / length;
        if (!isLand(shore.x + nx * (radius + .1), shore.z + nz * (radius + .1))) { nx *= -1; nz *= -1; }
        position.x = shore.x + nx * (radius + .08);
        position.z = shore.z + nz * (radius + .08);
      }
    }
    return position;
  }
  return { groundAt, refineTerrainTriangle, rawLand, regionAt, biomeAt, biomeWeightsAt, colorAt, baseColorAt, terrainPaint, waterAt, bridgeAt, coast, rivers,
    isLand, resolveShoreMovement,
    isWater: (x, z, padding = 0) => {
      if (inWaterArea(x, z, padding)) return true;
      const water = waterAt(x, z);
      return Boolean(water && water.distance < water.line.width / 2 + padding && !bridgeAt(x, z));
    } };
}
