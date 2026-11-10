import * as THREE from 'three';
import groundUrl from '../assets/effects/gravity-reference/runtime/ground.webp?url&inline';
import orbUrl from '../assets/effects/gravity-reference/runtime/orb.webp?url&inline';
import burstUrl from '../assets/effects/gravity-reference/runtime/burst.webp?url&inline';

let pending;
/** Load once before game readiness. Bundled data URLs also work offline.
 * Materials borrow these maps; restarting a cast or a world never reuploads them. */
export function loadGravityTextures() {
  return pending ??= (async () => {
    const loader = new THREE.TextureLoader();
    const entries = await Promise.all(Object.entries({ ground: groundUrl, orb: orbUrl, burst: burstUrl }).map(async ([role, url]) => {
      const texture = await loader.loadAsync(url);
      texture.name = 'Gravitation · Referenztextur ' + role;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
      texture.wrapS = role === 'orb' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping; texture.anisotropy = 2;
      texture.userData.artwork = 'gravity-reference-v1';
      return [role, texture];
    }));
    return Object.fromEntries(entries);
  })();
}
