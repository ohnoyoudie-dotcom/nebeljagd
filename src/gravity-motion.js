const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

// Presentation only: the combat field still releases after rules.afterglow.
export const GRAVITY_BURST_SECONDS = .95;

/** One simulation clock drives the slow start, acceleration and rising orb.
 * Integrating the velocity analytically keeps pauses and coarse frames exact. */
export function gravityVortexMotion(age, rules, out = {}) {
  const elapsed = Math.max(0, age - rules.warning);
  const progress = clamp(elapsed / rules.pullDuration);
  const growth = smooth(progress);
  const burstAge = age - rules.warning - rules.pullDuration;
  const burst = burstAge >= 0 ? clamp(burstAge / GRAVITY_BURST_SECONDS) : -1;
  out.progress = progress;
  out.spinSpeed = .18 + 6.42 * progress ** 2;
  out.spin = rules.pullDuration * (.18 * progress + 2.14 * progress ** 3)
    + Math.max(0, elapsed - rules.pullDuration) * 6.6;
  out.sphereHeight = .13 + growth * 1.60;
  out.sphereRadius = (.10 + growth * .65) * (1 - .16 * smooth((progress - .94) / .06));
  out.burst = burst;
  out.shellBurst = burstAge < 0 ? -1 : clamp(burstAge / rules.afterglow);
  out.fade = burst < 0 ? 1 : 1 - smooth(burstAge / .16);
  // One outward front: its wake clears instead of filling the field with rays.
  out.burstRadius = burst < 0 ? 0 : rules.radius * (.06 + 1.04 * (1 - (1 - burst) ** 2));
  out.burstOpacity = burst < 0 ? 0 : 1 - smooth((burst - .68) / .32);
  out.flash = burst < 0 ? 0 : 1 - smooth(burstAge / .24);
  return out;
}
