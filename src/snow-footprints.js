import * as THREE from 'three';

const MAX_FOOTPRINTS = 96;
const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;
const MAX_STEP_PARTICLES = 72;
const PARTICLES_PER_STEP = 5;
const ROLL_TRACK_WIDTH = 1.0;
const ROLL_CAP_LENGTH = .46;

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
  const kinds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
  const caps = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
  const rollDistances = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS * 2), 2);
  const rollBounds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS * 2), 2);
  geometry.setAttribute('instanceFade', fades);
  geometry.setAttribute('instanceTrackKind', kinds);
  geometry.setAttribute('instanceTrackCaps', caps);
  geometry.setAttribute('instanceRollDistance', rollDistances);
  geometry.setAttribute('instanceRollBounds', rollBounds);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uTrackColor: { value: new THREE.Color('#cfdadd') }, uRollCapLength: { value: ROLL_CAP_LENGTH } },
    vertexShader: `
      attribute float instanceFade;
      attribute float instanceTrackKind;
      attribute vec2 instanceRollDistance;
      attribute vec2 instanceRollBounds;
      varying vec2 vTrackUv;
      varying float vTrackFade;
      varying float vTrackKind;
      varying vec2 vTrackWorld;
      varying float vRollDistance;
      varying vec2 vRollBounds;
      void main() {
        vTrackUv = uv;
        vTrackFade = instanceFade;
        vTrackKind = instanceTrackKind;
        vRollDistance = instanceRollDistance.x + uv.y * instanceRollDistance.y;
        vRollBounds = instanceRollBounds;
        vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vTrackWorld = worldPosition.xz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uTrackColor;
      uniform float uRollCapLength;
      varying vec2 vTrackUv;
      varying float vTrackFade;
      varying float vTrackKind;
      varying vec2 vTrackWorld;
      varying float vRollDistance;
      varying vec2 vRollBounds;
      float ellipse(vec2 p, vec2 center, vec2 scale) {
        float d = length((p-center)/scale);
        return 1.0-smoothstep(.72,1.0,d);
      }
      void main() {
        vec2 p = vTrackUv;
        if (vTrackKind > .5) {
          // Connected track segments share this accumulated travel coordinate.
          // Uneven shoulder/body contact produces a wandering, broken scuff,
          // while the supporting geometry keeps matching edges on slopes.
          float along = vRollDistance;
          float sway = sin(along*2.7)*.105 + sin(along*7.1+.8)*.042;
          float width = .82 + sin(along*4.2+1.4)*.09 + sin(along*9.6)*.045;
          float signedAcross = (p.x-.5)*2. - sway;
          float edge = abs(signedAcross)/width + sin(along*17.+signedAcross*8.)*.045;
          // The rounded ends span several segments. Every segment reads the
          // same roll bounds, so increasing width never creates blunt seams.
          float capLength = min(uRollCapLength, max(.001,(vRollBounds.y-vRollBounds.x)*.5));
          float toEnd = min(along-vRollBounds.x, vRollBounds.y-along);
          float cap = max(0.,1.-toEnd/capLength);
          edge = length(vec2(max(0.,edge),cap));
          float body = 1.-smoothstep(.54,.97,edge);
          float clumps = .55 + .45*sin(along*6.7+signedAcross*11.+sin(along*3.1));
          float shoulder = exp(-pow((edge-.79)/.13,2.)) * (.35+.65*clumps);
          float pressure = .68 + .32*pow(.5+.5*sin(along*5.3+sin(along*1.9)),2.);
          float scrape = exp(-pow((signedAcross-.17*sin(along*3.8))/.11,2.)) * (.5+.5*sin(along*13.));
          float scuff = .93 + .07*clumps - scrape*.055;
          float alpha = (body*.34*pressure + shoulder*.065) * vTrackFade;
          if (alpha < .008) discard;
          gl_FragColor = vec4(mix(uTrackColor*.94*scuff,vec3(.96,.98,.99),shoulder*.54),alpha);
          return;
        }
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
  material.name = 'Magebrawl · verdichtete Fußmulden im Schnee';

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
  particleMaterial.name = 'Magebrawl · kurze Pulverschnee-Partikel';
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
  let created = 0, footprintsCreated = 0, rollSegmentsCreated = 0, particleBursts = 0, lastAverageFade = 0;

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
    const seed = created + 1;
    const lateralJitter = (hash(seed, 101) - .5) * .032;
    const rolling = Boolean(source.rolling);
    const lateral = rolling ? 0 : side * (source.lateral ?? .105) + lateralJitter;
    const x = source.x + Math.cos(direction) * lateral;
    const z = source.z - Math.sin(direction) * lateral;
    const tracker=trackers.get(source.id ?? 'player');
    const snowWeight = snowWeightAt(world, x, z);
    if (snowWeight < .62) { if (tracker) tracker.lastRoll=null; return false; }
    const surfaceY=(px,pz)=>(world.snowSurfaceAt?.(px,pz)
      ?? (world.heightAt(px,pz)+snowVisualOffset(px,pz,snowWeightAt(world,px,pz))))+.008;
    let y=surfaceY(x,z),pitch=0,trackLength=source.segmentLength;
    if(rolling) {
      const dx=Math.sin(direction)*trackLength/2,dz=Math.cos(direction)*trackLength/2;
      const start=surfaceY(x-dx,z-dz),end=surfaceY(x+dx,z+dz);
      y=(start+end)/2;pitch=Math.atan2(end-start,trackLength);
      trackLength=Math.hypot(trackLength,end-start);
    }

    const rollGroup = rolling ? tracker?.lastRoll?.rollGroup
      ?? { start: source.rollDistance ?? 0, end: 0 } : null;
    if (rollGroup) rollGroup.end = (source.rollDistance ?? 0) + (source.segmentLength ?? 0);
    const print = {
      x, z, y,
      direction, born: time, rolling, pitch,
      rollDistance: source.rollDistance ?? 0, rollLength: source.segmentLength ?? 0,
      rollGroup,
      startCap: rolling && !tracker?.lastRoll, endCap: rolling,
      width: rolling ? ROLL_TRACK_WIDTH / .38 : 1,
      length: rolling ? trackLength / .64 : 1,
      rotationJitter: rolling ? 0 : (hash(seed, 103) - .5) * .080,
      scale: rolling ? 1 : (.92 + Math.min(.18, Math.max(0, (source.speed ?? 0) / 8) * .18))
        * (.96 + hash(seed, 107) * .08),
      strength: rolling ? 1 : .90 + hash(seed, 109) * .18,
      snowWeight,
    };
    if (rolling && tracker) {
      if (tracker.lastRoll) tracker.lastRoll.endCap=false;
      tracker.lastRoll=print;
    }
    prints.push(print);
    if (prints.length > MAX_FOOTPRINTS) prints.shift();
    created++;
    if (rolling) rollSegmentsCreated++; else footprintsCreated++;
    if (tracker) tracker[rolling ? 'rollSegmentsCreated' : 'footprintsCreated']++;
    if (!rolling || rollSegmentsCreated % 3 === 0) spawnParticles(x, y, z, direction, side, source.speed ?? 0, time);
    return true;
  }

  function sampleSource(source, time) {
    if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return;
    const id = source.id ?? 'player';
    let tracker = trackers.get(id);
    if (!tracker) {
      tracker = { x: source.x, z: source.z, side: -1, initialized: false, rolling: Boolean(source.rolling), rollDistance: 0, footprintsCreated: 0, rollSegmentsCreated: 0 };
      trackers.set(id, tracker);
    }
    if (!tracker.initialized) {
      tracker.x = source.x; tracker.z = source.z; tracker.initialized = true;
      return;
    }
    if (!source.moving || tracker.rolling !== Boolean(source.rolling)) {
      tracker.x = source.x; tracker.z = source.z; tracker.rolling = Boolean(source.rolling);
      tracker.lastRoll=null; tracker.rollDistance=0;
      return;
    }
    const distance = Math.hypot(source.x - tracker.x, source.z - tracker.z);
    if (source.rolling) {
      if (distance < .18) return;
      if (distance <= 5) {
        const dx = source.x-tracker.x, dz = source.z-tracker.z;
        const steps = Math.min(20,Math.ceil(distance/.28)), direction = Math.atan2(dx,dz);
        for (let i=0;i<steps;i++) add({ ...source,
          x:tracker.x+dx*(i+.5)/steps, z:tracker.z+dz*(i+.5)/steps,
          direction, segmentLength: distance/steps, rollDistance: tracker.rollDistance + distance*i/steps },time);
        tracker.rollDistance += distance;
      } else { tracker.lastRoll=null; tracker.rollDistance=0; }
      tracker.x=source.x; tracker.z=source.z;
      return;
    }
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
      transform.rotation.set(print.pitch, print.direction + Math.PI + print.rotationJitter, 0, 'YXZ');
      transform.scale.set(print.scale * print.width, 1, print.scale * print.length);
      transform.updateMatrix();
      mesh.setMatrixAt(write, transform.matrix);
      const visibleFade = fade * print.strength * THREE.MathUtils.clamp(print.snowWeight * 1.15, 0, 1);
      fades.setX(write, visibleFade); fadeTotal += visibleFade;
      kinds.setX(write, print.rolling ? 1 : 0);
      caps.setX(write, (print.startCap ? 1 : 0)+(print.endCap ? 2 : 0));
      rollDistances.setXY(write, print.rollDistance, print.rollLength);
      rollBounds.setXY(write, print.rollGroup?.start ?? 0, print.rollGroup?.end ?? 0);
      write++;
    }
    prints.length = write;
    lastAverageFade = write ? fadeTotal / write : 0;
    mesh.count = write;
    if (write) {
      mesh.instanceMatrix.needsUpdate = true;
      fades.needsUpdate = true;
      kinds.needsUpdate = true;
      caps.needsUpdate = true;
      rollDistances.needsUpdate = true;
      rollBounds.needsUpdate = true;
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
        footprintsCreated, rollSegmentsCreated,
        bySource: Object.fromEntries([...trackers].map(([id,t])=>[id,{footprintsCreated:t.footprintsCreated,rollSegmentsCreated:t.rollSegmentsCreated}])),
        activeFootprints: prints.filter(print => !print.rolling).length,
        activeRollSegments: prints.filter(print => print.rolling).length,
        rollTrackWidthMeters: ROLL_TRACK_WIDTH, rollStyle: 'irregular-body-furrow',
        rollEndStyle: 'rounded-powder-caps', rollCapLengthMeters: ROLL_CAP_LENGTH,
        continuousRollDistance: true, asymmetricPowderShoulders: true,
        fadeStartSeconds: FADE_START, lifetimeSeconds: LIFETIME,
        stepDistance: STEP_DISTANCE, snowThreshold: .62, averageFade: lastAverageFade,
        singleInstancedDraw: true, alignedToVisualSnowSurface: true,
        trackColor: '#cfdadd', trackVisibility: 'moderately-strong-compressed-snow',
        depressionStyle: 'soft-dark-center-with-light-compressed-rim',
        footprintFacingOffsetRadians: Math.PI,
        footprintRotationJitterRadians: .04,
        footprintScaleVariation: [.96, 1.04],
        footprintIntensityVariation: [.90, 1.08],
        footprintLateralJitterMeters: .016,
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
