import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getEnvironmentKitDefinition } from './map/environment-kit-definitions.js';
import pineHigh from '../Blender/nebeljagd_umwelt_kit_v1/assets/pine_high.glb?url&inline';
import pineYoung from '../Blender/nebeljagd_umwelt_kit_v1/assets/pine_young.glb?url&inline';
import oakGreen from '../Blender/nebeljagd_umwelt_kit_v1/assets/oak_green.glb?url&inline';
import oakAutumn from '../Blender/nebeljagd_umwelt_kit_v1/assets/oak_autumn.glb?url&inline';
import timberHouse from '../Blender/nebeljagd_umwelt_kit_v1/assets/house_timbersmall.glb?url&inline';
import tallGrass from '../Blender/nebeljagd_umwelt_kit_v1/assets/grass_tall_patch.glb?url&inline';
import rockCluster from '../Blender/nebeljagd_umwelt_kit_v1/assets/rock_cluster.glb?url&inline';
import rockSingle from '../Blender/nebeljagd_umwelt_kit_v1/assets/rock_single.glb?url&inline';
import ruinArch from '../Blender/nebeljagd_umwelt_kit_v1/assets/ruin_arch.glb?url&inline';
import stoneWall from '../Blender/nebeljagd_umwelt_kit_v1/assets/wall_stone_3m.glb?url&inline';
import woodFence from '../Blender/nebeljagd_umwelt_kit_v1/assets/fence_wood_3m.glb?url&inline';
import woodCrate from '../Blender/nebeljagd_umwelt_kit_v1/assets/crate_wood.glb?url&inline';

const urls = {
  'tree:kit-pine-high': pineHigh, 'tree:kit-pine-young': pineYoung,
  'tree:kit-oak-green': oakGreen, 'tree:kit-oak-autumn': oakAutumn,
  'house:kit-timber': timberHouse, 'grass:kit-tall': tallGrass,
  'rock:kit-cluster': rockCluster, 'rock:kit-single': rockSingle,
  'ruin:kit-arch': ruinArch, 'wall:kit-stone': stoneWall,
  'fence:kit-wood': woodFence, 'crate:kit-wood': woodCrate,
};

function clipped(polygon, axis, boundary, keepLess) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const insideA = keepLess ? a[axis] <= boundary : a[axis] >= boundary;
    const insideB = keepLess ? b[axis] <= boundary : b[axis] >= boundary;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (boundary - a[axis]) / (b[axis] - a[axis]);
      result.push(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return result;
}
function openHouseGeometry(source, name) {
  if (/roof|plaster|iron_edge/.test(name)) return null;
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const attribute = geometry.attributes.position, positions = [];
  const openingPlanes = [[0, -.65, false], [0, .65, true], [1, 2.12, true], [2, 1.35, false]];
  function append(polygon) {
    for (let i = 1; i < polygon.length - 1; i++) positions.push(...polygon[0], ...polygon[i], ...polygon[i + 1]);
  }
  for (let i = 0; i < attribute.count; i += 3) {
    let polygon = [0, 1, 2].map(j => [attribute.getX(i + j), attribute.getY(i + j), attribute.getZ(i + j)]);
    polygon = clipped(polygon, 1, 2.65, true);
    if (polygon.length < 3) continue;
    if (/stone/.test(name)) { append(polygon); continue; }
    // Subtract the doorway from existing timber bars and the closed wooden door.
    for (const [axis, boundary, keepLess] of openingPlanes) {
      append(clipped(polygon, axis, boundary, !keepLess));
      polygon = clipped(polygon, axis, boundary, keepLess);
      if (polygon.length < 3) break;
    }
  }
  geometry.dispose();
  if (!positions.length) return null;
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); result.computeVertexNormals();
  return result;
}
function paintedGeometry(source, color, transform) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.applyMatrix4(transform);
  const original = geometry.attributes.color, colors = [], tint = color ?? new THREE.Color('white');
  for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(tint.r * (original?.getX(i) ?? 1), tint.g * (original?.getY(i) ?? 1), tint.b * (original?.getZ(i) ?? 1));
  for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}
function nativeBox(x, y, z, width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth); geometry.translate(x, y, z); return geometry;
}

