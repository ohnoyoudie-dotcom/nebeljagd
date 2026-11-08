import * as THREE from 'three';

const DURATION = 1.6;
const PARTICLES = 22;
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = (start, end, value) => { const t = clamp01((value - start) / (end - start)); return t * t * (3 - 2 * t); };

// A quiet rise and release. Geometry and particle seeds are reused; a victory
// only restarts the timeline, without changing health or combat state.
export function createLevelUpEffect(scene) {
  const root = new THREE.Group();
  root.name = 'Levelaufstieg'; root.visible = false;
  // Give the approved soft effect more reach without changing its timing or glow.
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

  // One tapered thread travels upward around the body. Its soft edges and
  // moving tail replace the solid hoops and cylindrical light wall.
  const ribbonGeometry = new THREE.BufferGeometry();
  const segments = 96, positions = [], uvs = [], indices = [];
  for (let index = 0; index <= segments; index++) {
    const t = index / segments, angle = -1.5 + t * Math.PI * 1.7;
    const radius = .62 + Math.sin(t * Math.PI) * .10;
    const width = .055 * Math.sin(Math.PI * t) + .015;
    for (const side of [-1, 1]) {
      const r = radius + side * width;
      positions.push(Math.cos(angle) * r, .18 + t * 2.15, Math.sin(angle) * r);
      uvs.push((side + 1) / 2, t);
    }
    if (index < segments) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  ribbonGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  ribbonGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  ribbonGeometry.setIndex(indices);
  const ribbonMaterial = makeMaterial('Level – rising gold thread', `
    uniform float uOpacity, uHead; uniform vec3 uGold, uLight; varying vec2 vUv;
    void main() {
      float edge = exp(-pow((vUv.x - .5) * 4.5, 2.0));
      edge *= smoothstep(0.0, .13, vUv.x) * (1.0 - smoothstep(.87, 1.0, vUv.x));
      float trail = smoothstep(uHead - .65, uHead - .10, vUv.y)
        * (1.0 - smoothstep(uHead - .035, uHead + .035, vUv.y));
      float tip = smoothstep(0.0, .09, vUv.y) * (1.0 - smoothstep(.85, 1.0, vUv.y));
      gl_FragColor = vec4(mix(uGold, uLight, trail * .65), uOpacity * edge * trail * tip);
      #include <colorspace_fragment>
    }`, { uHead: { value: 0 }, uGold: { value: new THREE.Color('#c6a35e') },
      uLight: { value: new THREE.Color('#f3d99c') } });
  const ribbon = new THREE.Mesh(ribbonGeometry, ribbonMaterial);
  root.add(ribbon);

  // Camera-facing flecks with individual rise/fade times and a golden-angle
  // distribution. Soft cores remain small, without faceted confetti or spokes.
  const moteGeometry = new THREE.PlaneGeometry(1, 1);
  const seeds = new Float32Array(PARTICLES * 4);
  for (let index = 0; index < PARTICLES; index++) {
    const random = ((index * 17 + 11) % 23) / 23;
    seeds.set([.045 + random * .30, .78 + ((index * 7) % 11) / 11 * .43,
      index * 2.39996323, .34 + ((index * 13) % 19) / 19 * .48], index * 4);
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
      float drift = 1.0 - pow(1.0 - t, 2.0);
      float angle = aSeed.z + drift * .55;
      float radius = aSeed.w + drift * .22;
      float variation = fract(aSeed.z * .37);
      vec3 center = vec3(cos(angle) * radius, .18 + (1.65 + variation * .65) * drift, sin(angle) * radius);
      vec4 viewCenter = modelViewMatrix * vec4(center, 1.0);
      float size = (.14 + variation * .08) * (1.0 - t * .35);
      // Billboard corners bypass modelViewMatrix, so carry the effect's scale
      // into their size as well as the rising particle positions.
      float effectScale = length(modelMatrix[0].xyz);
      viewCenter.xy += position.xy * vec2(size, size * 1.5) * effectScale;
      gl_Position = projectionMatrix * viewCenter;
      vFade = smoothstep(0.0, .16, t) * (1.0 - smoothstep(.38, 1.0, t));
    }`);
  const motes = new THREE.InstancedMesh(moteGeometry, moteMaterial, PARTICLES);
  motes.frustumCulled = false;
  root.add(motes);

  // Keep one unshadowed light registered at zero intensity between celebrations.
  // Adding/removing it on a kill would recompile all lit world materials.
  const light = new THREE.PointLight('#eac17a', 0, 4.86, 2);
  light.name = 'Levelaufstieg – warmes Umgebungslicht';
  scene.add(light);
  let age = 0, active = false, reducedMotion = false, level = 1, emitted = 0, disposed = false;

  function reset() {
    active = false; age = 0; root.visible = false; motes.count = 0;
    haloMaterial.uniforms.uOpacity.value = ribbonMaterial.uniforms.uOpacity.value = 0;
    moteMaterial.uniforms.uOpacity.value = 0; light.intensity = 0;
  }

  function update(dt, position) {
    if (!active || disposed) return;
    age += Math.max(0, Number.isFinite(dt) ? dt : 0);
    const duration = reducedMotion ? .9 : DURATION;
    if (age >= duration) { reset(); return; }
    if (position) root.position.copy(position);
    light.position.copy(root.position); light.position.y += .85;
    root.visible = true;
    const rise = smooth(0, .16, age), release = 1 - smooth(.35, reducedMotion ? .9 : 1.15, age);
    halo.scale.setScalar(reducedMotion ? 1.15 : .65 + 1.0 * (1 - (1 - clamp01(age / .85)) ** 3));
    haloMaterial.uniforms.uOpacity.value = (reducedMotion ? .28 : .60) * rise * release;
    light.intensity = (reducedMotion ? 1.2 : 3.2) * rise * release;
    ribbon.visible = !reducedMotion;
    ribbonMaterial.uniforms.uHead.value = (age - .06) / .84;
    ribbonMaterial.uniforms.uOpacity.value = reducedMotion ? 0 : .78 * smooth(.06, .20, age) * (1 - smooth(.9, 1.45, age));
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
    inspect: () => ({ active, level, emitted, style: 'woven-gold', age,
      duration: reducedMotion ? .9 : DURATION, particleCount: active ? motes.count : 0,
      haloVisible: active && haloMaterial.uniforms.uOpacity.value > 0,
      ribbonVisible: active && !reducedMotion && ribbonMaterial.uniforms.uOpacity.value > 0,
      lightIntensity: light.intensity, depthTested: true, ringCount: 0, beamVisible: false,
      reducedMotion, remaining: active ? (reducedMotion ? .9 : DURATION) - age : 0 }),
    dispose() {
      reset(); disposed = true; scene.remove(root); scene.remove(light);
      halo.geometry.dispose(); ribbonGeometry.dispose(); moteGeometry.dispose();
      haloMaterial.dispose(); ribbonMaterial.dispose(); moteMaterial.dispose(); light.dispose();
    },
  };
}
