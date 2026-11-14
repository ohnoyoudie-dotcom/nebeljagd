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
        float t=uTime*(uImpact>.5?.70:1.45);
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
        float breath=sin(uTime*7.2+uSeed)*.075+sin(uTime*11.3+uSeed*.7)*.025;
        vec3 head=body-vec3(sin(uTime*5.1+p.z*4.)*.045,cos(uTime*4.3+p.x*5.)*.045,.22);
        float nose=length(head*vec3(1.36-breath,1.58+breath*.65,1.10-breath*.4));
        float headDensity=(1.-smoothstep(.36+field*.18,.88,nose))*smoothstep(.19,.57,field);
        float trail=clamp((-p.z+.12)/3.15,0.,1.);
        vec2 flow=vec2(sin(p.z*2.8+t*2.7),cos(p.z*3.1+t*2.3))*(.035+trail*.20);
        float width=(.54+sin(p.z*5.+uTime*5.)*.055)*pow(1.-trail,.74)+.025;
        float wakeRadius=length((p.xy-flow)/vec2(width,width*.66));
        vec2 fork=flow+vec2(sin(p.z*3.4+t*3.2)*.33,cos(p.z*3.+t*2.8)*.22)*sin(trail*3.14159);
        float forkRadius=length((p.xy-fork)/vec2(width*.60,width*.48));
        vec2 torn=flow-vec2(cos(p.z*4.+t*2.6)*.29,sin(p.z*3.8+t*3.4)*.19)*sin(trail*3.14159);
        float tornRadius=length((p.xy-torn)/vec2(width*.46,width*.43));
        float fringes=max((1.-smoothstep(.16,1.15,forkRadius))*.70,(1.-smoothstep(.10,1.10,tornRadius))*.48);
        float wake=max(1.-smoothstep(.12+field*.35,1.3,wakeRadius),fringes)*(1.-smoothstep(-.30,.28,p.z));
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
            vec2 drift=vec2(sin(p.z*4.+uTime*5.2),cos(p.z*3.-uTime*4.6))*.075;
            float heart=exp(-dot((p.xy-drift)*vec2(2.15,2.7),(p.xy-drift)*vec2(2.15,2.7)));
            heart*=smoothstep(-.95,-.15,p.z)*(1.-smoothstep(.43,.82,p.z));
            float thread=noise3(p*vec3(8.,6.,2.)+vec3(uSeed,uTime*1.4,-uTime*5.));
            float vein=pow(.5+.5*sin(p.x*11.+p.y*5.+sin(p.z*7.-uTime*6.2)*1.8),5.);
            float pulse=.74+.26*sin(uTime*7.2+uSeed);
            float soul=heart*(.08+vein*.92)*(.66+thread*.34)*pulse;
            vec3 spirit=mix(vec3(.34,.19,.45),vec3(.38,.43,.52),vein*thread*.62);
            smoke=mix(smoke*.73,spirit,soul*.94);
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
      const t=time*1.3+seed, breath=Math.sin(time*7.2+seed);
      mesh.scale.set(.94+breath*.075,.86-breath*.055,1.+Math.sin(t*2.7)*.045);
      mesh.position.set(Math.sin(t*2.3)*.045,Math.sin(t*2.8)*.05,-.04);
      mesh.rotation.set(Math.sin(t*1.7)*.065,Math.sin(t*1.5)*.035,Math.sin(t*2.1)*.16);
    }
  }
  update(0);
  return { root, update, get telemetry() { return { volumeSteps: steps, draws: 1, opacity: material.uniforms.uFade.value,
    presentation: impact ? 'enveloping-gas' : 'spectral-head-and-wake' }; },
    // Legacy callers without an ownership callback can explicitly release the proxy.
    disposeGeometry() { if (!ownGeometry) box.dispose(); } };
}
