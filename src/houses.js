import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original material artwork, generated once. A shared map and vertex tints give
// weathered surfaces variation without a material/draw call for every board.
function surfaceMap(kind, seed = 17) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  let n = seed;
  const random = () => { n = (Math.imul(n, 1664525) + 1013904223) | 0; return (n >>> 0) / 4294967296; };
  ctx.fillStyle = kind === 'stone' ? '#bfc0b3' : kind === 'plaster' ? '#f0e9d7' : '#d9cdb7';
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'wood') {
    for (let x = 0; x < 256; x += 32) {
      ctx.fillStyle = `rgba(46,34,23,${0.09 + random() * 0.09})`;
      ctx.fillRect(x, 0, 2, 256);
      ctx.fillStyle = '#fff1c921'; ctx.fillRect(x + 2, 0, 1, 256);
      for (let i = 0; i < 13; i++) {
        const lineX = x + 4 + random() * 26;
        ctx.strokeStyle = `rgba(53,38,24,${0.05 + random() * .15})`; ctx.lineWidth = .4 + random() * .8;
        ctx.beginPath(); ctx.moveTo(lineX, -10);
        ctx.bezierCurveTo(lineX + Math.sin(i) * 6, 70, lineX - 4, 160, lineX + 2, 270); ctx.stroke();
      }
      if (random() > .3) {
        ctx.strokeStyle = '#56412a45'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(x + 16, random() * 256, 4, 12, -.1, 0, Math.PI * 2); ctx.stroke();
      }
    }
  } else if (kind === 'stone') {
    ctx.fillStyle = '#6a7069'; ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 6; row++) for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32, y = row * 43;
      const shade = 175 + Math.floor(random() * 48);
      ctx.fillStyle = `rgb(${shade},${shade + 1},${shade - 9})`;
      ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 59, 38, 5 + random() * 4); ctx.fill();
      ctx.strokeStyle = '#edf0db3b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3f4e3c1e'; ctx.fillRect(x + 5, y + 32, 52, 5);
    }
  } else if (kind === 'roof') {
    ctx.fillStyle = '#777f79'; ctx.fillRect(0, 0, 256, 256);
    for (let row = -1; row < 8; row++) for (let col = -1; col < 6; col++) {
      const x = col * 52 + (row % 2) * 26, y = row * 37;
      const shade = 170 + Math.floor(random() * 65);
      ctx.fillStyle = `rgb(${shade},${shade + 3},${shade - 3})`;
      ctx.beginPath(); ctx.roundRect(x + 1, y, 49, 36, [1, 1, 8, 8]); ctx.fill();
      ctx.strokeStyle = '#25362d5b'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#f1efcc38'; ctx.fillRect(x + 5, y + 29, 39, 2);
      ctx.strokeStyle = '#37443a2a'; ctx.beginPath(); ctx.moveTo(x + 16, y + 3); ctx.lineTo(x + 13, y + 26); ctx.stroke();
    }
  } else if (kind === 'cloth') {
    for (let i = 0; i < 256; i += 3) {
      ctx.fillStyle = i % 2 ? '#ffffff16' : '#1f2d2620'; ctx.fillRect(i, 0, 1, 256); ctx.fillRect(0, i, 256, 1);
    }
    for (let i = 12; i < 256; i += 64) { ctx.strokeStyle = '#554e3555'; ctx.lineWidth = 3; ctx.strokeRect(i, i, 36, 36); }
  }
  for (let i = 0; i < 4200; i++) {
    ctx.fillStyle = random() > .5 ? '#fffbed12' : '#1d2b2320';
    ctx.fillRect(random() * 256, random() * 256, .5 + random() * 1.4, .5 + random() * 1.4);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(canvas); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

/** Three distinct cottages share surfaces and merged batches, with independent cutaway groups. */
export function createHouses(root, houseSites) {
  const maps = Object.fromEntries(['wood', 'stone', 'plaster', 'roof', 'cloth'].map((type, i) => [type, surfaceMap(type, 19 + i * 71)]));
  const makeMaterial = (type, extra = {}) => new THREE.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: .88,
    ...(maps[type] ? { map: maps[type].map, bumpMap: maps[type].bump, bumpScale: type === 'stone' ? .065 : .035 } : {}),
    ...extra,
  });
  const materials = {
    wood: makeMaterial('wood'), stone: makeMaterial('stone'), plaster: makeMaterial('plaster'),
    roof: makeMaterial('roof'), cloth: makeMaterial('cloth'), metal: makeMaterial(null, { metalness: .55, roughness: .53 }),
    glass: makeMaterial(null, { color: '#719e91', emissive: '#426357', emissiveIntensity: .30, roughness: .33, metalness: .15 }),
    light: makeMaterial(null, { emissive: '#e8b96d', emissiveIntensity: 1.1, roughness: .7 }),
  };
  const variants = [
    { kind: 'Kräuterhaus', wall: '#c8b597', wood: '#74604a', roof: '#607c77', trim: '#433d32', rise: 2.5, linen: '#789587', symbol: 'herbs' },
    { kind: 'Waldgasthaus', wall: '#d8c9a9', wood: '#78604a', roof: '#637482', trim: '#493d36', rise: 3.0, linen: '#8b6762', symbol: 'moon' },
    { kind: 'Jägerhaus', wall: '#a2a390', wood: '#887151', roof: '#a37758', trim: '#4f4838', rise: 2.1, linen: '#77836b', symbol: 'antlers' },
  ];
  const walls = [], houses = [];
  const halfWidth = 8, halfDepth = 7, floorHeight = .50, wallHeight = 3.35;
  const tint = new THREE.Color(), transform = new THREE.Object3D();
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (const [houseIndex, site] of houseSites.entries()) {
    const style = variants[houseIndex % variants.length];
    const group = new THREE.Group(); group.name = `${style.kind} ${site.name}`; group.position.set(site.x, 0, site.z); root.add(group);
    const outer = new THREE.Group(), roof = new THREE.Group(), frontFacade = new THREE.Group(), interior = new THREE.Group(), porch = new THREE.Group();
    outer.name = 'Texturierte Außenwände'; roof.name = 'Schindeldach, Gauben und Schornstein'; frontFacade.name = 'Vordere Schnittansicht';
    interior.name = 'Wohnraum und zwei Schlafzimmer'; porch.name = 'Steinstufen und Veranda';
    group.add(outer, roof, frontFacade, interior, porch);
    const batches = new Map();
    function geometry(parent, mat, geo, x, y, z, color = '#ffffff', rotation = [0, 0, 0]) {
      transform.position.set(x, y, z); transform.rotation.set(...rotation); transform.scale.set(1, 1, 1); transform.updateMatrix();
      geo.applyMatrix4(transform.matrix);
      const vertexColors = new Float32Array(geo.attributes.position.count * 3);
      tint.set(color);
      for (let i = 0; i < vertexColors.length; i += 3) { vertexColors[i] = tint.r; vertexColors[i + 1] = tint.g; vertexColors[i + 2] = tint.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));
      if (geo.index) geo = geo.toNonIndexed();
      let byMaterial = batches.get(parent);
      if (!byMaterial) { byMaterial = new Map(); batches.set(parent, byMaterial); }
      if (!byMaterial.has(mat)) byMaterial.set(mat, []);
      byMaterial.get(mat).push(geo);
    }
    function box(parent, mat, x, y, z, w, h, d, color = '#ffffff', rotation = [0, 0, 0]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(n.getX(i)) > .5) uv.setXY(i, p.getZ(i) / 2, p.getY(i) / 2);
        else if (Math.abs(n.getY(i)) > .5) uv.setXY(i, p.getX(i) / 2, p.getZ(i) / 2);
        else uv.setXY(i, p.getX(i) / 2, p.getY(i) / 2);
      }
      geometry(parent, mat, geo, x, y, z, color, rotation);
    }
    function beam(parent, start, end, width, color = style.trim, depth = width) {
      const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), vector = b.clone().sub(a), middle = a.clone().add(b).multiplyScalar(.5);
      const geo = new THREE.BoxGeometry(width, vector.length(), depth);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, vector.normalize());
      geo.applyQuaternion(quaternion);
      geometry(parent, materials.wood, geo, middle.x, middle.y, middle.z, color);
    }
    function cylinder(parent, mat, x, y, z, radiusTop, radiusBottom, height, color, rotation = [0, 0, 0], segments = 12) {
      geometry(parent, mat, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), x, y, z, color, rotation);
    }
    function collision(x, z, w, d) { walls.push({ minX: site.x + x - w / 2, maxX: site.x + x + w / 2, minZ: site.z + z - d / 2, maxZ: site.z + z + d / 2 }); }
    function wall(parent, x, z, w, d, height = wallHeight, stone = false) {
      box(parent, stone ? materials.stone : materials.plaster, x, .37 + height / 2, z, w, height, d, style.wall);
      collision(x, z, w, d);
    }
    const W = materials.wood, S = materials.stone, M = materials.metal, L = materials.light, C = materials.cloth;
    // A textured stone plinth, with uneven individual dressed blocks at its edge.
    box(group, S, 0, .16, 0, 16.65, .32, 14.65, '#8b927f');
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 14; i++) {
      box(group, S, -7.65 + i * 1.17, .33, side * 7.18, 1.09, .24 + (i % 3) * .025, .38, i % 2 ? '#a2a58f' : '#8d9586');
    }
    box(interior, W, 0, .42, 0, 16, .15, 14, '#ac8d62');
    for (let i = 0; i < 21; i++) box(interior, W, -7.63 + i * .75, .508, 0, .025, .014, 13.6, '#594d38');

    wall(outer, 0, -7, 16, .38, wallHeight, houseIndex === 2);
    wall(outer, -8, 0, .38, 14, wallHeight, houseIndex === 2);
    wall(outer, 8, 0, .38, 14, wallHeight, houseIndex === 2);
    const entryHalf = 1.45, frontWidth = 8 - entryHalf;
    for (const side of [-1, 1]) wall(frontFacade, side * (entryHalf + frontWidth / 2), 7, frontWidth, .38, wallHeight, houseIndex === 2);
    // Low stone footings and framed plaster keep a readable, inhabited facade.
    for (const side of [-1, 1]) {
      box(outer, S, side * 8.04, .77, 0, .48, .76, 14, '#8b9180');
      for (const x of [-8, 8]) box(side < 0 ? outer : frontFacade, W, x, 2.07, side * 7.02, .28, 3.6, .34, style.trim);
      box(frontFacade, S, side * (entryHalf + frontWidth / 2), .76, 7.04, frontWidth, .76, .48, '#989a84');
      box(frontFacade, W, side * (entryHalf + .12), 2.03, 7.09, .24, 3.65, .32, style.trim);
    }
    box(outer, W, 0, 3.81, -7, 16.6, .25, .54, style.trim);
    for (const side of [-1, 1]) box(outer, W, side * 8, 3.81, 0, .53, .25, 14.5, style.trim);
    box(frontFacade, W, 0, 3.81, 7.07, 16.55, .25, .55, style.trim);
    box(frontFacade, W, 0, 3.44, 7.12, 3.4, .24, .35, style.trim);
    if (houseIndex !== 2) {
      for (const side of [-1, 1]) {
        for (const x of [-6.9, -3.0, 3.0, 6.9]) {
          box(side < 0 ? outer : frontFacade, W, x, 2.08, side * 7.23, .15, 3.0, .14, style.trim);
        }
        for (const z of [-4.6, 0, 4.6]) {
          box(outer, W, side * 8.23, 2.08, z, .14, 3.0, .15, style.trim);
          beam(outer, [side * 8.24, .83, z - 1.65], [side * 8.24, 2.38, z + 1.65], .13, style.trim);
        }
        beam(frontFacade, [side * 2.1, .91, 7.24], [side * 4.3, 2.8, 7.24], .13, style.trim);
      }
    } else {
      for (let row = 0; row < 6; row++) {
        box(outer, W, -8.24, 1.20 + row * .37, 0, .09, .055, 13.5, '#71694e');
        box(outer, W, 8.24, 1.20 + row * .37, 0, .09, .055, 13.5, '#71694e');
      }
    }

    function windowFront(x, z, parent, sideFacing = false) {
      if (sideFacing) {
        const side = Math.sign(x);
        box(parent, W, x, 2.13, z, .16, 1.65, 1.85, style.trim);
        box(parent, materials.glass, x + side * .10, 2.13, z, .07, 1.28, 1.48, '#a9c1ad');
        box(parent, W, x + side * .16, 2.13, z, .07, 1.33, .09, '#ac956a');
        box(parent, W, x + side * .16, 2.13, z, .07, .10, 1.47, '#ac956a');
        box(parent, S, x + side * .08, 1.22, z, .38, .16, 2.13, '#a1a28c');
      } else {
        box(parent, W, x, 2.13, z, 2.0, 1.65, .18, style.trim);
        box(parent, materials.glass, x, 2.13, z + .11, 1.58, 1.28, .06, '#b6c6ac');
        box(parent, W, x, 2.13, z + .17, .09, 1.3, .09, '#b79e70');
        box(parent, W, x, 2.13, z + .17, 1.6, .1, .09, '#b79e70');
        for (const side of [-1, 1]) {
          box(parent, W, x + side * 1.19, 2.13, z + .12, .39, 1.54, .16, style.wood, [0, side * .15, 0]);
          box(parent, M, x + side * 1.19, 1.76, z + .23, .37, .06, .055, '#4b5148');
          box(parent, M, x + side * 1.19, 2.47, z + .23, .37, .06, .055, '#4b5148');
        }
        box(parent, S, x, 1.22, z + .12, 2.38, .17, .43, '#a5a48d');
        // Front flower boxes have soil, leaves and violet herbs rather than a flat badge.
        box(parent, W, x, 1.04, z + .33, 1.75, .35, .47, style.wood);
        box(parent, S, x, 1.23, z + .33, 1.55, .035, .35, '#4c4935');
        for (let i = 0; i < 6; i++) {
          const px = x - .66 + i * .26;
          beam(parent, [px, 1.23, z + .33], [px + .08 * Math.sin(i * 2), 1.55 + .12 * (i % 2), z + .36], .035, '#69794c');
          geometry(parent, C, new THREE.SphereGeometry(.12, 6, 4), px, 1.51 + .1 * (i % 2), z + .35, houseIndex === 0 ? '#b29daf' : '#b9ad78');
        }
      }
    }
    windowFront(-5.1, 7.28, frontFacade); windowFront(5.1, 7.28, frontFacade);
    for (const side of [-1, 1]) for (const z of [-3.6, 3.4]) windowFront(side * 8.30, z, outer, true);

    // Three shallow steps leave the full 2.9-unit entrance and the approach clear.
    box(porch, S, 0, .11, 8.0, 4.4, .22, 2.2, '#9c9f8b');
    box(porch, S, 0, .24, 7.61, 3.75, .24, 1.65, '#adb09a');
    box(porch, W, 0, .39, 7.36, 3.22, .19, 1.2, '#9b805b');
    for (const side of [-1, 1]) {
      const postX = side * 2.12;
      box(porch, W, postX, 1.78, 8.0, .22, 3.2, .22, style.trim);
      collision(postX, 8, .22, .22);
      beam(porch, [postX, 2.48, 8.0], [postX - side * .75, 3.33, 8.0], .13, style.trim);
      box(porch, W, postX, 1.81, 7.20, .08, .74, .38, style.trim);
      box(porch, M, postX, 1.67, 7.46, .34, .55, .30, '#5f5b42');
      box(porch, L, postX, 1.68, 7.63, .23, .34, .05, '#dfc28d');
      box(porch, M, postX, 1.38, 7.49, .46, .09, .37, '#554e3e');
      for (const edge of [-1, 1]) box(porch, M, postX + edge * .13, 1.69, 7.68, .035, .4, .035, '#514f40');
    }
    // A separate hipped porch roof is part of the removable roof group.
    box(roof, materials.roof, 0, 3.42, 7.76, 4.8, .15, 2.45, style.roof, [.16, 0, 0]);
    box(roof, W, 0, 3.22, 8.91, 4.95, .19, .20, style.trim);

    // Full interior: broad rooms, tables, hearth, shelves and useful small objects.
    const dividingZ = -.68;
    for (const [a, b] of [[-8, -5.25], [-2.75, 2.75], [5.25, 8]]) {
      wall(interior, (a + b) / 2, dividingZ, b - a, .25, 2.55);
      box(interior, W, (a + b) / 2, 3.0, dividingZ, b - a, .14, .33, style.trim);
    }
    wall(interior, 0, (dividingZ - 7) / 2, .27, 7 + dividingZ, 2.55);
    for (const x of [-5.25, -2.75, 2.75, 5.25]) box(interior, W, x, 1.79, dividingZ, .17, 2.56, .31, style.trim);
    for (const x of [-4, 4]) box(interior, W, x, 3.05, dividingZ, 2.5, .2, .33, style.trim);
    box(interior, C, 0, .536, 3.2, 5.2, .035, 3.6, '#c2ac7e');
    box(interior, C, 0, .559, 3.2, 4.85, .025, 3.25, style.linen);
    box(interior, W, 0, 1.38, 3.28, 2.5, .16, 1.46, '#9c7c54');
    for (const x of [-1, 1]) for (const z of [2.75, 3.81]) box(interior, W, x, .97, z, .17, .98, .17, style.trim);
    for (const x of [-2.25, 2.25]) {
      box(interior, W, x, .98, 3.28, .55, .17, 1.23, '#92734d');
      for (const z of [2.9, 3.66]) box(interior, W, x, .73, z, .15, .52, .15, style.trim);
      box(interior, W, x, 1.36, 3.8, .55, .72, .10, '#92734d');
    }
    cylinder(interior, C, -.45, 1.485, 3.2, .3, .3, .06, '#d6c9a5');
    geometry(interior, C, new THREE.SphereGeometry(.17, 8, 6), -.42, 1.58, 3.2, '#bca16a');
    cylinder(interior, S, .65, 1.64, 3.35, .12, .17, .36, '#8c9c7c');
    box(interior, S, -5.9, .88, .72, 2.2, .95, 1.45, '#727b6d');
    box(interior, W, -5.9, 1.40, .72, 2.35, .15, 1.6, style.wood);
    box(interior, M, -5.9, 1.0, 1.48, 1.42, .57, .06, '#343e36');
    for (let i = 0; i < 3; i++) cylinder(interior, W, -6.3 + i * .4, .86, 1.47, .10, .11, .7, '#85694a', [0, 0, Math.PI / 2]);
    geometry(interior, L, new THREE.ConeGeometry(.20, .52, 7), -5.9, 1.13, 1.44, '#dca160');
    for (const y of [.85, 1.38, 1.91, 2.44]) box(interior, W, 6.8, y, 1.5, .77, .11, 2.65, style.wood);
    box(interior, W, 7.1, 1.6, 1.5, .13, 2.25, 2.65, style.trim);
    for (let i = 0; i < 18; i++) box(interior, C, 6.74, 1.08 + Math.floor(i / 6) * .52, .4 + (i % 6) * .38,
      .45, .31 + (i % 3) * .04, .19, ['#7a8060', '#9c7665', '#b6a071'][i % 3]);
    for (const side of [-1, 1]) {
      const bedX = side * 4.25;
      box(interior, C, bedX, .536, -4.3, 4.3, .04, 3.6, '#b19d75');
      box(interior, C, bedX, .561, -4.3, 4.05, .02, 3.34, style.linen);
      box(interior, W, bedX, .77, -5.25, 2.18, .50, 2.8, style.wood);
      box(interior, W, bedX, 1.15, -6.53, 2.32, 1.12, .17, style.trim);
      box(interior, W, bedX, .94, -3.90, 2.32, .70, .16, style.trim);
      box(interior, C, bedX, 1.09, -5.25, 2.03, .17, 2.57, '#d3c7a6');
      box(interior, C, bedX, 1.20, -5.76, 2.0, .13, 1.26, side < 0 ? style.linen : '#927567');
      box(interior, C, bedX, 1.23, -4.39, 1.4, .15, .49, '#e5d9b7');
      box(interior, W, bedX + side * 2.16, .85, -4.8, .77, .69, .83, style.wood);
      cylinder(interior, S, bedX + side * 2.16, 1.29, -4.8, .12, .18, .28, '#969e7b');
      cylinder(interior, L, bedX + side * 2.16, 1.50, -4.8, .055, .055, .18, '#dccba3');
      for (const y of [1.28, 1.8, 2.32]) box(interior, W, side * 7.3, y, -2.3, .55, .11, 1.95, style.wood);
    }

    // The warped eaves, deep shingle relief and different roof pitches give each
    // cottage its silhouette; their detailed roofs vanish with one group toggle.
    const eave = 3.86, ridge = eave + style.rise, slope = Math.atan(style.rise / 8.35);
    for (const side of [-1, 1]) {
      const length = Math.hypot(8.55, style.rise);
      box(roof, materials.roof, side * 4.20, eave + style.rise / 2, 0, length, .18, 15.1, style.roof, [0, 0, -side * slope]);
      for (let row = 0; row < 8; row++) for (let column = 0; column < 12; column++) {
        const x = side * (.57 + row * 1.07), z = -7.05 + column * 1.28 + (row % 2) * .23;
        const sag = -.04 * Math.cos(z * .45) + .03 * Math.sin(column * 2.7 + row);
        const y = ridge - Math.abs(x) * style.rise / 8.35 + .17 + sag;
        const variantTint = new THREE.Color(style.roof).multiplyScalar(.88 + ((row * 7 + column * 3) % 11) / 55);
        box(roof, materials.roof, x, y, z, 1.16, .08, 1.42, variantTint, [0, 0, -side * slope]);
      }
      beam(roof, [side * 8.65, eave - .05, -7.65], [side * 8.65, eave - .05, 7.65], .22, style.trim);
      for (const z of [-7.4, 7.4]) beam(roof, [0, ridge + .05, z], [side * 8.7, eave - .08, z], .26, style.trim);
    }
    beam(roof, [0, ridge + .16, -7.7], [0, ridge + .16, 7.7], .28, style.trim);
    for (const z of [-7.07, 7.07]) {
      const shape = new THREE.Shape(); shape.moveTo(-8, 0); shape.lineTo(0, style.rise); shape.lineTo(8, 0); shape.closePath();
      const geo = new THREE.ShapeGeometry(shape); geo.computeVertexNormals();
      geometry(roof, materials.plaster, geo, 0, eave - .04, z, style.wall, z < 0 ? [0, Math.PI, 0] : [0, 0, 0]);
      beam(roof, [0, eave, z + Math.sign(z) * .07], [0, ridge, z + Math.sign(z) * .07], .17, style.trim);
      for (const side of [-1, 1]) beam(roof, [side * 6.0, eave + .16, z + Math.sign(z) * .09], [0, ridge - .18, z + Math.sign(z) * .09], .16, style.trim);
    }
    // East/west dormers create a cross-gabled roof and a warm window visible in the game camera.
    function dormer(dormerSide, dormerZ) {
      const dormerX = dormerSide * 4.2, dormerY = ridge - 4.2 * style.rise / 8.35;
      box(roof, materials.plaster, dormerX, dormerY + .30, dormerZ, 2.2, 1.15, 2.75, style.wall);
      box(roof, W, dormerX + dormerSide * 1.14, dormerY + .32, dormerZ, .14, 1.30, 2.9, style.trim);
      box(roof, materials.glass, dormerX + dormerSide * 1.23, dormerY + .32, dormerZ, .07, .85, 1.65, '#d0b98c');
      box(roof, W, dormerX + dormerSide * 1.28, dormerY + .32, dormerZ, .07, .91, .10, style.trim);
      for (const side of [-1, 1]) box(roof, materials.roof, dormerX, dormerY + 1.12, dormerZ + side * .78, 3.2, .14, 1.85, style.roof, [side * .39, 0, 0]);
      const gableShape = new THREE.Shape();
      gableShape.moveTo(-1.42, 0); gableShape.lineTo(0, .75); gableShape.lineTo(1.42, 0); gableShape.closePath();
      geometry(roof, materials.plaster, new THREE.ShapeGeometry(gableShape), dormerX + dormerSide * 1.15,
        dormerY + .78, dormerZ, style.wall, [0, dormerSide * Math.PI / 2, 0]);
      beam(roof, [dormerX - 1.55, dormerY + 1.43, dormerZ], [dormerX + 1.55, dormerY + 1.43, dormerZ], .16, style.trim);
      for (const side of [-1, 1]) beam(roof,
        [dormerX + dormerSide * 1.22, dormerY + .77, dormerZ + side * 1.46],
        [dormerX + dormerSide * 1.22, dormerY + 1.51, dormerZ], .14, style.trim);
    }
    dormer(houseIndex === 1 ? -1 : 1, houseIndex === 2 ? -2.1 : 1.8);
    if (houseIndex === 1) dormer(1, -3.2);
    // Tall mottled chimney, divided flue and a metal rain cap.
    const chimneyX = houseIndex === 1 ? -3.8 : -5.5, chimneyZ = houseIndex === 2 ? 3.3 : -3.8;
    const chimneyBottom = ridge - Math.abs(chimneyX) * style.rise / 8.35;
    box(roof, S, chimneyX, chimneyBottom + 1.0, chimneyZ, 1.15, 2.05, 1.20, '#89917e');
    box(roof, S, chimneyX, chimneyBottom + 2.08, chimneyZ, 1.42, .18, 1.48, '#b1ad91');
    box(roof, M, chimneyX, chimneyBottom + 2.22, chimneyZ, 1.10, .13, .92, '#3f4c43');
    for (const side of [-1, 1]) box(roof, M, chimneyX + side * .46, chimneyBottom + 2.43, chimneyZ, .07, .34, .08, '#51564a');
    box(roof, M, chimneyX, chimneyBottom + 2.63, chimneyZ, 1.47, .12, 1.28, '#59634f', [0, 0, -.04]);
    // Distinctive details: hanging inn sign, drying herbs or hunter's stacked logs.
    if (houseIndex === 1) {
      beam(frontFacade, [2.3, 3.2, 7.2], [2.3, 3.2, 8.2], .13, style.trim);
      box(frontFacade, W, 2.3, 2.72, 8.20, 1.10, .74, .12, '#7e7657');
      geometry(frontFacade, materials.light, new THREE.TorusGeometry(.20, .035, 5, 14, Math.PI * 1.55), 2.3, 2.73, 8.28, '#cabd83', [0, 0, -.55]);
    } else if (houseIndex === 0) {
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const px = side * (2.7 + i * .35);
        beam(frontFacade, [px, 3.28, 7.42], [px, 2.85, 7.44], .035, '#7c8856');
        geometry(frontFacade, C, new THREE.ConeGeometry(.095, .30, 6), px, 2.75, 7.44, '#90936e', [Math.PI, 0, 0]);
      }
    } else {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) cylinder(outer, W, 8.35, .67 + row * .29, 3.0 + i * .35 + row * .17, .16, .17, 1.28, '#a1865d', [0, 0, Math.PI / 2]);
      beam(roof, [-.12, 4.30, 7.18], [-1.1, 5.05, 7.18], .095, '#c7b995');
      beam(roof, [.12, 4.30, 7.18], [1.1, 5.05, 7.18], .095, '#c7b995');
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) beam(roof, [side * (.48 + i * .24), 4.55 + i * .18, 7.18], [side * (.38 + i * .24), 4.91 + i * .18, 7.18], .065, '#c7b995');
    }

    for (const [parent, byMaterial] of batches) for (const [mat, parts] of byMaterial) {
      const merged = mergeGeometries(parts, false);
      if (!merged) throw new Error(`Could not batch ${site.name}`);
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `${parent.name || 'Fundament'} · ${mat === W ? 'Holz' : mat === S ? 'Stein' : 'Material'}`;
      parent.add(mesh); parts.forEach(part => part.dispose());
    }
    roof.visible = false;
    interior.visible = true;
    houses.push({ name: site.name, x: site.x, z: site.z, halfWidth, halfDepth, floorHeight, group, roof, frontFacade, interior, kind: style.kind });
  }
  return { houses, walls };
}
