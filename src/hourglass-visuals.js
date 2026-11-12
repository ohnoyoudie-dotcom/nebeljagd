import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';

export const HOURGLASS_VISUAL_BUDGET = Object.freeze({ grains: 1200, fragments: 28, draws: 6 });
const COUNT = HOURGLASS_VISUAL_BUDGET.grains;
const TAU = Math.PI * 2;
const random = (i, salt) => { const x = Math.sin((i + 1) * salt) * 43758.5453; return x - Math.floor(x); };
const smooth = x => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const noiseGLSL = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float mist(vec2 p){return noise(p)*.64+noise(p*2.07)*.36;}
`;
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

/** A raised, layered sand sea. Six draws, fixed pools, no lights or full-screen
 * passes. Only the warning marks the exact gameplay boundary. */
export function createHourglassVisuals(scene, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Sanduhrstab · Zeitfeld'; root.visible = false; scene.add(root);
  const boundary = createStaffAimRing(rules.radius, { color: '#ffd176' });
  boundary.geometry.dispose(); boundary.geometry = new THREE.PlaneGeometry(rules.radius * 2.16, rules.radius * 2.16, 16, 16);
  boundary.material.depthTest = true; boundary.position.y = .055; root.add(boundary);
  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uOpen: { value: 0 }, uDissolve: { value: 0 }, uBurst: { value: 0 } };
  const groundGeometry = new THREE.PlaneGeometry(rules.radius * 2.16, rules.radius * 2.16, 16, 16);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true, toneMapped: false, uniforms, vertexShader: vertex,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uOpacity,uOpen,uDissolve,uBurst;${noiseGLSL}
    void main(){vec2 p=(vUv*2.-1.)*1.08;float r=length(p),a=atan(p.y,p.x+.00001);
      vec2 flow=vec2(cos(a-uTime*.62),sin(a-uTime*.62))*r;
      float n=mist(flow*10.+vec2(r*3.,uTime*.16));
      float arms=pow(.5+.5*sin(a*3.-r*9.-uTime*2.1+n*2.6),2.);
      float flecks=pow(noise(flow*90.),5.);
      float edge=1.-smoothstep(.83,1.,r);
      float reveal=1.-smoothstep(uOpen-.06,uOpen+.08,r);
      vec3 deep=vec3(.018,.12,.15),gold=vec3(.85,.38,.065);
      vec3 color=mix(deep,gold,smoothstep(.15,.85,arms*n*1.6));
      color+=vec3(.7,.36,.08)*flecks*arms*2.;
      // Small hourglass glyphs revolve along the seal, without a central clock.
      vec2 glyph=vec2(fract((a-uTime*.12)/6.2831853*20.)-.5,(r-.895)*9.);
      float hourglass=(1.-smoothstep(.025,.065,abs(abs(glyph.x)*.85-abs(glyph.y))))
        *(1.-smoothstep(.23,.30,abs(glyph.y)))*(1.-smoothstep(.29,.35,abs(glyph.x)));
      float rim=exp(-pow((r-.93)/.008,2.))*.45;
      float wave=exp(-pow((r-uOpen*.97)/.045,2.))*uBurst;
      color+=vec3(1.,.65,.22)*(hourglass*.8+rim+wave*1.2);
      float crumble=1.-smoothstep(1.-uDissolve,1.12-uDissolve,n);
      float alpha=(.72*edge+.6*hourglass+rim+wave*.55)*reveal*uOpacity*crumble;
      gl_FragColor=vec4(color,clamp(alpha,0.,.88));
      #include <colorspace_fragment>
    }`,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.name = 'Sanduhrstab · magisches Sandmeer'; root.add(ground);
  const terrain = new Float32Array(17 * 17), lastCenter = new THREE.Vector3(NaN, NaN, NaN);
  function height(x, z) {
    const u = THREE.MathUtils.clamp((x / (rules.radius * 2.16) + .5) * 16, 0, 15.999);
    const v = THREE.MathUtils.clamp((z / (rules.radius * 2.16) + .5) * 16, 0, 15.999);
    const ix = Math.floor(u), iz = Math.floor(v), i = iz * 17 + ix;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(terrain[i], terrain[i + 1], u - ix),
      THREE.MathUtils.lerp(terrain[i + 17], terrain[i + 18], u - ix), v - iz);
  }
  const currents = [];
  for (let layer = 0; layer < 2; layer++) {
    const geometry = new THREE.RingGeometry(.1 * rules.radius, rules.radius, 96, 10); geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      forceSinglePass: true, toneMapped: false,
      uniforms: { ...uniforms, uLayer: { value: layer }, uRadius: { value: rules.radius } },
      vertexShader: `varying vec2 vUv;uniform float uTime,uOpen,uDissolve,uLayer,uRadius;
        void main(){vUv=uv;vec3 p=position;float r=length(p.xz)/uRadius,a=atan(p.z,p.x+.00001);
          float crest=.5+.5*sin(a*3.+r*5.-uTime*1.7+uLayer*2.4);
          float lift=(.12+crest*(.55+uLayer*.55))*sin(clamp(r,0.,1.)*3.14159);
          p.y+=lift*uOpen*(1.-uDissolve);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uTime,uOpacity,uOpen,uDissolve,uLayer;${noiseGLSL}
        void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x+.00001);
          float turn=a-uTime*(.68+uLayer*.16)+uLayer*2.4;
          vec2 flow=vec2(cos(turn),sin(turn))*r;
          float n=mist(flow*12.+vec2(uLayer*5.,r*5.));
          float lane=.58+uLayer*.12+.16*sin(turn*3.+r*2.);
          float band=exp(-pow((r-lane)/(.09+n*.045),2.));
          float stream=pow(.5+.5*sin(turn*3.-r*5.+n*1.8),.7);
          float strands=pow(.5+.5*sin(r*175.+n*13.+turn*5.),9.);
          float clearCenter=smoothstep(.22,.43,r),edge=1.-smoothstep(.85,1.,r);
          float reveal=1.-smoothstep(uOpen-.08,uOpen+.08,r);
          float crumble=1.-smoothstep(1.-uDissolve,1.1-uDissolve,n);
          vec3 gold=mix(vec3(.57,.20,.025),vec3(1.,.72,.26),n);
          vec3 teal=mix(vec3(.025,.29,.28),vec3(.25,.87,.8),n);
          vec3 color=mix(gold,teal,uLayer*.35)+vec3(.55,.32,.10)*strands;
          float alpha=band*stream*(.5+n*.45)*edge*clearCenter*uOpacity*reveal*crumble;
          gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Sanduhrstab · schwebende Sandströmung ${layer + 1}`;
    mesh.frustumCulled = false; root.add(mesh); currents.push(mesh);
  }
  function conform(center) {
    if (lastCenter.equals(center)) return; lastCenter.copy(center);
    const a = groundGeometry.attributes.position;
    for (let i = 0; i < a.count; i++) { terrain[i] = heightAt(center.x + a.getX(i), center.z + a.getZ(i)) - center.y; a.setY(i, terrain[i] + .045); }
    a.needsUpdate = true; groundGeometry.computeBoundingSphere();
    const b = boundary.geometry.attributes.position;
    for (let i = 0; i < b.count; i++) b.setZ(i, heightAt(center.x + b.getX(i), center.z - b.getY(i)) - center.y);
    b.needsUpdate = true; boundary.geometry.computeBoundingSphere();
    for (const mesh of currents) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)) + .06);
      p.needsUpdate = true;
    }
  }
  const positions = new Float32Array(COUNT * 3), seeds = new Float32Array(COUNT), radii = new Float32Array(COUNT), colors = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    seeds[i] = random(i, 127.1); radii[i] = random(i, 311.7);
    new THREE.Color(i % 13 === 0 ? '#6bede0' : i % 7 === 0 ? '#fff0ad' : i % 3 ? '#ffd064' : '#a96620').toArray(colors, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, toneMapped: false,
    uniforms: { uOpacity: uniforms.uOpacity },
    vertexShader: `attribute float seed;varying vec3 vColor;varying float vSeed;
      void main(){vColor=color;vSeed=seed;vec4 p=modelViewMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*p;float size=seed>.95?145.:24.+seed*38.;
        gl_PointSize=clamp(size/max(1.,-p.z),1.1,8.);}`,
    fragmentShader: `varying vec3 vColor;varying float vSeed;uniform float uOpacity;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p);float a=1.-smoothstep(.06,.48,r);
        if(vSeed>.95){float cross=exp(-abs(p.x)*38.)+exp(-abs(p.y)*38.);a=max(a*.5,cross*(1.-smoothstep(.12,.5,r)));}
        gl_FragColor=vec4(vColor*(1.+vSeed*.45),a*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const sand = new THREE.Points(geometry, material); sand.name = 'Sanduhrstab · kreisender Sand'; sand.frustumCulled = false; root.add(sand);
  const shardGeometry = new THREE.OctahedronGeometry(1);
  const shardMaterial = new THREE.MeshStandardMaterial({ color: '#ffc34f', emissive: '#b16b13', emissiveIntensity: .7,
    metalness: .25, roughness: .4, transparent: true, depthWrite: false });
  const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, HOURGLASS_VISUAL_BUDGET.fragments);
  shards.name = 'Sanduhrstab · schwebende Zeitfragmente'; shards.frustumCulled = false;
  shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(shards);
  const dummy = new THREE.Object3D();
  let phase = 'idle', disposed = false;
  function show(center, age, visible) {
    conform(center); root.position.copy(center); root.visible = visible;
    const activeAge = Math.max(0, age - rules.warning), dissolving = Math.max(0, activeAge - rules.duration);
    const dissolve = smooth(dissolving / rules.dissolve), fade = 1 - dissolve;
    const opening = smooth(activeAge / .48), orbitTime = Math.min(activeAge, rules.duration) + rules.dissolve * .25 * dissolve;
    phase = age < rules.warning ? 'warning' : dissolving > 0 ? 'dissolve' : 'active';
    boundary.visible = true; boundary.userData.update(age, fade * (phase === 'warning' ? .65 + .35 * smooth(age / rules.warning) : .9));
    const active = age >= rules.warning && fade > 0;
    ground.visible = sand.visible = shards.visible = active; currents.forEach(mesh => { mesh.visible = active; });
    uniforms.uTime.value = orbitTime; uniforms.uOpen.value = opening; uniforms.uDissolve.value = dissolve;
    uniforms.uOpacity.value = smooth(activeAge / .12) * fade;
    uniforms.uBurst.value = (1 - smooth(activeAge / .8)) * 1.8;
    shardMaterial.opacity = uniforms.uOpacity.value;
    for (let i = 0; i < COUNT; i++) {
      const seed = seeds[i], cluster = i % 7, radiusSeed = radii[i];
      const angle = seed * TAU + orbitTime * (.5 + radiusSeed * .55) + cluster * .43;
      const radius = rules.radius * (.19 + .75 * Math.sqrt(radiusSeed)) * (.3 + .7 * opening);
      const drift = dissolving * (.16 + seed * .45);
      const crest = .5 + .5 * Math.sin(angle * 3 + radiusSeed * 5 - orbitTime * .7);
      const launch = (1 - smooth(activeAge / .85)) * opening * (seed * 1.25);
      const y = .1 + crest * (.25 + radiusSeed * 1.05) + launch;
      positions[i * 3] = Math.cos(angle) * (radius + drift);
      positions[i * 3 + 2] = Math.sin(angle) * (radius + drift);
      positions[i * 3 + 1] = height(positions[i * 3], positions[i * 3 + 2]) + Math.max(.035, y * (1 - dissolve) - dissolving * .15);
    }
    geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < shards.count; i++) {
      const seed = (i * .618033989) % 1, angle = seed * TAU + orbitTime * (.5 + seed * .45);
      const radius = rules.radius * (.55 + .35 * ((i * .75487766) % 1)) * (.4 + .6 * opening) + dissolving * .2;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      dummy.position.set(x, height(x, z) + .08 + (.35 + .7 * seed + .18 * Math.sin(angle * 3)) * opening * fade, z);
      dummy.rotation.set(angle * 1.3, angle, seed * TAU + orbitTime);
      const size = (.045 + seed * .05) * opening * fade; dummy.scale.set(size, size * (1.6 + seed), size * .7);
      dummy.updateMatrix(); shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
  }
  return { show, hide() { root.visible = false; phase = 'idle'; },
    get telemetry() { const active = root.visible && sand.visible; return { visible: root.visible, phase,
      particles: active ? COUNT : 0, fragments: active ? shards.count : 0, currents: active ? currents.length : 0,
      opening: uniforms.uOpen.value, opacity: root.visible ? uniforms.uOpacity.value : 0,
      draws: root.visible ? 1 + 5 * Number(sand.visible) : 0 }; },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      for (const mesh of [boundary, ground, ...currents, sand, shards]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
}
