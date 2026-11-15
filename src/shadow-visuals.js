import * as THREE from 'three';
const smooth=THREE.MathUtils.smoothstep;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment,uniforms){return new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});}
function billboard(mesh){mesh.onBeforeRender=(_r,_s,c)=>{mesh.parent.getWorldQuaternion(mesh.quaternion).invert().multiply(c.quaternion);mesh.updateMatrixWorld(true);};}
export function disposeVisual(root){const g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const x of Array.isArray(o.material)?o.material:[o.material])if(x)m.add(x);if(o.isInstancedMesh)o.dispose();});root.removeFromParent();g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}
const mistNoise=`
 float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
 float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}
 float fbm(vec2 p){float n=0.;float a=.55;for(int i=0;i<3;i++){n+=a*noise2(p);p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(13.1,7.9);a*=.5;}return n;}
`;
function fogMaterial(){return shader(`varying vec2 vUv;uniform float uTime,uOpacity,uSeed;
 ${mistNoise}
 void main(){vec2 p=vUv*2.-1.;
  vec2 drift=vec2(uTime*.12+uSeed,uTime*-.16);
  vec2 warp=vec2(fbm(p*2.4+drift),fbm(p*2.4-drift+7.3));
  float billow=fbm(p*3.1+warp*1.8+drift),shape=1.-smoothstep(.36,.98,length(p)+(.5-billow)*.23);
  float crest=smoothstep(.38,.76,billow),cloud=shape*smoothstep(.12,.8,billow)*1.55;
  vec3 color=mix(vec3(.018,.021,.036),vec3(.105,.085,.16),crest);
  gl_FragColor=vec4(color,cloud*uOpacity);
  #include <colorspace_fragment>
 }`,{uTime:{value:0},uOpacity:{value:0},uSeed:{value:0}});}
export function createShadowVisuals(scene,r,isVisible,world){
 const root=new THREE.Group();root.name='Schattenfeld · lebender Nebel';scene.add(root);root.visible=false;
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(r.radius*2.4,r.radius*2.4,24,24),shader(`varying vec2 vUv;uniform float uTime,uOpacity;
  ${mistNoise}
  void main(){vec2 p=(vUv*2.-1.)*1.2;float radius=length(p);
   vec2 flow=vec2(uTime*.055,-uTime*.09);
   vec2 warp=vec2(fbm(p*3.+flow),fbm(p*3.-flow+5.7));
   float cloud=fbm(p*5.+warp*1.65+flow),detail=fbm(p*9.-flow*1.7);
   float boundary=1.-smoothstep(.86,.995,radius);
   float feather=1.-smoothstep(.9,1.13,radius+(.5-cloud)*.17);
   float density=feather*mix(.57,.94,smoothstep(.12,.8,cloud));
   float filaments=exp(-pow((cloud-.47)/.018,2.))*smoothstep(.43,.75,detail);
   float arrival=exp(-pow((radius-uTime*3.2)/.12,2.))*(1.-smoothstep(.12,.48,uTime));
   vec3 color=mix(vec3(.012,.015,.026),vec3(.055,.041,.085),cloud);
   color+=vec3(.055,.018,.10)*filaments*.45+vec3(.09,.035,.16)*arrival;
   // A subdued boundary defines gameplay range without neon contour rings.
   color+=vec3(.025,.012,.045)*(1.-boundary)*feather;
   gl_FragColor=vec4(color,density*uOpacity);
   #include <colorspace_fragment>
  }`,{uTime:{value:0},uOpacity:{value:0}}));surface.rotation.x=-Math.PI/2;surface.position.y=.045;surface.renderOrder=2;root.add(surface);
 const fog=Array.from({length:18},(_,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(i<12?3.5:1.8,i<12?2.4:2.2),fogMaterial());m.material.uniforms.uSeed.value=i*1.7;billboard(m);root.add(m);return m;});
 const flight=new THREE.Group();flight.name='Schattenkugel · violetter Rauchschweif';scene.add(flight);flight.visible=false;
 const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,2),new THREE.MeshStandardMaterial({color:'#160b27',emissive:'#3d125d',emissiveIntensity:.8,roughness:.44,metalness:.15}));flight.add(orb);
 const tail=Array.from({length:14},(_,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(.95,.95),fogMaterial());m.material.uniforms.uSeed.value=i;billboard(m);scene.add(m);m.visible=false;return m;});
 let flightStarted=false,clock=0,age=0,fieldPlaced=false;
 function flying(p,t){if(!flightStarted){for(const m of tail)m.position.copy(p);flightStarted=true;}
  flight.position.copy(p);flight.visible=!isVisible||isVisible(p);orb.rotation.set(t*9,t*13,t*5);orb.scale.setScalar(1+.12*Math.sin(t*37));
  for(let i=tail.length-1;i>0;i--)tail[i].position.copy(tail[i-1].position);tail[0].position.copy(p);
  tail.forEach((m,i)=>{m.visible=flight.visible&&(!isVisible||isVisible(m.position));m.scale.setScalar(.55+i*.045);m.material.uniforms.uTime.value=clock+i*.1;m.material.uniforms.uOpacity.value=(1-i/tail.length)*.66;});
 }
 function endFlight(){flightStarted=false;flight.visible=false;tail.forEach(m=>m.visible=false);}
 function field(center,t){age=t;root.position.copy(center);root.visible=(!isVisible||isVisible(center))&&t<r.duration+r.fade;
  if(!fieldPlaced){const pos=surface.geometry.attributes.position;
   for(let i=0;i<pos.count;i++)pos.setZ(i,(world?.heightAt?.(center.x+pos.getX(i),center.z-pos.getY(i))??center.y)-center.y);
   pos.needsUpdate=true;surface.geometry.computeBoundingSphere();fieldPlaced=true;
  }
  const opacity=smooth(t,0,.15)*(1-smooth(t,r.duration,r.duration+r.fade)),expansion=.65+.35*smooth(t,0,.22),drift=Math.max(0,t-r.duration);
  surface.material.uniforms.uTime.value=t;surface.material.uniforms.uOpacity.value=opacity;
  fog.forEach((m,i)=>{const a=i*2.399+t*(i%2?.13:-.10),radius=(i<12?.12+(i%4)*.16:.68)*r.radius;
   const x=Math.cos(a)*radius,z=Math.sin(a)*radius,ground=(world?.heightAt?.(center.x+x,center.z+z)??center.y)-center.y;
   m.position.set(x,ground+.24+(i%3)*.14+Math.sin(t*1.6+i)*.1+drift*(i<12?.8:1.5),z);
   m.scale.set((.86+(i%3)*.12)*expansion*(1+drift*.35),(.78+(i%4)*.09)*(1+drift*.75),1);
   m.material.uniforms.uTime.value=t;m.material.uniforms.uOpacity.value=opacity*(i<12?.66:.32);});
 }
 function reset(){root.visible=false;endFlight();age=clock=0;fieldPlaced=false;}
 return{flying,endFlight,field,update(dt){clock+=dt;},reset,get telemetry(){return{style:'layered-ground-mist',visible:root.visible,age,cloudLayers:fog.length,terrainFollowing:true,flightVisible:flight.visible};},dispose(){disposeVisual(root);disposeVisual(flight);for(const m of tail)disposeVisual(m);}};
}

