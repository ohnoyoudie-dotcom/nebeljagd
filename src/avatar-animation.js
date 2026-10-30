import * as THREE from 'three';
import { ROLL_DURATION } from './rules.js';
import groundProfile from '../assets/characters/player-animation-profile.json' with { type: 'json' };

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
  for (const pattern of patterns) {
    const clip = clips.find(item => pattern.test(String(item.name || '')));
    if (clip) return clip;
  }
  return null;
}

export function resolveAvatarClips(clips) {
  return Object.fromEntries(Object.keys(AVATAR_CLIPS).map(role => [role, resolveClip(clips, role)]));
}

// This uploaded take begins with standing/acceleration. Frames 41–58 contain
// a complete pair of steps with matching foot-contact phases. Keep the original
// source untouched; build a repeatable locomotion cycle only in memory.
const TRIPO_SPRINT = 'Die Figur sprintet schnell und kraftvoll nach vorne. Natürlich';
const preparedCache = new WeakMap();

function makeRunningLoop(clip) {
  if (clip.name !== TRIPO_SPRINT || Math.abs(clip.duration - 71 / 24) > .001) return clip;
  const start = 41 / 24, end = 58 / 24, duration = end - start;
  const frames = 43;
  const tracks = clip.tracks.map(track => {
    const size = track.getValueSize();
    const sample = track.createInterpolant();
    const first = Array.from(sample.evaluate(start));
    const last = Array.from(sample.evaluate(end));
    const values = [], times = [];
    const quaternionTrack = track.ValueTypeName === 'quaternion';
    const delta = quaternionTrack
      ? new THREE.Quaternion().fromArray(last).invert().multiply(new THREE.Quaternion().fromArray(first))
      : null;
    for (let frame = 0; frame <= frames; frame++) {
      const time = duration * frame / frames;
      const value = Array.from(sample.evaluate(start + time));
      // Preserve the recorded movement; reconcile only the short loop seam.
      const weight = THREE.MathUtils.smoothstep(time, duration - .16, duration);
      if (quaternionTrack) {
        const correction = new THREE.Quaternion().slerp(delta, weight);
        new THREE.Quaternion().fromArray(value).multiply(correction).normalize().toArray(value);
      } else {
        for (let component = 0; component < size; component++) value[component] += (first[component] - last[component]) * weight;
      }
      times.push(time); values.push(...value);
    }
    return new track.constructor(track.name, times, values, THREE.InterpolateLinear);
  });
  return new THREE.AnimationClip(clip.name, duration, tracks);
}

/** Adapt the uploaded Mixamo/Tripo rig without changing the source asset.
 * Both the game and review page use these same clips. Legacy Blender clips are
 * returned unchanged: their authored Root already provides grounded motion.
 */
export function prepareAvatarAnimations(model, sourceClips, { grounding = true } = {}) {
  const cached = preparedCache.get(model);
  if (grounding && cached?.sourceClips === sourceClips) return cached.result;
  const sourceRoles = resolveAvatarClips(sourceClips);
  let hips;
  model.traverse(node => { if (node.isBone && /^mixamorig:?hips$/i.test(node.name)) hips = node; });
  const diagnostics = { rootAligned: false, runSourceWindow: null, groundedSamples: 0, maxGroundCorrection: 0, groundingProfile: null };
  if (!hips || !sourceRoles.idle || !sourceRoles.run || !sourceRoles.roll) {
    return { clips: sourceClips, roles: sourceRoles, diagnostics };
  }
  const clips = sourceClips.map(clip => makeRunningLoop(clip.clone()));
  const roles = resolveAvatarClips(clips);
  if (roles.run.duration !== sourceRoles.run.duration) diagnostics.runSourceWindow = [41 / 24, 58 / 24];
  const positionName = `${hips.name}.position`;
  const idlePosition = roles.idle.tracks.find(track => track.name === positionName);
  if (!idlePosition) return { clips, roles, diagnostics };
  const baseline = idlePosition.values;
  for (const clip of Object.values(roles)) {
    const track = clip.tracks.find(item => item.name === positionName);
    if (!track) continue;
    const startX = track.values[0], startZ = track.values[2];
    for (let index = 0; index < track.values.length; index += 3) {
      track.values[index] += baseline[0] - startX;
      track.values[index + 2] += baseline[2] - startZ;
    }
  }
  diagnostics.rootAligned = true;

  // Corrections are precomputed against the actual skinned mesh and bound to
  // its SHA-256 in the checked-in profile. No CPU skin sampling runs at startup
  // or per frame; tests and the profile builder validate the source bytes.
  const matchesProfile = Object.entries(groundProfile.sourceClips).every(([role, source]) =>
    sourceRoles[role]?.name === source.name && Math.abs(sourceRoles[role].duration - source.duration) < 1e-6);
  if (grounding && matchesProfile) {
    for (const role of ['run', 'roll']) {
      const clip = roles[role], profile = groundProfile.grounding[role];
      const track = clip.tracks.find(item => item.name === positionName);
      if (!track || Math.abs(clip.duration - profile.duration) > 1e-6) continue;
      const sample = track.createInterpolant(), values = [];
      for (let index = 0; index < profile.times.length; index++) {
        const position = Array.from(sample.evaluate(profile.times[index]));
        position[1] += profile.offsets[index];
        values.push(...position);
        diagnostics.groundedSamples++;
        diagnostics.maxGroundCorrection = Math.max(diagnostics.maxGroundCorrection, profile.offsets[index]);
      }
      clip.tracks[clip.tracks.indexOf(track)] = new THREE.VectorKeyframeTrack(positionName, profile.times, values);
    }
    diagnostics.groundingProfile = groundProfile.sourceSha256;
  }
  const result = { clips, roles, diagnostics };
  if (grounding) preparedCache.set(model, { sourceClips, result });
  return result;
}

/** Plays the exported skeleton animations.
 * Tripo may rename clips, so roles are resolved from common names instead of
 * requiring one exact Blender clip label. World movement still stays in main.js.
 */
export function createAvatarAnimator(model, clips, { rollDuration = ROLL_DURATION } = {}) {
  const mixer = new THREE.AnimationMixer(model);
  const { roles: resolved, diagnostics } = prepareAvatarAnimations(model, clips);
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
      animationPreparation: diagnostics,
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
