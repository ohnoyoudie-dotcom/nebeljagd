import * as THREE from 'three';
import stone from '../assets/derived/waldhaus-stone/geometry.json' with { type: 'json' };

export const WALDHAUS_STONE_LENGTH = stone.length;

function clipEnd(polygon, end) {
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const insideA = a[0] <= end, insideB = b[0] <= end;
    if (insideA) output.push(a);
    if (insideA !== insideB) {
      const t = (end - a[0]) / (b[0] - a[0]);
      const cut = a.map((value, k) => value + (b[k] - value) * t);
      cut[0] = end;
      output.push(cut);
    }
  }
  return output;
}

/** The source's stone widths, heights, UVs and PBR detail stay intact. Short
 * wall ends are cut through triangles, never fitted by horizontal stretching.
 * Hidden cut ends meet the house's mortar core and the full-depth door jambs. */
export function createWaldhausStoneSegment(length) {
  if (!Number.isFinite(length) || length <= 0 || length > stone.length + 1e-6) {
    throw new RangeError('Waldhaus stone segment length must be within the source module.');
  }
  const end = -stone.length / 2 + Math.min(length, stone.length);
  const positions = [], normals = [], uvs = [];
  const vertex = index => [
    ...stone.positions.slice(index * 3, index * 3 + 3),
    ...stone.normals.slice(index * 3, index * 3 + 3),
    ...stone.uvs.slice(index * 2, index * 2 + 2),
  ];
  for (let i = 0; i < stone.indices.length; i += 3) {
    const polygon = clipEnd(stone.indices.slice(i, i + 3).map(vertex), end);
    for (let j = 1; j < polygon.length - 1; j++) {
      for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
        positions.push(v[0], v[1], v[2]);
        const magnitude = Math.hypot(v[3], v[4], v[5]) || 1;
        normals.push(v[3] / magnitude, v[4] / magnitude, v[5] / magnitude);
        uvs.push(v[6], v[7]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
