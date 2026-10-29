import * as THREE from 'three';

const MAX_FOOTPRINTS = 96;
const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;
const MAX_WADING_MOUNDS = 8;

function snowVisualOffset(x, z, snowWeight = 1) {
  const drift = Math.sin(x * .21 + Math.sin(z * .13) * 1.7) * Math.cos(z * .18 - x * .07);
  return snowWeight * (.115 + drift * .040);
}

export function snowWeightAt(world, x, z) {
  const weights = world.biomeWeightsAt?.(x, z);
  if (Array.isArray(weights)) return weights.find(item => item.biome === 'snow')?.weight ?? 0;
  return world.biomeAt?.(x, z) === 'snow' ? 1 : 0;
}

/** Lightweight instanced snow tracks. No per-print mesh/material allocations:
 * matrices and fade values are compacted into one GPU draw each frame. */
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
    uniforms: { uTrackColor: { value: new THREE.Color('#dbe5e7') } },
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
        float rim = max(0.0, printShape-inner*.72);
        float alpha = (printShape*.27 + rim*.10) * vTrackFade;
        if (alpha < .008) discard;
        vec3 color = mix(uTrackColor*1.025, uTrackColor*.97, inner);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  material.name = 'Nebeljagd · verblassende Fußspuren im Schnee';

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_FOOTPRINTS);
  mesh.name = 'Schneespuren';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  root.add(mesh);

  // One shallow forward ridge is shown only while moving through deep snow.
  // Standing no longer creates a white ring or two artificial piles around the feet.
  const wadingGeometry = new THREE.SphereGeometry(.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const wadingMaterial = new THREE.MeshStandardMaterial({
    color: '#e8f0f2', roughness: .99, metalness: 0, transparent: true, opacity: .72, depthWrite: false,
  });
  wadingMaterial.name = 'Nebeljagd · aufgeworfener Pulverschnee';
  const wadingMesh = new THREE.InstancedMesh(wadingGeometry, wadingMaterial, MAX_WADING_MOUNDS);
  wadingMesh.name = 'Aufgeworfener Schnee an den Beinen';
  wadingMesh.count = 0;
  wadingMesh.frustumCulled = false;
  wadingMesh.castShadow = false;
  wadingMesh.receiveShadow = true;
  wadingMesh.renderOrder = 3;
  root.add(wadingMesh);

  const prints = [];
  const trackers = new Map();
  const transform = new THREE.Object3D();
  let created = 0, lastAverageFade = 0;

  function add(source, time) {
    const direction = Number.isFinite(source.direction) ? source.direction : 0;
    const side = source.side ?? 1;
    const lateral = side * (source.lateral ?? .105);
    const x = source.x + Math.cos(direction) * lateral;
    const z = source.z - Math.sin(direction) * lateral;
    const snowWeight = snowWeightAt(world, x, z);
    if (snowWeight < .62) return false;
    prints.push({
      x, z, y: (world.snowSurfaceAt?.(x, z) ?? (world.heightAt(x, z) + snowVisualOffset(x, z, snowWeight))) + .008,
      direction, born: time,
      scale: .92 + Math.min(.18, Math.max(0, (source.speed ?? 0) / 8) * .18),
      snowWeight,
    });
    if (prints.length > MAX_FOOTPRINTS) prints.shift();
    created++;
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
    if (add({ ...source, side: tracker.side }, time)) {
      tracker.x = source.x; tracker.z = source.z;
    } else {
      // Keep the tracker close even outside snow so entering a snow field does
      // not emit a burst of old accumulated steps.
      tracker.x = source.x; tracker.z = source.z;
    }
  }

  function updateWading(_time, sources) {
    let write = 0;
    for (const source of sources) {
      if (!Number.isFinite(source?.x) || !Number.isFinite(source?.z) || write >= MAX_WADING_MOUNDS) continue;
      const weight = snowWeightAt(world, source.x, source.z);
      const speed = THREE.MathUtils.clamp((source.speed ?? 0) / 5.6, 0, 1.25);
      if (weight < .58 || !source.moving || speed < .08) continue;

      const direction = Number.isFinite(source.direction) ? source.direction : 0;
      const forwardX = Math.sin(direction), forwardZ = Math.cos(direction);
      const surfaceY = (world.snowSurfaceAt?.(source.x, source.z)
        ?? (world.heightAt(source.x, source.z) + snowVisualOffset(source.x, source.z, weight)));

      // A single low bow wave reads as displaced powder without surrounding
      // the character with a circular mound.
      const ahead = .29 + speed * .08;
      transform.position.set(
        source.x + forwardX * ahead,
        surfaceY - .018,
        source.z + forwardZ * ahead,
      );
      transform.rotation.set(0, direction, 0);
      transform.scale.set(.74 + speed * .11, .055 + weight * .035 + speed * .025, .34 + speed * .05);
      transform.updateMatrix();
      wadingMesh.setMatrixAt(write++, transform.matrix);
    }
    wadingMesh.count = write;
    if (write) wadingMesh.instanceMatrix.needsUpdate = true;
    return write;
  }

  let lastWadingCount = 0;

  function update(time, sources = []) {
    for (const source of sources) sampleSource(source, time);
    lastWadingCount = updateWading(time, sources);
    let write = 0, fadeTotal = 0;
    for (let read = 0; read < prints.length; read++) {
      const print = prints[read], age = time - print.born;
      if (age >= LIFETIME) continue;
      if (write !== read) prints[write] = print;
      const fade = age <= FADE_START ? 1 : Math.max(0, 1 - (age - FADE_START) / (LIFETIME - FADE_START));
      transform.position.set(print.x, print.y, print.z);
      transform.rotation.set(0, print.direction, 0);
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
  }

  function reset() {
    prints.length = 0; trackers.clear(); mesh.count = 0; wadingMesh.count = 0; lastAverageFade = 0; lastWadingCount = 0;
  }

  return {
    update, reset,
    weightAt(x, z) { return snowWeightAt(world, x, z); },
    dispose() {
      root.remove(mesh, wadingMesh);
      geometry.dispose(); material.dispose(); wadingGeometry.dispose(); wadingMaterial.dispose();
    },
    inspect() {
      const now = prints.length ? Math.max(...prints.map(print => print.born)) : 0;
      return {
        count: prints.length, maximum: MAX_FOOTPRINTS, created,
        fadeStartSeconds: FADE_START, lifetimeSeconds: LIFETIME,
        stepDistance: STEP_DISTANCE, snowThreshold: .62, averageFade: lastAverageFade,
        singleInstancedDraw: true, alignedToVisualSnowSurface: true,
        trackColor: '#dbe5e7', wadingMounds: lastWadingCount,
        maximumWadingMounds: MAX_WADING_MOUNDS, recommendedVisualSinkMeters: .22,
        wadingStyle: 'single-forward-ridge-only-while-moving',
        oldestAgeAtLastPrint: prints.length ? now - Math.min(...prints.map(print => print.born)) : 0,
      };
    },
  };
}
