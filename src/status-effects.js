/** The eight approved symbols describe live combat state, never equipped weapons. */
export const STATUS_DEFINITIONS = Object.freeze([
  {id:'burn',label:'Brennen'}, {id:'poison',label:'Vergiftet'},
  {id:'cold',label:'Kälte'}, {id:'slow',label:'Verlangsamung'},
  {id:'stun',label:'Betäubt'}, {id:'revealed',label:'Aufgedeckt'},
  {id:'blind',label:'Blind'}, {id:'shield',label:'Projektilschutz'},
].map(Object.freeze));
const positive = n => Number.isFinite(n) && n > 1e-8 ? n : 0;
export function activeStatusEffects(target, shield = {}) {
  if (!target?.alive || target.destructible || target.targetable === false) return [];
  let timeSlow = 0;
  for (const entry of target.timeSlows?.values?.() ?? []) {
    if (Number.isFinite(entry.factor) && entry.factor < 1) timeSlow = Math.max(timeSlow, positive(entry.remaining));
  }
  const times = [positive(target.burnRemaining),positive(target.poisonRemaining),
    target.slowFactor < 1 ? positive(target.slowRemaining) : 0,timeSlow,
    positive(target.stunRemaining),positive(target.revealRemaining),
    Math.max(positive(target.blindRemaining),positive(target.darkenedRemaining)),
    shield.active ? positive(shield.remaining) : 0];
  return STATUS_DEFINITIONS.flatMap((definition,i) => times[i] ? [{...definition,remaining:times[i]}] : []);
}
