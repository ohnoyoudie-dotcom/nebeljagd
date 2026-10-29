import { TERRAIN_TYPES } from './landscape.js';

// Plain data and arithmetic only: SVG previews, vegetation and the 3D ground
// sample the same ordered paint document without loading a second renderer.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const palettes = new Map(TERRAIN_TYPES.map(item => [item.id, item]));
const toLinear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const hexColor = value => {
  const number = Number.parseInt(value.slice(1), 16);
  return [toLinear((number >> 16 & 255) / 255), toLinear((number >> 8 & 255) / 255), toLinear((number & 255) / 255)];
};
const hash = (x, z, seed = 0) => {
  let value = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
};

/** Smooth deterministic world-space noise. World coordinates, not tile UVs,
 * ensure neighbouring chunks have no material seam. */
export function terrainPaintNoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz, seed), b = hash(ix + 1, iz, seed), c = hash(ix, iz + 1, seed), d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

/** Soft irregular circular brush. Hardness changes its shoulder, not its saved
 * extent. Even hard edges receive a tiny antialiasing shoulder. */
export function terrainStampWeight(stamp, x, z) {
  const radius = stamp.radius ?? 4, dx = x - stamp.position[0], dz = z - stamp.position[1];
  const distance = Math.hypot(dx, dz);
  if (distance >= radius || radius <= 0 || stamp.strength === 0) return 0;
  const seed = stamp.seed ?? 1;
  const angle = Math.atan2(dz, dx), irregularity = .94 + .035 * Math.sin(angle * 5 + seed * .137) + .025 * Math.sin(angle * 9 - seed * .073);
  const normalized = distance / (radius * irregularity);
  const hardness = clamp(stamp.hardness ?? .3), shoulder = .04 + .92 * hardness;
  return (1 - smooth((normalized - shoulder) / (1 - shoulder))) * clamp(stamp.strength ?? .8);
}

/** Painting order is preserved inside every cell; later strokes cover earlier
 * ones. A 32m lookup avoids scanning thousands of stamps per blade or texel. */
