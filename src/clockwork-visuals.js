import * as THREE from 'three';
import { disposeVisual } from './shadow-visuals.js';
const smooth=THREE.MathUtils.smoothstep;
/** Small, readable clockwork silhouette: hinged feet, a brass iris, rotating
 * gears and a tracking cannon. No lights, textures or unbounded particle lists. */
export function createClockworkVisuals(scene,isVisible){
 const root=new THREE.Group();root.name='Uhrwerkwächter · Messing und blaues Licht';scene.add(root);root.visible=false;
 const bronze=new THREE.MeshStandardMaterial({color:'#896035',metalness:.74,roughness:.36});
 const gold=new THREE.MeshStandardMaterial({color:'#e2be69',metalness:.8,roughness:.28});
 const dark=new THREE.MeshStandardMaterial({color:'#25333d',metalness:.65,roughness:.48});
 const blue=new THREE.MeshStandardMaterial({color:'#a5efff',emissive:'#21baff',emissiveIntensity:2.2,metalness:.2,roughness:.25});
 const body=new THREE.Group();root.add(body);
 function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);parent.add(m);return m;}
 mesh(body,new THREE.CylinderGeometry(.3,.39,.42,12),bronze,0,.44);
 mesh(body,new THREE.CylinderGeometry(.41,.41,.07,16),gold,0,.25);
 mesh(body,new THREE.CylinderGeometry(.34,.34,.06,16),gold,0,.66);
 const legs=[],panels=[];
 for(let i=0;i<4;i++){
  const pivot=new THREE.Group();pivot.rotation.y=i*Math.PI/2+Math.PI/4;body.add(pivot);pivot.position.y=.38;
  const hinge=new THREE.Group();pivot.add(hinge);legs.push(hinge);
  const strut=mesh(hinge,new THREE.BoxGeometry(.12,.12,.5),bronze,0,-.14,.36);strut.rotation.x=.55;
  mesh(hinge,new THREE.BoxGeometry(.26,.09,.25),dark,0,-.33,.57);
  mesh(hinge,new THREE.SphereGeometry(.09,8,6),gold,0,0,.22);
  const cover=mesh(hinge,new THREE.BoxGeometry(.24,.1,.29),gold,0,.1,.28);panels.push(cover);
 }
 const turret=new THREE.Group();turret.position.y=.73;body.add(turret);
 mesh(turret,new THREE.SphereGeometry(.28,16,10,0,Math.PI*2,Math.PI/2,Math.PI/2),dark,0,.14);
 const core=mesh(turret,new THREE.IcosahedronGeometry(.2,2),blue,0,.2);
 const cage=mesh(turret,new THREE.TorusGeometry(.25,.035,6,24),gold,0,.2);cage.rotation.x=Math.PI/2;
 mesh(turret,new THREE.TorusGeometry(.245,.017,6,24),gold,0,.2).rotation.y=Math.PI/2;
 const cannon=mesh(turret,new THREE.CylinderGeometry(.115,.14,.43,10),bronze,0,.15,.36);cannon.rotation.x=Math.PI/2;
 const muzzle=mesh(turret,new THREE.TorusGeometry(.12,.027,6,16),gold,0,.15,.58);
 mesh(turret,new THREE.CircleGeometry(.085,16),blue,0,.15,.581);
 const gears=[];
 function gear(parent,r,x,y,z,rot=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.x=rot;parent.add(g);
  mesh(g,new THREE.TorusGeometry(r,.033,6,24),gold);
  mesh(g,new THREE.CylinderGeometry(r*.24,r*.24,.08,8),bronze).rotation.x=Math.PI/2;
  const teeth=new THREE.InstancedMesh(new THREE.BoxGeometry(r*.38,r*.24,.065),gold,10),o=new THREE.Object3D();
  for(let i=0;i<10;i++){const a=i*Math.PI/5;o.position.set(Math.cos(a)*r,Math.sin(a)*r,0);o.rotation.z=a;o.updateMatrix();teeth.setMatrixAt(i,o.matrix);}g.add(teeth);gears.push(g);return g;
 }
 gear(body,.19,-.27,.48,.21);gear(body,.14,.28,.48,.19);gear(body,.38,0,.71,0,Math.PI/2);
 const pulse=mesh(root,new THREE.RingGeometry(.85,1,48),new THREE.MeshBasicMaterial({color:'#71d9ff',transparent:true,depthWrite:false,side:THREE.DoubleSide}));pulse.rotation.x=-Math.PI/2;pulse.position.y=.035;
 const flash=mesh(turret,new THREE.IcosahedronGeometry(.14,1),new THREE.MeshBasicMaterial({color:'#d5faff',transparent:true,depthWrite:false}),0,.15,.67);
 const health=new THREE.Group();health.position.y=1.45;root.add(health);
 mesh(health,new THREE.PlaneGeometry(.66,.075),new THREE.MeshBasicMaterial({color:'#17252d',depthTest:false}));
 const healthFill=mesh(health,new THREE.PlaneGeometry(.62,.045),new THREE.MeshBasicMaterial({color:'#7cdfff',depthTest:false}),0,0,.002);
 health.onBeforeRender=()=>{};
 health.children.forEach(m=>{m.renderOrder=8;m.onBeforeRender=(_r,_s,c)=>{root.getWorldQuaternion(health.quaternion).invert().multiply(c.quaternion);health.updateMatrixWorld(true);};});
 const debris=new THREE.InstancedMesh(new THREE.BoxGeometry(.07,.09,.11),new THREE.MeshStandardMaterial({color:'#b18b4c',metalness:.7,roughness:.4,transparent:true}),14);debris.frustumCulled=false;root.add(debris);
 const capsule=new THREE.Group();capsule.name='Uhrwerkkapsel';scene.add(capsule);capsule.visible=false;
 mesh(capsule,new THREE.DodecahedronGeometry(.23,0),bronze);
 const seam=mesh(capsule,new THREE.TorusGeometry(.225,.025,5,20),blue);seam.rotation.x=Math.PI/2;
 const bolts=Array.from({length:8},()=>{const g=new THREE.Group();scene.add(g);g.visible=false;
  mesh(g,new THREE.SphereGeometry(.1,8,6),new THREE.MeshBasicMaterial({color:'#d6faff'}));
  const tail=mesh(g,new THREE.ConeGeometry(.09,.55,8),new THREE.MeshBasicMaterial({color:'#4fcfff',transparent:true,opacity:.55,depthWrite:false}),0,0,-.26);tail.rotation.x=-Math.PI/2;return g;
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
  for(let i=0;i<legs.length;i++){legs[i].rotation.x=(1-deploy)*-1.6+fade*.45;panels[i].rotation.x=deploy*.55;}
  gears.forEach((g,i)=>g.rotation.z=clock*(i%2?-2.3:1.7));
  let desired=state?.direction??Math.sin(clock*.7)*.7;
  turn+=Math.atan2(Math.sin(desired-turn),Math.cos(desired-turn))*(1-Math.exp(-dt*16));turret.rotation.y=turn;
  core.scale.setScalar(1+Math.sin(clock*4)*.07);blue.emissiveIntensity=ending?(.4+2.5*Math.pow(Math.sin(ending.age*58),2))*(1-fade):1.7+Math.sin(clock*3)*.3;
  flash.visible=flashAge<.11&&!ending;flash.scale.setScalar(1+(1-flashAge/.11)*1.8);flash.material.opacity=Math.max(0,1-flashAge/.11);
  const pulseAge=ending?ending.age:state.age; pulse.scale.setScalar(.15+pulseAge*(ending?3.3:2.6));pulse.material.opacity=Math.max(0,1-pulseAge/.5)*.5;
  health.visible=!ending&&deploy>.98;healthFill.scale.x=Math.max(.001,(state?.health??25)/25);healthFill.position.x=-.31*(1-healthFill.scale.x);
  debris.visible=!!ending; if(ending){ending.age+=dt;debris.material.opacity=1-fade;
   for(let i=0;i<14;i++){const a=i*2.399,t=ending.age,speed=.7+(i%4)*.22;dummy.position.set(Math.cos(a)*t*speed,.45+(.9+i%3*.3)*t-1.9*t*t,Math.sin(a)*t*speed);dummy.rotation.set(t*(i+2),i+t*3,i+t*5);dummy.scale.setScalar(1-fade);dummy.updateMatrix();debris.setMatrixAt(i,dummy.matrix);}debris.instanceMatrix.needsUpdate=true;
   for(const m of [bronze,gold,dark]){m.transparent=true;m.opacity=1-fade;}
   if(ending.age>=.65){ending=null;root.visible=false;phase='idle';}
  }else for(const m of [bronze,gold,dark]){m.transparent=false;m.opacity=1;}
 }
 function reset(){ending=null;root.visible=capsule.visible=false;bolts.forEach(g=>g.visible=false);phase='idle';}
 return{placed,update,fire(){flashAge=0;},end(){ending={age:0};},reset,
  flying(p,t){for(const m of [bronze,gold,dark]){m.transparent=false;m.opacity=1;}blue.emissiveIntensity=2.2;capsule.visible=visible(p);capsule.position.copy(p);capsule.rotation.set(t*12,t*9,t*5);},endFlight(){capsule.visible=false;},
  get fading(){return !!ending;},get telemetry(){return{style:'brass-iris-blue-core',phase,visible:root.visible,gears:gears.length,bolts:bolts.filter(b=>b.visible).length,turretYaw:turn};},
  dispose(){disposeVisual(root);disposeVisual(capsule);bolts.forEach(disposeVisual);}};
}
