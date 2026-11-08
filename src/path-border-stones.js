import * as THREE from 'three';
import { createTerrainPaintIndex, terrainStampWeight } from './map/terrain-paint.js';
import { pathVergeOffset } from './terrain-art.js';

export const BORDER_STONE_RULES = Object.freeze({ spacing: .49, maximum: 6000, contourLevel: .5, grid: .32, maximumCells: 180000 });
const hash = (x, z, salt = 0) => { const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.17) * 43758.5453; return n - Math.floor(n); };
const profiles = Object.freeze({
  cobble: { color: '#969889', width: [.17,.53], length: [.25,.94], height: [.075,.23], cluster: [1.8,4.5], gap: [.85,2.7], scatter: .12 },
  earth: { color: '#91866b', width: [.12,.35], length: [.17,.58], height: [.045,.13], cluster: [.8,2.2], gap: [1.3,3.8], scatter: .18 },
  forest: { color: '#53624a', width: [.12,.34], length: [.19,.62], height: [.035,.10], cluster: [.7,1.8], gap: [1.8,4.6], scatter: .17 },
  sand: { color: '#bea77a', width: [.15,.46], length: [.23,.78], height: [.04,.13], cluster: [.8,2.2], gap: [1.7,4.5], scatter: .19 },
  stone: { color: '#737b78', width: [.10,.32], length: [.13,.49], height: [.04,.14], cluster: [1.2,3.1], gap: [.8,2.4], scatter: .16 },
  mud: { color: '#535747', width: [.13,.38], length: [.19,.66], height: [.025,.085], cluster: [.7,1.9], gap: [1.6,4.1], scatter: .17 },
  snow: { color: '#bdc8c7', width: [.13,.35], length: [.19,.56], height: [.025,.08], cluster: [.7,1.6], gap: [2.0,4.6], scatter: .12 },
  rock: { color: '#707367', width: [.16,.46], length: [.24,.76], height: [.07,.20], cluster: [.9,2.5], gap: [1.1,3.2], scatter: .16 },
});
const between = (range, random) => range[0] + (range[1] - range[0]) * random;
// Path presets are firm, fully painted strokes (.72 / 1). Soft natural-ground
// brushes and regional biome polygons must not acquire a decorative stone ring.
const isPathPaint = stamp => Boolean(profiles[stamp.type]) && (stamp.type === 'cobble'
  || (stamp.hardness ?? .3) >= .6 && (stamp.strength ?? .8) >= .85);

/** Ordered visible coverage. null selects the union of all path-like paint;
 * keeping the old default also supports callers inspecting cobble alone. */
export function paintedPathCoverage(index, x, z, type = 'cobble') {
  let opacity = 0, coverage = 0;
  const stamps = index.near(x, z);
  for (let i = stamps.length - 1; i >= 0; i--) {
    const amount = terrainStampWeight(stamps[i], x, z) * (1 - opacity);
    if (type === null ? isPathPaint(stamps[i]) : stamps[i].type === type) coverage += amount;
    opacity += amount;
    if (opacity > .99999) break;
  }
  return coverage;
}

function paintStyle(index, x, z) {
  let opacity = 0, strongest = 0, style = 'cobble';
  const totals = {}, stamps = index.near(x, z);
  for (let i = stamps.length - 1; i >= 0; i--) {
    const stamp = stamps[i], amount = terrainStampWeight(stamp, x, z) * (1 - opacity);
    if (isPathPaint(stamp)) {
      totals[stamp.type] = (totals[stamp.type] ?? 0) + amount;
      if (totals[stamp.type] > strongest) { strongest = totals[stamp.type]; style = stamp.type; }
    }
    opacity += amount;
    if (opacity > .99999) break;
  }
  return style;
}

