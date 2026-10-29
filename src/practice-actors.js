import * as THREE from 'three';

/** Small, non-hostile training figures for trying the current local combat system.
 * They are deliberately named practice opponents; they do not simulate players.
 */
export function createPracticeActors(scene, { world, combat, healthBars, vision } = {}) {
  const root = new THREE.Group();
  root.name = 'Übungsplatz · lokale Übungsgegner';
  scene.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const box = (x, y, z) => { const g = new THREE.BoxGeometry(x, y, z); geometries.add(g); return g; };
  const cylinder = (top, bottom, height, sides = 8) => {
    const g = new THREE.CylinderGeometry(top, bottom, height, sides); geometries.add(g); return g;
  };
  const material = (color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...extra });
    materials.add(m); return m;
  };
  const wood = material('#866443');
  const lightWood = material('#c3a16c');
  const dark = material('#3d322b');
  const rim = material('#b5a073', { metalness: .25 });
  const limbGeometry = box(.23, .65, .26), bootGeometry = box(.3, .21, .42);
  const torsoGeometry = cylinder(.4, .3, .69), headGeometry = cylinder(.24, .25, .4);
  const jointGeometry = new THREE.SphereGeometry(.14, 6, 4); geometries.add(jointGeometry);
  const flameGeometry = new THREE.ConeGeometry(.15, .65, 5); geometries.add(flameGeometry);
  const iceGeometry = new THREE.OctahedronGeometry(.17); geometries.add(iceGeometry);
  const ringGeometry = new THREE.RingGeometry(.55, .62, 24); geometries.add(ringGeometry);
  const mesh = (parent, geometry, mat, x, y, z) => {
    const part = new THREE.Mesh(geometry, mat); part.position.set(x, y, z);
    part.castShadow = part.receiveShadow = true; parent.add(part); return part;
  };

  let labelMaterial = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 72;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(19,29,27,.8)'; ctx.fillRect(0, 0, 384, 72);
      ctx.font = '600 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e9d6ad'; ctx.fillText('ÜBUNGSGEGNER', 192, 37);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      textures.add(texture);
      labelMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
      materials.add(labelMaterial);
    }
  }

  const spawn = world.spawn ?? { x: 30, z: -42 };
  function clearGround(x, z, radius = .6) {
    if (world.isLand && !world.isLand(x, z) || world.isWater?.(x, z)) return false;
    if ((world.concealmentAt?.(x, z) ?? 0) > .01) return false;
    // Avoid an indoor practice spawn even if its floor itself is walkable.
    for (const house of world.houses ?? []) {
      if (Math.hypot(x - house.x, z - house.z) < 15 * (house.scale ?? 1)) return false;
    }
    const p = new THREE.Vector3(x, world.heightAt?.(x, z) ?? 0, z);
    world.resolveMovement?.(p, radius);
    return Math.hypot(p.x - x, p.z - z) < .02;
  }
  const chosen = [];
  function chooseSite(offset) {
    for (let ring = 0; ring < 6; ring++) for (let step = 0; step < (ring ? 12 : 1); step++) {
      const angle = step / 12 * Math.PI * 2;
      const x = spawn.x + offset[0] + Math.cos(angle) * ring * 1.8;
      const z = spawn.z + offset[1] + Math.sin(angle) * ring * 1.8;
      if (!clearGround(x, z) || chosen.some(p => Math.hypot(p.x - x, p.z - z) < 3)) continue;
      const site = { x, z }; chosen.push(site); return site;
    }
    // An imported island may offer no safe training ground near its spawn.
    // In that case omit this optional practice figure rather than put it in water.
    return null;
  }

  const actors = [];
  for (const [index, offset] of [[-5, 9], [5, 12], [12, 4]].entries()) {
    const site = chooseSite(offset); if (!site) continue;
    const group = new THREE.Group(); group.name = `Übungsgegner ${index + 1}`;
    group.position.set(site.x, world.heightAt?.(site.x, site.z) ?? 0, site.z); root.add(group);
    const pivot = new THREE.Group(); group.add(pivot);
    const coat = material(['#587a76', '#858363', '#8e6b60'][index], { emissive: '#000000' });
    mesh(pivot, torsoGeometry, coat, 0, 1.19, 0);
    mesh(pivot, headGeometry, lightWood, 0, 1.82, 0);
    mesh(pivot, box(.32, .055, .04), dark, 0, 1.88, .24);
    mesh(pivot, box(.1, .22, .06), rim, 0, 1.77, .26);
    mesh(pivot, box(.78, .12, .49), rim, 0, 1.49, 0);
    mesh(pivot, box(.66, .12, .48), dark, 0, .91, 0);
    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.set(side * .5, 1.45, 0); pivot.add(arm);
      mesh(arm, jointGeometry, rim, 0, 0, 0); mesh(arm, limbGeometry, wood, 0, -.3, 0);
      const leg = new THREE.Group(); leg.position.set(side * .21, .9, 0); pivot.add(leg);
      mesh(leg, limbGeometry, wood, 0, -.32, 0); mesh(leg, bootGeometry, dark, 0, -.72, .07);
      limbs.push({ arm, leg, side });
    }
    const ringMat = new THREE.MeshBasicMaterial({ color: '#b5ba84', transparent: true, opacity: .6, depthWrite: false, side: THREE.DoubleSide });
    materials.add(ringMat);
    const ring = mesh(group, ringGeometry, ringMat, 0, .035, 0); ring.rotation.x = -Math.PI / 2; ring.castShadow = false;
    const flames = new THREE.Group(), frost = new THREE.Group(); group.add(flames, frost);
    const flameMat = new THREE.MeshBasicMaterial({ color: '#ff8c32', transparent: true, opacity: .8, depthWrite: false });
    const frostMat = new THREE.MeshBasicMaterial({ color: '#95e8ff', transparent: true, opacity: .85, depthWrite: false });
    materials.add(flameMat); materials.add(frostMat);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      mesh(flames, flameGeometry, flameMat, Math.cos(angle) * .36, .72, Math.sin(angle) * .36).castShadow = false;
      mesh(frost, iceGeometry, frostMat, Math.cos(angle) * .45, .7 + (i % 2) * .4, Math.sin(angle) * .45).castShadow = false;
    }
    flames.visible = frost.visible = false;
    let label = null;
    if (labelMaterial) {
      label = new THREE.Sprite(labelMaterial); label.position.y = 2.85; label.scale.set(2.4, .45, 1);
      label.renderOrder = 11; group.add(label);
    }
    const id = `practice-${index + 1}`;
    const target = combat.addTarget({ id, name: group.name, position: group.position, radius: .52, height: 2.25,
      maxHealth: 140, health: 140, practice: true });
    healthBars?.add(id, { position: group.position, health: target.health, maxHealth: target.maxHealth, local: false, height: 2.48, color: '#d6a177' });
    // A short line patrol is easy to aim at and makes the ice slow measurable.
    const axis = index % 2 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    actors.push({ id, target, group, pivot, coat, flames, frost, limbs, label, site, axis, direction: 1,
      origin: group.position.clone(), travelled: 0, phase: 0, visible: true, speed: .85,
      grassDirX: axis.x, grassDirZ: axis.z, grassStrength: 0 });
  }

  const previous = new THREE.Vector3(), desired = new THREE.Vector3();
  function update(dt, time, player) {
    const delta = Math.max(0, Math.min(dt, .1));
    for (const actor of actors) {
      const { target, group, pivot } = actor;
      if (target.alive && delta > 0 && (!player || group.position.distanceToSquared(player) < 100 * 100)) {
        previous.copy(group.position);
        desired.copy(group.position).addScaledVector(actor.axis, actor.direction * actor.speed * target.speedMultiplier * delta);
        const along = (desired.x - actor.site.x) * actor.axis.x + (desired.z - actor.site.z) * actor.axis.z;
        const playerBlocked = player && Math.hypot(desired.x - player.x, desired.z - player.z) < .52 + .42;
        if (Math.abs(along) > 1.4 || playerBlocked || !clearGround(desired.x, desired.z)) actor.direction *= -1;
        else {
          group.position.copy(desired); world.resolveMovement?.(group.position, .52);
          group.position.y = world.heightAt?.(group.position.x, group.position.z) ?? 0;
        }
        const moveX = group.position.x - previous.x, moveZ = group.position.z - previous.z;
        const moved = Math.hypot(moveX, moveZ);
        actor.travelled += moved; actor.phase += moved * 9;
        if (moved > 1e-5) {
          actor.grassDirX = moveX / moved; actor.grassDirZ = moveZ / moved;
          actor.grassStrength = THREE.MathUtils.clamp(moved / Math.max(1e-5, delta * actor.speed), .55, 1.1);
        } else actor.grassStrength = THREE.MathUtils.lerp(actor.grassStrength, 0, 1 - Math.exp(-delta * 12));
        const facing = Math.atan2(actor.axis.x * actor.direction, actor.axis.z * actor.direction);
        pivot.rotation.y = facing;
        for (const limb of actor.limbs) {
          limb.leg.rotation.x = Math.sin(actor.phase) * .38 * limb.side;
          limb.arm.rotation.x = -Math.sin(actor.phase) * .3 * limb.side;
        }
      }
      pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, target.alive ? 0 : Math.PI * .47, 1 - Math.exp(-delta * 8));
      pivot.position.y = target.alive ? Math.sin(actor.phase * 2) * .025 : -.02;
      actor.coat.emissive.set(target.hitFlash > 0 ? '#a9572c' : target.slowRemaining > 0 ? '#1b5b83' : '#000000');
      actor.flames.visible = target.alive && target.burnRemaining > 0;
      actor.frost.visible = target.alive && target.slowRemaining > 0;
      actor.flames.children.forEach((flame, i) => {
        flame.position.y = .65 + ((time * 1.8 + i * .21) % 1) * .9;
        flame.scale.y = .65 + Math.sin(time * 12 + i) * .25;
      });
      actor.frost.rotation.y = time * .6;
      const concealed = (world.concealmentAt?.(group.position.x, group.position.z) ?? 0) > .01;
      actor.visible = !concealed && (vision?.isVisible(group.position, { concealed }) ?? true);
      group.visible = actor.visible;
      if (actor.label) actor.label.visible = target.alive;
      healthBars?.set(actor.id, { health: target.health, maxHealth: target.maxHealth, visible: actor.visible && target.alive, concealed });
    }
  }

  function resolvePlayerMovement(position, radius = .42) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const actor of actors) {
        if (!actor.target.alive) continue;
        const dx = position.x - actor.group.position.x, dz = position.z - actor.group.position.z;
        const distance = Math.hypot(dx, dz), minimum = radius + actor.target.radius;
        if (distance >= minimum) continue;
        const nx = distance > 1e-7 ? dx / distance : 1, nz = distance > 1e-7 ? dz / distance : 0;
        position.x = actor.group.position.x + nx * minimum;
        position.z = actor.group.position.z + nz * minimum;
        moved = true;
      }
      if (!moved) break;
    }
    return position;
  }

  function reset() {
    for (const actor of actors) {
      const { target } = actor;
      actor.group.position.copy(actor.origin); actor.pivot.rotation.set(0, 0, 0); actor.pivot.position.y = 0;
      actor.direction = 1; actor.phase = 0; actor.travelled = 0;
      actor.grassDirX = actor.axis.x; actor.grassDirZ = actor.axis.z; actor.grassStrength = 0;
      target.health = target.initialHealth; target.burnRemaining = target.burnDamagePerSecond = target.slowRemaining = target.hitFlash = 0; target.slowFactor = 1;
    }
  }

  function appendGrassInteractors(target = []) {
    for (const actor of actors) {
      if (!actor.target.alive) continue;
      target.push({
        x: actor.group.position.x, z: actor.group.position.z, radius: 1.05,
        dirX: actor.grassDirX, dirZ: actor.grassDirZ, strength: actor.grassStrength,
      });
    }
    return target;
  }

  function appendFootprintSources(target = []) {
    for (const actor of actors) {
      if (!actor.target.alive) continue;
      target.push({
        id: actor.id,
        x: actor.group.position.x,
        z: actor.group.position.z,
        direction: Math.atan2(actor.grassDirX, actor.grassDirZ),
        moving: actor.grassStrength > .12,
        speed: actor.speed * actor.target.speedMultiplier,
        stepDistance: .68,
        lateral: .11,
      });
    }
    return target;
  }

  return {
    root, update, reset, resolvePlayerMovement, appendGrassInteractors, appendFootprintSources,
    inspect: () => actors.map(({ id, target, group, visible, travelled, speed }) => ({ id, name: group.name, practice: true,
      position: { x: group.position.x, y: group.position.y, z: group.position.z }, health: target.health, maxHealth: target.maxHealth,
      alive: target.alive, visible, burnRemaining: target.burnRemaining, slowRemaining: target.slowRemaining,
      speedMultiplier: target.speedMultiplier, baseSpeed: speed, travelled })),
    dispose() {
      for (const actor of actors) { combat.removeTarget(actor.id); healthBars?.remove(actor.id); }
      root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
