import * as THREE from 'three';

const GLYPHS = '0123456789.-';
const COLORS = { burn: '#ffc179', zone: '#ddceff', fireStaff: '#ffd19c', iceStaff: '#bbf0ff', bow: '#fff5d3', sword: '#ffe3a6' };
const copyPosition = value => ({ x: value.x, y: value.y ?? 0, z: value.z });
const finiteDamage = amount => Number.isFinite(amount) && amount > 0;

/** Bounded, renderer-independent feedback state. Damage remains authoritative in
 * combat.js; these records only describe briefly visible numbers. */
export function createDamageFeedbackState({ capacity = 32, isVisible = () => true, coalesceSeconds = .35, lifetime = .95 } = {}) {
  const entries = Array.from({ length: capacity }, () => ({ remaining: 0, age: 0 }));
  const pending = new Map();
  let cursor = 0, visible = isVisible, emitted = 0;
  const canSee = (target, point = target.position) => Boolean(target.local)
    || (!target.concealed && visible(target.position, { concealed: target.concealed, local: false })
      && visible(point, { concealed: false, local: false }));

  function emit(amount, type, target, position = copyPosition(target.position)) {
    if (!finiteDamage(amount) || !canSee(target, position)) return null;
    let entry = entries.find(value => value.remaining <= 0);
    if (!entry) entry = entries.reduce((oldest, value) => value.remaining < oldest.remaining ? value : oldest);
    const rounded = Math.round(amount * 10) / 10;
    Object.assign(entry, { amount, text: String(rounded || .1), type, target, targetId: target.id,
      position, age: 0, remaining: lifetime, lifetime, color: COLORS[type] ?? '#fff1ce',
      offsetX: ((cursor++ % 3) - 1) * .22 });
    emitted++;
    return entry;
  }
  function addHit(result, target) {
    if (!target?.position || !finiteDamage(result?.damage) || !canSee(target)) return false;
    const type = result.type ?? 'direct';
    if (type === 'burn' || type === 'zone') {
      const key = `${target.id}:${type}`;
      if (!pending.has(key)) {
        if (pending.size >= capacity) pending.delete(pending.keys().next().value);
        pending.set(key, { amount: 0, age: 0, type, target, position: copyPosition(target.position) });
      }
      pending.get(key).amount += result.damage;
      if (result.killed) {
        const value = pending.get(key); emit(value.amount, type, target, value.position); pending.delete(key);
      }
    } else emit(result.damage, type, target);
    return true;
  }
  function update(dt, { isVisible: visibility = visible } = {}) {
    visible = visibility;
    const delta = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const entry of entries) if (entry.remaining > 0) {
      // Discard rather than pause hidden effects; they must never reappear later.
      if (!canSee(entry.target, entry.position)) { entry.remaining = 0; continue; }
      entry.age += delta; entry.remaining = Math.max(0, entry.remaining - delta);
    }
    for (const [key, value] of pending) {
      if (!canSee(value.target, value.position)) { pending.delete(key); continue; }
      value.age += delta;
      if (value.age >= coalesceSeconds) {
        emit(value.amount, value.type, value.target, value.position); pending.delete(key);
      }
    }
  }
  return { entries, addHit, update,
    reset() { for (const entry of entries) { entry.remaining = 0; entry.target = null; } pending.clear(); emitted = 0; cursor = 0; },
    inspect: () => ({ capacity, active: entries.filter(entry => entry.remaining > 0).map(({ targetId, amount, text, type, age, remaining, position }) => ({ targetId, amount, text, type, age, remaining, position: { ...position } })),
      pending: [...pending.values()].map(({ target, type, amount }) => ({ targetId: target.id, type, amount })), emitted }),
  };
}

