import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import swordUrl from '../assets/imported/tripo-weapons/runtime/sword.glb?url&inline';
import lavaStaffUrl from '../assets/imported/tripo-weapons/runtime/lava-staff.glb?url&inline';
import crystalStaffUrl from '../assets/imported/tripo-weapons/runtime/crystal-staff.glb?url&inline';
import { TRIPO_WEAPON_VARIANTS } from './weapons.js';

const SOURCES = {
  'kit-tripo-sword': { url: swordUrl, name: 'Schwert · Tripo' },
  'kit-tripo-lava-staff': { url: lavaStaffUrl, name: 'Lavastab · Tripo' },
  'kit-tripo-crystal-staff': { url: crystalStaffUrl, name: 'Kristallstab · Tripo' },
};

/** Prepared assets point up (+Y), with the visible grip at the origin. These
 * immutable prototypes own geometry/textures; createWeapons clones materials
 * per pickup/held visual. Inline URLs also work in the offline single-file game. */
export async function loadTripoWeapons(placements = []) {
  const variants = [...new Set(placements
    .filter(object => TRIPO_WEAPON_VARIANTS[object.variant] === (object.kind ?? object.type))
    .map(object => object.variant))];
  const prototypes = {};
  const results = await Promise.allSettled(variants.map(async variant => {
    const { scene } = await new GLTFLoader().loadAsync(SOURCES[variant].url);
    prototypes[variant] = scene;
    const bounds = new THREE.Box3().setFromObject(scene);
    if (bounds.isEmpty() || bounds.max.y <= 0 || bounds.min.y >= 0) {
      throw new Error(`Die Tripo-Waffe ${variant} enthält keinen gültigen Griffursprung.`);
    }
    scene.name = SOURCES[variant].name;
    scene.traverse(part => {
      if (!part.isMesh) return;
      part.castShadow = true;
      part.receiveShadow = true;
    });
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) { disposeTripoWeaponPrototypes(prototypes); throw failed.reason; }
  return prototypes;
}

/** Call only after every controller using these prototypes has been disposed. */
export function disposeTripoWeaponPrototypes(prototypes) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  for (const prototype of Object.values(prototypes)) prototype.traverse(part => {
    if (!part.isMesh) return;
    geometries.add(part.geometry);
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}
