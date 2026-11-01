import { MAX_HEALTH, START_HEALTH } from './rules.js';

export const START_LEVEL = 1;
export const HEALTH_PER_LEVEL = 25;

/** Round-local player state; each player owns an independent instance. */
export function createProgressionState() {
  return { level: START_LEVEL, maxHealth: MAX_HEALTH, health: START_HEALTH, defeats: 0 };
}

/** Apply a combat onDefeat event to its credited player. NPCs and opponent
 * players use the same rule; breakable scenery never grants progression.
 * createCombat emits one event per life, including its attributed burn ticks.
 */
export function awardDefeat(state, result, target, { playerId = 'player' } = {}) {
  if (!state || !result?.killed || !target || result.targetId !== target.id
    || !playerId || result.sourceId !== playerId || target.id === playerId
    || target.destructible || target.progressionReward === false || !(state.health > 0)) return null;
  state.level += 1;
  state.defeats += 1;
  state.maxHealth += HEALTH_PER_LEVEL;
  state.health = Math.min(state.maxHealth, state.health + HEALTH_PER_LEVEL);
  return { level: state.level, maxHealth: state.maxHealth, health: state.health,
    healthGained: HEALTH_PER_LEVEL, targetId: target.id };
}
