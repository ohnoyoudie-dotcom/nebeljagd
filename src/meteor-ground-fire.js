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
      void main(){float radius=length(vUv);float n=fbm(vUv*10.);
        float edge=1.-smoothstep(.79+n*.12,.98,radius);
        float crack=1.-smoothstep(.01,.045,abs(noise(vUv*17.)-.49));
        float pockets=smoothstep(.52,.73,n);
        float coal=crack*pockets*(.65+.35*sin(uTime*3.5+n*27.));
        vec3 charcoal=mix(vec3(.009,.006,.004),vec3(.025,.015,.009),n);
        vec3 color=mix(charcoal,vec3(.82,.085,.002),coal*.8);
        // The bed occludes grass instead of tinting it dark green. Only the
        // irregular perimeter fades into the surrounding terrain.
        gl_FragColor=vec4(color,edge*uFade*.985);
        #include <colorspace_fragment>
      }` });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  // A terrain decal must composite before the flame cards. Its raised center
  // otherwise sorts in front of them and masks the fire inside the footprint.
  ground.renderOrder = -1; root.add(ground);
  const flameGeometry = new THREE.InstancedBufferGeometry(); flameGeometry.setIndex([0,1,2,0,2,3]);
  flameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const centers = new Float32Array(METEOR_GROUND_FLAMES * 3), shapes = new Float32Array(METEOR_GROUND_FLAMES * 4);
  flameGeometry.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  flameGeometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4).setUsage(THREE.DynamicDrawUsage));
  flameGeometry.instanceCount = METEOR_GROUND_FLAMES;
  const flameMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.NormalBlending,
    uniforms: { uTime: time, uFade: fade },
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec2 vSeed;
      void main(){vUv=vec2(position.x,(position.y+1.)*.5);vSeed=shape.zw;
        vec4 p=modelViewMatrix*vec4(center,1.);
        // Anchor the base to the terrain, rather than centering a spike over it.
        p.xy+=vec2(position.x*shape.x,vUv.y*shape.y);
        gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec2 vSeed;uniform float uTime,uFade;${noise}
      void main(){vec2 p=vUv;float id=vSeed.x,flow=uTime*(1.2+id*.55)+id*19.;
        // Two independently rising noise scales roll the flame mass sideways;
        // the high plume tears into wisps instead of repeating a fixed spike.
        float curl=fbm(vec2(p.x*2.8+id*37.,p.y*3.8-flow*1.65));
        p.x+=(curl-.5)*(.25+p.y*.7)+sin(flow*1.2+p.y*6.)*.12*p.y;
        float large=fbm(vec2(p.x*3.4+id*51.,p.y*5.2-flow*2.6));
        float fine=noise(vec2(p.x*9.1-id*17.,p.y*11.7-flow*4.1));
        float fuel=(1.-p.y)*.68+large*.65;
        float threshold=.25+p.y*.34;
        float lobes=smoothstep(threshold,threshold+.24,fuel);
        float width=.77-p.y*.32+(curl-.5)*.2;
        float sides=1.-smoothstep(width*.38,width+.11,abs(p.x));
        float top=1.-smoothstep(.79,.99,p.y);
        float density=lobes*sides*top;
        float base=smoothstep(0.,.23,p.y+(curl-.5)*.11);
        float alpha=smoothstep(.035,.38,density)*base*uFade*vSeed.y;
        float heat=clamp(density*.61+(1.-p.y)*.25+fine*.14,0.,1.);
        vec3 color=mix(vec3(.85,.018,.0008),vec3(1.,.19,.002),smoothstep(.12,.66,heat));
        color=mix(color,vec3(1.,.66,.09),smoothstep(.63,.94,heat));
        float core=smoothstep(.83,.99,heat)*pow(max(0.,1.-abs(p.x)*1.65),2.)*(1.-smoothstep(.22,.62,p.y));
        color=mix(color,vec3(1.,.96,.68),core*.72);
        // Dense hot cores cover the background. Additive flame cards retained
        // every green grass pixel and made the old fire look pale/green.
        gl_FragColor=vec4(color,alpha*.98);
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
      const p = sorted[i];
      const surge=.5+.5*Math.sin(animationAge*(2.7+p.seed*1.9)+p.seed*31.);
      const flicker=.9+.1*Math.sin(animationAge*(7.3+p.seed*2.1)+p.seed*19.);
      // Broad low flames knit the bed together; a minority of plumes rise
      // higher, so the footprint reads as one fire rather than a fence.
      const tall=p.seed>.7;
      const width=(.82+p.seed*.25)*flicker;
      const height=(tall?1.65+p.seed*.55:1.05+p.seed*.65)*(.8+surge*.3);
      centers.set([p.x,p.y+.055,p.z],i*3);
      shapes.set([width,height,p.seed,.96],i*4);
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
