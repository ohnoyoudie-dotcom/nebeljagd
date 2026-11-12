import * as THREE from 'three';

export const METEOR_GROUND_FLAMES = 36;
const seed = i => { const n = Math.sin(i * 127.1 + 1.7) * 43758.5453; return n - Math.floor(n); };
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}`;

/** Terrain-following embers and a fixed pool of low flames. The spell owns
 * ignition/damage; this visual follows the same simulation age and lifetime. */
export function createMeteorGroundFire(parent, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Meteorstab · brennende Einschlagsfläche'; root.visible = false; parent.add(root);
  const groundGeometry = new THREE.PlaneGeometry(rules.radius * 2, rules.radius * 2, 20, 20);
  groundGeometry.rotateX(-Math.PI / 2);
  const time = { value: 0 }, fade = { value: 0 };
  const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: time, uFade: fade },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uFade;${noise}
      void main(){float n=noise(vUv*9.);float edge=1.-smoothstep(.76+n*.08,1.,length(vUv));
        float coal=smoothstep(.48,.76,n)*(.65+.35*sin(uTime*4.+n*23.));
        vec3 color=mix(vec3(.045,.018,.009),vec3(1.,.23,.007),coal);
        gl_FragColor=vec4(color,edge*uFade*.82);
        #include <colorspace_fragment>
      }` });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); root.add(ground);
  const flameGeometry = new THREE.InstancedBufferGeometry(); flameGeometry.setIndex([0,1,2,0,2,3]);
  flameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const centers = new Float32Array(METEOR_GROUND_FLAMES * 3), shapes = new Float32Array(METEOR_GROUND_FLAMES * 4);
  flameGeometry.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3).setUsage(THREE.DynamicDrawUsage));
  flameGeometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4).setUsage(THREE.DynamicDrawUsage));
  const flameMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: time, uFade: fade },
    vertexShader: `attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec3 vShape;
      void main(){vUv=position.xy;vShape=shape.yzw;vec4 p=modelViewMatrix*vec4(center,1.);
        p.xy+=position.xy*shape.x*vec2(1.,2.1);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vShape;uniform float uTime,uFade;${noise}
      void main(){vec2 p=vUv;float y=(p.y+1.)*.5;
        float n=noise(vec2(p.x*3.+vShape.y*41.,p.y*4.-uTime*4.));
        float width=(1.-y)*(.55+n*.5);
        float edge=(1.-smoothstep(width*.35,width+.06,abs(p.x+(n-.5)*y*.45)))*smoothstep(0.,.16,y)*(1.-smoothstep(.65,1.,y));
        vec3 color=mix(vec3(1.,.085,.002),vec3(1.,.82,.18),clamp((1.-y)*(1.-abs(p.x))*1.3,0.,1.));
        gl_FragColor=vec4(color,edge*uFade*vShape.z);
        #include <colorspace_fragment>
      }` });
  const flames = new THREE.Mesh(flameGeometry, flameMaterial); flames.frustumCulled = false; root.add(flames);
  const points = Array.from({ length: METEOR_GROUND_FLAMES }, (_, i) => {
    const angle = i * 2.399963, radius = Math.sqrt((i + .5) / METEOR_GROUND_FLAMES) * (rules.radius - .5);
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, y: 0, seed: seed(i) };
  });
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
    root.visible = enabled && visible && opacity > 0; fade.value = opacity; time.value = age;
    if (!root.visible) return;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], pulse = .75 + .25 * Math.sin(age * (7 + p.seed * 3) + p.seed * 19), size = (.22 + p.seed * .16) * pulse;
      centers.set([p.x, p.y + size * 1.6, p.z], i * 3);
      shapes.set([size, 0, p.seed, .82 + .18 * pulse], i * 4);
    }
    flameGeometry.attributes.center.needsUpdate = flameGeometry.attributes.shape.needsUpdate = true;
  }
  function reset() { enabled = false; root.visible = false; fade.value = time.value = 0; }
  return { ignite, update, reset,
    get telemetry() { return { visible: root.visible, flames: root.visible ? METEOR_GROUND_FLAMES : 0, draws: root.visible ? 2 : 0 }; },
    dispose() { if (disposed) return; disposed = true; reset(); root.removeFromParent();
      groundGeometry.dispose(); groundMaterial.dispose(); flameGeometry.dispose(); flameMaterial.dispose(); },
  };
}
