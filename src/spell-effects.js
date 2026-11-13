import * as THREE from 'three';
import { createLightningVisual } from './lightning-visual.js';
import { createElementMaterial, setElementMaterial } from './spell-effect-materials.js';
import { createFireballMaterial } from './fireball-material.js';

const GRAVITY_PROJECTILE_SCALE = .8;
const PARTICLES = 160, BURSTS = 12, HISTORY = 32, SAMPLE_DISTANCE = .14, TRAIL_AGE = .38, TRAIL_RELEASE = .22;
const ELEMENTS = {
  sunStaff: { core: '#fff8dc', glow: '#edc574', spark: '#fff2b5', edge: '#9a702f' },
  soulStaff: { core: '#a28cba', glow: '#584366', spark: '#8c709d', edge: '#211b29' },
  hourglassStaff: { core: '#fff0bd', glow: '#d29d43', spark: '#ffe1a0', edge: '#a46f26' },
  lightningStaff: { core: '#fff5cf', glow: '#58adff', spark: '#bfeaff', edge: '#4b83dc' },
  fireStaff: { core: '#fff3bf', glow: '#ff681c', spark: '#ffb52d', edge: '#ff360d' },
  iceStaff: { core: '#edffff', glow: '#45bfff', spark: '#8ceeff', edge: '#358de5' },
  poisonStaff: { core: '#e2f7b3', glow: '#65c84a', spark: '#b3e976', edge: '#398d3b' },
  moonStaff: { core: '#fbf4ff', glow: '#bca1ef', spark: '#e5d6ff', edge: '#8862c4' },
  starStaff: { core: '#fff4c5', glow: '#75c9ed', spark: '#fff0b4', edge: '#477fc3' },
  gravityStaff: { core: '#756183', glow: '#5e426f', spark: '#9e88ab', edge: '#46324f' },
};
const finite = value => Number.isFinite(value) ? value : 0;
const valid = point => point && Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
const typeOf = type => Object.hasOwn(ELEMENTS, type) ? type : 'fireStaff';
const crystalline = type => type === 'iceStaff' || type === 'moonStaff' || type === 'starStaff';

