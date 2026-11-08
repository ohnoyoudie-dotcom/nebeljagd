import * as THREE from 'three';

/** Geometry-only stand-in for behavior tests; browser tests load the real GLB. */
export function swordPrototype() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(.14, 1.25, .08); geometry.translate(0, .4375, 0);
  root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
  return { 'kit-tripo-sword': root };
}
