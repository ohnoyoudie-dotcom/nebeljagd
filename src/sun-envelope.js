const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

/** One simulation-time curve controls both the light and its damage threshold. */
export function solarEnvelope(age, rules) {
  const rise = rules.rise ?? .60, end = rules.warning + rules.duration;
  const threshold = smooth(rules.warning / rise);
  const brightness = age < end ? smooth(age / rise) : 1 - smooth((age - end) / rules.fade);
  const damageEligible = age + 1e-9 >= rules.warning && age < end && brightness + 1e-9 >= threshold;
  return { brightness, damageThreshold: threshold, damageEligible,
    phase: age < rules.warning ? 'warning' : age < end ? 'beam' : age < end + rules.fade ? 'fade' : 'idle',
    rising: age < rise, fading: age >= end };
}
