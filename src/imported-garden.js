import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import tree01Url from '../assets/imported/rei/runtime/tree01.glb?url&inline';
import tree02Url from '../assets/imported/rei/runtime/tree02.glb?url&inline';
import bushUrl from '../assets/imported/rei/runtime/bush.glb?url&inline';
import groundUrl from '../assets/imported/rei/runtime/bed-ground.glb?url&inline';
import flowersUrl from '../assets/imported/rei/runtime/flowers.glb?url&inline';

const TREE_SITES = [
  { asset: 'tree01.glb', x: -24.5, z: 8.6, height: 5.8, yaw: .45, reserve: 3.3,
    stem: [.1719965339, 0, .1021305472], radius: .38 },
  { asset: 'tree02.glb', x: -25, z: -15.6, height: 5.2, yaw: -.32, reserve: 3.7,
    stem: [-.074421525, 0, .008194566], radius: .35 },
];
const BUSH_SITES = [
  { x: -21.5, z: 7, height: 1.12, yaw: .7 },
  { x: -6.5, z: 14.5, height: .8, yaw: -.8 },
];
const BEDS = [
  { x: -7.5, z: 12.8, width: 3.55, depth: 1.55, yaw: -.18 },
  { x: -23.3, z: 6.2, width: 3.55, depth: 1.35, yaw: .04 },
];

/** Reserve curated imported assets before scattering procedural trees and rocks. */
export function reserveImportedGarden(x, z, margin = 0) {
  return TREE_SITES.some(site => Math.hypot(x - site.x, z - site.z) < site.reserve + margin)
    || BUSH_SITES.some(site => Math.hypot(x - site.x, z - site.z) < .95 + margin)
    || BEDS.some(bed => Math.hypot(x - bed.x, z - bed.z) < 2.2 + margin);
}

function randomFactory(seed) {
  return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
}

