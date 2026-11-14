import * as THREE from 'three';

const VOLUME_STEPS = 14;
const noiseGLSL = `
  float hash3(vec3 p) { p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
  float noise3(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

/** The poison gas's bounded volume technique, with dense charcoal smoke and
 * flowing, diffuse edges. Its proxy box is never a visible projectile shape. */
export function createSoulCloudVisual(_geometry, clock, ownMaterial, { ownGeometry, seed = 3.71, impact = false } = {}) {
  const root = new THREE.Group(); root.name = 'Seelenrichter · waberndes Rauchvolumen';
  const box = new THREE.BoxGeometry(2.3, 2.3, 2.3);
  ownGeometry?.(box);
  const material = ownMaterial(new THREE.ShaderMaterial({
    name: 'Seelennebel · dunkles turbulentes Volumen', side: THREE.FrontSide,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { uTime: clock, uFade: { value: 1 }, uSeed: { value: seed }, uImpact: { value: impact ? 1 : 0 },
      uEye: { value: new THREE.Vector3() }, uDirection: { value: new THREE.Vector3() }, uOrtho: { value: 1 } },
    vertexShader: `varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 vLocal;uniform vec3 uEye,uDirection;uniform float uTime,uFade,uSeed,uOrtho,uImpact;
      ${noiseGLSL}
      float density(vec3 p) {
        float t=uTime*.70;
        vec3 q=p*vec3(2.7,2.8,2.3)+vec3(uSeed,-t*.55,uSeed*.7+t*.36);
        q.xz+=vec2(sin(q.y*1.8+q.z+t),cos(q.x*1.5-q.y-t))*.44;
        float broad=noise3(q),detail=noise3(q*2.03+13.2),wisps=noise3(q*4.11+27.4);
        float field=broad*.58+detail*.28+wisps*.14;
        vec3 drift=vec3(sin(p.z*3.+t),cos(p.x*3.-t*.7),sin(p.y*3.+t*.8))*.12;
        vec3 body=p+drift;
        // The rear loosens into eddies instead of narrowing to a pointed tail.
        body.z-=.12*(1.-uImpact);
        float radial=length(body*vec3(1.,1.,.88));
        float envelope=1.-smoothstep(.47+field*.24,1.03,radial);
        envelope*=1.-smoothstep(.80,1.03,max(max(abs(p.x),abs(p.y)),abs(p.z)));
        float loose=1.-smoothstep(-.55,.3,p.z);
        return envelope*smoothstep(.23+loose*.05,.68,field+.20*(1.-radial));
      }
      void main(){
        vec3 origin=uOrtho>.5?vLocal-uDirection*5.:uEye;
        vec3 ray=uOrtho>.5?uDirection:normalize(vLocal-origin);
        vec3 inv=1./(sign(ray+.000001)*max(abs(ray),vec3(.00001)));
        vec3 a=(-1.15-origin)*inv,b=(1.15-origin)*inv;
        vec3 lo=min(a,b),hi=max(a,b);
        float nearT=max(0.,max(max(lo.x,lo.y),lo.z)),farT=min(min(hi.x,hi.y),hi.z);
        if(farT<=nearT)discard;
        float stepLength=(farT-nearT)/${VOLUME_STEPS}.;
        float jitter=hash3(floor(vLocal*210.))*.50+.25;
        vec3 color=vec3(0.);float opacity=0.;
        for(int i=0;i<${VOLUME_STEPS};i++){
          vec3 p=origin+ray*(nearT+(float(i)+jitter)*stepLength);
          float d=density(p),alpha=(1.-exp(-d*stepLength*8.4))*uFade;
          float light=clamp(.46+p.y*.22-p.x*.13-d*.34,0.,1.);
          vec3 smoke=mix(vec3(.005,.008,.014),vec3(.105,.125,.140),light);
          color+=(1.-opacity)*alpha*smoke;opacity+=(1.-opacity)*alpha;
        }
        if(opacity<.005)discard;
        gl_FragColor=vec4(color/max(opacity,.001),opacity);
        #include <colorspace_fragment>
      }`,
  }));
  const mesh = new THREE.Mesh(box, material); mesh.name = 'Seelenwolke · fließendes Gas'; mesh.frustumCulled = false;
  const inverse = new THREE.Matrix4(), eye = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    inverse.copy(mesh.matrixWorld).invert(); camera.getWorldPosition(eye);
    material.uniforms.uEye.value.copy(eye).applyMatrix4(inverse);
    camera.getWorldDirection(material.uniforms.uDirection.value).transformDirection(inverse);
    material.uniforms.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
  };
  root.add(mesh);
  function update(time, opacity = 1) {
    material.uniforms.uFade.value = THREE.MathUtils.clamp(opacity, 0, 1);
    if (impact) mesh.scale.set(1, 1, 1);
    else {
      const t=time*.8+seed;
      mesh.scale.set(.84+Math.sin(t*1.3)*.07,.73+Math.cos(t*1.1)*.055,1.15+Math.sin(t*.9)*.075);
      mesh.position.set(Math.sin(t*.9)*.045,Math.sin(t*1.2)*.045,-.22);
      mesh.rotation.set(Math.sin(t*.7)*.075,Math.sin(t*.5)*.055,Math.sin(t*.8)*.09);
    }
  }
  update(0);
  return { root, update, get telemetry() { return { volumeSteps: VOLUME_STEPS, draws: 1, opacity: material.uniforms.uFade.value }; },
    // Legacy callers without an ownership callback can explicitly release the proxy.
    disposeGeometry() { if (!ownGeometry) box.dispose(); } };
}
