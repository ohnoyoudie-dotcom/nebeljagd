import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';
import { createMeteorGroundFire } from './meteor-ground-fire.js';
import { createMeteorHeat } from './meteor-heat.js';

export const METEOR_VISUAL_BUDGET = Object.freeze({ puffs: 160, embers: 96, fragments: 8, fire: 18 });
const random = (i, salt) => { const x = Math.sin(i * salt + 1.7) * 43758.5453; return x - Math.floor(x); };

/** Pooled smoke, hot embers and a broad short blast. Imported body geometry and
 * textures stay owned by their loader; this controller owns cloned materials. */
export function createMeteorVisuals(scene, rules, { prototype = null, isVisible = null, heightAt = () => 0 } = {}) {
  const geometries = new Set(), materials = new Set();
  const geo = value => (geometries.add(value), value), mat = value => (materials.add(value), value);
  const root = new THREE.Group(); root.name = 'Meteorstab · Flug und Einschlag'; scene.add(root);
  const groundFire = createMeteorGroundFire(root, rules, heightAt);
  const heat = createMeteorHeat(root, METEOR_VISUAL_BUDGET.puffs + 1);
  const body = new THREE.Group(); body.name = 'Meteorstab · wachsender Meteorkörper'; body.visible = false; root.add(body);
  let bodyDraws = 0;
  if (prototype) {
    const model = prototype.clone(true);
    model.traverse(part => {
      if (!part.isMesh) return;
      bodyDraws++;
      const clone = source => {
        const own = mat(source.clone());
        // Reuse the uploaded lava colors as emission: bright fissures glow,
        // while the dark crust stays dark. The loader still owns the texture.
        if (own.isMeshStandardMaterial && own.map && !own.emissiveMap) {
          own.emissiveMap = own.map; own.emissive.set('#ffffff'); own.emissiveIntensity = 1.3;
          const previousCompile = own.onBeforeCompile;
          own.onBeforeCompile = function (shader, renderer) {
            previousCompile.call(this, shader, renderer);
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(.10, .35, totalEmissiveRadiance.g);');
          };
          own.customProgramCacheKey = () => 'meteor-lava-fissures-v1';
        }
        return own;
      };
      part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
      part.castShadow = false; part.receiveShadow = false;
    });
    body.add(model);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const diameter = Math.max(size.x, size.y, size.z);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    // Keep normalization on a child so flight scale is the actual diameter.
    const normalized = new THREE.Group(); body.remove(model); normalized.add(model); normalized.scale.setScalar(1 / diameter); body.add(normalized); body.scale.setScalar(1);
  } else {
    // Lightweight standalone simulation fallback. The game loader supplies
    // the uploaded meteor template; browser QA checks that it is really used.
    const core = new THREE.Mesh(geo(new THREE.IcosahedronGeometry(.43, 2)), mat(new THREE.MeshBasicMaterial({ color: '#ffba35', toneMapped: false })));
    const crust = mat(new THREE.MeshStandardMaterial({ color: '#34231e', roughness: .96, flatShading: true, emissive: '#3e1407', emissiveIntensity: .3 }));
    const shape = geo(new THREE.DodecahedronGeometry(.23, 0)); body.add(core); bodyDraws++;
    for (let i = 0; i < 12; i++) {
      const y = 1 - (i + .5) / 6, angle = i * 2.399963, radial = Math.sqrt(1 - y * y);
      const plate = new THREE.Mesh(shape, crust); plate.position.set(Math.cos(angle) * radial, y, Math.sin(angle) * radial).multiplyScalar(.35);
      plate.rotation.set(i * .7, i * .31, i * .19); plate.scale.set(.88, .7 + random(i, 33) * .4, .83);
      body.add(plate); bodyDraws++;
    }
  }
  // Instance the normalized uploaded body, including its lava textures. Every
  // fragment shares geometry/materials with the main meteor, never a new asset.
  const chips = [];
  body.updateMatrixWorld(true);
  body.traverse(part => {
    if (!part.isMesh) return;
    const mesh = new THREE.InstancedMesh(part.geometry, part.material, rules.fragments);
    mesh.name = 'Meteorstab · kleine Meteorsplitter';
    mesh.frustumCulled = false; mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh);
    chips.push({ mesh, local: part.matrixWorld.clone() });
  });
  const shock = createStaffAimRing(rules.radius, { color: '#ffc16b' });
  shock.material.depthTest = true; shock.visible = false; root.add(shock); geo(shock.geometry); mat(shock.material);
  const flashMat = mat(new THREE.MeshBasicMaterial({ color: '#ffbd62', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  const flash = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 20, 12)), flashMat); flash.visible = false; root.add(flash);
  const noise = `float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}`;
  const fireGeo = geo(new THREE.InstancedBufferGeometry()); fireGeo.setIndex([0,1,2,0,2,3]);
  fireGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const fireCenters = new Float32Array(METEOR_VISUAL_BUDGET.fire * 3), fireShapes = new Float32Array(METEOR_VISUAL_BUDGET.fire * 4);
  fireGeo.setAttribute('center', new THREE.InstancedBufferAttribute(fireCenters, 3).setUsage(THREE.DynamicDrawUsage));
  fireGeo.setAttribute('shape', new THREE.InstancedBufferAttribute(fireShapes, 4).setUsage(THREE.DynamicDrawUsage)); fireGeo.instanceCount = 0;
  const fireMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec3 vShape;
      void main(){vUv=position.xy;vShape=shape.yzw;vec4 p=modelViewMatrix*vec4(center,1.);
        p.xy+=position.xy*shape.x*vec2(1.,1.35);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vShape;${noise}
      void main(){float age=vShape.x,seed=vShape.y;vec2 p=vUv;
        float swirl=n(p*3.5+seed*41.+vec2(age*2.,-age*7.))*.65+n(p*8.-seed*13.-age*4.)*.35;
        float contour=length(p)+(.5-swirl)*.42;
        float edge=1.-smoothstep(.5,.98,contour);
        float heat=clamp((1.-contour)*1.35+swirl*.4-age*.55,0.,1.);
        vec3 color=mix(vec3(1.,.055,.002),vec3(1.,.48,.025),smoothstep(.05,.55,heat));
        color=mix(color,vec3(1.,.94,.54),smoothstep(.55,.98,heat));
        gl_FragColor=vec4(color,edge*vShape.z*.88);
        #include <colorspace_fragment>
      }` }));
  const fire = new THREE.Mesh(fireGeo, fireMat); fire.name = 'Meteorstab · aufwallende Feuerexplosion';
  fire.frustumCulled = false; root.add(fire);
  const puffGeo = geo(new THREE.InstancedBufferGeometry()); puffGeo.setIndex([0,1,2,0,2,3]);
  puffGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const centers = new Float32Array(METEOR_VISUAL_BUDGET.puffs * 3), shapes = new Float32Array(METEOR_VISUAL_BUDGET.puffs * 4);
  puffGeo.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeo.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4).setUsage(THREE.DynamicDrawUsage)); puffGeo.instanceCount = 0;
  const clock = { value: 0 };
  const puffMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { uTime: clock },
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec3 vShape;
      void main(){vUv=position.xy;vShape=shape.yzw;vec4 p=modelViewMatrix*vec4(center,1.);p.xy+=position.xy*shape.x;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vShape;uniform float uTime;${noise}
      void main(){vec2 p=vUv;float seed=vShape.y,age=vShape.x;
        p+=vec2(n(p*2.+seed*9.+uTime*.15),n(p*2.-seed*13.-uTime*.12))*.16-.08;
        float noise=n(p*3.+seed*37.+vec2(0.,-uTime*.35))*.55+n(p*6.1-seed*19.)*.3+n(p*12.+seed*7.)*.15;
        float edge=1.-smoothstep(.32+noise*.3,.68+noise*.29,length(p));
        float hot=max(0.,1.-age*12.);float light=clamp(.47-p.y*.25+noise*.35,0.,1.);
        vec3 smoke=mix(vec3(.035,.04,.045),vec3(.27,.29,.31),light);
        vec3 fire=mix(vec3(1.,.16,.008),vec3(1.,.78,.21),noise);
        gl_FragColor=vec4(mix(smoke,fire,hot),edge*(.64+noise*.3)*vShape.z);
        #include <colorspace_fragment>
      }` }));
  const smoke = new THREE.Mesh(puffGeo, puffMat); smoke.name = 'Meteorstab · heißer Rauchschweif'; smoke.frustumCulled = false; root.add(smoke);
  const puffs = Array.from({ length: METEOR_VISUAL_BUDGET.puffs }, (_, i) => ({ age: 99, life: 2.2, position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 1, seed: random(i, 53.3), depth: 0 }));
  const sorted = [], cameraMatrix = new THREE.Matrix4();
  function upload() {
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i], progress = p.age / p.life;
      p.position.toArray(centers, i * 3); shapes.set([p.size * (.8 + progress * 1.3), progress, p.seed, (1 - progress) ** .7], i * 4);
    }
    puffGeo.instanceCount = sorted.length; puffGeo.attributes.center.needsUpdate = puffGeo.attributes.shape.needsUpdate = true;
  }
  smoke.onBeforeRender = (_renderer, _scene, camera) => {
    cameraMatrix.multiplyMatrices(camera.matrixWorldInverse, smoke.matrixWorld); const e = cameraMatrix.elements;
    for (const p of sorted) p.depth = e[2] * p.position.x + e[6] * p.position.y + e[10] * p.position.z + e[14];
    sorted.sort((a,b) => a.depth - b.depth); upload();
  };
  const sparkPositions = new Float32Array(96 * 3), sparkGeo = geo(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage)); sparkGeo.setDrawRange(0, 0);
  const sparkMat = mat(new THREE.PointsMaterial({ color: '#ffb347', size: .075, sizeAttenuation: true, transparent: true, opacity: .9, depthWrite: false, toneMapped: false }));
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; root.add(sparks);
  const embers = Array.from({ length: 96 }, () => ({ age: 99, life: .8, position: new THREE.Vector3(), velocity: new THREE.Vector3() }));
  const transform = new THREE.Object3D(), instance = new THREE.Matrix4(), lastPosition = new THREE.Vector3();
  const previousFlight = new THREE.Vector3(), samplePosition = new THREE.Vector3(), previousSample = new THREE.Vector3();
  const maxSpacing = .18; let trailSamples = 0, maxGap = 0, remainder = 0;
  let puffCursor = 0, emberCursor = 0, flying = false, blast = null, diameter = 0, disposed = false;
  const visible = p => !isVisible || isVisible(p);
  function puff(position, size, vx = 0, vy = .9, vz = 0) {
    const p = puffs[puffCursor++ % puffs.length]; p.age = 0; p.position.copy(position); p.size = size; p.velocity.set(vx, vy, vz);
  }
  function ember(position, vx, vy, vz) {
    const p = embers[emberCursor++ % embers.length]; p.age = 0; p.position.copy(position); p.velocity.set(vx, vy, vz);
  }
  function flight(position, size, age) {
    const emit = point => {
      const i = puffCursor, angle = i * 2.399963;
      if (trailSamples) maxGap = Math.max(maxGap, point.distanceTo(previousSample));
      previousSample.copy(point); trailSamples++;
      puff(point, Math.max(.32, size * .62), Math.cos(angle)*.18, .28+random(i,17)*.18, Math.sin(angle)*.18);
      if (i%3===0) ember(point,Math.cos(angle)*.65,.6,Math.sin(angle)*.65);
    };
    if (!flying) { previousFlight.copy(position); previousSample.copy(position); emit(position); }
    else {
      const distance = previousFlight.distanceTo(position);
      for (let d = maxSpacing-remainder; d <= distance; d += maxSpacing) emit(samplePosition.copy(previousFlight).lerp(position,d/distance));
      remainder = (remainder+distance)%maxSpacing;
    }
    previousFlight.copy(position);
    flying = true; diameter = size; body.position.copy(position); lastPosition.copy(position);
    body.scale.setScalar(size); body.rotation.set(age * .7, age * .9, age * .28); body.visible = visible(position);
  }
  function impact(center, burningGround = true) {
    groundFire.ignite(center, burningGround);
    flying = false; body.visible = false; blast = { center: center.clone(), age: 0 };
    for (let i = 0; i < 42; i++) {
      const a = i * 2.399963, speed = 1.4 + random(i, 12.1) * 3.5;
      const origin = new THREE.Vector3(center.x + Math.cos(a) * .4, center.y + .35, center.z + Math.sin(a) * .4);
      puff(origin, .65 + random(i, 2.1) * .9, Math.cos(a) * speed, .8 + random(i, 7.3), Math.sin(a) * speed);
      ember(origin, Math.cos(a) * speed * 1.7, 1.6 + random(i, 17.7) * 3, Math.sin(a) * speed * 1.7);
    }
  }
  function fragments(items) {
    let count = 0;
    for (const f of items) {
      if (!f.active || !visible(f.position)) continue;
      transform.position.copy(f.position); transform.rotation.set(f.age * (f.spin?.x ?? 6), f.age * (f.spin?.y ?? 8), f.age * (f.spin?.z ?? 3)); transform.scale.setScalar((f.radius ?? rules.fragmentRadius) * 2);
      transform.updateMatrix();
      for (const chip of chips) chip.mesh.setMatrixAt(count, instance.multiplyMatrices(transform.matrix, chip.local));
      count++;
    }
    for (const chip of chips) { chip.mesh.count = count; chip.mesh.instanceMatrix.needsUpdate = true; }
  }
  function update(dt) {
    if (!(dt > 0) || disposed) return; clock.value += dt;
    sorted.length = 0;
    for (const p of puffs) {
      if (p.age >= p.life) continue;
      p.age += dt; p.position.addScaledVector(p.velocity, dt);
      if (p.age < p.life && visible(p.position)) sorted.push(p);
    }
    upload();
    heat.update(clock.value, flying ? { visible: body.visible, position: lastPosition, diameter } : null, flying ? sorted : []);
    let count = 0;
    for (const e of embers) {
      if (e.age >= e.life) continue;
      e.age += dt; e.position.addScaledVector(e.velocity, dt); e.velocity.y -= dt * 3;
      if (e.age < e.life && e.position.y > heightAt(e.position.x, e.position.z) && visible(e.position)) e.position.toArray(sparkPositions, count++ * 3);
    }
    sparkGeo.setDrawRange(0, count); sparkGeo.attributes.position.needsUpdate = true;
    if (blast) {
      blast.age += dt; const t = blast.age, active = visible(blast.center);
      groundFire.update(t, active);
      shock.visible = active && t < .75; shock.position.copy(blast.center); shock.position.y += .08;
      shock.scale.setScalar(.1 + .9 * Math.min(1, t / .65)); shock.userData.update(t, Math.max(0, 1 - t / .75));
      flash.visible = active && t < .22; flash.position.copy(blast.center); flash.position.y += .3;
      flash.scale.setScalar(.4 + Math.min(1, t / .2) * rules.radius * .7); flash.scale.y *= .38;
      flashMat.opacity = Math.max(0, 1 - t / .22) * .4;
      let fireCount = 0;
      for (let i = 0; i < METEOR_VISUAL_BUDGET.fire; i++) {
        const delay = random(i, 24.1) * .12, age = (t - delay) / (.65 + random(i, 33.7) * .35);
        if (!active || age < 0 || age >= 1) continue;
        const angle = i * 2.399963, spread = rules.radius * (.18 + random(i, 12.9) * .42) * Math.sin(age * Math.PI * .65);
        fireCenters.set([blast.center.x + Math.cos(angle) * spread,
          blast.center.y + .35 + age * (1.2 + random(i, 7.9) * 1.8), blast.center.z + Math.sin(angle) * spread], fireCount * 3);
        const size = (.45 + random(i, 18.7) * .55) * Math.sin(Math.PI * age) ** .4;
        fireShapes.set([size, age, random(i, 44.3), Math.min(1, age * 12) * (1-age) ** .65], fireCount * 4);
        fireCount++;
      }
      fireGeo.instanceCount = fireCount;
      fireGeo.attributes.center.needsUpdate = fireGeo.attributes.shape.needsUpdate = true;
    }
  }
  function reset() {
    groundFire.reset(); heat.reset(); trailSamples = maxGap = remainder = 0;
    flying = false; blast = null; diameter = 0; clock.value = 0;
    body.visible = shock.visible = flash.visible = false; for (const chip of chips) chip.mesh.count = 0; fireGeo.instanceCount = 0;
    for (const p of [...puffs, ...embers]) p.age = 99;
    sorted.length = 0; puffGeo.instanceCount = 0; sparkGeo.setDrawRange(0, 0);
  }
  return { flight, impact, fragments, update, reset,
    get telemetry() { return { bodyVisible: body.visible, model: prototype ? 'uploaded' : 'procedural-fallback',
      source: prototype?.userData?.source ?? null, diameter,
      puffs: puffGeo.instanceCount, embers: sparkGeo.drawRange.count, fragments: chips[0]?.mesh.count ?? 0, fragmentModel: prototype ? 'uploaded' : 'procedural-fallback', fire: fireGeo.instanceCount,
      heat: heat.telemetry, trail: { samples: trailSamples, maxGap, maxSpacing }, groundFire: groundFire.telemetry, shock: shock.visible, flash: flash.visible, draws: Number(heat.telemetry.visible) + groundFire.telemetry.draws + (body.visible ? bodyDraws : 0) + Number(puffGeo.instanceCount > 0) + Number(sparkGeo.drawRange.count > 0) + chips.filter(chip => chip.mesh.count > 0).length + Number(fireGeo.instanceCount > 0) + Number(shock.visible) + Number(flash.visible) }; },
    dispose() { if (disposed) return; disposed = true; reset(); root.removeFromParent(); groundFire.dispose(); heat.dispose(); for (const chip of chips) chip.mesh.dispose();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
