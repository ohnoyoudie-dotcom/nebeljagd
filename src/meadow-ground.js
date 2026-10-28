import * as THREE from 'three';
import { distanceToSegment } from './map/model.js';

const GREEN_BIOMES = new Set(['meadow', 'forest', 'heath', 'marsh']);
const CHUNK_SIZE = 10;

export function groundGrassSettings(map = {}) {
  const source = map.groundCover ?? {};
  const number = (value, fallback, min, max) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
  const explicitType = typeof source.type === 'string';
  return {
    enabled: explicitType ? source.type === 'rei-grass' : source.enabled !== false,
    height: number(source.height, .82, .25, 1.6),
    density: number(source.density, 8.8, 2, 16),
    color: /^#[\da-f]{6}$/i.test(source.color ?? '') ? source.color : '#60963d',
    groundBlend: number(source.groundBlend, .30, 0, 1),
    windEnabled: source.windEnabled !== false,
    windStrength: number(source.windStrength, .42, 0, 1),
    windSpeed: number(source.windSpeed, 1, .1, 3),
    windDirection: number(source.windDirection, 45, 0, 360),
    scope: source.scope === 'all' ? 'all' : 'green',
  };
}

export function regionHasGroundGrass(region, settings) {
  if (!settings.enabled || region?.groundCover === 'none') return false;
  if (region?.groundCover === 'rei-grass') return true;
  return settings.scope === 'all' || GREEN_BIOMES.has(region?.biome);
}

export function createGroundGrassExclusion(map, { padding = .55 } = {}) {
  const cells = new Map(), cellSize = 24;
  const insert = (shape, minX, minZ, maxX, maxZ) => {
    for (let x = Math.floor(minX / cellSize); x <= Math.floor(maxX / cellSize); x++) {
      for (let z = Math.floor(minZ / cellSize); z <= Math.floor(maxZ / cellSize); z++) {
        const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(shape);
      }
    }
  };
  for (const line of [...(map.paths ?? []), ...(map.rivers ?? [])]) {
    const radius = (line.width ?? 0) / 2 + padding;
    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1], b = line.points[i];
      insert({ kind: 'segment', a, b, radius }, Math.min(a[0], b[0]) - radius, Math.min(a[1], b[1]) - radius,
        Math.max(a[0], b[0]) + radius, Math.max(a[1], b[1]) + radius);
    }
  }
  const extents = {
    chest: [1.05, .8], crate: [.8, .8], rock: [1.35, 1.35], shrine: [1.15, 1.15],
    mound: [4.6, 3.5], house: [9.4, 9.2],
  };
  for (const object of map.objects ?? []) {
    if (!extents[object.kind]) continue;
    const scale = object.scale ?? 1;
    let [hx, hz] = extents[object.kind];
    if (object.kind === 'mound' && object.variant === 'knoll') [hx, hz] = [3.3, 2.8];
    if (object.kind === 'house' && object.variant === 'kit-timber') [hx, hz] = [3.8, 4.1];
    if (object.kind === 'house' && object.variant?.startsWith('tavern-')) [hx, hz] = [12.4, 12.4];
    hx = hx * scale + padding; hz = hz * scale + padding;
    const [x, z] = object.position, rotation = object.rotation ?? 0, c = Math.cos(rotation), s = Math.sin(rotation);
    const radius = Math.hypot(hx, hz);
    insert({ kind: 'box', x, z, hx, hz, c, s }, x - radius, z - radius, x + radius, z + radius);
  }
  return (x, z) => {
    for (const shape of cells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? []) {
      if (shape.kind === 'segment') {
        if (distanceToSegment([x, z], shape.a, shape.b) < shape.radius) return true;
      } else {
        const dx = x - shape.x, dz = z - shape.z;
        if (Math.abs(dx * shape.c - dz * shape.s) < shape.hx && Math.abs(dx * shape.s + dz * shape.c) < shape.hz) return true;
      }
    }
    return false;
  };
}

function grassAlphaTexture() {
  const size = 256, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, size, size); ctx.lineCap = 'round';
  let seed = 9137;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  for (let i = 0; i < 42; i++) {
    const rootX = 22 + random() * 212, rootY = 250 + random() * 3;
    const height = 92 + random() * 148, bend = (random() - .5) * 76;
    const width = 2.2 + random() * 4.5;
    const gradient = ctx.createLinearGradient(rootX, rootY, rootX + bend, rootY - height);
    gradient.addColorStop(0, 'rgba(255,255,255,.92)');
    gradient.addColorStop(.58, 'rgba(255,255,255,.98)');
    gradient.addColorStop(1, 'rgba(255,255,255,.18)');
    ctx.strokeStyle = gradient; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(rootX, rootY);
    ctx.bezierCurveTo(rootX + bend * .12, rootY - height * .38, rootX + bend * .66, rootY - height * .74, rootX + bend, rootY - height);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.name = 'Nebeljagd · dense meadow grass alpha';
  return texture;
}

