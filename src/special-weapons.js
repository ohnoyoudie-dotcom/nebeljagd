import * as THREE from 'three';
import { createPoisonVisuals } from './poison-visuals.js';
import { createImpactSparks } from './impact-sparks.js';

export const SPECIAL_RULES = Object.freeze({ moonRange: 12, moonSpeed: 18, returnSpeed: 24,
  poisonRange: 12, poisonSpeed: 8.5, poisonArcHeight: 4, poisonMinFlight: .6,
  cloudRadius: 2.4, cloudDuration: 3 });

/** Owns the complete flight/return and ground-area lifetimes, independent of input. */
export function createSpecialWeapons(scene, world, combat, ownerId, onDamage, isVisible, { moonProjectilePrototype = null } = {}) {
  const roots = [], geometries = new Set(), materials = new Set();
  const geometry = value => (geometries.add(value), value);
  const material = value => (materials.add(value), value);
  const silver = material(new THREE.MeshStandardMaterial({ color: '#ede1ff', emissive: '#a378da', emissiveIntensity: .8, metalness: .55, roughness: .25 }));
  const ringGeometry = geometry(new THREE.RingGeometry(SPECIAL_RULES.cloudRadius - .07, SPECIAL_RULES.cloudRadius, 48));
  const ringMaterial = material(new THREE.MeshBasicMaterial({ color: '#91ab53', side: THREE.DoubleSide, transparent: true, opacity: .22, depthWrite: false }));
  function root(object) { roots.push(object); scene.add(object); return object; }
  const targetMaterial = material(ringMaterial.clone()); targetMaterial.depthTest = false; targetMaterial.color.set('#e4ffa1'); targetMaterial.opacity = .85;
  const targetRing = root(new THREE.Mesh(ringGeometry, targetMaterial)); targetRing.renderOrder = 30;
  targetRing.name = 'Giftwolke · Zielbereich'; targetRing.rotation.x = -Math.PI / 2; targetRing.visible = false;
  let crescent;
  if (moonProjectilePrototype) {
    crescent = new THREE.Group();
    const model = moonProjectilePrototype.clone(true);
    // Newly prepared crescents retain their source XY silhouette. Older
    // prototypes are already horizontal; spin their common parent about Y.
    if (moonProjectilePrototype.userData.silhouettePlane === 'XY') model.rotation.x = -Math.PI / 2;
    model.traverse(part => {
      if (!part.isMesh) return;
      const copy = source => {
        const own = material(source.clone());
        if (own.emissive) { own.emissive.set('#786f9f'); own.emissiveIntensity = .13; }
        return own;
      };
      part.material = Array.isArray(part.material) ? part.material.map(copy) : copy(part.material);
      part.castShadow = part.receiveShadow = false;
    });
    crescent.add(model);
  } else {
    // Headless behavior tests can omit model resources. The game loader always
    // supplies the verified uploaded crescent and rejects failed asset loads.
    const shape = new THREE.Shape();
    shape.moveTo(0, .6); shape.bezierCurveTo(-.85, .35, -.85, -.35, 0, -.6);
    shape.bezierCurveTo(-.35, -.2, -.35, .2, 0, .6);
    const crescentGeometry = geometry(new THREE.ExtrudeGeometry(shape, { depth: .09, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 1, steps: 1, curveSegments: 16 }));
    crescent = new THREE.Mesh(crescentGeometry, silver);
  }
  const moonMesh = root(crescent);
  moonMesh.name = 'Mondstab · Rückkehrende Sichel';
  if (!moonProjectilePrototype) moonMesh.rotation.x = -Math.PI / 2;
  moonMesh.visible = false;
  let moon = null, aim = null;
  const orbs = [], clouds = [];
  const canSee = p => !isVisible || isVisible(p);
  const moonImpacts = createImpactSparks(scene, canSee);
  const poisonVisuals = createPoisonVisuals(scene, SPECIAL_RULES.cloudRadius, canSee);
  const ground = p => world?.heightAt?.(p.x, p.z) ?? 0;
  const hit = (target, payload) => { const result = combat?.hit(target, payload); if (result) onDamage(result); };
  function aimAt(position, point) {
    if (!aim || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    const dx = point.x - position.x, dz = point.z - position.z;
    const factor = Math.min(1, SPECIAL_RULES.poisonRange / (Math.hypot(dx, dz) || 1));
    aim.target.set(position.x + dx * factor, 0, position.z + dz * factor);
    aim.target.y = ground(aim.target) + .06;
    targetRing.position.copy(aim.target);
  }
  function beginAim(position, direction) {
    if (aim) return false;
    aim = { target: new THREE.Vector3() }; targetRing.visible = true;
    aimAt(position, { x: position.x + Math.sin(direction) * 6, z: position.z + Math.cos(direction) * 6 });
    return true;
  }
  function cancelAim() { aim = null; targetRing.visible = false; }
  function releasePoison(origin, payload, blocked = null) {
    if (!aim) return false;
    if (blocked) { cloudAt(blocked.point, { ...payload, sourceId: ownerId }); cancelAim(); return true; }
    const visual = poisonVisuals.createProjectile(origin);
    visual.group.visible = canSee(origin);
    orbs.push({ mesh: visual.group, visual, origin: origin.clone(), target: aim.target.clone(), age: 0,
      duration: Math.max(SPECIAL_RULES.poisonMinFlight, origin.distanceTo(aim.target) / SPECIAL_RULES.poisonSpeed),
      payload: { ...payload, sourceId: ownerId } });
    cancelAim(); return true;
  }
  function launchMoon(origin, direction, payload, blocked = null) {
    if (moon) return false;
    moon = { mode: blocked ? 'returning' : 'outbound', distance: 0, age: 0, direction, payload: { ...payload, sourceId: ownerId },
      outboundHits: new Set(), returnHits: new Set() };
    moonMesh.position.copy(blocked?.point ?? origin); moonMesh.visible = true;
    if (blocked) moonImpacts.emit(blocked.point, blocked.normal, direction);
    return true;
  }
  function pierce(start, end, hits, payload) {
    // Query every target separately, preserving swept vertical/radial hit rules.
    const ignored = new Set(hits);
    for (let i = 0; i < (combat?.targets?.size ?? 0); i++) {
      const collision = combat.traceSegment(start, end, .3, ownerId, ignored);
      if (!collision) break;
      ignored.add(collision.target.id); hits.add(collision.target.id); hit(collision.target, payload);
    }
  }
  function cloudAt(point, payload, firstUpdateDelta = null) {
    const mesh = root(new THREE.Group()); mesh.name = 'Giftwolke · 3 Sekunden'; mesh.position.copy(point); mesh.position.y = ground(point);
    mesh.visible = canSee(mesh.position);
    const volume = poisonVisuals.createCloud(mesh);
    const boundary = new THREE.Mesh(ringGeometry, ringMaterial); boundary.rotation.x = -Math.PI / 2; boundary.position.y = .07; mesh.add(boundary);
    clouds.push({ mesh, volume, remaining: SPECIAL_RULES.cloudDuration, payload, firstUpdateDelta });
  }
  function retire(list, index) {
    const item = list[index];
    if (item.visual) poisonVisuals.removeProjectile(item.visual);
    if (item.volume) poisonVisuals.removeCloud(item.volume);
    item.mesh.removeFromParent();
    const rootIndex = roots.indexOf(item.mesh); if (rootIndex >= 0) roots.splice(rootIndex, 1);
    list.splice(index, 1);
  }
  function update(dt, position, time) {
    if (!(dt > 0)) return;
    moonImpacts.update(dt);
    poisonVisuals.update(dt);
    if (aim) aimAt(position, aim.target);
    if (moon) {
      moon.age += dt;
      const start = moonMesh.position.clone(), end = start.clone();
      if (moon.mode === 'outbound') {
        const step = Math.min(SPECIAL_RULES.moonSpeed * dt, SPECIAL_RULES.moonRange - moon.distance);
        end.x += Math.sin(moon.direction) * step; end.z += Math.cos(moon.direction) * step;
        const wall = world?.traceProjectile?.(start, end, .15);
        if (wall) { end.copy(wall.point); moonImpacts.emit(wall.point, wall.normal, moon.direction); }
        pierce(start, end, moon.outboundHits, moon.payload);
        moon.distance += start.distanceTo(end);
        if (wall || moon.distance >= SPECIAL_RULES.moonRange - 1e-6) moon.mode = 'returning';
      } else {
        const hand = new THREE.Vector3(position.x, position.y + 1.4, position.z);
        const step = Math.min(SPECIAL_RULES.returnSpeed * dt, start.distanceTo(hand));
        end.addScaledVector(hand.clone().sub(start).normalize(), step);
        pierce(start, end, moon.returnHits, moon.payload);
        if (end.distanceTo(hand) < .25) { moon = null; moonMesh.visible = false; }
      }
      moonMesh.position.copy(end); moonMesh.rotation[moonProjectilePrototype ? 'y' : 'z'] += dt * 12;
      if (moon) { moonMesh.visible = canSee(end); if (moon.age > 15) { moon = null; moonMesh.visible = false; } }
    }
    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i];
      let elapsed = 0;
      // Sweep the curve in short segments, including when a frame crosses the
      // apex. A single chord would incorrectly hit cover below the high arc.
      while (elapsed < dt) {
        const step = Math.min(1 / 60, dt - elapsed, orb.duration - orb.age);
        const start = orb.mesh.position.clone();
        const t = Math.min(1, (orb.age + step) / orb.duration);
        const end = orb.origin.clone().lerp(orb.target, t);
        end.y += 4 * t * (1 - t) * SPECIAL_RULES.poisonArcHeight;
        const wall = world?.traceProjectile?.(start, end, .12);
        const travelled = step * (wall ? THREE.MathUtils.clamp(wall.t ?? 1, 0, 1) : 1);
        orb.age += travelled; elapsed += travelled;
        poisonVisuals.moveProjectile(orb.visual, start, wall?.point ?? end, orb.age);
        if (wall || t >= 1) {
          cloudAt(orb.mesh.position, orb.payload, Math.max(0, dt - elapsed));
          retire(orbs, i); break;
        }
      }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const cloud = clouds[i], active = Math.min(cloud.firstUpdateDelta ?? dt, cloud.remaining);
      cloud.firstUpdateDelta = null; cloud.remaining -= active;
      cloud.mesh.visible = canSee(cloud.mesh.position);
      poisonVisuals.updateCloud(cloud.volume, SPECIAL_RULES.cloudDuration - cloud.remaining, cloud.remaining);
      for (const target of combat?.targets?.values() ?? []) {
        if (!target.alive || target.targetable === false || target.id === ownerId || target.destructible) continue;
        const point = target.position;
        if (Math.hypot(point.x - cloud.mesh.position.x, point.z - cloud.mesh.position.z) > SPECIAL_RULES.cloudRadius + target.radius || Math.abs((point.y ?? 0) - cloud.mesh.position.y) > 2) continue;
        if (world?.traceProjectile?.({ x: cloud.mesh.position.x, y: cloud.mesh.position.y + .6, z: cloud.mesh.position.z }, { x: point.x, y: (point.y ?? 0) + .6, z: point.z }, .03)) continue;
        hit(target, { ...cloud.payload, damage: cloud.payload.damage * active / SPECIAL_RULES.cloudDuration,
          poison: { duration: .25, damagePerSecond: cloud.payload.poison?.damagePerSecond ?? 5 } });
      }
      if (cloud.remaining <= 1e-8) retire(clouds, i);
    }
  }
  function reset() {
    moonImpacts.reset();
    cancelAim(); moon = null; moonMesh.visible = false;
    for (const list of [orbs, clouds]) for (let i = list.length - 1; i >= 0; i--) retire(list, i);
  }
  return { beginAim, aimAt, cancelAim, releasePoison, launchMoon, update, reset,
    get moonBusy() { return Boolean(moon); }, get aiming() { return Boolean(aim); },
    get telemetry() { return { aiming: Boolean(aim), target: aim ? { ...aim.target } : null,
      moonImpacts: moonImpacts.telemetry,
      moonModel: moonProjectilePrototype ? { ...moonProjectilePrototype.userData, imported: true } : { imported: false },
      moonVisible: moonMesh.visible,
      moon: moon ? { mode: moon.mode, distance: moon.distance, position: { ...moonMesh.position }, outboundHits: [...moon.outboundHits], returnHits: [...moon.returnHits] } : null,
      visuals: poisonVisuals.telemetry,
      poisonProjectiles: orbs.length,
      poisonFlights: orbs.map(o => ({ position: { ...o.mesh.position }, origin: { ...o.origin }, target: { ...o.target },
        age: o.age, duration: o.duration, arcHeight: SPECIAL_RULES.poisonArcHeight })),
      clouds: clouds.map(c => ({ remaining: c.remaining, position: { ...c.mesh.position }, radius: SPECIAL_RULES.cloudRadius })) }; },
    dispose() { reset(); moonImpacts.dispose(); poisonVisuals.dispose(); roots.forEach(r => r.removeFromParent()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}
