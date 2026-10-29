import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateWorldmap } from './map/model.js';
import { createRiverWater } from './water.js';
import { createWorldObjectRenderer } from './world-object-renderer.js';
import { createTerrainArtwork } from './terrain-art.js';
import { createTerrainPaintMaterial, TERRAIN_PAINT_BUDGET } from './terrain-paint-renderer.js';
import { createMeadowGround } from './meadow-ground.js';
import { createSnowCover } from './snow-cover.js';

import { createWorldSpatialModel, projection } from './generated-spatial.js';
export { createWorldSpatialModel } from './generated-spatial.js';

const CHUNK = 64;

// Project moving cloud shadows in world space: they follow slopes, floors and
// vegetation instead of floating above or clipping into elevated terrain.
const CLOUD_SHADOW_GLSL = `
  uniform float uGeneratedCloudTime;
  float generatedCloudHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float generatedCloudNoise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(generatedCloudHash(i),generatedCloudHash(i+vec2(1.,0.)),f.x),
      mix(generatedCloudHash(i+vec2(0.,1.)),generatedCloudHash(i+vec2(1.)),f.x),f.y);
  }
  float generatedCloudLight(vec2 p) {
    vec2 q=p*.045-vec2(uGeneratedCloudTime*.037,uGeneratedCloudTime*.018);
    float cloud=generatedCloudNoise(q)*.72+generatedCloudNoise(q*2.17+vec2(9.1,3.7))*.28;
    return 1.-smoothstep(.38,.67,cloud)*.27;
  }
`;

