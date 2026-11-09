import * as THREE from 'three';

// All times are seconds and all distances are in world metres.
// Keep crowd control independent of rarity: only the blast damage scales.
export const GRAVITY_RULES = Object.freeze({
  range: 10, radius: 2.2, warning: .4, pullDuration: 1,
  pullSpeed: 1.5, maxPull: 1.5, minCenterDistance: .2,
  afterglow: .35,
});

export function gravityPullStep(distance, moved, dt, rules = GRAVITY_RULES) {
  if (!(dt > 0) || !(distance > rules.minCenterDistance)) return 0;
  return Math.max(0, Math.min(distance - rules.minCenterDistance,
    rules.maxPull - moved, rules.pullSpeed * dt));
}

/** One reusable ground-targeted gravity field; no lights, bloom or new textures. */
export function createGravitySpell(scene, world, combat, ownerId, onDamage = () => {}, isVisible = null) {
  const rules = GRAVITY_RULES;
  const geometries = [], materials = [];
  const geo = g => (geometries.push(g), g);
  const mat = m => (materials.push(m), m);
  const alpha = (color, opacity) => mat(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  }));
  const violet = alpha('#ad72ff', .8), dark = alpha('#3c1968', .35);
  const warningFill = alpha('#9a55e3', .13), warningEdge = alpha('#d1a3ff', .8);
  const pulse = alpha('#bf8bff', .6), coreMat = mat(new THREE.MeshStandardMaterial({
    color: '#10091b', emissive: '#692ac6', emissiveIntensity: .65, metalness: .55, roughness: .32,
  }));
  const shardMat = mat(new THREE.MeshBasicMaterial({ color: '#ad78ed' }));
  const diskGeometry = geo(new THREE.CircleGeometry(rules.radius, 48));
  const edgeGeometry = geo(new THREE.RingGeometry(rules.radius - .08, rules.radius, 48));
  const innerGeometry = geo(new THREE.RingGeometry(.35, .45, 40));
  const orbGeometry = geo(new THREE.SphereGeometry(.24, 12, 9));
  const orbitalGeometry = geo(new THREE.TorusGeometry(.48, .018, 5, 36));
  const shardGeometry = geo(new THREE.OctahedronGeometry(.055, 0));
  const aimGroup = new THREE.Group(); aimGroup.name = 'Gravitationsstab · Zielkreis';
  const aimFill = new THREE.Mesh(diskGeometry, warningFill);
  const aimEdge = new THREE.Mesh(edgeGeometry, warningEdge);
  aimFill.rotation.x = aimEdge.rotation.x = -Math.PI / 2;
  aimFill.renderOrder = aimEdge.renderOrder = 31;
  aimGroup.add(aimFill, aimEdge); aimGroup.visible = false; scene.add(aimGroup);
  const fieldGroup = new THREE.Group(); fieldGroup.name = 'Gravitationsfeld · Sog und Explosion';
  const fieldFill = new THREE.Mesh(diskGeometry, dark);
  const fieldEdge = new THREE.Mesh(edgeGeometry, violet);
  const shockwave = new THREE.Mesh(innerGeometry, pulse);
  fieldFill.rotation.x = fieldEdge.rotation.x = shockwave.rotation.x = -Math.PI / 2;
  fieldFill.position.y = .008; fieldEdge.position.y = .014; shockwave.position.y = .025;
  fieldGroup.add(fieldFill, fieldEdge, shockwave);
  const core = new THREE.Mesh(orbGeometry, coreMat);
  core.position.y = .38; core.castShadow = false; fieldGroup.add(core);
  const orbitA = new THREE.Mesh(orbitalGeometry, violet);
  const orbitB = new THREE.Mesh(orbitalGeometry, violet);
  orbitA.position.y = orbitB.position.y = .38;
  orbitA.rotation.x = 1.1; orbitB.rotation.z = 1.2;
  fieldGroup.add(orbitA, orbitB);
  const shards = Array.from({ length: 12 }, (_, index) => {
    const shard = new THREE.Mesh(shardGeometry, shardMat);
    shard.userData.index = index; fieldGroup.add(shard); return shard;
  });
  fieldGroup.visible = false; scene.add(fieldGroup);

  const ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const visibleAt = p => !isVisible || isVisible(p);
  let aim = null, field = null, castCount = 0, lastHitCount = 0;

  function aimAt(position, requested) {
    if (!aim || !requested || !Number.isFinite(requested.x) || !Number.isFinite(requested.z)) return;
    const dx = requested.x - position.x, dz = requested.z - position.z;
    const distance = Math.hypot(dx, dz);
    const factor = Math.min(1, rules.range / (distance || 1));
    const point = new THREE.Vector3(position.x + dx * factor, 0, position.z + dz * factor);
    point.y = ground(point);
    // Gravity is ground magic, not a way of targeting through solid cover.
    const wall = world?.traceProjectile?.(
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
    aimGroup.position.set(point.x, point.y + .055, point.z);
  }
  function beginAim(position, direction) {
    if (aim || !position) return false;
    aim = { target: new THREE.Vector3(position.x, ground(position), position.z) };
    aimGroup.visible = true;
    aimAt(position, { x: position.x + Math.sin(direction) * 6, z: position.z + Math.cos(direction) * 6 });
    return true;
  }
  function cancelAim() { aim = null; aimGroup.visible = false; }
  function release(payload) {
    if (!aim || field) { cancelAim(); return false; }
    const center = aim.target.clone();
    cancelAim();
    field = { center, age: 0, exploded: false, pulled: new Map(), payload: { ...payload, sourceId: ownerId } };
    castCount++; lastHitCount = 0;
    fieldGroup.position.set(center.x, center.y + .05, center.z);
    fieldGroup.visible = true;
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
      const next = new THREE.Vector3(p.x + dx / distance * step, p.y ?? ground(p), p.z + dz / distance * step);
      if (world?.isLand && !world.isLand(next.x, next.z) || world?.isWater?.(next.x, next.z)) continue;
      world?.resolveMovement?.(next, target.radius ?? .42);
      const actual = Math.hypot(next.x - p.x, next.z - p.z);
      if (actual <= 1e-6) continue;
      p.x = next.x; p.z = next.z;
      p.y = ground(p);
      field.pulled.set(target.id, moved + Math.min(step, actual));
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
  function update(dt, position, time = 0) {
    if (!(dt > 0)) return;
    if (aim && position) aimGroup.visible = visibleAt(aim.target);
    if (!field) return;
    const before = field.age;
    field.age += dt;
    const activeStart = rules.warning, activeEnd = rules.warning + rules.pullDuration;
    const active = Math.max(0, Math.min(field.age, activeEnd) - Math.max(before, activeStart));
    if (active > 0 && !field.exploded) pull(active);
    if (field.age >= activeEnd && !field.exploded) explode();
    const activePhase = Math.max(0, Math.min(1, (field.age - rules.warning) / rules.pullDuration));
    fieldGroup.visible = visibleAt(field.center);
    core.visible = orbitA.visible = orbitB.visible = field.age >= rules.warning && !field.exploded;
    core.scale.setScalar(.3 + .7 * activePhase);
    orbitA.rotation.y = time * 2.7; orbitB.rotation.x = time * -2;
    fieldEdge.material.opacity = field.age < rules.warning ? .75 : field.exploded ? .38 : .9;
    fieldFill.material.opacity = field.age < rules.warning ? .10 : field.exploded ? .08 : .26;
    shockwave.visible = field.exploded;
    if (field.exploded) {
      const progress = Math.min(1, (field.age - activeEnd) / rules.afterglow);
      shockwave.scale.setScalar(.5 + progress * (rules.radius / .45));
      pulse.opacity = (1 - progress) * .65;
    }
    for (const shard of shards) {
      shard.visible = field.age >= rules.warning && !field.exploded;
      const angle = shard.userData.index * Math.PI * 2 / shards.length + time * .8;
      const radius = rules.radius * (.82 - activePhase * .58);
      shard.position.set(Math.cos(angle) * radius, .14 + Math.sin(time * 3 + shard.userData.index) * .13, Math.sin(angle) * radius);
      shard.rotation.set(time, angle, time * 1.4);
    }
    if (field.age >= activeEnd + rules.afterglow) { field = null; fieldGroup.visible = false; }
  }
  function reset() {
    cancelAim(); field = null; fieldGroup.visible = false;
    castCount = lastHitCount = 0;
  }
  function dispose() {
    reset(); aimGroup.removeFromParent(); fieldGroup.removeFromParent();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  }
  return { beginAim, aimAt, cancelAim, release, update, reset, dispose,
    get aiming() { return Boolean(aim); },
    get telemetry() {
      return { aiming: Boolean(aim), aim: aim ? { x: aim.target.x, z: aim.target.z } : null,
        active: Boolean(field), castCount, lastHitCount, age: field?.age ?? 0, exploded: field?.exploded ?? false,
        center: field ? { x: field.center.x, z: field.center.z } : null,
        pulled: field ? Object.fromEntries(field.pulled) : {} };
    } };
}
