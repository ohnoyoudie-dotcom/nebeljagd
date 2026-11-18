import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import chestUrl from '../assets/imported/tripo-chest/runtime/chest.glb?url&inline';
import rareChestUrl from '../assets/imported/tripo-rare-chest/runtime/chest.glb?url&inline';
import { textureChestInterior } from './chest-wood.js';

/** The prepared mesh has a separate lid with its actual rear hinge. Load only
 * when this map uses it; instances share the immutable geometry and textures. */
export const loadTripoChest = placements => loadChest(placements, 'kit-tripo-chest', chestUrl);
export const loadRareTripoChest = placements => loadChest(placements, 'kit-tripo-rare-chest', rareChestUrl);
async function loadChest(placements = [], variant, url) {
  if (!placements.some(object => object.kind === 'chest' && object.variant === variant)) return null;
  const { scene } = await new GLTFLoader().loadAsync(url);
  if (!scene.getObjectByName('chest-lid')) throw new Error('Die Tripo-Truhe enthält keinen animierbaren Deckel.');
  scene.name = 'Tripo-Truhe';
  textureChestInterior(scene);
  scene.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  return scene;
}