/** The playable island is generated directly from the same document the editor saves. */
export async function createGeneratedWorld(scene, { map, quality = 'high' } = {}) {
  const validation = validateWorldmap(map);
  if (!validation.valid) throw new Error(`Die Spielkarte ist ungültig: ${validation.errors.join(' ')}`);
  const started = performance.now();
  const root = new THREE.Group(); root.name = `Welt aus worldmap.json · ${map.id}`; scene.add(root);
  const spatial = createWorldSpatialModel(map);
  const chunks = new Map(), terrainChunks = [], surfaceCells = new Map(), triangles = [];
  const sampleCache = new Map(), color = new THREE.Color();
  let mode = quality, lastCull = -Infinity, lastCullX = Infinity, lastCullZ = Infinity, visibleTerrainChunks = 0;
  let paintQueue = [], paintTileBudget = TERRAIN_PAINT_BUDGET[quality] ?? TERRAIN_PAINT_BUDGET.high;
  const timeUniform = { value: 0 }, radiusUniform = { value: map.zone.initialRadius };
  const centerUniform = { value: new THREE.Vector2(...map.zone.center) };
  const vertex = (x, z) => {
    const key = `${Math.round(x * 10000)},${Math.round(z * 10000)}`;
    if (!sampleCache.has(key)) { spatial.baseColorAt(x, z, color); sampleCache.set(key, { x, z, y: spatial.groundAt(x, z), color: [color.r, color.g, color.b] }); }
    return sampleCache.get(key);
  };
  function addTriangle(a, b, c) {
    const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3, key = `${Math.floor(cx / CHUNK)},${Math.floor(cz / CHUNK)}`;
    if (!chunks.has(key)) chunks.set(key, { key, x: (Math.floor(cx / CHUNK) + .5) * CHUNK, z: (Math.floor(cz / CHUNK) + .5) * CHUNK, vertices: [], indices: [], cache: new Map() });
    const chunk = chunks.get(key);
    for (const v of [a, c, b]) { const k = `${v.x},${v.z}`; if (!chunk.cache.has(k)) { chunk.cache.set(k, chunk.vertices.length); chunk.vertices.push(v); } chunk.indices.push(chunk.cache.get(k)); }
    const id = triangles.length; triangles.push([a, b, c]);
    for (let x = Math.floor(Math.min(a.x, b.x, c.x) / 16); x <= Math.floor(Math.max(a.x, b.x, c.x) / 16); x++) for (let z = Math.floor(Math.min(a.z, b.z, c.z) / 16); z <= Math.floor(Math.max(a.z, b.z, c.z) / 16); z++) {
      const cell = `${x},${z}`; if (!surfaceCells.has(cell)) surfaceCells.set(cell, []); surfaceCells.get(cell).push(id);
    }
  }
  const midpoint = (a, b) => vertex((a.x + b.x) / 2, (a.z + b.z) / 2);
  function subdivide(a, b, c, depth) {
    if (!depth) { addTriangle(a, b, c); return; }
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    subdivide(a, ab, ca, depth - 1); subdivide(ab, b, bc, depth - 1); subdivide(ca, bc, c, depth - 1); subdivide(ab, bc, ca, depth - 1);
  }
  const outline = map.island.points.map(([x, z]) => new THREE.Vector2(x, z));
  for (const tri of THREE.ShapeUtils.triangulateShape(outline, [])) subdivide(...tri.map(index => vertex(...map.island.points[index])), 6);
  const terrainArtwork = createTerrainArtwork();
  const groundTexture = terrainArtwork.ground;
  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, map: groundTexture,
    bumpMap: groundTexture, bumpScale: .018, roughness: .98, side: THREE.DoubleSide });
  const snowWeightAt = (x, z) => spatial.biomeWeightsAt(x, z).find(item => item.biome === 'snow')?.weight ?? 0;
  const boundsHaveSnow = bounds => {
    for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 3; iz++) {
      const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, ix / 2);
      const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, iz / 2);
      if (snowWeightAt(x, z) > .015) return true;
    }
    return false;
  };
  for (const chunk of chunks.values()) {
    const geometry = new THREE.BufferGeometry(), positions = [], colors = [], uvs = [];
    for (const v of chunk.vertices) { positions.push(v.x, v.y, v.z); colors.push(...v.color); uvs.push(v.x / 8, v.z / 8); }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(chunk.indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    // Chunk assignment uses triangle centroids, so its vertices can reach beyond
    // a 64m cell. Actual bounds avoid cutting painted circles at those edges.
    const bounds = { minX: Math.min(...chunk.vertices.map(v => v.x)) - .5, maxX: Math.max(...chunk.vertices.map(v => v.x)) + .5,
      minZ: Math.min(...chunk.vertices.map(v => v.z)) - .5, maxZ: Math.max(...chunk.vertices.map(v => v.z)) + .5 };
    const painted = spatial.terrainPaint.overlapping(bounds).length > 0;
    const snow = boundsHaveSnow(bounds);
    const paint = painted || snow
      ? createTerrainPaintMaterial(groundMaterial, spatial.terrainPaint, bounds, terrainArtwork.paving, snowWeightAt)
      : null;
    const mesh = new THREE.Mesh(geometry, paint?.material ?? groundMaterial); mesh.name = `Geländeabschnitt ${chunk.key}`; mesh.receiveShadow = true; root.add(mesh);
    terrainChunks.push({ mesh, x: chunk.x, z: chunk.z, paint });
  }
  function surfaceHeightAt(x, z) {
    for (const id of surfaceCells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const [a, b, c] = triangles[id];
      const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(denominator) < 1e-10) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return u * a.y + v * b.y + (1 - u - v) * c.y;
    }
    return spatial.groundAt(x, z);
  }
  // The rendered terrain and player use the same interpolated triangle heights.
  sampleCache.clear(); chunks.clear();
  const sea = new THREE.Mesh(new THREE.PlaneGeometry((map.bounds.maxX - map.bounds.minX) * 3, (map.bounds.maxZ - map.bounds.minZ) * 3),
    new THREE.MeshStandardMaterial({ color: '#376e83', roughness: .49, metalness: .12 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set((map.bounds.minX + map.bounds.maxX) / 2, -.9, (map.bounds.minZ + map.bounds.maxZ) / 2); sea.name = 'Meer um die Nebelinsel'; root.add(sea);
  const shorePositions = [], shoreIndices = [];
  for (let i = 0; i <= map.island.points.length; i++) {
    const [x, z] = map.island.points[i % map.island.points.length];
    shorePositions.push(x, spatial.groundAt(x, z) - .03, z, x, -1.2, z);
    if (i < map.island.points.length) { const a = i * 2; shoreIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const shoreGeo = new THREE.BufferGeometry(); shoreGeo.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3)); shoreGeo.setIndex(shoreIndices); shoreGeo.computeVertexNormals();
  root.add(new THREE.Mesh(shoreGeo, new THREE.MeshStandardMaterial({ color: '#b4aa7f', side: THREE.DoubleSide, roughness: .98 })));
  const waterMeshes = [];
  for (const river of map.rivers) {
    const points = [];
    for (let i = 1; i < river.points.length; i++) {
      const a = river.points[i - 1], b = river.points[i], steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4);
      for (let step = i === 1 ? 0 : 1; step <= steps; step++) points.push(new THREE.Vector3(THREE.MathUtils.lerp(a[0], b[0], step / steps), 0, THREE.MathUtils.lerp(a[1], b[1], step / steps)));
    }
    const water = createRiverWater(root, { riverPoints: points, halfWidth: river.width / 2, timeUniform, quality, zoneCenter: map.zone.center });
    water.material.uniforms.uGeneratedCenter = centerUniform;
    water.material.fragmentShader = `uniform vec2 uGeneratedCenter;\n${water.material.fragmentShader}`.replace('length(vWorld.xz)', 'distance(vWorld.xz, uGeneratedCenter)');
    const p = water.mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, (spatial.waterAt(p.getX(i), p.getZ(i))?.height ?? .14) + .025);
    p.needsUpdate = true; water.mesh.geometry.computeVertexNormals(); water.mesh.geometry.computeBoundingSphere();
    water.mesh.name = `${river.name} · animierter Fluss aus Kartendaten`; water.setZoneRadius(map.zone.initialRadius); waterMeshes.push(water);
  }
  const pathTexture = terrainArtwork.earth;
  const pathMaterials = {
    main: new THREE.MeshStandardMaterial({ color: '#ffffff', map: terrainArtwork.paving, bumpMap: terrainArtwork.pavingBump, bumpScale: .075, roughness: 1, side: THREE.DoubleSide, transparent: true, alphaTest: .01, depthWrite: false }),
    trail: new THREE.MeshStandardMaterial({ color: '#bec2a5', map: pathTexture, roughness: 1, side: THREE.DoubleSide, transparent: true, alphaTest: .01, depthWrite: false }),
  };
  for (const [kind, material] of Object.entries(pathMaterials)) {
    material.onBeforeCompile = shader => {
      shader.uniforms.uPathEarth = { value: terrainArtwork.earth };
      shader.vertexShader = `attribute float aPathAcross; varying float vPathAcross;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathAcross = aPathAcross;');
      shader.fragmentShader = `uniform sampler2D uPathEarth; varying float vPathAcross;\n${shader.fragmentShader}`;
      if (kind === 'main') shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        float pavingCore = smoothstep(.10, .22, min(vPathAcross, 1. - vPathAcross));
        diffuseColor.rgb = mix(texture2D(uPathEarth, vMapUv).rgb, diffuseColor.rgb, pavingCore);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0., .13, min(vPathAcross, 1. - vPathAcross));\n#include <alphatest_fragment>');
    };
    material.customProgramCacheKey = () => `painted-path-${kind}-1`;
  }
  const pathChunks = new Map();
  for (const path of map.paths.filter(p => p.kind !== 'bridge')) for (let segment = 1; segment < path.points.length; segment++) {
    const a = path.points[segment - 1], b = path.points[segment], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), steps = Math.max(1, Math.ceil(length / 2));
    const nx = dz / length * path.width / 2, nz = -dx / length * path.width / 2;
    for (let step = 0; step < steps; step++) {
      const t1 = step / steps, t2 = (step + 1) / steps;
      const x = a[0] + dx * (t1 + t2) / 2, z = a[1] + dz * (t1 + t2) / 2, key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}:${path.kind}`;
      if (!pathChunks.has(key)) pathChunks.set(key, { x: (Math.floor(x / CHUNK) + .5) * CHUNK, z: (Math.floor(z / CHUNK) + .5) * CHUNK, kind: path.kind, positions: [], uv: [], across: [] });
      const chunk = pathChunks.get(key);
      const row = [[a[0] + dx * t1 + nx, a[1] + dz * t1 + nz], [a[0] + dx * t1 - nx, a[1] + dz * t1 - nz], [a[0] + dx * t2 + nx, a[1] + dz * t2 + nz], [a[0] + dx * t2 - nx, a[1] + dz * t2 - nz]];
      for (const index of [0, 2, 1, 1, 2, 3]) { const [px, pz] = row[index]; chunk.positions.push(px, surfaceHeightAt(px, pz) + .055, pz); chunk.uv.push(px / 3.5, pz / 3.5); chunk.across.push(index % 2); }
    }
  }
  const routeChunks = [];
  for (const chunk of pathChunks.values()) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(chunk.positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(chunk.uv, 2)); geometry.setAttribute('aPathAcross', new THREE.Float32BufferAttribute(chunk.across, 1)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, pathMaterials[chunk.kind]); mesh.name = 'Wegenetz · räumlicher Abschnitt'; mesh.receiveShadow = true; root.add(mesh); routeChunks.push({ ...chunk, mesh });
  }
  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: '#827057', map: pathTexture, roughness: .91 });
  const bridgeMeshes = [];
  for (const path of map.paths.filter(p => p.kind === 'bridge')) {
    const pieces = [], transform = new THREE.Object3D();
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), count = Math.ceil(length / .8), rotation = Math.atan2(dx, dz);
      for (let board = 0; board < count; board++) {
        const t = (board + .5) / count, x = a[0] + dx * t, z = a[1] + dz * t;
        transform.position.set(x, (spatial.bridgeAt(x, z)?.height ?? surfaceHeightAt(x, z)) - .07, z); transform.rotation.set(0, rotation, 0); transform.updateMatrix();
        const plank = new THREE.BoxGeometry(path.width, .14, length / count - .025); plank.applyMatrix4(transform.matrix); pieces.push(plank);
      }
    }
    if (pieces.length) { const geometry = mergeGeometries(pieces); pieces.forEach(p => p.dispose()); const mesh = new THREE.Mesh(geometry, bridgeMaterial); mesh.name = `${path.name} · begehbare Holzbrücke`; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); bridgeMeshes.push({ mesh, x: path.points[0][0], z: path.points[0][1] }); }
  }
  const objects = await createWorldObjectRenderer(root, { map, heightAt: surfaceHeightAt, groundHeightAt: surfaceHeightAt, colorAt: spatial.colorAt, biomeAt: spatial.biomeAt, quality, chunkSize: CHUNK });
  const meadowGround = createMeadowGround(root, { map, heightAt: surfaceHeightAt, colorAt: spatial.colorAt, spatial, quality });
  const snowCover = createSnowCover(root, { map, heightAt: surfaceHeightAt, spatial, quality });
  const materialSet = new Set(); root.traverse(child => { if (child.material) for (const material of Array.isArray(child.material) ? child.material : [child.material]) materialSet.add(material); });
  for (const material of materialSet) {
    if (!material.isMeshStandardMaterial || material.userData.generatedZoneTint) continue;
    material.userData.generatedZoneTint = true;
    const original = material.onBeforeCompile, key = material.customProgramCacheKey?.call(material) ?? '';
    material.onBeforeCompile = shader => {
      original?.(shader); shader.uniforms.uGeneratedRadius = radiusUniform; shader.uniforms.uGeneratedCenter = centerUniform; shader.uniforms.uGeneratedCloudTime = timeUniform;
      shader.vertexShader = `varying vec3 vGeneratedWorld;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvec4 generatedPosition = vec4(transformed, 1.);\n#ifdef USE_INSTANCING\ngeneratedPosition = instanceMatrix * generatedPosition;\n#endif\nvGeneratedWorld = (modelMatrix * generatedPosition).xyz;`);
      shader.fragmentShader = `${CLOUD_SHADOW_GLSL}\nuniform float uGeneratedRadius; uniform vec2 uGeneratedCenter; varying vec3 vGeneratedWorld;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `gl_FragColor.rgb *= generatedCloudLight(vGeneratedWorld.xz); float generatedMist = smoothstep(uGeneratedRadius, uGeneratedRadius + 18., distance(vGeneratedWorld.xz,uGeneratedCenter)); gl_FragColor.rgb *= mix(vec3(1.), vec3(.40,.31,.54), generatedMist);\n#include <dithering_fragment>`);
    };
    material.customProgramCacheKey = () => `${key}|generated-world-zone-cloud-2`;
  }
  function heightAt(x, z) { return objects.heightAtHouse(x, z) ?? spatial.bridgeAt(x, z)?.height ?? surfaceHeightAt(x, z); }
  const spawn = map.gameplay?.spawnPosition ? { x: map.gameplay.spawnPosition[0], z: map.gameplay.spawnPosition[1] } : { x: 30, z: -42 };
  if (!spatial.isLand(spawn.x, spawn.z) || spatial.isWater(spawn.x, spawn.z)) { const candidate = map.spawnAreas.find(area => spatial.isLand(...area.position) && !spatial.isWater(...area.position)); spawn.x = candidate?.position[0] ?? map.zone.center[0]; spawn.z = candidate?.position[1] ?? map.zone.center[1]; }
  function resolveMovement(position, radius = .42) {
    objects.resolveMovement(position, radius);
    let shore = spatial.coast.closest(position.x, position.z);
    if (!spatial.isLand(position.x, position.z) || shore && shore.distance < radius + .04) {
      if (!shore) { let minimum = Infinity; for (const segment of spatial.coast.segments) { const p = projection(position.x, position.z, segment.a, segment.b); if (p.distance < minimum) { shore = p; minimum = p.distance; } } }
      if (shore) {
        const length = Math.hypot(shore.dx, shore.dz) || 1; let nx = -shore.dz / length, nz = shore.dx / length;
        if (!spatial.isLand(shore.x + nx * (radius + .1), shore.z + nz * (radius + .1))) { nx *= -1; nz *= -1; }
        position.x = shore.x + nx * (radius + .08); position.z = shore.z + nz * (radius + .08);
      }
    }
    const water = spatial.waterAt(position.x, position.z);
    if (water && water.distance < water.line.width / 2 + radius && !spatial.bridgeAt(position.x, position.z, -radius * .1)) {
      let dx = position.x - water.x, dz = position.z - water.z, length = Math.hypot(dx, dz);
      if (length < .00001) { const l = Math.hypot(water.dx, water.dz) || 1; dx = water.dz / l; dz = -water.dx / l; length = 1; }
      position.x = water.x + dx / length * (water.line.width / 2 + radius); position.z = water.z + dz / length * (water.line.width / 2 + radius);
    }
    return position;
  }
  function update(dt, time, player, zoneRadius = map.zone.initialRadius) {
    timeUniform.value = time; radiusUniform.value = zoneRadius; objects.update(dt, time, player, zoneRadius); meadowGround.update(time, player); snowCover.update(time, player);
    for (const water of waterMeshes) water.setZoneRadius(zoneRadius);
    if (time - lastCull > .3 || Math.hypot(player.x - lastCullX, player.z - lastCullZ) > 3) {
      const range = mode === 'low' ? 90 : 125; visibleTerrainChunks = 0;
      for (const chunk of terrainChunks) { chunk.mesh.visible = Math.hypot(player.x - chunk.x, player.z - chunk.z) < range + CHUNK * .9; if (chunk.mesh.visible) visibleTerrainChunks++; }
      const visiblePaint = terrainChunks.filter(chunk => chunk.paint && chunk.mesh.visible);
      paintTileBudget = TERRAIN_PAINT_BUDGET[mode] / Math.max(1, visiblePaint.length);
      paintQueue = [];
      for (const chunk of terrainChunks) if (chunk.paint) {
        if (!chunk.mesh.visible) chunk.paint.release();
        else if (!chunk.paint.matches(mode, paintTileBudget)) {
          // Release a too-large old-quality tile before allocating replacements,
          // so switching quality cannot temporarily exceed the memory budget.
          chunk.paint.release(); paintQueue.push(chunk);
        }
      }
      paintQueue.sort((a, b) => Math.hypot(player.x - a.x, player.z - a.z) - Math.hypot(player.x - b.x, player.z - b.z));
      for (const chunk of routeChunks) chunk.mesh.visible = Math.hypot(player.x - chunk.x, player.z - chunk.z) < range + CHUNK * .9;
      for (const bridge of bridgeMeshes) bridge.mesh.visible = Math.hypot(player.x - bridge.x, player.z - bridge.z) < range + 50;
      lastCull = time; lastCullX = player.x; lastCullZ = player.z;
    }
    // Nearby paint appears first. Work is spread across frames rather than
    // blocking entry into a painted district while all its tiles are baked.
    const paintStart = performance.now(); let painted = 0;
    while (paintQueue.length && painted < 2 && (!painted || performance.now() - paintStart < 6)) {
      const chunk = paintQueue.shift();
      if (chunk.mesh.visible) { chunk.paint.ensure(mode, paintTileBudget); painted++; }
    }
  }
  update(0, 0, new THREE.Vector3(spawn.x, heightAt(spawn.x, spawn.z), spawn.z));
  const generationMs = Math.round(performance.now() - started);
  return {
    root, map, visualScale: 1, spawn, bounds: map.bounds,
    worldRadius: Math.max(...map.island.points.map(p => Math.hypot(...p))),
    heightAt, groundHeightAt: surfaceHeightAt, snowSurfaceAt: snowCover.surfaceHeightAt, resolveMovement, traceProjectile: objects.traceProjectile,
    isWater: spatial.isWater, isLand: spatial.isLand, colorAt: spatial.colorAt, biomeAt: spatial.biomeAt, biomeWeightsAt: spatial.biomeWeightsAt,
    trees: objects.trees, grassPatches: objects.grassPatches, houses: objects.houses, destructibles: objects.destructibles,
    projectileObstacles: objects.projectileObstacles, importedAssets: objects.importedAssets,
    concealmentAt: objects.concealmentAt,
    destroyDestructible: objects.destroyDestructible, resetDestructibles: objects.resetDestructibles,
    update,
    setGrassInteractors(values) { meadowGround.setInteractors(values); objects.setGrassInteractors?.(values); },
    setQuality(value) { mode = value === 'low' ? 'low' : 'high'; objects.setQuality(mode); meadowGround.setQuality(mode); snowCover.setQuality(mode); lastCull = -Infinity; },
    get shelter() { return objects.shelter; },
    get stats() { return { source: 'worldmap.json', mapId: map.id, terrainChunks: terrainChunks.length, visibleTerrainChunks,
      terrainTriangles: triangles.length, generationMs, terrainArt: { ground: 'painted-woodland', mainPaths: 'irregular-grey-cobbles', trailPaths: 'earth', stoneTextureSize: 512, pathWidthFromMap: true },
      terrainPaint: { stamps: spatial.terrainPaint.length, affectedChunks: terrainChunks.filter(c => c.paint).length,
        residentChunks: terrainChunks.filter(c => c.paint?.stats.resident).length,
        textureBytes: terrainChunks.reduce((sum, c) => sum + (c.paint?.stats.bytes ?? 0), 0),
        textureBudgetBytes: TERRAIN_PAINT_BUDGET[mode], extraDrawCalls: 0,
        queuedChunks: paintQueue.length, maxBakesPerFrame: 2,
        bakedChunksTotal: terrainChunks.reduce((sum, c) => sum + (c.paint?.stats.bakeCount ?? 0), 0),
        totalBakeMs: terrainChunks.reduce((sum, c) => sum + (c.paint?.stats.totalBakeMs ?? 0), 0),
        maximumTileBakeMs: Math.max(0, ...terrainChunks.map(c => c.paint?.stats.maximumBakeMs ?? 0)),
        snowRelief: terrainChunks.some(c => c.paint?.stats.snowRelief),
        snowMicroRelief: terrainChunks.some(c => c.paint?.stats.snowMicroRelief),
        snowCrystalHighlights: terrainChunks.some(c => c.paint?.stats.snowCrystalHighlights),
        snowMaskResidentChunks: terrainChunks.filter(c => c.paint?.stats.snowMaskResident).length,
        snowVisualDepthMeters: Math.max(0, ...terrainChunks.map(c => c.paint?.stats.snowVisualDepthMeters ?? 0)),
        maximumTextureSize: mode === 'low' ? 256 : 512, changesCollisionHeight: false },
      cloudShadows: { animated: true, worldSpace: true, maximumDimming: .27 }, meadowGround: meadowGround.inspect(), snowCover: snowCover.inspect(), ...objects.stats }; },
    dispose() { meadowGround.dispose(); snowCover.dispose(); const geometries = new Set(), materials = new Set(); root.traverse(child => { if (child.geometry) geometries.add(child.geometry); if (child.material) for (const m of Array.isArray(child.material) ? child.material : [child.material]) materials.add(m); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); for (const chunk of terrainChunks) chunk.paint?.dispose(); scene.remove(root); },
  };
}
