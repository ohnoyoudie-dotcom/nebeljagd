import { gravityVortexMotion } from './gravity-motion.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
function noise(index, salt) {
  let value = Math.imul(index + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

/** Fixed, independently seeded birth schedules replace the regular necklace.
 * Samples are analytical, allocation-free and share the orb's exact clock. */
export function createGravityParticleFlow(rules, count) {
  const end = rules.warning + rules.pullDuration, motion = {};
  const events = Array.from({ length: count }, (_, index) => {
    const result = [];
    let birth = rules.warning * .55 + noise(index, 0) * .7;
    for (let cycle = 0; cycle < 4 && birth < end - .35; cycle++) {
      const salt = cycle * 7;
      const duration = .7 + noise(index, salt + 1) * .5;
      result.push({ birth, duration, spin: gravityVortexMotion(birth, rules, motion).spin,
        angle: noise(index, salt + 2) * Math.PI * 2,
        radius: rules.radius * (.82 + noise(index, salt + 3) * .28),
        winding: .35 + noise(index, salt + 4) * .25,
        turns: 3 + noise(index, salt + 5) * .8 });
      birth += duration + .08 + noise(index, salt + 6) * .35;
    }
    return result;
  });
  function sample(index, age, out) {
    out.x = out.y = out.z = out.life = out.progress = 0; out.event = -1;
    if (age >= end || age < 0) return out;
    const schedule = events[index];
    if (!schedule) return out;
    for (let cycle = 0; cycle < schedule.length; cycle++) {
      const event = schedule[cycle];
      if (age < event.birth || age >= event.birth + event.duration) continue;
      const travel = clamp((age - event.birth) / event.duration);
      // The last quarter-second gathers every remaining stone into the orb.
      const finish = smooth((age - end + .25) / .25);
      const p = travel + (1 - travel) * finish;
      gravityVortexMotion(age, rules, motion);
      const angle = event.angle - (motion.spin - event.spin) * event.winding - event.turns * smooth(p);
      const radius = event.radius * (1 - smooth(p));
      out.x = Math.cos(angle) * radius; out.z = Math.sin(angle) * radius;
      out.y = .08 + (motion.sphereHeight - .08) * smooth((p - .38) / .62);
      out.life = smooth(p / .09) * (1 - smooth((p - .92) / .08));
      out.progress = p; out.event = cycle;
      return out;
    }
    return out;
  }
  return { sample };
}
