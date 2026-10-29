import * as THREE from 'three';

const MAX_FOOTPRINTS = 96;
const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;
const MAX_WADING_MOUNDS = 24;

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
    uniforms: { uTrackColor: { value: new THREE.Color('#bcc7ca') } },
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
        float alpha = (printShape*.38 + rim*.16) * vTrackFade;
        if (alpha < .008) discard;
        vec3 color = mix(uTrackColor*1.055, uTrackColor*.92, inner);
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

  // Small low-poly snow banks sit on the visual snow surface around the feet.
  // They are presentation-only: collision, hitboxes and the authoritative player
  // position remain on the terrain height.
  const wadingGeometry = new THREE.SphereGeometry(.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const wadingMaterial = new THREE.MeshStandardMaterial({
    color: '#eef4f5', roughness: .98, metalness: 0,
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
      x, z, y: world.heightAt(x, z) + snowVisualOffset(x, z, snowWeight) + .008,
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

  function updateWading(time, sources) {
    let write = 0;
    for (const source of sources) {
      if (!Number.isFinite(source?.x) || !Number.isFinite(source?.z) || write >= MAX_WADING_MOUNDS) continue;
      const weight = snowWeightAt(world, source.x, source.z);
      if (weight < .55) continue;
      const direction = Number.isFinite(source.direction) ? source.direction : 0;
      const forwardX = Math.sin(direction), forwardZ = Math.cos(direction);
      const lateralX = Math.cos(direction), lateralZ = -Math.sin(direction);
      const speed = THREE.MathUtils.clamp((source.speed ?? 0) / 5.6, 0, 1.25);
      const moving = source.moving ? 1 : 0;
      let phaseSeed = 0;
      const id = String(source.id ?? 'player');
      for (let i = 0; i < id.length; i++) phaseSeed = (phaseSeed + id.charCodeAt(i) * (i + 1)) % 97;
      const stride = Math.sin(time * (5.2 + speed * 2.2) + phaseSeed * .17);
      const surfaceY = world.heightAt(source.x, source.z) + snowVisualOffset(source.x, source.z, weight) - .028;
      const lateral = (source.lateral ?? .105) * 1.12;
      for (const side of [-1, 1]) {
        if (write >= MAX_WADING_MOUNDS) break;
        const forward = stride * side * .12 * moving;
        transform.position.set(
          source.x + forwardX * forward + lateralX * lateral * side,
          surfaceY,
          source.z + forwardZ * forward + lateralZ * lateral * side,
        );
        transform.rotation.set(0, direction, 0);
        const push = moving * speed;
        transform.scale.set(.72 + push * .10, .24 + weight * .10 + push * .08, .92 + push * .12);
        transform.updateMatrix();
        wadingMesh.setMatrixAt(write++, transform.matrix);
      }
      // A broad, shallow bow wave in front makes forward movement through deep
      // powder read from the game's high camera without hiding the whole body.
      if (moving && write < MAX_WADING_MOUNDS) {
        transform.position.set(
          source.x + forwardX * (.24 + speed * .05),
          surfaceY - .006,
          source.z + forwardZ * (.24 + speed * .05),
        );
        transform.rotation.set(0, direction, 0);
        transform.scale.set(.92, .16 + weight * .06 + speed * .05, .52);
        transform.updateMatrix();
        wadingMesh.setMatrixAt(write++, transform.matrix);
      }
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
        trackColor: '#bcc7ca', wadingMounds: lastWadingCount,
        maximumWadingMounds: MAX_WADING_MOUNDS, recommendedVisualSinkMeters: .18,
        oldestAgeAtLastPrint: prints.length ? now - Math.min(...prints.map(print => print.born)) : 0,
      };
    },
  };
}
