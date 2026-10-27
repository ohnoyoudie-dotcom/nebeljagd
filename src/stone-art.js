import * as THREE from 'three';

// One original stone artwork is shared by all ruin/rock colour variants.
// Keep both maps cached: changing a material tint must not allocate a new texture.
let cachedMaps;
function stoneMaps() {
  if (cachedMaps) return cachedMaps;
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  albedoCanvas.width = albedoCanvas.height = bumpCanvas.width = bumpCanvas.height = size;
  const paint = albedoCanvas.getContext('2d');
  const relief = bumpCanvas.getContext('2d');
  const albedo = paint.createImageData(size, size);
  const heights = relief.createImageData(size, size);
  function hash(x, y, seed) {
    let n = Math.imul(x + seed * 41, 374761393) ^ Math.imul(y + seed * 73, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  const smooth = value => value * value * (3 - 2 * value);
  function noise(u, v, cells, seed) {
    const x = u * cells, y = v * cells;
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix % cells, iy % cells, seed), b = hash((ix + 1) % cells, iy % cells, seed);
    const c = hash(ix % cells, (iy + 1) % cells, seed), d = hash((ix + 1) % cells, (iy + 1) % cells, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const broad = noise(u, v, 4, 27), mottling = noise(u, v, 16, 39), grit = noise(u, v, 64, 61);
    const grain = hash(x, y, 103);
    const value = 170 + broad * 42 + mottling * 22 + (grain - .5) * 16;
    const index = (y * size + x) * 4;
    albedo.data[index] = value + 5;
    albedo.data[index + 1] = value + 4;
    albedo.data[index + 2] = value - 4;
    albedo.data[index + 3] = 255;
    const height = 102 + broad * 33 + mottling * 33 + grit * 32 + grain * 17;
    heights.data[index] = heights.data[index + 1] = heights.data[index + 2] = height;
    heights.data[index + 3] = 255;
  }
  paint.putImageData(albedo, 0, 0); relief.putImageData(heights, 0, 0);
  let randomSeed = 7231;
  const random = () => { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) | 0; return (randomSeed >>> 0) / 4294967296; };
  // Uneven mineral veins and branching fractures, rather than a repeated brick grid.
  function crack(startX, startY, length, angle, branch = false) {
    const points = [[startX, startY]];
    let x = startX, y = startY;
    for (let segment = 0; segment < length; segment++) {
      angle += (random() - .5) * .6;
      x += Math.cos(angle) * (5 + random() * 10); y += Math.sin(angle) * (5 + random() * 10);
      points.push([x, y]);
      if (!branch && segment === Math.floor(length * .55)) crack(x, y, Math.max(4, Math.floor(length * .3)), angle + .65, true);
    }
    function trace(context, color, width, offset = 0) {
      context.beginPath(); context.moveTo(points[0][0] + offset, points[0][1] + offset);
      for (const point of points.slice(1)) context.lineTo(point[0] + offset, point[1] + offset);
      context.strokeStyle = color; context.lineWidth = width; context.lineJoin = 'round'; context.stroke();
    }
    trace(paint, '#f5edd044', 2.2, 1.2); trace(paint, '#3c453c8c', .75);
    trace(relief, '#3d3d3d', 1.2);
  }
  for (let i = 0; i < 12; i++) crack(random() * size, random() * size, 5 + Math.floor(random() * 15), random() * Math.PI * 2);
  // Soft moss colonies with ragged edges, and pale lichen dust on exposed stone.
  for (let colony = 0; colony < 24; colony++) {
    const x = random() * size, y = random() * size, radius = 12 + random() * 31;
    const gradient = paint.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, '#68754996'); gradient.addColorStop(.52, '#7883595c'); gradient.addColorStop(1, '#6f7b4e00');
    paint.fillStyle = gradient; paint.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    for (let spot = 0; spot < 22; spot++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * radius * .86;
      const sx = x + Math.cos(angle) * distance, sy = y + Math.sin(angle) * distance;
      paint.fillStyle = spot % 4 ? '#737e4e43' : '#c1c59a6b';
      paint.beginPath(); paint.ellipse(sx, sy, 1 + random() * 3, .7 + random() * 2, angle, 0, Math.PI * 2); paint.fill();
      relief.fillStyle = '#bbbbbb35'; relief.fillRect(sx, sy, 2, 2);
    }
  }
  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.name = 'Nebeljagd original weathered stone';
  }
  cachedMaps = { map, bumpMap };
  return cachedMaps;
}

/** Shared original fieldstone texture; the caller controls the ruin/rock colour. */
export function createWeatheredStone(color) {
  const { map, bumpMap } = stoneMaps();
  return new THREE.MeshStandardMaterial({
    color, map, bumpMap, bumpScale: .095, roughness: .97, metalness: 0,
    envMapIntensity: .25,
  });
}
