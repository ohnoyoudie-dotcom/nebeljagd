import * as THREE from 'three';

const VOLUME_STEPS = 16;
const TRAIL_SAMPLES = 14;
const PROJECTILE_SCALE = 1.5;
const noiseGLSL = `
  float hash3(vec3 p) {
    p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x),
      mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x),
      mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/** One bounded, depth-tested volume per cloud. No sphere sprites, lights,
 * framebuffer copies, external textures or full-screen pass. Works with both
 * the game's orthographic camera and a perspective asset preview. */
function cloudMaterial(seed) {
  return new THREE.ShaderMaterial({
    // Depth-test the entry face: testing the exit face clips half the volume
    // against the terrain beneath it. Foreground solids still occlude the fog.
    name: 'Gift · verwirbeltes Rauchvolumen', side: THREE.FrontSide,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { uAge: { value: 0 }, uFade: { value: 0 }, uSeed: { value: seed },
      uEye: { value: new THREE.Vector3() }, uDirection: { value: new THREE.Vector3() }, uOrtho: { value: 1 } },
    vertexShader: `varying vec3 vLocal; void main() {
      vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
    fragmentShader: `
      varying vec3 vLocal;
      uniform vec3 uEye, uDirection;
      uniform float uAge, uFade, uSeed, uOrtho;
      ${noiseGLSL}
      float density(vec3 p) {
        float burst = 1.0 - pow(1.0 - clamp(uAge / .16, 0.0, 1.0), 3.0);
        float spread = .22 + .78 * burst;
        p.xz /= spread;
        float height = p.y * .5 + .5;
        vec3 q = p * vec3(2.5, 2.2, 2.5) + vec3(uSeed, -uAge * .55, uSeed * .7);
        q.xz += vec2(sin(q.z * 1.7 + uAge), cos(q.x * 1.4 - uAge)) * .38;
        q.x += uAge * .21;
        float broad = noise3(q);
        float detail = noise3(q * 2.07 + 13.2);
        float wisps = noise3(q * 4.13 + 27.4);
        float field = broad * .58 + detail * .28 + wisps * .14;
        vec2 drift = vec2(sin(p.z * 3.0 + uAge * .7), cos(p.x * 3.0 - uAge * .6)) * .10;
        float radial = length(p.xz + drift);
        float edge = 1.0 - smoothstep(.54 + field * .22, 1.0, radial);
        // The unwarped envelope reaches zero before the proxy box on every side.
        // Noise/drift must never expose a straight clipping face.
        edge *= 1.0 - smoothstep(.78, 1.0, length(p.xz));
        float rising = smoothstep(.0, .12, height) * (1.0 - smoothstep(.25 + field * .45, .96, height));
        return edge * rising * smoothstep(.26, .70, field + .16 * (1.0 - radial));
      }
      void main() {
        vec3 origin = uOrtho > .5 ? vLocal - uDirection * 5.0 : uEye;
        vec3 ray = uOrtho > .5 ? uDirection : normalize(vLocal - origin);
        vec3 inv = 1.0 / (sign(ray + .000001) * max(abs(ray), vec3(.00001)));
        vec3 a = (-1.15 - origin) * inv, b = (1.15 - origin) * inv;
        vec3 nearPlane = min(a,b), farPlane = max(a,b);
        float nearT = max(0.0, max(max(nearPlane.x,nearPlane.y),nearPlane.z));
        float farT = min(min(farPlane.x,farPlane.y),farPlane.z);
        if (farT <= nearT) discard;
        float stepLength = (farT - nearT) / ${VOLUME_STEPS}.0;
        // Spatial dither removes stacked-slice bands without flickering in time.
        float jitter = hash3(floor(vLocal * 240.0)) * .55 + .225;
        vec3 color = vec3(0.0); float opacity = 0.0;
        for (int i = 0; i < ${VOLUME_STEPS}; i++) {
          vec3 p = origin + ray * (nearT + (float(i) + jitter) * stepLength);
          float d = density(p);
          float alpha = (1.0 - exp(-d * stepLength * 4.6)) * uFade;
          float light = clamp(.45 + p.y * .26 - d * .28, .0, 1.0);
          vec3 smoke = mix(vec3(.045,.105,.023), vec3(.36,.49,.12), light);
          color += (1.0 - opacity) * alpha * smoke;
          opacity += (1.0 - opacity) * alpha;
        }
        if (opacity < .006) discard;
        gl_FragColor = vec4(color / max(opacity, .001), opacity);
        #include <colorspace_fragment>
      }`,
  });
}

