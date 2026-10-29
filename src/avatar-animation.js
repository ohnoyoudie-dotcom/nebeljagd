import * as THREE from 'three';
import { ROLL_DURATION } from './rules.js';

export const AVATAR_CLIPS = Object.freeze({
  idle: 'Idle_Nebeljagd', run: 'Run_Nebeljagd', roll: 'Roll_Nebeljagd',
});

/** Plays the authored skeleton, including the complete tuck and forward roll.
 * World travel and collision stay in main.js; no procedural rotation or scaling
 * is added here. Retiming keeps the animation and gameplay cooldown in sync.
 */
export function createAvatarAnimator(model, clips, { rollDuration = ROLL_DURATION } = {}) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [role, name] of Object.entries(AVATAR_CLIPS)) {
    const clip = THREE.AnimationClip.findByName(clips, name);
    if (!clip || !(clip.duration > 0)) throw new Error(`Avatar requires animation ${name}.`);
    actions[role] = mixer.clipAction(clip);
  }
  if (!(rollDuration > 0) || !Number.isFinite(rollDuration)) throw new Error('Invalid roll duration.');
  const { idle, run, roll } = actions;
  idle.play(); run.play().setEffectiveWeight(0);
  roll.setLoop(THREE.LoopOnce, 1);
  roll.clampWhenFinished = true;
  let elapsed = null, runWeight = 0, rollWeight = 0;

  function applyWeights() {
    idle.setEffectiveWeight((1 - runWeight) * (1 - rollWeight));
    run.setEffectiveWeight(runWeight * (1 - rollWeight));
    roll.setEffectiveWeight(rollWeight);
  }
  function stopRoll() {
    elapsed = null; rollWeight = 0;
    roll.stop(); applyWeights(); mixer.update(0);
  }
  function update(dt, { walkWeight = 0, playbackSpeed = 1, frozen = false } = {}) {
    const delta = frozen ? 0 : THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    runWeight = THREE.MathUtils.clamp(walkWeight, 0, 1);
    run.setEffectiveTimeScale(playbackSpeed);
    if (elapsed !== null) {
      elapsed = Math.min(rollDuration, elapsed + delta);
      const progress = elapsed / rollDuration;
      // Anticipation/recovery blend only; the full somersault uses the exact
      // baked pose so quaternion blending cannot turn it into a side tumble.
      rollWeight = THREE.MathUtils.smoothstep(progress, 0, .09)
        * (1 - THREE.MathUtils.smoothstep(progress, .88, 1));
    }
    applyWeights();
    mixer.update(delta);
    if (elapsed !== null && elapsed >= rollDuration - 1e-8) stopRoll();
    return snapshot();
  }
  function snapshot() {
    return {
      activeAnimation: elapsed !== null ? AVATAR_CLIPS.roll : runWeight > .5 ? AVATAR_CLIPS.run : AVATAR_CLIPS.idle,
      rollProgress: elapsed === null ? 0 : elapsed / rollDuration,
      rollClipTime: elapsed === null ? 0 : roll.time,
      rollDuration,
      rollWeight,
    };
  }
  return {
    update, snapshot, stopRoll,
    get rolling() { return elapsed !== null; },
    startRoll() {
      if (elapsed !== null) return false;
      elapsed = 0; rollWeight = 0;
      roll.reset().setEffectiveTimeScale(roll.getClip().duration / rollDuration).play();
      return true;
    },
    reset() {
      stopRoll();
      idle.reset().play(); run.reset().play();
      runWeight = 0; applyWeights(); mixer.update(0);
    },
  };
}
