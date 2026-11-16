import * as THREE from 'three';

const SIZE = 512;
const templates = new Map();
const kinds = new Set(['wood', 'floor', 'plaster', 'stone']);

function seeded(seed) {
  let state = seed;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };
}

// Periodic, smoothly interpolated fields: each surface repeats without a seam,
// and broad staining stays independent of the fine material relief.
function field(columns, rows, random) {
  const values = Float32Array.from({ length: columns * rows }, random);
  return (u, v) => {
    const x = u * columns, y = v * rows, ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const sample = (dx, dy) => values[((iy + dy) % rows) * columns + ((ix + dx) % columns)];
    const a = sample(0, 0) * (1 - sx) + sample(1, 0) * sx;
    const b = sample(0, 1) * (1 - sx) + sample(1, 1) * sx;
    return a * (1 - sy) + b * sy;
  };
}

function canvas() {
  const image = document.createElement('canvas');
  image.width = image.height = SIZE;
  return image;
}

function makeTemplate(kind) {
  const map = canvas(), bumpMap = canvas();
  const color = map.getContext('2d'), relief = bumpMap.getContext('2d');
  if (!color || !relief) return null;
  const random = seeded({ wood: 4517, floor: 9713, plaster: 15727, stone: 28619 }[kind]);
  const coarse = field(5, 5, random), medium = field(16, 18, random), fine = field(83, 79, random);
  const grainWarp = field(7, 4, random), grainStrength = field(13, 9, random);
  const rgb = kind === 'stone' ? [218, 218, 206] : kind === 'plaster' ? [234, 228, 214] : [232, 222, 204];
  const colors = color.createImageData(SIZE, SIZE), heights = relief.createImageData(SIZE, SIZE);
  const timber = kind === 'wood' || kind === 'floor';
  const knots = kind === 'wood' ? [[.27, .34, .042, .105], [.76, .81, .029, .072]] : [[.21, .57, .026, .075]];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, index = (y * SIZE + x) * 4;
    const large = coarse(u, v) - .5, middle = medium(u, v) - .5, small = fine(u, v) - .5;
    let tone, height;
    if (timber) {
      const warp = grainWarp(u, v) - .5;
      const growth = Math.sin((u * 17 + warp * .8) * Math.PI * 2);
      const hair = Math.sin((u * 63 + warp * 1.9) * Math.PI * 2);
      const strength = .35 + grainStrength(u, v) * .65;
      const groove = Math.pow(.5 + .5 * growth, 10) * strength;
      const quiet = kind === 'floor' ? .62 : 1;
      tone = .97 + large * .095 + middle * .028 + small * .011 - groove * .115 * quiet + hair * .014 * quiet;
      height = 132 + large * 8 - groove * 34 * quiet + hair * 4 * quiet + small * 3;
      for (const [kx, ky, rx, ry] of knots) {
        const dx = (u - kx) / rx, dy = (v - ky) / ry, distance = Math.hypot(dx, dy);
        if (distance > 2.4) continue;
        const fade = (1 - Math.min(1, distance / 2.4)) ** 2;
        const rings = Math.pow(.5 + .5 * Math.sin(distance * 15 + dy * .6), 5);
        tone -= fade * (.075 + rings * .16) * quiet;
        height -= fade * (12 + rings * 18) * quiet;
      }
    } else if (kind === 'plaster') {
      tone = .98 + large * .11 + middle * .033 + small * .008;
      height = 130 + large * 14 + middle * 18 + small * 12;
    } else {
      tone = .97 + large * .14 + middle * .065 + small * .015;
      height = 130 + large * 24 + middle * 28 + small * 13;
    }
    for (let channel = 0; channel < 3; channel++) {
      colors.data[index + channel] = Math.round(Math.max(0, Math.min(255, rgb[channel] * tone)));
      heights.data[index + channel] = Math.round(Math.max(0, Math.min(255, height)));
    }
    colors.data[index + 3] = heights.data[index + 3] = 255;
  }
  color.putImageData(colors, 0, 0); relief.putImageData(heights, 0, 0);

  if (timber) {
    // Short splits and worn fibres break up the grain without drawing long,
    // dark lines down whole boards. Their relief is shallower on the floor.
    for (let i = 0; i < (kind === 'floor' ? 9 : 18); i++) {
      const x = 25 + random() * 462, y = 20 + random() * 400;
      const length = 18 + random() * 65, bend = (random() - .5) * 5;
      for (const [context, stroke, width] of [
        [color, kind === 'floor' ? '#57473520' : '#493b2c39', .7 + random() * .8],
        [relief, kind === 'floor' ? '#64646445' : '#56565665', 1.2],
      ]) {
        context.strokeStyle = stroke; context.lineWidth = width; context.lineCap = 'round';
        context.beginPath(); context.moveTo(x, y);
        context.bezierCurveTo(x - 1, y + length * .25, x + bend, y + length * .7, x + bend * .7, y + length);
        context.stroke();
      }
    }
  } else if (kind === 'plaster') {
    // A few fine, irregular hairline cracks sit inside each tile. They do not
    // form a grid or become heavy black seams at the game's camera distance.
    for (let i = 0; i < 3; i++) {
      let x = 55 + random() * 380, y = 45 + random() * 305;
      const points = [[x, y]];
      for (let step = 0; step < 6; step++) { x += (random() - .5) * 15; y += 6 + random() * 10; points.push([x, y]); }
      for (const [context, stroke, offset] of [[color, '#776d5625', 0], [color, '#fff7de32', 1], [relief, '#6868683b', 0]]) {
        context.strokeStyle = stroke; context.lineWidth = .8; context.lineJoin = 'round';
        context.beginPath(); points.forEach(([px, py], index) => index ? context.lineTo(px + offset, py) : context.moveTo(px + offset, py)); context.stroke();
      }
    }
  } else {
    // Broad chipped mineral planes, with softly differing values; the actual
    // silhouette and joints remain the responsibility of the stone geometry.
    for (let i = 0; i < 26; i++) {
      const x = 40 + random() * 432, y = 40 + random() * 432, radius = 7 + random() * 28;
      const corners = 4 + Math.floor(random() * 3), turn = random() * Math.PI;
      const points = Array.from({ length: corners }, (_, index) => {
        const angle = turn + (index + (random() - .5) * .4) * Math.PI * 2 / corners;
        const reach = radius * (.45 + random() * .55);
        return [x + Math.cos(angle) * reach, y + Math.sin(angle) * reach * .7];
      });
      for (const [context, fill] of [[color, i % 3 ? '#f4f1dc0b' : '#595e5110'], [relief, i % 3 ? '#b8b8b812' : '#65656513']]) {
        context.fillStyle = fill; context.beginPath();
        points.forEach(([px, py], index) => index ? context.lineTo(px, py) : context.moveTo(px, py));
        context.closePath(); context.fill();
      }
    }
  }
  return { map, bumpMap };
}

/** Each caller owns its textures, while the four deterministic canvas pairs
 * are cached independently of GPU resources. Model disposal must release both
 * maps. Vertex colours provide the timber/plaster/stone palette. */
export function createWaldhausSurface(kind) {
  if (!kinds.has(kind) || typeof document === 'undefined') return { map: null, bumpMap: null };
  if (!templates.has(kind)) {
    const template = makeTemplate(kind);
    if (!template) return { map: null, bumpMap: null };
    templates.set(kind, template);
  }
  const template = templates.get(kind), result = {};
  for (const key of ['map', 'bumpMap']) {
    const texture = new THREE.CanvasTexture(template[key]);
    texture.name = `Waldhaus · ${kind} · ${key}`;
    texture.colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    result[key] = texture;
  }
  return result;
}
