import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CASTLE_TORCH_LIMIT = 64;
const noRaycast = () => {};
const hash = value => { let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)/4294967296; };

const vertexShader = /* glsl */`
  attribute vec2 aTorch;
  attribute float aKind;
  uniform float uTime;
  varying vec2 vUv;
  varying float vKind;
  varying float vStrength;
  varying float vPhase;
  varying vec3 vWorld;
  void main() {
    vUv=uv;vKind=aKind;vStrength=aTorch.y;vPhase=aTorch.x;
    vec3 p=position;
    if(aKind<.5) {
      float height=uv.y;
      p.x+=sin(uTime*6.4+aTorch.x*6.283+height*4.)*.055*height*height;
      p.z+=sin(uTime*4.9+aTorch.x*8.+height*5.)*.034*height*height;
      p.y+=sin(uTime*7.1+aTorch.x*9.)*.045*height;
    } else if(aKind<3.5) {
      float t=fract(uTime*(.38+aTorch.x*.08)+aTorch.x+aKind*.31);
      p.y+=t*1.05;
      p.x+=sin(t*5.+aTorch.x*11.+aKind)*.09;
      p.z+=cos(t*4.+aKind*2.)*.06;
      vStrength*=sin(t*3.14159)*(.35+.3*step(1.5,aKind));
    }
    vec4 local=vec4(p,1.);
    #ifdef USE_INSTANCING
      local=instanceMatrix*local;
    #endif
    vWorld=(modelMatrix*local).xyz;
    gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uGlow;
  varying vec2 vUv;
  varying float vKind;
  varying float vStrength;
  varying float vPhase;
  varying vec3 vWorld;
  void main() {
    if(vStrength<.005) discard;
    float flicker=.91+.055*sin(uTime*8.1+vPhase*19.)+.035*sin(uTime*13.7+vPhase*31.);
    vec3 color;float alpha;
    if(vKind>3.5) {
      vec2 p=vUv*2.-1.;
      float falloff=pow(max(0.,1.-dot(p,p)),2.1);
      alpha=falloff*uGlow*flicker*vStrength;
      color=vec3(1.,.42,.105);
    } else if(vKind>.5) {
      float r=length(vUv*2.-1.);
      alpha=(1.-smoothstep(.25,1.,r))*.65*vStrength;
      color=vec3(1.,.66,.2);
    } else {
      float y=vUv.y;
      float bend=sin(y*9.-uTime*7.+vPhase*18.)*.06*y;
      float x=abs(vUv.x-.5-bend);
      float width=.34*pow(max(.001,1.-y),.68)+.025*sin(y*14.-uTime*9.+vPhase*11.);
      float body=(1.-smoothstep(width*.56,width+.045,x))*smoothstep(0.,.1,y)*(1.-smoothstep(.82,1.,y));
      float core=(1.-smoothstep(width*.10,width*.48,x))*(1.-smoothstep(.24,.72,y));
      color=mix(vec3(1.,.19,.025),vec3(1.,.64,.12),(1.-smoothstep(0.,.4,x))*.7);
      color=mix(color,vec3(1.,.94,.57),core);
      alpha=body*.91*flicker*vStrength;
    }
    if(alpha<.005)discard;
    gl_FragColor=vec4(color,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function tagged(geometry,kind) {
  const values=new Float32Array(geometry.attributes.position.count);values.fill(kind);
  geometry.setAttribute('aKind',new THREE.BufferAttribute(values,1));return geometry;
}
function translatedBox(w,h,d,x,y,z) { const geo=new THREE.BoxGeometry(w,h,d);geo.translate(x,y,z);return geo; }
function flameGeometry() {
  const parts=[];
  for(const rotation of [0,Math.PI/2]) {
    const plane=tagged(new THREE.PlaneGeometry(.48,.84,1,5),0);
    plane.translate(0,.42,0);plane.rotateY(rotation);parts.push(plane);
  }
  for(let i=1;i<=2;i++) {
    const spark=tagged(new THREE.PlaneGeometry(.027,.041),i);
    spark.rotateX(-.55);spark.translate((i-1.5)*.1,.28,.02);parts.push(spark);
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());
  geometry.computeBoundingBox();geometry.boundingBox.expandByScalar(.17);geometry.boundingBox.max.y+=.6;
  geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());return geometry;
}

/** Torches use surface-bound light washes rather than a point light per room.
 * A shared visibility callback suppresses every flame/ember/wash together when
 * the player cannot see the mount. Nothing lights through an adjacent wall. */
export function createCastleTorches({definition,seed=87123}={}) {
  const floor=definition?.floorHeight??.18;
  const mounts=(definition?.torches??[]).slice(0,CASTLE_TORCH_LIMIT).filter(m=>
    Number.isFinite(m.x)&&Number.isFinite(m.z)&&Array.isArray(m.normal)&&m.normal.length===2&&
    m.normal.every(Number.isFinite)&&Math.abs(Math.hypot(...m.normal)-1)<.001);
  const group=new THREE.Group();group.name='Schlossanlage · Fackeln';
  const effects=new THREE.Group();effects.name='Schlossanlage · warmes Fackellicht';group.add(effects);
  const geometries=new Set(),materials=new Set(),meshes=[];
  const torchData=new Float32Array(mounts.length*2);
  mounts.forEach((m,i)=>{torchData[i*2]=hash(`${seed}:${m.id??`${m.x}:${m.z}`}`);torchData[i*2+1]=1;});
  const attribute=new THREE.InstancedBufferAttribute(torchData,2);
  const clock={value:0};let disposed=false;
  const iron=new THREE.MeshStandardMaterial({color:'#332e29',metalness:.68,roughness:.69});iron.name='Schlossanlage · geschmiedete Fackelhalter';materials.add(iron);
  const makeEffect=(name,glow=0)=>{
    const material=new THREE.ShaderMaterial({name,uniforms:{uTime:clock,uGlow:{value:glow}},vertexShader,fragmentShader,
      transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    materials.add(material);return material;
  };
  const metalPieces=[translatedBox(.17,.42,.055,0,0,.015),translatedBox(.075,.075,.42,0,-.11,.22)];
  const bowl=new THREE.CylinderGeometry(.16,.075,.21,8,1,true);bowl.translate(0,.04,.41);metalPieces.push(bowl);
  const ring=new THREE.TorusGeometry(.15,.023,4,8);ring.rotateX(Math.PI/2);ring.translate(0,.145,.41);metalPieces.push(ring);
  for(const x of [-.052,.052])for(const y of [-.15,.15])metalPieces.push(translatedBox(.035,.035,.024,x,y,.056));
  const metalGeometry=mergeGeometries(metalPieces,false);metalPieces.forEach(p=>p.dispose());
  const fire=flameGeometry(),wall=tagged(new THREE.PlaneGeometry(2.3,2.25),4),ground=tagged(new THREE.PlaneGeometry(2.7,3.15),4);
  ground.rotateX(-Math.PI/2);
  const dummy=new THREE.Object3D();
  const batch=(name,geometry,material,parent,transform)=>{
    geometries.add(geometry);if(material.isShaderMaterial)geometry.setAttribute('aTorch',attribute);
    const mesh=new THREE.InstancedMesh(geometry,material,mounts.length);mesh.name=name;
    mounts.forEach((mount,index)=>{
      const height=floor+(mount.height??1.9),angle=Math.atan2(mount.normal[0],mount.normal[1]);
      dummy.position.set(mount.x,height,mount.z);dummy.rotation.set(0,angle,0);dummy.scale.set(1,1,1);
      transform?.(dummy,mount,height);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
    mesh.castShadow=false;mesh.receiveShadow=!material.isShaderMaterial;
    // Architectural visibility comes from walls, never these decorative meshes.
    mesh.raycast=noRaycast;parent.add(mesh);meshes.push(mesh);return mesh;
  };
  batch('Geschmiedete Wandhalter',metalGeometry,iron,group);
  batch('Fackelflammen und kleine Glutfunken',fire,makeEffect('Schlossanlage · lebendige Fackelflamme'),effects,(d,m,y)=>{
    d.position.set(m.x+m.normal[0]*.41,y+.15,m.z+m.normal[1]*.41);
  });
  batch('Warmes Licht auf dem Mauerwerk',wall,makeEffect('Schlossanlage · Lichtschein am Stein',.18),effects,(d,m,y)=>{
    d.position.set(m.x+m.normal[0]*.032,y-.02,m.z+m.normal[1]*.032);
  });
  batch('Warmes Licht auf den Bodenplatten',ground,makeEffect('Schlossanlage · Lichtschein am Boden',.19),effects,(d,m)=>{
    d.position.set(m.x+m.normal[0]*1.61,floor+.006,m.z+m.normal[1]*1.61);
  });
  const sample={x:0,y:0,z:0};let active=mounts.length;
  const stats={mounts:mounts.length,drawCalls:meshes.length,pointLights:0,triangles:meshes.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count,0)};
  group.userData.castleTorches={...stats,activeMounts:active,elapsed:0};
  return {group,stats,
    update(dt,time,playerLocal,{quality='high',visible=true,isVisible}={}) {
      if(disposed)return;
      if(Number.isFinite(dt)&&dt>0)clock.value+=Math.min(dt,.25);
      effects.visible=visible;active=0;
      const far=quality==='low'?32:44;
      for(let i=0;i<mounts.length;i++) {
        const m=mounts[i];sample.x=m.x+m.normal[0]*.45;sample.z=m.z+m.normal[1]*.45;sample.y=floor+(m.height??1.9)+.3;
        const distance=playerLocal?Math.hypot(sample.x-playerLocal.x,sample.z-playerLocal.z):0;
        let strength=visible?1-THREE.MathUtils.smoothstep(distance,far-8,far):0;
        if(strength>.001&&isVisible&&!isVisible(sample))strength=0;
        torchData[i*2+1]=strength;if(strength>.001)active++;
      }
      attribute.needsUpdate=true;
      group.userData.castleTorches.activeMounts=active;group.userData.castleTorches.elapsed=clock.value;
    },
    dispose() {
      if(disposed)return;disposed=true;
      meshes.forEach(mesh=>mesh.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();
    },
  };
}