function paintEdges(index) {
  const stamps = index.stamps.filter(s => isPathPaint(s) && s.strength > 0);
  const area = stamps.reduce((sum, s) => sum + (s.radius * 2 + 1) ** 2, 0);
  const step = Math.max(BORDER_STONE_RULES.grid, Math.sqrt(area / BORDER_STONE_RULES.maximumCells));
  const cells = new Set(), samples = new Map(), segments = [];
  for (const stamp of stamps) {
    const [x, z] = stamp.position, r = stamp.radius + step;
    for (let a = Math.floor((x - r) / step); a <= Math.ceil((x + r) / step); a++) {
      for (let b = Math.floor((z - r) / step); b <= Math.ceil((z + r) / step); b++) cells.add(`${a},${b}`);
    }
  }
  const sample = (x, z) => {
    const key = `${x},${z}`;
    if (!samples.has(key)) samples.set(key, paintedPathCoverage(index, x * step, z * step, null));
    return samples.get(key);
  };
  for (const cell of cells) {
    const [x, z] = cell.split(',').map(Number), corners = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
    const values = corners.map(([a, b]) => sample(a, b)), crossings = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      if ((values[i] >= .5) === (values[j] >= .5)) continue;
      const t = (.5 - values[i]) / (values[j] - values[i]);
      crossings.push([(corners[i][0] + (corners[j][0] - corners[i][0]) * t) * step,
        (corners[i][1] + (corners[j][1] - corners[i][1]) * t) * step]);
    }
    if (crossings.length === 2) segments.push(crossings);
    else if (crossings.length === 4) {
      // Consistent saddle split keeps separate shoulders separate.
      const inside = paintedPathCoverage(index, (x + .5) * step, (z + .5) * step, null) >= .5;
      if (inside === (values[0] >= .5)) segments.push([crossings[0], crossings[1]], [crossings[2], crossings[3]]);
      else segments.push([crossings[0], crossings[3]], [crossings[1], crossings[2]]);
    }
  }
  const key = p => p.map(n => n.toFixed(5)).join(','), adjacency = new Map(), visited = new Set(), paths = [];
  segments.forEach((segment, index) => segment.forEach(p => {
    const k = key(p); if (!adjacency.has(k)) adjacency.set(k, []); adjacency.get(k).push(index);
  }));
  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue;
    const points = [segments[i][0]], start = key(points[0]);
    let current = i;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      const edge = segments[current], last = key(points.at(-1));
      const next = key(edge[0]) === last ? edge[1] : edge[0]; points.push(next);
      if (key(next) === start) break;
      current = adjacency.get(key(next))?.find(n => !visited.has(n));
    }
    paths.push(points);
  }
  return paths;
}

