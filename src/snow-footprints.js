import * as THREE from 'three';
import { ROLL_SPEED } from './rules.js';

const FADE_START = 6;
const LIFETIME = 10;
const STEP_DISTANCE = .62;
const MAX_STEP_PARTICLES = 72;
const PARTICLES_PER_STEP = 5;
const ROLL_TRACK_WIDTH = 1.0;
const ROLL_CAP_LENGTH = .46;
const ROLL_SEGMENT_LENGTH = .28;
const ROLL_CONTACT_DELAY = .14;
const ROLL_AIRBORNE_DISTANCE = .9;
const MIN_CONTACT_LENGTH = .58;
const MIN_CONTACT_GAP = .15;
const CAPACITY_SOURCES = 12;
// A whole ten-second lifetime for twelve uninterrupted full-speed rollers,
// including one short closing segment per contact patch. Normal footsteps and
// actual roll cooldowns need much less. Capacity never removes a live mark.
const MAX_SOURCE_RATE = ROLL_SPEED * (1 / ROLL_SEGMENT_LENGTH + 1 / (MIN_CONTACT_LENGTH + MIN_CONTACT_GAP));
const MAX_FOOTPRINTS = CAPACITY_SOURCES * (Math.ceil(LIFETIME * MAX_SOURCE_RATE) + 4);
const MAX_TRACKERS = 64;

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
  const rollBounds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS * 4), 4);
  for (const attribute of [fades, kinds, caps, rollDistances, rollBounds]) attribute.setUsage(THREE.DynamicDrawUsage);
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
      attribute vec4 instanceRollBounds;
      varying vec2 vTrackUv;
      varying float vTrackFade;
      varying float vTrackKind;
      varying vec2 vTrackWorld;
      varying float vRollDistance;
      varying vec4 vRollBounds;
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
      varying vec4 vRollBounds;
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
          float phase = vRollBounds.z;
          float sway = sin(along*2.7+phase)*.22 + sin(along*7.1+.8+phase)*.065;
          float width = min(.97-abs(sway), .82 + sin(along*4.2+1.4+phase)*.10 + sin(along*9.6+phase)*.045);
          float signedAcross = (p.x-.5)*2. - sway;
          float edge = abs(signedAcross)/width + sin(along*17.+signedAcross*8.)*.045;
          // The rounded ends span several segments. Every segment reads the
          // same roll bounds, so increasing width never creates blunt seams.
          float capLength = min(uRollCapLength, max(.001,(vRollBounds.y-vRollBounds.x)*.5));
          float toEnd = min(along-vRollBounds.x, vRollBounds.y-along);
          float cap = max(0.,1.-toEnd/capLength);
          edge = length(vec2(max(0.,edge),cap));
          float body = 1.-smoothstep(.54,.97,edge);
          float clumps = .55 + .45*sin(along*6.7+signedAcross*11.+sin(along*3.1)+phase);
          float shoulder = exp(-pow((edge-.79)/.13,2.)) * (.35+.65*clumps);
          float pressure = (.54 + .46*pow(.5+.5*sin(along*5.3+sin(along*1.9)+phase),2.)) * vRollBounds.w;
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
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
  let lastUpdateTime = 0, expiredCount = 0, capacitySkipped = 0, sourceCapacitySkipped = 0, contactSerial = 0;

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
    if (prints.length >= MAX_FOOTPRINTS) {
      capacitySkipped++;
      if (tracker) { tracker.capacitySkipped++; tracker.lastRoll = null; }
      return false;
    }
    const surfaceY=(px,pz)=>(world.snowSurfaceAt?.(px,pz)
      ?? (world.heightAt(px,pz)+snowVisualOffset(px,pz,snowWeightAt(world,px,pz))))+.008;
    let y=surfaceY(x,z),pitch=0,trackLength=source.segmentLength;
    if(rolling) {
      const dx=Math.sin(direction)*trackLength/2,dz=Math.cos(direction)*trackLength/2;
      const start=surfaceY(x-dx,z-dz),end=surfaceY(x+dx,z+dz);
      y=(start+end)/2;pitch=Math.atan2(end-start,trackLength);
      trackLength=Math.hypot(trackLength,end-start);
    }

    const previousRoll = tracker?.lastRoll?.contactId === source.contact?.id ? tracker.lastRoll : null;
    const rollGroup = rolling ? previousRoll?.rollGroup
      ?? { start: source.rollDistance ?? 0, end: 0, phase: source.contact?.phase ?? 0, pressure: source.contact?.pressure ?? 1 } : null;
    if (rollGroup) rollGroup.end = (source.rollDistance ?? 0) + (source.rollLength ?? source.segmentLength ?? 0);
    const print = {
      id: created + 1, sourceId: source.id ?? 'player', contactId: source.contact?.id ?? null,
      x, z, y,
      direction, born: time, rolling, pitch,
      rollDistance: source.rollDistance ?? 0, rollLength: source.rollLength ?? source.segmentLength ?? 0,
      rollGroup,
      startCap: rolling && !previousRoll, endCap: rolling,
      width: rolling ? ROLL_TRACK_WIDTH / .38 : 1,
      length: rolling ? trackLength / .64 : 1,
      rotationJitter: rolling ? 0 : (hash(seed, 103) - .5) * .080,
      scale: rolling ? 1 : (.92 + Math.min(.18, Math.max(0, (source.speed ?? 0) / 8) * .18))
        * (.96 + hash(seed, 107) * .08),
      strength: rolling ? 1 : .90 + hash(seed, 109) * .18,
      snowWeight,
    };
    if (rolling && tracker) {
      if (previousRoll) previousRoll.endCap=false;
      tracker.lastRoll=print;
    }
    prints.push(print);
    created++;
    if (rolling) rollSegmentsCreated++; else footprintsCreated++;
    if (tracker) tracker[rolling ? 'rollSegmentsCreated' : 'footprintsCreated']++;
    if (!rolling || rollSegmentsCreated % 3 === 0) spawnParticles(x, y, z, direction, side, source.speed ?? 0, time);
    return true;
  }

  function nextContact(tracker, start) {
    const index = tracker.contactIndex++, seed = tracker.seed + tracker.rollNumber * 31;
    const length = MIN_CONTACT_LENGTH + hash(seed, index * 7 + 1) * .56;
    return { id: ++contactSerial, start, end: start + length,
      nextStart: start + length + MIN_CONTACT_GAP + hash(seed, index * 7 + 2) * .23,
      phase: hash(seed, index * 7 + 3) * Math.PI * 2,
      pressure: .78 + hash(seed, index * 7 + 4) * .22 };
  }

  function beginRoll(tracker, time) {
    tracker.rollStartedAt = time; tracker.rollDistance = 0; tracker.rollNumber++;
    tracker.delayDistance = tracker.landingDistance = null;
    tracker.rollAnchor = tracker.contact = tracker.lastRoll = null;
    tracker.contactIndex = 0;
  }

  function emitRollSegment(source, tracker, end, time) {
    const start = tracker.rollAnchor, dx = end.x - start.x, dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length > .001) add({ ...source, rolling: true,
      x: (start.x + end.x) / 2, z: (start.z + end.z) / 2,
      direction: Math.atan2(dx, dz), segmentLength: length,
      rollDistance: start.distance, rollLength: end.distance - start.distance, contact: tracker.contact }, time);
    tracker.rollAnchor = end;
  }

  function finishRoll(source, tracker, time) {
    const existingContact = tracker.lastRoll?.contactId === tracker.contact?.id;
    // A roll ending just as the next contact starts should not stamp a thin
    // transverse sliver. Established patches still keep their short soft tail.
    const minimumTail = existingContact ? .025 : .20;
    if (tracker.rollAnchor && tracker.contact && tracker.rollDistance - tracker.rollAnchor.distance > minimumTail) {
      emitRollSegment(source, tracker, { x: tracker.lastX, z: tracker.lastZ, distance: tracker.rollDistance }, time);
    }
    tracker.rollAnchor = tracker.contact = tracker.lastRoll = null;
  }

  function sampleRoll(source, tracker, time) {
    const dx = source.x - tracker.lastX, dz = source.z - tracker.lastZ;
    const distance = Math.hypot(dx, dz), from = tracker.rollDistance, to = from + distance;
    if (distance > 5) { beginRoll(tracker, time); return; }
    if (tracker.delayDistance === null && time >= tracker.rollStartedAt + ROLL_CONTACT_DELAY) {
      const fraction = THREE.MathUtils.clamp((tracker.rollStartedAt + ROLL_CONTACT_DELAY - tracker.lastTime) / (time - tracker.lastTime), 0, 1);
      tracker.delayDistance = from + distance * fraction;
    }
    if (tracker.landingDistance === null && tracker.delayDistance !== null && to >= ROLL_AIRBORNE_DISTANCE) {
      tracker.landingDistance = Math.max(ROLL_AIRBORNE_DISTANCE, tracker.delayDistance);
      tracker.contact = nextContact(tracker, tracker.landingDistance);
    }
    const pointAt = travel => {
      const amount = distance > .00001 ? THREE.MathUtils.clamp((travel - from) / distance, 0, 1) : 0;
      return { x: tracker.lastX + dx * amount, z: tracker.lastZ + dz * amount, distance: travel };
    };
    // Resample by travelled distance, retaining the un-emitted remainder. A
    // high frame rate cannot split .29 m into two wasteful .145 m instances.
    while (tracker.contact && tracker.contact.start <= to) {
      tracker.rollAnchor ??= pointAt(tracker.contact.start);
      const next = Math.min(tracker.rollAnchor.distance + ROLL_SEGMENT_LENGTH, tracker.contact.end);
      if (next > to + 1e-8) break;
      emitRollSegment(source, tracker, pointAt(next), time);
      if (next >= tracker.contact.end - 1e-8) {
        tracker.contact = nextContact(tracker, tracker.contact.nextStart);
        tracker.rollAnchor = tracker.lastRoll = null;
      }
    }
    tracker.rollDistance = to;
  }

  function sampleSource(source, time) {
    if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) return;
    const id = source.id ?? 'player';
    let tracker = trackers.get(id);
    if (!tracker) {
      if (trackers.size >= MAX_TRACKERS) { sourceCapacitySkipped++; return; }
      let seed = 0; for (const letter of String(id)) seed = (seed * 31 + letter.charCodeAt(0)) >>> 0;
      tracker = { x: source.x, z: source.z, lastX: source.x, lastZ: source.z, lastTime: time,
        seed, side: -1, initialized: false, rolling: Boolean(source.rolling), rollNumber: 0,
        rollDistance: 0, footprintsCreated: 0, rollSegmentsCreated: 0, capacitySkipped: 0 };
      trackers.set(id, tracker);
    }
    if (!tracker.initialized) {
      tracker.x = source.x; tracker.z = source.z; tracker.initialized = true;
      if (tracker.rolling) beginRoll(tracker, time);
      return;
    }
    if (time <= tracker.lastTime) return; // Pausing must not restart a half-finished roll.
    const rolling = Boolean(source.rolling), changed = rolling !== tracker.rolling;
    if (changed) {
      if (tracker.rolling) finishRoll(source, tracker, time);
      if (rolling) beginRoll(tracker, tracker.lastTime);
      else { tracker.x = source.x; tracker.z = source.z; }
      tracker.rolling = rolling;
    }
    if (rolling) sampleRoll(source, tracker, time);
    else if (!source.moving) { tracker.x = source.x; tracker.z = source.z; }
    else if (!changed && Math.hypot(source.x - tracker.x, source.z - tracker.z) >= (source.stepDistance ?? STEP_DISTANCE)) {
      tracker.side *= -1;
      add({ ...source, side: tracker.side }, time);
      tracker.x = source.x; tracker.z = source.z;
    }
    tracker.lastX = source.x; tracker.lastZ = source.z; tracker.lastTime = time;
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
    if (!Number.isFinite(time)) return particles.length;
    lastUpdateTime = time;
    // Reclaim only marks whose own fade has completed, before admitting new
    // ones. Other actors and dense roll contacts never erase a visible sole.
    let retained = 0;
    for (const print of prints) {
      if (time - print.born >= LIFETIME) { expiredCount++; continue; }
      prints[retained++] = print;
    }
    prints.length = retained;
    for (const [id, tracker] of trackers) if (time - tracker.lastTime > LIFETIME + 1) trackers.delete(id);
    for (const source of sources) sampleSource(source, time);
    const activeParticles = updateParticles(time);

    let write = 0, fadeTotal = 0;
    for (let read = 0; read < prints.length; read++) {
      const print = prints[read], age = time - print.born;
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
      rollBounds.setXYZW(write, print.rollGroup?.start ?? 0, print.rollGroup?.end ?? 0,
        print.rollGroup?.phase ?? 0, print.rollGroup?.pressure ?? 1);
      write++;
    }
    prints.length = write;
    lastAverageFade = write ? fadeTotal / write : 0;
    mesh.count = write;
    if (write) {
      // Capacity is conservative; upload only the occupied part of each pool.
      for (const attribute of [mesh.instanceMatrix, fades, kinds, caps, rollDistances, rollBounds]) {
        attribute.clearUpdateRanges(); attribute.addUpdateRange(0, write * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    return activeParticles;
  }

  function reset() {
    prints.length = 0; particles.length = 0; trackers.clear();
    mesh.count = 0; particleMesh.count = 0; lastAverageFade = 0;
    lastUpdateTime = expiredCount = capacitySkipped = sourceCapacitySkipped = 0;
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
        capacityBudgetSources: CAPACITY_SOURCES, capacityMaximumSourceRate: MAX_SOURCE_RATE,
        capacityPolicy: 'expire-before-admission-no-live-eviction', capacitySkipped, sourceCapacitySkipped, expiredCount,
        oldestActiveAgeSeconds: prints.length ? Math.max(...prints.map(print => lastUpdateTime - print.born)) : 0,
        activeTracks: prints.map((print, index) => ({ id: print.id, sourceId: print.sourceId,
          kind: print.rolling ? 'roll' : 'foot', born: print.born, age: lastUpdateTime - print.born, fade: fades.getX(index),
          x: print.x, z: print.z, rollDistance: print.rollDistance, rollLength: print.rollLength,
          contactStart: print.rollGroup?.start ?? null, contactEnd: print.rollGroup?.end ?? null })),
        footprintsCreated, rollSegmentsCreated,
        bySource: Object.fromEntries([...trackers].map(([id,t])=>[id,{footprintsCreated:t.footprintsCreated,rollSegmentsCreated:t.rollSegmentsCreated,
          capacitySkipped:t.capacitySkipped, rollStartedAt:t.rollStartedAt ?? null, rollLandingDistance:t.landingDistance ?? null}])),
        activeFootprints: prints.filter(print => !print.rolling).length,
        activeRollSegments: prints.filter(print => print.rolling).length,
        rollTrackWidthMeters: ROLL_TRACK_WIDTH, rollStyle: 'interrupted-body-contact-patches',
        rollEndStyle: 'rounded-powder-caps', rollCapLengthMeters: ROLL_CAP_LENGTH,
        rollContactDelaySeconds: ROLL_CONTACT_DELAY, rollMinimumAirborneMeters: ROLL_AIRBORNE_DISTANCE,
        rollSampleSpacingMeters: ROLL_SEGMENT_LENGTH,
        rollContactLengthMeters: [MIN_CONTACT_LENGTH, MIN_CONTACT_LENGTH + .56],
        rollContactGapMeters: [MIN_CONTACT_GAP, MIN_CONTACT_GAP + .23],
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
