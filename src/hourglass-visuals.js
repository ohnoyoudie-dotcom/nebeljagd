import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';

export const HOURGLASS_VISUAL_BUDGET = Object.freeze({ grains: 7200, puffs: 64, draws: 6 });
const TAU = Math.PI * 2;
const smooth = x => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const random = (i, salt) => { const v = Math.sin((i + 1) * salt) * 43758.5453; return v - Math.floor(v); };
// One prevailing flow, with stable individual speeds and gentle gusts. Using an
// angle derived from simulation time avoids per-frame randomness and pause jumps.
const flowSpeed = radius => .9 + .12 * (1 - radius);
const orbit = (time, radius, seed) => time * 2.15 * flowSpeed(radius) * (.82 + .36 * seed)
  + .16 * Math.sin(time * 1.4 + seed * TAU);
const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float dust(vec2 p){return noise(p)*.57+noise(p*2.03)*.29+noise(p*4.11)*.14;}
`;
const sandField = `${noise}
vec2 sandFlow(vec3 p){
  float r=clamp(length(p.xz)/uRadius,0.,1.);
  float a=-uTime*2.15*(.9+.12*(1.-r));
  vec2 q=vec2(cos(a)*p.x-sin(a)*p.z,sin(a)*p.x+cos(a)*p.z);
  q+=.18*vec2(sin(q.y*2.4+p.y-uTime*.7),sin(q.x*2.1-p.y+uTime*.6));
  return q;
}
float sandDensity(vec3 p){return dust(sandFlow(p)*2.2+vec2(p.y*.55,-p.y*.4+uTime*.12));}
vec3 sandColor(float n){return mix(vec3(.29,.15,.05),vec3(.78,.55,.28),.28+n*.64);}
`;

/** Rising sand gusts over a moving, terrain-conforming sand bed. Six field draws,
 * no lights/postprocessing/textures. All animation uses simulation time. */
export function createHourglassVisuals(scene, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Sanduhrstab · Zeitfeld'; root.visible = false; scene.add(root);
  const boundary = createStaffAimRing(rules.radius, { color: '#d9b16c' });
  boundary.geometry.dispose(); boundary.geometry = new THREE.PlaneGeometry(rules.radius * 2.16, rules.radius * 2.16, 16, 16);
  boundary.material.depthTest = true; boundary.position.y = .055; root.add(boundary);
  const uniforms = { uTime: { value: 0 }, uOpacity: { value: 0 }, uRadius: { value: rules.radius },
    uOpening: { value: 0 }, uDissolve: { value: 0 } };
  // Close the gaps beneath the airborne dust with one terrain-following draw.
  // The opaque-looking interior hides the ground, while a frayed edge and
  // advected ripples connect it to the billows instead of outlining a flat disc.
  const bedMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true, uniforms,
    vertexShader: 'varying vec3 vField;void main(){vField=vec3(position.x,position.z,-position.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vField;uniform float uTime,uOpacity,uRadius,uOpening,uDissolve;${sandField}
      void main(){
        float r=length(vField.xz)/(uRadius*(.4+.6*uOpening));
        if(r>=1.)discard;
        vec2 q=sandFlow(vField);float n=sandDensity(vField);
        float fray=noise(q*3.1+uTime*.16);
        float edge=1.-smoothstep(.82+fray*.07,.99,r);
        float ripple=sin(q.x*11.+q.y*4.+n*8.+uTime*.4)*.5+.5;
        vec3 color=sandColor(n)*(.88+.16*ripple);
        float erosion=1.-smoothstep(.30+n*.35,.68+n*.35,uDissolve);
        gl_FragColor=vec4(color,(.97+.025*n)*edge*erosion*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const bed = new THREE.Mesh(boundary.geometry.clone(), bedMaterial);
  bed.name = 'Sanduhrstab · bodennaher Sand'; bed.rotation.x = -Math.PI / 2;
  bed.position.y = .075; bed.renderOrder = -1; root.add(bed);
  const terrain = new Float32Array(17 * 17), lastCenter = new THREE.Vector3(NaN, NaN, NaN);
  function conform(center) {
    if (lastCenter.equals(center)) return; lastCenter.copy(center);
    const b = boundary.geometry.attributes.position, floor = bed.geometry.attributes.position;
    for (let i = 0; i < b.count; i++) {
      const y = heightAt(center.x + b.getX(i), center.z - b.getY(i)) - center.y;
      terrain[i] = y; b.setZ(i, y); floor.setZ(i, y);
    }
    b.needsUpdate = floor.needsUpdate = true;
    boundary.geometry.computeBoundingSphere(); bed.geometry.computeBoundingSphere();
  }
  function height(x, z) {
    const u = THREE.MathUtils.clamp((x / (rules.radius * 2.16) + .5) * 16, 0, 15.999);
    const v = THREE.MathUtils.clamp((z / (rules.radius * 2.16) + .5) * 16, 0, 15.999);
    const ix = Math.floor(u), iz = Math.floor(v), i = iz * 17 + ix;
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(terrain[i], terrain[i + 1], u - ix),
      THREE.MathUtils.lerp(terrain[i + 17], terrain[i + 18], u - ix), v - iz);
  }
  const currents = [], SEGMENTS = 112;
  for (let layer = 0; layer < 2; layer++) {
    const geometry = new THREE.BufferGeometry(), positions = new Float32Array((SEGMENTS + 1) * 6), uv = new Float32Array((SEGMENTS + 1) * 4), index = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      uv.set([i / SEGMENTS, 0, i / SEGMENTS, 1], i * 4);
      if (i < SEGMENTS) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    geometry.setIndex(index); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      forceSinglePass: true, toneMapped: false, uniforms,
      vertexShader: 'varying vec2 vUv;varying vec3 vField;void main(){vUv=uv;vField=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;varying vec3 vField;uniform float uTime,uOpacity,uRadius;${sandField}
        void main(){float n=sandDensity(vField);
          float feather=pow(max(0.,sin(vUv.y*3.14159265)),2.);
          float ends=smoothstep(0.,.18,vUv.x)*(1.-smoothstep(.68,1.,vUv.x));
          float breakup=smoothstep(.25,.7,noise(vec2(vUv.x*11.-uTime*.35,vUv.y*2.)));
          float density=smoothstep(.28,.72,n)*feather*ends*(.25+.75*breakup);
          gl_FragColor=vec4(sandColor(n),density*.38*uOpacity);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `Sanduhrstab · Sandböe ${layer + 1}`; mesh.frustumCulled = false;
    root.add(mesh); currents.push(mesh);
  }
  // A single instanced billboard draw. Use the latest rendered camera to sort
  // billows for the next attribute upload; irregular lobes hide sprite edges.
  const puffGeometry = new THREE.InstancedBufferGeometry();
  puffGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  puffGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0, 1,-1,0, 1,1,0, -1,1,0], 3));
  const puffCenters = new Float32Array(64 * 3), puffParams = new Float32Array(64 * 4);
  puffGeometry.setAttribute('center', new THREE.InstancedBufferAttribute(puffCenters, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.setAttribute('shape', new THREE.InstancedBufferAttribute(puffParams, 4).setUsage(THREE.DynamicDrawUsage));
  puffGeometry.instanceCount = HOURGLASS_VISUAL_BUDGET.puffs;
  const puffMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms, vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec3 vField;varying float vSeed,vAlpha;
      void main(){vUv=position.xy;vSeed=shape.z;vAlpha=shape.w;
        vec4 p=modelViewMatrix*vec4(center,1.);float a=shape.z*6.2831853;
        vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*position.xy;
        vec3 offset=vec3(q*shape.xy,0.);
        vField=center+vec3(dot(modelViewMatrix[0].xyz,offset),dot(modelViewMatrix[1].xyz,offset),dot(modelViewMatrix[2].xyz,offset));
        p.xy+=offset.xy;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vField;varying float vSeed,vAlpha;uniform float uTime,uOpacity,uRadius;${sandField}
      void main(){vec2 p=vUv;float n=sandDensity(vField);
        float radius=length(p*vec2(1.,1.08));
        float edge=1.-smoothstep(.36+n*.30,.73+n*.25,radius);
        float body=smoothstep(.16,.70,n);
        gl_FragColor=vec4(sandColor(n),edge*(.36+body*.60)*vAlpha*uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const puffs = new THREE.Mesh(puffGeometry, puffMaterial); puffs.name = 'Sanduhrstab · aufgewirbelter Staub'; puffs.frustumCulled = false; root.add(puffs);
  const billows = Array.from({ length: 64 }, (_, i) => ({ i, x: 0, y: 0, z: 0, width: 0, height: 0, alpha: 0, depth: 0, seed: random(i, 127.1) }));
  const sorted = [...billows], cameraMatrix = new THREE.Matrix4();
  function uploadBillows() {
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i], p = i * 3, s = i * 4;
      puffCenters[p] = b.x; puffCenters[p + 1] = b.y; puffCenters[p + 2] = b.z;
      puffParams[s] = b.width; puffParams[s + 1] = b.height; puffParams[s + 2] = b.seed; puffParams[s + 3] = b.alpha;
    }
    puffGeometry.attributes.center.needsUpdate = puffGeometry.attributes.shape.needsUpdate = true;
  }
  puffs.onBeforeRender = (_renderer, _scene, camera) => {
    cameraMatrix.multiplyMatrices(camera.matrixWorldInverse, puffs.matrixWorld); const e = cameraMatrix.elements;
    for (const b of billows) b.depth = e[2]*b.x+e[6]*b.y+e[10]*b.z+e[14];
    sorted.sort((a,b)=>a.depth-b.depth); uploadBillows();
  };
  const count = HOURGLASS_VISUAL_BUDGET.grains, positions = new Float32Array(count*3), colors = new Float32Array(count*3), seeds = new Float32Array(count), grainProgress = new Float32Array(count), grainHeights = new Float32Array(count);
  const sandColors = ['#ad8349','#c4a16b','#d6b67d','#e3c594'];
  for (let i=0;i<count;i++) { seeds[i]=random(i,311.7); grainProgress[i]=random(i,77.3); grainHeights[i]=random(i,193.9); new THREE.Color(sandColors[i%4]).toArray(colors,i*3); }
  const grainGeometry = new THREE.BufferGeometry(); grainGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  grainGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3)); grainGeometry.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const grainMaterial = new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,toneMapped:false,uniforms,
    vertexShader:`attribute float seed;varying vec3 vColor;varying vec2 vFlow;varying float vStreak,vShade;
      uniform float uTime;
      void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);
        vec2 flow=(modelViewMatrix*vec4(-position.z,.25,position.x,0.)).xy;
        vFlow=flow/max(length(flow),.001);vStreak=step(.78,seed);
        vShade=.65+.25*sin(seed*29.+uTime*(1.+seed));
        gl_Position=projectionMatrix*p;
        gl_PointSize=mix(clamp((24.+seed*25.)/max(1.,-p.z),1.15,2.6),clamp(90./max(1.,-p.z),2.4,5.),vStreak);
      }`,
    fragmentShader:`varying vec3 vColor;varying vec2 vFlow;varying float vStreak,vShade;uniform float uOpacity;
      void main(){vec2 q=gl_PointCoord-.5;
        vec2 axis=vec2(vFlow.x,-vFlow.y);
        vec2 p=vec2(dot(q,axis),dot(q,vec2(-axis.y,axis.x)));
        p.y*=mix(1.,3.3,vStreak);
        float a=1.-smoothstep(.12,.48,length(p));
        gl_FragColor=vec4(vColor,a*uOpacity*vShade);
        #include <colorspace_fragment>
      }`,
  });
  const grains = new THREE.Points(grainGeometry,grainMaterial); grains.name='Sanduhrstab · kreisender Sand'; grains.frustumCulled=false;root.add(grains);
  const activeMeshes = [bed, ...currents, puffs, grains];
  let phase='idle',opening=0,disposed=false;
  function show(center,age,visible) {
    conform(center); root.position.copy(center); root.visible=visible;
    const activeAge=Math.max(0,age-rules.warning),dissolving=Math.max(0,activeAge-rules.duration);
    const dissolve=smooth(dissolving/rules.dissolve),fade=1-dissolve;
    // Integral of 1-smoothstep: rotation slows down without reversing as dust settles.
    const settle = THREE.MathUtils.clamp(dissolving / rules.dissolve, 0, 1);
    opening=smooth(activeAge/.42);const time=Math.min(activeAge,rules.duration)+rules.dissolve*.25*(settle-settle**3+.5*settle**4);
    phase=age<rules.warning?'warning':dissolving>0?'dissolve':'active';
    boundary.visible=true; boundary.userData.update(age,phase==='warning'?.7+.3*smooth(age/rules.warning):fade*(.08+.62*(1-opening)));
    const active=age>=rules.warning&&fade>0; for(const mesh of activeMeshes)mesh.visible=active;
    uniforms.uTime.value=time;uniforms.uOpacity.value=smooth(activeAge/.12)*fade;
    uniforms.uOpening.value=opening;uniforms.uDissolve.value=dissolve;
    for(let layer=0;layer<2;layer++) {
      const a=currents[layer].geometry.attributes.position;
      for(let i=0;i<=SEGMENTS;i++) {
        const t=i/SEGMENTS,seed=.25+layer*.5+.18*Math.sin(t*TAU*1.2+layer*2);
        const angle=orbit(time,.95-.92*t,seed)+layer*Math.PI+t*TAU*1.8;
        const swell=Math.sin(t*17-time*1.3)*.09;
        const radius=(rules.radius*(.95-.92*t)+swell)*(.4+.6*opening),y=(.18+t*2.25+Math.sin(t*13+time)*.07)*opening*fade;
        const width=(1.1+.5*Math.sin(t*Math.PI))*fade;
        for(let side=0;side<2;side++) {
          const offset=(side-.5)*width,x=Math.cos(angle)*(radius+offset*.62),z=Math.sin(angle)*(radius+offset*.62);
          a.setXYZ(i*2+side,x,height(x,z)+Math.max(.035,y+offset*.78),z);
        }
      }a.needsUpdate=true;
    }
    for(const b of billows) {
      const t=Math.sqrt((b.i+.5)/billows.length),angle=orbit(time,.93*t,b.seed)+b.i*2.3999632297;
      const drift=.05*Math.sin(time*1.7+b.seed*TAU)*Math.sin(t*Math.PI);
      const radius=(rules.radius*(.93*t+drift))*(.4+.6*opening)+dissolving*.25;
      b.x=Math.cos(angle)*radius;b.z=Math.sin(angle)*radius;
      b.y=height(b.x,b.z)+.08+Math.max(.04,.25+b.seed*1.65+.27*Math.sin(time*2+b.seed*TAU))*opening*fade;
      b.width=(1.05+.4*b.seed)*(.45+.55*opening)*(1+dissolve*.3)*(1+.14*Math.sin(time*1.6+b.seed*TAU));
      // Denser overlapping dust near the floor; upper billows leave silhouettes readable.
      b.height=b.width*(.45+.3*b.seed);b.alpha=.72-.18*b.seed;
    }uploadBillows();
    for(let i=0;i<count;i++) {
      const seed=seeds[i],t=grainProgress[i],radial=.98*Math.sqrt((i+.5)/count);
      const envelope=Math.sin(radial*Math.PI),phase=seed*TAU;
      // Small eddies wander through the full disc instead of fixed circular tracks.
      // Taper at the rim keeps the visible storm inside the gameplay footprint.
      const drift=envelope*(.045*Math.sin(time*2.7+phase+t*12)+.018*Math.sin(time*4.3+t*TAU));
      const angle=orbit(time,radial,seed)+t*TAU+.065*envelope*Math.sin(time*3.1+t*TAU);
      const radius=rules.radius*(radial+drift)*(.4+.6*opening)+dissolving*.3;
      const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
      positions[i*3]=x;positions[i*3+2]=z;
      const lift=Math.max(.035,.18+grainHeights[i]*1.85+.25*Math.sin(time*(1.7+seed)+phase)+.1*Math.sin(time*3.4+t*TAU));
      positions[i*3+1]=height(x,z)+.04+lift*opening*fade;
    }grainGeometry.attributes.position.needsUpdate=true;
  }
  return {show,hide(){root.visible=false;phase='idle';},
    get telemetry(){const active=root.visible&&grains.visible;return {visible:root.visible,phase,particles:active?count:0,puffs:active?billows.length:0,
      currents:active?2:0,ground:active,opening,opacity:root.visible?uniforms.uOpacity.value:0,draws:root.visible?1+5*Number(grains.visible):0};},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();puffs.onBeforeRender=()=>{};
      for(const mesh of [boundary,...activeMeshes]){mesh.geometry.dispose();mesh.material.dispose();}}
  };
}
