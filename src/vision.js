import * as THREE from 'three';
import { createSightModel } from './visibility-model.js';

/** Obstacle shadows on the scenery plus geometric line of sight for actors,
 * health bars, loot and interactions. */
export function createVision(scene, world, { radius = 18, samples = 512 } = {}) {
  const sight = createSightModel({ obstacles: world.projectileObstacles, radius, samples });
  const pixels = new Uint8Array(samples * 4);
  const mask = new THREE.DataTexture(pixels, samples, 1, THREE.RGBAFormat);
  mask.minFilter = mask.magFilter = THREE.LinearFilter;
  mask.wrapS = THREE.RepeatWrapping; mask.wrapT = THREE.ClampToEdgeWrapping;
  mask.generateMipmaps = false;
  const origin = { value: new THREE.Vector2(world.spawn.x, world.spawn.z) };
  const radiusUniform = { value: radius }, textureUniform = { value: mask };
  const hooks = new Map();
  const objectHooks = new Map();
  let lastSampleTime = -Infinity, lastRegistrationTime = -Infinity;
  let updates = 0;
  const declaration = `
    uniform sampler2D uTacticalSight;
    uniform vec2 uTacticalOrigin;
    uniform float uTacticalRadius;
    uniform float uTacticalBlockerSurface;
    vec3 applyTacticalSight(vec3 color, vec2 point) {
      vec2 delta = point - uTacticalOrigin;
      float distanceToViewer = length(delta);
      float angle = atan(delta.y, delta.x) / 6.28318530718;
      float limit = texture2D(uTacticalSight, vec2(fract(angle + .5 / ${samples.toFixed(1)}), .5)).r * uTacticalRadius;
      float obstacleFade = 1. - smoothstep(limit + .12, limit + .7, distanceToViewer);
      float visibility = max(obstacleFade, uTacticalBlockerSurface);
      float luminance = dot(color, vec3(.2126, .7152, .0722));
      vec3 softened = mix(color, vec3(luminance), .3);
      vec3 shadow = mix(softened, vec3(.075, .105, .145), .84);
      return mix(shadow, color, visibility);
    }
  `;
  function register(object = scene) {
    const present = object === scene ? new Set() : null;
    object.traverse(node => {
      if (node.userData?.ignoreVision || (!node.isMesh && !node.isLine)) return;
      if (!objectHooks.has(node)) {
        const original = node.onBeforeRender;
        node.onBeforeRender = function(renderer, currentScene, camera, geometry, material, group) {
          original?.call(this, renderer, currentScene, camera, geometry, material, group);
          let blockerSurface = false;
          for (let parent = this; parent; parent = parent.parent) blockerSurface ||= parent.userData?.visionBlockerSurface === true;
          const hook = hooks.get(material);
          if (hook) hook.blockerUniform.value = blockerSurface ? 1 : 0;
        };
        objectHooks.set(node, original);
      }
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material || material.userData?.ignoreVision) continue;
        present?.add(material);
        if (hooks.has(material)) continue;
        const standard = material.isMeshStandardMaterial || material.isMeshBasicMaterial || material.isLineBasicMaterial;
        const water = material.isShaderMaterial && material.vertexShader.includes('varying vec3 vWorld;') && material.fragmentShader.includes('#include <tonemapping_fragment>');
        if (!standard && !water) continue;
        const original = material.onBeforeCompile, originalKey = material.customProgramCacheKey;
        const baseKey = originalKey?.call(material) ?? '';
        const blockerUniform = { value: 0 };
        material.onBeforeCompile = shader => {
          original?.call(material, shader);
          shader.uniforms.uTacticalSight = textureUniform;
          shader.uniforms.uTacticalOrigin = origin;
          shader.uniforms.uTacticalRadius = radiusUniform;
          shader.uniforms.uTacticalBlockerSurface = blockerUniform;
          let position = 'vWorld.xz';
          if (standard) {
            position = 'vTacticalWorld.xz';
            shader.vertexShader = `varying vec3 vTacticalWorld;\n${shader.vertexShader}`.replace('#include <worldpos_vertex>', `
              #include <worldpos_vertex>
              vec4 tacticalPosition = vec4(transformed, 1.);
              #ifdef USE_INSTANCING
                tacticalPosition = instanceMatrix * tacticalPosition;
              #endif
              vTacticalWorld = (modelMatrix * tacticalPosition).xyz;
            `);
            shader.fragmentShader = `varying vec3 vTacticalWorld;\n${shader.fragmentShader}`;
          }
          shader.fragmentShader = `${declaration}\n${shader.fragmentShader}`.replace('#include <tonemapping_fragment>', `gl_FragColor.rgb = applyTacticalSight(gl_FragColor.rgb, ${position});\n#include <tonemapping_fragment>`);
        };
        material.customProgramCacheKey = () => `${baseKey}|tactical-sight-v3-obstacle-shadow`;
        material.needsUpdate = true;
        hooks.set(material, { original, originalKey, blockerUniform });
      }
    });
    // Chest loot owns short-lived materials. A reset removes/disposes those;
    // release our hooks too so repeated rounds cannot retain old loot forever.
    if (present) for (const [material, hook] of hooks) if (!present.has(material)) {
      material.onBeforeCompile = hook.original;
      material.customProgramCacheKey = hook.originalKey;
      material.needsUpdate = true;
      hooks.delete(material);
    }
  }
  function update(player, timeSeconds = 0) {
    if (timeSeconds - lastRegistrationTime > 1 || timeSeconds < lastRegistrationTime) { register(); lastRegistrationTime = timeSeconds; }
    const distance = Math.hypot(player.x - sight.observer.x, player.z - sight.observer.z);
    if (timeSeconds - lastSampleTime < .065 && timeSeconds >= lastSampleTime && distance < .16) return;
    sight.update(player); origin.value.set(player.x, player.z);
    for (let i = 0; i < samples; i++) {
      const value = Math.round(sight.distances[i] / radius * 255);
      pixels[i * 4] = value; pixels[i * 4 + 1] = value; pixels[i * 4 + 2] = value; pixels[i * 4 + 3] = 255;
    }
    mask.needsUpdate = true; lastSampleTime = timeSeconds; updates++;
  }
  function isVisible(point, { concealed, local = false } = {}) {
    return sight.isVisible(point, { local, concealed: concealed ?? (world.concealmentAt?.(point.x, point.z) > .45) });
  }
  register();
  update({ x: world.spawn.x, z: world.spawn.z, y: world.heightAt(world.spawn.x, world.spawn.z) }, 0);
  return { update, isVisible, register, radius,
    inspect: () => ({ radius, direction: '360-degree', appearance: 'clear-obstacle-only', sceneryTransmission: 1,
      blockerCount: sight.nearbyCount, samples, updates, origin: { ...sight.observer }, materials: hooks.size }),
    get stats() { return this.inspect(); },
    dispose() {
      for (const [material, hook] of hooks) { material.onBeforeCompile = hook.original; material.customProgramCacheKey = hook.originalKey; material.needsUpdate = true; }
      for (const [object, original] of objectHooks) object.onBeforeRender = original;
      objectHooks.clear();
      hooks.clear(); mask.dispose();
    },
  };
}
