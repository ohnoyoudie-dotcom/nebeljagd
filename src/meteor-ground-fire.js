import * as THREE from 'three';

export const METEOR_GROUND_FLAMES = 48;
const seed = i => { const n = Math.sin(i * 127.1 + 1.7) * 43758.5453; return n - Math.floor(n); };
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
  float fbm(vec2 p){return noise(p)*.57+noise(p*2.07+13.8)*.29+noise(p*4.13-7.1)*.14;}`;

/** Terrain-following scorch and pooled, ground-anchored flame sheets. Their
 * curling tongues advect upward independently; the spell owns damage/time. */
export function createMeteorGroundFire(parent, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Meteorstab · brennende Einschlagsfläche'; root.visible = false; parent.add(root);
  const groundGeometry = new THREE.PlaneGeometry(rules.radius * 2, rules.radius * 2, 20, 20);
  groundGeometry.rotateX(-Math.PI / 2);
  const time = { value: 0 }, fade = { value: 0 };
  const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: time, uFade: fade },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uFade;${noise}
      void main(){float n=fbm(vUv*12.);float edge=1.-smoothstep(.7+n*.16,1.,length(vUv));
        float coal=smoothstep(.69,.86,n)*(.7+.3*sin(uTime*4.+n*31.));
        vec3 color=mix(vec3(.034,.024,.018),vec3(.55,.075,.003),coal);
        gl_FragColor=vec4(color,edge*uFade*(.37+coal*.15));
        #include <colorspace_fragment>
      }` });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); root.add(ground);
  const flameGeometry = new THREE.InstancedBufferGeometry(); flameGeometry.setIndex([0,1,2,0,2,3]);
  flameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const centers = new Float32Array(METEOR_GROUND_FLAMES * 3), shapes = new Float32Array(METEOR_GROUND_FLAMES * 4);
  flameGeometry.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  flameGeometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4).setUsage(THREE.DynamicDrawUsage));
  flameGeometry.instanceCount = METEOR_GROUND_FLAMES;
  const flameMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: time, uFade: fade },
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec2 vSeed;
      void main(){vUv=vec2(position.x,(position.y+1.)*.5);vSeed=shape.zw;
        vec4 p=modelViewMatrix*vec4(center,1.);
        // Anchor the base to the terrain, rather than centering a spike over it.
        p.xy+=vec2(position.x*shape.x,vUv.y*shape.y);
        gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec2 vSeed;uniform float uTime,uFade;${noise}
      float tongue(vec2 p,float offset,float top,float phase,float flow){
        float y=p.y/top;
        float bend=sin(y*7.-flow*2.2+phase)*.16*y+sin(y*14.-flow*3.+phase)*.065*y;
        float width=(.31+.08*sin(flow*2.+phase))*pow(max(0.,1.-y),.72)*(.5+.5*smoothstep(0.,.18,y));
        float side=1.-smoothstep(width*.28,width+.1,abs(p.x-offset-bend));
        return side*(1.-smoothstep(.68,1.,y));
      }
      void main(){vec2 p=vUv;float id=vSeed.x,flow=uTime*(1.25+id*.65)+id*17.;
        float curl=fbm(vec2(p.x*2.4+id*37.,p.y*3.5-flow*1.7));
        p.x+=(curl-.5)*(.16+p.y*.42);
        float broad=tongue(p,-.27,.59+.12*sin(flow*1.7),id*11.,flow);
        float tall=tongue(p,.04,.88+.1*sin(flow*1.3+2.),id*23.+1.,flow);
        float fork=tongue(p,.34,.68+.14*sin(flow*1.9+4.),id*31.+3.,flow);
        float plume=max(tall,max(broad,fork));
        float turbulence=fbm(vec2(p.x*5.7+id*51.,p.y*7.5-flow*3.1));
        // Advected pockets split the upper flames into folding, detached wisps.
        float breakup=smoothstep(.17+p.y*.3,.45+p.y*.25,turbulence+.34*(1.-p.y));
        float density=plume*mix(.54+turbulence*.46,breakup,smoothstep(.12,.8,p.y));
        float alpha=smoothstep(.025,.88,density)*smoothstep(0.,.16,p.y)*uFade*vSeed.y;
        float heat=clamp(density*.57+(1.-p.y)*.18+turbulence*.23,0.,1.);
        vec3 color=mix(vec3(1.,.035,.001),vec3(1.,.19,.004),smoothstep(.1,.58,heat));
        color=mix(color,vec3(1.,.52,.07),smoothstep(.64,.97,heat));
        float core=exp(-pow((p.x-.04)*8.,2.))*pow(1.-p.y,1.7)*density;
        color=mix(color,vec3(1.,.98,.62),core*.68);
        gl_FragColor=vec4(color,alpha*.76);
        #include <colorspace_fragment>
      }` });
  const flames = new THREE.Mesh(flameGeometry, flameMaterial); flames.frustumCulled = false; root.add(flames);
  const points = Array.from({ length: METEOR_GROUND_FLAMES }, (_, i) => {
    const angle = i * 2.399963 + (seed(i + 61) - .5) * .4;
    const radius = Math.sqrt((i + .5) / METEOR_GROUND_FLAMES) * (rules.radius - .52);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: 0, seed: seed(i), depth: 0 };
  });
  const sorted = [...points], cameraMatrix = new THREE.Matrix4();
  let animationAge = 0;
  function upload() {
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i], flicker = .87 + .13 * Math.sin(animationAge * (4.7 + p.seed * 2.8) + p.seed * 19);
      centers.set([p.x, p.y + .055, p.z], i * 3);
      shapes.set([(.42 + p.seed * .25) * flicker, (1.1 + p.seed * 1.05) * flicker, p.seed, .72 + p.seed * .18], i * 4);
    }
    flameGeometry.attributes.center.needsUpdate = flameGeometry.attributes.shape.needsUpdate = true;
  }
  flames.onBeforeRender = (_renderer, _scene, camera) => {
    cameraMatrix.multiplyMatrices(camera.matrixWorldInverse, flames.matrixWorld); const e = cameraMatrix.elements;
    for (const p of sorted) p.depth = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
    sorted.sort((a,b) => a.depth - b.depth); upload();
  };
  let enabled = false, disposed = false;
  function ignite(center, active = true) {
    enabled = active; root.position.copy(center);
    const positions = groundGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, heightAt(center.x + positions.getX(i), center.z + positions.getZ(i)) - center.y + .045);
    positions.needsUpdate = true; groundGeometry.computeBoundingSphere();
    for (const p of points) p.y = heightAt(center.x + p.x, center.z + p.z) - center.y;
  }
  function update(age, visible = true) {
    const opacity = Math.min(1, age / .12) * THREE.MathUtils.clamp((rules.groundFireSeconds + rules.groundFireFade - age) / rules.groundFireFade, 0, 1);
    root.visible = enabled && visible && opacity > 0; fade.value = opacity; time.value = animationAge = age;
    if (root.visible) upload();
  }
  function reset() { enabled = false; root.visible = false; fade.value = time.value = animationAge = 0; }
  return { ignite, update, reset,
    get telemetry() { return { visible: root.visible, flames: root.visible ? METEOR_GROUND_FLAMES : 0, draws: root.visible ? 2 : 0 }; },
    dispose() { if (disposed) return; disposed = true; reset(); root.removeFromParent();
      groundGeometry.dispose(); groundMaterial.dispose(); flameGeometry.dispose(); flameMaterial.dispose(); },
  };
}
