import * as THREE from 'three';
import { createGroundGrassExclusion } from './meadow-ground.js';

const CHUNK_SIZE = 10;

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
${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
      float snowPattern = snowCoverPattern(vSnowCoverWorld.xz);
      float ridge = smoothstep(-.55,.70,snowPattern);
      vec3 snowShadeLow = vec3(.900,.935,.955);
      vec3 snowShadeHigh = vec3(1.035,1.045,1.048);
      diffuseColor.rgb *= mix(snowShadeLow, snowShadeHigh, ridge);
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (1.0 - abs(snowCoverPattern(vSnowCoverWorld.xz))) * .035, .94, 1.0);
    `);
  };
  material.customProgramCacheKey = () => 'nebeljagd-snow-cover-natural-v2';

  const excluded = createGroundGrassExclusion(map, { padding: .18 });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const chunks = new Map();
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

      const accent = hash(gx, gz, 53) < THREE.MathUtils.lerp(.06, .18, coverage);
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
        ? weight * (.105 + hash(gx, gz, 59) * .085)
        : weight * (.060 + hash(gx, gz, 59) * .065);
      const baseSize = accent ? 1.45 : 1.04;
      const width = baseSize + hash(gx, gz, 61) * (accent ? 1.00 : .56);
      const length = baseSize + hash(gx, gz, 67) * (accent ? 1.65 : .72);

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
    }),
    dispose() {
      clear();
      root.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}
