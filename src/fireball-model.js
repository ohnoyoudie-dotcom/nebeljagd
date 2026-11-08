import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import fireballUrl from '../assets/imported/tripo-fireball/runtime/fireball.glb?url&inline';

/** The browser copy retains the upload's axes; placement never mutates its mesh. */
export async function loadFireballModel() {
  const { scene } = await new GLTFLoader().loadAsync(fireballUrl);
  const bounds = new THREE.Box3().setFromObject(scene);
  if (bounds.isEmpty()) throw new Error('Das Feuerballmodell enthält keine Geometrie.');
  const size = bounds.getSize(new THREE.Vector3());
  if (!(size.x > 0) || !Number.isFinite(size.x)) throw new Error('Ungültige Feuerball-Abmessungen.');
  let triangles = 0;
  scene.traverse(part => {
    if (!part.isMesh) return;
    if (!part.geometry.attributes.normal || !part.geometry.attributes.uv) throw new Error('Dem Feuerball fehlen Normalen oder UV-Koordinaten.');
    triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    part.castShadow = part.receiveShadow = false;
  });
  if (!triangles || triangles > 6000) throw new Error('Das Feuerballmodell überschreitet sein Geometriebudget.');
  scene.position.sub(bounds.getCenter(new THREE.Vector3()));
  const prototype = new THREE.Group();
  prototype.name = 'Fiery flame · Tripo-Feuerball';
  prototype.add(scene); prototype.scale.setScalar(.75 / size.x);
  prototype.rotation.y = -Math.PI / 2;
  prototype.userData = { triangles, nominalLength: .75, source: 'assets/inbox/fiery flame 3d model.glb',
    runtime: 'assets/imported/tripo-fireball/runtime/fireball.glb', forwardAxis: '+Z' };
  return prototype;
}
