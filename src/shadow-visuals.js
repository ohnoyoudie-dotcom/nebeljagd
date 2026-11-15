import * as THREE from 'three';
import { createSoulCloudVisual } from './soul-cloud-visual.js';
const smooth=THREE.MathUtils.smoothstep;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment,uniforms){return new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,forceSinglePass:true});}
function billboard(mesh){mesh.onBeforeRender=(_r,_s,c)=>{mesh.parent.getWorldQuaternion(mesh.quaternion).invert().multiply(c.quaternion);mesh.updateMatrixWorld(true);};}
export function disposeVisual(root){const g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const x of Array.isArray(o.material)?o.material:[o.material])if(x)m.add(x);if(o.isInstancedMesh)o.dispose();});root.removeFromParent();g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());}
const mistNoise=`
 float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
 float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);}
 float fbm(vec2 p){float n=0.;float a=.55;for(int i=0;i<3;i++){n+=a*noise2(p);p=mat2(.8,-.6,.6,.8)*p*2.03+vec2(13.1,7.9);a*=.5;}return n;}
`;
function fogMaterial(){const material=shader(`varying vec2 vUv;varying float vHeight;uniform float uTime,uOpacity,uSeed,uGround;
 ${mistNoise}
 void main(){vec2 p=vUv*2.-1.;
  vec2 drift=vec2(uTime*.12+uSeed,uTime*-.16);
  vec2 warp=vec2(fbm(p*2.4+drift),fbm(p*2.4-drift+7.3));
  float billow=fbm(p*3.1+warp*1.8+drift),shape=1.-smoothstep(.36,.98,length(p)+(.5-billow)*.23);
  float crest=smoothstep(.38,.76,billow),cloud=shape*smoothstep(.08,.70,billow)*1.95;
  vec3 color=mix(vec3(.0008,.0010,.0015),vec3(.008,.009,.012),crest);
  gl_FragColor=vec4(color,cloud*uOpacity*smoothstep(.03,.55,vHeight-uGround));
  #include <colorspace_fragment>
 }`,{uTime:{value:0},uOpacity:{value:0},uSeed:{value:0},uGround:{value:0}});
 material.vertexShader=`varying vec2 vUv;varying float vHeight;void main(){vUv=uv;vec4 p=modelMatrix*vec4(position,1.);vHeight=p.y;gl_Position=projectionMatrix*viewMatrix*p;}`;return material;}
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
   vec3 color=mix(vec3(.001,.0012,.0018),vec3(.007,.008,.011),cloud);
   color+=vec3(.009,.008,.013)*filaments*.25+vec3(.012,.011,.018)*arrival;
   // A subdued boundary defines gameplay range without neon contour rings.
   color+=vec3(.004,.004,.006)*(1.-boundary)*feather;
   gl_FragColor=vec4(color,density*uOpacity);
   #include <colorspace_fragment>
  }`,{uTime:{value:0},uOpacity:{value:0}}));surface.rotation.x=-Math.PI/2;surface.position.y=.045;surface.renderOrder=2;root.add(surface);
 const fog=Array.from({length:28},(_,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(i<20?3.35:2.1,i<20?3.1:2.6),fogMaterial());m.name='Schattennebel · Schwade '+i;m.renderOrder=3;m.material.uniforms.uSeed.value=i*1.7;billboard(m);root.add(m);return m;});
 const flightClock={value:0};
 const comet=createSoulCloudVisual(null,flightClock,m=>m,{ownGeometry:()=>{},seed:8.31,comet:true});
 const flight=comet.root;scene.add(flight);flight.visible=false;flight.scale.setScalar(.82);
 const lastFlight=new THREE.Vector3(),direction=new THREE.Vector3(),forward=new THREE.Vector3(0,0,1);
 let flightStarted=false,clock=0,age=0,fieldPlaced=false;
 function flying(p,t){
  if(flightStarted){direction.copy(p).sub(lastFlight);if(direction.lengthSq()>1e-8)flight.quaternion.setFromUnitVectors(forward,direction.normalize());}
  else flight.quaternion.identity();
  lastFlight.copy(p);flightStarted=true;flight.position.copy(p);flight.visible=!isVisible||isVisible(p);comet.update(clock);
 }
 function endFlight(){flightStarted=false;flight.visible=false;}
 function field(center,t){age=t;root.position.copy(center);root.visible=(!isVisible||isVisible(center))&&t<r.duration+r.fade;
  if(!fieldPlaced){const pos=surface.geometry.attributes.position;
   for(let i=0;i<pos.count;i++)pos.setZ(i,(world?.heightAt?.(center.x+pos.getX(i),center.z-pos.getY(i))??center.y)-center.y);
   pos.needsUpdate=true;surface.geometry.computeBoundingSphere();fieldPlaced=true;
  }
  const opacity=smooth(t,0,.22)*(1-smooth(t,r.duration+.1,r.duration+r.fade)),expansion=.65+.35*smooth(t,0,.22),drift=Math.max(0,t-r.duration);
  surface.material.uniforms.uTime.value=t;surface.material.uniforms.uOpacity.value=opacity;
  fog.forEach((m,i)=>{const a=i*2.399+t*(i%2?.09:-.07),radius=(i<20?.12+(i%5)*.135:.72)*r.radius;
   const x=Math.cos(a)*radius,z=Math.sin(a)*radius,ground=(world?.heightAt?.(center.x+x,center.z+z)??center.y)-center.y;
   // Different heights and breakup times make one dense mass dissolve in individual wisps.
   const delay=((i*11)%28)/27*.44,localFade=smooth(t,r.duration+delay,r.duration+Math.min(r.fade,delay+.48));
   const lift=Math.max(0,t-r.duration-delay);
   m.position.set(x,ground+.85+(i%4)*.30+Math.sin(t*1.6+i)*.12+lift*(i<20?.65:1.1),z);
   m.scale.set((.90+(i%3)*.10)*expansion*(1+lift*.25),(.84+(i%4)*.11)*(1+lift*.38),1);
   m.material.uniforms.uGround.value=center.y+ground;m.material.uniforms.uTime.value=t;m.material.uniforms.uOpacity.value=smooth(t,0,.22)*(1-localFade)*(i<20?.86:.48);});
 }
 function reset(){root.visible=false;endFlight();age=clock=flightClock.value=0;fieldPlaced=false;}
 return{flying,endFlight,field,update(dt){clock+=dt;flightClock.value=clock;},reset,get telemetry(){return{style:'layered-rising-dark-mist',projectile:'dark-comet',staggeredFade:true,layerOpacities:fog.map(m=>m.material.uniforms.uOpacity.value),visible:root.visible,age,cloudLayers:fog.length,terrainFollowing:true,flightVisible:flight.visible};},dispose(){disposeVisual(root);disposeVisual(flight);}};
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
