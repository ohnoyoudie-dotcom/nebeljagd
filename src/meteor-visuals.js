import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';

export const METEOR_VISUAL_BUDGET = Object.freeze({ puffs: 96, embers: 96, fragments: 6 });
const random = (i, salt) => { const x = Math.sin(i * salt + 1.7) * 43758.5453; return x - Math.floor(x); };

/** Pooled smoke, hot embers and a broad short blast. Imported body geometry and
 * textures stay owned by their loader; this controller owns cloned materials. */
export function createMeteorVisuals(scene, rules, { prototype = null, isVisible = null, heightAt = () => 0 } = {}) {
  const geometries = new Set(), materials = new Set();
  const geo = value => (geometries.add(value), value), mat = value => (materials.add(value), value);
  const root = new THREE.Group(); root.name = 'Meteorstab · Flug und Einschlag'; scene.add(root);
  const body = new THREE.Group(); body.name = 'Meteorstab · wachsender Meteorkörper'; body.visible = false; root.add(body);
  let bodyDraws = 0;
  if (prototype) {
    const model = prototype.clone(true);
    model.traverse(part => {
      if (!part.isMesh) return;
      bodyDraws++;
      const clone = source => { const own = mat(source.clone()); return own; };
      part.material = Array.isArray(part.material) ? part.material.map(clone) : clone(part.material);
      part.castShadow = false; part.receiveShadow = false;
    });
    body.add(model);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const diameter = Math.max(size.x, size.y, size.z);
    model.position.sub(bounds.getCenter(new THREE.Vector3())); body.scale.setScalar(1 / diameter);
    // Keep normalization on a child so flight scale is the actual diameter.
    const normalized = new THREE.Group(); body.remove(model); normalized.add(model); normalized.scale.setScalar(1 / diameter); body.add(normalized); body.scale.setScalar(1);
  } else {
    // Explicit first-animation placeholder while a separate projectile upload
    // is absent. It is not reported as a Tripo asset.
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
  const fragmentGeometry = geo(new THREE.DodecahedronGeometry(rules.fragmentRadius, 0));
  const fragmentMaterial = mat(new THREE.MeshStandardMaterial({ color: '#4b2d20', emissive: '#fb6411', emissiveIntensity: 1.25, roughness: .9, flatShading: true }));
  const chips = new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, rules.fragments); chips.frustumCulled = false; chips.count = 0; root.add(chips);
  chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const shock = createStaffAimRing(rules.radius, { color: '#ffc16b' });
  shock.material.depthTest = true; shock.visible = false; root.add(shock); geo(shock.geometry); mat(shock.material);
  const flashMat = mat(new THREE.MeshBasicMaterial({ color: '#ffbd62', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  const flash = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 20, 12)), flashMat); flash.visible = false; root.add(flash);
  const noise = `float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}`;
  const puffGeo = geo(new THREE.InstancedBufferGeometry()); puffGeo.setIndex([0,1,2,0,2,3]);
  puffGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const centers = new Float32Array(96 * 3), shapes = new Float32Array(96 * 4);
  puffGeo.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeo.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4).setUsage(THREE.DynamicDrawUsage)); puffGeo.instanceCount = 0;
  const clock = { value: 0 };
  const puffMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { uTime: clock },
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec3 vShape;
      void main(){vUv=position.xy;vShape=shape.yzw;vec4 p=modelViewMatrix*vec4(center,1.);p.xy+=position.xy*shape.x;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vShape;uniform float uTime;${noise}
      void main(){vec2 p=vUv;float seed=vShape.y,age=vShape.x;
        float noise=n(p*3.+seed*37.+vec2(0.,-uTime*.35))*.67+n(p*6.1-seed*19.)*.33;
        float edge=1.-smoothstep(.32+noise*.3,.68+noise*.29,length(p));
        float hot=max(0.,1.-age*3.8);float light=clamp(.47-p.y*.25+noise*.35,0.,1.);
        vec3 smoke=mix(vec3(.06,.045,.04),vec3(.29,.24,.20),light);
        vec3 fire=mix(vec3(1.,.16,.008),vec3(1.,.78,.21),noise);
        gl_FragColor=vec4(mix(smoke,fire,hot),edge*(.42+noise*.4)*vShape.z);
        #include <colorspace_fragment>
      }` }));
  const smoke = new THREE.Mesh(puffGeo, puffMat); smoke.name = 'Meteorstab · heißer Rauchschweif'; smoke.frustumCulled = false; root.add(smoke);
  const puffs = Array.from({ length: 96 }, (_, i) => ({ age: 99, life: 1.7, position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 1, seed: random(i, 53.3), depth: 0 }));
  const sorted = [], cameraMatrix = new THREE.Matrix4();
  function upload() {
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i], progress = p.age / p.life;
      p.position.toArray(centers, i * 3); shapes.set([p.size * (.55 + progress * .85), progress, p.seed, (1 - progress) ** 1.1], i * 4);
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
  const transform = new THREE.Object3D(), lastPosition = new THREE.Vector3();
  let puffCursor = 0, emberCursor = 0, emission = 0, flying = false, blast = null, diameter = 0, disposed = false;
  const visible = p => !isVisible || isVisible(p);
  function puff(position, size, vx = 0, vy = .9, vz = 0) {
    const p = puffs[puffCursor++ % puffs.length]; p.age = 0; p.position.copy(position); p.size = size; p.velocity.set(vx, vy, vz);
  }
  function ember(position, vx, vy, vz) {
    const p = embers[emberCursor++ % embers.length]; p.age = 0; p.position.copy(position); p.velocity.set(vx, vy, vz);
  }
  function flight(position, size, age) {
    flying = true; diameter = size; body.position.copy(position); lastPosition.copy(position);
    body.scale.setScalar(size); body.rotation.set(age * .7, age * .9, age * .28); body.visible = visible(position);
  }
  function impact(center) {
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
      transform.position.copy(f.position); transform.rotation.set(f.age * 6, f.age * 8, f.age * 3); transform.scale.setScalar(1);
      transform.updateMatrix(); chips.setMatrixAt(count++, transform.matrix);
    }
    chips.count = count; chips.instanceMatrix.needsUpdate = true;
  }
  function update(dt) {
    if (!(dt > 0) || disposed) return; clock.value += dt;
    if (flying) {
      emission += dt;
      while (emission >= .045) {
        emission -= .045; const i = puffCursor, angle = i * 2.399963;
        puff(lastPosition, diameter * .42, Math.cos(angle) * .45, .55, Math.sin(angle) * .45);
        ember(lastPosition, Math.cos(angle) * 1.1, .8, Math.sin(angle) * 1.1);
      }
    }
    sorted.length = 0;
    for (const p of puffs) {
      if (p.age >= p.life) continue;
      p.age += dt; p.position.addScaledVector(p.velocity, dt);
      if (p.age < p.life && visible(p.position)) sorted.push(p);
    }
    upload();
    let count = 0;
    for (const e of embers) {
      if (e.age >= e.life) continue;
      e.age += dt; e.position.addScaledVector(e.velocity, dt); e.velocity.y -= dt * 3;
      if (e.age < e.life && e.position.y > heightAt(e.position.x, e.position.z) && visible(e.position)) e.position.toArray(sparkPositions, count++ * 3);
    }
    sparkGeo.setDrawRange(0, count); sparkGeo.attributes.position.needsUpdate = true;
    if (blast) {
      blast.age += dt; const t = blast.age, active = visible(blast.center);
      shock.visible = active && t < .75; shock.position.copy(blast.center); shock.position.y += .08;
      shock.scale.setScalar(.1 + .9 * Math.min(1, t / .65)); shock.userData.update(t, Math.max(0, 1 - t / .75));
      flash.visible = active && t < .35; flash.position.copy(blast.center); flash.position.y += .3;
      flash.scale.setScalar(.4 + Math.min(1, t / .2) * rules.radius * .7); flash.scale.y *= .38;
      flashMat.opacity = Math.max(0, 1 - t / .35) * .65;
    }
  }
  function reset() {
    flying = false; blast = null; emission = diameter = 0; clock.value = 0;
    body.visible = shock.visible = flash.visible = false; chips.count = 0;
    for (const p of [...puffs, ...embers]) p.age = 99;
    sorted.length = 0; puffGeo.instanceCount = 0; sparkGeo.setDrawRange(0, 0);
  }
  return { flight, impact, fragments, update, reset,
    get telemetry() { return { bodyVisible: body.visible, model: prototype ? 'uploaded' : 'procedural-prototype', diameter,
      puffs: puffGeo.instanceCount, embers: sparkGeo.drawRange.count, fragments: chips.count,
      shock: shock.visible, flash: flash.visible, draws: (body.visible ? bodyDraws : 0) + Number(puffGeo.instanceCount > 0) + Number(sparkGeo.drawRange.count > 0) + Number(chips.count > 0) + Number(shock.visible) + Number(flash.visible) }; },
    dispose() { if (disposed) return; disposed = true; reset(); root.removeFromParent(); chips.dispose();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); },
  };
}