/** No markers for concealed or occluded targets, including their radius rings. */
export function createDarkenedIndicators(scene,combat,world,isVisible,viewerId='player'){
 const entries=new Map(),free=[],allocated=[],matrix=new THREE.Object3D();let time=0;
 function make(){const root=new THREE.Group();scene.add(root);
  const icon=new THREE.Mesh(new THREE.PlaneGeometry(.58,.42),shader(`varying vec2 vUv;
   void main(){vec2 p=vUv*2.-1.;float eye=exp(-pow((length(p/vec2(.85,.5))-1.)/.075,2.));
    float slash=exp(-pow((p.x+p.y*.95)/.085,2.))*(1.-smoothstep(.6,.9,length(p)));
    float iris=1.-smoothstep(.13,.23,length(p));float a=max(max(eye,iris*.7),slash);
    gl_FragColor=vec4(.84,.76,1.,a);#include <colorspace_fragment>
   }`.replace(';#include',';\n#include'),{}));icon.position.y=3.7;billboard(icon);root.add(icon);
  const ring=new THREE.Mesh(new THREE.RingGeometry(2.46,2.5,64),new THREE.MeshBasicMaterial({color:'#8e70c3',transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.055;root.add(ring);
  const smoke=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.075,1),new THREE.MeshBasicMaterial({color:'#392047',transparent:true,opacity:.5,depthWrite:false}),8);smoke.frustumCulled=false;root.add(smoke);const entry={root,icon,ring,smoke};allocated.push(entry);return entry;}
 function update(dt){time+=Math.max(0,dt);const live=new Set();
  for(const t of combat.targets.values()){
   if(!t.alive||!(t.darkenedRemaining>0)||t.darkenedSourceId!==viewerId&&!t.local)continue;
   const concealed=t.revealRemaining<=0&&(t.concealed||(world?.concealmentAt?.(t.position.x,t.position.z)??0)>.01);
   if(!t.local&&(concealed||isVisible&&!isVisible(t.position,{concealed})))continue;
   if(!entries.has(t.id)&&(free.length||allocated.length<64))entries.set(t.id,free.pop()??make());const e=entries.get(t.id);if(!e)continue;live.add(t.id);
   e.root.visible=true;e.root.position.copy(t.position);e.icon.position.y=3.7+Math.sin(time*2)*.04;e.ring.scale.setScalar(t.darkenedRadius/2.5);
   for(let i=0;i<8;i++){const a=i*2.4+time*.7,y=(time*.4+i*.13)%1;matrix.position.set(Math.cos(a)*.4,.25+y*1.6,Math.sin(a)*.4);matrix.scale.setScalar(Math.sin(y*Math.PI)*(.6+i%3*.2));matrix.updateMatrix();e.smoke.setMatrixAt(i,matrix.matrix);}e.smoke.instanceMatrix.needsUpdate=true;
  }
  for(const [id,e] of entries)if(!live.has(id)){e.root.visible=false;free.push(e);entries.delete(id);}
 }
 function reset(){for(const e of entries.values()){e.root.visible=false;free.push(e);}entries.clear();time=0;}
 return{update,reset,dispose(){reset();allocated.forEach(e=>disposeVisual(e.root));allocated.length=free.length=0;},get telemetry(){return{visibleTargets:[...entries.keys()],allocated:allocated.length};}};
}
