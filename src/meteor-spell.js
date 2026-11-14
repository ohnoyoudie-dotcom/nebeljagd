import * as THREE from 'three';
import { STAFF_THROW_RANGE, STAFF_CHARGE_SECONDS, chargedStaffRange } from './staff-charge.js';
import { HOURGLASS_RULES } from './hourglass-spell.js';
import { traceRangedProjectile } from './projectile-collision.js';
import { createStaffAimRing } from './staff-aim.js';
import { createMeteorVisuals } from './meteor-visuals.js';

export const METEOR_RULES = Object.freeze({ range: STAFF_THROW_RANGE, chargeSeconds: STAFF_CHARGE_SECONDS,
  radius: HOURGLASS_RULES.radius, arcHeight: 8, speed: 9, minFlight: 1.25,
  startDiameter: .45, endDiameter: 1.75, aftermath: 4.6, groundFireSeconds: 4, groundFireFade: .6,
  fragments: 8, fragmentRadius: .24, fragmentSpeed: 4.3, fragmentLife: 3.4,
  fragmentDamageRatio: .125, burnSeconds: 3, burnDps: 2 });

export function meteorDiameter(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  return METEOR_RULES.startDiameter + (METEOR_RULES.endDiameter - METEOR_RULES.startDiameter) * t;
}

/** One aimed meteor per caster, swept along its growing 3D hull. All animation
 * and damage share simulation time; pausing, switching and reset cannot duplicate hits. */
