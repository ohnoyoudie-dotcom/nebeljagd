import * as THREE from 'three';

// Measured endpoints in feathered-arrow.glb's own coordinates. The shaft has
// a substantial Z component; treating the original as an XY-plane arrow
// leaves it visibly sideways even when its flight vector is correct.
export const ARROW_TAIL = Object.freeze([-.48450786, .00658792, .15933377]);
export const ARROW_TIP = Object.freeze([.48851755, .65417624, -.16916794]);
export const ARROW_LENGTH = 1.25;

export function alignArrowModel(scene) {
  const tail = new THREE.Vector3(...ARROW_TAIL), tip = new THREE.Vector3(...ARROW_TIP);
  const axis = tip.clone().sub(tail);
  const oriented = new THREE.Group();
  oriented.add(scene);
  oriented.quaternion.setFromUnitVectors(axis.clone().normalize(), new THREE.Vector3(0,0,1));
  oriented.position.copy(tail.add(tip).multiplyScalar(.5).applyQuaternion(oriented.quaternion)).negate();
  const prototype = new THREE.Group();
  prototype.add(oriented);
  const scale = ARROW_LENGTH / axis.length();
  prototype.scale.set(scale * 2.2, scale * 2.2, scale);
  return prototype;
}
