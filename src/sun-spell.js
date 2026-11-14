import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';
import { STAFF_CHARGE_SECONDS, STAFF_THROW_RANGE, chargedStaffRange } from './staff-charge.js';
import { createSunVisuals } from './sun-visuals.js';
import { solarEnvelope } from './sun-envelope.js';
import { traceRangedProjectile } from './projectile-collision.js';

export const SUN_RULES = Object.freeze({ range: STAFF_THROW_RANGE, chargeSeconds: STAFF_CHARGE_SECONDS,
  radius: 3.2, warning: .4, rise: .6, duration: 2.4, fade: .26, blindSeconds: 2, revealSeconds: 2.5, blindRadius: 3,
  pulses: Object.freeze([0, .3, .6, .9, 1.2, 1.5, 1.8, 2.1]) });

/** An aimed solar beam, using simulation time for charge, strikes and cleanup. */
export function createSunSpell(scene, world, combat, ownerId, onDamage = () => {}, isVisible = null) {
  const r = SUN_RULES, ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const targetRing = createStaffAimRing(r.radius, { color: '#ffe3a0' }), reachRing = createStaffAimRing(r.range, { range: true });
  scene.add(targetRing, reachRing);
  const visuals = createSunVisuals(scene, r, ground, isVisible);
  let aim = null, field = null, casts = 0, pulses = 0, hits = 0;
  const point = new THREE.Vector3(), origin = new THREE.Vector3();
  function refresh(position) {
    const dx = aim.requested.x - position.x, dz = aim.requested.z - position.z;
    aim.range = chargedStaffRange(aim.age, r.range);
    const scale = Math.min(1, aim.range / (Math.hypot(dx, dz) || 1));
    point.set(position.x + dx * scale, 0, position.z + dz * scale); point.y = ground(point);
    aim.valid = !(world?.isLand && !world.isLand(point.x, point.z) || world?.isWater?.(point.x, point.z));
    targetRing.visible = aim.valid;
    if (!aim.valid) return;
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
    if (!aim?.valid || field) { cancelAim(); return false; }
    field = { center: aim.target.clone(), age: 0, next: 0, payload: { ...payload, sourceId: ownerId } };
    cancelAim(); casts++; pulses = hits = 0;
    visuals.start(field.center); return true;
  }
  function strike(at) {
    if (!solarEnvelope(at, r).damageEligible) return;
    pulses++;
    const center = field.center;
    for (const target of combat?.targets?.values() ?? []) {
      const p = target.position;
      if (!target.alive || target.id === ownerId || target.targetable === false || !p) continue;
      if (Math.hypot(p.x - center.x, p.z - center.z) > r.radius || Math.abs((p.y ?? ground(p)) - center.y) > 2) continue;
      // The sunlight falls vertically: roofs shield targets; hiding grass does not.
      origin.set(p.x, center.y + 18, p.z);
      point.set(p.x, (p.y ?? ground(p)) + Math.min(1, target.height ?? 1), p.z);
      const obstacle = traceRangedProjectile(world, origin, point, .02);
      if (obstacle && (obstacle.collider?.destructibleId ?? obstacle.collider?.objectId) !== target.id) continue;
      const lag = field.age - at;
      const result = combat.hit(target, { ...field.payload, type: 'sunStaff',
        damage: field.payload.damage / r.pulses.length,
        blind: { duration: Math.max(0, r.blindSeconds - lag), radius: r.blindRadius },
        reveal: Math.max(0, r.revealSeconds - lag) });
      if (result) { hits++; onDamage(result); }
    }
  }
  function update(dt, position) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (aim && position) { aim.age += dt; refresh(position); }
    if (!field) return;
    field.age += dt;
    while (field.next < r.pulses.length && field.age + 1e-9 >= r.warning + r.pulses[field.next]) {
      strike(r.warning + r.pulses[field.next++]);
    }
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
