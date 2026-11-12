import * as THREE from 'three';
import { STAFF_THROW_RANGE, STAFF_CHARGE_SECONDS, chargedStaffRange } from './staff-charge.js';
import { traceRangedProjectile } from './projectile-collision.js';
import { createStaffAimRing } from './staff-aim.js';
import { createHourglassVisuals } from './hourglass-visuals.js';

export const HOURGLASS_RULES = Object.freeze({ range: STAFF_THROW_RANGE, chargeSeconds: STAFF_CHARGE_SECONDS,
  radius: 3.2, warning: .6, duration: 4, dissolve: .85, slowStart: .15, slowMax: .65, ramp: 2.2, recovery: .25 });

export function createHourglassSpell(scene, world, combat, ownerId, isVisible = null) {
  const r = HOURGLASS_RULES, source = Symbol('hourglass:' + ownerId);
  const aimMesh = createStaffAimRing(r.radius, { color: '#ffd176' });
  const rangeMesh = createStaffAimRing(r.range, { range: true }); scene.add(aimMesh, rangeMesh);
  const visuals = createHourglassVisuals(scene, r, world?.heightAt?.bind(world));
  const ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const visible = p => !isVisible || isVisible(p);
  let aim = null, field = null, casts = 0;
  function refresh(position) {
    if (!aim) return;
    const dx = aim.requested.x - position.x, dz = aim.requested.z - position.z;
    aim.range = chargedStaffRange(aim.age, r.range);
    const factor = Math.min(1, aim.range / (Math.hypot(dx, dz) || 1));
    const point = new THREE.Vector3(position.x + dx * factor, 0, position.z + dz * factor); point.y = ground(point);
    const wall = traceRangedProjectile(world, { x: position.x, y: ground(position) + .7, z: position.z },
      { x: point.x, y: point.y + .7, z: point.z }, .04);
    if (wall?.point) {
      const length = Math.hypot(dx, dz) || 1;
      point.set(wall.point.x - dx / length * .18, 0, wall.point.z - dz / length * .18); point.y = ground(point);
    }
    aim.valid = !(world?.isWater?.(point.x, point.z) || world?.isLand && !world.isLand(point.x, point.z));
    aim.target.copy(point); aimMesh.position.copy(point); aimMesh.position.y += .07;
    aimMesh.visible = aim.valid && visible(point); aimMesh.userData.update(aim.age);
    rangeMesh.position.set(position.x, ground(position) + .06, position.z);
    rangeMesh.scale.setScalar(Math.max(.001, aim.range / r.range)); rangeMesh.visible = visible(position);
  }
  function beginAim(position, direction = 0) {
    if (aim || !position) return false;
    aim = { target: new THREE.Vector3(), requested: new THREE.Vector3(position.x + Math.sin(direction) * r.range, 0, position.z + Math.cos(direction) * r.range), age: 0, range: 0, valid: false };
    refresh(position); return true;
  }
  function aimAt(position, point) { if (aim && Number.isFinite(point?.x) && Number.isFinite(point?.z)) { aim.requested.set(point.x, 0, point.z); refresh(position); } }
  function cancelAim() { aim = null; aimMesh.visible = rangeMesh.visible = false; }
  function clearSlow() { for (const t of combat?.targets?.values() ?? []) t.timeSlows?.delete(source); }
  function release() {
    if (!aim?.valid) { cancelAim(); return false; }
    clearSlow(); field = { center: aim.target.clone(), age: 0, exposure: new Map() }; casts++;
    cancelAim(); visuals.show(field.center, 0, visible(field.center)); return true;
  }
  function update(dt, position) {
    if (!(dt > 0)) return;
    if (aim && position) { aim.age += dt; refresh(position); }
    if (!field) return;
    const before = field.age; field.age += dt;
    const active = Math.max(0, Math.min(field.age, r.warning + r.duration) - Math.max(before, r.warning));
    const activeNow = field.age >= r.warning && field.age < r.warning + r.duration;
    if (activeNow) for (const t of combat?.targets?.values() ?? []) {
      if (!t.alive || t.id === ownerId || t.destructible || t.targetable === false || !t.position) continue;
      const p = t.position, distance = Math.hypot(p.x - field.center.x, p.z - field.center.z);
      const inside = distance <= r.radius + Math.min(.3, t.radius ?? 0) && Math.abs((p.y ?? ground(p)) - field.center.y) <= 2
        && !world?.traceProjectile?.({ x: field.center.x, y: field.center.y + .7, z: field.center.z }, { x: p.x, y: (p.y ?? ground(p)) + .7, z: p.z }, .04);
      if (!inside) { field.exposure.delete(t.id); continue; }
      const exposure = (field.exposure.get(t.id) ?? 0) + active; field.exposure.set(t.id, exposure);
      const multiplier = 1 - (r.slowStart + (r.slowMax - r.slowStart) * Math.min(1, exposure / r.ramp));
      combat?.setTimeSlow?.(t, source, multiplier, r.recovery);
    }
    visuals.show(field.center, field.age, visible(field.center));
    if (field.age >= r.warning + r.duration + r.dissolve) { field = null; visuals.hide(); }
  }
  function reset() { clearSlow(); cancelAim(); field = null; casts = 0; visuals.hide(); }
  return { beginAim, aimAt, cancelAim, release, update, reset,
    get aiming() { return Boolean(aim); },
    get telemetry() { return { aiming: Boolean(aim), aim: aim ? { ...aim.target } : null, aimRange: aim ? { radius: aim.range, maximum: r.range, heldSeconds: aim.age } : null,
      active: Boolean(field), age: field?.age ?? 0, center: field ? { ...field.center } : null, radius: r.radius, casts, visuals: visuals.telemetry }; },
    dispose() { reset(); visuals.dispose(); for (const mesh of [aimMesh, rangeMesh]) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}