function trailMaterial(clock) {
  return new THREE.ShaderMaterial({
    name: 'Gift · faseriger Schweif', transparent: true, depthWrite: false,
    depthTest: true, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uTime: clock },
    vertexShader: `varying vec2 vUv; void main() { vUv=uv;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime; ${noiseGLSL}
      void main() {
        float n=noise3(vec3(vUv.x*5.0,vUv.y*9.0-uTime*3.0,uTime*.4));
        float edge=abs(vUv.x*2.0-1.0 + sin(vUv.y*13.0+uTime*5.0)*.18);
        float alpha=(1.0-smoothstep(.12+n*.32,.95,edge))*smoothstep(.0,.25,vUv.y)*(.3+n*.4);
        gl_FragColor=vec4(mix(vec3(.045,.16,.028),vec3(.40,.62,.12),n),alpha);
        #include <colorspace_fragment>
      }`,
  });
}

// A hooked, tapered venom thorn, along +Z. The model's uneven ridges and long
// silhouette remain legible at the ordinary game camera, without a round core.
function thornGeometry() {
  const positions = [], indices = [], rings = 18, sides = 7;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings, r = Math.pow(Math.sin(Math.PI * t), .9) * (.035 + t * .14);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2 + t * 5;
      const ridge = side % 2 ? .75 : 1;
      positions.push(Math.cos(angle)*r*ridge + Math.sin(t*5)*.035,
        Math.sin(angle)*r*ridge + Math.sin(t*4)*.025, t*.96-.62);
      if (ring < rings && side < sides) {
        const a = ring*(sides+1)+side, b=a+sides+1;
        indices.push(a,a+1,b,b,a+1,b+1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Simulation owns lifetime/damage. This renderer owns and releases only VFX. */
export function createPoisonVisuals(scene, radius, canSee = () => true) {
  const clock = { value: 0 }, clouds = new Set(), projectiles = new Set();
  const box = new THREE.BoxGeometry(2.3,2.3,2.3), thorn = thornGeometry();
  const venom = new THREE.MeshStandardMaterial({ name: 'Gift · Jadekern', color: '#91bd45',
    emissive: '#315419', emissiveIntensity: .65, metalness: .2, roughness: .32 });
  const trail = trailMaterial(clock), axis = new THREE.Vector3(0,0,1);
  const direction = new THREE.Vector3(), cameraWorld = new THREE.Vector3(), inverse = new THREE.Matrix4();
  let serial = 0, disposed = false;
  function createProjectile(origin) {
    const group = new THREE.Group(); group.name = 'Giftstab · Venomstachel'; group.position.copy(origin);
    const core = new THREE.Mesh(thorn,venom); core.scale.setScalar(PROJECTILE_SCALE); group.add(core); scene.add(group);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(TRAIL_SAMPLES*4*3),3).setUsage(THREE.DynamicDrawUsage));
    const uv = [], indices = [];
    for(let i=0;i<TRAIL_SAMPLES;i++) {
      for(let plane=0;plane<2;plane++) uv.push(0,1-i/(TRAIL_SAMPLES-1),1,1-i/(TRAIL_SAMPLES-1));
      if(i) for(let plane=0;plane<2;plane++) {const a=(i-1)*4+plane*2,b=i*4+plane*2;indices.push(a,b,a+1,a+1,b,b+1);}
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geometry.setIndex(indices); geometry.setDrawRange(0,0);
    const ribbon = new THREE.Mesh(geometry,trail); ribbon.name='Giftstab · Rauchspur'; ribbon.frustumCulled=false;
    scene.add(ribbon);
    const visual={ group, core, ribbon, history:[origin.clone()], geometry };
    projectiles.add(visual); return visual;
  }
  function moveProjectile(visual, start, end, age) {
    visual.group.position.copy(end); visual.group.visible=canSee(end);
    direction.copy(end).sub(start);
    if(direction.lengthSq()>1e-10) visual.group.quaternion.setFromUnitVectors(axis,direction.normalize());
    visual.core.rotation.z=age*8;
    if(visual.history[0].distanceToSquared(end)>.035) {
      const sample=visual.history.length===TRAIL_SAMPLES ? visual.history.pop() : new THREE.Vector3();
      sample.copy(end); visual.history.unshift(sample);
    }
    const positions=visual.geometry.attributes.position;
    for(let i=0;i<visual.history.length;i++) {
      const p=visual.history[i], width=PROJECTILE_SCALE*(.05+.15*i/(TRAIL_SAMPLES-1))*(1-i/TRAIL_SAMPLES);
      // Collapse unseen portions instead of allowing trails through fog/walls.
      const w=canSee(p) ? width : 0;
      positions.setXYZ(i*4,p.x-w,p.y,p.z); positions.setXYZ(i*4+1,p.x+w,p.y,p.z);
      positions.setXYZ(i*4+2,p.x,p.y-w,p.z); positions.setXYZ(i*4+3,p.x,p.y+w,p.z);
    }
    positions.needsUpdate=true;
    visual.geometry.setDrawRange(0,Math.max(0,visual.history.length-1)*12);
    visual.ribbon.visible=visual.group.visible;
  }
  function createCloud(parent) {
    const material=cloudMaterial(++serial*3.71), mesh=new THREE.Mesh(box,material);
    mesh.name='Giftwolke · turbulentes Volumen'; mesh.scale.set(radius,.95,radius); mesh.position.y=1;
    mesh.onBeforeRender=(_renderer,_scene,camera) => {
      inverse.copy(mesh.matrixWorld).invert();
      camera.getWorldPosition(cameraWorld); material.uniforms.uEye.value.copy(cameraWorld).applyMatrix4(inverse);
      camera.getWorldDirection(material.uniforms.uDirection.value).transformDirection(inverse);
      material.uniforms.uOrtho.value=camera.isOrthographicCamera?1:0;
    };
    parent.add(mesh); clouds.add(mesh); return mesh;
  }
  function updateCloud(mesh, age, remaining) {
    mesh.material.uniforms.uAge.value=age;
    mesh.material.uniforms.uFade.value=(.12 + .88 * THREE.MathUtils.smoothstep(age,0,.045))*THREE.MathUtils.smoothstep(remaining,0,.65);
  }
  function removeProjectile(visual) {
    if(!projectiles.delete(visual)) return;
    visual.group.removeFromParent(); visual.ribbon.removeFromParent(); visual.geometry.dispose();
  }
  function removeCloud(mesh) {
    if(!clouds.delete(mesh)) return;
    mesh.removeFromParent(); mesh.material.dispose();
  }
  return { createProjectile, moveProjectile, createCloud, updateCloud, removeProjectile, removeCloud,
    update(dt) { if(dt>0) clock.value+=dt; },
    get telemetry() {return { activeClouds:clouds.size, cloudDraws:clouds.size,
      activeProjectiles:projectiles.size, projectileScale:PROJECTILE_SCALE, volumeSteps:VOLUME_STEPS, trailSamples:TRAIL_SAMPLES };},
    dispose() { if(disposed)return; disposed=true;
      for(const v of projectiles)removeProjectile(v); for(const mesh of clouds)removeCloud(mesh);
      box.dispose(); thorn.dispose(); venom.dispose(); trail.dispose();
    },
  };
}
