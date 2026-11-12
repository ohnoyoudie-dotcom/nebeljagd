import * as THREE from 'three';
import { createStormCloud } from './storm-cloud.js';

const random = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const BOLT_SECONDS = .42, IMPACT_SECONDS = .55;

/** Animated cloud artwork and instanced sparks; pooled, camera-facing lightning ribbons.
 * Six draw calls, one shared texture, no lights, postprocessing or per-frame geometry allocation. */
export function createStormVisuals(scene, rules, ground, isVisible, texture = null) {
  const group = new THREE.Group(); group.name = 'Gewitter · kompaktes Auge'; group.visible = false; scene.add(group);
  const footprintGeometry = new THREE.CircleGeometry(rules.radius, 96); footprintGeometry.rotateX(-Math.PI / 2);
  const footprintMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: { uOpacity: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float uOpacity,uFlash;
      void main(){float r=length(vUv*2.-1.);float rim=1.-smoothstep(.007,.018,abs(r-.98));
      vec3 tint=mix(vec3(.08,.12,.18),vec3(.42,.57,.68),rim);
      tint=mix(tint,vec3(.36,.61,1.),uFlash*.8);
      gl_FragColor=vec4(tint,uOpacity*(.035*(1.-r*r)+rim*.15+uFlash*.16*(1.-r*r)));
      #include <colorspace_fragment>
      }`,
  });
  const footprint = new THREE.Mesh(footprintGeometry, footprintMaterial); footprint.name = 'Gewitter · dezente Wirkungsfläche'; group.add(footprint);
  const cloudUniforms = { uAge: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 },
    uCutouts: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, uCutoutCount: { value: 0 } };
  const cloud = createStormCloud(cloudUniforms, texture);
  group.add(...cloud.meshes);
  const transform = new THREE.Object3D();
  // Only already-visible bodies receive a soft screen-space opening.
  const protectedPoints = [], screenSize = new THREE.Vector2(), head = new THREE.Vector3(), feet = new THREE.Vector3();
  const prepareCutouts = (renderer, _scene, camera) => {
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

  for (const mesh of cloud.meshes) mesh.onBeforeRender=prepareCutouts;
  const capacity = 24, segments = 54, vertices = capacity * segments * 6;
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
      void main(){float d=abs(vSide);float core=1.-smoothstep(.14,.32,d);
        float halo=pow(1.-d,1.6);vec3 color=mix(vec3(.09,.34,1.),vec3(.94,.98,1.),core);
        gl_FragColor=vec4(color,min(1.,core+halo*.75)*vEnergy);
        #include <colorspace_fragment>
      }`,
  });
  const bolts = new THREE.Mesh(boltGeometry, boltMaterial); bolts.name = 'Gewitter · verzweigte Einschläge'; bolts.frustumCulled = false; group.add(bolts);
  const slots = Array.from({ length: capacity }, () => ({ life: 0, x: 0, y: 0, z: 0, seed: 0, energy: 0 })); let cursor = 0, flash = 0;
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
        float blast=exp(-r*r*7.)*pow(1.-vAge,3.)*.7;
        float jag=abs(sin(a*6.+sin(r*24.+a*3.)*.8));
        float roots=(1.-smoothstep(.02,.10,jag))*(1.-smoothstep(.2,.9,r));
        float center=exp(-r*r*45.);float alpha=(center+blast+roots)*vEnergy;
        gl_FragColor=vec4(mix(vec3(.18,.53,1.),vec3(.88,.97,1.),center),alpha);
        #include <colorspace_fragment>
      }`,
  });
  const impacts = new THREE.InstancedMesh(impactGeometry,impactMaterial,capacity); impacts.name='Gewitter · elektrische Bodenentladung'; impacts.frustumCulled=false; group.add(impacts);
  const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(.10), new THREE.MeshBasicMaterial({ color:'#c9ecff',toneMapped:false }),capacity*6);
  sparks.name='Gewitter · aufsprühende Funken'; sparks.frustumCulled=false; group.add(sparks);
  const path = Array.from({length:25},()=>new THREE.Vector3());
  const anchors = Array.from({length:5},()=>new THREE.Vector3());
  function segment(slot,index,a,b,widthA,widthB,tangentA,tangentB) {
    const base=(slot*segments+index)*6;
    for(let v=0;v<6;v++) {
      const end=v===2||v===4||v===5, p=end?b:a, offset=(base+v)*3;
      positions[offset]=p.x;positions[offset+1]=p.y;positions[offset+2]=p.z;
      const tangent=end?tangentB:tangentA;
      tangents[offset]=tangent.x;tangents[offset+1]=tangent.y;tangents[offset+2]=tangent.z;
      widths[base+v]=end?widthB:widthA;sides[base+v]=v===0||v===3||v===5?-1:1;
    }
  }
  const tangentA=new THREE.Vector3(),tangentB=new THREE.Vector3();
  const branchPath=Array.from({length:7},()=>new THREE.Vector3());
  function polyline(slot,offset,nodes,widthStart,widthEnd) {
    const count=nodes.length-1;
    for(let i=0;i<count;i++) {
      // Both segments at a corner share the same centre, width and extrusion
      // direction. This closes the triangular holes of independent quads.
      tangentA.subVectors(nodes[i+1],nodes[Math.max(0,i-1)]).normalize();
      tangentB.subVectors(nodes[Math.min(count,i+2)],nodes[i]).normalize();
      segment(slot,offset+i,nodes[i],nodes[i+1],
        widthStart+(widthEnd-widthStart)*i/count,widthStart+(widthEnd-widthStart)*(i+1)/count,tangentA,tangentB);
    }
  }
  function strike(point, seed, lag=0) {
    if(lag>=IMPACT_SECONDS || isVisible&&!isVisible(point))return;
    const slot=cursor++%capacity,entry=slots[slot]; entry.life=IMPACT_SECONDS-lag;entry.seed=seed;
    entry.x=point.x-group.position.x;entry.y=point.y-group.position.y;entry.z=point.z-group.position.z;
    const sx=(random(seed+1)-.5)*.8,sz=(random(seed+2)-.5)*.8;
    // Large directional breaks define the trunk; small kinks subdivide it.
    // Independent per-node noise alone reads as a thin random wire.
    const length=Math.hypot(entry.x-sx,entry.z-sz)||1;
    const nx=(entry.z-sz)/length,nz=-(entry.x-sx)/length;
    for(let k=0;k<5;k++) {
      const t=k/4,bend=k===0||k===4?0:(k%2?1:-1)*(.34+random(seed+k)*.25);
      anchors[k].set(sx+(entry.x-sx)*t+nx*bend,3.35+(entry.y-3.35)*t,sz+(entry.z-sz)*t+nz*bend);
    }
    for(let i=0;i<=24;i++) {
      const section=Math.min(3,Math.floor(i/6)),t=(i-section*6)/6;
      path[i].lerpVectors(anchors[section],anchors[section+1],t);
      if(i%6) {const kink=(random(seed*17+i*7)-.5)*.15;path[i].x+=nx*kink;path[i].z+=nz*kink;}

    }
    polyline(slot,0,path,.27,.18);
    for(let branch=0;branch<5;branch++) {
      const node=4+branch*4,side=branch%2?1:-1; branchPath[0].copy(path[node]);
      const angle=Math.atan2(entry.z-sz,entry.x-sx)+side*(.65+random(seed+branch*7)*.45);
      for(let j=0;j<6;j++) {
        const t=(j+1)/6,base=path[Math.min(24,node+j+1)];
        branchPath[j+1].set(base.x+Math.cos(angle)*t*1.05+(random(seed+j+branch)-.5)*.22,
          base.y+.12*t,base.z+Math.sin(angle)*t*1.05+side*(random(seed+j*11)-.5)*.18);

      }
      polyline(slot,24+branch*6,branchPath,.075,.005);
    }
    for(const name of ['position','aTangent','aWidth','aSide'])boltGeometry.attributes[name].needsUpdate=true;
    flash=Math.max(flash,Math.max(0,1-lag*5));paint();
  }
  function paint() {
    for(let i=0;i<capacity;i++) {
      const s=slots[i],age=IMPACT_SECONDS-s.life;
      const boltAge=age/BOLT_SECONDS;
      // A thunderbolt extinguishes between return strokes instead of becoming
      // a lingering translucent line across the field.
      const energy=s.life>0&&boltAge<1?(age<.14?1:age<.18?0:age<.28?.98:age<.32?0:.90):0;
      s.energy=energy;flash=Math.max(flash,energy*.8);
      energies.fill(energy,i*segments*6,(i+1)*segments*6);
      impactEnergy[i]=s.life>0?Math.pow(s.life/IMPACT_SECONDS,1.3):0;impactAge[i]=age/IMPACT_SECONDS;
      transform.position.set(s.x,s.y+.025,s.z);transform.scale.setScalar(.9+age*.8);transform.updateMatrix();impacts.setMatrixAt(i,transform.matrix);
      for(let j=0;j<6;j++) {
        const angle=random(s.seed+j*3)*Math.PI*2,speed=1.1+random(s.seed+j*9)*2.1;
        transform.position.set(s.x+Math.cos(angle)*age*speed,s.y+Math.max(0,age*(3.4+random(j+s.seed))-age*age*5),s.z+Math.sin(angle)*age*speed);
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
      flash=Math.max(0,flash-dt*6);if(changed)paint();},
    show(center,age){group.visible=!isVisible||isVisible(center);
      const opacity=Math.min(1,age/rules.warning)*THREE.MathUtils.clamp(1-(age-rules.warning-rules.duration)/rules.fade,0,1);
      cloudUniforms.uAge.value=age;cloudUniforms.uOpacity.value=opacity;cloudUniforms.uFlash.value=flash;
      footprintMaterial.uniforms.uOpacity.value=opacity;footprintMaterial.uniforms.uFlash.value=flash;},
    get telemetry(){return {style:'compact-storm-eye',cloudShape:'reference-thunderhead',artwork:cloud.artwork,boltStyle:'hierarchical-thunderbolts',visible:group.visible,cloudRadius:cloud.horizontalRadius,
      capacity,bolts:slots.filter(s=>s.energy>0).length,impacts:slots.filter(s=>s.life>0).length,draws:group.visible?4+cloud.meshes.length:0};},
    dispose(){scene.remove(group);cloud.dispose();for(const mesh of [footprint,bolts,impacts,sparks]){mesh.geometry.dispose();mesh.material.dispose();if(mesh.isInstancedMesh)mesh.dispose();}},
  };
}
