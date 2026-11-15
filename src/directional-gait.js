import * as THREE from 'three';

/** Redirect the authored foot cycle in avatar-local space. Animation time never
 * reverses, so lift/contact phases stay continuous when the aiming angle changes.
 * This reversible layer runs before combat IK and leaves weapon grips untouched.
 */
export function createDirectionalGait(group, legs) {
  const chains = Object.values(legs).filter(chain => chain.every(Boolean));
  const bones = new Set(chains.flat());
  const saved = new Map([...bones].map(bone => [bone, bone.quaternion.clone()]));
  const point = (bone, out) => {
    bone.getWorldPosition(out);
    return group.worldToLocal(out);
  };
  group.updateWorldMatrix(true, true);
  const q = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), correction = new THREE.Quaternion();
  const start = new THREE.Vector3(), middle = new THREE.Vector3(), finish = new THREE.Vector3();
  const from = new THREE.Vector3(), to = new THREE.Vector3(), reach = new THREE.Vector3();
  const bend = new THREE.Vector3(), knee = new THREE.Vector3(), goal = new THREE.Vector3(), worldGoal = new THREE.Vector3();
  const feet = chains.map(chain => ({
    chain,
    base: point(chain[2], new THREE.Vector3()),
    flat: group.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(chain[2].getWorldQuaternion(new THREE.Quaternion())),
    rotation: new THREE.Quaternion(), target: new THREE.Vector3(),
  }));
  // The imported idle stance is not necessarily centred on the model origin.
  const stanceCenter = feet.length ? feet.reduce((sum, foot) => sum + foot.base.x, 0) / feet.length : 0;
  let applied = false, weight = 0, maxError = 0;

  function restore() {
    if (applied) for (const [bone, rotation] of saved) bone.quaternion.copy(rotation);
    applied = false; weight = 0; maxError = 0;
  }

  function aim(bone, child, target) {
    group.updateWorldMatrix(true, true);
    group.localToWorld(worldGoal.copy(target));
    bone.getWorldPosition(from); child.getWorldPosition(to);
    correction.setFromUnitVectors(to.sub(from).normalize(), worldGoal.sub(from).normalize());
    bone.getWorldQuaternion(q); bone.parent.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ.multiply(correction).multiply(q));
  }

  function apply({ gaitX = 0, gaitZ = 1, walkWeight = 0, groundOffset = 0, active = true } = {}) {
    restore();
    weight = active ? THREE.MathUtils.smoothstep(1 - gaitZ, .015, .35) * walkWeight : 0;
    if (weight < .001) return;
    for (const [bone, rotation] of saved) rotation.copy(bone.quaternion);
    applied = true;
    group.updateWorldMatrix(true, true);
    for (const foot of feet) {
      const [hip, shin, ankle] = foot.chain;
      point(hip, start); point(shin, middle); point(ankle, finish);
      ankle.getWorldQuaternion(foot.rotation);
      const stride = finish.z - foot.base.z;
      const side = Math.sign(foot.base.x - stanceCenter) || 1;
      const lateralLimit = Math.max(.05, Math.abs(foot.base.x - stanceCenter) - .04);
      const lateral = Math.tanh(stride / .22) * lateralLimit * gaitX;
      const targetX = foot.base.x + lateral;
      const targetZ = foot.base.z + stride * gaitZ * (gaitZ < 0 ? .7 : 1);
      const liftScale = 1 - .45 * Math.max(Math.abs(gaitX), Math.max(0, -gaitZ));
      goal.set(
        stanceCenter + side * Math.max(.035, side * (targetX - stanceCenter)),
        foot.base.y + groundOffset + Math.max(-.01, finish.y - foot.base.y - groundOffset) * liftScale,
        targetZ,
      );
      foot.target.copy(goal);
      const a = start.distanceTo(middle), b = middle.distanceTo(finish);
      reach.subVectors(goal, start);
      const distance = THREE.MathUtils.clamp(reach.length(), .03, a + b - .0001);
      reach.normalize(); goal.copy(start).addScaledVector(reach, distance);
      // Knees bend forward even in backpedal. Feet keep separate stance lanes.
      bend.set(side * .12 + gaitX * .15, 0, 1);
      bend.addScaledVector(reach, -bend.dot(reach)).normalize();
      const along = (a * a - b * b + distance * distance) / (2 * distance);
      const height = Math.sqrt(Math.max(0, a * a - along * along));
      knee.copy(start).addScaledVector(reach, along).addScaledVector(bend, height);
      aim(hip, shin, knee); aim(shin, ankle, goal);
      group.getWorldQuaternion(q).multiply(foot.flat);
      foot.rotation.slerp(q, weight * .8);
      ankle.parent.getWorldQuaternion(parentQ).invert();
      ankle.quaternion.copy(parentQ.multiply(foot.rotation));
      // Blend rotations as well as targets to avoid a knee-pole snap on entry.
      for (const bone of foot.chain) {
        correction.copy(bone.quaternion);
        bone.quaternion.copy(saved.get(bone)).slerp(correction, weight);
      }
      group.updateWorldMatrix(true, true);
      maxError = Math.max(maxError, point(ankle, finish).distanceTo(foot.target));
    }
  }

  return { apply, restore, get telemetry() {
    return { weight, maxError, feet: feet.map(foot => ({ target: { ...foot.target }, base: { ...foot.base } })) };
  } };
}