export function createTerrainPaintIndex(mapOrStamps) {
  const sources = Array.isArray(mapOrStamps) ? mapOrStamps : mapOrStamps?.landscape?.terrain ?? [];
  const cellSize = 32, cells = new Map();
  const stamps = sources.map((source, order) => {
    const palette = palettes.get(source.type) ?? palettes.get('meadow');
    return { ...source, order, color: source.color ?? palette.color,
      linear: hexColor(source.color ?? palette.color), variation: source.variation ?? palette.variation };
  });
  for (const stamp of stamps) {
    const [x, z] = stamp.position, radius = stamp.radius;
    for (let cx = Math.floor((x - radius) / cellSize); cx <= Math.floor((x + radius) / cellSize); cx++) {
      for (let cz = Math.floor((z - radius) / cellSize); cz <= Math.floor((z + radius) / cellSize); cz++) {
        const key = `${cx},${cz}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(stamp);
      }
    }
  }
  const empty = [];
  return { stamps, length: stamps.length, cellSize,
    near(x, z) { return cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? empty; },
    overlapping(bounds) {
      const found = new Set();
      for (let x = Math.floor(bounds.minX / cellSize); x <= Math.floor(bounds.maxX / cellSize); x++) {
        for (let z = Math.floor(bounds.minZ / cellSize); z <= Math.floor(bounds.maxZ / cellSize); z++) {
          for (const stamp of cells.get(`${x},${z}`) ?? empty) {
            const dx = stamp.position[0] - clamp(stamp.position[0], bounds.minX, bounds.maxX);
            const dz = stamp.position[1] - clamp(stamp.position[1], bounds.minZ, bounds.maxZ);
            if (dx * dx + dz * dz <= stamp.radius ** 2 && stamp.strength !== 0) found.add(stamp);
          }
        }
      }
      return [...found].sort((a, b) => a.order - b.order);
    },
    get stats() { return { stamps: stamps.length, indexCells: cells.size }; },
  };
}

/** Small world-space material cues. They are baked once into nearby paint
 * tiles; neither animated nor represented by individual object meshes. */
export function terrainSurfaceDetail(type, x, z, seed = 1) {
  const broad = terrainPaintNoise(x * .48, z * .48, seed) - .5;
  const fine = terrainPaintNoise(x * 5.7, z * 5.7, seed + 101) - .5;
  if (type === 'cobble' || type === 'stone') {
    const scale = type === 'cobble' ? 1.55 : .8, px = x * scale, pz = z * scale;
    const ix = Math.floor(px), iz = Math.floor(pz); let first = Infinity, second = Infinity, tint = 1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const cx = ix + a, cz = iz + b;
      const dx = px - cx - .18 - hash(cx, cz, 17) * .64;
      const dz = pz - cz - .18 - hash(cx, cz, 71) * .64;
      const distance = dx * dx + dz * dz;
      if (distance < first) { second = first; first = distance; tint = .88 + hash(cx, cz, 417) * .22; }
      else if (distance < second) second = distance;
    }
    const mortar = smooth((Math.sqrt(second) - Math.sqrt(first)) / (type === 'cobble' ? .12 : .055));
    return (.57 + .43 * mortar) * tint + fine * .035;
  }
  if (type === 'sand') return .98 + broad * .06 + Math.sin(z * 8 + Math.sin(x * .65) * 1.7) * .025 + fine * .035;
  if (type === 'snow') {
    const drift = Math.sin(x * .19 + Math.sin(z * .11) * 1.8) * Math.cos(z * .16 - x * .07);
    const packed = terrainPaintNoise(x * 1.15, z * 1.15, seed + 307) - .5;
    return 1.0 + broad * .075 + drift * .035 + packed * .035 + fine * .018;
  }
  if (type === 'mud') return .93 + broad * .2 + fine * .06;
  if (type === 'rock') return .93 + broad * .3 + Math.abs(Math.sin(x * .8 + z * 1.1 + broad * 3)) * .08;
  if (type === 'forest') return .96 + broad * .15 + fine * .1;
  if (type === 'earth') return .98 + broad * .11 + fine * .14;
  return .98 + broad * .08 + fine * .055;
}

/** Return unpremultiplied linear RGB plus coverage in alpha. This alpha only
 * blends ground materials; vegetation texture transparency is never touched. */
export function sampleTerrainPaint(index, x, z, target = {}, withDetail = false) {
  let red = 0, green = 0, blue = 0, alpha = 0, paving = 0, snow = 0;
  const stamps = index.near(x, z);
  // Front-to-back composition is algebraically identical to ordered overpaint,
  // but can stop once newer strokes fully cover older ones. This bounds work
  // for repeatedly painted centres instead of shading every buried stamp.
  for (let i = stamps.length - 1; i >= 0; i--) {
    const stamp = stamps[i], weight = terrainStampWeight(stamp, x, z);
    if (weight <= .00001) continue;
    const amount = weight * (1 - alpha);
    const variation = 1 + (terrainPaintNoise(x * .31, z * .31, stamp.seed ?? 1) - .5) * stamp.variation * .7;
    const detail = withDetail && !(withDetail === 'shared-paving' && stamp.type === 'cobble') ? terrainSurfaceDetail(stamp.type, x, z, stamp.seed) : 1;
    const shade = variation * detail;
    red += stamp.linear[0] * shade * amount;
    green += stamp.linear[1] * shade * amount;
    blue += stamp.linear[2] * shade * amount;
    paving += stamp.type === 'cobble' ? amount : 0;
    snow += stamp.type === 'snow' ? amount : 0;
    alpha += amount;
    if (alpha > .99999) break;
  }
  target.r = alpha ? red / alpha : 0; target.g = alpha ? green / alpha : 0; target.b = alpha ? blue / alpha : 0; target.alpha = alpha;
  target.paving = alpha ? paving / alpha : 0;
  target.snow = alpha ? snow / alpha : 0;
  return target;
}

export function applyTerrainPaint(index, x, z, target, withDetail = false, scratch = {}) {
  const paint = sampleTerrainPaint(index, x, z, scratch, withDetail), keep = 1 - paint.alpha;
  target.r = target.r * keep + paint.r * paint.alpha;
  target.g = target.g * keep + paint.g * paint.alpha;
  target.b = target.b * keep + paint.b * paint.alpha;
  return target;
}
