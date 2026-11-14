const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** The growing footprint, brightness and damage share the simulation clock. */
export function solarEnvelope(age, rules) {
  const rise = rules.rise ?? .90, end = rules.warning + rules.duration;
  const threshold = smooth(rules.warning / rise);
  const brightness = age < end ? smooth(age / rise) : 1 - smooth((age - end) / rules.fade);
  const radiusScale = .08 + .92 * smooth(age / (rules.expansion ?? rise));
  const damageEligible = age + 1e-9 >= rules.warning && age < end && brightness + 1e-9 >= threshold;
  return { brightness, radiusScale, effectiveRadius: rules.radius * radiusScale, damageThreshold: threshold, damageEligible,
    phase: age < rules.warning ? 'warning' : age < end ? 'beam' : age < end + rules.fade ? 'fade' : 'idle',
    rising: age < rise, fading: age >= end };
}
