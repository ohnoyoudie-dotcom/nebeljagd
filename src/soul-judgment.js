/** Three real projectile hits from one caster seal a delayed judgment. */
export const SOUL_JUDGMENT_RULES = Object.freeze({ hits: 3, markSeconds: 8, delay: 2 });

export function createSoulJudgment(combat, onDamage = () => {}) {
  const marks = new Map();
  let time = 0;
  function addHit(target, sourceId) {
    if (!target?.alive || target.destructible || target.targetable === false || target.id === sourceId) return null;
    const key = JSON.stringify([sourceId, target.id]);
    let mark = marks.get(key);
    if (mark?.executeAt != null) return mark;
    if (!mark || mark.expiresAt <= time) {
      mark = { targetId: target.id, sourceId, count: 0, executeAt: null, expiresAt: 0 };
      marks.set(key, mark);
    }
    mark.count++;
    mark.expiresAt = time + SOUL_JUDGMENT_RULES.markSeconds;
    if (mark.count === SOUL_JUDGMENT_RULES.hits) mark.executeAt = time + SOUL_JUDGMENT_RULES.delay;
    return mark;
  }
  function update(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    time += dt;
    for (const [key, mark] of marks) {
      const target = combat.targets.get(mark.targetId);
      if (!target?.alive || target.destructible) { marks.delete(key); continue; }
      if (mark.executeAt != null) {
        if (time + 1e-9 < mark.executeAt) continue;
        marks.delete(key);
        const result = combat.hit(target, { damage: target.health, sourceId: mark.sourceId, type: 'soul-judgment' });
        if (result) onDamage(result);
      } else if (time >= mark.expiresAt) marks.delete(key);
    }
  }
  return { addHit, update, reset() { marks.clear(); time = 0; },
    get marks() { return [...marks.values()].map(mark => ({ ...mark,
      remaining: Math.max(0, (mark.executeAt ?? mark.expiresAt) - time) })); } };
}
