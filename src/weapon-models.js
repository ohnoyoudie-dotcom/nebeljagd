import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TRIPO_WEAPON_DEFINITIONS } from './map/tripo-weapon-definitions.js';

/** Runtime GLBs are already measured in metres, with the grip at the origin.
 * Templates stay immutable; instances own geometry/materials while sharing
 * immutable texture images. Resetting one dropped weapon cannot damage another.
 */
export function createWeaponModelFactory(templates = new Map(), definitions = TRIPO_WEAPON_DEFINITIONS) {
  const entries = new Map(definitions.map(definition => [definition.variant, definition]));
  const definition = (kind, variant) => {
    const entry = entries.get(variant);
    return entry?.kind === kind ? entry : null;
  };
  return {
    definition,
    has(kind, variant) { return Boolean(definition(kind, variant) && templates.has(variant)); },
    create(kind, variant) {
      const entry = definition(kind, variant), template = templates.get(variant);
      if (!entry || !template) return null;
      const model = template.clone(true), materials = new Map(), geometries = new Map();
      model.traverse(node => {
        if (!node.isMesh && !node.isLine) return;
        if (node.geometry) {
          if (!geometries.has(node.geometry)) geometries.set(node.geometry, node.geometry.clone());
          node.geometry = geometries.get(node.geometry);
          node.userData.ownsWeaponGeometry = true;
        }
        const cloneMaterial = original => {
          if (!original) return original;
          if (!materials.has(original)) materials.set(original, original.clone());
          return materials.get(original);
        };
        node.material = Array.isArray(node.material) ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
        node.userData.ownsTierMaterial = true;
        node.castShadow = true;
        node.receiveShadow = true;
      });
      const wrapper = new THREE.Group();
      wrapper.name = entry.label;
      wrapper.userData.weaponModel = {
        kind, variant, sourcePath: entry.sourcePath, runtimePath: entry.runtimePath,
        grip: [...entry.grip], tip: [...entry.tip], length: entry.length,
      };
      wrapper.add(model);
      return wrapper;
    },
  };
}

/** Only fetch models actually placed on this map. URLs are supplied by the
 * entry point so Vite can inline them into the standalone browser release.
 */
export async function loadWeaponModels(placements = [], urls = {}, { loader = new GLTFLoader() } = {}) {
  const requested = TRIPO_WEAPON_DEFINITIONS.filter(definition => placements.some(object =>
    object.kind === definition.kind && object.variant === definition.variant));
  const templates = new Map();
  await Promise.all(requested.map(async definition => {
    const url = urls[definition.variant];
    if (!url) throw new Error(`Modellpfad fehlt: ${definition.label}`);
    const gltf = await loader.loadAsync(url);
    let meshCount = 0;
    gltf.scene.traverse(node => { if (node.isMesh) meshCount++; });
    if (!meshCount) throw new Error(`Das Waffenmodell enthält keine sichtbaren Meshes: ${definition.label}`);
    templates.set(definition.variant, gltf.scene);
  }));
  return createWeaponModelFactory(templates);
}
