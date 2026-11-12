import * as THREE from 'three';
import cloudUrl from '../assets/effects/thunder-reference/runtime/cloud.webp?url&inline';
let pending;
/** One shared, offline-embedded texture; field resets only dispose materials. */
export function loadStormTexture() {
  return pending ??= new THREE.TextureLoader().loadAsync(cloudUrl).then(texture => {
    texture.name='Gewitter · Referenzgrafik';texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.userData.artwork='thunder-reference-v1';return texture;
  });
}
