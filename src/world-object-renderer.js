import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createVegetation } from './vegetation.js';
import { createHouses } from './houses.js';
import { createCollisionIndex } from './collision.js';
import { createWeatheredStone } from './stone-art.js';
import { createHidingGrassGeometry, hidingGrassDetail, HIDING_GRASS_STYLE } from './hiding-grass.js';
import { createMoundPrototype } from './overgrown-mounds.js';
import { createVegetationWind } from './vegetation-wind.js';
import { buildVegetationPatch, buildKitGrassPatch, vegetationInstanceTint, vegetationTint, MAX_GRASS_INSTANCES, MAX_KIT_GRASS_INSTANCES } from './vegetation-patches.js';
import { vegetationSettings } from './map/landscape.js';
import { loadEnvironmentKit } from './environment-kit.js';
import { TRIPO_CHEST_MOVEMENT_WALLS } from './map/tripo-prop-definitions.js';
import { grassBiomeProfile } from './meadow-ground.js';
import tree01Url from '../assets/imported/rei/runtime/tree01.glb?url&inline';
import tree02Url from '../assets/imported/rei/runtime/tree02.glb?url&inline';
import bushUrl from '../assets/imported/rei/runtime/bush.glb?url&inline';
import flowersUrl from '../assets/imported/rei/runtime/flowers.glb?url&inline';
import bedUrl from '../assets/imported/rei/runtime/bed-ground.glb?url&inline';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
function hashSeed(text) { let seed = 2166136261; for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return seed >>> 0; }
function randomSource(seed) { return () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; }; }
function positionHash(x, z, salt = 0) {
  return Math.abs((Math.sin(x * 12.9898 + z * 78.233 + salt) * 43758.5453) % 1);
}
function texture(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), r = randomSource(hashSeed(kind));
  ctx.fillStyle = kind === 'bark' ? '#826c53' : kind === 'soil' ? '#514935' : '#597b45'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 750; i++) {
    ctx.fillStyle = ['#c8ca8d55', '#233c2f55', '#9b9e7255'][i % 3];
    if (kind === 'bark') ctx.fillRect(r() * 128, r() * 128, .5 + r(), 7 + r() * 22);
    else { ctx.beginPath(); ctx.ellipse(r() * 128, r() * 128, .8 + r() * 3, .7 + r() * 1.2, r() * 6, 0, Math.PI * 2); ctx.fill(); }
  }
  if (kind === 'soil') {
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(64, 64, 26, 64, 64, 64); g.addColorStop(0, '#fff'); g.addColorStop(1, '#fff0'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  return map;
}
function bladeGeometry() {
  const positions = [], indices = [];
  for (let side = 0; side < 2; side++) {
    const offset = positions.length / 3;
    for (let row = 0; row <= 3; row++) {
      const y = row / 3, half = .09 * (1 - y), bend = y * y * .09;
      if (side === 0) positions.push(-half + bend, y, 0, half + bend, y, 0);
      else positions.push(0, y, -half + bend, 0, y, half + bend);
      if (row < 3) { const a = offset + row * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function boxGeometry(x, y, z, w, h, d) { const geo = new THREE.BoxGeometry(w, h, d); geo.translate(x, y, z); return geo; }
function normalizedParts(scene, targetHeight, chooseMaterial) {
  scene.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(scene), center = bounds.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(.001, bounds.max.y - bounds.min.y);
  const offset = new THREE.Vector3(center.x, bounds.min.y, center.z);
  const normalization = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-offset.x, -offset.y, -offset.z));
  const parts = [];
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrixWorld); geometry.applyMatrix4(normalization);
    parts.push({ geometry, material: chooseMaterial(mesh), castShadow: true });
  });
  return { parts, scale, offset };
}

function createGrassPrototypes(wind) {
  const result = new Map(), grassGeo = bladeGeometry();
  const tallGrassGeo = createHidingGrassGeometry(), tallGrassLowGeo = createHidingGrassGeometry({ low: true });
  for (const variant of ['short', 'tall']) {
    const material = wind.apply(new THREE.MeshStandardMaterial({ color: variant === 'tall' ? '#ffffff' : '#759552',
      vertexColors: variant === 'tall', side: THREE.DoubleSide, roughness: 1, forceSinglePass: true }),
      { interactionResponse: variant === 'tall' ? 1.15 : .9 });
    result.set(`grass:${variant}`, [{ geometry: variant === 'tall' ? tallGrassGeo : grassGeo,
      lowGeometry: variant === 'tall' ? tallGrassLowGeo : undefined, material, castShadow: false }]);
  }

  for (const biome of ['meadow', 'forest', 'heath', 'marsh', 'snow', 'dunes', 'volcanic']) {
    const profile = grassBiomeProfile(biome);
    const root = new THREE.Color(profile.detailColor ?? profile.color);
    const tip = root.clone();
    if (profile.snowy) {
      // Winter grass stays darker than the snow surface. Only a slight cold
      // lift remains toward the tip; no white-on-white blades.
      root.set('#5f7168'); tip.set('#87978f');
    } else {
      root.offsetHSL(0, -.04, -.12);
      tip.offsetHSL(0, -.03, .18);
    }
    const tallGeo = createHidingGrassGeometry({ rootColor: `#${root.getHexString()}`, tipColor: `#${tip.getHexString()}` });
    const tallLowGeo = createHidingGrassGeometry({ low: true, rootColor: `#${root.getHexString()}`, tipColor: `#${tip.getHexString()}` });
    const shortMaterial = wind.apply(new THREE.MeshStandardMaterial({
      color: profile.color, side: THREE.DoubleSide, roughness: 1, forceSinglePass: true,
    }), { interactionResponse: .9 });
    const tallMaterial = wind.apply(new THREE.MeshStandardMaterial({
      color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: 1, forceSinglePass: true,
    }), { interactionResponse: 1.15 });
    result.set(`grass:short:${biome}`, [{ geometry: grassGeo, material: shortMaterial, castShadow: false }]);
    result.set(`grass:tall:${biome}`, [{ geometry: tallGeo, lowGeometry: tallLowGeo, material: tallMaterial, castShadow: false }]);
  }
  return result;
}

