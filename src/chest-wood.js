import * as THREE from 'three';

/** Small, shared walnut plank texture: grain, knots, bevels and narrow joints.
 * Generated locally; no extra asset download or per-frame texture work. */
export function createChestWoodMaterial() {
  const width = 512, height = 256, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const plank = Math.floor(y / 64), v = (y % 64) / 64, u = x / width;
    const knotX = [.23, .71, .42, .86][plank], knotY = [.46, .58, .38, .65][plank];
    const dx = (u - knotX) * 5, dy = (v - knotY) * 1.8;
    const knot = Math.exp(-(dx * dx + dy * dy) * 3.8);
    const bend = Math.sin(u * Math.PI * 4 + plank) * .022 + knot * .09;
    const grain = Math.sin((v + bend) * 120 + Math.sin(u * 17 + plank) * 1.2);
    const fine = Math.sin((v + bend) * 354 + u * 15);
    const pore = Math.sin(x * 91.7 + y * 47.3) * Math.sin(x * 13.1 - y * 7.8);
    let shade = [.98, 1.08, .91, 1.02][plank] + grain * .08 + fine * .025 + pore * .022 - knot * .26;
    if (v < .028 || v > .976) shade *= .39;
    else if (v < .057) shade += .14;
    const i = (y * width + x) * 4;
    data[i] = Math.min(255, 139 * shade); data[i + 1] = Math.min(255, 91 * shade); data[i + 2] = Math.min(255, 48 * shade); data[i + 3] = 255;
  }
  const map = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  map.name = 'Walnut planks · grain and knots'; map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: .012, roughness: .88 });
  material.name = 'Textured walnut interior';
  return material;
}

/** The imported exterior keeps its authored PBR maps. Only the separate
 * cavity and lid-cap primitives need UVs; their original cut faces have none. */
export function textureChestInterior(root) {
  let wood = null, surfaces = 0;
  const oldMaterials = new Set();
  root.traverse(node => {
    if (!node.isMesh || node.material?.name !== 'Dark walnut interior') return;
    wood ??= createChestWoodMaterial();
    oldMaterials.add(node.material);
    const original = node.geometry;
    const geometry = original.index ? original.toNonIndexed() : original.clone();
    const positions = geometry.attributes.position;
    const uv = new Float32Array(positions.count * 2);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2);
      normal.crossVectors(b.sub(a), c.sub(a)).normalize();
      const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
      for (let j = i; j < i + 3; j++) {
        const x = positions.getX(j), y = positions.getY(j), z = positions.getZ(j);
        uv[j * 2] = (ax > ay && ax > az ? z : x) / 1.4;
        uv[j * 2 + 1] = (ay >= ax && ay >= az ? z : y) / .72;
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    node.geometry = geometry; original.dispose(); node.material = wood;
    node.userData.texturedChestInterior = true; surfaces++;
  });
  for (const material of oldMaterials) material.dispose();
  return surfaces;
}
