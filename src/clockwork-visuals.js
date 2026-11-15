import * as THREE from 'three';
import { createClockworkGuardian } from './clockwork-guardian.js';
import { disposeVisual } from './shadow-visuals.js';
const smooth=THREE.MathUtils.smoothstep;
/** Small, readable clockwork silhouette: hinged feet, a brass iris, rotating
 * gears and a tracking cannon. No lights, textures or unbounded particle lists. */
export function createClockworkVisuals(scene,isVisible){
 const root=new THREE.Group();root.name='Uhrwerkwächter · Messing und blaues Licht';scene.add(root);root.visible=false;
 const model=createClockworkGuardian(),{body,turret,legs,gears,gimbals,core,cannon,materials}=model;
 const {bronze,gold,dark,steel,blue}=materials;root.add(body);
 function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
 const pulse=mesh(root,new THREE.RingGeometry(.85,1,48),new THREE.MeshBasicMaterial({color:'#71d9ff',transparent:true,depthWrite:false,side:THREE.DoubleSide}));pulse.rotation.x=-Math.PI/2;pulse.position.y=.035;
 const flash=mesh(turret,new THREE.OctahedronGeometry(.1,0),new THREE.MeshBasicMaterial({color:'#d5faff',transparent:true,depthWrite:false}),0,.11,.68);
 const health=new THREE.Group();health.position.y=1.68;root.add(health);
 mesh(health,new THREE.PlaneGeometry(.66,.075),new THREE.MeshBasicMaterial({color:'#17252d',depthTest:false}));
 const healthFill=mesh(health,new THREE.PlaneGeometry(.62,.045),new THREE.MeshBasicMaterial({color:'#7cdfff',depthTest:false}),0,0,.002);
 health.onBeforeRender=()=>{};
 health.children.forEach(m=>{m.renderOrder=8;m.onBeforeRender=(_r,_s,c)=>{root.getWorldQuaternion(health.quaternion).invert().multiply(c.quaternion);health.updateMatrixWorld(true);};});
 const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.09,.11),new THREE.MeshStandardMaterial({color:'#b18b4c',metalness:.7,roughness:.4,transparent:true}),14);debris.frustumCulled=false;root.add(debris);
 const capsule=new THREE.Group();capsule.name='Uhrwerkkapsel';scene.add(capsule);capsule.visible=false;
 mesh(capsule,new THREE.DodecahedronGeometry(.23,0),bronze);
 const seam=mesh(capsule,new THREE.TorusGeometry(.225,.025,5,20),blue);seam.rotation.x=Math.PI/2;
 const bolts=Array.from({length:8},()=>{const g=new THREE.Group();scene.add(g);g.visible=false;
  mesh(g,new THREE.SphereGeometry(.065,8,6),new THREE.MeshBasicMaterial({color:'#d6faff'}));
  const tail=mesh(g,new THREE.ConeGeometry(.055,.85,6),new THREE.MeshBasicMaterial({color:'#4fcfff',transparent:true,opacity:.65,depthWrite:false}),0,0,-.39);tail.rotation.x=-Math.PI/2;return g;
 });
 const dummy=new THREE.Object3D();let clock=0,flashAge=10,ending=null,phase='idle',turn=0;
 const visible=p=>!isVisible||isVisible(p,{concealed:false});
 function placed(p){root.position.copy(p);ending=null;turn=0;flashAge=10;root.visible=visible(p);}
 function update(dt,state,shots){clock+=dt;flashAge+=dt;bolts.forEach(g=>g.visible=false);
  shots.slice(0,bolts.length).forEach((b,i)=>{const g=bolts[i];g.position.copy(b.position);g.visible=visible(g.position);g.lookAt(g.position.clone().add(b.velocity));});
  if(!state&&!ending){root.visible=false;return;}
  root.visible=visible(root.position);phase=ending?'dissolve':state.age<.4?'unfold':'guard';
  const deploy=ending?1:smooth(state.age,0,.4),fade=ending?smooth(ending.age,0,.65):0;
  body.visible=fade<.94;body.scale.setScalar(Math.max(.001,.45+.55*deploy));body.position.y=Math.sin(deploy*Math.PI)*.12+fade*.09;
  body.rotation.z=ending?Math.sin(ending.age*64)*.035*fade:0;
  for(const leg of legs)leg.rotation.x=(1-deploy)*-1.6+fade*.45;
  cannon.position.z=.08-Math.max(0,1-flashAge/.16)*.065;
  gimbals.forEach((g,i)=>{g.rotation.x=Math.PI*.5+Math.sin(clock*.65+i)*.22;g.rotation.z=clock*(i?-.45:.55)+i;});
  gears.forEach((g,i)=>g.rotation.z=clock*(i%2?-2.3:1.7));
  let desired=state?.direction??Math.sin(clock*.7)*.7;
  turn+=Math.atan2(Math.sin(desired-turn),Math.cos(desired-turn))*(1-Math.exp(-dt*16));turret.rotation.y=turn;
  const pulseScale=1+Math.sin(clock*3.2)*.035;core.scale.set(pulseScale,pulseScale*1.2,pulseScale);core.rotation.y=clock*.6;blue.emissiveIntensity=ending?(.4+2.5*Math.pow(Math.sin(ending.age*58),2))*(1-fade):1.7+Math.sin(clock*3)*.3;
  flash.visible=flashAge<.11&&!ending;flash.scale.setScalar(1+(1-flashAge/.11)*1.8);flash.material.opacity=Math.max(0,1-flashAge/.11);
  const pulseAge=ending?ending.age:state.age; pulse.scale.setScalar(.15+pulseAge*(ending?3.3:2.6));pulse.material.opacity=Math.max(0,1-pulseAge/.5)*.5;
  health.visible=!ending&&deploy>.98;healthFill.scale.x=Math.max(.001,(state?.health??25)/25);healthFill.position.x=-.31*(1-healthFill.scale.x);
  debris.visible=!!ending; if(ending){ending.age+=dt;debris.material.opacity=1-fade;
   for(let i=0;i<14;i++){const a=i*2.399,t=ending.age,speed=.7+(i%4)*.22;dummy.position.set(Math.cos(a)*t*speed,.45+(.9+i%3*.3)*t-1.9*t*t,Math.sin(a)*t*speed);dummy.rotation.set(t*(i+2),i+t*3,i+t*5);dummy.scale.setScalar(1-fade);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);}debris.instanceMatrix.needsUpdate=true;
   for(const m of [bronze,gold,dark,steel]){m.transparent=true;m.opacity=1-fade;}
   if(ending.age>=.65){ending=null;root.visible=false;phase='idle';}
  }else for(const m of [bronze,gold,dark,steel]){m.transparent=false;m.opacity=1;}
 }
 function reset(){ending=null;root.visible=capsule.visible=false;bolts.forEach(g=>g.visible=false);phase='idle';}
 return{placed,update,fire(){flashAge=0;},end(){ending={age:0};},reset,
  flying(p,t){for(const m of [bronze,gold,dark,steel]){m.transparent=false;m.opacity=1;}blue.emissiveIntensity=2.2;capsule.visible=visible(p);capsule.position.copy(p);capsule.rotation.set(t*12,t*9,t*5);},endFlight(){capsule.visible=false;},
  get fading(){return !!ending;},get telemetry(){return{style:'armoured-brass-sentinel',detail:model.detail,phase,visible:root.visible,gears:gears.length,bolts:bolts.filter(b=>b.visible).length,turretYaw:turn};},
  dispose(){disposeVisual(root);disposeVisual(capsule);bolts.forEach(disposeVisual);}};
}
