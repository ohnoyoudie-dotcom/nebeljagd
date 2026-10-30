import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import chestUrl from '../assets/imported/tripo-chest/runtime/chest.glb?url&inline';

/** The prepared mesh has a separate lid with its actual rear hinge. Load only
 * when this map uses it; instances share the immutable geometry and textures. */
export async function loadTripoChest(placements = []) {
  if (!placements.some(object => object.kind === 'chest' && object.variant === 'kit-tripo-chest')) return null;
  const { scene } = await new GLTFLoader().loadAsync(chestUrl);
  if (!scene.getObjectByName('chest-lid')) throw new Error('Die Tripo-Truhe enthält keinen animierbaren Deckel.');
  scene.name = 'Tripo-Truhe';
  scene.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), new THREE.MeshBasicMaterial({
    color: '#e7b34e', transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide,
  }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = .02;
  halo.name = 'chest-halo';
  scene.add(halo);
  return scene;
}
