import * as THREE from 'three';

const PALETTES = {
  meadow: ['#36825b', .64],
  forest: ['#346c53', .48],
  marsh: ['#3a8074', .24],
};

/** Keep the editor's chosen regional colours, with a woodland material tint for
 * the green biomes. Snow, heath, ash and sand retain their authored palettes. */
export function terrainPalette(biome, sourceColor, target = new THREE.Color()) {
  target.set(sourceColor);
  const palette = PALETTES[biome];
  if (palette) target.lerp(new THREE.Color(palette[0]), palette[1]);
  return target;
}

const randomSource = seed => () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0;
  return (seed >>> 0) / 4294967296;
};

/** One seamless repeated patch of irregular paving. Polygon data is kept pure
 * so the artwork can be checked without starting a renderer. */
export function cobbleCells(seed = 71402, grid = 5) {
  const random = randomSource(seed), cells = [];
  for (let row = 0; row < grid; row++) for (let column = 0; column < grid; column++) {
    const cx = ((column + .5 + (row % 2 ? .5 : 0) + (random() - .5) * .6) / grid + 1) % 1;
    const cy = (row + .5 + (random() - .5) * .6) / grid;
    cells.push({ cx, cy, tint: .79 + random() * .23 });
  }
  // Periodic Voronoi cells create close-fitting, uneven flagstones. This avoids
  // circular pebbles in a conspicuous repeating grid and stays one small map.
  for (const cell of cells) {
    let polygon = [[cell.cx - 1, cell.cy - 1], [cell.cx + 1, cell.cy - 1], [cell.cx + 1, cell.cy + 1], [cell.cx - 1, cell.cy + 1]];
    for (const other of cells) for (const ox of [-1, 0, 1]) for (const oy of [-1, 0, 1]) {
      if (other === cell && ox === 0 && oy === 0) continue;
      const dx = other.cx + ox - cell.cx, dy = other.cy + oy - cell.cy;
      const limit = dx * (cell.cx + dx / 2) + dy * (cell.cy + dy / 2);
      const next = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = a[0] * dx + a[1] * dy - limit, db = b[0] * dx + b[1] * dy - limit;
        if (da <= 0) next.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db); next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      polygon = next;
    }
    const inset = .86 + random() * .055;
    cell.points = polygon.map(([x, y]) => [cell.cx + (x - cell.cx) * inset, cell.cy + (y - cell.cy) * inset]);
  }
  return cells;
}

function canvas(size) {
  const result = document.createElement('canvas'); result.width = result.height = size;
  return result;
}

function texture(image, color = true) {
  const result = new THREE.CanvasTexture(image);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  if (color) result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 4;
  return result;
}

let cached;
/** Original small Canvas artwork: a mottled grass substrate, earth and grey
 * stones. No additional world meshes or downloaded textures are required. */
export function createTerrainArtwork() {
  if (cached) return cached;
  const size = 512, ground = canvas(size), earth = canvas(size), paving = canvas(size), relief = canvas(size);
  const g = ground.getContext('2d'), e = earth.getContext('2d'), p = paving.getContext('2d'), h = relief.getContext('2d');
  const random = randomSource(21112);
  g.fillStyle = '#eff2e8'; g.fillRect(0, 0, size, size);
  e.fillStyle = '#7d7b65'; e.fillRect(0, 0, size, size);
  // Broad translucent washes give the floor readable patches, rather than a
  // screen full of equally contrasted speckles. Paint wrapped copies at edges.
  for (let i = 0; i < 50; i++) {
    const x = random() * size, y = random() * size, radius = 25 + random() * 120;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      const gradient = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
      gradient.addColorStop(0, i % 3 ? '#253c3012' : '#fbffe51c'); gradient.addColorStop(1, '#3b4b3700');
      g.fillStyle = gradient; g.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
    }
  }
  for (let i = 0; i < 4300; i++) {
    const x = random() * size, y = random() * size;
    g.strokeStyle = i % 3 ? '#29433114' : '#f5ffe923'; g.lineWidth = .6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (random() - .5) * 3, y - 1 - random() * 3); g.stroke();
    e.fillStyle = i % 4 ? '#313d3125' : '#e5ddae32';
    e.beginPath(); e.ellipse(x, y, .4 + random() * 2.1, .4 + random() * 1.4, random() * 6, 0, Math.PI * 2); e.fill();
  }
  p.drawImage(earth, 0, 0);
  h.fillStyle = '#404040'; h.fillRect(0, 0, size, size);
  const trace = (ctx, points, ox, oy, shift = 0) => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i + points.length - 1) % points.length], current = points[i], next = points[(i + 1) % points.length];
      const mid = [current[0] + (previous[0] - current[0]) * .12, current[1] + (previous[1] - current[1]) * .12];
      if (!i) ctx.moveTo(mid[0] * size + ox, mid[1] * size + oy + shift);
      else ctx.lineTo(mid[0] * size + ox, mid[1] * size + oy + shift);
      ctx.quadraticCurveTo(current[0] * size + ox, current[1] * size + oy + shift,
        (current[0] + (next[0] - current[0]) * .12) * size + ox, (current[1] + (next[1] - current[1]) * .12) * size + oy + shift);
    }
    ctx.closePath();
  };
  for (const cell of cobbleCells()) for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    trace(p, cell.points, ox, oy, 3); p.fillStyle = '#2a3e3485'; p.fill();
    const value = Math.round(162 * cell.tint);
    const gradient = p.createLinearGradient(0, cell.cy * size + oy - 35, 0, cell.cy * size + oy + 35);
    gradient.addColorStop(0, `rgb(${value + 14},${value + 20},${value + 9})`);
    gradient.addColorStop(1, `rgb(${value - 7},${value + 2},${value - 9})`);
    trace(p, cell.points, ox, oy); p.fillStyle = gradient; p.fill();
    p.strokeStyle = '#dce2c643'; p.lineWidth = 1.3; p.stroke();
    trace(h, cell.points, ox, oy); h.fillStyle = '#c0c0c0'; h.fill();
    h.strokeStyle = '#858585'; h.lineWidth = 2.5; h.stroke();
  }
  cached = { ground: texture(ground), earth: texture(earth), paving: texture(paving), pavingBump: texture(relief, false) };
  cached.ground.name = 'Nebeljagd · weiche Wiesenmalerei';
  cached.paving.name = 'Nebeljagd · unregelmäßiges graues Steinpflaster';
  cached.earth.name = 'Nebeljagd · erdiger Wegsaum';
  return cached;
}
