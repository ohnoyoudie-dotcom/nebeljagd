import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All meshes, pigments and textures in this module are original procedural work.
function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function texture(kind) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const random = seeded(kind === 'wood' ? 409 : 897);
  ctx.fillStyle = kind === 'wood' ? '#9a866a' : '#a7aaa0';
  ctx.fillRect(0, 0, 128, 128);
  if (kind === 'wood') {
    for (let x = 0; x < 128; x += 2) {
      ctx.strokeStyle = `rgba(40,27,19,${0.07 + random() * 0.15})`;
      ctx.lineWidth = 0.5 + random(); ctx.beginPath();
      for (let y = 0; y <= 128; y += 4) {
        const px = x + Math.sin(y * .045 + x) * 1.7 + Math.sin(y * .13 + x) * .5;
        if (!y) ctx.moveTo(px, y); else ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
    for (let k = 0; k < 6; k++) {
      ctx.strokeStyle = '#463b2b42'; ctx.lineWidth = .7;
      const x = random() * 128, y = random() * 128;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(x, y, 1.8 + i * 1.2, 4 + i * 3, .12, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  for (let i = 0; i < 3200; i++) {
    ctx.fillStyle = `rgba(${random() > .5 ? '240,232,209' : '29,33,25'},${random() * .13})`;
    ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 2;
  return map;
}

/** Small, authored village dressing. Collision shapes are in world-local X/Z units. */
export function createVillageDetails(root, { houses = [], riverAt = () => 10,
  isWater = () => false, pathDistance = () => 100, clearOfHouse = () => true,
  quality = 'high' } = {}) {
  const random = seeded(7271026);
  const group = new THREE.Group(); group.name = 'Village gardens, weathered boundaries and props';
  root.add(group);
  const walls = [], collisions = [];
  const woodMap = texture('wood'), stoneMap = texture('stone');
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color, roughness: .91, ...extra,
  });
  const materials = {
    oak: material('#847051', { map: woodMap }),
    oakDark: material('#514b38', { map: woodMap }),
    endgrain: material('#ac956a', { map: woodMap }),
    stone: material('#a4aaa0', { map: stoneMap, vertexColors: true }),
    iron: material('#445453', { metalness: .62, roughness: .57 }),
    earth: material('#423b2b', { map: stoneMap }),
    terracotta: material('#896044', { map: stoneMap }),
    leaves: material('#ffffff', { vertexColors: true, side: THREE.DoubleSide }),
    flowers: material('#ffffff', { vertexColors: true, side: THREE.DoubleSide }),
    glow: material('#ffe0a4', { emissive: '#e8a454', emissiveIntensity: .9, roughness: .6 }),
    moss: material('#647447', { map: stoneMap }),
  };
  const batches = new Map();
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  function add(geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, color) {
    const shape = geometry.clone();
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz); dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix(); shape.applyMatrix4(dummy.matrix);
    if (mat.vertexColors) {
      const colors = new Float32Array(shape.attributes.position.count * 3);
      tint.set(color || '#ffffff');
      for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
      shape.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat).push(shape);
  }
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const ring = new THREE.TorusGeometry(1, .045, 4, 16);
  const stone = new THREE.SphereGeometry(1, 8, 5);
  const stonePositions = stone.attributes.position;
  for (let i = 0; i < stonePositions.count; i++) {
    const x = stonePositions.getX(i), y = stonePositions.getY(i), z = stonePositions.getZ(i);
    const distortion = 1 + Math.sin(x * 7.5 + y * 4.6 + z * 5) * .10;
    stonePositions.setXYZ(i, x * distortion, y * distortion, z * distortion);
  }
  stone.computeVertexNormals();
  const box = (mat, x, y, z, w, h, d, ry = 0, rz = 0) => add(cube, mat, x, y, z, w, h, d, 0, ry, rz);
  const obstacle = (x, z, radius, maxY = 1.25, minY = 0) => collisions.push({ x, z, radius, minY, maxY, type: 'prop' });
  const avoidPoints = [
    [-8, 8, 3], [-4, 11, 2.1], [-11, 6, 2.1], [-5, 5, 1.9], [-12, 2, 2],
    [0, 9, 1.9], [-4, -15, 1.9], [-30, 14, 1.9], [22, -8, 1.9], [-26, -5, 1.9],
    [-10.5, 12, 1.9], [-1.5, 0, 1.9], [-18, 5, 1.9], [4.5, 15, 1.9], [19, 3, 1.9],
  ];
  const clearOfImportantPoints = (x, z, margin = 0) => avoidPoints.every(([px, pz, r]) => Math.hypot(x - px, z - pz) > r + margin)
    && houses.every(h => Math.abs(x - h.x) > 2.6 + margin || Math.abs(z - h.z - h.halfDepth) > 4 + margin);

  // A side garden is bounded by a dry-stone plinth and split rails. The gate
  // opening is a real 3.4-metre gap rather than an invisible collision rectangle.
  function fence(x, z1, z2) {
    const count = Math.ceil((z2 - z1) / 2.1);
    for (let i = 0; i <= count; i++) {
      const z = z1 + (z2 - z1) * i / count;
      box(materials.oakDark, x, .76, z, .21, 1.52, .23, .025);
      box(materials.endgrain, x, 1.55, z, .27, .12, .29);
      if (i < count) {
        const nextZ = z1 + (z2 - z1) * (i + 1) / count;
        for (const y of [.52, 1.13]) box(materials.oak, x, y, (z + nextZ) / 2, .13, .16, nextZ - z + .08);
        const brace = new THREE.BoxGeometry(.09, .11, Math.hypot(nextZ - z, .65));
        add(brace, materials.oakDark, x + .025, .83, (z + nextZ) / 2, 1, 1, 1, Math.atan2(.65, nextZ - z));
        brace.dispose();
      }
    }
    walls.push({ minX: x - .13, maxX: x + .13, minZ: z1 - .14, maxZ: z2 + .14, minY: 0, maxY: 1.62, type: 'fence' });
  }
  fence(-23.6, -11.8, -7.7);
  fence(-23.6, -4.3, 2.6);
  for (const z of [-7.7, -4.3]) {
    box(materials.oakDark, -23.6, 1.35, z, .3, 2.7, .32);
    box(materials.endgrain, -23.6, 2.74, z, .38, .13, .4);
  }
  box(materials.oak, -23.6, 2.64, -6, .24, .2, 3.65);
  // An open gate leaf rests beside its hinge, clear of the walk-through gap.
  for (const y of [.63, 1.24]) box(materials.oakDark, -24.62, y, -7.8, 2.05, .13, .14);
  for (let i = 0; i < 4; i++) box(materials.oak, -23.82 - i * .51, .95, -7.8, .13, 1.12, .12);
  walls.push({ minX: -25.75, maxX: -23.7, minZ: -7.91, maxZ: -7.69, minY: 0, maxY: 1.51, type: 'fence' });

  function dryWall(x1, z, length) {
    const rows = 3, step = .74;
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < Math.ceil(length / step); i++) {
        const x = x1 + Math.min(length - .32, i * step + .35 + (row % 2) * .18);
        const variation = .85 + random() * .25;
        add(stone, materials.stone, x, .18 + row * .30, z + (random() - .5) * .13,
          .46 * variation, .22, .32 + random() * .05, random() * .2, random() * 2, random() * .12,
          ['#a2aaa1', '#8e9a91', '#c1c2ad'][i % 3]);
        if ((i + row) % 3 === 0) add(stone, materials.moss, x, .32 + row * .30, z + .09, .33, .055, .18);
      }
    }
    walls.push({ minX: x1 - .08, maxX: x1 + length + .12, minZ: z - .43, maxZ: z + .43, minY: 0, maxY: .97, type: 'stone-wall' });
  }
  dryWall(-26.6, 4.8, 5.2);
  dryWall(27.2, -8.9, 4.0);

  function barrel(x, z, scale = 1) {
    const profile = [new THREE.Vector2(.41, 0), new THREE.Vector2(.49, .12),
      new THREE.Vector2(.55, .44), new THREE.Vector2(.55, .78), new THREE.Vector2(.49, 1.11), new THREE.Vector2(.41, 1.2)];
    const body = new THREE.LatheGeometry(profile, 12);
    add(body, materials.oak, x, .035, z, scale, scale, scale, 0, random() * 3);
    body.dispose();
    for (const y of [.16, .58, 1.04]) {
      const radius = (y === .58 ? .565 : .515) * scale;
      add(ring, materials.iron, x, y * scale + .035, z, radius, radius, radius, Math.PI / 2);
    }
    add(cylinder, materials.oakDark, x, 1.205 * scale, z, .43 * scale, .035, .43 * scale);
    for (let i = 0; i < 5; i++) {
      const dx = (i - 2) * .16 * scale;
      const depth = Math.sqrt(Math.max(.01, .40 ** 2 - (dx / scale) ** 2)) * 2 * scale;
      box(materials.endgrain, x + dx, 1.23 * scale, z, .145 * scale, .025, depth);
    }
    obstacle(x, z, .55 * scale, 1.25 * scale);
  }
  function crate(x, z, size = .95, yaw = 0, y = 0) {
    box(materials.oakDark, x, y + size / 2, z, size, size, size, yaw);
    for (const side of [-1, 1]) {
      const cz = z + Math.cos(yaw) * side * size * .51;
      const cx = x + Math.sin(yaw) * side * size * .51;
      for (let p = 0; p < 4; p++) {
        const offset = (p - 1.5) * size / 4;
        box(materials.oak, cx + Math.cos(yaw) * offset, y + size / 2, cz - Math.sin(yaw) * offset,
          size * .22, size * .92, .045, yaw);
      }
      for (const sy of [.09, .89]) box(materials.endgrain, cx, y + size * sy, cz, size * 1.03, size * .095, .09, yaw);
      box(materials.endgrain, cx, y + size * .49, cz, size * .1, size * 1.10, .08, yaw, -.70);
    }
    box(materials.oak, x, y + size + .025, z, size * .96, .045, size * .96, yaw);
    for (const side of [-1, 1]) box(materials.endgrain, x + side * .36 * size, y + size + .055, z, .08, .06, size, yaw);
    if (!y) obstacle(x, z, size * .63, size + .085);
    else obstacle(x, z, size * .63, y + size + .085, y);
  }
  barrel(-4.0, -3.0, 1.0); barrel(-3.1, -4.0, .8);
  crate(-3.3, -6.1, 1.1, .12); crate(-3.3, -6.1, .74, -.08, 1.12);
  crate(-22.9, .5, .9, .18);
  barrel(30.2, -16.8, 1.05); crate(30.4, -18.8, 1.0, -.13);
  barrel(-9.2, 22.2, .95); crate(-9.25, 24.5, 1.03, .1);

  function woodpile(x, z) {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
      const px = x + (i - (3 - row) / 2) * .36;
      const y = .18 + row * .28;
      add(cylinder, materials.oakDark, px, y, z, .20, 1.48, .20, Math.PI / 2);
      for (const side of [-1, 1]) add(cylinder, materials.endgrain, px, y, z + side * .75, .17, .025, .17, Math.PI / 2);
    }
    obstacle(x, z, .89, .95);
  }
  woodpile(-3.6, -9.1);
  woodpile(-28.5, 19.8);

  // Thin convex leaf blades and curved fronds are actual 3D surfaces, merged
  // into one vegetation batch; no per-leaf object or animation-loop work.
  const leaf = new THREE.BufferGeometry();
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, -.15, .12, .29, 0, .08, .66, .15, .12, .29,
  ], 3));
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute([.5, 0, 0, .45, .5, 1, 1, .45], 2));
  leaf.setIndex([0, 1, 2, 0, 2, 3]); leaf.computeVertexNormals();
  function fern(x, z, size = 1, yaw = 0, baseY = 0) {
    const fronds = 6;
    for (let f = 0; f < fronds; f++) {
      const angle = yaw + f / fronds * Math.PI * 2;
      for (let k = 0; k < 6; k++) {
        const t = (k + 1) / 7, reach = t * .74 * size;
        const stemX = x + Math.sin(angle) * reach, stemZ = z + Math.cos(angle) * reach;
        const y = baseY + .08 + Math.sin(t * Math.PI * .82) * .65 * size;
        for (const side of [-1, 1]) {
          const width = (.43 - t * .28) * size;
          add(leaf, materials.leaves, stemX, y, stemZ, width * 1.35, width, width,
            -.34, angle + side * 1.0, side * .08, ['#526c3c', '#779150', '#8b9d62'][k % 3]);
        }
      }
    }
  }
  function planter(x, z, width = 1.6) {
    box(materials.oakDark, x, .22, z, width, .42, .68);
    box(materials.earth, x, .44, z, width * .89, .045, .55);
    for (const sx of [-1, 1]) box(materials.oak, x + sx * width * .48, .30, z, .09, .51, .76);
    for (let i = 0; i < 4; i++) fern(x + (i - 1.5) * width * .22, z, .48, i, .45);
    obstacle(x, z, width * .48, .5);
  }
  planter(-19.5, 3.1, 2.0); planter(-6.2, 3.1, 1.5);
  planter(15, -9.8, 1.8); planter(-25.7, 29.0, 1.7);

  function pot(x, z, size = .8) {
    const profile = [new THREE.Vector2(.27, 0), new THREE.Vector2(.42, .16), new THREE.Vector2(.46, .51),
      new THREE.Vector2(.34, .69), new THREE.Vector2(.38, .75), new THREE.Vector2(.29, .75)];
    const geometry = new THREE.LatheGeometry(profile, 12);
    add(geometry, materials.terracotta, x, .025, z, size, size, size); geometry.dispose();
    add(cylinder, materials.earth, x, .69 * size, z, .27 * size, .02, .27 * size);
    fern(x, z, size * .7, random() * 6, .70 * size);
    obstacle(x, z, size * .4, size * .75);
  }
  pot(-16.0, 3.0); pot(24.5, -10.0, .85); pot(-22.5, 29.3, .75);

  function lantern(x, z) {
    box(materials.oakDark, x, 1.45, z, .15, 2.9, .16, .04);
    box(materials.oak, x + .32, 2.85, z, .78, .12, .13);
    box(materials.iron, x + .62, 2.53, z, .055, .48, .055);
    box(materials.glow, x + .62, 2.20, z, .25, .38, .25);
    for (const y of [1.96, 2.44]) box(materials.iron, x + .62, y, z, .40, .09, .40);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(materials.iron,
      x + .62 + sx * .155, 2.20, z + sz * .155, .035, .46, .035);
    obstacle(x, z, .20, 2.9);
  }
  lantern(-20.2, 5.9); lantern(26.1, -9.0); lantern(-25.6, 30.4);

  let attempts = 0, planted = 0;
  const fernCount = quality === 'low' ? 28 : 52;
  while (planted < fernCount && attempts++ < 1800) {
    const x = -36 + random() * 69, z = -34 + random() * 69;
    if (Math.hypot(x, z) > 38 || isWater(x, z) || Math.abs(x - riverAt(z)) < 3.2
      || !clearOfHouse(x, z, .15) || pathDistance(x, z) < 2 || !clearOfImportantPoints(x, z, .4)) continue;
    fern(x, z, .65 + random() * .8, random() * Math.PI * 2); planted++;
  }
  const petal = new THREE.SphereGeometry(1, 5, 3);
  const flowerColors = ['#ccaa79', '#d8cfb7', '#a29bb7', '#d5c185'];
  for (let i = 0; i < (quality === 'low' ? 48 : 90); i++) {
    const x = -32 + random() * 64, z = -29 + random() * 62;
    if (Math.hypot(x, z) > 38 || isWater(x, z) || Math.abs(x - riverAt(z)) < 3.4
      || !clearOfHouse(x, z, .1) || pathDistance(x, z) < 1.7 || !clearOfImportantPoints(x, z, .1)) continue;
    const height = .30 + random() * .34;
    add(cylinder, materials.leaves, x, height / 2, z, .014, height, .014, 0, 0, .1, '#617241');
    for (let p = 0; p < 5; p++) {
      const angle = p / 5 * Math.PI * 2;
      add(petal, materials.flowers, x + Math.sin(angle) * .073, height, z + Math.cos(angle) * .073,
        .058, .024, .095, .1, angle, 0, flowerColors[i % flowerColors.length]);
    }
    add(petal, materials.flowers, x, height + .018, z, .036, .027, .036, 0, 0, 0, '#d5ad5a');
  }
  // Pebbles and twigs sit at trail margins, never in the collision model.
  for (let i = 0; i < (quality === 'low' ? 90 : 170); i++) {
    const x = -34 + random() * 69, z = -33 + random() * 68;
    const distance = pathDistance(x, z);
    if (distance < 1.45 || distance > 3.9 || isWater(x, z) || !clearOfHouse(x, z, .1)
      || !clearOfImportantPoints(x, z, .1) || Math.hypot(x, z) > 39) continue;
    const size = .055 + random() * .11;
    if (i % 4) add(stone, materials.stone, x, size * .25, z, size * 1.5, size * .55, size,
      random() * .3, random() * 6, random() * .2, ['#94988b', '#b0ad99', '#737e73'][i % 3]);
    else add(cylinder, materials.oakDark, x, .055, z, .025, .35 + random() * .35, .025, Math.PI / 2, random() * 6);
  }

  // Merge static pieces by material: detail count does not become draw-call count.
  for (const [mat, geometries] of batches) {
    // Primitives use different index/attribute layouts; make a uniform triangle stream.
    const compatible = geometries.map(geometry => {
      const converted = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      if (!converted.attributes.uv) converted.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(converted.attributes.position.count * 2), 2));
      return converted;
    });
    const merged = mergeGeometries(compatible, false);
    if (!merged) throw new Error('Village detail geometry could not be batched');
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `Village details · ${Object.entries(materials).find(([, value]) => value === mat)?.[0]}`;
    mesh.castShadow = mat !== materials.leaves && mat !== materials.flowers && mat !== materials.glow;
    mesh.receiveShadow = true;
    group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
    compatible.forEach(geometry => geometry.dispose());
  }
  [cube, cylinder, ring, stone, leaf, petal].forEach(geometry => geometry.dispose());
  return {
    walls,
    collisions,
    group,
    update(time) {
      // A single shared emissive update; no point lights or per-prop loop.
      materials.glow.emissiveIntensity = .87 + Math.sin(time * 3.1) * .035 + Math.sin(time * 7.7) * .015;
    },
  };
}
