import * as THREE from 'three';
import { solarEnvelope } from './sun-envelope.js';

/** Full-height golden light gathers in place, then gently releases upward. */
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
  const beamVertex = `varying vec2 vUv; varying vec3 vNormal,vView; uniform float uTime,uLayer;
    void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);
      vec3 pos=position;float wave=sin(uv.x*31.416+uv.y*20.-uTime*1.8)*.055+sin(uv.x*18.85-uv.y*12.+uTime*.7)*.045;
      pos.xz*=1.+wave*(uLayer>.5?1.:.35);
      vec4 p=modelViewMatrix*vec4(pos,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`;
  function beamMaterial(layer) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false,
      blending: layer === 2 ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {uTime:clock,uStrength:strength,uLayer:{value:layer}}, vertexShader:beamVertex,
      fragmentShader:`varying vec2 vUv; varying vec3 vNormal,vView; uniform float uTime,uStrength,uLayer;
        ${noise}
        void main(){
          float face=abs(dot(normalize(vNormal),normalize(vView)));
          float angle=vUv.x*6.283185;
          float n=mist(vec2(sin(angle)*3.+cos(angle)*1.2+sin(vUv.y*14.-uTime*.8)*.7,cos(angle)*3.+vUv.y*8.-uTime*.45));
          float plume=smoothstep(.30,.70,n);
          float stream=pow(.5+.5*sin(vUv.x*56.55+n*11.+sin(vUv.y*8.-uTime*1.7)*2.),4.);
          float foot=smoothstep(0.,.012,vUv.y), sky=1.-smoothstep(.72,1.,vUv.y);
          float core=uLayer<.5?1.:0.;
          float alpha=smoothstep(.06,core>0.?.65:.88,face)*foot*sky;
          alpha*=pow(uStrength,core>0.?2.8:1.25)*(core>0.?.995:.72)*(core>0.?.94+plume*.06:.42+plume*.40+stream*.18);
          vec3 gold=vec3(1.,.57,.095), ivory=vec3(1.,.98,.88);
          float heat=clamp(uStrength*(core>0.?.62+plume*.24+stream*.14:.08+plume*.40+stream*.38),0.,1.);
          vec3 color=mix(gold,ivory,heat);
          color*=.96+stream*.04;
          if(uLayer>1.5){alpha*=.32*(.35+stream*.65);color=mix(vec3(1.,.64,.12),ivory,stream*.8);}
          if(alpha<.002)discard;gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`,
    });
  }
  // Three broad layers preserve a dense center without a hard cylinder outline.
  for (const [layer, radius] of [[2,1.22],[1,1.08],[0,.85]]) {
    const beam=mesh(new THREE.CylinderGeometry(rules.radius*radius*.97,rules.radius*radius,20,64,32,true),beamMaterial(layer));
    beam.position.y=10; beam.name=layer===0?'Sonnenkern':layer===1?'Goldener Lichtvorhang':'Weicher Lichtsaum';
  }
  function groundMaterial(halo) {
    return new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
      blending:halo?THREE.AdditiveBlending:THREE.NormalBlending,
      uniforms:{uTime:clock,uStrength:strength},
      vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec2 vUv;uniform float uTime,uStrength;${noise}
        void main(){vec2 p=vUv*2.-1.;float r=length(p);
          float n=mist(p*3.+vec2(uTime*.2,-uTime*.28));
          float edge=1.-smoothstep(${halo?'.15,1.':'.72,1.'},r);
          float alpha=edge*${halo?'.27*uStrength': 'pow(uStrength,2.4)'};
          vec3 color=mix(vec3(1.,.66,.22),vec3(1.,.97,.83),uStrength*(.93+n*.07));
          if(alpha<.002)discard;gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`});
  }
  const halo=mesh(new THREE.CircleGeometry(rules.radius*1.32,64),groundMaterial(true));
  halo.rotation.x=-Math.PI/2;halo.position.y=.045;
  const disk=mesh(new THREE.CircleGeometry(rules.radius,64),groundMaterial(false));
  disk.name='Wachsende Sonnenhelligkeit';disk.rotation.x=-Math.PI/2;disk.position.y=.055;

  // Small rising gold motes have a bright head and a softer tail below it.
  // One bounded instanced draw retains the same geometry through every cast.
  const count=64, particleGeometry=new THREE.PlaneGeometry(1,1);
  const particleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    blending:THREE.AdditiveBlending,uniforms:{uStrength:strength},
    vertexShader:`varying vec2 vUv;varying float vFade;attribute float aFade;
      void main(){vUv=uv;vFade=aFade;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        gl_Position=projectionMatrix*center;}`,
    fragmentShader:`varying vec2 vUv;varying float vFade;uniform float uStrength;
      void main(){vec2 p=vUv*2.-1.;float head=exp(-dot(vec2(p.x*1.4,(p.y-.45)*2.8),vec2(p.x*1.4,(p.y-.45)*2.8))*3.);
        float tail=exp(-p.x*p.x*18.)*smoothstep(-1.,-.3,p.y)*(1.-smoothstep(.1,.65,p.y))*.28;
        float alpha=(head+tail)*vFade*(.16+.84*uStrength);
        if(alpha<.003)discard;gl_FragColor=vec4(mix(vec3(1.,.56,.12),vec3(1.,.96,.68),head),alpha);
        #include <colorspace_fragment>
      }`});
  materials.push(particleMaterial);geometries.push(particleGeometry);
  const particles=new THREE.InstancedMesh(particleGeometry,particleMaterial,count);particles.name='Aufsteigende Sonnenfunken';
  particles.frustumCulled=false;particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);root.add(particles);
  const fades=new Float32Array(count);particleGeometry.setAttribute('aFade',new THREE.InstancedBufferAttribute(fades,1));
  const transform=new THREE.Object3D();let state={phase:'idle',brightness:0,damageEligible:false}, visibleParticles=0;
  function show(center,age) {
    root.position.set(center.x,ground(center),center.z);
    root.visible=!isVisible||isVisible(center,{concealed:false});clock.value=age;state=solarEnvelope(age,rules);
    strength.value=state.brightness;visibleParticles=0;
    const exit=state.fading?state.brightness:1;
    for(let i=0;i<count;i++) {
      const duration=1.5+(i%7)*.17, cycle=((age/duration+i*.618034)%1+1)%1;
      const angle=i*2.399963+Math.sin(age*.4+i)*.09;
      const radius=rules.radius*(.68+(i%9)*.082);
      const y=.10+cycle*(3.1+(i%5)*.75);
      transform.position.set(Math.cos(angle)*radius+Math.sin(age*1.2+i)*.06,y,Math.sin(angle)*radius);
      const size=.13+(i%4)*.03;transform.scale.set(size,size*(2.7+(i%3)*.7),1);transform.updateMatrix();
      particles.setMatrixAt(i,transform.matrix);
      const emerge=THREE.MathUtils.smoothstep(age,.02+i%5*.025,.20+i%5*.025);
      fades[i]=Math.sin(cycle*Math.PI)*exit*emerge;
      if(fades[i]>.02)visibleParticles++;
    }
    particles.instanceMatrix.needsUpdate=true;particleGeometry.attributes.aFade.needsUpdate=true;
  }
  function hide(){root.visible=false;strength.value=0;visibleParticles=0;state={phase:'idle',brightness:0,damageEligible:false};}
  return {start(center){show(center,0);},show,hide,
    get telemetry(){return {visible:root.visible,...state,intensity:state.brightness,density:.98*state.brightness,
      groundFill:state.brightness,seedRadius:rules.radius,particleDirection:'up',risingParticles:visibleParticles,meshes:root.children.length};},
    dispose(){scene.remove(root);particles.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