function glyphAtlas() {
  const cellWidth = 64, cellHeight = 80;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = cellWidth * GLYPHS.length; canvas.height = cellHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 56px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 6;
      for (let i = 0; i < GLYPHS.length; i++) {
        const x = i * cellWidth + cellWidth / 2;
        ctx.strokeStyle = '#16242b'; ctx.strokeText(GLYPHS[i], x, 40);
        ctx.fillStyle = '#ffffff'; ctx.fillText(GLYPHS[i], x, 40);
      }
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false;
      return texture;
    }
  }
  // Renderer-free tests need no canvas. Keep the same atlas shape with transparent pixels.
  return new THREE.DataTexture(new Uint8Array(GLYPHS.length * 4), GLYPHS.length, 1, THREE.RGBAFormat);
}

/** Floating numbers share a glyph atlas, fixed-size pool and one instanced draw. */
export function createDamageFeedback(scene, options = {}) {
  const state = createDamageFeedbackState(options);
  const capacity = (options.capacity ?? 32) * 8;
  const geometry = new THREE.PlaneGeometry(.4, .58);
  const glyphs = new Float32Array(capacity), alphas = new Float32Array(capacity), tints = new Float32Array(capacity * 3);
  const glyphAttribute = new THREE.InstancedBufferAttribute(glyphs, 1).setUsage(THREE.DynamicDrawUsage);
  const alphaAttribute = new THREE.InstancedBufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage);
  const tintAttribute = new THREE.InstancedBufferAttribute(tints, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('glyphIndex', glyphAttribute); geometry.setAttribute('glyphAlpha', alphaAttribute); geometry.setAttribute('glyphTint', tintAttribute);
  const atlas = glyphAtlas();
  const material = new THREE.ShaderMaterial({
    uniforms: { glyphAtlas: { value: atlas } }, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float glyphIndex;
      attribute float glyphAlpha;
      attribute vec3 glyphTint;
      varying vec2 vGlyphUv;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vGlyphUv = vec2((uv.x + glyphIndex) / ${GLYPHS.length.toFixed(1)}, uv.y);
        vAlpha = glyphAlpha; vTint = glyphTint;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D glyphAtlas;
      varying vec2 vGlyphUv;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vec4 ink = texture2D(glyphAtlas, vGlyphUv);
        if (ink.a < .01 || vAlpha < .01) discard;
        gl_FragColor = vec4(ink.rgb * vTint, ink.a * vAlpha);
        #include <colorspace_fragment>
      }
    `,
  });
  material.userData.ignoreVision = true;
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'Aufsteigende Schadenszahlen'; mesh.count = 0; mesh.renderOrder = 9010; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  const dummy = new THREE.Object3D(), right = new THREE.Vector3(), color = new THREE.Color();
  function update(dt, camera, settings = {}) {
    state.update(dt, settings);
    if (!camera) return;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    let slot = 0;
    for (const entry of state.entries) if (entry.remaining > 0) {
      const text = entry.text.slice(0, 8), progress = entry.age / entry.lifetime;
      const size = 1 + .12 * Math.exp(-entry.age * 12);
      const alpha = Math.min(1, entry.remaining / .3);
      color.set(entry.color);
      for (let i = 0; i < text.length; i++) {
        glyphs[slot] = Math.max(0, GLYPHS.indexOf(text[i])); alphas[slot] = alpha; color.toArray(tints, slot * 3);
        dummy.position.set(entry.position.x, entry.position.y + 3.25 + progress * 1.05, entry.position.z);
        dummy.position.addScaledVector(right, (i - (text.length - 1) / 2) * .31 + entry.offsetX);
        dummy.quaternion.copy(camera.quaternion); dummy.scale.setScalar(size); dummy.updateMatrix(); mesh.setMatrixAt(slot, dummy.matrix); slot++;
      }
    }
    mesh.count = slot; mesh.visible = slot > 0;
    mesh.instanceMatrix.needsUpdate = glyphAttribute.needsUpdate = alphaAttribute.needsUpdate = tintAttribute.needsUpdate = true;
  }
  return { addHit: state.addHit, update,
    reset() { state.reset(); mesh.count = 0; mesh.visible = false; },
    inspect: state.inspect,
    dispose() { state.reset(); mesh.removeFromParent(); geometry.dispose(); material.dispose(); atlas.dispose(); },
  };
}
