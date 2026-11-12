import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';

const COUNT = 360;
const smooth = x => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Shared sandy warning, orbiting sand lanes and a settling, dissolving finish.
 * Three field draws, fixed buffers, no lights, textures or postprocessing. */
export function createHourglassVisuals(scene, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Sanduhrstab · Zeitfeld'; root.visible = false; scene.add(root);
  const boundary = createStaffAimRing(rules.radius, { color: '#ffd176' });
  boundary.geometry.dispose(); boundary.geometry = new THREE.PlaneGeometry(rules.radius * 2.16, rules.radius * 2.16, 16, 16);
  boundary.material.depthTest = true; boundary.position.y = .055; root.add(boundary);
  const groundGeometry = new THREE.PlaneGeometry(rules.radius * 2.12, rules.radius * 2.12, 16, 16);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true, toneMapped: false, uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uOpacity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=(vUv*2.-1.)*1.06;float r=length(p),a=atan(p.y,p.x+.00001);
        float bands=0.;
        for(int i=0;i<4;i++){float lane=float(i);float t=a-uTime*(.65+lane*.13);
          float radius=.32+lane*.18+.035*sin(t*3.+lane);
          float ribbon=exp(-pow((r-radius)/.045,2.));
          float stream=pow(.5+.5*sin(t*3.+r*5.+lane*2.),2.);
          bands+=ribbon*stream;}
        float grain=noise(p*72.+vec2(sin(uTime*.4),cos(uTime*.4)));
        float alpha=bands*(.24+grain*.25)*uOpacity*(1.-smoothstep(.9,1.,r));
        gl_FragColor=vec4(mix(vec3(.48,.26,.06),vec3(.95,.65,.22),grain),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const veil = new THREE.Mesh(groundGeometry, groundMaterial); veil.name = 'Sanduhrstab · kreisende Sandbahnen'; root.add(veil);
  const terrain = new Float32Array(17 * 17), lastCenter = new THREE.Vector3(NaN, NaN, NaN);
  function conform(center) {
    if (lastCenter.equals(center)) return; lastCenter.copy(center);
    const a = groundGeometry.attributes.position;
    for (let i = 0; i < a.count; i++) { terrain[i] = heightAt(center.x + a.getX(i), center.z + a.getZ(i)) - center.y; a.setY(i, terrain[i] + .035); }
    a.needsUpdate = true; groundGeometry.computeBoundingSphere();
    const b = boundary.geometry.attributes.position;
    for (let i = 0; i < b.count; i++) b.setZ(i, heightAt(center.x + b.getX(i), center.z - b.getY(i)) - center.y);
    b.needsUpdate = true; boundary.geometry.computeBoundingSphere();
  }
  function height(x, z) {
    const u = THREE.MathUtils.clamp((x / (rules.radius * 2.12) + .5) * 16, 0, 15.999);
    const v = THREE.MathUtils.clamp((z / (rules.radius * 2.12) + .5) * 16, 0, 15.999);
    const ix = Math.floor(u), iz = Math.floor(v), i = iz * 17 + ix;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(terrain[i], terrain[i + 1], u - ix),
      THREE.MathUtils.lerp(terrain[i + 17], terrain[i + 18], u - ix), v - iz);
  }
  const positions = new Float32Array(COUNT * 3), seeds = new Float32Array(COUNT), colors = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    seeds[i] = (i * .61803398875) % 1;
    new THREE.Color(i % 9 === 0 ? '#fff0bd' : i % 5 ? '#eeb754' : '#b57a34').toArray(colors, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, toneMapped: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `attribute float seed;varying vec3 vColor;varying float vSeed;
      void main(){vColor=color;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*p;gl_PointSize=clamp((55.+seed*65.)/max(1.,-p.z),1.4,6.);}`,
    fragmentShader: `varying vec3 vColor;varying float vSeed;uniform float uOpacity;
      void main(){float r=length(gl_PointCoord-.5);float a=(1.-smoothstep(.12,.5,r))*uOpacity;
        gl_FragColor=vec4(vColor*(1.+vSeed*.3),a);
        #include <colorspace_fragment>
      }`,
  });
  const sand = new THREE.Points(geometry, material); sand.name = 'Sanduhrstab · kreisender Sand'; sand.frustumCulled = false; root.add(sand);
  let phase = 'idle', disposed = false;
  function show(center, age, visible) {
    conform(center);
    root.position.copy(center); root.visible = visible;
    const activeAge = Math.max(0, age - rules.warning);
    const dissolving = Math.max(0, activeAge - rules.duration);
    const fade = 1 - smooth(dissolving / rules.dissolve);
    phase = age < rules.warning ? 'warning' : dissolving > 0 ? 'dissolve' : 'active';
    boundary.visible = true; boundary.userData.update(age, fade * (phase === 'warning' ? .65 + .35 * smooth(age / rules.warning) : .65));
    sand.visible = age >= rules.warning;
    veil.visible = sand.visible;
    material.uniforms.uOpacity.value = smooth(activeAge / .25) * fade * .95;
    const orbitTime = Math.min(activeAge, rules.duration) + rules.dissolve * .18 * smooth(dissolving / rules.dissolve);
    groundMaterial.uniforms.uTime.value = orbitTime; groundMaterial.uniforms.uOpacity.value = material.uniforms.uOpacity.value;
    for (let i = 0; i < COUNT; i++) {
      const seed = seeds[i], lane = i % 5, angle = seed * Math.PI * 2 + orbitTime * (.65 + lane * .13);
      // Circular lanes with small waves; no inward motion or gravitational pull.
      const radius = rules.radius * (.30 + lane * .13 + .055 * Math.sin(seed * 31 + orbitTime * .6));
      const drift = dissolving * (.12 + seed * .2);
      const y = .12 + (.18 + lane * .09) * (.5 + .5 * Math.sin(angle * 2 + lane));
      positions[i * 3] = Math.cos(angle) * (radius + drift);
      positions[i * 3 + 1] = Math.max(.035, y - dissolving * (.4 + seed * .35));
      positions[i * 3 + 2] = Math.sin(angle) * (radius + drift);
      positions[i * 3 + 1] += height(positions[i * 3], positions[i * 3 + 2]);
    }
    geometry.attributes.position.needsUpdate = true;
  }
  return { show, hide() { root.visible = false; phase = 'idle'; },
    get telemetry() { return { visible: root.visible, phase, particles: root.visible && sand.visible ? COUNT : 0,
      opacity: root.visible ? material.uniforms.uOpacity.value : 0, draws: root.visible ? 1 + 2 * Number(sand.visible) : 0 }; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); groundGeometry.dispose(); groundMaterial.dispose(); boundary.geometry.dispose(); boundary.material.dispose(); },
  };
}
