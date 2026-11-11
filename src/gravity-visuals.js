import * as THREE from 'three';
import { createGravityVortex } from './gravity-vortex.js';
import { createStaffAimRing } from './staff-aim.js';
import { createGravityParticleFlow } from './gravity-particles.js';

const DEBRIS_COUNT = 64;
const TRAIL_SEGMENTS = 8;
const DUST_COUNT = 160;
const TARGET_CAP = 8;
const TETHER_SEGMENTS = 12;
const TAU = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const vertex = `varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Reusable ground vortex and rising sphere, with bounded instanced debris
 * and victim feedback. Depth-tested geometry, no full-screen pass. */
export function createGravityVisuals(scene, rules, { heightAt = null, textures = null } = {}) {
  const geometries = new Set(), materials = new Set();
  const geo = value => (geometries.add(value), value);
  const mat = value => {
    if (value.transparent && value.side === THREE.DoubleSide) value.forceSinglePass = true;
    materials.add(value); return value;
  };
  const root = name => { const group = new THREE.Group(); group.name = name; group.visible = false; scene.add(group); return group; };
  const aim = root('Gravitationsstab · Zielkreis');
  const range = root('Gravitationsstab · wachsende Reichweite');
  const field = root('Gravitationsfeld · Raumwirbel und Kollaps');
  const aimMesh = createStaffAimRing(rules.radius);
  geo(aimMesh.geometry); mat(aimMesh.material); aimMesh.visible = true; aim.add(aimMesh);
  const rangeMesh = createStaffAimRing(rules.range, { range: true });
  geo(rangeMesh.geometry); mat(rangeMesh.material); rangeMesh.visible = true; range.add(rangeMesh);
  const vortex = createGravityVortex(field, rules, { heightAt, textures });
  const sphereGeometry = geo(new THREE.SphereGeometry(1, 24, 14));
  const sphereVertex = `varying vec3 vNormal, vView;
    void main() { vec4 p = modelViewMatrix * vec4(position,1.0);
      vNormal = normalize(normalMatrix * normal); vView = -p.xyz; gl_Position = projectionMatrix * p; }`;
  const debrisMat = mat(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1,
    emissive: '#38223f', emissiveIntensity: .02, transparent: true, depthWrite: false }));
  const debris = new THREE.InstancedMesh(geo(new THREE.OctahedronGeometry(1, 0)), debrisMat, DEBRIS_COUNT);
  debris.name = 'Gravitationsfeld · schwebende Trümmer'; debris.frustumCulled = false;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); field.add(debris);
  for (let i = 0; i < DEBRIS_COUNT; i++) debris.setColorAt(i, new THREE.Color(i % 4 === 0 ? '#647b37' : i % 2 ? '#766779' : '#514659'));
  // Ground dust, feet rings and energy tethers share fixed reusable buffers.
  // Only visible, unobstructed targets receive their own feedback.
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustLife = new Float32Array(DUST_COUNT);
  const dustGeo = geo(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage));
  dustGeo.setAttribute('life', new THREE.BufferAttribute(dustLife, 1).setUsage(THREE.DynamicDrawUsage));
  const dustMat = mat(new THREE.ShaderMaterial({ transparent: true, blending: THREE.NormalBlending,
    depthWrite: false, toneMapped: false, uniforms: { uOpacity: { value: .7 } },
    vertexShader: `attribute float life;varying float vLife;
      void main(){vLife=life;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=1.+life*2.8;}`,
    fragmentShader: `uniform float uOpacity;varying float vLife;
      void main(){float a=(1.-smoothstep(.05,.5,length(gl_PointCoord-.5)))*vLife;
      if(a<.01)discard;gl_FragColor=vec4(.32,.22,.40,a*uOpacity);
      #include <colorspace_fragment>
    }`,
  }));
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'Gravitationsfeld · angehobener Bodenstaub'; dust.frustumCulled = false; field.add(dust);

  const markerGeo = geo(new THREE.RingGeometry(.43, .48, 36));
  const markerMat = mat(new THREE.MeshBasicMaterial({ color: '#9d83ad', transparent: true,
    opacity: .35, depthWrite: false, blending: THREE.NormalBlending,
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
    blending: THREE.NormalBlending, toneMapped: false, uniforms: { uAge: { value: 0 }, uFade: { value: .35 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uAge,uFade;
      void main(){float stripe=pow(max(0.,cos(vUv.x*37.699-vUv.y*14.+uAge*10.)),16.);
        float alpha=stripe*sin(vUv.y*3.14159)*uFade;gl_FragColor=vec4(.24,.12,.34,alpha);
        #include <colorspace_fragment>
      }`,
  }));
  const victims = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(.53, .48, 1.8, 20, 1, true)), victimMat, TARGET_CAP);
  victims.name = 'Gravitation · Energie an betroffenen Körpern'; victims.count = 0; victims.frustumCulled = false;
  victims.instanceMatrix.setUsage(THREE.DynamicDrawUsage); field.add(victims);
  const tetherPositions = new Float32Array(TARGET_CAP * 2 * TETHER_SEGMENTS * 6);
  const tetherGeo = geo(new THREE.BufferGeometry());
  tetherGeo.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const tetherMat = mat(new THREE.LineBasicMaterial({ color: '#80658f', transparent: true,
    opacity: .35, blending: THREE.NormalBlending, depthWrite: false, toneMapped: false }));
  const tethers = new THREE.LineSegments(tetherGeo, tetherMat);
  tethers.name = 'Gravitation · Energiezüge zum Gegner'; tethers.frustumCulled = false;
  tethers.visible = false; field.add(tethers);
  let affectedCount = 0;

  const trailPositions = new Float32Array(DEBRIS_COUNT * TRAIL_SEGMENTS * 6);
  const trailColors = new Float32Array(trailPositions.length);
  for (let i = 0; i < DEBRIS_COUNT; i++) for (let j = 0; j < TRAIL_SEGMENTS; j++) for (let k = 0; k < 2; k++) {
    const offset = (i * TRAIL_SEGMENTS * 2 + j * 2 + k) * 3;
    const fade = 1 - (j + k) / TRAIL_SEGMENTS;
    trailColors.set([.11 * fade, .07 * fade, .16 * fade], offset);
  }
  const trailGeometry = geo(new THREE.BufferGeometry());
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMat = mat(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true,
    blending: THREE.NormalBlending, opacity: .04, depthWrite: false, toneMapped: false }));
  const trails = new THREE.LineSegments(trailGeometry, trailMat); trails.frustumCulled = false; field.add(trails);
  const shockMat = mat(new THREE.ShaderMaterial({ name: 'Gravitation · räumliche Kollapswelle',
    transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending, toneMapped: false,
    uniforms: { uFade: { value: 0 }, uFlash: { value: 0 } }, vertexShader: sphereVertex,
    fragmentShader: `varying vec3 vNormal, vView; uniform float uFade, uFlash;
      void main() { float rim = pow(max(0.0, 1.0 - abs(dot(normalize(vNormal),normalize(vView)))), 7.0);
        gl_FragColor = vec4(mix(vec3(.36,.055,.70),vec3(.85,.60,1.),uFlash),
          rim * uFade);
        #include <colorspace_fragment>
      }`,
  }));
  const shock = new THREE.Mesh(sphereGeometry, shockMat); shock.position.y = .2; field.add(shock);
  const waveMat = mat(new THREE.ShaderMaterial({ transparent: true,
    blending: THREE.NormalBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#a74bea') } },
    vertexShader: vertex,
    fragmentShader: `varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;
      void main(){float r=length(vUv*2.-1.);
        float d=abs(r-.92),line=exp(-d*120.),glow=exp(-d*22.);
        float feather=smoothstep(.82,.85,r)*(1.-smoothstep(.985,1.,r));
        gl_FragColor=vec4(mix(uColor,vec3(.95,.70,1.),line),(line*.8+glow*.28)*feather*uOpacity);
        #include <colorspace_fragment>
      }`,
  }));
  const wave = new THREE.Mesh(geo(new THREE.RingGeometry(.82, 1, 96)), waveMat);
  wave.rotation.x = -Math.PI / 2; wave.position.y = .045; field.add(wave);
  wave.name = 'Gravitation · letzter Flächenimpuls';
  const flashMat = mat(new THREE.SpriteMaterial({ map: textures?.burst ?? null, color: '#ffffff', transparent: true,
    opacity: 0, blending: THREE.NormalBlending, depthWrite: false, toneMapped: false }));
  const flash = new THREE.Sprite(flashMat);
  flash.name = 'Gravitation · Aufblitzen beim Kollaps'; flash.position.y = 1.25;
  flash.visible = false; field.add(flash);
  const burstCoreMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uOpacity: { value: 0 } }, vertexShader: sphereVertex,
    fragmentShader: `varying vec3 vNormal,vView;uniform float uOpacity;
      void main(){float facing=abs(dot(normalize(vNormal),normalize(vView)));
        gl_FragColor=vec4(1.,.90,1.,pow(facing,1.5)*uOpacity);
        #include <colorspace_fragment>
      }`,
  }));
  const burstCore = new THREE.Mesh(sphereGeometry, burstCoreMat);
  burstCore.name = 'Gravitation · weißer Kern des Ausbruchs'; burstCore.visible = false; field.add(burstCore);
  const transform = new THREE.Object3D(), point = new THREE.Vector3();
  const flow = createGravityParticleFlow(rules, DEBRIS_COUNT + DUST_COUNT);
  const sample = {}, pastSample = {};
  let liveDebris = 0, liveDust = 0, absorbingDebris = 0;
  let phase = 'idle', disposed = false;
  function showAim(target, center, radius, age, visible) {
    aim.position.set(target.x, target.y + .055, target.z); aim.visible = visible;
    range.position.set(center.x, center.y + .055, center.z); range.visible = visible;
    rangeMesh.scale.setScalar(Math.max(.001, radius / rules.range));
  }
  function hideAim() { aim.visible = range.visible = false; }
  function showField(center, age, visible, affected = []) {
    const opening = smooth((age - rules.warning * .55) / (rules.warning * .45));
    field.position.set(center.x, center.y + .05, center.z); field.visible = visible && opening > 0;
    field.scale.setScalar(Math.max(.001, opening));
    const end = rules.warning + rules.pullDuration;
    const progress = clamp((age - rules.warning) / rules.pullDuration);
    const collapse = age >= end ? clamp((age - end) / rules.afterglow) : -1;
    const fade = collapse >= 0 ? 1 - collapse : 1;
    phase = collapse >= 0 ? 'collapse' : age < rules.warning * .55 ? 'impact' : age < rules.warning ? 'opening' : 'pull';
    const motion = vortex.update(center, age);
    dust.visible = opening > 0 && collapse < 0;
    dustMat.uniforms.uOpacity.value = .6 * fade;
    liveDust = 0;
    for (let i = 0; i < DUST_COUNT; i++) {
      flow.sample(i + DEBRIS_COUNT, age, sample);
      dustLife[i] = sample.life; if (sample.life > .01) liveDust++;
      point.set(sample.x, sample.y, sample.z);
      point.toArray(dustPositions, i * 3);
    }
    dustGeo.attributes.position.needsUpdate = dustGeo.attributes.life.needsUpdate = true;

    const pulling = phase === 'pull';
    affectedCount = pulling && visible ? Math.min(TARGET_CAP, affected.length) : 0;
    tethers.visible = affectedCount > 0;
    const currentMaterialOpacity = (.16 + progress * .2) * fade;
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
          tetherPositions[vertexIndex++] = height * (1 - t) + .20 + Math.sin(t * Math.PI) * .12;
          tetherPositions[vertexIndex++] = z * (1 - t) + Math.sin(twist) * width;
        }
      }
    }
    tetherGeo.setDrawRange(0, vertexIndex / 3);
    if (affectedCount) tetherGeo.attributes.position.needsUpdate = true;
    if (affectedCount) { markers.instanceMatrix.needsUpdate = true; victims.instanceMatrix.needsUpdate = true; }
    flash.visible = burstCore.visible = collapse >= 0 && collapse < .75;
    flash.position.set(.18, motion.sphereHeight - .25, .75);
    burstCore.position.copy(flash.position);
    if (flash.visible) {
      const intensity = 1 - smooth(collapse / .75);
      flash.scale.setScalar(4.4 + 2.2 * smooth(collapse / .5));
      flashMat.opacity = intensity;
      burstCore.scale.setScalar(.36 * intensity);
      burstCoreMat.uniforms.uOpacity.value = intensity;
    }
    debrisMat.opacity = fade;
    debris.visible = trails.visible = opening > 0 && collapse < 0;
    trailMat.opacity = .10 * fade;
    liveDebris = absorbingDebris = 0;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      flow.sample(i, age, sample);
      const life = sample.life;
      if (life > .01) { liveDebris++; if (sample.progress > .82) absorbingDebris++; }
      transform.position.set(sample.x, sample.y, sample.z);
      transform.rotation.set(age * 2 + i, age + i * .8, age * 1.4);
      transform.scale.setScalar((.055 + i % 5 * .022) * fade * life);
      if (i % 4 === 0) transform.scale.set(transform.scale.x * .25, transform.scale.y * 2.8, transform.scale.z * .45);
      transform.updateMatrix(); debris.setMatrixAt(i, transform.matrix);
      for (let j = 0; j < TRAIL_SEGMENTS; j++) for (let k = 0; k < 2; k++) {
        const back = (j + k) * .025;
        flow.sample(i, Math.max(0, age - back), pastSample);
        point.set(pastSample.x, pastSample.y, pastSample.z);
        // Each birth has its own trail. Gaps and swallowed particles leave no
        // straight links across the field or remnants hanging in the air.
        if (pastSample.event !== sample.event || pastSample.life <= .01 || life <= .01) point.copy(transform.position);
        point.toArray(trailPositions, (i * TRAIL_SEGMENTS * 2 + j * 2 + k) * 3);
      }
    }
    debris.instanceMatrix.needsUpdate = true; trailGeometry.attributes.position.needsUpdate = true;
    shock.visible = wave.visible = collapse >= 0;
    if (collapse >= 0) {
      const spread = rules.radius * (.10 + 1.12 * (1 - (1 - collapse) ** 3));
      shock.position.y = motion.sphereHeight * (1 - smooth(collapse / .6)) + .10;
      shock.scale.set(spread, .18 + Math.sin(collapse * Math.PI) * .3, spread);
      shockMat.uniforms.uFade.value = (1 - collapse) ** 1.5 * .85;
      shockMat.uniforms.uFlash.value = 1 - smooth(collapse / .5);
      wave.scale.setScalar(spread); waveMat.uniforms.uOpacity.value = (1 - collapse) ** 1.25;
    }
  }
  function hideField() {
    field.visible = false; phase = 'idle'; affectedCount = 0;
    targetMarkers.forEach(marker => { marker.visible = false; });
    markers.visible = victims.visible = false; markers.count = victims.count = 0;
    tethers.visible = false;
    debris.visible = dust.visible = trails.visible = shock.visible = wave.visible = flash.visible = burstCore.visible = false;
    liveDebris = liveDust = absorbingDebris = 0;
  }
  function countDraws(root) {
    let count = 0;
    root.traverseVisible(child => {
      if ((child.isMesh || child.isLine || child.isPoints || child.isSprite) && (!child.isInstancedMesh || child.count > 0)) {
        count += child.material.transparent && child.material.side === THREE.DoubleSide && !child.material.forceSinglePass ? 2 : 1;
      }
    });
    return count;
  }
  return { showAim, hideAim, showField, hideField,
    get telemetry() { return { phase, fieldVisible: field.visible, aimVisible: aim.visible,
      fieldDraws: field.visible ? countDraws(field) : 0,
      vortex: { ...vortex.telemetry, sphereVisible: field.visible && vortex.telemetry.sphereVisible,
        shellCount: field.visible ? vortex.telemetry.shellCount : 0,
        capVisible: field.visible && vortex.telemetry.capVisible,
        surfaceOpacity: field.visible ? vortex.telemetry.surfaceOpacity : 0 },
      debrisCount: DEBRIS_COUNT, dustCount: DUST_COUNT, affectedCount,
      liveDebris: field.visible ? liveDebris : 0, liveDust: field.visible ? liveDust : 0,
      absorbingDebris: field.visible ? absorbingDebris : 0,
      rangeRadius: rangeMesh.scale.x * rules.range }; },
    dispose() {
      if (disposed) return;
      aim.removeFromParent(); range.removeFromParent(); field.removeFromParent(); vortex.dispose(); debris.dispose(); markers.dispose(); victims.dispose();
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); disposed = true;
    },
  };
}
