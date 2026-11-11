import * as THREE from 'three';

/** The ordinary poison-style target and expanding reach circle. No animated
 * fill, runes or spell artwork: the target ring always marks the gameplay area. */
export function createStaffAimRing(radius, { range = false } = {}) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius - (range ? .055 : .07), radius, range ? 96 : 48),
    new THREE.MeshBasicMaterial({ color: '#e4ffa1', side: THREE.DoubleSide,
      transparent: true, opacity: range ? .3 : .85, depthWrite: false, depthTest: false,
      forceSinglePass: true }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = range ? 29 : 30;
  mesh.visible = false;
  return mesh;
}
