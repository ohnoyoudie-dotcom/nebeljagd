import * as THREE from 'three';
import { ROLL_DURATION } from './rules.js';

export const AVATAR_CLIPS = Object.freeze({
  idle: 'idle',
  run: 'run',
  roll: 'roll',
});

const CLIP_PATTERNS = Object.freeze({
  idle: [/^idle[_ -]?nebeljagd$/i, /entspannt.*stehen/i, /idle/i, /stand/i, /stehen/i],
  run: [/^run[_ -]?nebeljagd$/i, /athletic.*sprint/i, /sprint/i, /run/i, /rennen/i, /lauf/i],
  roll: [/^roll[_ -]?nebeljagd$/i, /forward.*roll/i, /combat.*roll/i, /roll/i, /rolle/i],
});

function resolveClip(clips, role) {
  const patterns = CLIP_PATTERNS[role] ?? [];
  return clips.find(clip => patterns.some(pattern => pattern.test(String(clip.name || '')))) ?? null;
}

/** Plays the exported skeleton animations.
 * Tripo may rename clips, so roles are resolved from common names instead of
 * requiring one exact Blender clip label. World movement still stays in main.js.
 */
export function createAvatarAnimator(model, clips, { rollDuration = ROLL_DURATION } = {}) {
  const mixer = new THREE.AnimationMixer(model);
  const resolved = {
    idle: resolveClip(clips, 'idle'),
    run: resolveClip(clips, 'run'),
    roll: resolveClip(clips, 'roll'),
  };
  for (const role of ['idle', 'run', 'roll']) {
    const clip = resolved[role];
    if (!clip || !(clip.duration > 0)) {
      const legacy = { idle: 'Idle_Nebeljagd', run: 'Run_Nebeljagd', roll: 'Roll_Nebeljagd' }[role];
      throw new Error(`Avatar benötigt eine ${role}-Animation (${legacy}). Gefunden: ${clips.map(item => item.name).join(', ') || 'keine'}`);
    }
  }

  const idle = mixer.clipAction(resolved.idle);
  const run = mixer.clipAction(resolved.run);
  const roll = mixer.clipAction(resolved.roll);
  if (!(rollDuration > 0) || !Number.isFinite(rollDuration)) throw new Error('Invalid roll duration.');

  idle.play();
  run.play().setEffectiveWeight(0);
  roll.setLoop(THREE.LoopOnce, 1);
  roll.clampWhenFinished = true;

  let elapsed = null, runWeight = 0, rollWeight = 0;

  function applyWeights() {
    idle.setEffectiveWeight((1 - runWeight) * (1 - rollWeight));
    run.setEffectiveWeight(runWeight * (1 - rollWeight));
    roll.setEffectiveWeight(rollWeight);
  }

  function stopRoll() {
    elapsed = null;
    rollWeight = 0;
    roll.stop();
    applyWeights();
    mixer.update(0);
  }

  function update(dt, { walkWeight = 0, playbackSpeed = 1, frozen = false } = {}) {
    const delta = frozen ? 0 : THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    runWeight = THREE.MathUtils.clamp(walkWeight, 0, 1);
    run.setEffectiveTimeScale(THREE.MathUtils.clamp(playbackSpeed, .55, 1.8));

    if (elapsed !== null) {
      elapsed = Math.min(rollDuration, elapsed + delta);
      const progress = elapsed / rollDuration;
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
      activeAnimation: elapsed !== null ? resolved.roll.name : runWeight > .5 ? resolved.run.name : resolved.idle.name,
      mappedAnimations: {
        idle: resolved.idle.name,
        run: resolved.run.name,
        roll: resolved.roll.name,
      },
      rollProgress: elapsed === null ? 0 : elapsed / rollDuration,
      rollClipTime: elapsed === null ? 0 : roll.time,
      rollDuration,
      rollWeight,
    };
  }

  return {
    update,
    snapshot,
    stopRoll,
    get rolling() { return elapsed !== null; },
    startRoll() {
      if (elapsed !== null) return false;
      elapsed = 0;
      rollWeight = 0;
      roll.reset().setEffectiveTimeScale(roll.getClip().duration / rollDuration).play();
      return true;
    },
    reset() {
      stopRoll();
      idle.reset().play();
      run.reset().play();
      runWeight = 0;
      applyWeights();
      mixer.update(0);
    },
  };
}
