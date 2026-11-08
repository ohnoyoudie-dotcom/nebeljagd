import * as THREE from 'three';
import { RARITIES } from './loot-tiers.js';

const MAX_MOTES = 10;
const PRESENTATION = Object.freeze({
  normal: { intensity: .62, motes: 2 },
  common: { intensity: .80, motes: 3 },
  uncommon: { intensity: 1.00, motes: 5 },
  rare: { intensity: 1.18, motes: 7 },
  epic: { intensity: 1.34, motes: 9 },
  legendary: { intensity: 1.52, motes: 10 },
});
let shared = null;

function acquireGeometry() {
  if (!shared) {
    const ground = new THREE.PlaneGeometry(2, 2);
    const sprites = new THREE.PlaneGeometry(1, 1);
    const seeds = new Float32Array((MAX_MOTES + 1) * 4);
    // Instance zero is the soft light wrapped around the floating object.
    // Remaining instances are small drifting motes, all in the same draw call.
    seeds.set([0, 0, 0, 0]);
    for (let index = 0; index < MAX_MOTES; index++) {
      seeds.set([index * 2.39996323, .32 + (index * 7 % 11) / 11 * .34,
        (index * 13 % 17) / 17, 1], (index + 1) * 4);
    }
    sprites.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    shared = { ground, sprites, references: 0 };
  }
  shared.references++;
  return shared;
}

const clamp01 = value => Math.max(0, Math.min(1, value));

/** A shared-geometry rarity aura for an existing ground-item group.
 * The owner controls range/LOS through the parent and hides collected items.
 * No light, texture, timer or gameplay state is created per item. */
