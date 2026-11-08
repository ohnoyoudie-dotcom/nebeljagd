import * as THREE from 'three';
import { createTerrainPaintIndex, terrainStampWeight } from './map/terrain-paint.js';
import { pathVergeOffset } from './terrain-art.js';

export const BORDER_STONE_RULES = Object.freeze({ spacing: .49, maximum: 6000, contourLevel: .5, grid: .32, maximumCells: 180000 });
const hash = (x, z, salt = 0) => { const n = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.17) * 43758.5453; return n - Math.floor(n); };

export function paintedPathCoverage(index, x, z) {
  let opacity = 0, paving = 0;
  const stamps = index.near(x, z);
  for (let i = stamps.length - 1; i >= 0; i--) {
    const amount = terrainStampWeight(stamps[i], x, z) * (1 - opacity);
    if (stamps[i].type === 'cobble') paving += amount;
    opacity += amount;
    if (opacity > .99999) break;
  }
  return paving;
}

function paintEdges(index) {
  const stamps = index.stamps.filter(s => s.type === 'cobble' && s.strength > 0);
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
    if (!samples.has(key)) samples.set(key, paintedPathCoverage(index, x * step, z * step));
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
      const inside = paintedPathCoverage(index, (x + .5) * step, (z + .5) * step) >= .5;
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

/** Geometry follows the union's actual .5 coverage contour, never the interior
 * of overlapping brush stamps. Road crossings also stay free of border stones. */
export function buildBorderStonePlacements(map, index = createTerrainPaintIndex(map)) {
  const placements = [], occupied = new Map(), routes = (map.paths ?? []).filter(p => p.kind !== 'bridge');
  function append(points, source, owner = null) {
    let next = .22, travelled = 0;
    for (let i = 1; i < points.length && placements.length < BORDER_STONE_RULES.maximum; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 1e-8) continue;
      while (next <= travelled + length && placements.length < BORDER_STONE_RULES.maximum) {
        const t = (next - travelled) / length, x = a[0] + dx * t, z = a[1] + dz * t;
        const random = hash(x, z), width = .23 + random * .10;
        next += BORDER_STONE_RULES.spacing * (.91 + hash(x, z, 1) * .18);
        if (routes.some(p => p !== owner && distanceToRoute([x, z], p) < p.width / 2 - .12)) continue;
        if (owner && paintedPathCoverage(index, x, z) > .58) continue;
        const gx = Math.floor(x / .35), gz = Math.floor(z / .35);
        let nearby = false;
        for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
          if ((occupied.get(`${a},${b}`) ?? []).some(p => Math.hypot(x - p.x, z - p.z) < .34)) nearby = true;
        }
        if (nearby) continue;
        const stone = { x, z, direction: Math.atan2(dx, dz) + (hash(x, z, 2) - .5) * .26,
          width, length: .38 + hash(x, z, 3) * .14, height: .12 + hash(x, z, 4) * .09,
          tint: .85 + hash(x, z, 5) * .26, source };
        placements.push(stone);
        const key = `${gx},${gz}`; if (!occupied.has(key)) occupied.set(key, []); occupied.get(key).push(stone);
      }
      travelled += length;
    }
  }
  for (const path of routes.filter(p => p.kind === 'main')) for (const side of [-1, 1]) {
    append(path.points.map(([x, z], i) => {
      const offset = pathVergeOffset(path.points, i, path.width); return [x + offset[0] * side, z + offset[1] * side];
    }), 'route', path);
  }
  for (const points of paintEdges(index)) append(points, 'paint');
  return placements;
}

function stoneGeometry() {
  const positions = [], colors = [], sides = 7;
  const ring = (level, i) => {
    const angle = i / sides * Math.PI * 2, radius = [ .40, .50, .36 ][level] * (.9 + hash(i, level) * .18);
    return [Math.cos(angle) * radius, [0, .3, .85][level] + (level === 2 ? hash(i, 7) * .15 : 0), Math.sin(angle) * radius];
  };
  const add = (a, b, c, shade) => { positions.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) colors.push(shade, shade * .98, shade * .90); };
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    for (let level = 0; level < 2; level++) {
      const shade = .77 + hash(i, level + 30) * .18;
      add(ring(level, i), ring(level + 1, i), ring(level, j), shade);
      add(ring(level, j), ring(level + 1, i), ring(level + 1, j), shade);
    }
    add(ring(2, i), [0, .91, 0], ring(2, j), .96 + hash(i, 3) * .04);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  return geometry;
}

export function createPathBorderStones(root, map, heightAt, isLand = () => true, index) {
  const placements = buildBorderStonePlacements(map, index).filter(p => isLand(p.x, p.z)), chunks = new Map();
  const geometry = stoneGeometry(), material = new THREE.MeshStandardMaterial({ color: '#a0a28f', vertexColors: true, roughness: .95 });
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (const p of placements) {
    const key = `${Math.floor(p.x / 64)},${Math.floor(p.z / 64)}`;
    if (!chunks.has(key)) chunks.set(key, { x: (Math.floor(p.x / 64) + .5) * 64, z: (Math.floor(p.z / 64) + .5) * 64, placements: [] });
    chunks.get(key).placements.push(p);
  }
  for (const chunk of chunks.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, chunk.placements.length); mesh.name = 'Wegbegrenzung · behauene Randsteine';
    chunk.placements.forEach((p, i) => {
      transform.position.set(p.x, heightAt(p.x, p.z) + .025, p.z); transform.rotation.set(0, p.direction, 0);
      transform.scale.set(p.width, p.height, p.length); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
      tint.setRGB(p.tint, p.tint * .99, p.tint * .94); mesh.setColorAt(i, tint);
    });
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); root.add(mesh); chunk.mesh = mesh;
  }
  return { update(player, range = 100) { for (const chunk of chunks.values()) chunk.mesh.visible = Math.hypot(player.x - chunk.x, player.z - chunk.z) < range + 46; },
    get stats() { return { count: placements.length, maximum: BORDER_STONE_RULES.maximum, chunks: chunks.size,
      visibleChunks: [...chunks.values()].filter(c => c.mesh.visible).length, placement: 'outer-contour-only',
      samples: placements.slice(0, 12).map(p => ({ x: p.x, z: p.z, source: p.source })) }; },
    dispose() { for (const chunk of chunks.values()) { chunk.mesh.removeFromParent(); chunk.mesh.dispose(); } geometry.dispose(); material.dispose(); } };
}