function distanceToRoute(point, path) {
  let closest = Infinity;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = THREE.MathUtils.clamp(((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    closest = Math.min(closest, Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz));
  }
  return closest;
}

/** One visible union contour, with surviving clusters and genuinely empty worn
 * sections. Every variation is seeded from the contour/world, never Math.random. */
export function buildBorderStonePlacements(map, index = createTerrainPaintIndex(map), diagnostics = {}) {
  const placements = [], occupied = new Map(), routes = map.paths ?? [];
  Object.assign(diagnostics, { gapCount: 0, gaps: [], suppressed: { crossing: 0, paintInterior: 0, overlap: 0 } });
  function append(points, source, owner = null) {
    if (points.length < 2) return;
    const segments = []; let total = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 1e-8) continue;
      segments.push({ a, dx, dz, length, start: total }); total += length;
    }
    if (!segments.length) return;
    const contourId = `${source}:${points[0].map(n => n.toFixed(3)).join(',')}`;
    const seed = hash(points[0][0], points[0][1], source === 'paint' ? 81 : 39);
    let cursor = 0, clusterStart = .1, ordinal = 0;
    const at = distance => {
      while (cursor < segments.length - 1 && distance > segments[cursor].start + segments[cursor].length) cursor++;
      const segment = segments[cursor], t = THREE.MathUtils.clamp((distance - segment.start) / segment.length, 0, 1);
      return { x: segment.a[0] + segment.dx * t, z: segment.a[1] + segment.dz * t,
        dx: segment.dx / segment.length, dz: segment.dz / segment.length };
    };
    while (clusterStart < total && placements.length < BORDER_STONE_RULES.maximum) {
      const startPoint = at(clusterStart), clusterStyle = owner ? owner.kind === 'main' ? 'cobble' : 'earth' : paintStyle(index, startPoint.x, startPoint.z);
      const clusterProfile = profiles[clusterStyle], clusterEnd = Math.min(total, clusterStart + between(clusterProfile.cluster, hash(seed, ordinal, 11)));
      let along = clusterStart + .15;
      while (along < clusterEnd && placements.length < BORDER_STONE_RULES.maximum) {
        const point = at(along), style = owner ? clusterStyle : paintStyle(index, point.x, point.z), profile = profiles[style];
        const random = hash(point.x, point.z), length = between(profile.length, Math.pow(random, 1.15));
        const width = between(profile.width, hash(point.x, point.z, 3));
        const center = along; along += length * .72 + .10 + hash(point.x, point.z, 1) * .15;
        // Entire stones stay outside the deliberately missing sections.
        if (center - length / 2 < clusterStart || center + length / 2 > clusterEnd) continue;
        const lateral = (hash(point.x, point.z, 4) - .5) * profile.scatter * 2;
        const x = point.x + point.dz * lateral, z = point.z - point.dx * lateral;
        if (routes.some(p => p !== owner && distanceToRoute([x,z], p) < p.width / 2 + (p.kind === 'bridge' ? .2 : .04))) {
          diagnostics.suppressed.crossing++; continue;
        }
        if (owner && paintedPathCoverage(index, x, z, null) > .55) { diagnostics.suppressed.paintInterior++; continue; }
        const gx = Math.floor(x), gz = Math.floor(z), radius = Math.hypot(width,length) * .27;
        let nearby = false;
        for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
          if ((occupied.get(`${a},${b}`) ?? []).some(p => Math.hypot(x - p.x, z - p.z) < radius + p.radius)) nearby = true;
        }
        if (nearby) { diagnostics.suppressed.overlap++; continue; }
        const shapeRandom = hash(point.x, point.z, 10);
        const shape = ['mud','snow','stone'].includes(style) ? shapeRandom < .65 ? 2 : Math.floor(shapeRandom * 2) : Math.floor(shapeRandom * 3);
        const stone = { x, z, contourX: point.x, contourZ: point.z, along: center, contourId,
          direction: Math.atan2(point.dx, point.dz) + (hash(point.x, point.z, 2) - .5) * (style === 'cobble' ? 1.15 : 2.3),
          width, length, height: between(profile.height, hash(point.x, point.z, 5)),
          tint: .74 + hash(point.x, point.z, 6) * .46, source, style, shape, radius };
        placements.push(stone);
        const key = `${gx},${gz}`; if (!occupied.has(key)) occupied.set(key, []); occupied.get(key).push(stone);
      }
      const gapEnd = Math.min(total, clusterEnd + between(clusterProfile.gap, hash(seed, ordinal, 17)));
      if (gapEnd - clusterEnd > .3) {
        diagnostics.gapCount++;
        // Bounded inspect data; the total still reports every deliberate gap.
        if (diagnostics.gaps.length < 120) diagnostics.gaps.push({ contourId, start: clusterEnd, end: gapEnd, length: gapEnd - clusterEnd, style: clusterStyle });
      }
      clusterStart = gapEnd; ordinal++;
    }
  }
  for (const path of routes.filter(p => p.kind === 'main' || p.kind === 'trail')) for (const side of [-1, 1]) {
    append(path.points.map(([x, z], i) => {
      const offset = pathVergeOffset(path.points, i, path.width); return [x + offset[0] * side, z + offset[1] * side];
    }), 'route', path);
  }
  for (const points of paintEdges(index)) append(points, 'paint');
  return placements;
}

function stoneGeometry(variant) {
  const positions = [], colors = [], indices = [], sides = [7,5,9][variant];
  const radii = variant === 2 ? [.34,.49,.44,.27] : [.39,.50,.35];
  const levels = variant === 2 ? [0,.28,.65,.91] : [0,.29,.87];
  for (let level = 0; level < radii.length; level++) for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2, radius = radii[level] * (.80 + hash(i, level, variant + 5) * .32);
    positions.push(Math.cos(angle) * radius + (level ? .04 * variant : 0),
      levels[level] + (level === radii.length - 1 ? hash(i, 7, variant) * .09 : 0), Math.sin(angle) * radius);
    const shade = .81 + level / radii.length * .14 + hash(i, level, variant) * .08;
    colors.push(shade,shade,shade);
  }
  for (let level = 0; level < radii.length - 1; level++) for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides, a = level * sides + i, b = level * sides + j;
    indices.push(a,a+sides,b, b,a+sides,b+sides);
  }
  const top = positions.length / 3; positions.push(.035,1,-.025); colors.push(1,1,1);
  for (let i = 0; i < sides; i++) indices.push((radii.length-1)*sides+i,top,(radii.length-1)*sides+(i+1)%sides);
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3)); geometry.setIndex(indices);
  if (variant !== 2) { const faceted = geometry.toNonIndexed(); geometry.dispose(); geometry = faceted; }
  geometry.computeVertexNormals();
  return geometry;
}

