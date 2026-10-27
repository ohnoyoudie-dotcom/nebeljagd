import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Original raised forest ledges. The solid base and the collision strips share
 * one footprint; the surface is scenery, never a walkable step or a hidden ramp.
 * Geometry is local to the object so the usual map rotation/scale applies.
 */
const DEFINITIONS = Object.freeze({
  ridge: Object.freeze({ label: 'Bewachsene Felskante', height: 3.05, halfWidth: 6, halfDepth: 2.5,
    columns: [[-6, -4.1, -1.35, 1.6], [-4.1, -2, -2.1, 2.2], [-2, .7, -2.5, 2.5], [.7, 3.5, -2.15, 2.35], [3.5, 6, -1.55, 1.7]] }),
  knoll: Object.freeze({ label: 'Bewachsene Felskuppe', height: 2.6, halfWidth: 3, halfDepth: 2.5,
    columns: [[-3, -1.8, -1.3, 1.25], [-1.8, -.5, -2.2, 2.1], [-.5, 1.25, -2.5, 2.5], [1.25, 2.25, -2.1, 1.85], [2.25, 3, -1.15, 1.1]] }),
});

export const MOUND_VARIANTS = Object.freeze(Object.keys(DEFINITIONS));
export function getMoundDefinition(variant = 'ridge') {
  const definition = DEFINITIONS[variant];
  if (!definition) throw new Error(`Unbekannte bewachsene Erhöhung: ${variant}`);
  return { ...definition, columns: definition.columns.map(column => [...column]) };
}

/** Rectangles join without gaps. Movement, projectile and sight systems can use
 * these in the object's local coordinates; no circular proxy covers open space.
 */
export function moundCollisionWalls(variant = 'ridge') {
  const definition = getMoundDefinition(variant);
  return definition.columns.map(([minX, maxX, minZ, maxZ], index) => ({
    minX, maxX, minZ, maxZ, minY: 0,
    maxY: definition.height - .18 + Math.sin(index * 1.47) * .12,
    type: 'mound',
  }));
}

export function moundFootprint(variant = 'ridge') {
  const columns = getMoundDefinition(variant).columns;
  const points = [];
  const add = (x, z) => {
    const previous = points.at(-1);
    if (!previous || previous[0] !== x || previous[1] !== z) points.push([x, z]);
  };
  for (const [minX, maxX, minZ] of columns) { add(minX, minZ); add(maxX, minZ); }
  for (let i = columns.length - 1; i >= 0; i--) {
    const [minX, maxX, , maxZ] = columns[i]; add(maxX, maxZ); add(minX, maxZ);
  }
  return points;
}

/** Resolve a player's circle against the OUTER solid footprint. Resolving each
 * adjacent strip separately would trap a spawn inside their shared seams. */
export function createMoundMovementResolver(variant = 'ridge') {
  const outline = moundFootprint(variant), walls = moundCollisionWalls(variant);
  return (position, radius = .42) => {
    const reach = Math.max(0, Number.isFinite(radius) ? radius : 0);
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return position;
    for (let pass = 0; pass < 4; pass++) {
      const inside = walls.some(w => position.x >= w.minX && position.x <= w.maxX && position.z >= w.minZ && position.z <= w.maxZ);
      let nearest = null;
      for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i], [bx, bz] = outline[(i + 1) % outline.length];
        const ex = bx - ax, ez = bz - az, lengthSquared = ex * ex + ez * ez;
        const t = THREE.MathUtils.clamp(((position.x - ax) * ex + (position.z - az) * ez) / lengthSquared, 0, 1);
        const x = ax + t * ex, z = az + t * ez, distance = Math.hypot(position.x - x, position.z - z);
        if (!nearest || distance < nearest.distance) nearest = { x, z, distance, ex, ez };
      }
      if (!inside && nearest.distance >= reach) break;
      let nx = (inside ? -1 : 1) * (position.x - nearest.x);
      let nz = (inside ? -1 : 1) * (position.z - nearest.z);
      let length = Math.hypot(nx, nz);
      if (length < 1e-8) { nx = nearest.ez; nz = -nearest.ex; length = Math.hypot(nx, nz); }
      position.x = nearest.x + nx / length * (reach + .0001);
      position.z = nearest.z + nz / length * (reach + .0001);
    }
    return position;
  };
}

function seededRandom(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}
function colorGeometry(geometry, color) {
  const c = new THREE.Color(color), colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}
