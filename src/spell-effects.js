import * as THREE from 'three';

const PARTICLES = 160, BURSTS = 12;
const ELEMENTS = {
  fireStaff: { core: '#fff3bf', glow: '#ff681c', spark: '#ffb52d', edge: '#ff360d' },
  iceStaff: { core: '#edffff', glow: '#45bfff', spark: '#8ceeff', edge: '#358de5' },
};
const finite = value => Number.isFinite(value) ? value : 0;
const valid = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
const typeOf = type => type === 'iceStaff' ? 'iceStaff' : 'fireStaff';

/** Visuals only. Swept hits, flight time and damage remain owned by weapons.js. */
export function createSpellEffects(scene, { isVisible = null } = {}) {
  const roots = [], geometries = new Set(), materials = new Set(), projectiles = [];
  const ownGeometry = geometry => (geometries.add(geometry), geometry);
  const ownMaterial = material => (materials.add(material), material);
  const addRoot = group => { roots.push(group); scene.add(group); return group; };
  const canSee = point => valid(point) && (!isVisible || isVisible(point));
  const additive = (color, opacity = 1) => ownMaterial(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  }));
  const solid = color => ownMaterial(new THREE.MeshBasicMaterial({ color, depthTest: true }));
  const octahedron = ownGeometry(new THREE.OctahedronGeometry(1, 0));
  const sphere = ownGeometry(new THREE.IcosahedronGeometry(1, 1));
  const flame = ownGeometry(new THREE.ConeGeometry(1, 1, 7));
  const ringGeometry = ownGeometry(new THREE.TorusGeometry(1, .035, 4, 32));
  const connectorGeometry = ownGeometry(new THREE.CylinderGeometry(.65, 1, 1, 5));
  const textureSize = 48, pixels = new Uint8Array(textureSize * textureSize * 4);
  for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) {
    const radius = Math.hypot((x + .5) / textureSize * 2 - 1, (y + .5) / textureSize * 2 - 1);
    const index = (y * textureSize + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    pixels[index + 3] = Math.round(Math.max(0, 1 - radius) ** 2.5 * 255);
  }
  const glowTexture = new THREE.DataTexture(pixels, textureSize, textureSize);
  glowTexture.needsUpdate = true;
  glowTexture.magFilter = glowTexture.minFilter = THREE.LinearFilter;
  function glow(color, opacity = 1) {
    return new THREE.Sprite(ownMaterial(new THREE.SpriteMaterial({ map: glowTexture, color,
      transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true })));
  }
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z); parent.add(part); return part;
  }
  const fireCore = solid(ELEMENTS.fireStaff.core), fireShell = additive('#ff811c', .78);
  const fireTip = additive('#ffce46', .9), iceCore = solid(ELEMENTS.iceStaff.core);
  const iceShell = additive('#43bcff', .65), iceTip = additive('#b0f7ff', .8);
  const crystalGeometry = ownGeometry(new THREE.OctahedronGeometry(1, 0));
  const crystalColors = new Float32Array(crystalGeometry.attributes.position.count * 3);
  const scratchColor = new THREE.Color();
  for (let i = 0; i < crystalGeometry.attributes.position.count; i++) {
    scratchColor.set(['#a2f5ff', '#58c7f3', '#ecffff', '#2896d1'][Math.floor(i / 3) % 4]);
    scratchColor.toArray(crystalColors, i * 3);
  }
  crystalGeometry.setAttribute('color', new THREE.BufferAttribute(crystalColors, 3));
  const crystalMaterial = ownMaterial(new THREE.MeshBasicMaterial({ vertexColors: true }));

  function createProjectile() {
    if (disposed) throw new Error('Disposed spell effects cannot create projectiles.');
    const group = addRoot(new THREE.Group()); group.name = 'Zauberprojektil'; group.visible = false;
    const fire = new THREE.Group(), ice = new THREE.Group(); group.add(fire, ice);
    fire.name = 'Glutkern und Flammen'; ice.name = 'Kristallspitze und Frostfahne';
    mesh(fire, sphere, fireCore, 0, 0, .08).scale.set(.16, .16, .30);
    mesh(fire, sphere, fireShell, 0, 0, -.06).scale.set(.24, .21, .42);
    const flameTips = [];
    for (let i = 0; i < 3; i++) {
      const part = mesh(fire, flame, i === 0 ? fireTip : fireShell, 0, 0, -.47 - i * .12);
      part.rotation.x = -Math.PI / 2; part.scale.set(.17 - i * .035, .90 + i * .18, .13);
      flameTips.push(part);
    }
    mesh(ice, crystalGeometry, crystalMaterial, 0, 0, .10).scale.set(.21, .18, .51);
    mesh(ice, octahedron, iceCore, 0, 0, .10).scale.set(.07, .07, .43);
    const iceFins = [];
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const part = mesh(ice, octahedron, iceTip, Math.cos(angle) * .19, Math.sin(angle) * .19, -.28);
      part.scale.set(.055, .055, .30); iceFins.push(part);
    }
    const frostTail = mesh(ice, flame, iceShell, 0, 0, -.58);
    frostTail.rotation.x = -Math.PI / 2; frostTail.scale.set(.12, 1.0, .12);
    const halo = glow('#ff681c', .85); halo.scale.setScalar(1.45); group.add(halo);
    const visual = { group, fire, ice, flameTips, iceFins, halo, active: false,
      type: 'fireStaff', direction: 0, trailDistance: 0 };
    projectiles.push(visual); return visual;
  }

  const particleMesh = addRoot(new THREE.InstancedMesh(octahedron, additive('#ffffff', .9), PARTICLES));
  particleMesh.name = 'Glutfunken und Frostsplitter'; particleMesh.frustumCulled = false;
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const particles = Array.from({ length: PARTICLES }, () => ({ life: 0, duration: 1,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, type: 'fireStaff', seed: 0 }));
  const transform = new THREE.Object3D(), directionVector = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const normalVector = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1);
  const pointA = new THREE.Vector3(), pointB = new THREE.Vector3();
  let particleCursor = 0, burstCursor = 0, visibleParticles = 0, disposed = false;
  const emitted = { fireStaff: { launches: 0, impacts: 0 }, iceStaff: { launches: 0, impacts: 0 } };
  let latestImpact = null;
  function particle(type, x, y, z, vx, vy, vz, size, duration) {
    const entry = particles[particleCursor % PARTICLES];
    Object.assign(entry, { type, x, y, z, vx, vy, vz, size, duration, life: duration, seed: particleCursor++ });
  }

  const bursts = Array.from({ length: BURSTS }, () => {
    const group = addRoot(new THREE.Group()); group.name = 'Zauberimpuls'; group.visible = false;
    const halo = glow('#ffffff'); group.add(halo);
    const ring = mesh(group, ringGeometry, additive('#ffffff', .8));
    const connectorMaterial = additive('#ffffff', .7);
    const connectors = Array.from({ length: 4 }, () => {
      const part = mesh(group, connectorGeometry, connectorMaterial); part.visible = false; return part;
    });
    return { group, halo, ring, connectors, connectorMaterial, connectorCount: 0,
      life: 0, duration: 1, type: 'fireStaff', kind: 'impact', size: 1, x: 0, y: 0, z: 0 };
  });
  function burst(type, point, direction, kind, normal) {
    const entry = bursts[burstCursor++ % BURSTS], palette = ELEMENTS[type];
    entry.life = entry.duration = kind === 'muzzle' ? .28 : .48;
    Object.assign(entry, { type, kind, size: kind === 'muzzle' ? .65 : 1.20,
      x: point.x, y: point.y, z: point.z, connectorCount: 0 });
    entry.group.position.set(0, 0, 0); entry.group.visible = true;
    entry.halo.position.copy(point); entry.ring.position.copy(point);
    entry.halo.material.color.set(palette.glow); entry.ring.material.color.set(palette.spark);
    normalVector.set(finite(normal?.x), finite(normal?.y), finite(normal?.z));
    if (normalVector.lengthSq() < .0001) normalVector.set(-Math.sin(direction), 0, -Math.cos(direction));
    normalVector.normalize(); entry.ring.quaternion.setFromUnitVectors(forward, normalVector);
    for (const part of entry.connectors) part.visible = false;
    return entry;
  }

  const charge = addRoot(new THREE.Group()); charge.name = 'Zauber am Stabkopf'; charge.visible = false;
  const chargeHalo = glow('#ffffff', .7); charge.add(chargeHalo);
  const chargeCore = mesh(charge, octahedron, additive('#ffffff'));
  const chargeRing = mesh(charge, ringGeometry, additive('#ffffff', .65));
  const chargeChips = Array.from({ length: 6 }, () => mesh(charge, octahedron, iceTip));
  let chargeActive = false, chargeType = 'fireStaff', chargeProgress = 0, chargeDirection = 0;

  function launch(visual, type, position, direction = 0) {
    if (disposed || !valid(position)) return end(visual);
    type = typeOf(type); direction = finite(direction);
    Object.assign(visual, { type, direction, active: true, trailDistance: 0 });
    visual.group.position.copy(position); visual.group.rotation.set(0, direction, 0);
    visual.group.scale.setScalar(1); visual.fire.visible = type === 'fireStaff'; visual.ice.visible = type === 'iceStaff';
    visual.halo.material.color.set(ELEMENTS[type].glow); visual.group.visible = canSee(position);
    emitted[type].launches++;
  }
  function end(visual) { visual.active = false; visual.group.visible = false; visual.trailDistance = 0; }
  function advance(visual, from, to, delta, time) {
    if (disposed || !visual.active || !valid(from) || !valid(to)) return;
    delta = Math.max(0, Math.min(.25, finite(delta))); time = finite(time);
    visual.group.position.copy(to); visual.group.visible = canSee(to);
    const pulse = 1 + Math.sin(time * 21) * .07;
    visual.fire.scale.set(pulse, pulse, 1);
    visual.fire.rotation.z = time * 3;
    visual.ice.rotation.z = time * 2.2;
    visual.halo.scale.setScalar((visual.type === 'fireStaff' ? 1.45 : 1.20) * pulse);
    visual.flameTips.forEach((part, i) => {
      part.position.x = Math.sin(time * 18 + i * 2.1) * .045;
      part.position.y = Math.cos(time * 16 + i * 1.7) * .045;
    });
    const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (!delta || distance < .00001) return;
    const total = visual.trailDistance + distance, count = Math.min(12, Math.floor(total / .20));
    visual.trailDistance = total % .20;
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, angle = (particleCursor + i) * 2.39996;
      const x = THREE.MathUtils.lerp(from.x, to.x, t), y = THREE.MathUtils.lerp(from.y, to.y, t), z = THREE.MathUtils.lerp(from.z, to.z, t);
      pointA.set(x, y, z); if (!canSee(pointA)) continue;
      particle(visual.type, x, y, z, Math.sin(angle) * .40, .12 + Math.cos(angle) * .32,
        Math.cos(angle) * .40, visual.type === 'fireStaff' ? .075 : .065, .35 + (i % 3) * .045);
    }
  }
  function channel(type, position, direction = 0, progress = 0) {
    chargeActive = !disposed && type !== null && valid(position);
    if (!chargeActive) { charge.visible = false; return; }
    chargeType = typeOf(type); chargeProgress = THREE.MathUtils.clamp(finite(progress), 0, 1);
    chargeDirection = finite(direction); charge.position.copy(position);
    chargeHalo.material.color.set(ELEMENTS[chargeType].glow);
    chargeCore.material.color.set(ELEMENTS[chargeType].core);
    chargeRing.material.color.set(ELEMENTS[chargeType].spark);
    charge.visible = canSee(position);
  }
  function fire(type, origin, direction = 0, launchPoint = origin) {
    if (disposed || !valid(origin)) return;
    type = typeOf(type); direction = finite(direction);
    const entry = burst(type, origin, direction, 'muzzle');
    if (valid(launchPoint) && pointA.copy(origin).distanceToSquared(launchPoint) > .01) {
      entry.connectorCount = entry.connectors.length;
      entry.connectorMaterial.color.set(ELEMENTS[type].spark);
      for (let i = 0; i < entry.connectorCount; i++) {
        const start = i / entry.connectorCount, finish = (i + 1) / entry.connectorCount;
        pointA.copy(origin).lerp(launchPoint, start); pointA.y += Math.sin(start * Math.PI) * .16;
        pointB.copy(origin).lerp(launchPoint, finish); pointB.y += Math.sin(finish * Math.PI) * .16;
        const part = entry.connectors[i]; directionVector.subVectors(pointB, pointA);
        part.position.copy(pointA).add(pointB).multiplyScalar(.5);
        part.scale.set(.035, directionVector.length(), .035);
        part.quaternion.setFromUnitVectors(up, directionVector.normalize());
      }
    }
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.39996;
      particle(type, origin.x, origin.y, origin.z, Math.sin(direction) * .7 + Math.sin(angle) * .9,
        Math.cos(angle) * .8, Math.cos(direction) * .7 + Math.cos(angle) * .9, .055, .24 + i % 3 * .04);
    }
  }
  function impact(type, point, normal = null, direction = 0) {
    if (disposed || !valid(point)) return;
    type = typeOf(type); direction = finite(direction);
    burst(type, point, direction, 'impact', normal); emitted[type].impacts++;
    latestImpact = { type, point: { x: point.x, y: point.y, z: point.z } };
    for (let i = 0; i < 22; i++) {
      const angle = i * 2.39996, spread = 1.2 + i % 4 * .35;
      particle(type, point.x, point.y, point.z, Math.sin(angle) * spread + finite(normal?.x) * .8,
        .6 + i % 5 * .24, Math.cos(angle) * spread + finite(normal?.z) * .8,
        type === 'fireStaff' ? .07 + i % 3 * .02 : .08 + i % 3 * .025, .38 + i % 4 * .075);
    }
  }

  function update(delta, time) {
    if (disposed) return;
    delta = Math.max(0, Math.min(.25, finite(delta))); time = finite(time); visibleParticles = 0;
    for (let index = 0; index < PARTICLES; index++) {
      const entry = particles[index];
      if (entry.life > 0) {
        entry.life = Math.max(0, entry.life - delta);
        entry.x += entry.vx * delta; entry.y += entry.vy * delta; entry.z += entry.vz * delta;
        entry.vy += (entry.type === 'fireStaff' ? .4 : -2.8) * delta;
      }
      const visible = entry.life > 0 && canSee(entry), fade = Math.max(0, entry.life / entry.duration);
      transform.position.set(entry.x, entry.y, entry.z);
      transform.rotation.set(entry.seed + time * 3, entry.seed + time * 2, entry.seed);
      const size = visible ? entry.size * Math.sqrt(fade) : 0;
      transform.scale.set(size, size * (entry.type === 'iceStaff' ? 2.5 : 1.3), size);
      transform.updateMatrix(); particleMesh.setMatrixAt(index, transform.matrix);
      scratchColor.set(ELEMENTS[entry.type].spark).multiplyScalar(fade);
      particleMesh.setColorAt(index, scratchColor); if (visible) visibleParticles++;
    }
    particleMesh.instanceMatrix.needsUpdate = true; particleMesh.instanceColor.needsUpdate = true;
    particleMesh.visible = visibleParticles > 0;
    for (const entry of bursts) {
      entry.life = Math.max(0, entry.life - delta); entry.group.visible = entry.life > 0;
      if (!entry.life) continue;
      const age = entry.duration - entry.life, t = age / entry.duration, visible = canSee(entry);
      entry.halo.visible = entry.ring.visible = visible;
      entry.halo.scale.setScalar(entry.size * (1.0 + t * 2.5));
      entry.halo.material.opacity = (1 - t) ** 1.5 * .95;
      entry.ring.scale.setScalar(entry.size * (.12 + t * 1.05));
      entry.ring.material.opacity = (1 - t) ** 2 * .85;
      entry.connectorMaterial.opacity = Math.max(0, 1 - age / .16) * .75;
      entry.connectors.forEach((part, index) => { part.visible = index < entry.connectorCount && age < .16 && canSee(part.position); });
    }
    charge.visible = chargeActive && canSee(charge.position);
    if (chargeActive) {
      const radius = .18 + (1 - chargeProgress) * .30;
      charge.rotation.set(0, chargeDirection, 0);
      chargeHalo.scale.setScalar(.6 + chargeProgress * .7);
      chargeCore.scale.setScalar(.07 + chargeProgress * .10);
      chargeCore.rotation.set(time * 3, time * 4, time * 2);
      chargeRing.scale.setScalar(radius); chargeRing.rotation.set(.6, time * 3, time * 2);
      chargeChips.forEach((part, index) => {
        const angle = time * 8 + index * Math.PI / 3;
        part.material = chargeType === 'fireStaff' ? fireTip : iceTip;
        part.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, Math.sin(angle * 2) * .08);
        part.scale.set(.035, chargeType === 'iceStaff' ? .09 : .045, .035);
        part.rotation.set(0, angle, angle);
      });
    }
    for (const visual of projectiles) visual.group.visible = visual.active && canSee(visual.group.position);
  }
  function reset() {
    for (const visual of projectiles) end(visual);
    for (const entry of particles) entry.life = 0;
    for (const entry of bursts) { entry.life = 0; entry.group.visible = false; }
    chargeActive = false; charge.visible = false; particleMesh.visible = false; visibleParticles = 0;
    particleCursor = burstCursor = 0; latestImpact = null;
    for (const counters of Object.values(emitted)) counters.launches = counters.impacts = 0;
  }
  function dispose() {
    if (disposed) return;
    reset(); disposed = true;
    for (const root of roots) {
      if (root.isInstancedMesh) root.dispose();
      root.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    glowTexture.dispose();
  }
  reset();
  return { createProjectile, launch, advance, end, channel, fire, impact, update, reset, dispose,
    get telemetry() {
      return { activeProjectiles: projectiles.filter(v => v.active).length,
        visibleProjectiles: projectiles.filter(v => v.active && v.group.visible).length,
        activeParticles: particles.filter(p => p.life > 0).length, visibleParticles,
        activeBursts: bursts.filter(b => b.life > 0).length, channelActive: chargeActive, channelVisible: charge.visible,
        emitted: { fireStaff: { ...emitted.fireStaff }, iceStaff: { ...emitted.iceStaff } },
        latestImpact: latestImpact ? { type: latestImpact.type, point: { ...latestImpact.point } } : null,
        bursts: bursts.filter(b => b.life > 0).map(b => ({ kind: b.kind, type: b.type,
          visible: b.halo.visible || b.ring.visible || b.connectors.some(p => p.visible), position: { x: b.x, y: b.y, z: b.z } })),
        capacity: { particles: PARTICLES, bursts: BURSTS } };
    },
  };
}
