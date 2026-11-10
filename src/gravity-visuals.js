import * as THREE from 'three';

const DEBRIS_COUNT = 56;
const TRAIL_SEGMENTS = 8;
const DUST_COUNT = 120;
const TARGET_CAP = 8;
const TETHER_SEGMENTS = 12;
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const vertex = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Reusable, depth-tested spell geometry: a curved vortex, event horizon,
 * orbiting debris and a three-dimensional collapse. No full-screen pass. */
export function createGravityVisuals(scene, rules) {
  const geometries = new Set(), materials = new Set();
  const geo = value => (geometries.add(value), value);
  const mat = value => (materials.add(value), value);
  const root = name => { const group = new THREE.Group(); group.name = name; group.visible = false; scene.add(group); return group; };
  const aim = root('Gravitationsstab · Zielkreis');
  const range = root('Gravitationsstab · wachsende Reichweite');
  const field = root('Gravitationsfeld · Raumwirbel und Kollaps');
  const floorGeometry = geo(new THREE.CircleGeometry(1, 96));
  function floorMaterial(aiming) {
    return mat(new THREE.ShaderMaterial({
      name: aiming ? 'Gravitation · Zielrune' : 'Gravitation · gekrümmte Bodenlinien',
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uAge: { value: 0 }, uPull: { value: 0 }, uFade: { value: 1 }, uAim: { value: aiming ? 1 : 0 } },
      vertexShader: vertex,
      fragmentShader: `varying vec2 vUv; uniform float uAge, uPull, uFade, uAim;
        void main() {
          vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x) - uAge * .45;
          float edge = 1.0 - smoothstep(.005, .018, abs(r - .975));
          float inset = (1.0 - smoothstep(.006, .019, abs(r - .84))) * .44;
          float inner = (1.0 - smoothstep(.006, .018, abs(r - .47))) * .38;
          float ringTicks = step(.63, fract((a + uAge * .28) * 9.5493));
          float sectors = step(.24, fract(a * 3.81972 + .5));
          float runes = (1.0 - smoothstep(.008, .026, abs(r - .92))) * sectors;
          float spokes = pow(max(0.0, cos(a * 12.0 + uAge * .8)), 34.0) * smoothstep(.44,.55,r) * (1.0 - smoothstep(.81,.9,r));
          float glyphs = ringTicks * (1.0 - smoothstep(.012,.037,abs(r-.72)));
          float sweep = pow(max(0.0, cos(a * 1.5 - uAge * (1.2 + uPull * 3.0))), 24.0) * smoothstep(.6,.74,r);
          float twist = a * 5.0 + r * 16.0 - uAge * (2.0 + uPull * 3.0);
          float arms = pow(max(0.0, cos(twist)), 22.0) * smoothstep(.10, .36, r);
          float grid = pow(max(0.0, cos(r * 47.0 + sin(a * 5.0 - uAge) * uPull * 2.0)), 28.0);
          float envelope = smoothstep(.07, .26, r) * (1.0 - smoothstep(.76, .92, r));
          float interior = (.035 + arms * .30 + grid * .14) * envelope * (1.0 - uAim);
          float well = (1.0 - smoothstep(.16,.82,r)) * (1.0-uAim) * smoothstep(.0,.25,uPull);
          float warning = .72 + .18 * sin(uAge * 9.0);
          float alpha = (edge * warning + inset + inner * .65 + runes * .62 + glyphs * .52 + spokes * .26 + sweep * .25 + interior + well * .6) * uFade;
          vec3 color = mix(vec3(.26,.065,.52), vec3(.91,.74,1.0), clamp(edge + runes + glyphs + arms * .45 + sweep, 0.0, 1.0));
          color = mix(color, vec3(.015,.006,.036), well * .9 * (1.0-arms*.65));
          gl_FragColor = vec4(color, min(.88, alpha));
          #include <colorspace_fragment>
        }`,
    }));
  }
  const aimMaterial = floorMaterial(true), floorMat = floorMaterial(false);
  const disk = (parent, material) => {
    const mesh = new THREE.Mesh(floorGeometry, material); mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(rules.radius); parent.add(mesh); return mesh;
  };
  disk(aim, aimMaterial).renderOrder = 30;
  const rangeMat = mat(new THREE.MeshBasicMaterial({ color: '#c7a2ff', transparent: true,
    opacity: .32, side: THREE.DoubleSide, depthWrite: false }));
  const rangeMesh = new THREE.Mesh(geo(new THREE.RingGeometry(rules.range - .045, rules.range, 128)), rangeMat);
  rangeMesh.rotation.x = -Math.PI / 2; range.add(rangeMesh);
  disk(field, floorMat).position.y = .012;

  // A curved funnel rises from the ground to the suspended singularity.
  const positions = [], uvs = [], indices = [];
  const segments = 72, rings = 14;
  for (let y = 0; y <= rings; y++) for (let x = 0; x <= segments; x++) {
    const t = y / rings, a = x / segments * TAU;
    const r = rules.radius * (.085 + .82 * t);
    positions.push(Math.cos(a) * r, .06 + (1 - t) ** 2 * 1.05, Math.sin(a) * r);
    uvs.push(x / segments, t);
    if (y < rings && x < segments) {
      const i = y * (segments + 1) + x;
      indices.push(i, i + segments + 1, i + 1, i + 1, i + segments + 1, i + segments + 2);
    }
  }
  const funnelGeometry = geo(new THREE.BufferGeometry());
  funnelGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  funnelGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  funnelGeometry.setIndex(indices);
  const funnelMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · räumliche Spiralströmung',
    transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    uniforms: { uAge: { value: 0 }, uStrength: { value: 0 } },
    vertexShader: `varying vec2 vUv; uniform float uAge;
      void main() { vUv = uv; vec3 p = position;
        p.y += sin(uv.x * 18.84956 - uv.y * 8.0 + uAge * 3.0) * .045 * sin(uv.y * 3.14159);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uAge, uStrength;
      void main() {
        float arm = pow(max(0.0, cos(vUv.x * 37.6991 + vUv.y * 13.0 - uAge * 6.0)), 18.0);
        float thread = pow(max(0.0, cos(vUv.x * 113.097 + vUv.y * 27.0 - uAge * 8.0)), 32.0);
        float fade = smoothstep(0.0,.12,vUv.y) * (1.0 - smoothstep(.73,1.0,vUv.y));
        vec3 color = mix(vec3(.18,.035,.40), vec3(.70,.35,1.0), arm);
        gl_FragColor = vec4(color, (arm * .72 + thread * .18 + .025) * fade * uStrength);
        #include <colorspace_fragment>
      }`,
  }));
  const funnel = new THREE.Mesh(funnelGeometry, funnelMat); funnel.name = 'Gravitationsfeld · gekrümmter Sog'; field.add(funnel);
  const sphereGeometry = geo(new THREE.SphereGeometry(1, 32, 20));
  const sphereVertex = `varying vec3 vNormal, vView;
    void main() { vec4 p = modelViewMatrix * vec4(position,1.0);
      vNormal = normalize(normalMatrix * normal); vView = -p.xyz; gl_Position = projectionMatrix * p; }`;
  const coreMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · dunkler Ereignishorizont', toneMapped: false,
    vertexShader: sphereVertex,
    fragmentShader: `varying vec3 vNormal, vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal),normalize(vView))), 3.0);
        vec3 color = vec3(.006,.003,.019) + vec3(.46,.22,.88) * rim + vec3(.31,.31,.48) * pow(rim,5.0);
        gl_FragColor = vec4(color,1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const core = new THREE.Mesh(sphereGeometry, coreMat); core.name = 'Gravitationsfeld · Singularität'; core.position.y = 1.25; field.add(core);
  const orbitGeometry = geo(new THREE.TorusGeometry(.62, .016, 5, 72, Math.PI * 1.72));
  const orbitMat = mat(new THREE.MeshBasicMaterial({ color: '#d5baff', transparent: true,
    blending: THREE.AdditiveBlending, opacity: .82, depthWrite: false, toneMapped: false }));
  const orbits = [new THREE.Mesh(orbitGeometry, orbitMat), new THREE.Mesh(orbitGeometry, orbitMat)];
  orbits.forEach(orbit => { orbit.position.y = 1.25; field.add(orbit); });
  const debrisMat = mat(new THREE.MeshStandardMaterial({ color: '#655075', roughness: .82,
    emissive: '#582181', emissiveIntensity: .38, transparent: true, depthWrite: false }));
  const debris = new THREE.InstancedMesh(geo(new THREE.OctahedronGeometry(1, 0)), debrisMat, DEBRIS_COUNT);
  debris.name = 'Gravitationsfeld · schwebende Trümmer'; debris.frustumCulled = false;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); field.add(debris);
  // Three GPU-friendly layers make the ground and air respond to the pull.
  // Dust moves over the whole area, while only visible, unobstructed targets get
  // their own feet rings and bent energy tethers. All buffers are reused.
  const groundLines = [];
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16, o = i % 2 ? .58 : .74;
    groundLines.push(Math.cos(a) * rules.radius * .29, .022, Math.sin(a) * rules.radius * .29);
    groundLines.push(Math.cos(a + .07) * rules.radius * o, .022, Math.sin(a + .07) * rules.radius * o);
  }
  const scarMat = mat(new THREE.LineBasicMaterial({ color: '#ad75f3', transparent: true,
    opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const scars = new THREE.LineSegments(geo(new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: groundLines.length / 3 }, (_, i) =>
      new THREE.Vector3(groundLines[i * 3], groundLines[i * 3 + 1], groundLines[i * 3 + 2])))), scarMat);
  scars.name = 'Gravitationsfeld · bebende Bodenadern'; field.add(scars);

  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustGeo = geo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const dustMat = mat(new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, uniforms: { uOpacity: { value: .7 } },
    vertexShader: `void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=3.2;}`,
    fragmentShader: `uniform float uOpacity; void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));
      if(a<.01)discard;gl_FragColor=vec4(.72,.43,1.,a*uOpacity);
      #include <colorspace_fragment>
    }`,
  }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'Gravitationsfeld · angehobener Bodenstaub'; dust.frustumCulled = false; field.add(dust);

  const markerGeo = geo(new THREE.RingGeometry(.43, .48, 36));
  const markerMat = mat(new THREE.MeshBasicMaterial({ color: '#d5a4ff', transparent: true,
    opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending,
    toneMapped: false, side: THREE.DoubleSide }));
  const targetMarkers = Array.from({ length: TARGET_CAP }, (_, i) => {
    const ring = new THREE.Group();
    ring.name = 'Gravitation · Zugkraft am Gegner ' + (i + 1);
    ring.rotation.x = -Math.PI / 2; ring.visible = false; field.add(ring); return ring;
  });
  const markers = new THREE.InstancedMesh(markerGeo, markerMat, TARGET_CAP);
  markers.name = 'Gravitation · gebündelte Fußrunen'; markers.frustumCulled = false; markers.count = 0;
  markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage); field.add(markers);
  const victimMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uAge: { value: 0 }, uFade: { value: .7 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uAge,uFade;
      void main(){float stripe=pow(max(0.,cos(vUv.x*37.699-vUv.y*14.+uAge*10.)),16.);
        float alpha=stripe*sin(vUv.y*3.14159)*uFade;gl_FragColor=vec4(.66,.28,1.,alpha);
        #include <colorspace_fragment>
      }`,
  }));
  const victims = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(.53, .48, 1.8, 20, 1, true)), victimMat, TARGET_CAP);
  victims.name = 'Gravitation · Energie an betroffenen Körpern'; victims.count = 0; victims.frustumCulled = false;
  victims.instanceMatrix.setUsage(THREE.DynamicDrawUsage); field.add(victims);
  const tetherPositions = new Float32Array(TARGET_CAP * 2 * TETHER_SEGMENTS * 6);
  const tetherGeo = geo(new THREE.BufferGeometry());
  tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const tetherMat = mat(new THREE.LineBasicMaterial({ color: '#d9abff', transparent: true,
    opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const tethers = new THREE.LineSegments(tetherGeo, tetherMat);
  tethers.name = 'Gravitation · Energiezüge zum Gegner'; tethers.frustumCulled = false;
  tethers.visible = false; field.add(tethers);
  let affectedCount = 0;

  const trailPositions = new Float32Array(DEBRIS_COUNT * TRAIL_SEGMENTS * 6);
  const trailColors = new Float32Array(trailPositions.length);
  for (let i = 0; i < DEBRIS_COUNT; i++) for (let j = 0; j < TRAIL_SEGMENTS; j++) for (let k = 0; k < 2; k++) {
    const offset = (i * TRAIL_SEGMENTS * 2 + j * 2 + k) * 3;
    const fade = 1 - (j + k) / TRAIL_SEGMENTS;
    trailColors.set([.52 * fade, .29 * fade, .86 * fade], offset);
  }
  const trailGeometry = geo(new THREE.BufferGeometry());
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = mat(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, opacity: .6, depthWrite: false, toneMapped: false }));
  const trails = new THREE.LineSegments(trailGeometry, trailMat); trails.frustumCulled = false; field.add(trails);
  const shockMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · räumliche Kollapswelle',
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uFade: { value: 0 }, uFlash: { value: 0 } }, vertexShader: sphereVertex,
    fragmentShader: `varying vec3 vNormal, vView; uniform float uFade, uFlash;
      void main() { float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vNormal),normalize(vView)))), 2.5);
        gl_FragColor = vec4(mix(vec3(.57,.26,1.0),vec3(.90,.78,1.0),uFlash),
          (rim + uFlash * .6) * uFade);
        #include <colorspace_fragment>
      }`,
  }));
  const shock = new THREE.Mesh(sphereGeometry, shockMat); shock.position.y = .2; field.add(shock);
  const waveMat = mat(new THREE.MeshBasicMaterial({ color: '#e7d7ff', transparent: true,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const wave = new THREE.Mesh(geo(new THREE.RingGeometry(.965, 1, 128)), waveMat);
  wave.rotation.x = -Math.PI / 2; wave.position.y = .045; field.add(wave);
  const secondWaveMat = mat(new THREE.MeshBasicMaterial({ color: '#a46bff', transparent: true,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
  const secondWave = new THREE.Mesh(geo(new THREE.RingGeometry(.90, 1, 96)), secondWaveMat);
  secondWave.rotation.x = -Math.PI / 2; secondWave.position.y = .075; field.add(secondWave);
  const thirdWaveMat = mat(secondWaveMat.clone()); thirdWaveMat.color.set('#7139e7');
  const thirdWave = new THREE.Mesh(secondWave.geometry, thirdWaveMat);
  thirdWave.rotation.x = -Math.PI / 2; thirdWave.position.y = .095; field.add(thirdWave);
  const flashMat = mat(new THREE.MeshBasicMaterial({ color: '#f2d7ff', transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const flash = new THREE.Mesh(sphereGeometry, flashMat);
  flash.name = 'Gravitation · Aufblitzen beim Kollaps'; flash.position.y = 1.25;
  flash.visible = false; field.add(flash);
  const transform = new THREE.Object3D(), point = new THREE.Vector3();
  let phase = 'idle', disposed = false;
  function particle(index, progress, collapse, out) {
    const seed = (index * .61803398875) % 1;
    const p = smooth((progress - seed * .26) / (1 - seed * .26));
    const angle = index * 2.39996 + p ** 1.4 * (8 + seed * 7);
    const radius = collapse >= 0 ? .14 + rules.radius * Math.sqrt(collapse) * (.4 + seed * .52)
      : .18 + rules.radius * (.42 + seed * .48) * (1 - p) ** .8;
    const height = collapse >= 0 ? .95 + Math.sin(collapse * Math.PI) * (.3 + seed * .3) - collapse * .85
      : .10 + p * .93 + Math.sin(p * Math.PI + index) * .12;
    return out.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
  }
  function showAim(target, center, radius, age, visible) {
    aim.position.set(target.x, target.y + .055, target.z); aim.visible = visible;
    range.position.set(center.x, center.y + .055, center.z); range.visible = visible;
    rangeMesh.scale.setScalar(Math.max(.001, radius / rules.range));
    aimMaterial.uniforms.uAge.value = age;
    rangeMat.opacity = .2 + .13 * Math.min(1, age / rules.chargeSeconds);
  }
  function hideAim() { aim.visible = range.visible = false; }
  function showField(center, age, visible, affected = []) {
    const opening = smooth((age - rules.warning * .55) / (rules.warning * .45));
    field.position.set(center.x, center.y + .05, center.z); field.visible = visible && opening > 0;
    field.scale.setScalar(Math.max(.001, opening));
    const end = rules.warning + rules.pullDuration;
    const progress = clamp((age - rules.warning) / rules.pullDuration);
    const collapse = age >= end ? clamp((age - end) / rules.afterglow) : -1;
    const strength = smooth((age - rules.warning) / .16);
    const fade = collapse >= 0 ? 1 - collapse : 1;
    phase = collapse >= 0 ? 'collapse' : age < rules.warning * .55 ? 'impact' : age < rules.warning ? 'opening' : 'pull';
    floorMat.uniforms.uAge.value = age;
    floorMat.uniforms.uPull.value = progress;
    floorMat.uniforms.uFade.value = fade;
    scars.visible = age <= end + rules.afterglow;
    scars.rotation.y = age * (age < rules.warning ? -.22 : -.85);
    scarMat.opacity = (.20 + .38 * Math.sin(Math.min(1, age / end) * Math.PI)) * fade;
    const pullTime = Math.max(0, age - rules.warning);
    dust.visible = age >= rules.warning && collapse < 0;
    dustMat.uniforms.uOpacity.value = (.38 + .34 * smooth(pullTime / .2)) * fade;
    for (let i = 0; i < DUST_COUNT; i++) {
      const seed = (i * .6180339) % 1;
      const angle = i * 2.39996 + pullTime * (1.8 + seed * 2.2);
      const travel = ((pullTime * (.3 + seed * .55)) + seed) % 1;
      const radius = rules.radius * (.12 + .82 * (1 - travel));
      const y = .06 + (.2 + seed * .6) * Math.sin(travel * Math.PI);
      dustPositions[i * 3] = Math.cos(angle) * radius;
      dustPositions[i * 3 + 1] = y;
      dustPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    dustGeo.attributes.position.needsUpdate = true;

    const pulling = phase === 'pull';
    affectedCount = pulling && visible ? Math.min(TARGET_CAP, affected.length) : 0;
    tethers.visible = affectedCount > 0;
    const currentMaterialOpacity = (.40 + progress * .4) * fade;
    markerMat.opacity = currentMaterialOpacity;
    tetherMat.opacity = currentMaterialOpacity;
    victimMat.uniforms.uAge.value = age; victimMat.uniforms.uFade.value = currentMaterialOpacity;
    markers.visible = victims.visible = affectedCount > 0; markers.count = victims.count = affectedCount;
    let vertexIndex = 0;
    for (let i = 0; i < TARGET_CAP; i++) {
      const marker = targetMarkers[i]; marker.visible = i < affectedCount;
      if (i >= affectedCount) continue;
      const victim = affected[i], x = victim.x - center.x, z = victim.z - center.z;
      const height = (victim.y ?? center.y) - center.y;
      marker.position.set(x, height + .085, z);
      marker.rotation.z = age * (i % 2 ? -.85 : .85);
      marker.scale.setScalar(.9 + .13 * Math.sin(age * 11 + i));
      marker.updateMatrix(); markers.setMatrixAt(i, marker.matrix);
      transform.position.set(x, height + .95, z); transform.rotation.set(0, age * .6, 0); transform.scale.setScalar(1);
      transform.updateMatrix(); victims.setMatrixAt(i, transform.matrix);
      for (let strand = 0; strand < 2; strand++) for (let part = 0; part < TETHER_SEGMENTS; part++) {
        for (let k = 0; k < 2; k++) {
          const t = (part + k) / TETHER_SEGMENTS;
          const twist = t * TAU * 1.5 + age * 8 + i + strand * Math.PI;
          const width = Math.sin(t * Math.PI) * (.18 + .09 * strand);
          tetherPositions[vertexIndex++] = x * (1 - t) + Math.cos(twist) * width;
          tetherPositions[vertexIndex++] = height + .20 + t * .78 + Math.sin(t * Math.PI) * .15;
          tetherPositions[vertexIndex++] = z * (1 - t) + Math.sin(twist) * width;
        }
      }
    }
    tetherGeo.setDrawRange(0, vertexIndex / 3);
    if (affectedCount) tetherGeo.attributes.position.needsUpdate = true;
    if (affectedCount) { markers.instanceMatrix.needsUpdate = true; victims.instanceMatrix.needsUpdate = true; }
    funnel.visible = collapse < 0; funnelMat.uniforms.uAge.value = age;
    funnelMat.uniforms.uStrength.value = strength;
    core.visible = collapse < 0;
    const compress = smooth((progress - .82) / .18);
    core.scale.setScalar(.12 + strength * (.40 + .22 * progress) * (1 - compress * .95));
    flash.visible = collapse >= 0 && collapse < .3 || collapse < 0 && compress > .05;
    if (flash.visible) {
      const intensity = collapse >= 0 ? 1 - smooth(collapse / .3) : compress;
      flash.scale.setScalar(.15 + intensity * .42);
      flashMat.opacity = intensity * (collapse >= 0 ? .85 : .32);
    }
    orbits.forEach((orbit, i) => {
      orbit.visible = collapse < 0 && strength > 0;
      orbit.rotation.set(.5 + i * .85, age * (i ? -2.4 : 2.9), .3 + Math.sin(age * 1.3 + i) * .32);
      orbit.scale.setScalar(.9 + progress * .7);
    });
    debrisMat.opacity = fade;
    trails.visible = age >= rules.warning;
    trailMat.opacity = .65 * fade;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      particle(i, progress, collapse, transform.position);
      transform.rotation.set(age * 2 + i, age + i * .8, age * 1.4);
      transform.scale.setScalar((.070 + i % 4 * .026) * fade);
      transform.updateMatrix(); debris.setMatrixAt(i, transform.matrix);
      for (let j = 0; j < TRAIL_SEGMENTS; j++) for (let k = 0; k < 2; k++) {
        const back = (j + k) * .025;
        particle(i, Math.max(0, progress - back), collapse < 0 ? -1 : Math.max(0, collapse - back), point);
        point.toArray(trailPositions, (i * TRAIL_SEGMENTS * 2 + j * 2 + k) * 3);
      }
    }
    debris.instanceMatrix.needsUpdate = true; trailGeometry.attributes.position.needsUpdate = true;
    shock.visible = wave.visible = secondWave.visible = thirdWave.visible = collapse >= 0;
    if (collapse >= 0) {
      const spread = rules.radius * (.07 + .93 * (1 - (1 - collapse) ** 3));
      shock.scale.set(spread, .10 + Math.sin(collapse * Math.PI) * .6, spread);
      shockMat.uniforms.uFade.value = fade ** 2 * 1.3;
      shockMat.uniforms.uFlash.value = 1 - smooth(collapse / .5);
      wave.scale.setScalar(spread); waveMat.opacity = fade ** 1.5 * .95;
      const delayed = clamp((collapse - .10) / .90);
      secondWave.scale.setScalar(rules.radius * (.08 + .92 * (1 - (1 - delayed) ** 2)));
      secondWaveMat.opacity = (1 - delayed) ** 2 * .7;
      const last = clamp((collapse - .26) / .74);
      thirdWave.visible = collapse >= .26;
      thirdWave.scale.setScalar(rules.radius * (.10 + .90 * (1 - (1 - last) ** 2)));
      thirdWaveMat.opacity = (1 - last) ** 2 * .65;
    }
  }
  function hideField() {
    field.visible = false; phase = 'idle'; affectedCount = 0;
    targetMarkers.forEach(marker => { marker.visible = false; });
    markers.visible = victims.visible = false; markers.count = victims.count = 0;
    tethers.visible = false;
  }
  return { showAim, hideAim, showField, hideField,
    get telemetry() { return { phase, fieldVisible: field.visible, aimVisible: aim.visible,
      fieldDraws: field.visible ? field.children.filter(child => child.visible && (child.isMesh || child.isLine || child.isPoints)).length : 0,
      debrisCount: DEBRIS_COUNT, dustCount: DUST_COUNT, affectedCount,
      rangeRadius: rangeMesh.scale.x * rules.range }; },
    dispose() {
      if (disposed) return;
      aim.removeFromParent(); range.removeFromParent(); field.removeFromParent(); debris.dispose(); markers.dispose(); victims.dispose();
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); disposed = true;
    },
  };
}
