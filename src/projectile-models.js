import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import iceUrl from '../assets/imported/tripo-projectiles/runtime/ice-crystal.glb?url&inline';
import arrowUrl from '../assets/imported/tripo-projectiles/runtime/feathered-arrow.glb?url&inline';
import moonUrl from '../assets/imported/tripo-moon-projectile/runtime/crescent-moon.glb?url&inline';

// Ice and arrow point diagonally up/right in their source XY plane. Rotate that
// measured tail-to-tip axis to gameplay +Z, then size the actual oriented mesh.
const definitions = {
  ice: { url: iceUrl, source: 'ice crystal 3d model.glb', runtime: 'ice-crystal.glb',
    name: 'Eiskristall · hochgeladenes Projektil', forward: [.982, .614, 0], length: .95 },
  arrow: { url: arrowUrl, source: 'feathered spear 3d model.glb', runtime: 'feathered-arrow.glb',
    name: 'Federpfeil · hochgeladenes Projektil', forward: [.978, .655, 0], length: 1.05 },
  // The crescent lies in source XY. Point -Y along flight +Z so its sculpted
  // front faces upward; the special-weapon system spins it around world Y.
  moon: { url: moonUrl, source: 'crescent moon prop 3d model.glb', runtime: 'crescent-moon.glb',
    packageName: 'tripo-moon-projectile', name: 'Mondsichel · hochgeladenes Projektil', forward: [0, -1, 0], length: 1.1 },
};

export async function loadProjectileModels() {
  return Object.fromEntries(await Promise.all(Object.entries(definitions).map(async ([key, definition]) => {
    const { scene } = await new GLTFLoader().loadAsync(definition.url);
    let triangles = 0;
    scene.traverse(part => {
      if (!part.isMesh) return;
      if (!part.geometry.attributes.normal || !part.geometry.attributes.uv) throw new Error(`Dem Projektil ${key} fehlen Normalen oder UV-Koordinaten.`);
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
      part.castShadow = part.receiveShadow = false;
    });
    if (!(triangles > 0 && triangles <= 6000)) throw new Error(`Ungültiges Geometriebudget für ${key}.`);
    const oriented = new THREE.Group(); oriented.add(scene);
    oriented.quaternion.setFromUnitVectors(new THREE.Vector3(...definition.forward).normalize(), new THREE.Vector3(0, 0, 1));
    const bounds = new THREE.Box3().setFromObject(oriented, true);
    const size = bounds.getSize(new THREE.Vector3());
    if (!(size.z > 0) || !Number.isFinite(size.z)) throw new Error(`Ungültige Projektilabmessungen für ${key}.`);
    oriented.position.sub(bounds.getCenter(new THREE.Vector3()));
    const prototype = new THREE.Group(); prototype.add(oriented);
    prototype.name = definition.name; prototype.scale.setScalar(definition.length / size.z);
    prototype.userData = { triangles, nominalLength: definition.length, forwardAxis: '+Z',
      source: `assets/inbox/${definition.source}`, runtime: `assets/imported/${definition.packageName ?? 'tripo-projectiles'}/runtime/${definition.runtime}` };
    return [key, prototype];
  })));
}
