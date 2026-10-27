const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (current, target, response, dt) => target + (current - target) * Math.exp(-response * dt);

/** Presentation only: movement/collisions remain authoritative in main.js.
 * Keep the gait running during its fade-out instead of freezing a lifted foot.
 */
export function createLocomotionController({ referenceSpeed = 5.6 } = {}) {
  let smoothedSpeed = 0, walkWeight = 0, forwardLean = 0, sideLean = 0;
  const reset = () => { smoothedSpeed = walkWeight = forwardLean = sideLean = 0; };
  function update(dt, { moving = false, speed = 0, direction = 0, currentYaw = direction,
    rolling = false, dead = false } = {}) {
    const delta = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    const targetSpeed = moving && !dead && !rolling ? clamp(Number.isFinite(speed) ? speed : 0, 0, referenceSpeed * 2) : 0;
    smoothedSpeed = damp(smoothedSpeed, targetSpeed, targetSpeed > smoothedSpeed ? 15 : 11, delta);
    const targetWeight = targetSpeed > .04 ? clamp(smoothedSpeed / (referenceSpeed * .7), 0, 1) : 0;
    walkWeight = damp(walkWeight, targetWeight, targetWeight > walkWeight ? 12 : 15, delta);
    if (walkWeight < .001) walkWeight = 0;
    const difference = Math.atan2(Math.sin(direction - currentYaw), Math.cos(direction - currentYaw));
    const turn = difference * (1 - Math.exp(-18 * delta));
    const yaw = currentYaw + turn;
    const turnRate = delta > 0 ? turn / delta : 0;
    const active = !dead && !rolling;
    // A small weight shift reads clearly from above without swinging the camera
    // or moving the collision capsule. Combat IK still follows the actual hands.
    const desiredForwardLean = active ? clamp(smoothedSpeed / referenceSpeed, 0, 1) * .035 : 0;
    const desiredSideLean = active ? clamp(-turnRate * .008 * walkWeight, -.055, .055) : 0;
    forwardLean = damp(forwardLean, desiredForwardLean, 9, delta);
    sideLean = damp(sideLean, desiredSideLean, 12, delta);
    return { speed: smoothedSpeed, walkWeight, playbackSpeed: clamp(smoothedSpeed / referenceSpeed, .42, 1.65),
      yaw, turnRate, forwardLean, sideLean };
  }
  return { update, reset };
}
