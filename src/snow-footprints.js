import * as THREE from 'three';

const MAX_FOOTPRINTS = 96;
const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;

function snowWeightAt(world, x, z) {
  const weights = world.biomeWeightsAt?.(x, z);
  if (Array.isArray(weights)) return weights.find(item => item.biome === 'snow')?.weight ?? 0;
  return world.biomeAt?.(x, z) === 'snow' ? 1 : 0;
}

/** Lightweight instanced snow tracks. No per-print mesh/material allocations:
 * matrices and fade values are compacted into one GPU draw each frame. */
export function createSnowFootprints(root, world) {
  const geometry = new THREE.PlaneGeometry(.34, .58);
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
    uniforms: { uTrackColor: { value: new THREE.Color('#687b82') } },
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
        float alpha = (printShape*.29 + rim*.16) * vTrackFade;
        if (alpha < .008) discard;
        vec3 color = mix(uTrackColor*1.08, uTrackColor*.72, inner);
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

  const prints = [];
  const trackers = new Map();
  const transform = new THREE.Object3D();
  let created = 0;

  function add(source, time) {
    const direction = Number.isFinite(source.direction) ? source.direction : 0;
    const side = source.side ?? 1;
    const lateral = side * (source.lateral ?? .105);
    const x = source.x + Math.cos(direction) * lateral;
    const z = source.z - Math.sin(direction) * lateral;
    const snowWeight = snowWeightAt(world, x, z);
    if (snowWeight < .62) return false;
    prints.push({
      x, z, y: world.heightAt(x, z) + .028,
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

  function update(time, sources = []) {
    for (const source of sources) sampleSource(source, time);
    let write = 0;
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
      fades.setX(write, fade * THREE.MathUtils.clamp(print.snowWeight * 1.15, 0, 1));
      write++;
    }
    prints.length = write;
    mesh.count = write;
    if (write) {
      mesh.instanceMatrix.needsUpdate = true;
      fades.needsUpdate = true;
    }
  }

  function reset() {
    prints.length = 0; trackers.clear(); mesh.count = 0;
  }

  return {
    update, reset,
    dispose() { root.remove(mesh); geometry.dispose(); material.dispose(); },
    inspect() {
      const now = prints.length ? Math.max(...prints.map(print => print.born)) : 0;
      return {
        count: prints.length, maximum: MAX_FOOTPRINTS, created,
        fadeStartSeconds: FADE_START, lifetimeSeconds: LIFETIME,
        stepDistance: STEP_DISTANCE, snowThreshold: .62,
        singleInstancedDraw: true,
        oldestAgeAtLastPrint: prints.length ? now - Math.min(...prints.map(print => print.born)) : 0,
      };
    },
  };
}
