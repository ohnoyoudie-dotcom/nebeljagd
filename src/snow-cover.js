import * as THREE from 'three';
import { createGroundGrassExclusion } from './meadow-ground.js';

const CHUNK_SIZE = 10;
const MAX_OBJECT_CAPS = 512;

function hash(x, z, salt = 0) {
  let value = Math.imul(x ^ salt, 374761393) ^ Math.imul(z + salt, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967296;
}

function snowWeight(spatial, x, z) {
  const weights = spatial.biomeWeightsAt?.(x, z);
  if (Array.isArray(weights)) return weights.find(item => item.biome === 'snow')?.weight ?? 0;
  return spatial.regionAt?.(x, z)?.biome === 'snow' ? 1 : 0;
}

function broadDrift(x, z) {
  const a = Math.sin(x * .145 + Math.sin(z * .082) * 1.9) * Math.cos(z * .118 - x * .046);
  const b = Math.sin(x * .37 + z * .19 + Math.sin(z * .16) * 1.4);
  return a * .72 + b * .28;
}

function fineDrift(x, z) {
  return Math.sin(x * 1.58 - z * .72) * .62 + Math.sin(x * 2.83 + z * 1.21) * .38;
}

function snowPatchGeometry() {
  const segments = 12;
  const rings = [
    { radius: 0, height: 1 },
    { radius: .34, height: .86 },
    { radius: .68, height: .42 },
    { radius: 1, height: .018 },
  ];
  const positions = [0.08, 1, -0.05], indices = [];
  for (let ring = 1; ring < rings.length; ring++) {
    const { radius, height } = rings[ring];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const wobble = 1 + Math.sin(angle * 3 + ring * 1.7) * .09 + Math.sin(angle * 5 - ring) * .045;
      const lean = ring === rings.length - 1 ? .10 : .045;
      positions.push(
        Math.cos(angle) * radius * wobble + Math.cos(angle * 2.2) * lean,
        height * (1 + Math.sin(angle * 2 - .7) * .045),
        Math.sin(angle) * radius * wobble + Math.sin(angle * 1.7) * lean,
      );
    }
  }
  for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + (i + 1) % segments);
  for (let ring = 1; ring < rings.length - 1; ring++) {
    const a = 1 + (ring - 1) * segments, b = a + segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(a + i, b + i, a + next, a + next, b + i, b + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A depth-writing powder layer above the snow biome.
 * Broad overlapping pillows form the base; occasional elongated instances read
 * as wind drifts. Gameplay collision stays on the original terrain. */
export function createSnowCover(root, { map, heightAt, spatial, quality = 'high' }) {
  const group = new THREE.Group();
  group.name = 'Nebeljagd · natürliche volumige Schneedecke';
  root.add(group);

  const geometry = snowPatchGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: '#edf3f4', roughness: .995, metalness: 0, vertexColors: true,
  });
  material.name = 'Nebeljagd · windgeformter Pulverschnee';
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vSnowCoverWorld;
${shader.vertexShader}`.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vSnowCoverWorld = worldPosition.xyz;`);
    shader.fragmentShader = `varying vec3 vSnowCoverWorld;
      float snowCoverPattern(vec2 p) {
        float wind = sin(dot(p, vec2(.86,.50))*1.34 + sin(dot(p,vec2(-.24,.97))*.31)*1.8);
        float ripple = sin(dot(p,vec2(.94,-.34))*3.85 + sin(p.y*.72)*.7);
        float grain = sin(p.x*8.7-p.y*6.1)*sin(p.y*7.3+p.x*3.4);
        return wind*.54 + ripple*.31 + grain*.15;
      }
      float snowCoverMicro(vec2 p) {
        float a = sin(p.x*15.7+p.y*9.2)*sin(p.y*13.9-p.x*4.8);
        float b = sin(p.x*28.1-p.y*21.4)*sin(p.y*31.7+p.x*12.3);
        return a*.68+b*.32;
      }
${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      float snowPattern = snowCoverPattern(vSnowCoverWorld.xz);
      float micro = snowCoverMicro(vSnowCoverWorld.xz);
      float ridge = smoothstep(-.55,.70,snowPattern);
      vec3 snowShadeLow = vec3(.895,.930,.953);
      vec3 snowShadeHigh = vec3(1.040,1.048,1.052);
      diffuseColor.rgb *= mix(snowShadeLow, snowShadeHigh, ridge);
      diffuseColor.rgb *= 1.0 + micro*.018;
      float crystal = pow(max(0.0, micro), 18.0) * smoothstep(.15,.85,ridge) * .025;
      diffuseColor.rgb += vec3(crystal);
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float snowMicroRough = abs(snowCoverMicro(vSnowCoverWorld.xz));
      roughnessFactor = clamp(.965 + (1.0 - abs(snowCoverPattern(vSnowCoverWorld.xz))) * .025 - snowMicroRough*.018, .935, 1.0);
    `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-snow-cover-natural-v3-microcrystals';

  const excluded = createGroundGrassExclusion(map, { padding: .18 });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const chunks = new Map();

  // Static caps and small base drifts visually tie scenery into the winter biome.
  // These are deliberately simple instanced meshes rather than duplicating or
  // modifying the original scenery materials.
  const capDefinitions = {
    rock:   { y: 1.02, sx: 1.15, sy: .11, sz: 1.02, type: 'top' },
    crate:  { y: .92,  sx: .72, sy: .075, sz: .68, type: 'top' },
    shrine: { y: 1.46, sx: .62, sy: .085, sz: .56, type: 'top' },
    mound:  { y: .34,  sx: 1.90, sy: .085, sz: 1.55, type: 'top' },
    tree:   { y: .025, sx: .55, sy: .055, sz: .48, type: 'base' },
  };
  const capItems = [];
  let treeBaseDrifts = 0;
  for (const object of map.objects ?? []) {
    const definition = capDefinitions[object.kind];
    if (!definition || !Array.isArray(object.position) || capItems.length >= MAX_OBJECT_CAPS) continue;
    const [x, z] = object.position;
    const weight = snowWeight(spatial, x, z);
    if (weight < .52) continue;
    const scale = Number.isFinite(object.scale) ? object.scale : 1;
    const seedX = Math.round(x * 10), seedZ = Math.round(z * 10);
    capItems.push({
      x, z, weight, rotation: object.rotation ?? 0,
      y: heightAt(x, z) + definition.y * scale,
      sx: definition.sx * scale * (.88 + hash(seedX, seedZ, 211) * .24),
      sy: definition.sy * scale * (.86 + hash(seedX, seedZ, 223) * .28),
      sz: definition.sz * scale * (.88 + hash(seedX, seedZ, 227) * .24),
      type: definition.type,
    });
    if (definition.type === 'base') treeBaseDrifts++;
  }
  const capMaterial = material.clone();
  capMaterial.name = 'Nebeljagd · Schneeauflagen auf Winterobjekten';
  const capMesh = new THREE.InstancedMesh(geometry, capMaterial, Math.max(1, capItems.length));
  capMesh.name = 'Schneekappen und Baumfuß-Verwehungen';
  capMesh.count = capItems.length;
  capMesh.castShadow = false;
  capMesh.receiveShadow = true;
  for (let i = 0; i < capItems.length; i++) {
    const item = capItems[i];
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, item.rotation + (hash(i, 0, 239)-.5)*.18, 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    capMesh.setMatrixAt(i, dummy.matrix);
    const cool = .965 + (hash(i, 0, 241)-.5)*.035;
    tint.setRGB(cool-.012, cool, Math.min(1,cool+.014));
    capMesh.setColorAt(i, tint);
  }
  if (capItems.length) {
    capMesh.instanceMatrix.needsUpdate = true;
    if (capMesh.instanceColor) capMesh.instanceColor.needsUpdate = true;
    capMesh.computeBoundingSphere();
    group.add(capMesh);
  }
  let mode = quality === 'low' ? 'low' : 'high';
  let frame = 0, lastCellX = Infinity, lastCellZ = Infinity, queue = [];
  let visibleChunks = 0, visibleInstances = 0, visibleDriftInstances = 0, createdChunks = 0;

  function surfaceHeightAt(x, z) {
    const weight = snowWeight(spatial, x, z);
    const broad = broadDrift(x, z);
    const fine = fineDrift(x, z);
    return heightAt(x, z) + weight * (.19 + broad * .045 + fine * .012);
  }

  function makeChunk(cx, cz) {
    const spacing = mode === 'low' ? 1.52 : 1.12;
    const cells = Math.max(3, Math.ceil(CHUNK_SIZE / spacing));
    const step = CHUNK_SIZE / cells;
    const items = [];
    let driftCount = 0;

    for (let ix = 0; ix < cells; ix++) for (let iz = 0; iz < cells; iz++) {
      const gx = cx * cells + ix, gz = cz * cells + iz;
      const x = cx * CHUNK_SIZE + (ix + .08 + hash(gx, gz, 13) * .84) * step;
      const z = cz * CHUNK_SIZE + (iz + .08 + hash(gx, gz, 29) * .84) * step;
      if (!spatial.isLand?.(x, z) || spatial.isWater?.(x, z) || excluded(x, z)) continue;
      const weight = snowWeight(spatial, x, z);
      if (weight < .34) continue;
      const coverage = THREE.MathUtils.smoothstep(weight, .34, .86);
      if (hash(gx, gz, 47) > THREE.MathUtils.lerp(.55, .995, coverage)) continue;

      const accent = hash(gx, gz, 53) < THREE.MathUtils.lerp(.10, .25, coverage);
      if (accent) driftCount++;
      items.push({ x, z, gx, gz, weight, coverage, accent });
    }

    const key = `${cx},${cz}`;
    if (!items.length) {
      chunks.set(key, { mesh: null, cx, cz, count: 0, driftCount: 0, touched: frame });
      return;
    }

    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = `Schneedecke ${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    const prevailingWind = .68;
    for (let i = 0; i < items.length; i++) {
      const { x, z, gx, gz, weight, coverage, accent } = items[i];
      const localDrift = broadDrift(x, z);
      const depth = accent
        ? weight * (.045 + hash(gx, gz, 59) * .050)
        : weight * (.055 + hash(gx, gz, 59) * .060);
      const baseSize = accent ? 1.08 : 1.04;
      const width = baseSize + hash(gx, gz, 61) * (accent ? .45 : .56);
      const length = accent
        ? 2.10 + hash(gx, gz, 67) * 1.55
        : baseSize + hash(gx, gz, 67) * .72;

      dummy.position.set(x, heightAt(x, z) + .003, z);
      dummy.rotation.set(0, accent
        ? prevailingWind + (hash(gx, gz, 71) - .5) * .30
        : hash(gx, gz, 71) * Math.PI * 2, 0);
      dummy.scale.set(width, depth * (1 + localDrift * .20), length);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const variation = (hash(gx, gz, 83) - .5) * .045 + localDrift * .018;
      const edgeBlue = (1 - coverage) * .015;
      tint.setRGB(
        THREE.MathUtils.clamp(.955 + variation - edgeBlue, .89, 1),
        THREE.MathUtils.clamp(.975 + variation * .62, .91, 1),
        THREE.MathUtils.clamp(.992 + variation * .42, .93, 1),
      );
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    chunks.set(key, { mesh, cx, cz, count: items.length, driftCount, touched: frame });
    createdChunks++;
  }

  function clear() {
    for (const chunk of chunks.values()) if (chunk.mesh) group.remove(chunk.mesh);
    chunks.clear();
    queue = [];
    lastCellX = lastCellZ = Infinity;
  }

  function update(_time, player) {
    frame++;
    const radius = mode === 'low' ? 24 : 36;
    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    if (cx !== lastCellX || cz !== lastCellZ) {
      queue = [];
      const range = Math.ceil(radius / CHUNK_SIZE) + 1;
      for (let x = cx - range; x <= cx + range; x++) for (let z = cz - range; z <= cz + range; z++) {
        const distance = Math.hypot((x + .5) * CHUNK_SIZE - player.x, (z + .5) * CHUNK_SIZE - player.z);
        if (distance < radius + CHUNK_SIZE * .8 && !chunks.has(`${x},${z}`)) queue.push({ x, z, distance });
      }
      queue.sort((a, b) => a.distance - b.distance);
      lastCellX = cx; lastCellZ = cz;
    }

    for (let i = 0, limit = frame === 1 ? 12 : 4; i < limit && queue.length; i++) {
      const next = queue.shift();
      makeChunk(next.x, next.z);
    }

    visibleChunks = 0; visibleInstances = 0; visibleDriftInstances = 0;
    for (const [key, chunk] of chunks) {
      const distance = Math.hypot((chunk.cx + .5) * CHUNK_SIZE - player.x, (chunk.cz + .5) * CHUNK_SIZE - player.z);
      const near = distance < radius + CHUNK_SIZE * .8;
      if (chunk.mesh) chunk.mesh.visible = near;
      if (near) {
        chunk.touched = frame;
        if (chunk.mesh) {
          visibleChunks++;
          visibleInstances += chunk.count;
          visibleDriftInstances += chunk.driftCount;
        }
      }
      if (distance > radius + CHUNK_SIZE * 3) {
        if (chunk.mesh) group.remove(chunk.mesh);
        chunks.delete(key);
      }
    }
  }

  return {
    update,
    surfaceHeightAt,
    weightAt(x, z) { return snowWeight(spatial, x, z); },
    setQuality(value) {
      const next = value === 'low' ? 'low' : 'high';
      if (next !== mode) { mode = next; clear(); }
    },
    inspect: () => ({
      enabled: true, quality: mode, visibleChunks, visibleInstances, visibleDriftInstances,
      cachedChunks: chunks.size, pendingChunks: queue.length, createdChunks,
      depthWriting: true, collisionIndependent: true,
      layerStyle: 'overlapping-irregular-powder-with-wind-drifts',
      minimumSnowWeight: .34, nominalSurfaceDepthMeters: .19,
      broadDriftAmplitudeMeters: .045, fineDriftAmplitudeMeters: .012,
      maximumPillowDepthMeters: .19, multiScaleSurface: true, windShading: true,
      microRelief: true, microCrystalHighlights: true,
      objectSnowCaps: capItems.filter(item => item.type === 'top').length,
      treeBaseDrifts, maximumObjectCaps: MAX_OBJECT_CAPS,
      windRidges: 'long-low-prevailing-direction',
    }),
    dispose() {
      clear();
      root.remove(group);
      geometry.dispose();
      material.dispose(); capMaterial.dispose();
    },
  };
}
