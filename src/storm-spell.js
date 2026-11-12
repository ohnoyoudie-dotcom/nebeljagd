import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';
import { STAFF_CHARGE_SECONDS, STAFF_THROW_RANGE, chargedStaffRange } from './staff-charge.js';
import { createStormVisuals } from './storm-visuals.js';
import { traceRangedProjectile } from './projectile-collision.js';
import { createStormScatter } from './storm-scatter.js';

export const STORM_RULES = Object.freeze({ range: STAFF_THROW_RANGE, chargeSeconds: STAFF_CHARGE_SECONDS,
  radius: 3.8, warning: .25, duration: 3, fade: .25, stun: .4, scatterPerPulse: 5,
  pulses: Object.freeze([.35, .91, 1.53, 2.12, 2.78]) });

/** One aimed storm, using simulation time for charge, strikes and cleanup. */
export function createStormSpell(scene, world, combat, ownerId, onDamage = () => {}, isVisible = null, texture = null, { random = Math.random } = {}) {
  const r = STORM_RULES, ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const targetRing = createStaffAimRing(r.radius, { color: '#9bd8ff' }), reachRing = createStaffAimRing(r.range, { range: true });
  scene.add(targetRing, reachRing);
  const visuals = createStormVisuals(scene, r, ground, isVisible, texture);
  let aim = null, field = null, casts = 0, pulses = 0, hits = 0;
  const point = new THREE.Vector3(), origin = new THREE.Vector3();
  const protectedPoints = [];
  function refresh(position) {
    const dx = aim.requested.x - position.x, dz = aim.requested.z - position.z;
    aim.range = chargedStaffRange(aim.age, r.range);
    const scale = Math.min(1, aim.range / (Math.hypot(dx, dz) || 1));
    point.set(position.x + dx * scale, 0, position.z + dz * scale); point.y = ground(point);
    if (world?.isLand && !world.isLand(point.x, point.z) || world?.isWater?.(point.x, point.z)) return;
    aim.target.copy(point); targetRing.position.copy(point); targetRing.position.y += .08;
    targetRing.userData.update(aim.age);
    targetRing.visible = reachRing.visible = true;
    reachRing.position.set(position.x, ground(position) + .07, position.z);
    reachRing.scale.setScalar(Math.max(.0001, aim.range / r.range));
  }
  function beginAim(position, direction = 0) {
    if (aim || field || !position) return false;
    aim = { target: position.clone(), requested: new THREE.Vector3(position.x + Math.sin(direction) * r.range, 0,
      position.z + Math.cos(direction) * r.range), age: 0, range: 0 };
    refresh(position); return true;
  }
  function aimAt(position, requested) {
    if (!aim || !Number.isFinite(requested?.x) || !Number.isFinite(requested?.z)) return;
    aim.requested.set(requested.x, 0, requested.z); refresh(position);
  }
  function cancelAim() { aim = null; targetRing.visible = reachRing.visible = false; }
  function release(payload) {
    if (!aim || field) return false;
    field = { center: aim.target.clone(), age: 0, next: 0, payload: { ...payload, sourceId: ownerId },
      scatter: createStormScatter(r.radius, r.pulses.length * r.scatterPerPulse, random) };
    cancelAim(); casts++; pulses = hits = 0;
    visuals.start(field.center); return true;
  }
  function strike(at) {
    pulses++;
    const center = field.center;
    origin.set(center.x, center.y + 3.4, center.z);
    // Fresh independent disk samples for every cast, fixed before animation so
    // pauses and coarse frames cannot change their endpoints or consume randomness.
    for (let scatter = 0; scatter < r.scatterPerPulse; scatter++) {
      const landing = field.scatter[(pulses - 1) * r.scatterPerPulse + scatter];
      point.set(center.x + landing.x, 0, center.z + landing.z); point.y = ground(point) + .06;
      const wall = traceRangedProjectile(world, origin, point, .02);
      visuals.strike(wall?.point ?? point, landing.seed, Math.max(0, field.age - at));
    }
    for (const target of combat?.targets?.values() ?? []) {
      const p = target.position;
      if (!target.alive || target.id === ownerId || target.destructible || target.targetable === false || !p) continue;
      if (Math.hypot(p.x - center.x, p.z - center.z) > r.radius || Math.abs((p.y ?? ground(p)) - center.y) > 2) continue;
      point.set(p.x, (p.y ?? ground(p)) + .7, p.z);
      if (traceRangedProjectile(world, origin, point, .02)) continue;
      const result = combat.hit(target, { ...field.payload, type: 'lightningStaff',
        damage: field.payload.damage / r.pulses.length, stun: Math.max(0, r.stun - (field.age - at)) });
      if (result) { hits++; onDamage(result); }
      if (!target.concealed && !(world?.concealmentAt?.(p.x, p.z) > .01) && (!isVisible || isVisible(p))) {
        point.y = (p.y ?? ground(p)) + .08;
        visuals.strike(point, pulses * 11 + hits, Math.max(0, field.age - at));
      }
    }
  }
  function update(dt, position) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (aim && position) { aim.age += dt; refresh(position); }
    visuals.update(dt, field?.age ?? 0);
    if (!field) return;
    field.age += dt;
    while (field.next < r.pulses.length && field.age >= r.warning + r.pulses[field.next]) {
      strike(r.warning + r.pulses[field.next++]);
    }
    protectedPoints.length = 0;
    if (position) protectedPoints.push(position);
    for (const target of combat?.targets?.values() ?? []) {
      if (protectedPoints.length === 8) break;
      const p = target.position;
      if (!target.alive || target.destructible || !p || target.concealed || target.targetable === false
        || world?.concealmentAt?.(p.x, p.z) > .01 || isVisible && !isVisible(p)) continue;
      if (Math.hypot(p.x-field.center.x, p.z-field.center.z) <= r.radius) protectedPoints.push(p);
    }
    visuals.protect(protectedPoints);
    visuals.show(field.center, field.age);
    if (field.age >= r.warning + r.duration + r.fade) { field = null; visuals.hide(); }
  }
  function reset() { cancelAim(); field = null; casts = pulses = hits = 0; visuals.hide(); }
  return { beginAim, aimAt, cancelAim, release, update, reset,
    get aiming() { return !!aim; }, get busy() { return !!field; },
    get telemetry() { return { aiming: !!aim, active: !!field, casts, pulses, hits, radius: r.radius,
      aim: aim?.target.clone() ?? null, aimRange: aim ? { radius: aim.range, maximum: r.range, heldSeconds: aim.age } : null,
      center: field?.center.clone() ?? null, age: field?.age ?? 0, visuals: visuals.telemetry }; },
    dispose() { reset(); visuals.dispose(); for (const ring of [targetRing, reachRing]) {
      scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); } },
  };
}