function createFlowerPrototypes(flowers, material) {
  const result = new Map(); flowers.scene.updateWorldMatrix(true, true);
  for (const [variant, name] of [['rei-white', 'Rei_Flower_White'], ['rei-red', 'Rei_Flower_Red'], ['rei-gold', 'Rei_Flower_Gold']]) {
    const node = flowers.scene.getObjectByName(name);
    if (!node) throw new Error(`Fehlendes Blumenmodell ${name}`);
    const pieces = [];
    node.traverse(mesh => {
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); geo.applyMatrix4(mesh.matrixWorld);
      const original = geo.attributes.color, tint = mesh.material?.color ?? new THREE.Color('white'), colors = [];
      for (let i = 0; i < geo.attributes.position.count; i++) colors.push((original?.getX(i) ?? 1) * tint.r, (original?.getY(i) ?? 1) * tint.g, (original?.getZ(i) ?? 1) * tint.b);
      for (const key of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(key)) geo.deleteAttribute(key);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); if (!geo.attributes.normal) geo.computeVertexNormals(); pieces.push(geo);
    });
    const geo = pieces.length > 1 ? mergeGeometries(pieces) : pieces[0];
    if (pieces.length > 1) pieces.forEach(piece => piece.dispose());
    geo.computeBoundingBox(); const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()); geo.translate(-c.x, -b.min.y, -c.z);
    result.set(`flower:${variant}`, [{ geometry: geo, material, castShadow: false }]);
  }
  return result;
}

function disposeScenery(groups, prototypes, hosts = []) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  function collect(object) {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) materials.add(material);
    if (object.customDepthMaterial) materials.add(object.customDepthMaterial);
  }
  for (const group of [...groups, ...hosts]) group.traverse(collect);
  for (const parts of prototypes.values()) for (const part of parts) {
    geometries.add(part.geometry); if (part.lowGeometry) geometries.add(part.lowGeometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
  }
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(value => value.dispose());
  groups.forEach(group => group.removeFromParent());
}

/** The editor uses the same tuple generation, materials and GPU field, but
 * avoids constructing unused houses, trees and imported models on every edit. */
async function createGrassPreview(root, { map, groundHeightAt = () => 0, colorAt, quality }) {
  const group = new THREE.Group(); group.name = 'Vegetationsvorschau'; root.add(group);
  const wind = createVegetationWind(map), prototypes = createGrassPrototypes(wind), hosts = [];
  const kitModels = await loadEnvironmentKit(map, { wind });
  for (const [key, model] of kitModels) prototypes.set(key, model.parts);
  const grassPatches = [], meshes = [], flowerTufts = new Map();
  const matrix = new THREE.Object3D(), ground = new THREE.Color(), tint = new THREE.Color();
  let count = 0;
  for (const object of map.objects ?? []) {
    if (object.kind !== 'grass') continue;
    const kit = kitModels.get(`${object.kind}:${object.variant}`);
    const { patch, instances, settings, configured, renderVariant } = kit
      ? buildKitGrassPatch(object, kit, { budget: MAX_GRASS_INSTANCES - count })
      : buildVegetationPatch(object, { budget: MAX_GRASS_INSTANCES - count });
    grassPatches.push(patch); count += instances.length;
    if (!instances.length) continue;
    const entries = prototypes.get(`grass:${renderVariant}`).map(part => ({ part,
      mesh: new THREE.InstancedMesh(quality === 'low' && part.lowGeometry ? part.lowGeometry : part.geometry, part.material, instances.length) }));
    for (const [i, instance] of instances.entries()) {
      const [x, z] = instance.position, y = groundHeightAt(x, z);
      matrix.position.set(x, y + .01, z); matrix.rotation.set(0, instance.rotation, 0);
      matrix.scale.set(...instance.scale.map(v => v * object.scale)); matrix.updateMatrix();
      for (const { mesh } of entries) mesh.setMatrixAt(i, matrix.matrix);
      patch.rootHeightRange[0] = Math.min(patch.rootHeightRange[0], y); patch.rootHeightRange[1] = Math.max(patch.rootHeightRange[1], y);
      if (configured) {
        ground.set('#4e854b'); colorAt?.(x, z, ground);
        vegetationInstanceTint(settings, x, z, ground, kit ? 'tall' : renderVariant, tint);
        for (const { mesh, part } of entries) if (part.vegetationTint !== false) mesh.setColorAt(i, tint);
        if (patch.colorSamples.length < 3) patch.colorSamples.push({ position: [x, z], ground: `#${ground.getHexString()}`,
          vegetation: `#${vegetationTint(settings, x, z, ground).getHexString()}`, rootY: y });
      } else if (renderVariant === 'tall') {
        const variation = Math.abs((Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1);
        tint.setHSL(.22 + variation * .025, .12, .79 + variation * .12, THREE.SRGBColorSpace);
        for (const { mesh } of entries) mesh.setColorAt(i, tint);
      }
      if (configured && settings.type === 'flowers' && i % 24 === 0) {
        const variant = ['rei-white', 'rei-gold', 'rei-red'][i / 24 % 3], size = .38 * settings.height * object.scale;
        matrix.scale.setScalar(size); matrix.updateMatrix();
        if (!flowerTufts.has(variant)) flowerTufts.set(variant, []);
        flowerTufts.get(variant).push(matrix.matrix.clone());
      }
    }
    for (const entry of entries) {
      const { mesh } = entry;
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh); meshes.push(entry);
    }
  }
  if (flowerTufts.size) {
    const source = await new GLTFLoader().loadAsync(flowersUrl); hosts.push(source.scene);
    const material = wind.apply(new THREE.MeshStandardMaterial({ color: '#fff', vertexColors: true, side: THREE.DoubleSide, roughness: .92, forceSinglePass: true }), { response: .3, height: .55 });
    for (const [key, parts] of createFlowerPrototypes(source, material)) prototypes.set(key, parts);
    for (const [variant, transforms] of flowerTufts) {
      const part = prototypes.get(`flower:${variant}`)[0], mesh = new THREE.InstancedMesh(part.geometry, part.material, transforms.length);
      transforms.forEach((value, index) => mesh.setMatrixAt(index, value)); mesh.instanceMatrix.needsUpdate = true; group.add(mesh);
    }
  }
  let disposed = false;
  return { grassPatches, wind,
    update(dt, time) { if (!disposed) wind.update(time); },
    setQuality(value) { for (const entry of meshes) entry.mesh.geometry = value === 'low' && entry.part.lowGeometry ? entry.part.lowGeometry : entry.part.geometry; },
    dispose() { if (!disposed) { disposeScenery([group], prototypes, hosts); disposed = true; } },
    get stats() { return { previewOnly: true, totalObjects: grassPatches.length, grassPatchCount: grassPatches.length, loadedGLBs: hosts.length + kitModels.size,
      grassRendering: { totalInstances: count, maximumInstances: MAX_GRASS_INSTANCES, rootAnchored: true, wind: wind.stats } }; },
  };
}

