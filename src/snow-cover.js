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

function snowDrift(x, z) {
  return Math.sin(x * .21 + Math.sin(z * .13) * 1.7) * Math.cos(z * .18 - x * .07);
}

function snowPatchGeometry() {
  const segments = 10;
  const rings = [
    { radius: 0, height: 1 },
    { radius: .43, height: .78 },
    { radius: .76, height: .34 },
    { radius: 1, height: .025 },
  ];
  const positions = [0, 1, 0], indices = [];
  for (let ring = 1; ring < rings.length; ring++) {
    const { radius, height } = rings[ring];
    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
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

/** A real, depth-writing powder layer placed above snow-biome terrain.
 * It is visual only: collision and navigation continue using the base terrain. */
export function createSnowCover(root, { map, heightAt, spatial, quality = 'high' }) {
  const group = new THREE.Group();
  group.name = 'Nebeljagd · volumige Schneedecke';
  root.add(group);

  const geometry = snowPatchGeometry();
  const material = new THREE.MeshStandardMaterial({
    color: '#eef4f5', roughness: .99, metalness: 0, vertexColors: true,
  });
  material.name = 'Nebeljagd · matte Pulverschnee-Auflage';
  const excluded = createGroundGrassExclusion(map, { padding: .22 });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const chunks = new Map();
  let mode = quality === 'low' ? 'low' : 'high';
  let frame = 0, lastCellX = Infinity, lastCellZ = Infinity, queue = [];
  let visibleChunks = 0, visibleInstances = 0, createdChunks = 0;

  function surfaceHeightAt(x, z) {
    const weight = snowWeight(spatial, x, z);
    return heightAt(x, z) + weight * (.19 + snowDrift(x, z) * .04);
  }

  function makeChunk(cx, cz) {
    const spacing = mode === 'low' ? 1.55 : 1.08;
    const cells = Math.max(3, Math.ceil(CHUNK_SIZE / spacing));
    const step = CHUNK_SIZE / cells;
    const items = [];
    for (let ix = 0; ix < cells; ix++) for (let iz = 0; iz < cells; iz++) {
      const gx = cx * cells + ix, gz = cz * cells + iz;
      const x = cx * CHUNK_SIZE + (ix + .10 + hash(gx, gz, 13) * .80) * step;
      const z = cz * CHUNK_SIZE + (iz + .10 + hash(gx, gz, 29) * .80) * step;
      if (!spatial.isLand?.(x, z) || spatial.isWater?.(x, z) || excluded(x, z)) continue;
      const weight = snowWeight(spatial, x, z);
      if (weight < .42) continue;
      const coverage = THREE.MathUtils.smoothstep(weight, .42, .88);
      if (hash(gx, gz, 47) > THREE.MathUtils.lerp(.42, .98, coverage)) continue;
      items.push({ x, z, gx, gz, weight, coverage });
    }
    const key = `${cx},${cz}`;
    if (!items.length) {
      chunks.set(key, { mesh: null, cx, cz, count: 0, touched: frame });
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = `Schneepolster ${key}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    for (let i = 0; i < items.length; i++) {
      const { x, z, gx, gz, weight, coverage } = items[i];
      const depth = weight * (.15 + hash(gx, gz, 59) * .11);
      const width = .78 + hash(gx, gz, 61) * .46;
      const length = .78 + hash(gx, gz, 67) * .48;
      dummy.position.set(x, heightAt(x, z) + .006, z);
      dummy.rotation.set(0, hash(gx, gz, 71) * Math.PI * 2, 0);
      dummy.scale.set(width, depth, length);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const light = .965 + hash(gx, gz, 83) * .055;
      const blue = .012 + (1 - coverage) * .012;
      tint.setRGB(light - blue, light - blue * .25, Math.min(1, light + .015));
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    chunks.set(key, { mesh, cx, cz, count: items.length, touched: frame });
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
    visibleChunks = 0; visibleInstances = 0;
    for (const [key, chunk] of chunks) {
      const distance = Math.hypot((chunk.cx + .5) * CHUNK_SIZE - player.x, (chunk.cz + .5) * CHUNK_SIZE - player.z);
      const near = distance < radius + CHUNK_SIZE * .8;
      if (chunk.mesh) chunk.mesh.visible = near;
      if (near) {
        chunk.touched = frame;
        if (chunk.mesh) { visibleChunks++; visibleInstances += chunk.count; }
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
      enabled: true, quality: mode, visibleChunks, visibleInstances, cachedChunks: chunks.size,
      pendingChunks: queue.length, createdChunks, depthWriting: true, collisionIndependent: true,
      layerStyle: 'overlapping-instanced-powder-pillows', minimumSnowWeight: .42,
      nominalSurfaceDepthMeters: .19, maximumPillowDepthMeters: .26,
    }),
    dispose() {
      clear();
      root.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}
