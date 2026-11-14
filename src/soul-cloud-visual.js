import * as THREE from 'three';

const IMPACT_STEPS = 14, FLIGHT_STEPS = 20;
const noiseGLSL = `
  float hash3(vec3 p) { p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z); }
  float noise3(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
`;

/** A directional shadow wrapped in turbulent gas. Impact clouds retain the
 * round, expanding envelope; flight has a denser head and loose spectral wake. */
export function createSoulCloudVisual(_geometry, clock, ownMaterial, { ownGeometry, seed = 3.71, impact = false } = {}) {
  const root = new THREE.Group(); root.name = 'Seelenrichter · Schattenkern mit Nebelschweif';
  const steps = impact ? IMPACT_STEPS : FLIGHT_STEPS;
  const box = new THREE.BoxGeometry(2.3, 2.3, impact ? 2.3 : 4.3);
  if (!impact) box.translate(0, 0, -1.0);
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
        if(uImpact>.5){
          float radial=length(body*vec3(1.,1.,.88));
          float envelope=1.-smoothstep(.47+field*.24,1.03,radial);
          envelope*=1.-smoothstep(.80,1.03,max(max(abs(p.x),abs(p.y)),abs(p.z)));
          float loose=1.-smoothstep(-.55,.3,p.z);
          return envelope*smoothstep(.23+loose*.05,.68,field+.20*(1.-radial));
        }
        // A shadow head leads, while separate eddies peel away into a tapering wake.
        vec3 head=body-vec3(0.,0.,.22);
        float nose=length(head*vec3(1.36,1.58,1.10));
        float headDensity=(1.-smoothstep(.36+field*.18,.88,nose))*smoothstep(.19,.57,field);
        float trail=clamp((-p.z+.12)/3.15,0.,1.);
        vec2 flow=vec2(sin(p.z*2.5+t*3.1),cos(p.z*3.2+t*2.6))*(.035+trail*.13);
        float width=.54*pow(1.-trail,.74)+.025;
        float wakeRadius=length((p.xy-flow)/vec2(width,width*.66));
        vec2 fork=flow+vec2(sin(p.z*3.4+t*3.8)*.24,.13)*sin(trail*3.14159);
        float forkRadius=length((p.xy-fork)/vec2(width*.60,width*.48));
        float wake=max(1.-smoothstep(.12+field*.35,1.3,wakeRadius),
          (1.-smoothstep(.16,1.15,forkRadius))*.60)*(1.-smoothstep(-.30,.28,p.z));
        wake*=pow(1.-trail,.65)*smoothstep(.16,.60,field+.07*sin(p.z*7.-t*6.));
        float bounds=(1.-smoothstep(2.70,3.12,-p.z))*(1.-smoothstep(.94,1.12,p.z));
        return max(headDensity,wake*.78)*bounds;
      }
      void main(){
        vec3 origin=uOrtho>.5?vLocal-uDirection*5.:uEye;
        vec3 ray=uOrtho>.5?uDirection:normalize(vLocal-origin);
        vec3 inv=1./(sign(ray+.000001)*max(abs(ray),vec3(.00001)));
        vec3 lower=vec3(-1.15,-1.15,uImpact>.5?-1.15:-3.15);
        vec3 a=(lower-origin)*inv,b=(vec3(1.15)-origin)*inv;
        vec3 lo=min(a,b),hi=max(a,b);
        float nearT=max(0.,max(max(lo.x,lo.y),lo.z)),farT=min(min(hi.x,hi.y),hi.z);
        if(farT<=nearT)discard;
        float stepLength=(farT-nearT)/${steps}.;
        float jitter=hash3(floor(vLocal*210.))*.50+.25;
        vec3 color=vec3(0.);float opacity=0.;
        for(int i=0;i<${steps};i++){
          vec3 p=origin+ray*(nearT+(float(i)+jitter)*stepLength);
          float d=density(p),alpha=(1.-exp(-d*stepLength*8.4))*uFade;
          float light=clamp(.46+p.y*.22-p.x*.13-d*.34,0.,1.);
          vec3 smoke=mix(vec3(.005,.008,.014),vec3(.105,.125,.140),light);
          if(uImpact<.5){
            vec2 drift=vec2(sin(p.z*4.+uTime*3.2),cos(p.z*3.-uTime*2.6))*.045;
            float heart=exp(-dot((p.xy-drift)*vec2(2.6,3.4),(p.xy-drift)*vec2(2.6,3.4)));
            heart*=smoothstep(-.95,-.15,p.z)*(1.-smoothstep(.43,.82,p.z));
            float thread=noise3(p*vec3(8.,6.,2.)+vec3(uSeed,uTime*.7,-uTime*3.));
            float vein=pow(.5+.5*sin(p.x*12.+p.y*4.+sin(p.z*7.-uTime*4.8)*1.5),4.);
            float soul=heart*(.18+vein*.82)*(.55+thread*.45);
            smoke=mix(smoke,vec3(.36,.25,.47),soul*.86);
          }
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
      mesh.scale.set(.94+Math.sin(t*2.1)*.035,.86+Math.cos(t*1.7)*.04,1.+Math.sin(t*1.3)*.025);
      mesh.position.set(Math.sin(t*.9)*.025,Math.sin(t*1.2)*.025,-.04);
      mesh.rotation.set(Math.sin(t*.7)*.035,Math.sin(t*.5)*.025,Math.sin(t*.8)*.05);
    }
  }
  update(0);
  return { root, update, get telemetry() { return { volumeSteps: steps, draws: 1, opacity: material.uniforms.uFade.value,
    presentation: impact ? 'enveloping-gas' : 'spectral-head-and-wake' }; },
    // Legacy callers without an ownership callback can explicitly release the proxy.
    disposeGeometry() { if (!ownGeometry) box.dispose(); } };
}