function tuftGeometry() {
  const geometry = new THREE.BufferGeometry(), positions = [], normals = [], uvs = [], indices = [];
  for (let card = 0; card < 3; card++) {
    const angle = card * 2.3999632297, c = Math.cos(angle), s = Math.sin(angle), base = positions.length / 3;
    for (let row = 0; row <= 4; row++) for (let side = 0; side < 2; side++) {
      const h = row / 4, edge = side - .5, lean = .08 + Math.pow(h, 1.7) * .36;
      positions.push(edge * c + lean * s, h, edge * s - lean * c);
      normals.push(0, 1, 0); uvs.push(side, h);
    }
    for (let row = 0; row < 4; row++) {
      const i = base + row * 2; indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

function hash(x, z, salt = 0) {
  let value = Math.imul(x ^ salt, 374761393) ^ Math.imul(z + salt, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

export function createMeadowGround(root, { map, heightAt, colorAt, spatial, quality = 'high' }) {
  const settings = groundGrassSettings(map);
  const empty = { update() {}, setQuality() {}, dispose() {}, inspect: () => ({ enabled: false, settings }) };
  if (!settings.enabled || typeof document === 'undefined') return empty;

  const texture = grassAlphaTexture(), geometry = tuftGeometry(), group = new THREE.Group();
  group.name = 'Nebeljagd · dichte animierte Wiese'; root.add(group);
  const excluded = createGroundGrassExclusion(map);
  const windDirection = new THREE.Vector2(Math.cos(settings.windDirection * Math.PI / 180), Math.sin(settings.windDirection * Math.PI / 180));
  const uniforms = {
    uGrassTime: { value: 0 }, uGrassWind: { value: settings.windEnabled ? settings.windStrength : 0 },
    uGrassSpeed: { value: settings.windSpeed }, uGrassDirection: { value: windDirection },
    uGrassViewer: { value: new THREE.Vector2() }, uGrassDistance: { value: 42 },
  };
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 1, side: THREE.DoubleSide, alphaMap: texture, alphaTest: .20,
    alphaToCoverage: true, vertexColors: true,
  });
  material.dithering = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform float uGrassTime,uGrassWind,uGrassSpeed;uniform vec2 uGrassDirection;
      varying float vGrassHeight;varying vec2 vGrassRoot;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 grassRoot=instanceMatrix[3].xz;
        float phase=dot(grassRoot,vec2(.197,.231));
        float gust=.55+.45*sin(dot(grassRoot,uGrassDirection)*.28-uGrassTime*uGrassSpeed*1.15);
        float wave=.42+sin(dot(grassRoot,uGrassDirection)*.47-uGrassTime*uGrassSpeed*1.5)*.62+.20*sin(phase*2.3+uGrassTime*uGrassSpeed*2.4);
        float bend=pow(uv.y,1.7)*uGrassWind*(.18+gust*.31)*wave;
        vec2 localWind=vec2(dot(normalize(instanceMatrix[0].xz),uGrassDirection),dot(normalize(instanceMatrix[2].xz),uGrassDirection));
        transformed.xz+=localWind*bend;
        vGrassHeight=uv.y;vGrassRoot=grassRoot;
      `);
    shader.fragmentShader = `uniform vec2 uGrassViewer;uniform float uGrassDistance;
      varying float vGrassHeight;varying vec2 vGrassRoot;
      ${shader.fragmentShader}`.replace('#include <alphatest_fragment>', `
        diffuseColor.a*=1.-smoothstep(uGrassDistance-10.,uGrassDistance,distance(vGrassRoot,uGrassViewer));
        diffuseColor.rgb*=mix(vec3(.52,.63,.40),vec3(1.10,1.15,.84),smoothstep(0.,1.,vGrassHeight));
        #include <alphatest_fragment>
      `).replace('#include <normal_fragment_begin>', `
        #include <normal_fragment_begin>
        normal=normalize(vNormal);
        nonPerturbedNormal=normal;
      `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-dense-meadow-v1';

  let mode = quality === 'low' ? 'low' : 'high', frame = 0, visibleChunks = 0, visibleInstances = 0, createdChunks = 0;
  let lastCellX = Infinity, lastCellZ = Infinity, queue = [];
  const chunks = new Map(), dummy = new THREE.Object3D(), base = new THREE.Color(settings.color), ground = new THREE.Color(), tint = new THREE.Color();

  const allowed = (x, z) => spatial.isLand(x, z) && !spatial.isWater(x, z) && !excluded(x, z)
    && regionHasGroundGrass(spatial.regionAt(x, z), settings);

  function makeChunk(cx, cz) {
    const density = settings.density * (mode === 'low' ? .58 : 1);
    const spacing = 1 / Math.sqrt(density), cells = Math.max(3, Math.round(CHUNK_SIZE / spacing)), step = CHUNK_SIZE / cells;
    const data = [];
    for (let ix = 0; ix < cells; ix++) for (let iz = 0; iz < cells; iz++) {
      const gx = cx * cells + ix, gz = cz * cells + iz;
      const x = cx * CHUNK_SIZE + (ix + .12 + .76 * hash(gx, gz, 17)) * step;
      const z = cz * CHUNK_SIZE + (iz + .12 + .76 * hash(gx, gz, 31)) * step;
      if (allowed(x, z)) data.push({ x, z, gx, gz });
    }
    const key = `${cx},${cz}`;
    if (!data.length) { chunks.set(key, { mesh: null, cx, cz, count: 0, touched: frame }); return; }
    const mesh = new THREE.InstancedMesh(geometry, material, data.length);
    mesh.name = `Dichte Wiese ${key}`; mesh.castShadow = false; mesh.receiveShadow = true;
    for (let i = 0; i < data.length; i++) {
      const { x, z, gx, gz } = data[i];
      dummy.position.set(x, heightAt(x, z) - .035, z);
      dummy.rotation.set(0, hash(gx, gz, 49) * Math.PI * 2, 0);
      const h = settings.height * (.72 + .54 * hash(gx, gz, 63)), w = .62 + .34 * hash(gx, gz, 73);
      dummy.scale.set(w, h, w); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      colorAt(x, z, ground);
      const patch = .92 + .10 * Math.sin(x * .12 + Math.sin(z * .09)) + .06 * Math.cos(z * .18 - x * .05);
      tint.copy(base).lerp(ground, settings.groundBlend * .55).multiplyScalar(patch * (.88 + hash(gx, gz, 97) * .20));
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius += settings.height + .8;
    group.add(mesh); chunks.set(key, { mesh, cx, cz, count: data.length, touched: frame }); createdChunks++;
  }

  function clear() {
    for (const chunk of chunks.values()) if (chunk.mesh) group.remove(chunk.mesh);
    chunks.clear(); queue = []; lastCellX = lastCellZ = Infinity;
  }

  function update(time, player) {
    frame++; uniforms.uGrassTime.value = time; uniforms.uGrassViewer.value.set(player.x, player.z);
    const radius = mode === 'low' ? 28 : 42; uniforms.uGrassDistance.value = radius;
    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    if (cx !== lastCellX || cz !== lastCellZ) {
      queue = []; const range = Math.ceil(radius / CHUNK_SIZE) + 1;
      for (let x = cx - range; x <= cx + range; x++) for (let z = cz - range; z <= cz + range; z++) {
        const distance = Math.hypot((x + .5) * CHUNK_SIZE - player.x, (z + .5) * CHUNK_SIZE - player.z);
        if (distance < radius + CHUNK_SIZE * .75 && !chunks.has(`${x},${z}`)) queue.push({ x, z, distance });
      }
      queue.sort((a, b) => a.distance - b.distance); lastCellX = cx; lastCellZ = cz;
    }
    for (let i = 0, limit = frame === 1 ? 10 : 3; i < limit && queue.length; i++) {
      const next = queue.shift(); makeChunk(next.x, next.z);
    }
    visibleChunks = 0; visibleInstances = 0;
    for (const [key, chunk] of chunks) {
      const distance = Math.hypot((chunk.cx + .5) * CHUNK_SIZE - player.x, (chunk.cz + .5) * CHUNK_SIZE - player.z);
      const near = distance < radius + CHUNK_SIZE * .75;
      if (chunk.mesh) chunk.mesh.visible = near;
      if (near) { chunk.touched = frame; if (chunk.mesh) { visibleChunks++; visibleInstances += chunk.count; } }
      if (distance > radius + CHUNK_SIZE * 3) {
        if (chunk.mesh) group.remove(chunk.mesh);
        chunks.delete(key);
      }
    }
  }

  return {
    update,
    setQuality(value) { const next = value === 'low' ? 'low' : 'high'; if (next !== mode) { mode = next; clear(); } },
    inspect: () => ({ enabled: true, quality: mode, settings, visibleChunks, visibleInstances, cachedChunks: chunks.size,
      pendingChunks: queue.length, createdChunks, source: 'procedural dense Rei-style meadow', cardsPerTuft: 3 }),
    dispose() { clear(); root.remove(group); geometry.dispose(); material.dispose(); texture.dispose(); },
  };
}