export function createPathBorderStones(root, map, heightAt, isLand = () => true, index) {
  const diagnostics = {}, placements = buildBorderStonePlacements(map,index,diagnostics).filter(p => isLand(p.x,p.z)), chunks = new Map();
  const geometries = [0,1,2].map(stoneGeometry), material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .98 });
  const transform = new THREE.Object3D(), tint = new THREE.Color(), up = new THREE.Vector3(0,1,0), normal = new THREE.Vector3();
  const yaw = new THREE.Quaternion(), ground = new THREE.Quaternion(), byStyle = {};
  for (const p of placements) {
    const key = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (!chunks.has(key)) chunks.set(key, { x: (Math.floor(p.x / 64) + .5) * 64, z: (Math.floor(p.z / 64) + .5) * 64, placements: [[],[],[]], meshes: [] });
    chunks.get(key).placements[p.shape].push(p);
    const stats = byStyle[p.style] ??= { count: 0, minWidth: Infinity, maxWidth: 0, minLength: Infinity, maxLength: 0, shapes: new Set() };
    stats.count++; stats.minWidth = Math.min(stats.minWidth,p.width); stats.maxWidth = Math.max(stats.maxWidth,p.width);
    stats.minLength = Math.min(stats.minLength,p.length); stats.maxLength = Math.max(stats.maxLength,p.length); stats.shapes.add(p.shape);
  }
  for (const chunk of chunks.values()) for (let variant = 0; variant < 3; variant++) {
    const batch = chunk.placements[variant]; if (!batch.length) continue;
    const mesh = new THREE.InstancedMesh(geometries[variant],material,batch.length); mesh.name = 'Wegsaum · verwitterte Steinreste';
    batch.forEach((p,i) => {
      const sample = .16, dx = (heightAt(p.x+sample,p.z)-heightAt(p.x-sample,p.z))/(sample*2);
      const dz = (heightAt(p.x,p.z+sample)-heightAt(p.x,p.z-sample))/(sample*2);
      normal.set(-dx,1,-dz).normalize(); ground.setFromUnitVectors(up,normal); yaw.setFromAxisAngle(up,p.direction);
      transform.position.set(p.x,heightAt(p.x,p.z)+.015,p.z); transform.quaternion.copy(ground).multiply(yaw);
      transform.scale.set(p.width,p.height,p.length); transform.updateMatrix(); mesh.setMatrixAt(i,transform.matrix);
      tint.set(profiles[p.style].color).multiplyScalar(p.tint); mesh.setColorAt(i,tint);
    });
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh); chunk.meshes.push(mesh);
  }
  const sample = p => ({ x:p.x,z:p.z,contourX:p.contourX,contourZ:p.contourZ,source:p.source,style:p.style,
    width:p.width,length:p.length,height:p.height,shape:p.shape,along:p.along,contourId:p.contourId });
  const samples = Object.keys(byStyle).flatMap(style => placements.filter(p=>p.style===style).slice(0,12).map(sample));
  return { update(player, range = 100) {
      for (const chunk of chunks.values()) for (const mesh of chunk.meshes) mesh.visible = Math.hypot(player.x-chunk.x,player.z-chunk.z) < range+46;
    },
    get stats() { return { count: placements.length, maximum: BORDER_STONE_RULES.maximum, chunks: chunks.size,
      batches: [...chunks.values()].reduce((sum,c)=>sum+c.meshes.length,0),
      visibleChunks: [...chunks.values()].filter(c=>c.meshes.some(m=>m.visible)).length,
      placement: 'outer-contour-only', style: 'broken-thematic-verges',
      byStyle: Object.fromEntries(Object.entries(byStyle).map(([key,value])=>[key,{ count:value.count,minWidth:value.minWidth,maxWidth:value.maxWidth,
        minLength:value.minLength,maxLength:value.maxLength,shapeVariants:value.shapes.size }])),
      ...diagnostics, samples }; },
    dispose() { for (const chunk of chunks.values()) for (const mesh of chunk.meshes) { mesh.removeFromParent(); mesh.dispose(); }
      geometries.forEach(g=>g.dispose()); material.dispose(); } };
}
