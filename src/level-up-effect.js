import * as THREE from 'three';

const DURATION = 1.6;
const PARTICLES = 36;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = (start, end, value) => { const t = clamp01((value - start) / (end - start)); return t * t * (3 - 2 * t); };

// A brief light burst from the body. Geometry and particle seeds are reused; a victory
// only restarts the timeline, without changing health or combat state.
export function createLevelUpEffect(scene, { onGlow = () => {} } = {}) {
  const root = new THREE.Group();
  root.name = 'Levelaufstieg'; root.visible = false;
  // Keep the generous reach of the approved effect around the character.
  root.scale.set(1.35, 1.4, 1.35);
  root.userData.ignoreVision = true;
  scene.add(root);

  const vertex = `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const makeMaterial = (name, fragmentShader, uniforms = {}, vertexShader = vertex) => {
    const material = new THREE.ShaderMaterial({
      name, vertexShader, fragmentShader, uniforms: { uOpacity: { value: 0 }, ...uniforms },
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, forceSinglePass: true,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    material.userData.ignoreVision = material.userData.ignoreFogOfWar = true;
    return material;
  };

  // A feathered wash sits on the surface. Grass interrupts it; the local
  // light also illuminates the blades rather than painting over them.
  const haloMaterial = makeMaterial('Level – soft ground light', `
    uniform float uOpacity; uniform vec3 uGold; varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      float glow = exp(-r * r * 4.4);
      float rim = exp(-pow((r - .67) / .075, 2.0));
      float alpha = uOpacity * (.40 * glow + .24 * rim) * (1.0 - smoothstep(.82, 1.0, r));
      gl_FragColor = vec4(uGold, alpha);
      #include <colorspace_fragment>
    }`, { uGold: { value: new THREE.Color('#d9b86d') } });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), haloMaterial);
  halo.rotation.x = -Math.PI / 2; halo.position.y = .06;
  root.add(halo);

  // A brief soft flare originates in the chest. Depth testing lets the actual
  // glowing body remain in front; it is not a screen-wide white flash.
  const coreMaterial = makeMaterial('Level – inner light release', `
    uniform float uOpacity; uniform vec3 uGold; varying vec2 vUv;
    void main() {
      float radius = length(vUv * 2.0 - 1.0);
      float alpha = exp(-radius * radius * 4.0) * (1.0 - smoothstep(.7, 1.0, radius));
      gl_FragColor = vec4(uGold, alpha * uOpacity);
      #include <colorspace_fragment>
    }`, { uGold: { value: new THREE.Color('#f8d690') } }, `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      center.xy += position.xy * length(modelMatrix[0].xyz);
      gl_Position = projectionMatrix * center;
    }`);
  const core = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), coreMaterial);
  core.position.y = .92;
  root.add(core);

  // The flecks start together inside the body and shoot outward, then
  // slow into drifting embers. Their streaks follow the projected travel direction.
  const moteGeometry = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(PARTICLES * 4);
  for (let index = 0; index < PARTICLES; index++) {
    const random = ((index * 17 + 11) % 23) / 23;
    seeds.set([.045 + random * .045, .78 + ((index * 7) % 11) / 11 * .48,
      index * 2.39996323, -.22 + ((index * 13) % 31) / 31 * 1.15], index * 4);
  }
  moteGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const moteMaterial = makeMaterial('Level – floating gold motes', `
    uniform float uOpacity; uniform vec3 uGold, uLight;
    varying vec2 vUv; varying float vFade;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r2 = dot(p, p);
      float core = exp(-r2 * 18.0);
      float glow = exp(-r2 * 4.0) * .18;
      float alpha = (core + glow) * (1.0 - smoothstep(.70, 1.0, sqrt(r2))) * vFade * uOpacity;
      gl_FragColor = vec4(mix(uGold, uLight, core * .65), alpha);
      #include <colorspace_fragment>
    }`, { uAge: { value: 0 }, uGold: { value: new THREE.Color('#d3b06c') },
      uLight: { value: new THREE.Color('#ffe7b3') } }, `
    uniform float uAge; attribute vec4 aSeed;
    varying vec2 vUv; varying float vFade;
    void main() {
      vUv = uv;
      float t = clamp((uAge - aSeed.x) / aSeed.y, 0.0, 1.0);
      float travel = (1.0 - exp(-4.0 * t)) / (1.0 - exp(-4.0));
      float variation = fract(aSeed.z * .37);
      float horizontal = sqrt(max(.01, 1.0 - aSeed.w * aSeed.w));
      vec3 direction = vec3(cos(aSeed.z) * horizontal, aSeed.w, sin(aSeed.z) * horizontal);
      vec3 center = vec3(0.0, .92, 0.0) + direction * (1.65 + variation * .50) * travel;
      center.y += .22 * t * t;
      vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
      float size = (.17 + variation * .10) * (1.0 - t * .45);
      float effectScale = length(modelMatrix[0].xyz);
      vec2 outward = (modelViewMatrix * vec4(direction, 0.0)).xy;
      outward /= max(.001, length(outward));
      vec2 across = vec2(-outward.y, outward.x);
      viewCenter.xy += (across * position.x + outward * position.y * (2.6 - t * 1.2)) * size * effectScale;
      gl_Position = projectionMatrix * viewCenter;
      vFade = smoothstep(0.0, .07, t) * (1.0 - smoothstep(.28, 1.0, t));
    }`);
  const motes = new THREE.InstancedMesh(moteGeometry, moteMaterial, PARTICLES);
  motes.frustumCulled = false;
  root.add(motes);

  // Keep one unshadowed light registered at zero intensity between celebrations.
  // Adding/removing it on a kill would recompile all lit world materials.
  const light = new THREE.PointLight('#eac17a', 0, 4.86, 2);
  light.name = 'Levelaufstieg – warmes Umgebungslicht';
  scene.add(light);
  let age = 0, active = false, reducedMotion = false, level = 1, emitted = 0, disposed = false, bodyGlow = 0;

  function reset() {
    active = false; age = 0; root.visible = false; motes.count = 0;
    haloMaterial.uniforms.uOpacity.value = coreMaterial.uniforms.uOpacity.value = 0;
    moteMaterial.uniforms.uOpacity.value = 0; light.intensity = 0;
    bodyGlow = 0; onGlow(0);
  }

  function update(dt, position) {
    if (!active || disposed) return;
    age += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const duration = reducedMotion ? .9 : DURATION;
    if (age >= duration) { reset(); return; }
    if (position) root.position.copy(position);
    light.position.copy(root.position); light.position.y += 1.2;
    root.visible = true;
    const rise = smooth(0, reducedMotion ? .18 : .10, age);
    const release = 1 - smooth(reducedMotion ? .35 : .24, reducedMotion ? .9 : .85, age);
    bodyGlow = reducedMotion ? .30 * rise * release
      : smooth(.01, .095, age) * (1 - smooth(.12, .42, age));
    onGlow(bodyGlow);
    halo.scale.setScalar(reducedMotion ? 1.15 : .35 + 1.55 * (1 - (1 - clamp01((age - .035) / .6)) ** 3));
    haloMaterial.uniforms.uOpacity.value = (reducedMotion ? .28 : .68) * rise * release;
    light.intensity = (reducedMotion ? 1.2 : 5.4) * rise * release;
    core.visible = !reducedMotion;
    core.scale.setScalar(.18 + 1.30 * smooth(.025, .35, age));
    coreMaterial.uniforms.uOpacity.value = reducedMotion ? 0
      : .65 * smooth(.01, .09, age) * (1 - smooth(.13, .42, age));
    motes.count = reducedMotion ? 0 : PARTICLES;
    moteMaterial.uniforms.uAge.value = age;
    moteMaterial.uniforms.uOpacity.value = reducedMotion ? 0 : .90;
  }

  return {
    trigger({ position, level: nextLevel, reducedMotion: reduce = false }) {
      if (disposed || !position) return;
      age = 0; active = true; reducedMotion = Boolean(reduce);
      level = nextLevel; emitted++;
      update(0, position);
    },
    update,
    reset() { reset(); emitted = 0; level = 1; },
    inspect: () => ({ active, level, emitted, style: 'core-burst', age, bodyGlow,
      duration: reducedMotion ? .9 : DURATION, particleCount: active ? motes.count : 0,
      haloVisible: active && haloMaterial.uniforms.uOpacity.value > 0,
      coreVisible: active && !reducedMotion && coreMaterial.uniforms.uOpacity.value > 0,
      ribbonVisible: false,
      lightIntensity: light.intensity, depthTested: true, ringCount: 0, beamVisible: false,
      reducedMotion, remaining: active ? (reducedMotion ? .9 : DURATION) - age : 0 }),
    dispose() {
      reset(); disposed = true; scene.remove(root); scene.remove(light);
      halo.geometry.dispose(); core.geometry.dispose(); moteGeometry.dispose();
      haloMaterial.dispose(); coreMaterial.dispose(); moteMaterial.dispose(); light.dispose();
    },
  };
}