function mergeParts(geometries) {
  const converted = geometries.map(geometry => geometry.index ? geometry.toNonIndexed() : geometry);
  for (const geometry of converted) for (const name of Object.keys(geometry.attributes)) {
    if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
  }
  const merged = mergeGeometries(converted);
  for (let i = 0; i < geometries.length; i++) {
    if (converted[i] !== geometries[i]) converted[i].dispose();
    geometries[i].dispose();
  }
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

export function createMoundPrototype(variant = 'ridge') {
  const definition = getMoundDefinition(variant), outline = moundFootprint(variant);
  const r = seededRandom(variant === 'ridge' ? 331507 : 740219);
  const positions = [], colors = [];
  const topHeights = outline.map(([x, z]) => definition.height + .11 * Math.sin(x * .77 + z) - .06 * Math.cos(z * 2.1));
  const tint = new THREE.Color();
  function triangle(a, b, c, baseColor, variation = 1) {
    tint.set(baseColor).multiplyScalar(variation);
    for (const point of [a, b, c]) { positions.push(...point); colors.push(tint.r, tint.g, tint.b); }
  }
  // Close to vertical faces make this read as a raised edge rather than a hill
  // the player should be able to climb. Bands and angular creases break up walls.
  const rockColors = ['#555b48', '#4b5447', '#626652', '#444e43', '#6b705a'];
  for (let layer = 0; layer < 3; layer++) {
    const lowerScale = [1, .99, .95][layer], upperScale = [.99, .95, .86][layer];
    const lowerY = [0, .26, .65][layer], upperY = [.26, .65, 1][layer];
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      const [ax, az] = outline[i], [bx, bz] = outline[next];
      const a = [ax * lowerScale, topHeights[i] * lowerY - .045, az * lowerScale];
      const b = [bx * lowerScale, topHeights[next] * lowerY - .045, bz * lowerScale];
      const c = [bx * upperScale, topHeights[next] * upperY - .045, bz * upperScale];
      const d = [ax * upperScale, topHeights[i] * upperY - .045, az * upperScale];
      const color = rockColors[(i + layer * 2) % rockColors.length], shade = .9 + r() * .2;
      triangle(a, d, b, color, shade); triangle(b, d, c, color, shade * (.96 + r() * .08));
    }
  }
  const cliff = new THREE.BufferGeometry();
  cliff.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cliff.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); cliff.computeVertexNormals();

  // A broad mossy cap follows the silhouette. Earcut handles the stepped outline
  // correctly, including its concave parts, instead of stretching a centre fan.
  const shape = outline.map(([x, z]) => new THREE.Vector2(x * .87, z * .87));
  const capPositions = [], capColors = [];
  const capIndices = THREE.ShapeUtils.triangulateShape(shape, []);
  for (const face of capIndices) {
    for (const index of [...face].reverse()) {
      const [x, z] = outline[index];
      tint.set('#487643').multiplyScalar(.92 + .12 * Math.sin(x * .8 + z * .9) + .05 * Math.cos(x * 2.1 - z));
      capPositions.push(shape[index].x, topHeights[index] + .035, shape[index].y);
      capColors.push(tint.r, tint.g, tint.b);
    }
  }
  const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(capColors, 3)); cap.computeVertexNormals();

  const plants = [], stones = [cliff], turf = [cap];
  const capHeightAt = (x, z) => definition.height + .11 * Math.sin(x * .77 + z) - .06 * Math.cos(z * 2.1);
  const inside = (x, z, margin = .4) => definition.columns.some(([a, b, c, d]) => x > a + margin && x < b - margin && z > c + margin && z < d - margin);
  const foliageColors = ['#557444', '#40603a', '#65874b', '#769653'];
  const plantCount = variant === 'ridge' ? 24 : 14;
  let planted = 0;
  for (let attempt = 0; attempt < plantCount * 30 && planted < plantCount; attempt++) {
    const x = (r() - .5) * definition.halfWidth * 1.5, z = (r() - .5) * definition.halfDepth * 1.5;
    if (!inside(x, z, .16)) continue;
    const y = capHeightAt(x, z), reach = .33 + r() * .32;
    const shrub = new THREE.IcosahedronGeometry(1, 0); shrub.scale(reach, .23 + r() * .2, reach * .8); shrub.rotateY(r() * 6.28); shrub.translate(x, y + .17, z);
    plants.push(colorGeometry(shrub, foliageColors[planted % foliageColors.length]));
    // Broad low fern leaves keep vegetation readable from the top-down camera.
    for (let leaf = 0; leaf < 8; leaf++) {
      const angle = leaf / 8 * Math.PI * 2 + r() * .25;
      const length = .4 + r() * .42, width = .09 + r() * .055;
      const ex = Math.sin(angle), ez = Math.cos(angle);
      const vertices = [x, y + .1, z, x + ex * length * .48 + ez * width, y + .25, z + ez * length * .48 - ex * width,
        x + ex * length, y + .12, z + ez * length,
        x, y + .1, z, x + ex * length, y + .12, z + ez * length,
        x + ex * length * .48 - ez * width, y + .25, z + ez * length * .48 + ex * width];
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.computeVertexNormals();
      plants.push(colorGeometry(geo, foliageColors[(planted + leaf) % foliageColors.length]));
    }
    planted++;
  }
  // Small embedded stones on the cap give the broad surface some scale. Nothing
  // protrudes beyond the solid base, so decorations never create invisible reach.
  for (let i = 0; i < (variant === 'ridge' ? 7 : 4); i++) {
    const x = (r() - .5) * definition.halfWidth * 1.4, z = (r() - .5) * definition.halfDepth * 1.3;
    const geo = new THREE.IcosahedronGeometry(1, 0); geo.scale(.24 + r() * .25, .12 + r() * .12, .2 + r() * .22); geo.rotateY(r() * 6); geo.translate(x, capHeightAt(x, z) + .06, z);
    stones.push(colorGeometry(geo, '#6c7259'));
  }

  const rockMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, roughness: 1 });
  const turfMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, side: THREE.DoubleSide, forceSinglePass: true });
  const parts = [
    { geometry: mergeParts(stones), material: rockMaterial, castShadow: true },
    { geometry: mergeParts(turf), material: turfMaterial, castShadow: true },
    { geometry: mergeParts(plants), material: foliageMaterial, castShadow: true },
  ];
  return { parts, walls: moundCollisionWalls(variant), outline, footprint: { halfWidth: definition.halfWidth, halfDepth: definition.halfDepth },
    height: definition.height, label: definition.label, resolveMovement: createMoundMovementResolver(variant) };
}