export function createLootGlow(parent, { rarity = 'common', radius = 1, height = .55, phase = 0 } = {}) {
  const resources = acquireGeometry();
  const group = new THREE.Group(); group.name = 'Beute – Seltenheitsleuchten';
  group.userData.lootGlow = true;
  parent.add(group);
  const safeRadius = Number.isFinite(radius) ? THREE.MathUtils.clamp(radius, .25, 3) : 1;
  const safeHeight = Number.isFinite(height) ? Math.max(.1, height) : .55;
  const uniforms = {
    uTime: { value: 0 }, uPhase: { value: Number.isFinite(phase) ? phase : 0 },
    uColor: { value: new THREE.Color() }, uIntensity: { value: 1 }, uOpacity: { value: 1 },
    uRadius: { value: safeRadius }, uHeight: { value: safeHeight },
  };
  // vWorld and the tone-mapping include deliberately follow the existing
  // tactical-vision shader contract, so its boundary can shade the aura too.
  const material = (name, vertexShader, fragmentShader) => new THREE.ShaderMaterial({
    name, uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.NormalBlending,
  });
  const groundMaterial = material('Beute – weiches farbiges Bodenlicht', `
    varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`, `
    uniform float uTime, uPhase, uIntensity, uOpacity; uniform vec3 uColor;
    varying vec2 vUv; varying vec3 vWorld;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float pulse = .94 + .06 * sin(uTime * 1.8 + uPhase);
      float soft = exp(-r * r * 3.8);
      float inner = exp(-pow((r - .40) / .12, 2.0));
      float edge = 1.0 - smoothstep(.72, 1.0, r);
      float alpha = (.62 * soft + .16 * inner) * edge * pulse * uIntensity * uOpacity;
      gl_FragColor = vec4(uColor, min(.78, alpha));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const ground = new THREE.Mesh(resources.ground, groundMaterial);
  ground.name = 'Beute – Licht auf dem Boden'; ground.rotation.x = -Math.PI / 2;
  ground.position.y = .047; ground.scale.setScalar(safeRadius * 1.35);
  group.add(ground);

  const spriteMaterial = material('Beute – Lichtsaum und schwebende Funken', `
    uniform float uTime, uPhase, uRadius, uHeight, uIntensity;
    attribute vec4 aSeed;
    varying vec2 vUv; varying vec3 vWorld;
    varying float vKind, vFade;
    void main() {
      vUv = uv; vKind = aSeed.w;
      vec3 localCenter; vec2 size;
      if (aSeed.w < .5) {
        localCenter = vec3(0.0, uHeight, 0.0);
        size = vec2(uRadius * 1.70, uHeight * 1.8 + .45);
        vFade = .95 + .05 * sin(uTime * 1.8 + uPhase);
      } else {
        float progress = fract(uTime * .27 + aSeed.z + uPhase * .137);
        float angle = aSeed.x + uTime * (.22 + aSeed.z * .10) + uPhase;
        float orbit = uRadius * aSeed.y * (.82 + progress * .24);
        localCenter = vec3(cos(angle) * orbit, .12 + progress * (uHeight + .72), sin(angle) * orbit);
        float width = .065 + aSeed.z * .025 + (uIntensity - .6) * .012;
        size = vec2(width, width * (1.25 + progress * .35));
        vFade = smoothstep(0.0, .18, progress) * (1.0 - smoothstep(.58, 1.0, progress));
      }
      vec4 center = modelViewMatrix * vec4(localCenter, 1.0);
      center.xy += position.xy * size * length(modelMatrix[0].xyz);
      vWorld = (modelMatrix * vec4(localCenter, 1.0)).xyz;
      gl_Position = projectionMatrix * center;
    }`, `
    uniform float uIntensity, uOpacity; uniform vec3 uColor;
    varying vec2 vUv; varying vec3 vWorld; varying float vKind, vFade;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float radius = length(p);
      float edge = 1.0 - smoothstep(.68, 1.0, radius);
      float core = exp(-dot(p, p) * 5.4);
      float alpha;
      vec3 color;
      if (vKind < .5) {
        alpha = exp(-dot(p, p) * 3.4) * edge * .40 * uIntensity;
        color = uColor;
      } else {
        float flare = exp(-p.x * p.x * 22.0 - p.y * p.y * 3.5)
          + exp(-p.x * p.x * 3.5 - p.y * p.y * 22.0);
        alpha = (core * .68 + flare * .19) * edge;
        color = mix(uColor, vec3(1.0), core * .40);
      }
      gl_FragColor = vec4(color, min(.82, alpha * vFade * uOpacity));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`);
  const sprites = new THREE.InstancedMesh(resources.sprites, spriteMaterial, MAX_MOTES + 1);
  sprites.name = 'Beute – sichtbarer Lichtsaum'; sprites.frustumCulled = false;
  group.add(sprites);
  let tier = 'common', disposed = false;

  function setRarity(value = 'common') {
    if (disposed) return;
    tier = Object.hasOwn(PRESENTATION, value) && Object.hasOwn(RARITIES, value) ? value : 'common';
    uniforms.uColor.value.set(RARITIES[tier].color);
    uniforms.uIntensity.value = PRESENTATION[tier].intensity;
    sprites.count = PRESENTATION[tier].motes + 1;
  }
  function effectiveVisibility() {
    if (disposed || uniforms.uOpacity.value <= .001) return false;
    for (let node = group; node; node = node.parent) if (!node.visible) return false;
    return Boolean(group.parent);
  }
  setRarity(rarity);
  return {
    group,
    setRarity,
    setVisible(value) { if (!disposed) group.visible = Boolean(value); },
    update(time = 0, opacity = 1) {
      if (disposed) return;
      uniforms.uTime.value = Number.isFinite(time) ? Math.max(0, time) : 0;
      uniforms.uOpacity.value = Number.isFinite(opacity) ? clamp01(opacity) : 1;
      const visible = uniforms.uOpacity.value > .001;
      ground.visible = sprites.visible = visible;
    },
    inspect() {
      const visible = effectiveVisibility();
      return { style: 'layered-rarity-aura', rarity: tier, color: `#${uniforms.uColor.value.getHexString()}`,
        intensity: uniforms.uIntensity.value, particleCount: visible ? PRESENTATION[tier].motes : 0,
        opacity: uniforms.uOpacity.value, visible, depthTested: true, drawCalls: visible ? 2 : 0,
        radius: safeRadius, height: safeHeight };
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      groundMaterial.dispose(); spriteMaterial.dispose();
      if (--resources.references === 0) {
        resources.ground.dispose(); resources.sprites.dispose();
        if (shared === resources) shared = null;
      }
    },
  };
}
