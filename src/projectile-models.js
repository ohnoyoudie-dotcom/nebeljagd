import { alignArrowModel, ARROW_LENGTH } from './arrow-alignment.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import iceUrl from '../assets/imported/tripo-projectiles/runtime/ice-crystal.glb?url&inline';
import arrowUrl from '../assets/imported/tripo-projectiles/runtime/feathered-arrow.glb?url&inline';
import moonUrl from '../assets/imported/tripo-star-moon/runtime/moon-crescent.glb?url&inline';
import gravityUrl from '../assets/imported/tripo-gravity-projectile/runtime/void-projectile.glb?url&inline';

// Ice uses its measured source direction; the arrow uses full 3D endpoints.
// Both are aligned to gameplay +Z. The crescent retains its XY
// silhouette here; its flight wrapper lays that decorated face upward.
const definitions = {
  ice: { url: iceUrl, source: 'ice crystal 3d model.glb', runtime: 'ice-crystal.glb',
    name: 'Eiskristall · hochgeladenes Projektil', forward: [.982, .614, 0], length: .95 },
  arrow: { url: arrowUrl, source: 'feathered spear 3d model.glb', runtime: 'feathered-arrow.glb',
    name: 'Federpfeil · hochgeladenes Projektil', length: ARROW_LENGTH },
  moon: { url: moonUrl, source: 'crescent moon prop 3d model.glb', runtime: 'moon-crescent.glb',
    name: 'Verzierte Silbersichel · hochgeladenes Mondprojektil', plane: 'XY', length: 1.20,
    package: 'tripo-star-moon' },
  gravity: { url: gravityUrl, source: 'Void Projektil.glb', runtime: 'void-projectile.glb',
    name: 'Void · hochgeladenes Gravitationsprojektil', forward: [0, 1, 0], length: 1.10,
    package: 'tripo-gravity-projectile' },
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
    let prototype;
    if (key === 'arrow') prototype = alignArrowModel(scene);
    else {
    const oriented = new THREE.Group(); oriented.add(scene);
    if (definition.forward) oriented.quaternion.setFromUnitVectors(new THREE.Vector3(...definition.forward).normalize(), new THREE.Vector3(0, 0, 1));
    const bounds = new THREE.Box3().setFromObject(oriented, true);
    const size = bounds.getSize(new THREE.Vector3());
    const length = definition.plane === 'XY' ? size.y : size.z;
    if (!(length > 0) || !Number.isFinite(length)) throw new Error(`Ungültige Projektilabmessungen für ${key}.`);
    oriented.position.sub(bounds.getCenter(new THREE.Vector3()));
    prototype = new THREE.Group(); prototype.add(oriented);
    prototype.scale.setScalar(definition.length / length);
    }
    prototype.name = definition.name;
    const normalizedBounds = new THREE.Box3().setFromObject(prototype, true);
    if (normalizedBounds.isEmpty() || !normalizedBounds.min.toArray().concat(normalizedBounds.max.toArray()).every(Number.isFinite)) {
      throw new Error(`Ungültige räumliche Ausrichtung für Projektil ${key}.`);
    }
    prototype.userData = { triangles, nominalLength: definition.length, forwardAxis: definition.plane ? null : '+Z',
      ...(definition.plane ? { silhouettePlane: definition.plane } : {}),
      source: `assets/inbox/${definition.source}`, runtime: `assets/imported/${definition.package ?? 'tripo-projectiles'}/runtime/${definition.runtime}` };
    return [key, prototype];
  })));
}
