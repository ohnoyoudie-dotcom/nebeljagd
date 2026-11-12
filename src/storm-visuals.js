import * as THREE from 'three';

const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float cloud(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}`;
const cutouts = `uniform vec3 uCutouts[8];uniform int uCutoutCount;
float bodyClearance(){float alpha=1.;for(int i=0;i<8;i++){if(i>=uCutoutCount)break;
 float clear=smoothstep(uCutouts[i].z*.45,uCutouts[i].z,distance(gl_FragCoord.xy,uCutouts[i].xy));
 alpha*=mix(.08,1.,clear);}return alpha;}`;
const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const BOLT_SECONDS = .34, IMPACT_SECONDS = .46;

/** Instanced billows and sparks; pooled, camera-facing lightning ribbons.
 * Six draw calls, no lights, textures, postprocessing or per-frame geometry allocation. */
export function createStormVisuals(scene, rules, ground, isVisible) {
  const group = new THREE.Group(); group.name = 'Gewitter · kompaktes Auge'; group.visible = false; scene.add(group);
  const footprintGeometry = new THREE.CircleGeometry(rules.radius, 96); footprintGeometry.rotateX(-Math.PI / 2);
  const footprintMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uOpacity;
      void main(){float r=length(vUv*2.-1.);float rim=1.-smoothstep(.007,.018,abs(r-.98));
      gl_FragColor=vec4(mix(vec3(.10,.16,.22),vec3(.52,.69,.77),rim),uOpacity*(.035*(1.-r*r)+rim*.24));
      #include <colorspace_fragment>
      }`,
  });
  const footprint = new THREE.Mesh(footprintGeometry, footprintMaterial); footprint.name = 'Gewitter · dezente Wirkungsfläche'; group.add(footprint);
  const cloudUniforms = { uAge: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 },
    uCutouts: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uCutoutCount: { value: 0 } };
  const cloudMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: cloudUniforms,
    vertexShader: `uniform float uAge;varying vec3 vNormal,vLocal,vView;
      void main(){vec3 p=position;
        float breath=1.+.035*sin(uAge*2.1+instanceMatrix[3].x*4.+position.y*3.);
        p*=breath*(1.+.035*sin(p.x*9.+p.y*7.)*sin(p.z*8.-uAge*.7));
        vec4 local=instanceMatrix*vec4(p,1.);vLocal=local.xyz;
        vec3 scales=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        vNormal=normalize(mat3(modelMatrix)*normal/scales);
        vec4 world=modelMatrix*local;vView=cameraPosition-world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float uAge,uOpacity,uFlash;varying vec3 vNormal,vLocal,vView;${noise}${cutouts}
      void main(){vec3 n=normalize(vNormal);
        float grain=cloud(vLocal.xz*4.2+vLocal.y*2.1+vec2(uAge*.12,-uAge*.08));
        float light=clamp(dot(n,normalize(vec3(-.5,.9,.4)))*.5+.5,0.,1.);
        float top=smoothstep(-.5,.7,vLocal.y);
        vec3 shade=mix(vec3(.035,.055,.095),vec3(.38,.47,.57),pow(light,1.5)*(.48+.52*top));
        shade*=.78+grain*.4;
        float rim=pow(1.-abs(dot(n,normalize(vView))),2.8);
        shade+=vec3(.10,.16,.22)*rim*(.3+.7*light);
        float cell=cloud(vLocal.xz*3.4-vLocal.y+vec2(uAge*.07));
        float veins=pow(max(0.,1.-abs(cell-.52)*17.),3.);
        float heartbeat=.05*pow(.5+.5*sin(uAge*11.+vLocal.x*3.),8.);
        vec3 hotSpot=vec3(.40*sin(uAge*3.),-.12,.35*cos(uAge*2.));
        float pocket=exp(-dot(vLocal-hotSpot,vLocal-hotSpot)*2.8);
        float glow=(uFlash+heartbeat)*pocket;
        shade+=vec3(.18,.42,.80)*glow*(.55+veins*.45);
        float softEdge=1.-smoothstep(.65,1.,rim)*.72;
        gl_FragColor=vec4(shade,(.86+grain*.10)*softEdge*uOpacity*bodyClearance());
        #include <colorspace_fragment>
      }`,
  });
  const billows = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 12), cloudMaterial, 18);
  billows.name = 'Gewitterauge · plastische Gewitterwolke'; billows.position.y = 3.4; billows.frustumCulled = false;
  const transform = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const tier = i < 8 ? 0 : i < 14 ? 1 : 2, count = tier === 0 ? 8 : tier === 1 ? 6 : 4;
    const angle = i / count * Math.PI * 2 + tier * .7, radius = tier === 0 ? .83 : tier === 1 ? .57 : .28;
    transform.position.set(Math.cos(angle)*radius, tier*.32-.24+random(i)*.12, Math.sin(angle)*radius*.85);
    const size = .53+random(i+40)*.19;
    transform.scale.set(size, size*(tier === 0 ? .66 : .82), size*.91); transform.updateMatrix(); billows.setMatrixAt(i, transform.matrix);
  }
  group.add(billows);
  const mistGeometry = new THREE.PlaneGeometry(3.6, 3.2); mistGeometry.rotateX(-Math.PI/2);
  const mistMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: cloudUniforms,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uAge,uOpacity,uFlash;${noise}${cutouts}
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float f=cloud(p*4.+vec2(uAge*.17,-uAge*.12));
        float edge=1.-smoothstep(.45+f*.24,.78+f*.18,r);
        gl_FragColor=vec4(mix(vec3(.12,.18,.25),vec3(.24,.42,.62),uFlash),edge*.28*uOpacity*bodyClearance());
        #include <colorspace_fragment>
      }`,
  });
  const mist = new THREE.Mesh(mistGeometry, mistMaterial); mist.position.y=3.03; mist.name='Gewitter · wandernde Wolkenfetzen'; group.add(mist);
  // Only already-visible bodies receive a soft screen-space opening.
  const protectedPoints = [], screenSize = new THREE.Vector2(), head = new THREE.Vector3(), feet = new THREE.Vector3();
  billows.onBeforeRender = mist.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(screenSize);
    for (let i = 0; i < protectedPoints.length; i++) {
      const p = protectedPoints[i];
      feet.set(p.x, p.y ?? ground(p), p.z); head.copy(feet); head.y += 2.35;
      feet.project(camera); head.project(camera);
      const x = (head.x+feet.x)*.25+.5, y = (head.y+feet.y)*.25+.5;
      const radius = Math.max(8, Math.hypot((head.x-feet.x)*screenSize.x, (head.y-feet.y)*screenSize.y)*.36);
      cloudUniforms.uCutouts.value[i].set(x*screenSize.x, y*screenSize.y, radius);
    }
    cloudUniforms.uCutoutCount.value = protectedPoints.length;
  };

  const capacity = 24, segments = 24, vertices = capacity * segments * 6;
  const positions = new Float32Array(vertices*3), tangents = new Float32Array(vertices*3);
  const widths = new Float32Array(vertices), sides = new Float32Array(vertices), energies = new Float32Array(vertices);
  const boltGeometry = new THREE.BufferGeometry();
  for (const [name, array, size] of [['position',positions,3],['aTangent',tangents,3],['aWidth',widths,1],['aSide',sides,1],['aEnergy',energies,1]]) {
    boltGeometry.setAttribute(name, new THREE.BufferAttribute(array,size).setUsage(THREE.DynamicDrawUsage));
  }
  const boltMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    toneMapped: false, blending: THREE.NormalBlending,
    vertexShader: `attribute vec3 aTangent;attribute float aWidth,aSide,aEnergy;varying float vSide,vEnergy;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);vec3 t=mat3(modelViewMatrix)*aTangent;
        vec2 across=vec2(-t.y,t.x);across/=max(length(across),.001);
        p.xy+=across*aWidth*aSide;vSide=aSide;vEnergy=aEnergy;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vSide,vEnergy;
      void main(){float d=abs(vSide);float core=1.-smoothstep(.13,.30,d);
        float halo=pow(1.-d,2.);vec3 color=mix(vec3(.10,.40,1.),vec3(.87,.96,1.),core);
        gl_FragColor=vec4(color,(core*.95+halo*.48)*vEnergy);
        #include <colorspace_fragment>
      }`,
  });
  const bolts = new THREE.Mesh(boltGeometry, boltMaterial); bolts.name = 'Gewitter · verzweigte Einschläge'; bolts.frustumCulled = false; group.add(bolts);
  const slots = Array.from({ length: capacity }, () => ({ life: 0, x: 0, y: 0, z: 0, seed: 0 })); let cursor = 0, flash = 0;
  const impactGeometry = new THREE.PlaneGeometry(2,2); impactGeometry.rotateX(-Math.PI/2);
  const impactEnergy = new Float32Array(capacity), impactAge = new Float32Array(capacity);
  impactGeometry.setAttribute('aEnergy',new THREE.InstancedBufferAttribute(impactEnergy,1).setUsage(THREE.DynamicDrawUsage));
  impactGeometry.setAttribute('aAge',new THREE.InstancedBufferAttribute(impactAge,1).setUsage(THREE.DynamicDrawUsage));
  const impactMaterial = new THREE.ShaderMaterial({ transparent:true, depthWrite:false, side:THREE.DoubleSide, forceSinglePass:true,
    blending:THREE.AdditiveBlending, toneMapped:false,
    vertexShader:`attribute float aEnergy,aAge;varying vec2 vUv;varying float vEnergy,vAge;
      void main(){vUv=uv;vEnergy=aEnergy;vAge=aAge;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;varying float vEnergy,vAge;
      void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);
        float ring=exp(-pow((r-(.25+vAge*.5))*25.,2.))*.5;
        float jag=abs(sin(a*5.+sin(r*29.)*.6));
        float roots=(1.-smoothstep(.02,.10,jag))*(1.-smoothstep(.2,.9,r));
        float center=exp(-r*r*85.);float alpha=(center+ring+roots*.8)*vEnergy;
        gl_FragColor=vec4(mix(vec3(.18,.53,1.),vec3(.88,.97,1.),center),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const impacts = new THREE.InstancedMesh(impactGeometry,impactMaterial,capacity); impacts.name='Gewitter · elektrische Bodenentladung'; impacts.frustumCulled=false; group.add(impacts);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.06), new THREE.MeshBasicMaterial({ color:'#c9ecff',toneMapped:false }),capacity*6);
  sparks.name='Gewitter · aufsprühende Funken'; sparks.frustumCulled=false; group.add(sparks);
  const path = Array.from({length:13},()=>new THREE.Vector3());
  function segment(slot,index,a,b,width) {
    const base=(slot*segments+index)*6, dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;
    for(let v=0;v<6;v++) {
      const end=v===2||v===4||v===5, p=end?b:a, offset=(base+v)*3;
      positions[offset]=p.x;positions[offset+1]=p.y;positions[offset+2]=p.z;
      tangents[offset]=dx;tangents[offset+1]=dy;tangents[offset+2]=dz;
      widths[base+v]=width;sides[base+v]=v===0||v===3||v===5?-1:1;
    }
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  function strike(point, seed, lag=0) {
    if(lag>=IMPACT_SECONDS || isVisible&&!isVisible(point))return;
    const slot=cursor++%capacity,entry=slots[slot]; entry.life=IMPACT_SECONDS-lag;entry.seed=seed;
    entry.x=point.x-group.position.x;entry.y=point.y-group.position.y;entry.z=point.z-group.position.z;
    const sx=(random(seed+1)-.5)*.8,sz=(random(seed+2)-.5)*.8;
    for(let i=0;i<=12;i++) {
      const t=i/12,envelope=Math.sin(t*Math.PI),jitter=.42*envelope;
      path[i].set(sx+(entry.x-sx)*t+(random(seed*17+i*3)-.5)*jitter*2,
        3.35+(entry.y-3.35)*t+(random(seed*5+i*9)-.5)*envelope*.23,
        sz+(entry.z-sz)*t+(random(seed*23+i*7)-.5)*jitter*2);
      if(i)segment(slot,i-1,path[i-1],path[i],.20*(1-t*.35));
    }
    for(let branch=0;branch<3;branch++) {
      const node=3+branch*3,side=branch%2?1:-1; a.copy(path[node]);
      const angle=random(seed+branch*7)*Math.PI*2;
      for(let j=0;j<4;j++) {
        const t=(j+1)/4,base=path[Math.min(12,node+j+1)];
        b.set(base.x+Math.cos(angle)*t*.9+(random(seed+j+branch)-.5)*.22,
          base.y+.12*t,base.z+Math.sin(angle)*t*.9+side*(random(seed+j*11)-.5)*.18);
        segment(slot,12+branch*4+j,a,b,.095*(1-t*.65));a.copy(b);
      }
    }
    for(const name of ['position','aTangent','aWidth','aSide'])boltGeometry.attributes[name].needsUpdate=true;
    flash=Math.max(flash,Math.max(0,1-lag*5));paint();
  }
  function paint() {
    for(let i=0;i<capacity;i++) {
      const s=slots[i],age=IMPACT_SECONDS-s.life;
      const boltAge=age/BOLT_SECONDS;
      const flicker=age<.075?1:.35+.65*Math.pow(.5+.5*Math.cos(age*74),2.);
      const tail=Math.min(1,Math.max(0,(BOLT_SECONDS-age)/.13));
      const energy=s.life>0&&boltAge<1?tail*flicker:0;
      energies.fill(energy,i*segments*6,(i+1)*segments*6);
      impactEnergy[i]=s.life>0?Math.pow(s.life/IMPACT_SECONDS,1.3):0;impactAge[i]=age/IMPACT_SECONDS;
      transform.position.set(s.x,s.y+.025,s.z);transform.scale.setScalar(.62+age*.7);transform.updateMatrix();impacts.setMatrixAt(i,transform.matrix);
      for(let j=0;j<6;j++) {
        const angle=random(s.seed+j*3)*Math.PI*2,speed=.7+random(s.seed+j*9)*1.3;
        transform.position.set(s.x+Math.cos(angle)*age*speed,s.y+Math.max(0,age*(2.4+random(j+s.seed))-age*age*5),s.z+Math.sin(angle)*age*speed);
        transform.scale.setScalar(s.life>0?s.life/IMPACT_SECONDS*(.55+random(j)*.5):0);
        transform.rotation.set(age*8+j,angle,age*5);transform.updateMatrix();sparks.setMatrixAt(i*6+j,transform.matrix);
      }
      transform.rotation.set(0,0,0);
    }
    boltGeometry.attributes.aEnergy.needsUpdate=true;impactGeometry.attributes.aEnergy.needsUpdate=true;impactGeometry.attributes.aAge.needsUpdate=true;
    impacts.instanceMatrix.needsUpdate=true;sparks.instanceMatrix.needsUpdate=true;
  }
  function hide(){group.visible=false;slots.forEach(s=>{s.life=0;});flash=0;paint();}
  return {
    protect(points){protectedPoints.length=0;for(const p of points){if(protectedPoints.length===8)break;protectedPoints.push(p);}},
    start(center){hide();group.position.copy(center);const p=footprintGeometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setY(i,ground({x:center.x+p.getX(i),z:center.z+p.getZ(i)})-center.y+.07);
      p.needsUpdate=true;footprintGeometry.computeBoundingSphere();},
    strike,hide,
    update(dt){let changed=false;for(const s of slots)if(s.life>0){s.life=Math.max(0,s.life-dt);changed=true;}
      flash=Math.max(0,flash-dt*5);if(changed)paint();},
    show(center,age){group.visible=!isVisible||isVisible(center);
      const opacity=Math.min(1,age/rules.warning)*THREE.MathUtils.clamp(1-(age-rules.warning-rules.duration)/rules.fade,0,1);
      cloudUniforms.uAge.value=age;cloudUniforms.uOpacity.value=opacity;cloudUniforms.uFlash.value=flash;
      footprintMaterial.uniforms.uOpacity.value=opacity;},
    get telemetry(){return {style:'compact-storm-eye',cloudShape:'billowing-thunderhead',boltStyle:'forked-white-core',visible:group.visible,cloudRadius:1.75,
      capacity,bolts:slots.filter(s=>s.life>IMPACT_SECONDS-BOLT_SECONDS).length,impacts:slots.filter(s=>s.life>0).length,draws:group.visible?6:0};},
    dispose(){scene.remove(group);for(const mesh of [footprint,billows,mist,bolts,impacts,sparks]){mesh.geometry.dispose();mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}},
  };
}
