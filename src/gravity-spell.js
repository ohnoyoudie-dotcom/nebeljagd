import * as THREE from 'three';
import { createGravityVisuals } from './gravity-visuals.js';
import { createGravityArrival } from './gravity-arrival.js';
import { createSpellEffects } from './spell-effects.js';
import { traceRangedProjectile } from './projectile-collision.js';
import { STAFF_CHARGE_SECONDS, STAFF_THROW_RANGE, chargedStaffRange } from './staff-charge.js';

// All times are seconds and all distances are in world metres.
// Keep crowd control independent of rarity: only the blast damage scales.
export const GRAVITY_RULES = Object.freeze({
  range: STAFF_THROW_RANGE, chargeSeconds: STAFF_CHARGE_SECONDS, radius: 3.2, warning: .4, pullDuration: 1,
  pullSpeed: 1.5, maxPull: 1.5, minCenterDistance: .2,
  afterglow: 1.1,
  projectileSpeed: 10, projectileArcHeight: 3.2, projectileMinFlight: .5,
});

export function gravityPullStep(distance, moved, dt, rules = GRAVITY_RULES) {
  if (!(dt > 0) || !(distance > rules.minCenterDistance)) return 0;
  return Math.max(0, Math.min(distance - rules.minCenterDistance,
    rules.maxPull - moved, rules.pullSpeed * dt));
}

