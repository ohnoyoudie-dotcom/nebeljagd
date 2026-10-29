import * as THREE from 'three';
import { distanceToSegment } from './map/model.js';

const GRASS_BIOME_PROFILES = {
  meadow: { color: '#4b7331', density: 1, groundBlend: .38 },
  forest: { color: '#355d32', density: .88, groundBlend: .42 },
  heath: { color: '#7c7839', density: .78, groundBlend: .46 },
  marsh: { color: '#37665b', density: .82, groundBlend: .48 },
  snow: { color: '#c7d2cc', density: .48, groundBlend: .86, snowy: true },
};
const GREEN_BIOMES = new Set(Object.keys(GRASS_BIOME_PROFILES));
const CHUNK_SIZE = 10;

export function groundGrassSettings(map = {}) {
  const source = map.groundCover ?? {};
  const number = (value, fallback, min, max) => Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback;
  const explicitType = typeof source.type === 'string';
  return {
    enabled: explicitType ? source.type === 'rei-grass' : source.enabled !== false,
    height: number(source.height, .82, .25, 1.6),
    density: number(source.density, 8.8, 2, 16),
    color: /^#[\da-f]{6}$/i.test(source.color ?? '') ? source.color : '#4b7331',
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

export function grassBiomeProfile(biome, fallbackColor = '#4b7331') {
  const profile = GRASS_BIOME_PROFILES[biome];
  return profile ? { ...profile } : { color: fallbackColor, density: 1, groundBlend: .38 };
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

function detailBladeGeometry() {
  // Second meadow layer: a small cluster of unmistakable, wider tapered blades.
  // This is visible across the whole rendered meadow and sits above the dense
  // carpet layer, so the ground stays covered while the eye still reads grass.
  const geometry = new THREE.BufferGeometry(), positions = [], uvs = [], indices = [];
  const blades = [
    [-.14, -.06, -.62, 1.05, .105, .18],
    [ .13, -.02,  .54,  .88, .090, .13],
    [-.04,  .12, 1.48, 1.16, .115, .20],
    [ .08, -.14, 2.28,  .78, .082, .15],
    [ .01,  .02, 2.92,  .96, .098, .17],
  ];
  for (const [ox, oz, angle, height, width, lean] of blades) {
    const base = positions.length / 3, wx = Math.cos(angle) * width * .5, wz = Math.sin(angle) * width * .5;
    const lx = Math.cos(angle + Math.PI / 2) * lean, lz = Math.sin(angle + Math.PI / 2) * lean;
    for (const [row, spread, bend] of [[0,1,0],[.48,.78,.30],[.78,.48,.62],[1,.07,1]]) {
      const cx = ox + lx * bend, cz = oz + lz * bend;
      positions.push(cx - wx * spread, row * height, cz - wz * spread, cx + wx * spread, row * height, cz + wz * spread);
      uvs.push(0,row,1,row);
    }
    indices.push(base,base+1,base+2, base+1,base+3,base+2,
      base+2,base+3,base+4, base+3,base+5,base+4,
      base+4,base+5,base+6, base+5,base+7,base+6);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
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
  const settings = groundGrassSettings(map), maxInteractors = 8;
  const empty = { update() {}, setQuality() {}, setInteractors() {}, dispose() {}, inspect: () => ({ enabled: false, settings, interactorCount: 0 }) };
  if (!settings.enabled || typeof document === 'undefined') return empty;

  const texture = grassAlphaTexture(), geometry = tuftGeometry(), detailGeometry = detailBladeGeometry(), group = new THREE.Group();
  group.name = 'Nebeljagd · dichte animierte Wiese'; root.add(group);
  const excluded = createGroundGrassExclusion(map);
  const windDirection = new THREE.Vector2(Math.cos(settings.windDirection * Math.PI / 180), Math.sin(settings.windDirection * Math.PI / 180));
  const uniforms = {
    uGrassTime: { value: 0 }, uGrassWind: { value: settings.windEnabled ? settings.windStrength : 0 },
    uGrassSpeed: { value: settings.windSpeed }, uGrassDirection: { value: windDirection },
    uGrassViewer: { value: new THREE.Vector2() }, uGrassDistance: { value: 42 },
    uGrassInteractorCount: { value: 0 },
    uGrassInteractors: { value: Array.from({ length: maxInteractors }, () => new THREE.Vector3(99999, 99999, 0)) },
    uGrassInteractorMotion: { value: Array.from({ length: maxInteractors }, () => new THREE.Vector3(0, 1, 0)) },
  };
  const interactionGLSL = `uniform int uGrassInteractorCount; uniform vec3 uGrassInteractors[${maxInteractors}];
    uniform vec3 uGrassInteractorMotion[${maxInteractors}];
    float grassVariation(vec2 p, float salt) {
      return fract(sin(dot(p + salt, vec2(12.9898,78.233))) * 43758.5453);
    }
    vec2 grassInteractionAt(vec2 p) {
      vec2 push = vec2(0.);
      float recoverySeed = grassVariation(p, 17.3);
      for (int i = 0; i < ${maxInteractors}; i++) {
        if (i >= uGrassInteractorCount) break;
        vec3 actor = uGrassInteractors[i];
        vec3 motion = uGrassInteractorMotion[i];
        vec2 delta = p - actor.xy;
        float d = length(delta);
        float radius = max(.25, actor.z);
        float motionLength = length(motion.xy);
        if (motionLength < .001 || motion.z <= .001) continue;
        vec2 forward = motion.xy / motionLength;
        vec2 side = vec2(-forward.y, forward.x);
        float along = dot(delta, forward);
        float sideways = abs(dot(delta, side));
        float bodyInfluence = 1. - smoothstep(radius * .18, radius, d);
        float wakeLength = radius * mix(.85, 1.85, recoverySeed);
        float wakeWidth = radius * mix(.58, .92, grassVariation(p, 39.1));
        float behind = max(0., -along);
        float wakeInfluence = (1. - smoothstep(wakeWidth * .42, wakeWidth, sideways))
          * (1. - smoothstep(0., wakeLength, behind))
          * (1. - smoothstep(-.05, .18, along));
        float influence = max(bodyInfluence, wakeInfluence * mix(.52, .78, recoverySeed));
        if (influence <= 0.) continue;
        vec2 radial = d > .001 ? delta / d : forward;
        vec2 direction = normalize(forward * .82 + radial * .18);
        push += direction * influence * motion.z * mix(.56, .70, grassVariation(p, 71.9));
      }
      return push;
    }`;
  const material = new THREE.MeshBasicMaterial({
    color: '#ffffff', side: THREE.DoubleSide, alphaMap: texture, alphaTest: .20,
    alphaToCoverage: true, vertexColors: true, toneMapped: true,
  });
  material.dithering = true;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${interactionGLSL}\nuniform float uGrassTime,uGrassWind,uGrassSpeed;uniform vec2 uGrassDirection;
      varying float vGrassHeight;varying vec2 vGrassRoot;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 grassRoot=instanceMatrix[3].xz;
        float seedA=grassVariation(grassRoot,3.7), seedB=grassVariation(grassRoot,11.9), seedC=grassVariation(grassRoot,23.1);
        float localSpeed=mix(.72,1.30,seedA);
        float localAmplitude=mix(.74,1.24,seedB);
        float phase=dot(grassRoot,vec2(.197,.231))+seedC*6.28318530718;
        float gust=.50+.50*sin(dot(grassRoot,uGrassDirection)*.28-uGrassTime*uGrassSpeed*(1.00+.24*seedA)+phase*.23);
        float wave=.40+sin(dot(grassRoot,uGrassDirection)*.47-uGrassTime*uGrassSpeed*1.5*localSpeed+phase)*.62
          +.20*sin(phase*2.1+uGrassTime*uGrassSpeed*(1.9+.8*seedB));
        float bend=pow(uv.y,1.7)*uGrassWind*(.18+gust*.31)*wave*localAmplitude;
        float curveAngle=seedA*6.28318530718;
        vec2 curveDir=vec2(cos(curveAngle),sin(curveAngle));
        transformed.xz+=curveDir*mix(.018,.115,seedC)*pow(uv.y,1.85);
        vec2 localWind=vec2(dot(normalize(instanceMatrix[0].xz),uGrassDirection),dot(normalize(instanceMatrix[2].xz),uGrassDirection));
        transformed.xz+=localWind*bend;
        vec2 worldPush=grassInteractionAt(grassRoot);
        vec2 localPush=vec2(dot(normalize(instanceMatrix[0].xz),worldPush),dot(normalize(instanceMatrix[2].xz),worldPush));
        transformed.xz+=localPush*pow(uv.y,1.25);
        vGrassHeight=uv.y;vGrassRoot=grassRoot;
      `);
    shader.fragmentShader = `uniform vec2 uGrassViewer;uniform float uGrassDistance;
      varying float vGrassHeight;varying vec2 vGrassRoot;
      ${shader.fragmentShader}`.replace('#include <alphatest_fragment>', `
        diffuseColor.a*=1.-smoothstep(uGrassDistance-10.,uGrassDistance,distance(vGrassRoot,uGrassViewer));
        float grassHeightMix=smoothstep(0.,1.,vGrassHeight);
        float preGrassLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
        float snowyGrass=smoothstep(.34,.56,preGrassLuma);
        vec3 normalGrassTone=mix(vec3(.62,.72,.50),vec3(1.08,1.13,.90),grassHeightMix);
        vec3 snowGrassTone=mix(vec3(.84,.91,.92),vec3(1.03,1.06,1.09),grassHeightMix);
        diffuseColor.rgb*=mix(normalGrassTone,snowGrassTone,snowyGrass);
        vec3 snowTip=mix(vec3(.82,.88,.89),vec3(.98,1.0,1.0),grassHeightMix);
        diffuseColor.rgb=mix(diffuseColor.rgb,snowTip,snowyGrass*(.28+pow(grassHeightMix,1.25)*.62));
        diffuseColor.rgb=max(diffuseColor.rgb,vec3(.055,.12,.03));
        #include <alphatest_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-dense-meadow-v6-biome-tone';

  const detailMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff', side: THREE.DoubleSide, vertexColors: true, toneMapped: true,
  });
  detailMaterial.dithering = true;
  detailMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${interactionGLSL}\nuniform float uGrassTime,uGrassWind,uGrassSpeed;uniform vec2 uGrassDirection;
      varying float vDetailHeight;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 grassRoot=instanceMatrix[3].xz;
        float seedA=grassVariation(grassRoot,5.3), seedB=grassVariation(grassRoot,19.7), seedC=grassVariation(grassRoot,31.4);
        float localSpeed=mix(.68,1.34,seedA);
        float localAmplitude=mix(.70,1.30,seedB);
        float phase=dot(grassRoot,vec2(.211,.173))+seedC*6.28318530718;
        float gust=.56+.44*sin(dot(grassRoot,uGrassDirection)*.31-uGrassTime*uGrassSpeed*(.92+.30*seedA)+phase*.31);
        float wave=sin(phase+uGrassTime*uGrassSpeed*1.35*localSpeed)+.18*sin(phase*2.7-uGrassTime*uGrassSpeed*.83);
        float bend=pow(uv.y,1.75)*uGrassWind*(.12+gust*.22)*wave*localAmplitude;
        float curveAngle=seedB*6.28318530718;
        vec2 curveDir=vec2(cos(curveAngle),sin(curveAngle));
        transformed.xz+=curveDir*mix(.035,.18,seedC)*pow(uv.y,1.75);
        vec2 localWind=vec2(dot(normalize(instanceMatrix[0].xz),uGrassDirection),dot(normalize(instanceMatrix[2].xz),uGrassDirection));
        transformed.xz+=localWind*bend;
        vec2 worldPush=grassInteractionAt(grassRoot);
        vec2 localPush=vec2(dot(normalize(instanceMatrix[0].xz),worldPush),dot(normalize(instanceMatrix[2].xz),worldPush));
        transformed.xz+=localPush*pow(uv.y,1.25);
        vDetailHeight=uv.y;
      `);
    shader.fragmentShader = `varying float vDetailHeight;
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `
        #include <color_fragment>
        float detailHeight=smoothstep(0.,1.,vDetailHeight);
        float preDetailLuma=dot(diffuseColor.rgb,vec3(.299,.587,.114));
        float snowyDetail=smoothstep(.34,.56,preDetailLuma);
        vec3 normalDetailTone=mix(vec3(.92,1.00,.78),vec3(1.22,1.25,1.05),detailHeight);
        vec3 snowDetailTone=mix(vec3(.82,.90,.91),vec3(1.04,1.07,1.10),detailHeight);
        diffuseColor.rgb*=mix(normalDetailTone,snowDetailTone,snowyDetail);
        vec3 snowDetailTip=mix(vec3(.80,.87,.88),vec3(.99,1.0,1.0),detailHeight);
        diffuseColor.rgb=mix(diffuseColor.rgb,snowDetailTip,snowyDetail*(.30+pow(detailHeight,1.15)*.64));
      `);
  };
  detailMaterial.customProgramCacheKey = () => 'nebeljagd-layered-meadow-large-blades-v5-brighter-green';

  let mode = quality === 'low' ? 'low' : 'high', frame = 0, visibleChunks = 0, visibleInstances = 0, visibleDetailInstances = 0, createdChunks = 0;
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
      const region = spatial.regionAt(x, z), profile = grassBiomeProfile(region?.biome, settings.color);
      if (allowed(x, z) && hash(gx, gz, 151) <= profile.density) data.push({ x, z, gx, gz, biome: region?.biome ?? 'meadow', profile });
    }
    const key = `${cx},${cz}`;
    if (!data.length) { chunks.set(key, { mesh: null, detailMesh: null, cx, cz, count: 0, detailCount: 0, touched: frame }); return; }
    const mesh = new THREE.InstancedMesh(geometry, material, data.length);
    mesh.name = `Dichte Wiese ${key}`; mesh.castShadow = false; mesh.receiveShadow = false;
    for (let i = 0; i < data.length; i++) {
      const { x, z, gx, gz, profile } = data[i];
      dummy.position.set(x, heightAt(x, z) - .035, z);
      dummy.rotation.set((hash(gx, gz, 43) - .5) * .10, hash(gx, gz, 49) * Math.PI * 2, (hash(gx, gz, 47) - .5) * .10);
      const snowHeight = profile.snowy ? .90 : 1;
      const h = settings.height * snowHeight * (.70 + .58 * hash(gx, gz, 63)), w = .66 + .38 * hash(gx, gz, 73);
      dummy.scale.set(w, h, w); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      colorAt(x, z, ground);
      const patch = .92 + .10 * Math.sin(x * .12 + Math.sin(z * .09)) + .06 * Math.cos(z * .18 - x * .05);
      const hueShift = (hash(gx, gz, 111) - .5) * (profile.snowy ? .018 : .036);
      const saturationShift = (hash(gx, gz, 123) - .5) * (profile.snowy ? .05 : .12);
      const lightnessShift = (hash(gx, gz, 137) - .5) * (profile.snowy ? .05 : .08);
      tint.set(profile.color).offsetHSL(hueShift, saturationShift, lightnessShift)
        .lerp(ground, profile.groundBlend)
        .multiplyScalar(patch * (profile.snowy ? .94 + hash(gx, gz, 97) * .10 : .80 + hash(gx, gz, 97) * .14));
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius += settings.height + .8;

    const detailData = data.filter(({ gx, gz }) => hash(gx, gz, 173) < (mode === 'low' ? .13 : .20));
    const detailMesh = detailData.length ? new THREE.InstancedMesh(detailGeometry, detailMaterial, detailData.length) : null;
    if (detailMesh) {
      detailMesh.name = `Wiesen-Detailhalme ${key}`; detailMesh.castShadow = detailMesh.receiveShadow = false;
      for (let i = 0; i < detailData.length; i++) {
        const { x, z, gx, gz, profile } = detailData[i];
        dummy.position.set(x, heightAt(x, z) - .012, z);
        dummy.rotation.set((hash(gx, gz, 179) - .5) * .22, hash(gx, gz, 181) * Math.PI * 2, (hash(gx, gz, 183) - .5) * .22);
        const h = settings.height * (profile.snowy ? .86 : 1) * (1.02 + .38 * hash(gx, gz, 191)), w = .94 + .24 * hash(gx, gz, 199);
        dummy.scale.set(w, h, w); dummy.updateMatrix(); detailMesh.setMatrixAt(i, dummy.matrix);
        colorAt(x, z, ground);
        tint.set(profile.color)
          .offsetHSL((hash(gx,gz,211)-.5)*(profile.snowy ? .014 : .026), (hash(gx,gz,223)-.5)*(profile.snowy ? .04 : .08), (hash(gx,gz,227)-.5)*.05)
          .lerp(ground, Math.min(.72, profile.groundBlend + .08))
          .multiplyScalar(profile.snowy ? .98 + hash(gx,gz,229)*.08 : 1.06 + hash(gx,gz,229)*.16);
        detailMesh.setColorAt(i, tint);
      }
      detailMesh.instanceMatrix.needsUpdate = true; if (detailMesh.instanceColor) detailMesh.instanceColor.needsUpdate = true;
      detailMesh.computeBoundingSphere(); group.add(detailMesh);
    }
    group.add(mesh); chunks.set(key, { mesh, detailMesh, cx, cz, count: data.length, detailCount: detailData.length, touched: frame }); createdChunks++;
  }

  function clear() {
    for (const chunk of chunks.values()) { if (chunk.mesh) group.remove(chunk.mesh); if (chunk.detailMesh) group.remove(chunk.detailMesh); }
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
    visibleChunks = 0; visibleInstances = 0; visibleDetailInstances = 0;
    for (const [key, chunk] of chunks) {
      const distance = Math.hypot((chunk.cx + .5) * CHUNK_SIZE - player.x, (chunk.cz + .5) * CHUNK_SIZE - player.z);
      const near = distance < radius + CHUNK_SIZE * .75;
      if (chunk.mesh) chunk.mesh.visible = near;
      if (chunk.detailMesh) chunk.detailMesh.visible = near;
      if (near) {
        chunk.touched = frame;
        if (chunk.mesh) { visibleChunks++; visibleInstances += chunk.count; }
        if (chunk.detailMesh) visibleDetailInstances += chunk.detailCount;
      }
      if (distance > radius + CHUNK_SIZE * 3) {
        if (chunk.mesh) group.remove(chunk.mesh);
        if (chunk.detailMesh) group.remove(chunk.detailMesh);
        chunks.delete(key);
      }
    }
  }

  function setInteractors(values = []) {
    const count = Math.min(maxInteractors, values.length);
    uniforms.uGrassInteractorCount.value = count;
    for (let i = 0; i < maxInteractors; i++) {
      const value = i < count ? values[i] : null;
      uniforms.uGrassInteractors.value[i].set(value?.x ?? 99999, value?.z ?? 99999, value?.radius ?? 0);
      uniforms.uGrassInteractorMotion.value[i].set(value?.dirX ?? 0, value?.dirZ ?? 1, value?.strength ?? 0);
    }
  }

  return {
    update,
    setInteractors,
    setQuality(value) { const next = value === 'low' ? 'low' : 'high'; if (next !== mode) { mode = next; clear(); } },
    inspect: () => ({ enabled: true, quality: mode, settings, visibleChunks, visibleInstances, visibleDetailInstances, cachedChunks: chunks.size,
      pendingChunks: queue.length, createdChunks, source: 'procedural dense Rei-style meadow', cardsPerTuft: 3, lighting: 'color-preserving-unlit',
      colorVariation: 'per-tuft-hsl', detailLayer: 'global-large-solid-blades', layeredMeadow: true, characterParting: true,
      interactorCount: uniforms.uGrassInteractorCount.value, maximumInteractors: maxInteractors,
      interactionMode: 'forward-biased', forwardWeight: .82, radialWeight: .18,
      firstInteractorStrength: uniforms.uGrassInteractorMotion.value[0].z,
      curvatureVariation: 'per-tuft', windVariation: 'per-tuft-phase-speed-amplitude',
      recoveryModel: 'variable-directional-wake', biomeAdaptiveColor: true, snowTipCoating: true,
      detailLayerTone: 'brighter-green',
      biomeProfiles: Object.keys(GRASS_BIOME_PROFILES) }),
    dispose() { clear(); root.remove(group); geometry.dispose(); detailGeometry.dispose(); material.dispose(); detailMaterial.dispose(); texture.dispose(); },
  };
}
