import * as THREE from 'three';
import { solarEnvelope } from './sun-envelope.js';

/** A narrow solar shaft widens and brightens; its light and motes fall from above. */
export function createSunVisuals(scene, rules, ground, isVisible) {
  const root = new THREE.Group(); root.name = 'Sonnenstrahl'; root.visible = false; scene.add(root);
  const materials = [], geometries = [], clock = { value: 0 }, strength = { value: 0 };
  const noise = `
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
    float mist(vec2 p){return noise(p)*.55+noise(p*2.07+7.)*.30+noise(p*4.1+13.)*.15;}
  `;
  function mesh(geometry, material) {
    geometries.push(geometry); materials.push(material);
    const part = new THREE.Mesh(geometry, material); root.add(part); return part;
  }
  const beamVertex = `varying vec3 vLocal;
    void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  function beamMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
      blending: THREE.NormalBlending,
      uniforms: {uTime:clock,uStrength:strength,uRadius:{value:rules.radius},uOrtho:{value:1},
        uEye:{value:new THREE.Vector3()},uDirection:{value:new THREE.Vector3()}}, vertexShader:beamVertex,
      fragmentShader:`varying vec3 vLocal;uniform float uTime,uStrength,uRadius,uOrtho;uniform vec3 uEye,uDirection;
        ${noise}
        void main(){
          vec3 ray=uOrtho>.5?uDirection:normalize(vLocal-uEye);
          float a=dot(ray.xz,ray.xz),b=dot(vLocal.xz,ray.xz);
          float c=dot(vLocal.xz,vLocal.xz)-pow(uRadius*1.22,2.);
          float farCircle=a>.00001?(-b+sqrt(max(0.,b*b-a*c)))/a:100000.;
          float farY=abs(ray.y)>.00001?((ray.y<0.?-10.:10.)-vLocal.y)/ray.y:100000.;
          float path=max(0.,min(farCircle,farY));
          if(path<=.0001)discard;
          vec3 middle=vLocal+ray*path*.5;
          float height=(middle.y+10.)/20.;
          float n=mist(vec2(middle.x*.8+middle.z*.31,height*7.+uTime*.80));
          float plume=smoothstep(.30,.70,n);
          float stream=pow(.5+.5*sin(middle.x*4.1+middle.z*3.7+n*.85+sin(height*2.+uTime*.6)*.15),6.);
          // Integrate one continuous radial field, clipping each ray at the ground.
          // A surface-only chord would leave a hard bright hem at the cylinder foot.
          float stepLength=path/12.,density=0.,core=0.;
          for(int i=0;i<12;i++){
            vec3 p=vLocal+ray*(float(i)+.5)*stepLength;
            float r=length(p.xz)/uRadius;
            float d=exp(-2.8*pow(r,4.))*(1.-smoothstep(1.10,1.22,r));
            d*=1.-smoothstep(.72,1.,(p.y+10.)/20.);
            density+=d*stepLength;core+=d*stepLength*max(0.,1.-r*r);
          }
          float alpha=1.-exp(-density*2.4*pow(uStrength,2.8));
          vec3 gold=vec3(1.,.57,.095), ivory=vec3(1.,.98,.88);
          float heat=clamp(uStrength*(.68+.21*core/max(density,.0001)+plume*.08+stream*.03),0.,1.);
          vec3 color=mix(gold,ivory,heat);
          color*=.96+stream*.04;
          if(alpha<.002)discard;gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`,
    });
  }
  const beam=mesh(new THREE.CylinderGeometry(rules.radius*1.22,rules.radius*1.22,20,64,1,false),beamMaterial());
  beam.position.y=10;beam.name='Sonnenkern';
  const beamInverse=new THREE.Matrix4(),beamEye=new THREE.Vector3();
  beam.onBeforeRender=(_renderer,_scene,camera)=>{
    beamInverse.copy(beam.matrixWorld).invert();camera.getWorldPosition(beamEye);
    beam.material.uniforms.uEye.value.copy(beamEye).applyMatrix4(beamInverse);
    camera.getWorldDirection(beam.material.uniforms.uDirection.value).transformDirection(beamInverse);
    beam.material.uniforms.uOrtho.value=camera.isOrthographicCamera?1:0;
  };
  function groundMaterial() {
    return new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
      blending:THREE.NormalBlending,
      uniforms:{uTime:clock,uStrength:strength},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform float uTime,uStrength;${noise}
        void main(){vec2 p=vUv*2.-1.;float r=length(p)*1.28;
          float n=mist(p*3.+vec2(uTime*.2,-uTime*.28));
          float edge=exp(-2.8*pow(r,4.))*(1.-smoothstep(1.10,1.28,r));
          float alpha=1.-exp(-7.5*edge*pow(uStrength,2.4));
          vec3 color=mix(vec3(1.,.66,.22),vec3(1.,.97,.83),uStrength*(.93+n*.07));
          if(alpha<.002)discard;gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`});
  }
  const disk=mesh(new THREE.CircleGeometry(rules.radius*1.28,64),groundMaterial());
  disk.name='Wachsende Sonnenhelligkeit';disk.rotation.x=-Math.PI/2;disk.position.y=.055;

  // Falling gold motes have a bright lower head and a soft tail above it.
  // One bounded instanced draw retains the same geometry through every cast.
  const count=80, particleGeometry=new THREE.PlaneGeometry(1,1);
  const rain=Array.from({length:count},(_,i)=>({duration:.43+(i%7)*.024,height:18+(i%5)*.45}));
  const rainSpeeds=rain.map(p=>p.height/p.duration);
  const particleSpeed=rainSpeeds.reduce((sum,v)=>sum+v,0)/count,
    particleSpeedMin=Math.min(...rainSpeeds),particleSpeedMax=Math.max(...rainSpeeds);
  const particleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    blending:THREE.AdditiveBlending,uniforms:{uStrength:strength},
    vertexShader:`varying vec2 vUv;varying float vFade;attribute float aFade;
      void main(){vUv=uv;vFade=aFade;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        gl_Position=projectionMatrix*center;}`,
    fragmentShader:`varying vec2 vUv;varying float vFade;uniform float uStrength;
      void main(){vec2 p=vUv*2.-1.;float head=exp(-dot(vec2(p.x*1.4,(p.y+.45)*2.8),vec2(p.x*1.4,(p.y+.45)*2.8))*3.);
        float tail=exp(-p.x*p.x*18.)*smoothstep(-.65,-.1,p.y)*(1.-smoothstep(.3,1.,p.y))*.28;
        float alpha=(head+tail)*vFade*(.16+.84*uStrength);
        if(alpha<.003)discard;gl_FragColor=vec4(mix(vec3(1.,.56,.12),vec3(1.,.96,.68),head),alpha);
        #include <colorspace_fragment>
      }`});
  materials.push(particleMaterial);geometries.push(particleGeometry);
  const particles=new THREE.InstancedMesh(particleGeometry,particleMaterial,count);particles.name='Fallende Sonnenfunken';
  particles.renderOrder=2;
  particles.frustumCulled=false;particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(particles);
  const fades=new Float32Array(count);particleGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(fades,1));
  const transform=new THREE.Object3D();let state={phase:'idle',brightness:0,radiusScale:0,effectiveRadius:0,damageEligible:false}, visibleParticles=0;
  function show(center,age) {
    root.position.set(center.x,ground(center),center.z);
    root.visible=!isVisible||isVisible(center,{concealed:false});clock.value=age;state=solarEnvelope(age,rules);
    root.scale.set(state.radiusScale,1,state.radiusScale);
    strength.value=state.brightness;visibleParticles=0;
    const exit=state.fading?state.brightness:1;
    for(let i=0;i<count;i++) {
      const {duration,height}=rain[i],cycle=((age/duration+i*.618034)%1+1)%1;
      const angle=i*2.399963+Math.sin(age*.4+i)*.012;
      const radius=rules.radius*(.74+(i%9)*.052);
      const y=.10+(1-cycle)*height;
      transform.position.set(Math.cos(angle)*radius+Math.sin(age*.7+i)*.025,y,Math.sin(angle)*radius);
      transform.scale.set(.065+(i%4)*.009,.90+(i%4)*.16,1);transform.updateMatrix();
      particles.setMatrixAt(i,transform.matrix);
      const emerge=THREE.MathUtils.smoothstep(age,rules.rise*.78,rules.rise);
      fades[i]=THREE.MathUtils.smoothstep(cycle,0,.08)*(1-THREE.MathUtils.smoothstep(cycle,.88,1))*exit*emerge;
      if(fades[i]>.02)visibleParticles++;
    }
    particles.instanceMatrix.needsUpdate=true;particleGeometry.attributes.aFade.needsUpdate=true;
  }
  function hide(){root.visible=false;strength.value=0;visibleParticles=0;state={phase:'idle',brightness:0,radiusScale:0,effectiveRadius:0,damageEligible:false};}
  return {start(center){show(center,0);},show,hide,
    get telemetry(){return {visible:root.visible,...state,intensity:state.brightness,density:.98*state.brightness,
      groundFill:state.brightness,seedRadius:state.effectiveRadius,particleDirection:'down',fallingParticles:visibleParticles,
      particleSpeed,particleSpeedMin,particleSpeedMax,edgeProfile:'continuous',beamLayers:1,meshes:root.children.length};},
    dispose(){scene.remove(root);particles.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