/** Ground-targeted hold/release spell. Crowd control and visual phases share one clock. */
export function createGravitySpell(scene, world, combat, ownerId, onDamage = () => {}, isVisible = null, { effects: sharedEffects = null, textures = null } = {}) {
  const rules = GRAVITY_RULES;
  const visuals = createGravityVisuals(scene, rules, { heightAt: world?.heightAt?.bind(world), textures });
  const arrival = createGravityArrival(scene, rules);
  const effects = sharedEffects ?? createSpellEffects(scene, { isVisible });
  const projectile = effects.createProjectile();
  const ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const visibleAt = p => !isVisible || isVisible(p);
  const aimPoint = new THREE.Vector3(), nextPull = new THREE.Vector3(), segmentStart = new THREE.Vector3(), segmentEnd = new THREE.Vector3();
  let aim = null, flight = null, field = null, castCount = 0, lastHitCount = 0;

  function aimAt(position, requested) {
    if (!aim || !requested || !Number.isFinite(requested.x) || !Number.isFinite(requested.z)) return;
    aim.requested.set(requested.x, 0, requested.z);
    refreshAim(position);
  }
  function refreshAim(position) {
    const dx = aim.requested.x - position.x, dz = aim.requested.z - position.z;
    const distance = Math.hypot(dx, dz);
    aim.range = chargedStaffRange(aim.age, rules.range);
    const factor = Math.min(1, aim.range / (distance || 1));
    aim.caster.copy(position);
    const point = aimPoint.set(position.x + dx * factor, 0, position.z + dz * factor);
    point.y = ground(point);
    // The same low-cover policy as the other thrown staff projectile.
    const wall = traceRangedProjectile(world,
      { x: position.x, y: ground(position) + .7, z: position.z },
      { x: point.x, y: point.y + .7, z: point.z }, .04);
    if (wall?.point) {
      const angle = Math.atan2(dz, dx);
      point.x = wall.point.x - Math.cos(angle) * .18;
      point.z = wall.point.z - Math.sin(angle) * .18;
      point.y = ground(point);
    }
    if (world?.isLand && !world.isLand(point.x, point.z) || world?.isWater?.(point.x, point.z)) return;
    aim.target.copy(point);
    visuals.showAim(point, { x: position.x, y: ground(position), z: position.z }, aim.range, aim.age, visibleAt(point));
  }
  function beginAim(position, direction) {
    if (aim || flight || field || !position) return false;
    aim = { target: new THREE.Vector3(position.x, ground(position), position.z), requested: new THREE.Vector3(), caster: new THREE.Vector3(), age: 0, range: 0 };
    const angle = Number.isFinite(direction) ? direction : 0;
    aimAt(position, { x: position.x + Math.sin(angle) * rules.range, z: position.z + Math.cos(angle) * rules.range });
    return true;
  }
  function cancelAim() { aim = null; visuals.hideAim(); }
  function land(point, normal = null) {
    effects.end(projectile); flight = null;
    const center = point.clone(); center.y = ground(center);
    effects.impact('gravityStaff', center, normal ?? { x: 0, y: 1, z: 0 });
    if (world?.isLand && !world.isLand(center.x, center.z) || world?.isWater?.(center.x, center.z)) return;
    field = { center, age: 0, exploded: false, pulled: new Map(), payload: castPayload };
    arrival.show(center, 0, visibleAt(center));
    visuals.hideField();
  }
  let castPayload = null;
  function release(payload, launchOrigin = null, blocked = null) {
    if (!aim || flight || field) { cancelAim(); return false; }
    const target = aim.target.clone(); target.y += .06;
    const origin = launchOrigin ? new THREE.Vector3(launchOrigin.x, launchOrigin.y, launchOrigin.z)
      : aim.caster.clone().add(new THREE.Vector3(0, 1.4, 0));
    if (![origin.x, origin.y, origin.z].every(Number.isFinite)) return false;
    castPayload = { ...payload, sourceId: ownerId };
    cancelAim();
    castCount++; lastHitCount = 0;
    if (blocked?.point) { land(new THREE.Vector3(blocked.point.x, blocked.point.y, blocked.point.z), blocked.normal); return true; }
    flight = { origin, target, position: origin.clone(), age: 0,
      duration: Math.max(rules.projectileMinFlight, origin.distanceTo(target) / rules.projectileSpeed) };
    effects.launch(projectile, 'gravityStaff', origin, Math.atan2(target.x - origin.x, target.z - origin.z));
    return true;
  }
  function unblocked(center, target) {
    const p = target.position;
    return !world?.traceProjectile?.(
      { x: center.x, y: center.y + .7, z: center.z },
      { x: p.x, y: (p.y ?? ground(p)) + .7, z: p.z }, .04);
  }
  function pull(dt) {
    if (!(dt > 0)) return;
    for (const target of combat?.targets?.values() ?? []) {
      if (!target.alive || target.id === ownerId || target.targetable === false || target.destructible) continue;
      const p = target.position;
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || !unblocked(field.center, target)) continue;
      const dx = field.center.x - p.x, dz = field.center.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > rules.radius + Math.min(.3, target.radius ?? 0)) continue;
      const moved = field.pulled.get(target.id) ?? 0;
      const step = gravityPullStep(distance, moved, dt);
      if (step <= 0) continue;
      const next = nextPull.set(p.x + dx / distance * step, p.y ?? ground(p), p.z + dz / distance * step);
      if (world?.isLand && !world.isLand(next.x, next.z) || world?.isWater?.(next.x, next.z)) continue;
      world?.resolveMovement?.(next, target.radius ?? .42);
      const actual = Math.hypot(next.x - p.x, next.z - p.z);
      if (actual <= 1e-6) continue;
      p.x = next.x; p.z = next.z;
      p.y = ground(p);
      field.pulled.set(target.id, moved + Math.min(step, actual));
      // A short-lived hint to visual actors. Damage, speed and combat status
      // are unchanged. The hint fades automatically when the pull ends.
      const hint = target.gravityVisual ??= {};
      Object.assign(hint, { x: dx / distance, z: dz / distance, remaining: .22, sourceId: ownerId });
    }
  }
  function explode() {
    if (field.exploded) return;
    field.exploded = true;
    for (const target of combat?.targets?.values() ?? []) {
      if (!target.alive || target.id === ownerId || target.targetable === false || !target.position) continue;
      const p = target.position;
      if (Math.hypot(p.x - field.center.x, p.z - field.center.z) > rules.radius + (target.radius ?? 0)) continue;
      if (Math.abs((p.y ?? ground(p)) - field.center.y) > 2 || !unblocked(field.center, target)) continue;
      const result = combat.hit(target, { ...field.payload, type: 'gravity' });
      if (result) { lastHitCount++; onDamage(result); }
    }
  }
  // Visible energy tethers must never reveal opponents behind cover or hidden
  // in grass. Combat collision and the damage calculation remain separate.
  function visualTargets(center) {
    const found = [];
    for (const target of combat?.targets?.values() ?? []) {
      if (found.length >= 8) break;
      if (!target.alive || target.id === ownerId || target.destructible || target.targetable === false || !target.position) continue;
      const p = target.position;
      if (target.concealed || (world?.concealmentAt?.(p.x, p.z) ?? 0) > .01 || !visibleAt(p)) continue;
      if (Math.abs((p.y ?? ground(p)) - center.y) > 2) continue;
      if (Math.hypot(p.x - center.x, p.z - center.z) > rules.radius + Math.min(.3, target.radius ?? 0)) continue;
      if (!unblocked(center, target)) continue;
      found.push({ x: p.x, y: p.y ?? ground(p), z: p.z });
    }
    return found;
  }
  function update(dt, position, time = 0) {
    if (!(dt > 0)) return;
    if (aim && position) { aim.age += dt; refreshAim(position); }
    let fieldDelta = dt;
    if (flight) {
      let elapsed = 0;
      while (flight && elapsed < dt) {
        const step = Math.min(1 / 60, dt - elapsed, flight.duration - flight.age);
        if (!(step > 0)) break;
        segmentStart.copy(flight.position);
        const t = Math.min(1, (flight.age + step) / flight.duration);
        segmentEnd.copy(flight.origin).lerp(flight.target, t);
        segmentEnd.y += 4 * t * (1 - t) * rules.projectileArcHeight;
        const wall = traceRangedProjectile(world, segmentStart, segmentEnd, .16);
        const fraction = wall ? THREE.MathUtils.clamp(wall.t ?? 1, 0, 1) : 1;
        const travelled = step * fraction;
        flight.age += travelled; elapsed += travelled;
        if (wall?.point) segmentEnd.set(wall.point.x, wall.point.y, wall.point.z);
        effects.advance(projectile, segmentStart, segmentEnd, Math.max(travelled, .000001), time);
        flight.position.copy(segmentEnd);
        const terrain = segmentEnd.y <= ground(segmentEnd) + .045 && segmentEnd.y < segmentStart.y;
        if (wall || terrain || t >= 1) {
          if (wall?.normal) { segmentEnd.x += (wall.normal.x ?? 0) * .12; segmentEnd.z += (wall.normal.z ?? 0) * .12; }
          land(segmentEnd, wall?.normal); fieldDelta = dt - elapsed > 1e-9 ? dt - elapsed : 0; break;
        }
      }
      if (flight) fieldDelta = 0;
    }
    if (!sharedEffects) effects.update(dt, time);
    if (!field) return;
    const before = field.age;
    field.age += fieldDelta;
    const activeStart = rules.warning, activeEnd = rules.warning + rules.pullDuration;
    const active = Math.max(0, Math.min(field.age, activeEnd) - Math.max(before, activeStart));
    if (active > 0 && !field.exploded) pull(active);
    if (field.age >= activeEnd && !field.exploded) explode();
    arrival.show(field.center, field.age, visibleAt(field.center));
    visuals.showField(field.center, field.age, visibleAt(field.center), visualTargets(field.center));
    if (field.age >= activeEnd + rules.afterglow) { field = null; visuals.hideField(); arrival.hide(); }
  }
  // Make the actual grass and low foliage bend inward during the suction phase.
  // The vegetation shader accepts at most eight interactors, including player
  // and training actors. Never displace world objects or change movement.
  function appendGrassInteractors(interactors = []) {
    if (!field || field.exploded || field.age < rules.warning
      || field.age >= rules.warning + rules.pullDuration) return interactors;
    const pullAge = field.age - rules.warning;
    const remaining = rules.warning + rules.pullDuration - field.age;
    const ramp = Math.min(1, pullAge / .18, remaining / .18);
    const strength = Math.max(0, ramp) * .76;
    if (!(strength > 0)) return interactors;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (interactors.length >= 8) break;
      interactors.push({
        x: field.center.x + dx * rules.radius * .63,
        z: field.center.z + dz * rules.radius * .63,
        radius: rules.radius * .68,
        dirX: -dx, dirZ: -dz, strength,
      });
    }
    return interactors;
  }
  function reset() {
    for (const target of combat?.targets?.values() ?? []) {
      if (target.gravityVisual?.sourceId === ownerId) delete target.gravityVisual;
    }
    cancelAim(); flight = field = castPayload = null; effects.end(projectile); arrival.hide(); visuals.hideField();
    if (!sharedEffects) effects.reset();
    castCount = lastHitCount = 0;
  }
  function dispose() {
    reset(); visuals.dispose(); arrival.dispose(); if (!sharedEffects) effects.dispose();
  }
  return { beginAim, aimAt, cancelAim, release, update, reset, dispose, appendGrassInteractors,
    get aiming() { return Boolean(aim); },
    get busy() { return Boolean(flight || field); },
    get telemetry() {
      return { aiming: Boolean(aim), aim: aim ? { x: aim.target.x, z: aim.target.z } : null,
        aimRange: aim ? { radius: aim.range, maximum: rules.range, heldSeconds: aim.age } : null,
        radius: rules.radius, chargeSeconds: rules.chargeSeconds, visuals: visuals.telemetry,
        active: Boolean(flight || field), landed: Boolean(field), phase: flight ? 'flight' : field ? field.age < rules.warning * .55 ? 'impact' : field.age < rules.warning ? 'opening' : field.exploded ? 'collapse' : 'pull' : 'idle',
        flight: flight ? { position: { ...flight.position }, origin: { ...flight.origin }, target: { ...flight.target }, age: flight.age, duration: flight.duration, arcHeight: rules.projectileArcHeight } : null,
        arrival: arrival.telemetry, castCount, lastHitCount, age: field?.age ?? 0, exploded: field?.exploded ?? false,
        center: field ? { x: field.center.x, z: field.center.z } : flight ? { x: flight.target.x, z: flight.target.z } : null,
        pulled: field ? Object.fromEntries(field.pulled) : {} };
    } };
}