/** Visuals only. Swept hits, flight time and damage remain owned by weapons.js. */
export function createSpellEffects(scene, { isVisible = null, fireProjectilePrototype = null, iceProjectilePrototype = null,
  gravityProjectilePrototype = null, soulProjectilePrototype = null } = {}) {
  const roots = [], geometries = new Set(), materials = new Set(), projectiles = [];
  const clock = { value: 0 };
  const ownGeometry = geometry => (geometries.add(geometry), geometry);
  const ownMaterial = material => (materials.add(material), material);
  const addRoot = group => { roots.push(group); scene.add(group); return group; };
  const canSee = point => valid(point) && (!isVisible || isVisible(point));
  const additive = (color, opacity = 1) => ownMaterial(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
  }));
  const solid = color => ownMaterial(new THREE.MeshBasicMaterial({ color, depthTest: true }));
  const elementMaterial = (kind, options) => ownMaterial(createElementMaterial(kind, clock, options));
  const octahedron = ownGeometry(new THREE.OctahedronGeometry(1, 0));
  const sphere = ownGeometry(new THREE.IcosahedronGeometry(1, 1));
  const planeGeometry = ownGeometry(new THREE.PlaneGeometry(1, 1));
  const plumeGeometry = ownGeometry(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2));
  const connectorGeometry = ownGeometry(new THREE.CylinderGeometry(.65, 1, 1, 5));
  const textureSize = 48, pixels = new Uint8Array(textureSize * textureSize * 4);
  for (let y = 0; y < textureSize; y++) for (let x = 0; x < textureSize; x++) {
    const radius = Math.hypot((x + .5) / textureSize * 2 - 1, (y + .5) / textureSize * 2 - 1);
    const index = (y * textureSize + x) * 4;
    pixels[index] = pixels[index + 1] = pixels[index + 2] = 255;
    pixels[index + 3] = Math.round(Math.max(0, 1 - radius) ** 2.5 * 255);
  }
  const glowTexture = new THREE.DataTexture(pixels, textureSize, textureSize);
  glowTexture.needsUpdate = true;
  glowTexture.magFilter = glowTexture.minFilter = THREE.LinearFilter;
  function glow(color, opacity = 1) {
    return new THREE.Sprite(ownMaterial(new THREE.SpriteMaterial({ map: glowTexture, color,
      transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true })));
  }
  const smoke = Array.from({ length: 64 }, () => {
    const sprite = addRoot(new THREE.Sprite(ownMaterial(new THREE.SpriteMaterial({
      map: glowTexture, color: '#796b60', transparent: true, opacity: 0,
      blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
    }))));
    sprite.name = 'Feuerball · Rauchspur'; sprite.visible = false;
    return { sprite, life: 0, duration: .5, size: .18, seed: 0 };
  });
  let smokeCursor = 0;
  function emitSmoke(point, impact = false) {
    const entry = smoke[smokeCursor++ % smoke.length];
    entry.duration = entry.life = (impact ? .95 : .65) + smokeCursor % 4 * .06;
    entry.seed = smokeCursor; entry.size = (impact ? .48 : .30) + smokeCursor % 3 * .05;
    entry.opacity = impact ? .34 : .26;
    entry.sprite.position.copy(point); entry.sprite.scale.setScalar(entry.size);
    entry.sprite.material.opacity = entry.opacity; entry.sprite.visible = canSee(point);
  }
  function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(x, y, z); parent.add(part); return part;
  }
  const fireCore = solid('#ffd18d'), fireTip = additive('#ff9f37', .65), iceCore = solid('#a6e4ff');
  const iceTip = additive('#75dcfa', .65);
  const fireBody = elementMaterial('body', { opacity: .90 });
  const iceBody = elementMaterial('body', { type: 'iceStaff', opacity: .42 });
  const crystalGeometry = ownGeometry(new THREE.BufferGeometry());
  const crystalPositions = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3, b = (i + 1) * Math.PI / 3;
    crystalPositions.push(0, 0, .62, Math.cos(a) * .20, Math.sin(a) * .20, -.08,
      Math.cos(b) * .20, Math.sin(b) * .20, -.08,
      0, 0, -.29, Math.cos(b) * .20, Math.sin(b) * .20, -.08,
      Math.cos(a) * .20, Math.sin(a) * .20, -.08);
  }
  crystalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crystalPositions, 3));
  crystalGeometry.computeVertexNormals();
  const crystalColors = new Float32Array(crystalGeometry.attributes.position.count * 3);
  const scratchColor = new THREE.Color();
  for (let i = 0; i < crystalGeometry.attributes.position.count; i++) {
    scratchColor.set(['#a2edff', '#3aabd6', '#d2f8ff', '#207aa9'][Math.floor(i / 3) % 4]);
    scratchColor.toArray(crystalColors, i * 3);
  }
  crystalGeometry.setAttribute('color', new THREE.BufferAttribute(crystalColors, 3));
  const crystalMaterial = ownMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .19,
    metalness: .12, emissive: '#145a7b', emissiveIntensity: .20, transparent: true, opacity: .87,
    depthWrite: false, flatShading: true }));
  // A fixed material set per element avoids recoloring a fire projectile when
  // its owner swaps to another staff while that earlier shot is still flying.
  const projectileMaterials = {
    sunStaff: { core: solid(ELEMENTS.sunStaff.core), tip: additive('#ffe4a0', .5), body: elementMaterial('body', { type: 'sunStaff', opacity: .35 }) },
    soulStaff: { core: solid('#302537'), tip: additive('#b59cc6', .4), body: elementMaterial('body', { type: 'soulStaff', opacity: .35 }) },
    fireStaff: { core: fireCore, tip: fireTip, body: fireBody },
    iceStaff: { core: iceCore, tip: iceTip, body: iceBody, crystal: crystalMaterial },
    poisonStaff: { core: solid(ELEMENTS.poisonStaff.core), tip: additive(ELEMENTS.poisonStaff.spark, .65),
      body: elementMaterial('body', { type: 'poisonStaff', opacity: .78 }) },
    moonStaff: { core: solid(ELEMENTS.moonStaff.core), tip: additive(ELEMENTS.moonStaff.spark, .65),
      body: elementMaterial('body', { type: 'moonStaff', opacity: .42 }),
      crystal: ownMaterial(new THREE.MeshStandardMaterial({ color: '#dfc8ff', roughness: .19,
        metalness: .12, emissive: '#654891', emissiveIntensity: .24, transparent: true,
        opacity: .87, depthWrite: false, flatShading: true })) },
    starStaff: { core: solid(ELEMENTS.starStaff.core), tip: additive(ELEMENTS.starStaff.spark, .7),
      body: elementMaterial('body', { type: 'starStaff', opacity: .42 }),
      crystal: solid(ELEMENTS.starStaff.core) },
    lightningStaff: { core: solid('#fff5cf'), tip: additive(ELEMENTS.lightningStaff.spark, .7),
      body: elementMaterial('body', { type: 'lightningStaff', opacity: .5 }) },
    hourglassStaff: { tip: additive(ELEMENTS.hourglassStaff.spark, .65) },
    gravityStaff: { core: solid('#140626'), tip: ownMaterial(new THREE.MeshBasicMaterial({
      color: '#9e88ab', transparent: true, opacity: .55, depthWrite: false, blending: THREE.NormalBlending })),
      body: elementMaterial('body', { type: 'gravityStaff', opacity: .8 }) },
  };
  const gravityOrbitGeometry = ownGeometry(new THREE.TorusGeometry(.40, .018, 5, 40, Math.PI * 1.7));
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .105 : .31;
    if (i === 0) starShape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else starShape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  starShape.closePath();
  const starGeometry = ownGeometry(new THREE.ExtrudeGeometry(starShape, { depth: .035,
    bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 1, steps: 1 }));
  starGeometry.translate(0, 0, -.0175);
  const starMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#ffe8a0', emissive: '#eac56b',
    emissiveIntensity: .65, metalness: .35, roughness: .26 }));

  function makeTrail() {
    const count = HISTORY * 8, positions = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2), fades = new Float32Array(count), indices = [];
    for (let i = 0; i < HISTORY * 2; i++) {
      const offset = i * 4; indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
    const geometry = ownGeometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aFade', new THREE.BufferAttribute(fades, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(indices); geometry.setDrawRange(0, 0);
    const trail = addRoot(new THREE.Mesh(geometry, elementMaterial('trail', { opacity: .84 })));
    trail.name = 'Strömende Elementarfahne'; trail.frustumCulled = false; trail.visible = false;
    return { trail, trailGeometry: geometry, trailPositions: positions, trailUvs: uvs, trailFades: fades,
      history: new Float32Array(HISTORY * 3), births: new Float64Array(HISTORY), historyCount: 0,
      sampleDistance: 0, sparkDistance: 0, headBirth: 0, trailRemaining: 0, visibleTrailSegments: 0 };
  }

  function createProjectile() {
    if (disposed) throw new Error('Disposed spell effects cannot create projectiles.');
    const group = addRoot(new THREE.Group()); group.name = 'Zauberprojektil'; group.visible = false;
    const lightning = createLightningVisual({ ownGeometry, ownMaterial }); group.add(lightning.group);
    const soul = new THREE.Group(); soul.name = 'Seelenrichter · Seelenflamme'; group.add(soul);
    const soulModel = soulProjectilePrototype?.clone(true) ?? null;
    if (soulModel) {
      soulModel.traverse(part => {
        if (!part.isMesh) return;
        const prepare = source => {
          const copy = ownMaterial(source.clone());
          if (copy.emissive) { copy.emissive.set('#33203f'); copy.emissiveIntensity = .06; }
          return copy;
        };
        part.material = Array.isArray(part.material) ? part.material.map(prepare) : prepare(part.material);
        part.castShadow = part.receiveShadow = false;
      });
      soul.add(soulModel);
    } else mesh(soul, octahedron, projectileMaterials.soulStaff.core).scale.set(.14, .14, .3);
    const gravity = new THREE.Group(); gravity.name = 'Gravitationsprojektil · dunkler Kern'; group.add(gravity);
    const gravityCore = mesh(gravity, sphere, projectileMaterials.gravityStaff.core);
    gravityCore.scale.set(.29, .32, .29);
    const gravityModel = gravityProjectilePrototype?.clone(true) ?? null;
    if (gravityModel) {
      gravityModel.name = 'Void · hochgeladenes Gravitationsprojektil';
      gravityModel.traverse(part => {
        if (!part.isMesh) return;
        const prepare = source => {
          const copy = ownMaterial(source.clone());
          // The painted violet spiral glows softly; its black center stays dark.
          if (copy.emissive) {
            copy.emissiveMap = source.map ?? source.emissiveMap;
            copy.emissive.set('#a56aff'); copy.emissiveIntensity = .35;
          }
          return copy;
        };
        part.material = Array.isArray(part.material) ? part.material.map(prepare) : prepare(part.material);
        part.castShadow = part.receiveShadow = false;
      });
      gravity.add(gravityModel);
    }
    const gravityOrbits = [mesh(gravity, gravityOrbitGeometry, projectileMaterials.gravityStaff.tip),
      mesh(gravity, gravityOrbitGeometry, projectileMaterials.gravityStaff.tip)];
    const gravityParticles = new THREE.InstancedMesh(octahedron, projectileMaterials.gravityStaff.tip, 8);
    gravityParticles.count = 0;
    gravityParticles.name = 'Gravitationsprojektil · umlaufende Energiepartikel'; gravityParticles.frustumCulled = false;
    gravityParticles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gravity.add(gravityParticles);
    const fire = new THREE.Group(), ice = new THREE.Group(), star = new THREE.Group(); group.add(fire, ice, star);
    star.name = 'Sternstab · rotierender Sternenblitz'; star.visible = false;
    mesh(star, starGeometry, starMaterial);
    mesh(star, starGeometry, starMaterial).rotation.y = Math.PI / 2;
    mesh(star, octahedron, projectileMaterials.starStaff.core).scale.setScalar(.12);
    fire.name = 'Glutkern und turbulente Flammenzungen'; ice.name = 'Facettenkristall mit Frostnebel';
    const hotCore = mesh(fire, sphere, fireCore, 0, 0, .07); hotCore.scale.set(.065, .065, .15);
    const fireModel = fireProjectilePrototype?.clone(true) ?? null;
    if (fireModel) {
      fireModel.name = 'Feuerball · hochgeladenes Modell';
      fireModel.traverse(part => {
        if (!part.isMesh) return;
        const prepare = source => ownMaterial(createFireballMaterial(source, clock));
        part.material = Array.isArray(part.material) ? part.material.map(prepare) : prepare(part.material);
        part.castShadow = false; part.receiveShadow = false;
      });
      fire.add(fireModel);
    }
    const fireTongues = [], iceMists = [];
    for (let i = 0; i < 2; i++) {
      const tongue = mesh(fire, plumeGeometry, fireBody, 0, 0, -.40);
      tongue.scale.set(.92, 1, 1.65); tongue.rotation.z = i * Math.PI / 2;
      fireTongues.push(tongue);
      const mist = mesh(ice, plumeGeometry, iceBody, 0, 0, -.44);
      mist.scale.set(.72, 1, 1.45); mist.rotation.z = i * Math.PI / 2;
      iceMists.push(mist);
    }
    const crystal = mesh(ice, crystalGeometry, crystalMaterial);
    const iceModel = iceProjectilePrototype?.clone(true) ?? null;
    if (iceModel) {
      iceModel.traverse(part => {
        if (!part.isMesh) return;
        const prepare = source => {
          const copy = ownMaterial(source.clone());
          copy.emissive.set('#6aaec5'); copy.emissiveIntensity = .12;
          return copy;
        };
        part.material = Array.isArray(part.material) ? part.material.map(prepare) : prepare(part.material);
      });
      ice.add(iceModel);
    }
    const coldCore = mesh(ice, octahedron, iceCore, 0, 0, .10);
    coldCore.scale.set(.042, .042, .39);
    const iceFins = [];
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3;
      const part = mesh(ice, octahedron, iceTip, Math.cos(angle) * .19, Math.sin(angle) * .19, -.28);
      part.scale.set(.045, .045, .26); iceFins.push(part);
    }
    const glints = Array.from({ length: 2 }, (_, i) => {
      const part = glow('#c9f4ff', .45); part.scale.setScalar(.27);
      part.position.set(i ? -.13 : .14, i ? -.10 : .08, .12 + i * .12); ice.add(part); return part;
    });
    const halo = glow('#ff681c', .32); halo.scale.setScalar(1.15); group.add(halo);
    const haze = glow('#ff8c34', .20); haze.name = 'Feuerball · weicher Glühsaum';
    haze.scale.setScalar(1.85); group.add(haze);
    const visual = { group, lightning, fire, ice, star, soul, soulModel, gravity, gravityCore, gravityModel, gravityOrbits, gravityParticles, haze, hotCore, fireModel, iceModel, coldCore, crystal, fireTongues, iceMists, iceFins, glints, halo, active: false,
      type: 'fireStaff', direction: 0, ...makeTrail() };
    projectiles.push(visual); return visual;
  }

  const particleMesh = addRoot(new THREE.InstancedMesh(octahedron, additive('#ffffff', .68), PARTICLES));
  particleMesh.name = 'Glutfunken und Frostsplitter'; particleMesh.frustumCulled = false;
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const particles = Array.from({ length: PARTICLES }, () => ({ life: 0, duration: 1,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, type: 'fireStaff', seed: 0, rendered: false }));
  const transform = new THREE.Object3D(), directionVector = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const normalVector = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1);
  const pointA = new THREE.Vector3(), pointB = new THREE.Vector3();
  let particleCursor = 0, burstCursor = 0, visibleParticles = 0, disposed = false;
  const emitted = { fireStaff: { launches: 0, impacts: 0 }, iceStaff: { launches: 0, impacts: 0 } };
  let latestImpact = null;
  function particle(type, x, y, z, vx, vy, vz, size, duration) {
    const entry = particles[particleCursor % PARTICLES];
    Object.assign(entry, { type, x, y, z, vx, vy, vz, size, duration, life: duration, seed: particleCursor++ });
  }

  function remember(visual, x, y, z, birth) {
    visual.history.copyWithin(3, 0, (HISTORY - 1) * 3);
    visual.births.copyWithin(1, 0, HISTORY - 1);
    visual.history[0] = x; visual.history[1] = y; visual.history[2] = z; visual.births[0] = birth;
    visual.historyCount = Math.min(HISTORY, visual.historyCount + 1);
  }
  function updateTrail(visual, delta) {
    if (!visual.active) visual.trailRemaining = Math.max(0, visual.trailRemaining - delta);
    visual.visibleTrailSegments = 0;
    if ((!visual.active && !visual.trailRemaining) || !visual.historyCount) {
      visual.trail.visible = false; return;
    }
    const positions = visual.trailPositions, fades = visual.trailFades, uvs = visual.trailUvs;
    const trailAge = visual.type === 'soulStaff' ? .16 : TRAIL_AGE;
    const residual = visual.active ? 1 : visual.trailRemaining / TRAIL_RELEASE;
    let ax = visual.group.position.x, ay = visual.group.position.y, az = visual.group.position.z, birthA = visual.headBirth;
    for (let segment = 0; segment < visual.historyCount; segment++) {
      const at = segment * 3, bx = visual.history[at], by = visual.history[at + 1], bz = visual.history[at + 2];
      const birthB = visual.births[segment], dx = bx - ax, dz = bz - az, horizontal = Math.hypot(dx, dz);
      const ageA = THREE.MathUtils.clamp((clock.value - birthA) / trailAge, 0, 1);
      const ageB = THREE.MathUtils.clamp((clock.value - birthB) / trailAge, 0, 1);
      pointA.set(ax, ay, az); pointB.set(bx, by, bz);
      let visible = ageA < 1 && ageB < 1 && Math.hypot(dx, by - ay, dz) > .0001 && canSee(pointA) && canSee(pointB);
      if (visible) { pointA.add(pointB).multiplyScalar(.5); visible = canSee(pointA); }
      if (visible) visual.visibleTrailSegments++;
      const radius = visual.type === 'soulStaff' ? .13 : crystalline(visual.type) ? .22 : .25;
      const taperA = 1 - segment / visual.historyCount, taperB = 1 - (segment + 1) / visual.historyCount;
      const widthA = radius * (.06 + (1 - ageA) * taperA * .94), widthB = radius * (.06 + (1 - ageB) * taperB * .94);
      const nx = horizontal > .00001 ? -dz / horizontal : 1, nz = horizontal > .00001 ? dx / horizontal : 0;
      for (let strip = 0; strip < 2; strip++) for (let vertex = 0; vertex < 4; vertex++) {
        const older = vertex >= 2, sign = vertex % 2 ? 1 : -1;
        const width = (older ? widthB : widthA) * sign, index = segment * 8 + strip * 4 + vertex;
        positions[index * 3] = (older ? bx : ax) + (strip ? 0 : nx * width);
        positions[index * 3 + 1] = (older ? by : ay) + (strip ? width * .80 : 0);
        positions[index * 3 + 2] = (older ? bz : az) + (strip ? 0 : nz * width);
        uvs[index * 2] = vertex % 2; uvs[index * 2 + 1] = 1 - (older ? ageB : ageA);
        fades[index] = visible ? (1 - (older ? ageB : ageA)) ** 1.35 * Math.sqrt(older ? taperB : taperA) * residual : 0;
      }
      ax = bx; ay = by; az = bz; birthA = birthB;
    }
    visual.trailGeometry.setDrawRange(0, visual.historyCount * 12);
    for (const attribute of Object.values(visual.trailGeometry.attributes)) attribute.needsUpdate = true;
    visual.trail.visible = visual.visibleTrailSegments > 0;
  }

  const bursts = Array.from({ length: BURSTS }, () => {
    const group = addRoot(new THREE.Group()); group.name = 'Zauberimpuls'; group.visible = false;
    const halo = glow('#ffffff'); group.add(halo);
    const lightning = createLightningVisual({ impact: true, ownGeometry, ownMaterial });
    const ring = mesh(group, planeGeometry, elementMaterial('shock', { opacity: .75 }));
    const cloud = mesh(group, planeGeometry, elementMaterial('cloud', { opacity: .35, billboard: true }));
    const rays = mesh(group, planeGeometry, elementMaterial('rays', { opacity: .65 }));
    const connectorMaterial = additive('#ffffff', .45);
    const connectors = Array.from({ length: 4 }, () => {
      const part = mesh(group, connectorGeometry, connectorMaterial); part.visible = false; return part;
    });
    group.add(lightning.group);
    return { group, lightning, halo, ring, cloud, rays, connectors, connectorMaterial, connectorCount: 0,
      life: 0, duration: 1, type: 'fireStaff', kind: 'impact', size: 1, x: 0, y: 0, z: 0 };
  });
  function burst(type, point, direction, kind, normal) {
    const entry = bursts[burstCursor++ % BURSTS], palette = ELEMENTS[type];
    entry.life = entry.duration = kind === 'muzzle' ? .30 : type === 'lightningStaff' ? .38 : type === 'fireStaff' ? .85 : .64;
    Object.assign(entry, { type, kind, size: kind === 'muzzle' ? .52 : type === 'fireStaff' ? 1.55 : 1.05,
      x: point.x, y: point.y, z: point.z, connectorCount: 0 });
    entry.group.position.set(0, 0, 0); entry.group.visible = true;
    entry.lightning.group.position.copy(point); entry.lightning.update(0);
    entry.lightning.group.visible = type === 'lightningStaff' && kind === 'impact';
    entry.halo.position.copy(point); entry.ring.position.copy(point); entry.cloud.position.copy(point); entry.rays.position.copy(point);
    entry.halo.material.color.set(palette.glow);
    for (const part of [entry.ring, entry.cloud, entry.rays]) setElementMaterial(part.material, type);
    normalVector.set(finite(normal?.x), finite(normal?.y), finite(normal?.z));
    if (normalVector.lengthSq() < .0001) normalVector.set(-Math.sin(direction), 0, -Math.cos(direction));
    normalVector.normalize(); entry.ring.quaternion.setFromUnitVectors(forward, normalVector);
    entry.rays.quaternion.copy(entry.ring.quaternion);
    entry.ring.position.addScaledVector(normalVector, .025); entry.rays.position.addScaledVector(normalVector, .03);
    for (const part of entry.connectors) part.visible = false;
    return entry;
  }

  const charge = addRoot(new THREE.Group()); charge.name = 'Zauber am Stabkopf'; charge.visible = false;
  const chargeHalo = glow('#ffffff', .32); charge.add(chargeHalo);
  const chargeCore = mesh(charge, octahedron, additive('#ffffff'));
  const chargeRing = mesh(charge, planeGeometry, elementMaterial('charge', { opacity: .70, billboard: true }));
  const chargeChips = Array.from({ length: 6 }, () => mesh(charge, octahedron, iceTip));
  let chargeActive = false, chargeType = 'fireStaff', chargeProgress = 0, chargeDirection = 0;

  function launch(visual, type, position, direction = 0) {
    if (disposed || !valid(position)) return end(visual);
    type = typeOf(type); direction = finite(direction);
    Object.assign(visual, { type, direction, age: 0, active: true, historyCount: 0, sampleDistance: 0,
      sparkDistance: 0, smokeDistance: 0, headBirth: clock.value, trailRemaining: 0, visibleTrailSegments: 0 });
    visual.group.position.copy(position); visual.group.rotation.set(0, direction, 0);
    const appearance = projectileMaterials[type];
    visual.group.scale.setScalar(type === 'gravityStaff' ? GRAVITY_PROJECTILE_SCALE : 1);
    visual.fire.visible = !crystalline(type) && type !== 'gravityStaff' && type !== 'lightningStaff' && type !== 'soulStaff';
    visual.soul.visible = type === 'soulStaff';
    visual.halo.material.opacity = type === 'soulStaff' ? .08 : .32;
    visual.lightning.group.visible = type === 'lightningStaff'; visual.lightning.update(0);
    visual.gravity.visible = type === 'gravityStaff';
    visual.gravityCore.visible = !visual.gravityModel;
    if (visual.gravityModel) {
      visual.gravityModel.visible = type === 'gravityStaff';
      visual.gravityModel.rotation.set(0, 0, 0);
    }
    visual.gravityParticles.count = 0;
    visual.ice.visible = crystalline(type) && type !== 'starStaff'; visual.star.visible = type === 'starStaff';
    if (visual.fireModel) visual.fireModel.visible = type === 'fireStaff';
    const importedIce = Boolean(visual.iceModel && type === 'iceStaff');
    if (visual.iceModel) visual.iceModel.visible = importedIce;
    visual.crystal.visible = visual.coldCore.visible = !importedIce;
    for (const fin of visual.iceFins) fin.visible = !importedIce;
    visual.haze.visible = type === 'fireStaff';
    visual.hotCore.visible = !(visual.fireModel && type === 'fireStaff');
    if (crystalline(type)) {
      visual.coldCore.material = appearance.core; visual.crystal.material = appearance.crystal;
      for (const part of visual.iceMists) part.material = appearance.body;
      for (const part of visual.iceFins) part.material = appearance.tip;
      for (const part of visual.glints) part.material.color.set(ELEMENTS[type].core);
    } else {
      visual.hotCore.material = appearance.core;
      for (const part of visual.fireTongues) part.material = appearance.body;
    }
    visual.halo.material.color.set(ELEMENTS[type].glow); visual.group.visible = canSee(position);
    setElementMaterial(visual.trail.material, type); visual.trail.visible = false;
    remember(visual, position.x, position.y, position.z, clock.value);
    (emitted[type] ??= { launches: 0, impacts: 0 }).launches++;
  }
  function end(visual) {
    if (visual.active) visual.trailRemaining = visual.historyCount > 1 ? TRAIL_RELEASE : 0;
    visual.active = false; visual.group.visible = false;
  }
  function advance(visual, from, to, delta, time) {
    if (disposed || !visual.active || !valid(from) || !valid(to)) return;
    delta = Math.max(0, Math.min(.25, finite(delta))); if (!delta) return;
    visual.age += delta;
    if (visual.type === 'gravityStaff') {
      if (visual.gravityModel) {
        // +Z is the measured tip direction after normalization. Follow the
        // simulated arc, then spin only the model around that flight axis.
        directionVector.subVectors(to, from);
        if (directionVector.lengthSq() > .00000001) {
          const horizontal = Math.hypot(directionVector.x, directionVector.z);
          const yaw = horizontal > .0001 ? Math.atan2(directionVector.x, directionVector.z) : visual.direction;
          // Stable yaw/pitch avoids a half-turn of roll at the apex of a -Z throw.
          visual.group.rotation.set(-Math.atan2(directionVector.y, horizontal), yaw, 0, 'YXZ');
        }
        visual.gravityModel.rotation.z = visual.age * 7;
      }
      visual.gravityParticles.count = 8;
      visual.gravityOrbits.forEach((orbit, index) => orbit.rotation.set(.5 + index, visual.age * (index ? -5 : 7), index * .8));
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + visual.age * 8;
        transform.position.set(Math.cos(angle) * .47, Math.sin(angle * 1.3) * .25, Math.sin(angle) * .47);
        transform.rotation.set(angle, angle * .7, 0); transform.scale.setScalar(.035 + i % 3 * .014);
        transform.updateMatrix(); visual.gravityParticles.setMatrixAt(i, transform.matrix);
      }
      visual.gravityParticles.instanceMatrix.needsUpdate = true;
    }
    visual.group.position.copy(to); visual.group.visible = canSee(to);
    visual.headBirth = clock.value + delta;
    const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (distance < .00001) return;
    if (visual.type === 'fireStaff') {
      const total = visual.smokeDistance + distance, spacing = .38;
      const count = Math.min(16, Math.floor(total / spacing));
      for (let i = 0; i < count; i++) {
        const t = THREE.MathUtils.clamp((spacing - visual.smokeDistance + i * spacing) / distance, 0, 1);
        pointA.copy(from).lerp(to, t); emitSmoke(pointA);
      }
      visual.smokeDistance = total % spacing;
    }
    const historyTotal = visual.sampleDistance + distance, sampleCount = Math.floor(historyTotal / SAMPLE_DISTANCE);
    for (let i = Math.max(0, sampleCount - HISTORY); i < sampleCount; i++) {
      const t = THREE.MathUtils.clamp((SAMPLE_DISTANCE - visual.sampleDistance + i * SAMPLE_DISTANCE) / distance, 0, 1);
      remember(visual, THREE.MathUtils.lerp(from.x, to.x, t), THREE.MathUtils.lerp(from.y, to.y, t),
        THREE.MathUtils.lerp(from.z, to.z, t), clock.value + delta * t);
    }
    visual.sampleDistance = historyTotal % SAMPLE_DISTANCE;
    const total = visual.sparkDistance + distance, spacing = crystalline(visual.type) ? .80 : .62;
    const count = Math.min(8, Math.floor(total / spacing)); visual.sparkDistance = total % spacing;
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, angle = (particleCursor + i) * 2.39996;
      const x = THREE.MathUtils.lerp(from.x, to.x, t), y = THREE.MathUtils.lerp(from.y, to.y, t), z = THREE.MathUtils.lerp(from.z, to.z, t);
      pointA.set(x, y, z); if (!canSee(pointA)) continue;
      particle(visual.type, x, y, z, Math.sin(angle) * .55, .12 + Math.cos(angle) * .42,
        Math.cos(angle) * .55, crystalline(visual.type) ? .055 : .042, .31 + (i % 3) * .045);
    }
  }
  function channel(type, position, direction = 0, progress = 0) {
    chargeActive = !disposed && type !== null && valid(position);
    if (!chargeActive) { charge.visible = false; return; }
    chargeType = typeOf(type); chargeProgress = THREE.MathUtils.clamp(finite(progress), 0, 1);
    chargeDirection = finite(direction); charge.position.copy(position);
    chargeHalo.material.color.set(ELEMENTS[chargeType].glow);
    chargeCore.material.color.set(ELEMENTS[chargeType].core);
    setElementMaterial(chargeRing.material, chargeType);
    charge.visible = canSee(position);
  }
  function fire(type, origin, direction = 0, launchPoint = origin) {
    if (disposed || !valid(origin)) return;
    type = typeOf(type); direction = finite(direction);
    const entry = burst(type, origin, direction, 'muzzle');
    if (valid(launchPoint) && pointA.copy(origin).distanceToSquared(launchPoint) > .01) {
      entry.connectorCount = entry.connectors.length;
      entry.connectorMaterial.color.set(ELEMENTS[type].spark);
      for (let i = 0; i < entry.connectorCount; i++) {
        const start = i / entry.connectorCount, finish = (i + 1) / entry.connectorCount;
        pointA.copy(origin).lerp(launchPoint, start); pointA.y += Math.sin(start * Math.PI) * .16;
        pointB.copy(origin).lerp(launchPoint, finish); pointB.y += Math.sin(finish * Math.PI) * .16;
        const part = entry.connectors[i]; directionVector.subVectors(pointB, pointA);
        part.position.copy(pointA).add(pointB).multiplyScalar(.5);
        part.scale.set(.035, directionVector.length(), .035);
        part.quaternion.setFromUnitVectors(up, directionVector.normalize());
      }
    }
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.39996;
      particle(type, origin.x, origin.y, origin.z, Math.sin(direction) * .7 + Math.sin(angle) * .9,
        Math.cos(angle) * .8, Math.cos(direction) * .7 + Math.cos(angle) * .9, .055, .24 + i % 3 * .04);
    }
  }
  function impact(type, point, normal = null, direction = 0) {
    if (disposed || !valid(point)) return;
    type = typeOf(type); direction = finite(direction);
    burst(type, point, direction, 'impact', normal); (emitted[type] ??= { launches: 0, impacts: 0 }).impacts++;
    latestImpact = { type, point: { x: point.x, y: point.y, z: point.z } };
    if (type === 'fireStaff') for (let i = 0; i < 10; i++) {
      pointA.set(point.x + Math.sin(i * 2.4) * .12, point.y + (i % 3) * .09, point.z + Math.cos(i * 2.4) * .24);
      pointA.addScaledVector(normalVector, .12); emitSmoke(pointA, true);
    }
    for (let i = 0; i < (type === 'fireStaff' ? 38 : 22); i++) {
      const angle = i * 2.39996, spread = (type === 'fireStaff' ? 2.0 : 1.2) + i % 4 * .35;
      particle(type, point.x, point.y, point.z, Math.sin(angle) * spread + finite(normal?.x) * .8,
        .6 + i % 5 * .24, Math.cos(angle) * spread + finite(normal?.z) * .8,
        crystalline(type) ? .08 + i % 3 * .025 : .07 + i % 3 * .02, .38 + i % 4 * .075);
    }
  }

  function update(delta, time) {
    if (disposed) return;
    delta = Math.max(0, Math.min(.25, finite(delta))); clock.value += delta; time = clock.value;
    for (const entry of smoke) {
      entry.life = Math.max(0, entry.life - delta);
      entry.sprite.visible = entry.life > 0 && canSee(entry.sprite.position);
      if (!entry.life) continue;
      const age = 1 - entry.life / entry.duration;
      entry.sprite.position.y += delta * .28;
      entry.sprite.position.x += Math.sin(entry.seed * 2.4) * delta * .08;
      entry.sprite.material.rotation += delta * .15;
      entry.sprite.scale.setScalar(entry.size * (1 + age * 2.0));
      entry.sprite.material.opacity = entry.opacity * (1 - age) ** 1.35;
    }
    visibleParticles = 0; let particlesChanged = false;
    for (let index = 0; index < PARTICLES; index++) {
      const entry = particles[index];
      if (entry.life <= 0 && !entry.rendered) continue;
      if (entry.life > 0) {
        entry.life = Math.max(0, entry.life - delta);
        entry.x += entry.vx * delta; entry.y += entry.vy * delta; entry.z += entry.vz * delta;
        entry.vy += (crystalline(entry.type) ? -2.8 : .4) * delta;
      }
      const visible = entry.life > 0 && canSee(entry), fade = Math.max(0, entry.life / entry.duration);
      if (visible || entry.rendered) {
        transform.position.set(entry.x, entry.y, entry.z);
        transform.rotation.set(entry.seed + time * 3, entry.seed + time * 2, entry.seed);
        const size = visible ? entry.size * Math.sqrt(fade) : 0;
        transform.scale.set(size, size * (crystalline(entry.type) ? 2.7 : 1.5), size * (crystalline(entry.type) ? .5 : 1));
        transform.updateMatrix(); particleMesh.setMatrixAt(index, transform.matrix);
        scratchColor.set(ELEMENTS[entry.type].spark).multiplyScalar(fade);
        particleMesh.setColorAt(index, scratchColor); particlesChanged = true;
      }
      entry.rendered = visible; if (visible) visibleParticles++;
    }
    if (particlesChanged) { particleMesh.instanceMatrix.needsUpdate = true; particleMesh.instanceColor.needsUpdate = true; }
    particleMesh.visible = visibleParticles > 0;
    for (const entry of bursts) {
      entry.life = Math.max(0, entry.life - delta); entry.group.visible = entry.life > 0;
      if (!entry.life) continue;
      const age = entry.duration - entry.life, t = age / entry.duration, visible = canSee(entry);
      entry.halo.visible = entry.ring.visible = visible;
      entry.cloud.visible = visible && entry.kind === 'impact' && entry.type !== 'lightningStaff';
      entry.lightning.group.visible = visible && entry.type === 'lightningStaff' && entry.kind === 'impact';
      entry.lightning.update(age, (1 - t) ** 1.2);
      if (entry.type === 'lightningStaff') entry.ring.visible = false;
      entry.rays.visible = visible && (crystalline(entry.type) || entry.type === 'fireStaff') && entry.kind === 'impact' && t < .65;
      entry.halo.scale.setScalar(entry.size * (.9 + t * 2.0));
      entry.halo.material.opacity = (1 - t) ** 1.8 * (entry.type === 'fireStaff' && entry.kind === 'impact' ? .85 : .42);
      entry.ring.scale.setScalar(entry.size * (.7 + t * 3.0));
      entry.ring.material.uniforms.uOpacity.value = (1 - t) ** 1.2 * .75;
      entry.cloud.scale.setScalar(entry.size * (1.0 + t * 2.6));
      entry.cloud.position.y = entry.y + t * (crystalline(entry.type) ? .10 : .35);
      entry.cloud.material.uniforms.uOpacity.value = Math.sin(t * Math.PI) * (crystalline(entry.type) ? .52 : entry.type === 'fireStaff' ? .70 : .42);
      entry.rays.scale.setScalar(entry.size * (.8 + t * 2.5));
      entry.rays.material.uniforms.uOpacity.value = Math.max(0, 1 - t / .65) * .68;
      entry.connectorMaterial.opacity = Math.max(0, 1 - age / .16) * .45;
      entry.connectors.forEach((part, index) => { part.visible = index < entry.connectorCount && age < .16 && canSee(part.position); });
    }
    charge.visible = chargeActive && canSee(charge.position);
    if (chargeActive) {
      const radius = .18 + (1 - chargeProgress) * .30;
      charge.rotation.set(0, chargeDirection, 0);
      chargeHalo.scale.setScalar(.55 + chargeProgress * .5);
      chargeCore.scale.setScalar(.045 + chargeProgress * .065);
      chargeCore.rotation.set(time * 3, time * 4, time * 2);
      chargeRing.scale.setScalar(radius * 2.8); chargeRing.rotation.set(0, 0, time * 2);
      chargeChips.forEach((part, index) => {
        const angle = time * 8 + index * Math.PI / 3;
        part.material = projectileMaterials[chargeType].tip;
        part.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, Math.sin(angle * 2) * .08);
        part.scale.set(.035, crystalline(chargeType) ? .09 : .045, .035);
        part.rotation.set(0, angle, angle);
      });
    }
    for (const visual of projectiles) {
      visual.group.visible = visual.active && canSee(visual.group.position);
      if (visual.active) {
        visual.lightning.update(visual.age);
        const pulse = 1 + Math.sin(time * 17) * .035;
        visual.fire.scale.set(pulse, pulse, 1); visual.fire.rotation.z = Math.sin(time * 6) * .10;
        visual.hotCore.scale.set(.065 * pulse, .065 * pulse, .15);
        visual.ice.rotation.z = time * 1.5;
        visual.star.rotation.z = time * 8; visual.star.rotation.y = time * 2;
        visual.haze.scale.setScalar(1.85 * pulse);
        visual.haze.material.opacity = .20 + Math.sin(time * 11) * .025;
        visual.halo.scale.setScalar((crystalline(visual.type) ? 1.0 : 1.10) * pulse);
        visual.glints.forEach((part, index) => { part.material.opacity = .25 + Math.max(0, Math.sin(time * 4 + index * 2.1)) ** 6 * .45; });
      }
      updateTrail(visual, delta);
    }
  }
  function reset() {
    for (const visual of projectiles) {
      end(visual); visual.historyCount = 0; visual.trailRemaining = 0; visual.visibleTrailSegments = 0;
      visual.trail.visible = false; visual.trailGeometry.setDrawRange(0, 0);
    }
    for (const entry of particles) { entry.life = 0; entry.rendered = true; }
    for (const entry of bursts) { entry.life = 0; entry.group.visible = false; }
    chargeActive = false; charge.visible = false; particleMesh.visible = false; visibleParticles = 0;
    for (const entry of smoke) { entry.life = 0; entry.sprite.visible = false; entry.sprite.material.opacity = 0; }
    smokeCursor = 0;
    particleCursor = burstCursor = 0; latestImpact = null; clock.value = 0;
    for (const counters of Object.values(emitted)) counters.launches = counters.impacts = 0;
  }
  function dispose() {
    if (disposed) return;
    reset(); disposed = true;
    for (const visual of projectiles) visual.gravityParticles.dispose();
    for (const root of roots) {
      if (root.isInstancedMesh) root.dispose();
      root.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    glowTexture.dispose();
  }
  reset();
  return { createProjectile, launch, advance, end, channel, fire, impact, update, reset, dispose,
    get telemetry() {
      return { activeProjectiles: projectiles.filter(v => v.active).length,
        lightningProjectiles: projectiles.filter(v => v.active && v.type === 'lightningStaff').length,
        lightningStyle: 'forked-arc-ribbons',
        visibleProjectiles: projectiles.filter(v => v.active && v.group.visible).length,
        activeParticles: particles.filter(p => p.life > 0).length, visibleParticles,
        activeSmoke: smoke.filter(p => p.life > 0).length,
        visibleSmoke: smoke.filter(p => p.sprite.visible).length,
        soulModel: soulProjectilePrototype ? { ...soulProjectilePrototype.userData } : null,
        importedSoulProjectiles: projectiles.filter(p => p.active && p.type === 'soulStaff' && p.soulModel).length,
        importedFireProjectiles: projectiles.filter(p => p.active && p.type === 'fireStaff' && p.fireModel).length,
        importedIceProjectiles: projectiles.filter(p => p.active && p.type === 'iceStaff' && p.iceModel).length,
        importedGravityProjectiles: projectiles.filter(p => p.active && p.type === 'gravityStaff' && p.gravityModel).length,
        visibleImportedGravityProjectiles: projectiles.filter(p => p.active && p.type === 'gravityStaff' && p.gravityModel && p.group.visible).length,
        gravityModel: gravityProjectilePrototype ? { ...gravityProjectilePrototype.userData, presentationScale: GRAVITY_PROJECTILE_SCALE } : null,
        starProjectiles: projectiles.filter(p => p.active && p.type === 'starStaff').length,
        visibleStarProjectiles: projectiles.filter(p => p.active && p.type === 'starStaff' && p.group.visible).length,
        starProjectileStyle: 'gold-star-blue-trail',
        iceModel: iceProjectilePrototype ? { ...iceProjectilePrototype.userData } : null,
        fireModel: fireProjectilePrototype ? { name: fireProjectilePrototype.name,
          triangles: fireProjectilePrototype.userData.triangles,
          nominalLength: fireProjectilePrototype.userData.nominalLength } : null,
        activeBursts: bursts.filter(b => b.life > 0).length, channelActive: chargeActive, channelVisible: charge.visible,
        emitted: Object.fromEntries(Object.entries(emitted).map(([type, counters]) => [type, { ...counters }])),
        latestImpact: latestImpact ? { type: latestImpact.type, point: { ...latestImpact.point } } : null,
        bursts: bursts.filter(b => b.life > 0).map(b => ({ kind: b.kind, type: b.type,
          visible: b.halo.visible || b.ring.visible || b.cloud.visible || b.rays.visible || b.connectors.some(p => p.visible), position: { x: b.x, y: b.y, z: b.z } })),
        activeTrails: projectiles.filter(v => v.historyCount > 1 && (v.active || v.trailRemaining > 0)).length,
        visibleTrailSegments: projectiles.reduce((sum, visual) => sum + visual.visibleTrailSegments, 0),
        presentation: 'flowing-elements-v2',
        capacity: { particles: PARTICLES, bursts: BURSTS, historySamplesPerProjectile: HISTORY } };
    },
  };
}
