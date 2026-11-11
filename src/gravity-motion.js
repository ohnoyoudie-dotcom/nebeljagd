const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** One simulation clock drives the slow start, acceleration and rising orb.
 * Integrating the velocity analytically keeps pauses and coarse frames exact. */
export function gravityVortexMotion(age, rules, out = {}) {
  const elapsed = Math.max(0, age - rules.warning);
  const progress = clamp(elapsed / rules.pullDuration);
  const growth = smooth(progress);
  const burst = age >= rules.warning + rules.pullDuration
    ? clamp((age - rules.warning - rules.pullDuration) / rules.afterglow) : -1;
  out.progress = progress;
  out.spinSpeed = .18 + 6.42 * progress ** 2;
  out.spin = rules.pullDuration * (.18 * progress + 2.14 * progress ** 3)
    + Math.max(0, elapsed - rules.pullDuration) * 6.6;
  out.sphereHeight = .13 + growth * 1.60;
  out.sphereRadius = .10 + growth * .65;
  out.burst = burst;
  out.fade = burst < 0 ? 1 : 1 - smooth(burst / .5);
  out.burstRadius = burst < 0 ? 0 : rules.radius * (.06 + 1.1 * (1 - (1 - burst) ** 3));
  // Keep the pressure front bright until it has crossed the gameplay radius.
  out.burstOpacity = burst < 0 ? 0 : 1 - smooth((burst - .75) / .25);
  return out;
}
