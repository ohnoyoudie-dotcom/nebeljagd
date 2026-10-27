import * as THREE from 'three';

function heartGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.36);
  shape.bezierCurveTo(-0.13, -0.22, -0.48, 0.01, -0.43, 0.25);
  shape.bezierCurveTo(-0.39, 0.49, -0.10, 0.53, 0, 0.29);
  shape.bezierCurveTo(0.10, 0.53, 0.39, 0.49, 0.43, 0.25);
  shape.bezierCurveTo(0.48, 0.01, 0.13, -0.22, 0, -0.36);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelSegments: 2,
    steps: 1, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 8,
  });
  geometry.translate(0, -0.04, -0.08);
  geometry.computeVertexNormals();
  return geometry;
}

/** Visible pickups with proximity collection and a fixed-size particle pool. */
export function createPickups(scene, { placements, heightAt = () => 0, viewDistance = 100, isVisible = () => true, world = null, revealSceneryThroughFog = false } = {}) {
  const hearts = heartGeometry();
  const coins = new THREE.CylinderGeometry(0.19, 0.19, 0.055, 14);
  const heartMat = new THREE.MeshStandardMaterial({
    color: '#ed6380', emissive: '#9b193f', emissiveIntensity: 0.24,
    roughness: 0.32, metalness: 0.1,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#f4cd76', emissive: '#d98728', emissiveIntensity: 0.3,
    roughness: 0.3, metalness: 0.4, flatShading: true,
  });
  const ringGeo = new THREE.RingGeometry(0.41, 0.45, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#f3d18c', transparent: true, opacity: 0.62,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const haloGeo = new THREE.CircleGeometry(0.57, 24);
  const haloMat = new THREE.MeshBasicMaterial({
    color: '#ed7994', transparent: true, opacity: 0.08,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const sparkleGeo = new THREE.OctahedronGeometry(0.045);
  const sparkleMat = new THREE.MeshBasicMaterial({ color: '#fff1b9' });
  // An explicit placement list is authoritative, including an empty list. Old
  // callers retain the small-island defaults without introducing hidden loot
  // into maps created in the editor.
  const definitions = Array.isArray(placements) ? placements
    .filter(item => item.kind === 'heart')
    .map(item => ({ id: item.id, name: item.name, type: item.kind,
      x: item.position[0], z: item.position[1], rotation: item.rotation ?? 0,
      scale: item.scale ?? 1 })) : [
    { id: 'heart-meadow', type: 'heart', x: -5, z: 5 },
    { id: 'heart-fern', type: 'heart', x: -12, z: 2 },
    { id: 'heart-river', type: 'heart', x: 0, z: 9 },
    { id: 'heart-north', type: 'heart', x: -4, z: -15 },
    { id: 'heart-south', type: 'heart', x: -30, z: 14 },
    { id: 'heart-east', type: 'heart', x: 22, z: -8 },
    { id: 'heart-west', type: 'heart', x: -26, z: -5 },
  ];
  const items = [];
  let dynamicId = 0;
  function makeItem(definition, dynamic = false, pop = false) {
    const index = items.length;
    const group = new THREE.Group();
    group.name = definition.id;
    const groundY = heightAt(definition.x, definition.z);
    group.position.set(definition.x, groundY, definition.z);
    group.rotation.y = definition.rotation ?? 0;
    group.scale.setScalar(definition.scale ?? 1);
    if (Array.isArray(placements)) group.userData.worldObjectId = definition.id;
    const floating = new THREE.Group();
    group.add(floating);
    const visual = new THREE.Mesh(definition.type === 'heart' ? hearts : coins,
      definition.type === 'heart' ? heartMat : goldMat);
    if (definition.type === 'gold') {
      visual.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const coin = new THREE.Mesh(coins, goldMat);
        coin.position.set((i - 1) * .13, -.16 + i * .04, -.04);
        coin.rotation.x = Math.PI / 2; floating.add(coin);
      }
    }
    visual.castShadow = true;
    floating.add(visual);
    const glint = new THREE.Mesh(sparkleGeo, sparkleMat);
    glint.position.set(-0.20, 0.20, 0.14);
    floating.add(glint);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    group.add(ring);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.038;
    group.add(halo);
    scene.add(group);
    const item = { ...definition, groundY, group, floating, visual, glint, ring, halo,
      collected: false, dynamic, flight: pop ? .65 : 0, flightDuration: .65, phase: index * 1.67 };
    items.push(item);
    if (pop) {
      const origin = definition.origin ?? [definition.x, definition.z];
      item.launchFrom = new THREE.Vector3(origin[0], heightAt(...origin) + .5, origin[1]);
      group.position.copy(item.launchFrom);
    }
    return item;
  }
  for (const definition of definitions) makeItem(definition);

  /** Dynamic chest coins are the only gold source; editable maps retain hearts. */
  function addDrop(definition, { pop = true } = {}) {
    const type = definition.type ?? definition.kind;
    if (!['gold', 'heart'].includes(type)) return null;
    const position = definition.position ?? [definition.x, definition.z];
    if (!position.every(Number.isFinite)) return null;
    return makeItem({ ...definition, id: definition.id ?? `drop-${type}-${++dynamicId}`, type,
      amount: type === 'gold' ? Math.max(1, Math.floor(definition.amount ?? 1)) : 25,
      x: position[0], z: position[1] }, true, pop);
  }

  const particleCapacity = 96;
  const particlePositions = new Float32Array(particleCapacity * 3);
  const particleColors = new Float32Array(particleCapacity * 3);
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  const particles = Array.from({ length: particleCapacity }, () => ({
    life: 0, vx: 0, vy: 0, vz: 0,
  }));
  // Park inactive points below the island; no per-pickup allocations are needed.
  for (let i = 0; i < particleCapacity; i++) particlePositions[i * 3 + 1] = -100;
  const particleMat = new THREE.PointsMaterial({
    size: 3, vertexColors: true, transparent: true, opacity: 0.88,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
  });
  const particleSystem = new THREE.Points(particleGeo, particleMat);
  particleSystem.frustumCulled = false;
  scene.add(particleSystem);
  let particleCursor = 0;
  let collectedCount = 0;
  const heartColor = new THREE.Color('#ff99b1');
  const goldColor = new THREE.Color('#ffe3a0');

  function burst(item) {
    const color = item.type === 'heart' ? heartColor : goldColor;
    for (let i = 0; i < 16; i++) {
      const index = particleCursor++ % particleCapacity;
      const p = particles[index];
      const angle = i * Math.PI * 2 / 16;
      p.life = 0.65 + (i % 4) * 0.08;
      p.vx = Math.cos(angle) * (1.2 + (i % 3) * 0.35);
      p.vz = Math.sin(angle) * (1.2 + (i % 3) * 0.35);
      p.vy = 1.5 + (i % 5) * 0.3;
      particlePositions[index * 3] = item.x;
      particlePositions[index * 3 + 1] = item.groundY + .85 * (item.scale ?? 1);
      particlePositions[index * 3 + 2] = item.z;
      particleColors[index * 3] = color.r;
      particleColors[index * 3 + 1] = color.g;
      particleColors[index * 3 + 2] = color.b;
    }
    particleGeo.attributes.color.needsUpdate = true;
  }

  function update(dt, time, playerPosition, { health = 100, maxHealth = 100,
    onCollect = () => {}, viewerPosition = playerPosition, canCollect = true, visible = isVisible } = {}) {
    // Track healing within this frame so two nearby hearts cannot both be consumed unnecessarily.
    let remainingHealth = health;
    for (const item of items) {
      if (item.collected) continue;
      if (item.flight > 0) {
        item.flight = Math.max(0, item.flight - Math.max(0, dt));
        const progress = 1 - item.flight / item.flightDuration;
        item.group.position.set(
          THREE.MathUtils.lerp(item.launchFrom.x, item.x, progress),
          THREE.MathUtils.lerp(item.launchFrom.y, item.groundY, progress) + Math.sin(Math.PI * progress) * 1.45,
          THREE.MathUtils.lerp(item.launchFrom.z, item.z, progress));
      }
      const nearViewer = !viewerPosition || (viewerPosition.x - item.x) ** 2 + (viewerPosition.z - item.z) ** 2 <= viewDistance ** 2;
      const inSight = visible({ x: item.x, y: item.groundY + .5, z: item.z });
      item.group.visible = nearViewer && (revealSceneryThroughFog || inSight);
      if (!item.group.visible) continue;
      item.floating.position.y = 0.95 + Math.sin(time * 2.4 + item.phase) * 0.12;
      item.visual.rotation.y = Math.sin(time * 0.8 + item.phase) * 0.35;
      item.visual.rotation.z = Math.sin(time * 1.7 + item.phase) * 0.08;
      item.ring.visible = item.halo.visible = item.flight <= 0;
      item.glint.scale.setScalar(0.6 + Math.pow(Math.max(0, Math.sin(time * 3 + item.phase)), 6) * 1.3);
      item.ring.scale.setScalar(1 + Math.sin(time * 2 + item.phase) * 0.045);
      const available = item.type !== 'heart' || remainingHealth < maxHealth;
      const nearCollector = Boolean(playerPosition && Math.hypot(playerPosition.x - item.x, playerPosition.z - item.z) < 1.15);
      const clearReach = !nearCollector || !world?.traceProjectile || !world.traceProjectile(
        { x: playerPosition.x, y: (playerPosition.y ?? heightAt(playerPosition.x, playerPosition.z)) + .55, z: playerPosition.z },
        { x: item.x, y: item.groundY + .55, z: item.z }, .03);
      if (canCollect && inSight && item.flight <= 0 && available && clearReach && nearCollector) {
        item.collected = true;
        item.group.visible = false;
        collectedCount++;
        burst(item);
        const amount = item.type === 'heart' ? Math.min(25, maxHealth - remainingHealth) : item.amount;
        if (item.type === 'heart') remainingHealth += amount;
        onCollect({ type: item.type, amount, id: item.id });
      }
    }
    let dirty = false;
    for (let i = 0; i < particleCapacity; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      dirty = true;
      if (p.life <= 0) {
        particlePositions[i * 3 + 1] = -100;
        continue;
      }
      p.vy -= dt * 3;
      particlePositions[i * 3] += p.vx * dt;
      particlePositions[i * 3 + 1] += p.vy * dt;
      particlePositions[i * 3 + 2] += p.vz * dt;
    }
    if (dirty) particleGeo.attributes.position.needsUpdate = true;
  }

  return {
    update,
    addDrop,
    items,
    get collectedCount() { return collectedCount; },
    reset() {
      collectedCount = 0;
      for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index];
        if (item.dynamic) { scene.remove(item.group); items.splice(index, 1); }
        else { item.collected = false; item.group.visible = true; }
      }
      dynamicId = 0;
      for (let i = 0; i < particleCapacity; i++) {
        particles[i].life = 0;
        particlePositions[i * 3 + 1] = -100;
      }
      particleGeo.attributes.position.needsUpdate = true;
    },
  };
}
