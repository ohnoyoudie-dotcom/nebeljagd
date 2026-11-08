import * as THREE from 'three';

export const SWORD_PATTERNS = Object.freeze(['forehand', 'backhand', 'overhead']);
export const SWORD_COMBO_GRACE = .9;
export const SWORD_STRIKE_START = .18;
export const SWORD_STRIKE_END = .58;

const guard = { right: [-.22, 1.22, .40], left: [.24, 1.25, .22], blade: [-.12, .38, 1], twist: 0, lean: 0 };
// All three strikes cross in front at .36, the existing melee contact time.
// Separate preparation, acceleration and recovery keep the blade attached to
// a readable body movement instead of moving a slash graphic around the player.
const poses = [
  [
    { right: [-.47, 1.42, .28], left: [.32, 1.16, .13], blade: [-.91, .53, .41], twist: -.34, lean: -.05 },
    { right: [.34, 1.08, .55], left: [.18, 1.22, .25], blade: [.92, -.30, .38], twist: .32, lean: .08 },
  ],
  [
    { right: [.35, 1.14, .42], left: [.34, 1.22, .16], blade: [.91, -.20, .40], twist: .30, lean: .04 },
    { right: [-.43, 1.50, .46], left: [.26, 1.26, .30], blade: [-.91, .45, .42], twist: -.33, lean: -.04 },
  ],
  [
    { right: [-.18, 1.72, .24], left: [.02, 1.57, .22], blade: [0, .94, .35], twist: -.08, lean: -.08 },
    { right: [-.08, 1.06, .62], left: [.04, 1.02, .50], blade: [.06, -.70, .71], twist: .08, lean: .16 },
  ],
];
const smooth = value => { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); };
function blendVector(result, from, to, amount) {
  result.set(THREE.MathUtils.lerp(from[0], to[0], amount), THREE.MathUtils.lerp(from[1], to[1], amount),
    THREE.MathUtils.lerp(from[2], to[2], amount));
}
function blendDirection(result, from, to, amount) {
  const a = Math.hypot(...from), b = Math.hypot(...to);
  const angle = Math.acos(THREE.MathUtils.clamp((from[0] * to[0] + from[1] * to[1] + from[2] * to[2]) / (a * b), -1, 1));
  const sine = Math.sin(angle);
  // Spherical interpolation keeps angular speed even as the diagonal cuts
  // cross the centre. Normalizing a straight blend accelerates there abruptly.
  const wa = sine > .0001 ? Math.sin((1 - amount) * angle) / (sine * a) : (1 - amount) / a;
  const wb = sine > .0001 ? Math.sin(amount * angle) / (sine * b) : amount / b;
  result.set(from[0] * wa + to[0] * wb, from[1] * wa + to[1] * wb, from[2] * wa + to[2] * wb).normalize();
}

export function createSwordPose() {
  return { rightHand: new THREE.Vector3(), leftHand: new THREE.Vector3(), bladeDirection: new THREE.Vector3(),
    chestTwist: 0, chestLean: 0, swordWeight: 0, swordLead: 1 };
}

/** Sample into reusable vectors; an inactive/finished swing returns exactly to guard. */
export function sampleSwordPose(index, progress, active, result) {
  const p = active ? THREE.MathUtils.clamp(progress, 0, 1) : 0;
  const [prepare, finish] = poses[index] ?? poses[0];
  let from = guard, to = prepare, amount = smooth(p / SWORD_STRIKE_START);
  if (p >= .54) { from = finish; to = guard; amount = smooth((p - .54) / .46); }
  else if (p >= SWORD_STRIKE_START) { from = prepare; to = finish; amount = smooth((p - SWORD_STRIKE_START) / .36); }
  blendVector(result.rightHand, from.right, to.right, amount);
  blendVector(result.leftHand, from.left, to.left, amount);
  blendDirection(result.bladeDirection, from.blade, to.blade, amount);
  result.chestTwist = THREE.MathUtils.lerp(from.twist, to.twist, amount);
  result.chestLean = THREE.MathUtils.lerp(from.lean, to.lean, amount);
  result.swordWeight = smooth(p / SWORD_STRIKE_START) * (1 - smooth((p - SWORD_STRIKE_END) / (1 - SWORD_STRIKE_END)));
  result.swordLead = index === 1 ? -1 : 1;
  return result;
}