function removeMirroredFaces(geometry) {
  // Authored grass sheets contain front AND reversed back triangles. A
  // DoubleSide material can display one copy, preserving every blade exactly.
  const positions = geometry.attributes.position, kept = [], seen = new Set();
  for (let i = 0; i < positions.count; i += 3) {
    const vertices = [0, 1, 2].map(j => [positions.getX(i + j), positions.getY(i + j), positions.getZ(i + j)].join(','));
    const key = vertices.sort().join('|');
    if (!seen.has(key)) { seen.add(key); kept.push(i, i + 1, i + 2); }
  }
  if (kept.length === positions.count) return null;
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(kept.length * attribute.itemSize);
    kept.forEach((index, i) => { for (let n = 0; n < attribute.itemSize; n++) values[i * attribute.itemSize + n] = attribute.array[index * attribute.itemSize + n]; });
    result.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  result.computeBoundingBox(); result.computeBoundingSphere(); return result;
}

/** Existing CC0 kit files are embedded unchanged. Only variants present in the
 * saved map are parsed. Normalization matches the formerly compiled-only kit. */
export async function loadEnvironmentKit(map, { wind } = {}) {
  const wanted = [...new Set((map.objects ?? []).map(object => `${object.kind}:${object.variant}`).filter(key => urls[key]))];
  const result = new Map();
  await Promise.all(wanted.map(async key => {
    const [kind, variant] = key.split(':'), definition = getEnvironmentKitDefinition(kind, variant);
    const gltf = await new GLTFLoader().loadAsync(urls[key]); gltf.scene.updateWorldMatrix(true, true);
    const { scale, offset } = definition.normalization;
    const transform = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-offset[0], -offset[1], -offset[2]));
    const groups = new Map();
    function add(group, geometry, color) {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(paintedGeometry(geometry, color, transform));
    }
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      const source = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const geometry = kind === 'house' ? openHouseGeometry(source, mesh.name) : source;
      if (geometry) {
        const group = kind === 'tree' && /needle|leaves/.test(mesh.name) ? 'foliage' : kind === 'grass' ? (/flower/.test(mesh.name) ? 'blossom' : 'grass') : 'body';
        add(group, geometry, mesh.material.color);
      }
      if (geometry && geometry !== source) geometry.dispose(); source.dispose();
    });
    if (kind === 'house') {
      // The source plaster was a solid closed box. Rebuild its same four faces
      // as a hollow shell and a real doorway while retaining all timber detail.
      const walls = [nativeBox(-1.75, 1.39, 0, .17, 2.35, 3.08), nativeBox(1.75, 1.39, 0, .17, 2.35, 3.08),
        nativeBox(0, 1.39, -1.455, 3.5, 2.35, .17), nativeBox(-1.2, 1.39, 1.455, 1.1, 2.35, .17), nativeBox(1.2, 1.39, 1.455, 1.1, 2.35, .17),
        nativeBox(0, 2.34, 1.455, 1.3, .45, .17)];
      for (const geometry of walls) { add('body', geometry, new THREE.Color(.733333, .65098, .490196)); geometry.dispose(); }
      const floor = nativeBox(0, .21, 0, 3.3, .024, 2.9);
      add('interior', floor, new THREE.Color('#8c6747')); floor.dispose();
      const table = nativeBox(-.9, .73, -.5, .8, .12, .65);
      add('interior', table, new THREE.Color('#795238')); table.dispose();
      for (const x of [-1.2, -.6]) for (const z of [-.73, -.27]) {
        const leg = nativeBox(x, .47, z, .08, .46, .08); add('interior', leg, new THREE.Color('#59432d')); leg.dispose();
      }
    }
    const parts = [];
    for (const [group, pieces] of groups) {
      const geometry = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces);
      if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .95, side: THREE.DoubleSide, forceSinglePass: true });
      if (wind && ['foliage', 'grass', 'blossom'].includes(group)) wind.apply(material, { height: definition.height, response: group === 'grass' ? 1 : group === 'blossom' ? .3 : .65 });
      parts.push({ geometry, lowGeometry: group === 'grass' ? removeMirroredFaces(geometry) : undefined,
        material, castShadow: !['grass', 'blossom'].includes(group), kitFoliage: group === 'foliage', interior: group === 'interior', vegetationTint: group !== 'blossom' });
    }
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    });
    result.set(key, { ...definition, parts, roofRemoved: kind === 'house', embedded: true });
  }));
  return result;
}