export function createMeteorSpell(scene, world, combat, ownerId, onDamage = () => {}, isVisible = null, { prototype = null, random = Math.random } = {}) {
  const r = METEOR_RULES, visible = p => !isVisible || isVisible(p), ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const aimRing = createStaffAimRing(r.radius, { color: '#ffb15a' });
  const rangeRing = createStaffAimRing(r.range, { range: true }); scene.add(aimRing, rangeRing);
  const visuals = createMeteorVisuals(scene, r, { prototype, isVisible, heightAt: world?.heightAt?.bind(world) });
  let aim = null, flight = null, impact = null, fragments = [], fragmentHits = new Set(), casts = 0, blastHits = 0;
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  const collisionNormal = new THREE.Vector3(), rotationAxis = new THREE.Vector3(), rotationStep = new THREE.Quaternion();
  function refresh(position) {
    if (!aim) return;
    aim.caster.copy(position); aim.range = chargedStaffRange(aim.age, r.range);
    const dx = aim.requested.x - position.x, dz = aim.requested.z - position.z;
    const scale = Math.min(1, aim.range / (Math.hypot(dx, dz) || 1));
    aim.target.set(position.x + dx * scale, 0, position.z + dz * scale); aim.target.y = ground(aim.target);
    aim.valid = !(world?.isWater?.(aim.target.x, aim.target.z) || world?.isLand && !world.isLand(aim.target.x, aim.target.z));
    aimRing.position.copy(aim.target); aimRing.position.y += .07; aimRing.visible = aim.valid && visible(aim.target);
    aimRing.userData.update(aim.age);
    rangeRing.position.set(position.x, ground(position) + .06, position.z);
    rangeRing.scale.setScalar(Math.max(.001, aim.range / r.range)); rangeRing.visible = visible(position);
  }
  function beginAim(position, direction = 0) {
    if (aim || flight || impact || !position) return false;
    aim = { age: 0, range: 0, valid: false, target: new THREE.Vector3(), caster: position.clone(),
      requested: new THREE.Vector3(position.x + Math.sin(direction) * r.range, 0, position.z + Math.cos(direction) * r.range) };
    refresh(position); return true;
  }
  function aimAt(position, point) {
    if (!aim || !Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return;
    aim.requested.set(point.x, 0, point.z); refresh(position);
  }
  function cancelAim() { aim = null; aimRing.visible = rangeRing.visible = false; }
  function hit(target, payload) {
    const result = combat?.hit(target, payload); if (result && !result.blocked) onDamage(result); return result;
  }
  function explode(position, payload, normal = null) {
    const center = position.clone();
    // Move the blast to the incoming side of a wall; radial damage still checks
    // the wall independently, so a blocked meteor cannot hurt its far side.
    if (normal) { center.x += (normal.x ?? 0) * .2; center.z += (normal.z ?? 0) * .2; }
    center.y = ground(center); flight = null; impact = { center, age: 0, nextIgnition: 0, ignited: new Set(), groundFire: !world?.isWater?.(center.x, center.z) }; blastHits = 0;
    for (const target of combat?.targets?.values() ?? []) {
      if (!target.alive || target.id === ownerId || target.targetable === false || !target.position) continue;
      const p = target.position;
      if (Math.hypot(p.x - center.x, p.z - center.z) > r.radius + (target.radius ?? 0) || Math.abs((p.y ?? ground(p)) - center.y) > 2) continue;
      const wall = world?.traceProjectile?.({ x: center.x, y: center.y + .7, z: center.z }, { x: p.x, y: (p.y ?? ground(p)) + .7, z: p.z }, .04);
      if (wall && wall.collider?.destructibleId !== target.id && wall.collider?.objectId !== target.id) continue;
      if (hit(target, { ...payload, sourceId: ownerId, type: 'meteor' })) blastHits++;
    }
    fragmentHits.clear();
    const rotation = random() * Math.PI * 2;
    fragments = Array.from({ length: r.fragments }, (_, i) => {
      const angle = rotation + (i + (random() - .5) * .85) * Math.PI * 2 / r.fragments;
      const speed = r.fragmentSpeed * (.7 + random() * .35), radius = r.fragmentRadius * (.9 + random() * .45);
      const spin = new THREE.Vector3((random() - .5) * 15, (random() - .5) * 18, (random() - .5) * 15);
      return { position: center.clone().add(new THREE.Vector3(Math.cos(angle) * .3, .65, Math.sin(angle) * .3)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 3.2 + random() * 2, Math.sin(angle) * speed),
        radius, spin, orientation: new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 6, random() * 6, random() * 6)),
        bounce: .32 + random() * .16, maxBounces: 1 + Math.floor(random() * 2),
        bounces: 0, phase: 'airborne', age: 0, active: true, canHit: true, payload };
    });
    igniteGround();
    visuals.impact(center, impact.groundFire);
    visuals.fragments(fragments);
  }
  function igniteGround() {
    if (!impact?.groundFire || impact.age >= r.groundFireSeconds || impact.age < impact.nextIgnition) return;
    impact.nextIgnition = impact.age + .2;
    for (const target of combat?.targets?.values() ?? []) {
      if (!target.alive || target.id === ownerId || target.targetable === false || !target.position) continue;
      const p = target.position, center = impact.center;
      if (Math.hypot(p.x - center.x, p.z - center.z) > r.radius + Math.min(.3, target.radius ?? 0)
        || Math.abs((p.y ?? ground(p)) - center.y) > 2 || world?.isWater?.(p.x, p.z)) continue;
      const wall = world?.traceProjectile?.({ x: center.x, y: center.y + .3, z: center.z },
        { x: p.x, y: (p.y ?? ground(p)) + .3, z: p.z }, .04);
      if (wall && wall.collider?.destructibleId !== target.id && wall.collider?.objectId !== target.id) continue;
      // Refresh the existing burn status: standing in fire does not stack a
      // second damage stream, and a stronger fire keeps its source/strength.
      if (target.burnRemaining < r.burnSeconds) {
        if (combat?.applyBurn?.(target, { duration: r.burnSeconds, damagePerSecond: r.burnDps }, ownerId)) impact.ignited.add(target.id);
      }
    }
  }
  function release(payload, origin = null, blocked = null) {
    if (!aim?.valid || flight || impact) { cancelAim(); return false; }
    const launch = origin ? new THREE.Vector3(origin.x, origin.y, origin.z) : aim.caster.clone().add(new THREE.Vector3(0, 1.4, 0));
    if (![launch.x, launch.y, launch.z].every(Number.isFinite)) return false;
    const target = aim.target.clone(); target.y += r.endDiameter / 2;
    const data = { damage: Math.max(0, payload?.damage ?? 0), sourceId: ownerId };
    cancelAim(); casts++; fragmentHits.clear(); blastHits = 0;
    visuals.reset();
    if (blocked?.point) { explode(new THREE.Vector3(blocked.point.x, blocked.point.y, blocked.point.z), data, blocked.normal); return true; }
    flight = { origin: launch, target, position: launch.clone(), age: 0, duration: Math.max(r.minFlight, launch.distanceTo(target) / r.speed), diameter: r.startDiameter, payload: data };
    aimRing.position.set(target.x, ground(target) + .07, target.z); aimRing.visible = visible(target);
    visuals.flight(flight.position, flight.diameter, 0);
    return true;
  }
  function stepFragments(dt) {
    for (const f of fragments) {
      if (!f.active) continue;
      f.age += dt;
      if (f.age >= r.fragmentLife) { f.active = false; continue; }
      if (f.phase === 'resting') continue;
      start.copy(f.position);
      const rolling = f.phase === 'rolling';
      if (rolling) {
        // Ground friction slows the rock while terrain gradient nudges it
        // downhill. Geometry stays above the sampled ground even on slopes.
        const e = .12;
        const gx = ((world?.heightAt?.(start.x + e, start.z) ?? 0) - (world?.heightAt?.(start.x - e, start.z) ?? 0)) / (2 * e);
        const gz = ((world?.heightAt?.(start.x, start.z + e) ?? 0) - (world?.heightAt?.(start.x, start.z - e) ?? 0)) / (2 * e);
        f.velocity.x -= gx * 4 * dt; f.velocity.z -= gz * 4 * dt;
        const speed = Math.hypot(f.velocity.x, f.velocity.z);
        const damping = Math.max(0, speed * Math.exp(-1.35 * dt) - .25 * dt) / (speed || 1);
        f.velocity.x *= damping; f.velocity.z *= damping; f.velocity.y = 0;
      }
      end.copy(start).addScaledVector(f.velocity, dt);
      if (rolling) end.y = ground(end) + f.radius;
      else end.y -= 5 * dt * dt;
      // Rolling rocks meet physical low barriers; an airborne fragment uses
      // the same ranged collision contract as the parent meteor.
      const wall = rolling ? world?.traceProjectile?.(start, end, f.radius) : traceRangedProjectile(world, start, end, f.radius);
      let target = f.canHit ? combat?.traceSegment(start, end, f.radius, ownerId, fragmentHits) : null;
      const shield=f.canHit?combat?.traceShield?.(start,end,f.radius,ownerId):null;
      if(shield&&(!target||shield.t<=target.t)&&(!wall||shield.t<(wall.t??0))){
        combat.blockProjectile(shield.target,f.payload,shield.point,shield.normal);f.position.copy(shield.point);f.velocity.reflect(new THREE.Vector3(shield.normal.x,shield.normal.y,shield.normal.z)).multiplyScalar(.55);f.canHit=false;continue;
      }
      if (target && (!wall || target.t < (wall.t ?? 0) - .0001)) {
        hit(target.target, { damage: f.payload.damage * r.fragmentDamageRatio, sourceId: ownerId, type: 'meteor-fragment', delivery:'projectile',
          burn: { duration: r.burnSeconds, damagePerSecond: r.burnDps } });
        fragmentHits.add(target.target.id); f.canHit = false;
        f.position.copy(target.point);
        collisionNormal.set(f.position.x - target.target.position.x, 0, f.position.z - target.target.position.z);
        if (collisionNormal.lengthSq() < 1e-8) collisionNormal.set(-f.velocity.x, 0, -f.velocity.z);
        if (collisionNormal.lengthSq() < 1e-8) collisionNormal.set(1, 0, 0);
        collisionNormal.normalize();
        // A cast can begin inside a target's footprint. Clear the actor only
        // as far as physical barriers allow, including nearby thin walls.
        const clearance = (target.target.radius ?? 0) + f.radius + .025;
        end.set(target.target.position.x + collisionNormal.x * clearance, f.position.y,
          target.target.position.z + collisionNormal.z * clearance);
        const clearanceWall = world?.traceProjectile?.(f.position, end, f.radius);
        if (clearanceWall?.point) {
          collisionNormal.set(clearanceWall.normal?.x ?? 0, clearanceWall.normal?.y ?? 0, clearanceWall.normal?.z ?? 0);
          if (collisionNormal.lengthSq() < 1e-8) collisionNormal.copy(f.position).sub(end);
          if (collisionNormal.lengthSq() < 1e-8) collisionNormal.set(1, 0, 0);
          collisionNormal.normalize();
          f.position.copy(clearanceWall.point).addScaledVector(collisionNormal, .025);
        } else f.position.copy(end);
        const incoming = f.velocity.dot(collisionNormal);
        if (incoming < 0) f.velocity.addScaledVector(collisionNormal, -1.35 * incoming);
        f.velocity.x *= .7; f.velocity.z *= .7;
      } else if (wall?.point) {
        f.position.copy(wall.point);
        collisionNormal.set(wall.normal?.x ?? 0, wall.normal?.y ?? 0, wall.normal?.z ?? 0);
        if (collisionNormal.lengthSq() < 1e-8) collisionNormal.copy(start).sub(end);
        if (collisionNormal.lengthSq() < 1e-8) collisionNormal.set(1, 0, 0);
        collisionNormal.normalize(); f.position.addScaledVector(collisionNormal, .025);
        const incoming = f.velocity.dot(collisionNormal);
        if (incoming < 0) f.velocity.addScaledVector(collisionNormal, -1.4 * incoming);
        f.velocity.x *= .72; f.velocity.z *= .72;
      } else f.position.copy(end);
      if (!rolling) f.velocity.y -= 10 * dt;
      const floor = ground(f.position) + f.radius;
      if (rolling || f.position.y <= floor) {
        if (world?.isWater?.(f.position.x, f.position.z)) { f.active = false; continue; }
        f.position.y = floor;
        if (!rolling && f.bounces < f.maxBounces && Math.abs(f.velocity.y) > 1.2) {
          f.bounces++; f.velocity.y = Math.abs(f.velocity.y) * f.bounce;
          f.velocity.x *= .68; f.velocity.z *= .68;
        } else {
          f.phase = 'rolling'; f.velocity.y = 0;
          if (Math.hypot(f.velocity.x, f.velocity.z) < .12) {
            f.phase = 'resting'; f.velocity.set(0, 0, 0);
          }
        }
      }
      if (f.phase === 'rolling') {
        const dx = f.position.x - start.x, dz = f.position.z - start.z, distance = Math.hypot(dx, dz);
        if (distance > 1e-8) {
          rotationAxis.set(dz, 0, -dx).normalize();
          f.orientation.premultiply(rotationStep.setFromAxisAngle(rotationAxis, distance / f.radius)).normalize();
        }
      } else if (f.phase === 'airborne') {
        const angularSpeed = f.spin.length();
        if (angularSpeed > 1e-8) f.orientation.premultiply(rotationStep.setFromAxisAngle(rotationAxis.copy(f.spin).divideScalar(angularSpeed), angularSpeed * dt)).normalize();
      }
    }
  }
  function update(dt, position) {
    if (!(dt > 0)) return;
    if (aim && position) { aim.age += dt; refresh(position); }
    // Fine steps keep curved trajectories and fragments reliable at low FPS.
    let remaining = dt;
    while (remaining > 1e-8 && (flight || impact)) {
      const step = Math.min(1 / 60, remaining); remaining -= step;
      if (flight) {
        start.copy(flight.position); flight.age = Math.min(flight.duration, flight.age + step);
        const t = flight.age / flight.duration; flight.diameter = meteorDiameter(t);
        end.copy(flight.origin).lerp(flight.target, t); end.y += 4 * t * (1 - t) * r.arcHeight;
        const wall = traceRangedProjectile(world, start, end, flight.diameter / 2);
        flight.position.copy(wall?.point ?? end);
        visuals.flight(flight.position, flight.diameter, flight.age);
        visuals.update(step);
        aimRing.userData.update(flight.age); aimRing.visible = visible(flight.target);
        if (wall || t >= 1 || end.y <= ground(end) + flight.diameter / 2 && end.y < start.y) {
          const payload = flight.payload, point = flight.position.clone(); aimRing.visible = false;
          explode(point, payload, wall?.normal);
        }
      } else {
        impact.age += step; stepFragments(step); igniteGround();
        visuals.fragments(fragments); visuals.update(step);
        if (impact.age >= r.aftermath) { impact = null; fragments = []; visuals.reset(); }
      }
    }
  }
  function reset() { cancelAim(); flight = impact = null; fragments = []; fragmentHits.clear(); casts = blastHits = 0; visuals.reset(); }
  let disposed = false;
  return { beginAim, aimAt, release, cancelAim, update, reset,
    get aiming() { return Boolean(aim); }, get busy() { return Boolean(flight || impact); },
    get telemetry() { return { aiming: Boolean(aim), aim: aim ? { ...aim.target } : null,
      aimRange: aim ? { radius: aim.range, maximum: r.range, heldSeconds: aim.age } : null,
      active: Boolean(flight || impact), phase: flight ? 'flight' : impact ? 'impact' : 'idle', casts, blastHits,
      radius: r.radius, age: flight?.age ?? impact?.age ?? 0,
      center: flight ? { x: flight.target.x, y: ground(flight.target), z: flight.target.z } : impact ? { ...impact.center } : null,
      flight: flight ? { position: { ...flight.position }, duration: flight.duration, progress: flight.age / flight.duration, diameter: flight.diameter, arcHeight: r.arcHeight } : null,
      groundFire: impact ? { active: impact.groundFire && impact.age < r.groundFireSeconds,
        remaining: impact.groundFire ? Math.max(0, r.groundFireSeconds - impact.age) : 0,
        radius: r.radius, ignited: impact.ignited.size } : null,
      fragmentHitIds: [...fragmentHits], fragments: fragments.filter(f => f.active).length,
      fragmentStates: fragments.map(f => ({ position: { ...f.position }, velocity: { ...f.velocity }, diameter: f.radius * 2, bounces: f.bounces, phase: f.phase, age: f.age, orientation: { x: f.orientation.x, y: f.orientation.y, z: f.orientation.z, w: f.orientation.w }, active: f.active })), fragmentHits: fragmentHits.size, visuals: visuals.telemetry }; },
    dispose() { if (disposed) return; disposed = true; reset(); visuals.dispose();
      for (const mesh of [aimRing, rangeRing]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