/** Explicit object records are the only source of world props. Blades and flowers
 * within one editable patch are instanced details of that asset, not hidden map entries. */
export async function createWorldObjectRenderer(root, { map, heightAt, groundHeightAt = heightAt, colorAt, biomeAt = () => null, quality = 'high', chunkSize = 64, previewOnly = false }) {
  if (previewOnly) return createGrassPreview(root, { map, groundHeightAt, colorAt, quality });
  let mode = quality, shelter = null;
  const wind = createVegetationWind(map);
  const kitModels = await loadEnvironmentKit(map, { wind });
  const loader = new GLTFLoader();
  const [tree01, tree02, bush, flowers, bed] = await Promise.all([tree01Url, tree02Url, bushUrl, flowersUrl, bedUrl].map(url => loader.loadAsync(url)));
  const timeUniform = { value: 0 }, playerUniform = { value: new THREE.Vector3(30, 0, -42) };
  const barkMap = texture('bark'), foliageMap = texture('foliage');
  const bark = new THREE.MeshStandardMaterial({ map: barkMap, bumpMap: barkMap, bumpScale: .04, color: '#c4b18f', roughness: .95 });
  const foliage = wind.apply(new THREE.MeshStandardMaterial({ map: foliageMap, color: '#d7dfbd', roughness: .92 }), { response: .65, height: 5.8 });
  const bushFoliage = wind.apply(new THREE.MeshStandardMaterial({ map: foliageMap, color: '#d7dfbd', roughness: .92 }), { response: .5, height: 1.1 });
  const importedFlowerMat = wind.apply(new THREE.MeshStandardMaterial({ color: '#fff', vertexColors: true, side: THREE.DoubleSide, roughness: .92, forceSinglePass: true }), { response: .3, height: .55 });
  const soil = new THREE.MeshStandardMaterial({ map: texture('soil'), color: '#c2b487', transparent: true, alphaTest: .04, depthWrite: false, side: THREE.DoubleSide, roughness: 1 });
  const prototypes = new Map();
  for (const [key, model] of kitModels) prototypes.set(key, model.parts);
  const moundTemplates = new Map(['ridge', 'knoll'].map(variant => [variant, createMoundPrototype(variant)]));
  for (const [variant, prototype] of moundTemplates) prototypes.set(`mound:${variant}`, prototype.parts);
  const treeHost = new THREE.Group();
  const vegetation = createVegetation(treeHost, [{ x: 0, z: 0, scale: 1 }, { x: 0, z: 0, scale: 1 }, { x: 0, z: 0, scale: 1, fir: true }], { quality });
  for (const [i, variant] of ['oak', 'birch', 'pine'].entries()) {
    const [trunk, near, far] = vegetation.group.children.slice(i * 3, i * 3 + 3);
    wind.apply(near.material, { response: .65, height: variant === 'pine' ? 7.2 : 6.8 });
    prototypes.set(`tree:${variant}`, [{ geometry: trunk.geometry, material: trunk.material, castShadow: true }, { geometry: near.geometry, lowGeometry: far.geometry, material: near.material, castShadow: true, foliage: true }]);
  }
  const importedAssets = { loaded: true, loadedGLBs: 5 + kitModels.size, trees: 0, bushes: 0, flowers: 0, beds: 0, placements: [], sources: ['Rei_treeLeavesGN.glb', 'Rei_treeLeavesGN_samples.glb', 'Rei_flowersGN_sample.blend', 'grassGN3_3_v2_Rei.glb', ...[...kitModels.values()].map(model => `${model.asset}.glb`)], grassSourceContainsBlades: false,
    environmentKit: [...kitModels.values()].map(model => ({ id: model.id, asset: model.asset, targetHeight: model.targetHeight, height: model.height, parts: model.parts.length,
      roofRemoved: model.roofRemoved, reducedDressing: model.reducedDressing, omittedDetailMeshes: model.omittedDetailMeshes })) };
  const stems = new Map();
  for (const [variant, gltf, nativeHeight, stem] of [['rei-tree01', tree01, 5.8, [.1719965339, 0, .1021305472]], ['rei-tree02', tree02, 5.2, [-.074421525, 0, .008194566]], ['rei-bush', bush, 1.1, null]]) {
    const model = normalizedParts(gltf.scene, nativeHeight, mesh => /leaf|leaves|foliage|crown/i.test(`${mesh.name} ${mesh.material?.name}`) ? (stem ? foliage : bushFoliage) : bark);
    prototypes.set(`${stem ? 'tree' : 'bush'}:${variant}`, model.parts);
    if (stem) stems.set(variant, new THREE.Vector3(...stem).sub(model.offset).multiplyScalar(model.scale));
  }
  for (const [key, parts] of createFlowerPrototypes(flowers, importedFlowerMat)) prototypes.set(key, parts);
  const groundNode = bed.scene.getObjectByProperty('isMesh', true); groundNode.updateWorldMatrix(true, false);
  const bedGeo = groundNode.geometry.clone().applyMatrix4(groundNode.matrixWorld); bedGeo.computeBoundingBox();
  const bedSize = bedGeo.boundingBox.getSize(new THREE.Vector3()), bedCenter = bedGeo.boundingBox.getCenter(new THREE.Vector3());
  bedGeo.translate(-bedCenter.x, -bedGeo.boundingBox.min.y, -bedCenter.z); bedGeo.scale(1 / bedSize.x, 1, 1 / bedSize.z);
  prototypes.set('bed:soil', [{ geometry: bedGeo, material: soil, castShadow: false }]);
  for (const [key, parts] of createGrassPrototypes(wind)) prototypes.set(key, parts);
  const granite = createWeatheredStone('#999e8d'), basalt = createWeatheredStone('#696b66');
  const rockGeo = new THREE.IcosahedronGeometry(1, 1); rockGeo.scale(1.5, 1.15, 1.05); rockGeo.translate(0, .85, 0);
  prototypes.set('rock:granite', [{ geometry: rockGeo, material: granite, castShadow: true }]);
  prototypes.set('rock:basalt', [{ geometry: rockGeo, material: basalt, castShadow: true }]);
  const ruinParts = [boxGeometry(-5, 1.65, 0, .85, 3.3, 10), boxGeometry(5, 1.3, 0, .85, 2.6, 10), boxGeometry(0, 1.8, -5, 10, 3.6, .85), boxGeometry(-3.3, .85, 5, 3.4, 1.7, .85), boxGeometry(3.3, 1.15, 5, 3.4, 2.3, .85)];
  for (let i = 0; i < 14; i++) ruinParts.push(boxGeometry(-4.5 + i * .69, 3.55 + .25 * Math.sin(i * 2.1), -5, .57, .42, .95));
  prototypes.set('ruin:stone', [{ geometry: mergeGeometries(ruinParts), material: granite, castShadow: true }]);
  const plinth = new THREE.CylinderGeometry(1.55, 1.8, .4, 8); plinth.translate(0, .2, 0);
  const pillar = new THREE.CylinderGeometry(.4, .7, 1.1, 8); pillar.translate(0, .95, 0);
  const shrineStone = mergeGeometries([plinth, pillar]);
  const shrineCrystal = new THREE.OctahedronGeometry(.64); shrineCrystal.translate(0, 2.15, 0);
  const crystalMaterial = new THREE.MeshStandardMaterial({ color: '#bba5db', emissive: '#674b9b', emissiveIntensity: .7, roughness: .24, metalness: .2 });
  prototypes.set('shrine:magic', [{ geometry: shrineStone, material: granite, castShadow: true }, { geometry: shrineCrystal, material: crystalMaterial, castShadow: false }]);

  const chunks = new Map(), batches = new Map(), circles = [], walls = [], structures = [], trees = [], grassPatches = [], houses = [], destructibles = [], projectileObstacles = [];
  const matrix = new THREE.Object3D(), tempColor = new THREE.Color(), groundColor = new THREE.Color();
  let grassInstanceCount = 0, grassBudgetUsed = 0, kitGrassInstanceCount = 0;
  let legacyBiomeAdaptedPatches = 0, legacySuppressedGrassInstances = 0;
  function chunkFor(x, z) {
    const gx = Math.floor(x / chunkSize), gz = Math.floor(z / chunkSize), id = `${gx},${gz}`;
    if (!chunks.has(id)) { const group = new THREE.Group(); group.name = `Objekte · Sektor ${id}`; root.add(group); chunks.set(id, { id, group, x: (gx + .5) * chunkSize, z: (gz + .5) * chunkSize, count: 0 }); }
    return chunks.get(id);
  }
  function queue(key, object, position = object.position, extraScale = [1, 1, 1], rotation = object.rotation, color = null) {
    const chunk = chunkFor(position[0], position[1]);
    // Small grass batches can disappear independently of a distant 64m scenery sector.
    const grassCell = key.startsWith('grass:') ? `/${Math.floor(position[0] / 16)},${Math.floor(position[1] / 16)}` : '';
    const batchKey = `${chunk.id}/${key}${grassCell}`;
    if (!batches.has(batchKey)) batches.set(batchKey, { key, chunk, placements: [] });
    batches.get(batchKey).placements.push({ object, x: position[0], y: groundHeightAt(position[0], position[1]), z: position[1], rotation, scale: extraScale.map(v => v * object.scale), color });
  }
  function circleBody(object, radius, height, offset = null) {
    const [x, z] = object.position, y = groundHeightAt(x, z);
    const stem = offset?.clone().multiplyScalar(object.scale).applyAxisAngle(UP, object.rotation);
    const collider = { id: object.id, x: x + (stem?.x ?? 0), z: z + (stem?.z ?? 0), y, radius: radius * object.scale, minY: y, maxY: y + height * object.scale, type: object.kind, variant: object.variant, imported: object.variant.startsWith('rei-') };
    circles.push(collider); projectileObstacles.push(collider); return collider;
  }
  const houseHost = new THREE.Group();
  const templates = createHouses(houseHost, [{ x: 0, z: 0, name: 'Kräuterhaus' }, { x: 100, z: 0, name: 'Waldgasthaus' }, { x: 200, z: 0, name: 'Jägerhaus' }]);
  const houseTypes = ['herbal', 'inn', 'hunter'];
  function addStructure(object, localWalls, group, house = false) {
    const [x, z] = object.position, scale = object.scale, rotation = object.rotation, y = groundHeightAt(x, z), cos = Math.cos(rotation), sin = Math.sin(rotation);
    const toLocal = point => ({ x: (cos * (point.x - x) - sin * (point.z - z)) / scale, z: (sin * (point.x - x) + cos * (point.z - z)) / scale, y: ((point.y ?? y) - y) / scale });
    const toWorld = point => ({ x: x + scale * (cos * point.x + sin * point.z), z: z + scale * (-sin * point.x + cos * point.z), y: y + scale * (point.y ?? 0) });
    const bodies = localWalls.map((body, index) => {
      const local = { ...body, type: body.type ?? (house ? 'house-wall' : object.kind), minY: body.minY ?? 0, maxY: body.maxY ?? (house ? 4.2 : 3.6) };
      const corners = [[body.minX, body.minZ], [body.maxX, body.minZ], [body.maxX, body.maxZ], [body.minX, body.maxZ]].map(([a, b]) => toWorld({ x: a, z: b }));
      const worldBody = { id: `${object.id}-wall-${index}`, objectId: object.id, destructibleId: local.furnitureId ? `${object.id}-furniture-${local.furnitureId}` : undefined,
        type: local.type, minX: Math.min(...corners.map(p => p.x)), maxX: Math.max(...corners.map(p => p.x)), minZ: Math.min(...corners.map(p => p.z)), maxZ: Math.max(...corners.map(p => p.z)),
        minY: y + local.minY * scale, maxY: y + local.maxY * scale, rotation, oriented: true, corners };
      if (!local.movementOnly) projectileObstacles.push(worldBody);
      local.worldBody = worldBody; return local;
    });
    const index = createCollisionIndex([], bodies.filter(body => !body.movementOnly));
    const movementIndex = bodies.some(body => body.projectileOnly || body.movementOnly) ? createCollisionIndex([], bodies.filter(body => !body.projectileOnly)) : index;
    const entry = { object, x, z, y, scale, cos, sin, toLocal, toWorld, index, movementIndex, bodies, group, house };
    structures.push(entry); return entry;
  }
  for (const object of map.objects ?? []) {
    if (['heart', 'crystal', 'bow', 'sword'].includes(object.kind)) continue;
    const [x, z] = object.position, scale = object.scale, variant = object.variant;
    const kit = kitModels.get(`${object.kind}:${variant}`);
    chunkFor(x, z).count++;
    if (object.kind === 'chest' && variant === 'kit-tripo-chest') {
      addStructure(object, TRIPO_CHEST_MOVEMENT_WALLS, null);
      continue;
    }
    if (kit && object.kind === 'house') {
      const group = new THREE.Group(), roof = new THREE.Group(), frontFacade = new THREE.Group(), interior = new THREE.Group();
      group.name = `${object.name} · ${object.id}`; group.userData.visionBlockerSurface = true; roof.name = 'Dach entfernt'; roof.visible = false; interior.name = 'Fachwerkhaus · offener Innenraum';
      group.position.set(x, groundHeightAt(x, z), z); group.rotation.y = object.rotation; group.scale.setScalar(scale);
      group.add(roof, frontFacade, interior);
      for (const part of kit.parts) {
        const mesh = new THREE.Mesh(part.geometry, part.material); mesh.castShadow = part.castShadow; mesh.receiveShadow = true;
        (part.frontFacade ? frontFacade : part.interior ? interior : group).add(mesh);
      }
      chunkFor(x, z).group.add(group);
      const structure = addStructure(object, kit.walls, group, true);
      const record = { id: object.id, name: object.name, kind: 'Fachwerkhaus', x, z, y: structure.y,
        halfWidth: kit.footprint.halfWidth * scale, halfDepth: kit.footprint.halfDepth * scale,
        rotation: object.rotation, scale, floorHeight: kit.floorHeight * scale, group, roof, frontFacade, interior,
        localInterior: kit.interior, localFloorBounds: kit.floorBounds, kit: true };
      structure.record = record; houses.push(record);
      importedAssets.placements.push({ id: object.id, kind: object.kind, variant, x, z, y: structure.y, scale });
      continue;
    }
    if (object.kind === 'house') {
      const variantIndex = Math.max(0, houseTypes.indexOf(variant)), template = templates.houses[variantIndex];
      const group = template.group.clone(true); group.name = `${object.name} · ${object.id}`; group.position.set(x, groundHeightAt(x, z), z); group.rotation.y = object.rotation; group.scale.setScalar(scale); group.userData.mapObjectId = object.id; group.userData.visionBlockerSurface = true;
      chunkFor(x, z).group.add(group);
      const localWalls = templates.walls.filter(body => body.minX >= variantIndex * 100 - 12 && body.maxX <= variantIndex * 100 + 12).map(body => ({ ...body, minX: body.minX - variantIndex * 100, maxX: body.maxX - variantIndex * 100 }));
      const structure = addStructure(object, localWalls, group, true);
      const record = { id: object.id, name: object.name, kind: template.kind, x, z, y: structure.y, halfWidth: 8 * scale, halfDepth: 7 * scale, rotation: object.rotation, scale, floorHeight: .5 * scale, group, roof: group.children.find(child => child.name === template.roof.name), frontFacade: group.children.find(child => child.name === template.frontFacade.name), interior: group.children.find(child => child.name === template.interior.name) };
      structure.record = record; houses.push(record);
      for (const definition of templates.furniture.filter(item => item.houseIndex === variantIndex)) {
        const furnitureGroup = group.getObjectByName(definition.groupName);
        const bodies = structure.bodies.filter(body => body.furnitureId === definition.id);
        if (!furnitureGroup || !bodies.length) continue;
        const position = structure.toWorld({ x: definition.x, z: definition.z, y: definition.y });
        const id = `${object.id}-furniture-${definition.id}`;
        destructibles.push({ id, name: `${object.name} · ${definition.name}`, kind: 'furniture', x: position.x, z: position.z,
          y: position.y, scale, position, radius: definition.radius * scale, height: definition.height * scale,
          maxHealth: 66, health: 66, destroyed: false, structure, bodies, group: furnitureGroup, mesh: null, instanceIndex: -1, originalMatrix: null });
      }
      continue;
    }
    if (object.kind === 'flower') {
      const r = randomSource(hashSeed(object.id)), radius = object.radius ?? 1.5;
      const settings = object.vegetation ? vegetationSettings(object) : null;
      const count = Math.round(Math.max(7, Math.min(25, Math.round(radius * radius * 5))) * (settings?.density ?? 1));
      if (count) queue('bed:soil', object, object.position, [radius * 2.2, 1, radius * 1.7]);
      for (let i = 0; i < count; i++) {
        const angle = r() * Math.PI * 2, reach = Math.sqrt(r()) * radius;
        const dx = Math.cos(angle) * reach * scale, dz = Math.sin(angle) * reach * .72 * scale;
        const c = Math.cos(object.rotation), s = Math.sin(object.rotation), position = [x + c * dx + s * dz, z - s * dx + c * dz];
        const size = .4 + r() * .22;
        const bladeHeight = settings ? size * settings.height * (1 + (r() * 2 - 1) * settings.heightVariation) : size;
        queue(`flower:${variant}`, object, position, [size, bladeHeight, size], object.rotation + r() * Math.PI * 2);
      }
      importedAssets.flowers += count; if (count) importedAssets.beds++;
    } else if (object.kind === 'grass') {
      const detail = kit ? buildKitGrassPatch(object, kit, { budget: Math.min(MAX_GRASS_INSTANCES - grassBudgetUsed, (MAX_KIT_GRASS_INSTANCES - kitGrassInstanceCount) * 10) })
        : buildVegetationPatch(object, { budget: MAX_GRASS_INSTANCES - grassBudgetUsed });
      const { patch, instances, settings, configured, renderVariant } = detail;
      grassPatches.push(patch);
      grassBudgetUsed += detail.budgetCost ?? patch.instanceCount;
      if (kit) kitGrassInstanceCount += patch.instanceCount;
      const patchBiome = biomeAt?.(patch.x ?? object.position[0], patch.z ?? object.position[1]) ?? null;
      if (!configured && ['short', 'tall'].includes(renderVariant)) {
        const patchProfile = grassBiomeProfile(patchBiome);
        patch.biome = patchBiome;
        patch.biomeCoverScale = renderVariant === 'short' ? patchProfile.baseDensity : patchProfile.detailDensity;
        legacyBiomeAdaptedPatches++;
      }
      for (const [index, instance] of instances.entries()) {
        const [px, pz] = instance.position, rootY = groundHeightAt(px, pz);
        patch.rootHeightRange[0] = Math.min(patch.rootHeightRange[0], rootY);
        patch.rootHeightRange[1] = Math.max(patch.rootHeightRange[1], rootY);
        let color = null;
        const biome = biomeAt?.(px, pz) ?? patchBiome;
        const profile = grassBiomeProfile(biome);
        const adaptiveLegacy = !configured && ['short', 'tall'].includes(renderVariant);
        if (adaptiveLegacy) {
          const keep = renderVariant === 'short' ? profile.baseDensity : profile.detailDensity;
          if (positionHash(px, pz, renderVariant === 'short' ? 17.7 : 29.3) > keep) {
            legacySuppressedGrassInstances++;
            continue;
          }
        }
        const snowGrass = biome === 'snow' && ['short', 'tall'].includes(renderVariant);
        if (configured && !snowGrass) {
          groundColor.set('#4e854b'); colorAt?.(px, pz, groundColor);
          color = vegetationInstanceTint(settings, px, pz, groundColor, kit ? 'tall' : renderVariant).toArray();
          if (patch.colorSamples.length < 3) patch.colorSamples.push({ position: [px, pz], ground: `#${groundColor.getHexString()}`,
            vegetation: `#${vegetationTint(settings, px, pz, groundColor).getHexString()}`, rootY });
        }
        const grassKey = adaptiveLegacy
          ? `grass:${renderVariant}:${['meadow','forest','heath','marsh','snow','dunes','volcanic'].includes(biome) ? biome : 'meadow'}`
          : snowGrass ? `grass:${renderVariant}:snow` : `grass:${renderVariant}`;
        const scale = adaptiveLegacy
          ? [instance.scale[0], instance.scale[1] * (renderVariant === 'short' ? profile.baseHeight : profile.detailHeight), instance.scale[2]]
          : instance.scale;
        queue(grassKey, object, instance.position, scale, instance.rotation, color);
        grassInstanceCount++;
        if (configured && settings.type === 'flowers' && index % 24 === 0) {
          const flowerVariant = ['rei-white', 'rei-gold', 'rei-red'][index / 24 % 3];
          const flowerSize = .38 * settings.height;
          queue(`flower:${flowerVariant}`, object, instance.position, [flowerSize, flowerSize, flowerSize], instance.rotation);
          importedAssets.flowers++;
        }
      }
    } else {
      const key = `${object.kind}:${variant}`;
      if (prototypes.has(key)) queue(key, object);
      if (kit) {
        for (const circle of kit.circles) {
          const body = circleBody(object, circle.radius, circle.maxY, new THREE.Vector3(circle.x, 0, circle.z)); body.imported = true;
          if (object.kind === 'tree') { trees.push({ ...body, asset: `${kit.asset}.glb`, scale }); importedAssets.trees++; }
        }
        if (kit.walls.length) {
          const structure = addStructure(object, kit.walls, null);
          if (object.kind === 'crate' || kit.destructible) {
            const maxHealth = kit.destructible?.health ?? 55;
            destructibles.push({ id: object.id, name: object.name, kind: object.kind, x, z,
              y: structure.y, scale, position: { x, y: structure.y, z }, radius: (kit.destructible?.radius ?? .64) * scale, height: kit.height * scale,
              maxHealth, health: maxHealth, destroyed: false, structure, instances: [], mesh: null, instanceIndex: -1, originalMatrix: null });
          }
        }
      }
      else if (object.kind === 'tree') {
        const body = circleBody(object, variant === 'birch' ? .24 : .37, variant === 'pine' ? 7.2 : variant === 'rei-tree02' ? 5.2 : variant === 'rei-tree01' ? 5.8 : 6, stems.get(variant)); trees.push({ ...body, asset: variant.startsWith('rei-') ? `${variant.replace('rei-', '')}.glb` : undefined, scale });
        if (variant.startsWith('rei-')) importedAssets.trees++;
      }
      if (object.kind === 'bush') importedAssets.bushes++;
      if (object.kind === 'rock' && !kit) circleBody(object, 1.25, 2);
      if (object.kind === 'shrine') circleBody(object, .82, 1.7);
      if (object.kind === 'mound') {
        const prototype = moundTemplates.get(variant);
        const structure = addStructure(object, prototype.walls, null);
        structure.solidResolver = prototype.resolveMovement;
      }
      if (object.kind === 'ruin' && !kit) addStructure(object, [
        { minX: -5.425, maxX: -4.575, minZ: -5, maxZ: 5, maxY: 3.3 }, { minX: 4.575, maxX: 5.425, minZ: -5, maxZ: 5, maxY: 2.6 },
        { minX: -5, maxX: 5, minZ: -5.425, maxZ: -4.575, maxY: 3.9 }, { minX: -5, maxX: -1.6, minZ: 4.575, maxZ: 5.425, maxY: 1.7 }, { minX: 1.6, maxX: 5, minZ: 4.575, maxZ: 5.425, maxY: 2.3 },
      ], null);
    }
    if (variant.startsWith('rei-') || kit) importedAssets.placements.push({ id: object.id, kind: object.kind, variant, x, z, y: groundHeightAt(x, z), scale });
  }
  const instanced = [];
  for (const batch of batches.values()) {
    const parts = prototypes.get(batch.key);
    if (!parts) continue;
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(mode === 'low' && part.lowGeometry ? part.lowGeometry : part.geometry, part.material, batch.placements.length);
      mesh.name = `${batch.key} · ${batch.chunk.id}`; mesh.castShadow = part.castShadow; mesh.receiveShadow = true;
      mesh.userData.visionBlockerSurface = /^(tree|rock|mound|ruin|wall|fence|wagon|barrel|well):/.test(batch.key);
      for (let i = 0; i < batch.placements.length; i++) {
        const p = batch.placements[i]; matrix.position.set(p.x, p.y + (batch.key === 'bed:soil' ? .04 : .01), p.z); matrix.rotation.set(0, p.rotation, 0); matrix.scale.set(...p.scale); matrix.updateMatrix(); mesh.setMatrixAt(i, matrix.matrix);
        if (p.object.kind === 'crate' || kitModels.get(batch.key)?.destructible) {
          const destructible = destructibles.find(item => item.id === p.object.id);
          if (destructible) {
            const originalMatrix = matrix.matrix.clone();
            destructible.instances.push({ mesh, index: i, originalMatrix });
            // Preserve the existing inspect/debug fields for single-part props.
            destructible.mesh = mesh; destructible.instanceIndex = i; destructible.originalMatrix = originalMatrix;
          }
        }
        if (part.foliage) { tempColor.set('#a0b481'); mesh.setColorAt(i, tempColor); }
        if (p.color && part.vegetationTint !== false) { tempColor.fromArray(p.color); mesh.setColorAt(i, tempColor); }
        else if (batch.key === 'grass:tall') {
          const variation = (Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
          tempColor.setHSL(.22 + Math.abs(variation) * .025, .12, .79 + Math.abs(variation) * .12, THREE.SRGBColorSpace);
          mesh.setColorAt(i, tempColor);
        }
      }
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere(); batch.chunk.group.add(mesh); instanced.push({ mesh, part, chunk: batch.chunk, grass: batch.key.startsWith('grass:'), tallGrass: batch.key.startsWith('grass:tall') || batch.key.startsWith('grass:kit-tall') });
    }
  }
  const collisionIndex = createCollisionIndex(circles, walls, 8);
  const localPoint = { x: 0, y: 0, z: 0 };
  function resolveMovement(position, radius) {
    collisionIndex.resolve(position, radius);
    for (const structure of structures) {
      if (Math.abs(position.x - structure.x) > 15 * structure.scale + radius || Math.abs(position.z - structure.z) > 15 * structure.scale + radius) continue;
      Object.assign(localPoint, structure.toLocal(position));
      if (structure.solidResolver) structure.solidResolver(localPoint, radius / structure.scale);
      else structure.movementIndex.resolve(localPoint, radius / structure.scale);
      const worldPoint = structure.toWorld(localPoint); position.x = worldPoint.x; position.z = worldPoint.z;
    }
    return position;
  }
  function traceProjectile(start, end, radius = .06) {
    let best = collisionIndex.traceSegment(start, end, radius);
    for (const structure of structures) {
      const reach = 15 * structure.scale + radius;
      if (Math.max(start.x, end.x) < structure.x - reach || Math.min(start.x, end.x) > structure.x + reach || Math.max(start.z, end.z) < structure.z - reach || Math.min(start.z, end.z) > structure.z + reach) continue;
      const hit = structure.index.traceSegment(structure.toLocal(start), structure.toLocal(end), radius / structure.scale);
      if (!hit || best && hit.t >= best.t) continue;
      best = { ...hit, point: structure.toWorld(hit.point), normal: { x: structure.cos * hit.normal.x + structure.sin * hit.normal.z, z: -structure.sin * hit.normal.x + structure.cos * hit.normal.z }, collider: hit.collider.worldBody };
    }
    return best;
  }
  function destroyDestructible(id) {
    const item = destructibles.find(candidate => candidate.id === id);
    if (!item || item.destroyed) return false;
    item.destroyed = true; item.health = 0;
    for (const body of item.bodies ?? item.structure.bodies) { body.destroyed = true; body.worldBody.destroyed = true; }
    if (item.group) item.group.visible = false;
    if (item.instances?.length) {
      matrix.position.set(item.x, item.y + .01, item.z); matrix.rotation.set(0, 0, 0); matrix.scale.setScalar(0); matrix.updateMatrix();
      for (const instance of item.instances) {
        instance.mesh.setMatrixAt(instance.index, matrix.matrix); instance.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return true;
  }
  function resetDestructibles() {
    for (const item of destructibles) {
      item.destroyed = false; item.health = item.maxHealth;
      for (const body of item.bodies ?? item.structure.bodies) { body.destroyed = false; body.worldBody.destroyed = false; }
      if (item.group) item.group.visible = true;
      for (const instance of item.instances ?? []) {
        instance.mesh.setMatrixAt(instance.index, instance.originalMatrix); instance.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
  function heightAtHouse(x, z) {
    for (const structure of structures) {
      if (!structure.house) continue;
      // The measured footprint must remain covered after rotation. A fixed
      // 13 m axis check dropped the corners of the larger imported taverns.
      const reach = Math.hypot(structure.record.halfWidth, structure.record.halfDepth) + .8 * structure.scale;
      if (Math.abs(x - structure.x) > reach || Math.abs(z - structure.z) > reach) continue;
      const p = structure.toLocal({ x, z });
      if (structure.record.kit) {
        const bounds = structure.record.localFloorBounds, inside = structure.record.localInterior;
        if (p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ) return structure.y + structure.record.floorHeight;
        if (Math.abs(p.x - inside.centerX) < inside.entranceHalfWidth && p.z > bounds.maxZ && p.z < bounds.maxZ + .8) return structure.y + structure.record.floorHeight * clamp((bounds.maxZ + .8 - p.z) / .8, 0, 1);
        continue;
      }
      if (Math.abs(p.x) <= 8.15 && Math.abs(p.z) <= 7.15) return structure.y + .5 * structure.scale;
      if (Math.abs(p.x) < 2.2 && p.z > 7 && p.z < 9.1) return structure.y + .5 * structure.scale * clamp((9.1 - p.z) / 2, 0, 1);
    }
    return null;
  }
  const grassCells = new Map();
  for (const patch of grassPatches) if (patch.variant === 'tall' && patch.instanceCount > 0) {
    const r = patch.radius;
    for (let x = Math.floor((patch.x - r) / 16); x <= Math.floor((patch.x + r) / 16); x++) for (let z = Math.floor((patch.z - r) / 16); z <= Math.floor((patch.z + r) / 16); z++) { const key = `${x},${z}`; if (!grassCells.has(key)) grassCells.set(key, []); grassCells.get(key).push(patch); }
  }
  function concealmentAt(x, z) {
    let result = 0;
    for (const patch of grassCells.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? []) {
      const c = Math.cos(patch.yaw), s = Math.sin(patch.yaw), dx = x - patch.x, dz = z - patch.z;
      const distance = Math.hypot((c * dx - s * dz) / patch.radius, (s * dx + c * dz) / (patch.radius * patch.aspect));
      result = Math.max(result, clamp((1 - distance) * 5, 0, 1) * (patch.biomeCoverScale ?? 1));
    }
    return result;
  }
  let visibleChunks = 0, lastCull = -Infinity, lastPlayer = new THREE.Vector3(Infinity, 0, Infinity);
  function update(dt, time, player) {
    timeUniform.value = time; playerUniform.value.copy(player); vegetation.update(time, player); wind.update(time);
    if (time - lastCull > .3 || lastPlayer.distanceToSquared(player) > 9) {
      visibleChunks = 0;
      const range = mode === 'low' ? 90 : 115;
      for (const chunk of chunks.values()) {
        chunk.group.visible = Math.hypot(chunk.x - player.x, chunk.z - player.z) < range + chunkSize * .72;
        if (chunk.group.visible) visibleChunks++;
      }
      for (const entry of instanced) {
        if (entry.grass) {
          const detail = hidingGrassDetail(player, entry.mesh.boundingBox, mode);
          entry.mesh.visible = detail.visible;
          if (entry.part.lowGeometry) entry.mesh.geometry = detail.low ? entry.part.lowGeometry : entry.part.geometry;
        } else if (entry.part.lowGeometry) entry.mesh.geometry = mode === 'low' || Math.hypot(entry.chunk.x - player.x, entry.chunk.z - player.z) > 42 ? entry.part.lowGeometry : entry.part.geometry;
      }
      lastCull = time; lastPlayer.copy(player);
    }
    shelter = null;
    for (const structure of structures) {
      if (!structure.house) continue;
      const p = structure.toLocal(player), bounds = structure.record.localInterior;
      const inside = bounds ? p.x > bounds.minX && p.x < bounds.maxX && p.z > bounds.minZ && p.z < bounds.maxZ : Math.abs(p.x) < 7.78 && Math.abs(p.z) < 6.78;
      if (inside) shelter = structure.record.name;
      // Permanent architectural cutaway: roofs never conceal the floor plan.
      structure.record.roof.visible = false; structure.record.frontFacade.visible = !inside; structure.record.interior.visible = true;
    }
  }
  function setQuality(value) { mode = value === 'low' ? 'low' : 'high'; vegetation.setQuality(mode); lastCull = -Infinity; }
  update(0, 0, new THREE.Vector3(30, groundHeightAt(30, -42), -42));
  return { trees, grassPatches, houses, destructibles, destroyDestructible, resetDestructibles, projectileObstacles, importedAssets, resolveMovement, traceProjectile, heightAtHouse, concealmentAt, update, setQuality, wind,
    setGrassInteractors(values){ wind.setInteractors(values); },
    dispose() { disposeScenery([...chunks.values()].map(chunk => chunk.group), prototypes, [treeHost, houseHost, tree01.scene, tree02.scene, bush.scene, flowers.scene, bed.scene]); },
    get shelter() { return shelter; },
    get stats() { return { totalObjects: (map.objects ?? []).length, chunks: chunks.size, visibleChunks, instanceBatches: instanced.length, treeCount: trees.length, houseCount: houses.length, moundCount: structures.filter(structure => structure.object.kind === 'mound').length, grassPatchCount: grassPatches.length, grassRendering: { tallHeight: [2.25, 2.6], shortHeight: [.22, .42], bendsAwayFromPlayer: wind.stats.interactors > 0,
        sourceVersion: HIDING_GRASS_STYLE.sourceVersion, crossedStalksPerInstance: 4,
        totalInstances: grassInstanceCount, maximumInstances: MAX_GRASS_INSTANCES, budgetUnitsUsed: grassBudgetUsed,
        kitInstances: kitGrassInstanceCount, maximumKitInstances: MAX_KIT_GRASS_INSTANCES,
        configuredPatches: grassPatches.filter(patch => patch.settings).length,
        legacyBiomeAdaptedPatches, legacySuppressedGrassInstances,
        biomeAdaptiveLegacyGrass: true,
        budgetLimitedPatches: grassPatches.filter(patch => patch.budgetLimited).length,
        wind: wind.stats,
        crossedStalkDensityPerSquareMeter: HIDING_GRASS_STYLE.instanceDensity * 4,
        colorGradient: [HIDING_GRASS_STYLE.rootColor, HIDING_GRASS_STYLE.tipColor],
        visibleTallGrassBatches: instanced.filter(entry => entry.tallGrass && entry.mesh.visible && entry.chunk.group.visible).length,
        tallGrassTriangles: instanced.filter(entry => entry.tallGrass && entry.mesh.visible && entry.chunk.group.visible)
          .reduce((total, entry) => total + entry.mesh.count * (entry.mesh.geometry.index?.count ?? entry.mesh.geometry.attributes.position.count) / 3, 0) }, collisionBodies: projectileObstacles.length, loadedGLBs: 5 + kitModels.size,
        environmentKit: { loadedModels: kitModels.size, models: importedAssets.environmentKit, placements: importedAssets.placements.filter(item => item.variant.startsWith('kit-')).length } }; },
  };
}
