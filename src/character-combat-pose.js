import * as THREE from 'three';

const weight = (value, fallback = 0) => THREE.MathUtils.clamp(Number.isFinite(value) ? value : fallback, 0, 1);

/** Layer a reversible combat pose over the current authored animation. */
export function createCombatPoseController(group, { chest, hips, arms, legs, gripSockets }) {
  const bones = new Set([chest, hips, ...Object.values(arms).flat(), ...Object.values(legs).flat()].filter(Boolean));
  const animated = new Map([...bones].map(bone => [bone, { rotation: bone.quaternion.clone(), position: bone.position.clone() }]));
  let applied = false, castWeight = 0, swordWeight = 0, stanceWeight = 0;
  const start = new THREE.Vector3(), middle = new THREE.Vector3(), finish = new THREE.Vector3();
  const targetPoint = new THREE.Vector3(), reach = new THREE.Vector3(), bend = new THREE.Vector3();
  const preferredBend = new THREE.Vector3(), elbow = new THREE.Vector3();
  const from = new THREE.Vector3(), end = new THREE.Vector3(), worldTarget = new THREE.Vector3();
  const oldDirection = new THREE.Vector3(), newDirection = new THREE.Vector3();
  const worldRotation = new THREE.Quaternion(), parentInverse = new THREE.Quaternion(), correction = new THREE.Quaternion();
  const originalUpper = new THREE.Quaternion(), originalLower = new THREE.Quaternion();
  const hipsPoint = new THREE.Vector3();
  const grip = new THREE.Vector3(), wrist = new THREE.Vector3(), wristTarget = new THREE.Vector3(), stringTarget = new THREE.Vector3();
  const feet = Object.entries(legs).map(([side, chain]) => ({ side, chain,
    target: new THREE.Vector3(), orientation: new THREE.Quaternion() }));

  function localPosition(bone, result) {
    bone.getWorldPosition(result); return group.worldToLocal(result);
  }
  function restore() {
    if (applied) for (const [bone, original] of animated) {
      bone.quaternion.copy(original.rotation); bone.position.copy(original.position);
    }
    applied = false; castWeight = swordWeight = stanceWeight = 0;
  }
  function aimBone(bone, child, target) {
    group.updateWorldMatrix(true, true);
    bone.getWorldPosition(from); child.getWorldPosition(end);
    group.localToWorld(worldTarget.copy(target));
    oldDirection.subVectors(end, from).normalize(); newDirection.subVectors(worldTarget, from).normalize();
    correction.setFromUnitVectors(oldDirection, newDirection);
    bone.getWorldQuaternion(worldRotation); bone.parent.getWorldQuaternion(parentInverse).invert();
    bone.quaternion.copy(parentInverse.multiply(correction).multiply(worldRotation));
  }
  function solve(chain, target, pole, blend = 1, poleBlend = 1, reachMargin = .004) {
    const [upper, lower, tip] = chain;
    if (!upper || !lower || !tip || !target || blend <= 0) return;
    group.updateWorldMatrix(true, true);
    localPosition(upper, start); localPosition(lower, middle); localPosition(tip, finish);
    originalUpper.copy(upper.quaternion); originalLower.copy(lower.quaternion);
    const firstLength = start.distanceTo(middle), secondLength = middle.distanceTo(finish);
    if (firstLength < .001 || secondLength < .001) return;
    targetPoint.copy(target); reach.subVectors(targetPoint, start);
    const distance = THREE.MathUtils.clamp(reach.length(), .04, firstLength + secondLength - reachMargin);
    reach.normalize(); targetPoint.copy(start).addScaledVector(reach, distance);
    preferredBend.copy(pole).addScaledVector(reach, -pole.dot(reach)).normalize();
    bend.subVectors(middle, start).addScaledVector(reach, -bend.dot(reach));
    if (bend.lengthSq() < 1e-10) bend.copy(preferredBend);
    else bend.normalize().lerp(preferredBend, poleBlend).normalize();
    const along = (firstLength * firstLength - secondLength * secondLength + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));
    elbow.copy(start).addScaledVector(reach, along).addScaledVector(bend, height);
    aimBone(upper, lower, elbow); aimBone(lower, tip, targetPoint);
    // Blend rotations as well as the target: an almost-zero weight must not
    // abruptly rotate an otherwise stationary elbow into a different IK plane.
    upper.quaternion.slerp(originalUpper, 1 - blend);
    lower.quaternion.slerp(originalLower, 1 - blend);
    group.updateWorldMatrix(true, true);
  }
  const armPoles = { left: new THREE.Vector3(.7, -.55, -.12), right: new THREE.Vector3(-.7, -.55, -.12) };
  const kneePoles = { left: new THREE.Vector3(.3, 0, 1), right: new THREE.Vector3(-.1, 0, 1) };

  function solveGrip(side, target) {
    // The palm is ahead of the wrist and rotates with the IK chain. Correct
    // that offset instead of placing the wrist (and therefore the whole hand)
    // directly on the bowstring. Reuse all vectors in this short solve.
    for (let pass = 0; pass < 4; pass++) {
      localPosition(arms[side][2], wrist);
      gripSockets[side].getPosition(group, grip);
      wristTarget.copy(target).sub(grip).add(wrist);
      solve(arms[side], wristTarget, armPoles[side]);
    }
  }

  function apply(next, { walkWeight = 0 } = {}) {
    restore();
    if (!next) return;
    for (const [bone, original] of animated) {
      original.rotation.copy(bone.quaternion); original.position.copy(bone.position);
    }
    applied = true;
    castWeight = weight(next.castWeight);
    swordWeight = weight(next.swordWeight);
    stanceWeight = Math.max(castWeight, swordWeight) * (1 - THREE.MathUtils.smoothstep(weight(walkWeight), 0, .25));
    if (stanceWeight > 0 && hips && feet.every(({ chain }) => chain.every(Boolean))) {
      group.updateWorldMatrix(true, true);
      for (const foot of feet) {
        localPosition(foot.chain[2], foot.target);
        foot.chain[2].getWorldQuaternion(foot.orientation);
        const side = foot.side === 'left' ? 1 : -1;
        foot.target.x += (side > 0 ? .045 : -.055) * stanceWeight;
        const lead = swordWeight > 0 && next.swordLead === -1 ? -1 : 1;
        foot.target.z += side * (.075 + swordWeight * .035) * lead * stanceWeight;
      }
      // The source idle has almost straight knees. A small weight shift gives
      // both legs room to widen without lifting their soles off the ground.
      localPosition(hips, hipsPoint); hipsPoint.y -= (.025 + swordWeight * .02) * stanceWeight;
      group.localToWorld(hipsPoint); hips.parent.worldToLocal(hipsPoint); hips.position.copy(hipsPoint);
      for (const foot of feet) {
        solve(foot.chain, foot.target, kneePoles[foot.side], 1, stanceWeight, .000001);
        const ankle = foot.chain[2];
        ankle.parent.getWorldQuaternion(parentInverse).invert();
        ankle.quaternion.copy(parentInverse.multiply(foot.orientation));
      }
    }
    if (chest) {
      chest.rotation.y += Number.isFinite(next.chestTwist) ? next.chestTwist : 0;
      chest.rotation.x += Number.isFinite(next.chestLean) ? THREE.MathUtils.clamp(next.chestLean, -.2, .2) : 0;
    }
    if (next.weapon === 'bow' && next.bowStringOffset && gripSockets?.left && gripSockets?.right) {
      solveGrip('left', next.leftHand);
      gripSockets.left.getPosition(group, stringTarget).add(next.bowStringOffset);
      solveGrip('right', stringTarget);
    } else {
      solve(arms.left, next.leftHand, armPoles.left, weight(next.leftHandWeight, 1));
      solve(arms.right, next.rightHand, armPoles.right);
    }
    group.updateWorldMatrix(true, true);
  }
  function inspect() {
    group.updateWorldMatrix(true, true);
    const point = bone => {
      if (!bone) return null;
      const p = localPosition(bone, new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z };
    };
    return { castWeight, swordWeight, stanceWeight,
      leftArm: { shoulder: point(arms.left[0]), elbow: point(arms.left[1]), hand: point(arms.left[2]) },
      rightArm: { shoulder: point(arms.right[0]), elbow: point(arms.right[1]), hand: point(arms.right[2]) },
      feet: { left: point(legs.left[2]), right: point(legs.right[2]) }, hips: point(hips) };
  }
  return { apply, restore, inspect };
}
