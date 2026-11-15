import * as THREE from 'three';
const smooth=THREE.MathUtils.smoothstep;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment,uniforms){return new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});}
function billboard(mesh){mesh.onBeforeRender=(_r,_s,c)=>{mesh.parent.getWorldQuaternion(mesh.quaternion).invert().multiply(c.quaternion);mesh.updateMatrixWorld(true);};}
export function disposeVisual(root){const g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const x of Array.isArray(o.material)?o.material:[o.material])if(x)m.add(x);if(o.isInstancedMesh)o.dispose();});root.removeFromParent();g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}
function fogMaterial(){return shader(`varying vec2 vUv;uniform float uTime,uOpacity,uSeed;
 void main(){vec2 p=vUv*2.-1.;float a=atan(p.y,p.x),r=length(p);
  float edge=.71+.12*sin(a*3.+uTime*.9+uSeed)+.065*sin(a*7.-uTime*1.2);
  float cloud=(1.-smoothstep(edge-.28,edge+.12,r))*(.75+.2*sin(p.x*7.+sin(p.y*6.+uTime)+uSeed));
  float glow=exp(-pow((r-edge+.08)/.12,2.))*.3;
  gl_FragColor=vec4(mix(vec3(.012,.008,.024),vec3(.16,.055,.28),glow),cloud*uOpacity);
  #include <colorspace_fragment>
 }`,{uTime:{value:0},uOpacity:{value:0},uSeed:{value:0}});}
export function createShadowVisuals(scene,r,isVisible){
 const root=new THREE.Group();root.name='Schattenfeld · lebender Nebel';scene.add(root);root.visible=false;
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(r.radius*2.4,r.radius*2.4),shader(`varying vec2 vUv;uniform float uTime,uOpacity;
  void main(){vec2 p=(vUv*2.-1.)*1.2;float r=length(p),a=atan(p.y,p.x);
   float edge=.95+.025*sin(a*7.+uTime)+.045*sin(a*3.-uTime*.7);
   float density=1.-smoothstep(edge-.15,edge+.09,r);
   float veins=pow(max(0.,sin(r*21.-a*3.+uTime*1.4+sin(a*5.+uTime)*1.5)),18.);
   float swirls=sin(p.x*8.+sin(p.y*8.-uTime))*sin(p.y*11.+uTime);
   vec3 color=vec3(.009,.006,.018)+vec3(.025,.012,.045)*(swirls*.5+.5)+vec3(.15,.035,.29)*veins*smoothstep(.1,.6,r)*.6;
   gl_FragColor=vec4(color,density*.93*uOpacity);
   #include <colorspace_fragment>
  }`,{uTime:{value:0},uOpacity:{value:0}}));surface.rotation.x=-Math.PI/2;surface.position.y=.045;surface.renderOrder=2;root.add(surface);
 const fog=Array.from({length:12},(_,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(2.1,1.6),fogMaterial());m.material.uniforms.uSeed.value=i*1.7;billboard(m);root.add(m);return m;});
 const pulse=new THREE.Mesh(new THREE.RingGeometry(.88,1,64),new THREE.MeshBasicMaterial({color:'#9652cb',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));pulse.rotation.x=-Math.PI/2;pulse.position.y=.065;root.add(pulse);
 const flight=new THREE.Group();flight.name='Schattenkugel · violetter Rauchschweif';scene.add(flight);flight.visible=false;
 const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.24,2),new THREE.MeshStandardMaterial({color:'#160b27',emissive:'#3d125d',emissiveIntensity:.8,roughness:.44,metalness:.15}));flight.add(orb);
 const tail=Array.from({length:14},(_,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(.95,.95),fogMaterial());m.material.uniforms.uSeed.value=i;billboard(m);scene.add(m);m.visible=false;return m;});
 let flightStarted=false,clock=0,age=0;
 function flying(p,t){if(!flightStarted){for(const m of tail)m.position.copy(p);flightStarted=true;}
  flight.position.copy(p);flight.visible=!isVisible||isVisible(p);orb.rotation.set(t*9,t*13,t*5);orb.scale.setScalar(1+.12*Math.sin(t*37));
  for(let i=tail.length-1;i>0;i--)tail[i].position.copy(tail[i-1].position);tail[0].position.copy(p);
  tail.forEach((m,i)=>{m.visible=flight.visible&&(!isVisible||isVisible(m.position));m.scale.setScalar(.55+i*.045);m.material.uniforms.uTime.value=clock+i*.1;m.material.uniforms.uOpacity.value=(1-i/tail.length)*.66;});
 }
 function endFlight(){flightStarted=false;flight.visible=false;tail.forEach(m=>m.visible=false);}
 function field(center,t){age=t;root.position.copy(center);root.visible=(!isVisible||isVisible(center))&&t<r.duration+r.fade;
  const opacity=smooth(t,0,.11)*(1-smooth(t,r.duration,r.duration+r.fade)),expansion=.45+.55*smooth(t,0,.16),drift=Math.max(0,t-r.duration);
  surface.scale.setScalar(expansion);surface.material.uniforms.uTime.value=t;surface.material.uniforms.uOpacity.value=opacity;
  fog.forEach((m,i)=>{const a=i*2.399+t*(i%2?.07:-.09),radius=(.25+(i%4)*.18)*r.radius;
   m.position.set(Math.cos(a)*radius,.22+(i%3)*.15+Math.sin(t*1.4+i)*.09+drift*.9,Math.sin(a)*radius);m.scale.setScalar((.7+(i%3)*.12)*expansion*(1+drift*.3));
   m.material.uniforms.uTime.value=t;m.material.uniforms.uOpacity.value=opacity*.6;});
  pulse.scale.setScalar(.2+r.radius*smooth(t,0,.3));pulse.material.opacity=(1-smooth(t,.03,.36))*.48;
 }
 function reset(){root.visible=false;endFlight();age=clock=0;}
 return{flying,endFlight,field,update(dt){clock+=dt;},reset,get telemetry(){return{style:'ink-violet-billowing-field',visible:root.visible,age,cloudLayers:12,flightVisible:flight.visible};},dispose(){disposeVisual(root);disposeVisual(flight);for(const m of tail)disposeVisual(m);}};
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