function originalRuntimeTexture(kind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), random = randomFactory(kind === 'bark' ? 431 : kind === 'soil' ? 842 : 129);
  ctx.fillStyle = kind === 'bark' ? '#75644e' : kind === 'soil' ? '#50432f' : '#547244';
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'bark') {
    for (let i = 0; i < 210; i++) {
      const x = random() * 256, y = random() * 256;
      ctx.strokeStyle = i % 3 ? '#302d2352' : '#c0af844d'; ctx.lineWidth = .8 + random() * 3;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x - 6, y + 18, x + 7, y + 37, x - 2, y + 72 + random() * 40); ctx.stroke();
    }
  } else if (kind === 'foliage') {
    // Missing Blender shaders are replaced with original, restrained surface artwork.
    // These are leaf marks on the supplied crown volumes, not recovered GN leaves.
    for (let i = 0; i < 1500; i++) {
      const x = random() * 256, y = random() * 256, a = random() * Math.PI;
      ctx.fillStyle = ['#9dab7085', '#7b955caa', '#304b3270', '#bdc58f4d'][i % 4];
      ctx.beginPath(); ctx.ellipse(x, y, 2 + random() * 5, 1 + random() * 2, a, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < 5200; i++) {
      ctx.fillStyle = i % 2 ? '#a08b5f36' : '#171e1454';
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    // A feathered ellipse blends the imported sample plane into the existing meadow.
    ctx.globalCompositeOperation = 'destination-in';
    const fade = ctx.createRadialGradient(128, 128, 32, 128, 128, 125);
    fade.addColorStop(0, '#ffffffff'); fade.addColorStop(.70, '#ffffffed'); fade.addColorStop(1, '#ffffff00');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, 256, 256);
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  if (kind !== 'soil') { map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(kind === 'bark' ? 2 : 3, kind === 'bark' ? 2 : 3); }
  return map;
}

function triangleCount(geometry) {
  return (geometry.index?.count ?? geometry.attributes.position.count) / 3;
}

/** Imported user geometry, selectively placed rather than importing the demo layouts. */
export async function createImportedGarden(root, { heightAt = () => 0, quality = 'high' } = {}) {
  const loader = new GLTFLoader();
  const [tree01, tree02, bush, bedGround, flowers] = await Promise.all([
    tree01Url, tree02Url, bushUrl, groundUrl, flowersUrl,
  ].map(url => loader.loadAsync(url)));
  const group = new THREE.Group(); group.name = 'Rei · kuratierter Asset-Garten'; root.add(group);
  const barkMap = originalRuntimeTexture('bark'), canopyMap = originalRuntimeTexture('foliage');
  const bark = new THREE.MeshStandardMaterial({ map: barkMap, bumpMap: barkMap, bumpScale: .045, color: '#c3b08f', roughness: .95 });
  const leaf = new THREE.MeshStandardMaterial({ map: canopyMap, bumpMap: canopyMap, bumpScale: .065, color: '#d1d8bc', roughness: .94 });
  const leafLight = leaf.clone(); leafLight.color.set('#dce0b8');
  const soil = new THREE.MeshStandardMaterial({ map: originalRuntimeTexture('soil'), transparent: true,
    alphaTest: .02, depthWrite: false, side: THREE.DoubleSide, roughness: 1, color: '#b8a580' });
  const trees = [];
  const stats = { loaded: true, loadedGLBs: 5, trees: 0, bushes: 0, flowers: 0, beds: 0, drawCalls: 0, submittedTriangles: 0,
    placements: [], sources: [
      { file: 'tree01.glb', source: 'Rei_treeLeavesGN.glb', role: 'tree' },
      { file: 'tree02.glb', source: 'Rei_treeLeavesGN_samples.glb', role: 'tree' },
      { file: 'bush.glb', source: 'Rei_treeLeavesGN_samples.glb', role: 'bush' },
      { file: 'flowers.glb', source: 'Rei_flowersGN_sample.blend', role: 'flowers' },
      { file: 'bed-ground.glb', source: 'grassGN3_3_v2_Rei.glb', role: 'ground-only' },
    ], materialPalette: { bark: bark.color.getHexString(), foliage: leaf.color.getHexString(),
      foliageLight: leafLight.color.getHexString(), flowersUseVertexColors: true }, grassSourceContainsBlades: false };
  function localBounds(object) {
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object).applyMatrix4(root.matrixWorld.clone().invert());
    return { min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z } };
  }

  function placePlant(gltf, site, foliageMaterial, tree = false) {
    const container = new THREE.Group(); container.name = tree ? `Rei · ${site.asset}` : 'Rei · kleiner Strauch';
    const model = gltf.scene.clone(true); model.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = site.height / Math.max(.001, size.y);
    model.position.add(new THREE.Vector3(-center.x, -bounds.min.y, -center.z));
    model.traverse(part => {
      if (!part.isMesh) return;
      const materialName = Array.isArray(part.material) ? part.material.map(mat => mat.name).join(' ') : part.material?.name;
      const isLeaf = /leaf|leaves|foliage|crown/i.test(`${part.name} ${materialName}`);
      part.material = isLeaf ? foliageMaterial : bark;
      part.castShadow = tree || quality !== 'low'; part.receiveShadow = true;
      part.userData.importedRei = true;
      stats.drawCalls++; stats.submittedTriangles += triangleCount(part.geometry);
    });
    container.add(model); container.scale.setScalar(scale); container.rotation.y = site.yaw;
    const y = heightAt(site.x, site.z); container.position.set(site.x, y, site.z);
    group.add(container);
    const record = { asset: site.asset ?? 'bush.glb', kind: tree ? 'tree' : 'bush', x: site.x, y, groundY: y,
      z: site.z, height: site.height, bounds: localBounds(container) };
    stats.placements.push(record);
    if (tree) {
      const stem = new THREE.Vector3(...site.stem).sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
      stem.multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw);
      const collider = { x: site.x + stem.x, y, z: site.z + stem.z, radius: site.radius,
        minY: y, maxY: y + site.height, type: 'tree', asset: site.asset, imported: true };
      trees.push(collider); record.trunkCollider = { ...collider };
      stats.trees++;
    } else stats.bushes++;
  }
  placePlant(tree01, TREE_SITES[0], leaf, true);
  placePlant(tree02, TREE_SITES[1], leafLight, true);
  BUSH_SITES.forEach((site, index) => placePlant(bush, site, index ? leafLight : leaf));

  // The uploaded grass GLB contains a real ground plane, but no exported blades.
  // Its plane is useful as a small planted-bed substrate; its helper cube is omitted.
  const groundMesh = bedGround.scene.getObjectByProperty('isMesh', true);
  if (!groundMesh) throw new Error('Rei ground export does not contain its plane.');
  const groundGeometry = groundMesh.geometry.clone();
  groundMesh.updateWorldMatrix(true, false); groundGeometry.applyMatrix4(groundMesh.matrixWorld); groundGeometry.computeBoundingBox();
  const groundBounds = groundGeometry.boundingBox, groundSize = groundBounds.getSize(new THREE.Vector3());
  const groundCenter = groundBounds.getCenter(new THREE.Vector3());
  groundGeometry.translate(-groundCenter.x, -groundBounds.min.y, -groundCenter.z);
  for (const bed of BEDS) {
    const surface = new THREE.Mesh(groundGeometry, soil);
    surface.name = 'Rei grassGround · Beetuntergrund'; surface.receiveShadow = true;
    surface.scale.set(bed.width / groundSize.x, 1, bed.depth / groundSize.z);
    surface.position.set(bed.x, heightAt(bed.x, bed.z) + .032, bed.z); surface.rotation.y = bed.yaw;
    surface.userData.importedRei = true; group.add(surface);
    stats.placements.push({ asset: 'bed-ground.glb', kind: 'bed', x: bed.x, y: surface.position.y,
      groundY: heightAt(bed.x, bed.z), z: bed.z, width: bed.width, depth: bed.depth, bounds: localBounds(surface) });
    stats.beds++; stats.drawCalls++; stats.submittedTriangles += triangleCount(groundGeometry);
  }

  const names = ['Rei_Flower_White', 'Rei_Flower_Red', 'Rei_Flower_Gold'];
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true,
    roughness: .9, side: THREE.DoubleSide, forceSinglePass: true });
  flowers.scene.updateWorldMatrix(true, true);
  const flowerGeometries = names.map(name => {
    const node = flowers.scene.getObjectByName(name);
    if (!node) throw new Error(`Missing uploaded flower variant: ${name}`);
    const pieces = [];
    node.traverse(part => {
      if (!part.isMesh) return;
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      geometry.applyMatrix4(part.matrixWorld);
      const originalColor = geometry.attributes.color, colors = [];
      const tint = (Array.isArray(part.material) ? part.material[0] : part.material)?.color ?? new THREE.Color('white');
      for (let i = 0; i < geometry.attributes.position.count; i++) colors.push(
        (originalColor?.getX(i) ?? 1) * tint.r, (originalColor?.getY(i) ?? 1) * tint.g, (originalColor?.getZ(i) ?? 1) * tint.b);
      for (const attribute of Object.keys(geometry.attributes)) if (!['position', 'normal'].includes(attribute)) geometry.deleteAttribute(attribute);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      pieces.push(geometry);
    });
    const geometry = pieces.length > 1 ? mergeGeometries(pieces) : pieces[0];
    if (!geometry) throw new Error(`Empty uploaded flower variant: ${name}`);
    if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3()), minY = geometry.boundingBox.min.y;
    geometry.translate(-center.x, -minY, -center.z);
    return geometry;
  });
  const random = randomFactory(145391), matrix = new THREE.Object3D();
  const byVariant = [[], [], []];
  const avoid = [[-8, 8], [-4, 11], [-11, 6], [-10.5, 12], [-13, 2]];
  for (let bedIndex = 0; bedIndex < BEDS.length; bedIndex++) {
    const bed = BEDS[bedIndex];
    for (let i = 0; i < 12; i++) {
      let x, z, attempts = 0;
      do {
        const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * .80;
        const localX = Math.cos(angle) * r * bed.width / 2, localZ = Math.sin(angle) * r * bed.depth / 2;
        x = bed.x + Math.cos(bed.yaw) * localX + Math.sin(bed.yaw) * localZ;
        z = bed.z - Math.sin(bed.yaw) * localX + Math.cos(bed.yaw) * localZ;
      } while (avoid.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.65) && attempts++ < 50);
      byVariant[(i + bedIndex) % 3].push({ x, z, scale: .35 + random() * .22, yaw: random() * Math.PI * 2 });
    }
  }
  byVariant.forEach((placements, variant) => {
    const mesh = new THREE.InstancedMesh(flowerGeometries[variant], flowerMaterial, placements.length);
    mesh.name = `${names[variant]} · Blumenbeete`; mesh.receiveShadow = true; mesh.castShadow = quality !== 'low';
    placements.forEach((placement, index) => {
      matrix.position.set(placement.x, heightAt(placement.x, placement.z) + .043, placement.z);
      matrix.rotation.set(0, placement.yaw, 0); matrix.scale.setScalar(placement.scale); matrix.updateMatrix(); mesh.setMatrixAt(index, matrix.matrix);
      const bounds = flowerGeometries[variant].boundingBox.clone().applyMatrix4(matrix.matrix);
      stats.placements.push({ asset: 'flowers.glb', variant: names[variant], kind: 'flower', x: placement.x,
        y: matrix.position.y, z: placement.z, groundY: heightAt(placement.x, placement.z), height: placement.scale,
        bounds: { min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z }, max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z } } });
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.userData.importedRei = true; group.add(mesh);
    stats.flowers += placements.length; stats.drawCalls++;
    stats.submittedTriangles += triangleCount(flowerGeometries[variant]) * placements.length;
  });
  group.userData.importedGarden = stats;
  // The same stem objects are returned in both collections; consumers append
  // `collisions` once and use `trees` only as tree/asset metadata.
  return { group, trees, collisions: trees, stats, update() {} };
}
