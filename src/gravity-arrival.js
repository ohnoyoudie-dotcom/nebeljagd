import * as THREE from 'three';
import { createElementMaterial } from './spell-effect-materials.js';

const DUST_COUNT = 32;
const TAU = Math.PI * 2;

/** One pooled landing burst: soft instanced dust, a pressure wave, a rising
 * energy column and a squash/stretch pop. Shares the elemental shock shader. */
export function createGravityArrival(scene, rules) {
  const geometries = new Set(), materials = new Set();
  const geo = value => (geometries.add(value), value);
  const mat = value => {
    if (value.transparent && value.side === THREE.DoubleSide) value.forceSinglePass = true;
    materials.add(value); return value;
  };
  const group = new THREE.Group(); group.name = 'Gravitation · Landung und Öffnung'; group.visible = false; scene.add(group);
  const clock = { value: 0 };
  const waveMat = mat(createElementMaterial('shock', clock, { type: 'gravityStaff', opacity: .9 }));
  const wave = new THREE.Mesh(geo(new THREE.PlaneGeometry(1, 1)), waveMat);
  wave.name = 'Gravitation · violette Aufprallwelle'; wave.rotation.x = -Math.PI / 2; wave.position.y = .08; group.add(wave);
  const popMat = mat(new THREE.MeshBasicMaterial({ color: '#54219b', transparent: true, opacity: .7, depthWrite: false }));
  const pop = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 24, 14)), popMat);
  pop.name = 'Gravitation · aufploppende Energieblase'; group.add(pop);
  const energyMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false, uniforms: { uAge: clock, uFade: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; uniform float uAge,uFade;
      void main(){float rays=pow(max(0.0,cos(vUv.x*50.265-vUv.y*4.0+uAge*12.0)),12.0);
        float envelope=sin(vUv.y*3.14159);gl_FragColor=vec4(.63,.29,1.0,rays*envelope*uFade);
        #include <colorspace_fragment>
      }`,
  }));
  const energy = new THREE.Mesh(geo(new THREE.CylinderGeometry(.25, 1, 1, 48, 1, true)), energyMat);
  energy.name = 'Gravitation · aufsteigende Einschlagsenergie'; group.add(energy);
  const dustMat = mat(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uFade: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying float vSeed;
      void main(){vUv=uv;mat4 basis=modelViewMatrix*instanceMatrix;
        vec4 center=basis*vec4(0.,0.,0.,1.);center.xy+=position.xy*vec2(length(basis[0].xyz),length(basis[1].xyz));
        vSeed=instanceMatrix[3].x*3.7+instanceMatrix[3].z;gl_Position=projectionMatrix*center;}`,
    fragmentShader: `varying vec2 vUv;varying float vSeed;uniform float uFade;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float wisps=.7+.3*sin(p.x*9.+sin(p.y*8.+vSeed));
        float a=(1.-smoothstep(.15,1.,r))*wisps*uFade;if(a<.005)discard;
        gl_FragColor=vec4(mix(vec3(.25,.19,.28),vec3(.60,.42,.70),1.-r),a);
        #include <colorspace_fragment>
      }`,
  }));
  const dust = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(1, 1)), dustMat, DUST_COUNT);
  dust.name = 'Gravitation · aufwirbelnder Landungsstaub'; dust.frustumCulled = false;
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(dust);
  const transform = new THREE.Object3D(); let disposed = false;
  function show(center, age, visible) {
    const t = Math.min(1, age / rules.warning);
    group.visible = visible && t < 1;
    if (!group.visible) return;
    group.position.set(center.x, center.y + .045, center.z); clock.value = age;
    wave.scale.setScalar((.15 + Math.sqrt(t) * rules.radius) * 2.7);
    waveMat.uniforms.uOpacity.value = (1 - t) ** 1.3 * .95;
    const puff = Math.sin(t * Math.PI);
    pop.position.y = .18 + puff * .40;
    pop.scale.set(.3 + puff * .8, .10 + puff * .65, .3 + puff * .8);
    popMat.opacity = (1 - t) ** 1.4 * .7;
    energy.scale.set(.35 + t * 1.1, .2 + puff * 2.2, .35 + t * 1.1);
    energy.position.y = energy.scale.y * .5;
    energyMat.uniforms.uFade.value = puff * .8;
    dustMat.uniforms.uFade.value = (1 - t) ** 1.4 * .40;
    for (let i = 0; i < DUST_COUNT; i++) {
      const seed = i * .61803398875 % 1, angle = i * 2.39996 + t * .7;
      const r = rules.radius * (.12 + Math.sqrt(t) * (.36 + seed * .56));
      transform.position.set(Math.cos(angle) * r, .08 + puff * (.25 + seed * .7), Math.sin(angle) * r);
      transform.rotation.set(0, 0, 0); transform.scale.setScalar((.42 + seed * .5) * (1 + t) * Math.sqrt(1 - t));
      transform.updateMatrix(); dust.setMatrixAt(i, transform.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
  }
  function hide() { group.visible = false; }
  return { show, hide,
    get telemetry() { return { visible: group.visible, draws: group.visible ? 4 : 0, dustCount: DUST_COUNT }; },
    dispose() { if (disposed) return; hide(); group.removeFromParent(); dust.dispose();
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); disposed = true; },
  };
}
