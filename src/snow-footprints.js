import * as THREE from 'three';

const MAX_FOOTPRINTS = 96;
const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;
const MAX_STEP_PARTICLES = 72;
const PARTICLES_PER_STEP = 5;

function snowVisualOffset(x, z, snowWeight = 1) {
  const drift = Math.sin(x * .21 + Math.sin(z * .13) * 1.7) * Math.cos(z * .18 - x * .07);
  return snowWeight * (.115 + drift * .040);
}

function hash(seed, salt = 0) {
  const value = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function snowWeightAt(world, x, z) {
  const weights = world.biomeWeightsAt?.(x, z);
  if (Array.isArray(weights)) return weights.find(item => item.biome === 'snow')?.weight ?? 0;
  return world.biomeAt?.(x, z) === 'snow' ? 1 : 0;
}

/** Snow interaction kept deliberately cheap for iPad:
 * one instanced draw for tracks and one for short-lived step particles. */
export function createSnowFootprints(root, world) {
  const geometry = new THREE.PlaneGeometry(.38, .64);
  geometry.rotateX(-Math.PI / 2);
  const fades = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
  geometry.setAttribute('instanceFade', fades);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uTrackColor: { value: new THREE.Color('#cfdadd') } },
    vertexShader: `
      attribute float instanceFade;
      varying vec2 vTrackUv;
      varying float vTrackFade;
      void main() {
        vTrackUv = uv;
        vTrackFade = instanceFade;
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uTrackColor;
      varying vec2 vTrackUv;
      varying float vTrackFade;
      float ellipse(vec2 p, vec2 center, vec2 scale) {
        float d = length((p-center)/scale);
        return 1.0-smoothstep(.72,1.0,d);
      }
      void main() {
        vec2 p = vTrackUv;
        float heel = ellipse(p, vec2(.50,.34), vec2(.31,.27));
        float toe = ellipse(p, vec2(.50,.67), vec2(.36,.34));
        float waistCut = smoothstep(.09,.23,abs(p.x-.5)) * (1.0-smoothstep(.40,.58,p.y));
        float printShape = max(heel*.82, toe) * mix(.82,1.0,waistCut);
        float inner = max(ellipse(p,vec2(.50,.34),vec2(.22,.18)), ellipse(p,vec2(.50,.67),vec2(.26,.24)));
        float rim = max(0.0, printShape-inner*.70);
        float alpha = (printShape*.34 + rim*.15) * vTrackFade;
        if (alpha < .008) discard;
        vec3 compressed = mix(uTrackColor*1.025, uTrackColor*.94, inner);
        vec3 brightRim = vec3(.955,.978,.985);
        vec3 color = mix(compressed, brightRim, clamp(rim*.62,0.0,.58));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  material.name = 'Nebeljagd · verdichtete Fußmulden im Schnee';

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_FOOTPRINTS);
  mesh.name = 'Schneespuren';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  root.add(mesh);

  // Tiny powder fragments appear only on actual foot contacts. They move
  // sideways/backwards and vanish quickly instead of travelling with the player.
  const particleGeometry = new THREE.TetrahedronGeometry(.042, 0);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: '#f4f9fa', transparent: true, opacity: .82, depthWrite: false,
    depthTest: true, toneMapped: false,
  });
  particleMaterial.name = 'Nebeljagd · kurze Pulverschnee-Partikel';
  const particleMesh = new THREE.InstancedMesh(particleGeometry, particleMaterial, MAX_STEP_PARTICLES);
  particleMesh.name = 'Pulverschnee beim Auftreten';
  particleMesh.count = 0;
  particleMesh.frustumCulled = false;
  particleMesh.castShadow = false;
  particleMesh.receiveShadow = false;
  particleMesh.renderOrder = 5;
  root.add(particleMesh);

  const prints = [];
  const particles = [];
  const trackers = new Map();
  const transform = new THREE.Object3D();
  let created = 0, particleBursts = 0, lastAverageFade = 0;

  function spawnParticles(x, y, z, direction, side, speed, time) {
    const forwardX = Math.sin(direction), forwardZ = Math.cos(direction);
    const sideX = Math.cos(direction), sideZ = -Math.sin(direction);
    const speedWeight = THREE.MathUtils.clamp((speed ?? 0) / 5.6, .25, 1.15);
    const seedBase = created * 13 + (side > 0 ? 7 : 19);

    for (let i = 0; i < PARTICLES_PER_STEP; i++) {
      const r1 = hash(seedBase, i * 3 + 1);
      const r2 = hash(seedBase, i * 3 + 2);
      const r3 = hash(seedBase, i * 3 + 3);
      const lateralSpeed = (r1 - .5) * (.34 + speedWeight * .15);
      const backwardSpeed = .08 + r2 * (.18 + speedWeight * .10);
      const vx = sideX * lateralSpeed - forwardX * backwardSpeed;
      const vz = sideZ * lateralSpeed - forwardZ * backwardSpeed;
      particles.push({
        x: x + sideX * (r1 - .5) * .12,
        y: y + .025 + r3 * .025,
        z: z + sideZ * (r1 - .5) * .12,
        vx, vz, vy: .13 + r3 * .15,
        born: time,
        lifetime: .30 + r2 * .18,
        size: .66 + r1 * .55,
        spin: (r3 - .5) * 8,
      });
    }
    if (particles.length > MAX_STEP_PARTICLES) particles.splice(0, particles.length - MAX_STEP_PARTICLES);
    particleBursts++;
  }

  function add(source, time) {
    const direction = Number.isFinite(source.direction) ? source.direction : 0;
    const side = source.side ?? 1;
    const lateral = side * (source.lateral ?? .105);
    const x = source.x + Math.cos(direction) * lateral;
    const z = source.z - Math.sin(direction) * lateral;
    const snowWeight = snowWeightAt(world, x, z);
    if (snowWeight < .62) return false;
    const y = (world.snowSurfaceAt?.(x, z)
      ?? (world.heightAt(x, z) + snowVisualOffset(x, z, snowWeight))) + .008;

    prints.push({
      x, z, y,
      direction, born: time,
      scale: .92 + Math.min(.18, Math.max(0, (source.speed ?? 0) / 8) * .18),
      snowWeight,
    });
    if (prints.length > MAX_FOOTPRINTS) prints.shift();
    created++;
    spawnParticles(x, y, z, direction, side, source.speed ?? 0, time);
    return true;
  }

  function sampleSource(source, time) {
    if (!source?.moving || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return;
    const id = source.id ?? 'player';
    let tracker = trackers.get(id);
    if (!tracker) {
      tracker = { x: source.x, z: source.z, side: -1, initialized: false };
      trackers.set(id, tracker);
    }
    if (!tracker.initialized) {
      tracker.x = source.x; tracker.z = source.z; tracker.initialized = true;
      return;
    }
    const distance = Math.hypot(source.x - tracker.x, source.z - tracker.z);
    if (distance < (source.stepDistance ?? STEP_DISTANCE)) return;
    tracker.side *= -1;
    add({ ...source, side: tracker.side }, time);
    // Always advance the tracker so entering snow never emits accumulated steps.
    tracker.x = source.x; tracker.z = source.z;
  }

  function updateParticles(time) {
    let write = 0;
    for (let read = 0; read < particles.length; read++) {
      const particle = particles[read], age = time - particle.born;
      if (age < 0 || age >= particle.lifetime) continue;
      if (write !== read) particles[write] = particle;
      const progress = age / particle.lifetime;
      const scale = particle.size * (1 - progress) * (1 - progress) + .08;
      transform.position.set(
        particle.x + particle.vx * age,
        particle.y + particle.vy * age - .72 * age * age,
        particle.z + particle.vz * age,
      );
      transform.rotation.set(age * particle.spin, age * particle.spin * .7, age * particle.spin * .35);
      transform.scale.setScalar(scale);
      transform.updateMatrix();
      particleMesh.setMatrixAt(write++, transform.matrix);
    }
    particles.length = write;
    particleMesh.count = write;
    if (write) particleMesh.instanceMatrix.needsUpdate = true;
    return write;
  }

  function update(time, sources = []) {
    for (const source of sources) sampleSource(source, time);
    const activeParticles = updateParticles(time);

    let write = 0, fadeTotal = 0;
    for (let read = 0; read < prints.length; read++) {
      const print = prints[read], age = time - print.born;
      if (age >= LIFETIME) continue;
      if (write !== read) prints[write] = print;
      const fade = age <= FADE_START ? 1 : Math.max(0, 1 - (age - FADE_START) / (LIFETIME - FADE_START));
      transform.position.set(print.x, print.y, print.z);
      transform.rotation.set(0, print.direction + Math.PI, 0);
      transform.scale.setScalar(print.scale);
      transform.updateMatrix();
      mesh.setMatrixAt(write, transform.matrix);
      const visibleFade = fade * THREE.MathUtils.clamp(print.snowWeight * 1.15, 0, 1);
      fades.setX(write, visibleFade); fadeTotal += visibleFade;
      write++;
    }
    prints.length = write;
    lastAverageFade = write ? fadeTotal / write : 0;
    mesh.count = write;
    if (write) {
      mesh.instanceMatrix.needsUpdate = true;
      fades.needsUpdate = true;
    }
    return activeParticles;
  }

  function reset() {
    prints.length = 0; particles.length = 0; trackers.clear();
    mesh.count = 0; particleMesh.count = 0; lastAverageFade = 0;
  }

  return {
    update, reset,
    weightAt(x, z) { return snowWeightAt(world, x, z); },
    dispose() {
      root.remove(mesh, particleMesh);
      geometry.dispose(); material.dispose(); particleGeometry.dispose(); particleMaterial.dispose();
    },
    inspect() {
      const now = prints.length ? Math.max(...prints.map(print => print.born)) : 0;
      return {
        count: prints.length, maximum: MAX_FOOTPRINTS, created,
        fadeStartSeconds: FADE_START, lifetimeSeconds: LIFETIME,
        stepDistance: STEP_DISTANCE, snowThreshold: .62, averageFade: lastAverageFade,
        singleInstancedDraw: true, alignedToVisualSnowSurface: true,
        trackColor: '#cfdadd', trackVisibility: 'moderately-strong-compressed-snow',
        depressionStyle: 'soft-dark-center-with-light-compressed-rim',
        footprintFacingOffsetRadians: Math.PI,
        wadingMounds: 0, maximumWadingMounds: 0, wadingStyle: 'removed',
        activeStepParticles: particles.length, maximumStepParticles: MAX_STEP_PARTICLES,
        particlesPerStep: PARTICLES_PER_STEP, particleLifetimeSeconds: [.30, .48],
        particleDirection: 'sideways-and-backward', particleBursts,
        recommendedVisualSinkMeters: .22,
        oldestAgeAtLastPrint: prints.length ? now - Math.min(...prints.map(print => print.born)) : 0,
      };
    },
  };
}
