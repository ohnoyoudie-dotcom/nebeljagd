import * as THREE from 'three';

const HISTORY = 32, SUBDIVISIONS = 4, TRAIL_LIFE = .18, GLINTS = 24;
const ROWS = (HISTORY - 1) * SUBDIVISIONS + 1;
const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const clamp01 = value => Math.max(0, Math.min(1, value));
const point = p => p ? { x: p.x, y: p.y, z: p.z } : null;
const cubic = (a, b, c, d, t) => .5 * (2 * b + (c - a) * t
  + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

/** Short, pooled visuals sampled from the real blade. Damage and attack timing
 * remain in weapons.js. All supplied positions use the parent scene's space. */
export function createSwordEffects(scene, { isVisible = null } = {}) {
  const root = new THREE.Group();
  root.name = 'Schwert – Schwung und Treffereffekte';
  scene.add(root);
  const opacity = { value: 1 };
  const tint = { value: new THREE.Color('#d8e4e3') };
  const ivory = { value: new THREE.Color('#fff3d9') };
  const rarity = new THREE.Color(), steel = new THREE.Color('#d8e4e3');
  const canSee = p => !isVisible || isVisible(p);

  const positions = new Float32Array(ROWS * 6), uvs = new Float32Array(ROWS * 4);
  const lives = new Float32Array(ROWS * 2), indices = [];
  for (let row = 0; row < ROWS - 1; row++) {
    const i = row * 2;
    indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const uvAttribute = new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage);
  const lifeAttribute = new THREE.BufferAttribute(lives, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('uv', uvAttribute);
  geometry.setAttribute('aLife', lifeAttribute);
  geometry.setIndex(indices); geometry.setDrawRange(0, 0);
  const ribbonMaterial = new THREE.ShaderMaterial({
    name: 'Schwert – Metallkante, Lichtband und Nachbild',
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending,
    uniforms: { uOpacity: opacity, uTint: tint, uIvory: ivory },
    vertexShader: `attribute float aLife; varying vec2 vUv; varying float vLife;
      void main() { vUv = uv; vLife = aLife;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uTint, uIvory;
      varying vec2 vUv; varying float vLife;
      void main() {
        float x = vUv.x;
        float aa = max(.003, fwidth(x));
        float blade = smoothstep(.05, .28, x) * (1.0 - smoothstep(.985, 1.0, x));
        float edge = exp(-pow((x - .943) / max(.022, aa * .8), 2.0));
        float echo = exp(-pow((x - .76) / max(.012, aa * .65), 2.0));
        float haze = exp(-pow((x - .82) / .21, 2.0));
        float tail = smoothstep(0.0, 1.0, clamp(vLife, 0.0, 1.0));
        float leading = smoothstep(.80, .99, vLife);
        // Three readable layers in one draw: a fine metal edge, the translucent
        // sweep behind it, and a quiet secondary afterimage. Never a solid disc.
        float alpha = blade * (.19 + haze * .10 + edge * .64 + echo * .13 + leading * .10);
        alpha *= tail * tail * uOpacity;
        vec3 color = mix(uTint, uIvory, clamp(edge * .92 + leading * .28 + echo * .38, 0.0, 1.0));
        gl_FragColor = vec4(color, min(.92, alpha));
        #include <colorspace_fragment>
      }`,
  });
  const ribbon = new THREE.Mesh(geometry, ribbonMaterial);
  ribbon.name = 'Schwert – echte Klingenspur'; ribbon.visible = false; ribbon.frustumCulled = false;
  root.add(ribbon);

  const glintPositions = new Float32Array(GLINTS * 3), glintDirections = new Float32Array(GLINTS * 3);
  const glintData = new Float32Array(GLINTS * 4);
  const glintGeometry = new THREE.PlaneGeometry(1, 1);
  const glintPositionAttribute = new THREE.InstancedBufferAttribute(glintPositions, 3).setUsage(THREE.DynamicDrawUsage);
  const glintDirectionAttribute = new THREE.InstancedBufferAttribute(glintDirections, 3).setUsage(THREE.DynamicDrawUsage);
  const glintDataAttribute = new THREE.InstancedBufferAttribute(glintData, 4).setUsage(THREE.DynamicDrawUsage);
  glintGeometry.setAttribute('aCenter', glintPositionAttribute);
  glintGeometry.setAttribute('aDirection', glintDirectionAttribute);
  glintGeometry.setAttribute('aGlint', glintDataAttribute);
  const glintMaterial = new THREE.ShaderMaterial({
    name: 'Schwert – kurze gerichtete Lichtsplitter',
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending,
    uniforms: { uOpacity: opacity, uTint: tint, uIvory: ivory },
    vertexShader: `attribute vec3 aCenter, aDirection; attribute vec4 aGlint;
      varying vec2 vUv; varying float vFade;
      void main() {
        vUv = uv; vFade = aGlint.x;
        vec4 center = modelViewMatrix * vec4(aCenter, 1.0);
        vec2 direction = (modelViewMatrix * vec4(aDirection, 0.0)).xy;
        direction = length(direction) > .0001 ? normalize(direction) : vec2(0.0, 1.0);
        vec2 side = vec2(-direction.y, direction.x);
        center.xy += side * position.x * aGlint.y + direction * position.y * aGlint.z;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uTint, uIvory;
      varying vec2 vUv; varying float vFade;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float core = exp(-p.x * p.x * 5.0);
        float ends = pow(max(0.0, 1.0 - abs(p.y)), .65);
        float alpha = core * ends * vFade * uOpacity;
        gl_FragColor = vec4(mix(uTint, uIvory, core * .80), alpha);
        #include <colorspace_fragment>
      }`,
  });
  const glints = new THREE.InstancedMesh(glintGeometry, glintMaterial, GLINTS);
  glints.name = 'Schwert – gerichtete Metallfunken'; glints.count = 0; glints.visible = false; glints.frustumCulled = false;
  root.add(glints);

  const history = Array.from({ length: HISTORY }, () => ({ base: new THREE.Vector3(), tip: new THREE.Vector3(), age: 0 }));
  const particles = Array.from({ length: GLINTS }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    age: 0, life: 0, duration: .16, size: .14, width: .035 }));
  const motion = new THREE.Vector3(), velocity = new THREE.Vector3(), impactDirection = new THREE.Vector3();
  let cursor = 0, count = 0, particleCursor = 0, age = 0, sampleTime = -1, glintTime = -1;
  let pattern = null, swingCount = 0, impactCount = 0, emittedGlints = 0, disposed = false;
  const at = index => history[(cursor - count + Math.max(0, Math.min(count - 1, index)) + HISTORY) % HISTORY];

  function rebuildRibbon() {
    ribbon.visible = count > 1 && opacity.value > .001;
    if (!ribbon.visible) { geometry.setDrawRange(0, 0); return; }
    const lastRow = (count - 1) * SUBDIVISIONS;
    for (let row = 0; row <= lastRow; row++) {
      const section = Math.min(count - 2, Math.floor(row / SUBDIVISIONS));
      const t = row === lastRow ? 1 : row / SUBDIVISIONS - section;
      const a = at(section - 1), b = at(section), c = at(section + 1), d = at(section + 2);
      for (let side = 0; side < 2; side++) {
        const key = side ? 'tip' : 'base', offset = row * 6 + side * 3;
        positions[offset] = cubic(a[key].x, b[key].x, c[key].x, d[key].x, t);
        positions[offset + 1] = cubic(a[key].y, b[key].y, c[key].y, d[key].y, t);
        positions[offset + 2] = cubic(a[key].z, b[key].z, c[key].z, d[key].z, t);
        uvs[row * 4 + side * 2] = side;
        uvs[row * 4 + side * 2 + 1] = row / lastRow;
        lives[row * 2 + side] = clamp01(1 - (b.age + (c.age - b.age) * t) / TRAIL_LIFE);
      }
    }
    geometry.setDrawRange(0, lastRow * 6);
    positionAttribute.needsUpdate = uvAttribute.needsUpdate = lifeAttribute.needsUpdate = true;
  }

  function rebuildGlints() {
    let slot = 0;
    for (const particle of particles) {
      if (particle.life <= 0) continue;
      particle.position.toArray(glintPositions, slot * 3);
      particle.velocity.toArray(glintDirections, slot * 3);
      const progress = particle.age / particle.duration;
      glintData[slot * 4] = Math.max(0, 1 - progress) ** 1.35;
      glintData[slot * 4 + 1] = particle.width;
      glintData[slot * 4 + 2] = particle.size * (1 - progress * .45);
      slot++;
    }
    glints.count = opacity.value > .001 ? slot : 0;
    glints.visible = glints.count > 0;
    glintPositionAttribute.needsUpdate = glintDirectionAttribute.needsUpdate = glintDataAttribute.needsUpdate = true;
  }

  function emitGlint(position, direction, hit = false) {
    if (!canSee(position)) return;
    const particle = particles[particleCursor++ % GLINTS], seed = particleCursor % 7 / 7;
    particle.position.copy(position); particle.velocity.copy(direction);
    particle.duration = particle.life = (hit ? .16 : .11) + seed * .09;
    particle.age = 0; particle.size = (hit ? .19 : .12) + seed * .10;
    particle.width = hit ? .045 : .033;
    emittedGlints++;
  }

  function clear() {
    count = cursor = 0; sampleTime = glintTime = -1;
    ribbon.visible = false; geometry.setDrawRange(0, 0); glints.count = 0; glints.visible = false;
    for (const particle of particles) particle.life = 0;
    motion.set(0, 0, 0);
  }

  function beginSwing({ color = '#e5c88d', pattern: nextPattern = null } = {}) {
    if (disposed) return;
    clear(); pattern = nextPattern; swingCount++;
    rarity.set(color); tint.value.copy(steel).lerp(rarity, .22);
  }

  function sample({ base, tip, active = true, opacity: alpha = 1 } = {}) {
    if (disposed) return;
    opacity.value = Number.isFinite(alpha) ? clamp01(alpha) : 1;
    if (opacity.value <= .001) { clear(); return; }
    if (!active || !validPoint(base) || !validPoint(tip) || !canSee(tip)) return;
    const previous = count ? at(count - 1) : null;
    if (previous) {
      // Never connect a teleport, interrupted attack or unrelated blade pose.
      if (previous.base.distanceToSquared(base) > 6.25 || previous.tip.distanceToSquared(tip) > 6.25) clear();
      else {
        motion.subVectors(tip, previous.tip);
        if (motion.lengthSq() < .000025 && previous.base.distanceToSquared(base) < .000025) return;
        if (age - sampleTime < 1 / 120 && motion.lengthSq() < .0144) return;
      }
    }
    const record = history[cursor]; record.base.copy(base); record.tip.copy(tip); record.age = 0;
    cursor = (cursor + 1) % HISTORY; count = Math.min(HISTORY, count + 1); sampleTime = age;
    if (count > 1 && motion.lengthSq() > .001 && age - glintTime > .055) {
      velocity.copy(motion).normalize().multiplyScalar(.55); velocity.y += .12;
      emitGlint(tip, velocity); glintTime = age;
    }
    rebuildRibbon(); rebuildGlints();
  }

  function impact({ point: hitPoint, direction = motion } = {}) {
    if (disposed || !validPoint(hitPoint) || !canSee(hitPoint) || opacity.value <= .001) return;
    impactCount++;
    impactDirection.set(Number.isFinite(direction?.x) ? direction.x : 0,
      Number.isFinite(direction?.y) ? direction.y : 0, Number.isFinite(direction?.z) ? direction.z : 0);
    if (impactDirection.lengthSq() < .0001) impactDirection.set(0, .2, 1);
    impactDirection.normalize();
    for (let index = 0; index < 8; index++) {
      const angle = index * 2.39996323, spread = .65 + (index % 3) * .22;
      velocity.set(Math.cos(angle) * spread, .4 + (index % 4) * .23, Math.sin(angle) * spread)
        .addScaledVector(impactDirection, .7);
      emitGlint(hitPoint, velocity, true);
    }
    rebuildGlints();
  }

  function update(dt) {
    if (disposed) return;
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    age += delta;
    for (let index = 0; index < count; index++) at(index).age += delta;
    while (count && at(0).age >= TRAIL_LIFE) count--;
    for (const particle of particles) {
      if (particle.life <= 0) continue;
      particle.age += delta; particle.life = Math.max(0, particle.duration - particle.age);
      particle.position.addScaledVector(particle.velocity, delta);
      particle.velocity.y -= delta * 1.4;
      if (!canSee(particle.position)) particle.life = 0;
    }
    rebuildRibbon(); rebuildGlints();
  }

  function reset() { clear(); age = 0; pattern = null; swingCount = impactCount = emittedGlints = 0; opacity.value = 1; }
  return {
    beginSwing, sample, impact, update, clear, reset,
    inspect: () => ({ style: 'blade-following-ribbon', trailActive: ribbon.visible,
      sampleCount: count, segmentCount: geometry.drawRange.count / 6, pattern,
      latestBase: point(count ? at(count - 1).base : null), latestTip: point(count ? at(count - 1).tip : null),
      activeGlints: glints.count, emittedGlints, swingCount, impactCount, depthTested: true,
      shadingLayers: ['edge', 'ribbon', 'afterimage'], drawCalls: Number(ribbon.visible) + Number(glints.count > 0),
      historyCapacity: HISTORY, glintCapacity: GLINTS, opacity: opacity.value, lifetime: TRAIL_LIFE }),
    dispose() {
      if (disposed) return;
      reset(); disposed = true; scene.remove(root);
      geometry.dispose(); ribbonMaterial.dispose(); glintGeometry.dispose(); glintMaterial.dispose();
    },
  };
}
