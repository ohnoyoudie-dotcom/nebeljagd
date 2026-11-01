import * as THREE from 'three';

/** A grip belongs inside the palm, while the Hand bone is the wrist joint.
 * Derive its offset from this rig's own finger root and keep it in hand space
 * so animation, arm IK and the normalized avatar scale carry it together. */
export function createHandGripSocket(hand, fingerBase, { fraction = .68 } = {}) {
  const localPoint = new THREE.Vector3();
  let source = 'wrist';
  if (hand && fingerBase) {
    hand.updateWorldMatrix(true, true);
    fingerBase.getWorldPosition(localPoint);
    hand.worldToLocal(localPoint);
    if (localPoint.toArray().every(Number.isFinite) && localPoint.lengthSq() > 1e-10) {
      localPoint.multiplyScalar(THREE.MathUtils.clamp(Number.isFinite(fraction) ? fraction : .68, 0, 1));
      source = 'palm';
    } else localPoint.set(0, 0, 0);
  }
  return {
    source,
    getPosition(characterGroup, target = new THREE.Vector3()) {
      if (!hand) return target.set(0, 1.2, .4);
      hand.updateWorldMatrix(true, false);
      target.copy(localPoint).applyMatrix4(hand.matrixWorld);
      return characterGroup.worldToLocal(target);
    },
  };
}
