import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Articulated brass sentinel. Static details are baked together per material
 * and joint; extra bevels, fasteners and vents do not each cost a draw call. */
export function createClockworkGuardian(){
 const body=new THREE.Group();body.name='Uhrwerkwächter · gepanzerter Messingwächter';
 const materials={
  bronze:new THREE.MeshStandardMaterial({color:'#ad7e42',metalness:.55,roughness:.36}),
  gold:new THREE.MeshStandardMaterial({color:'#e2bd72',metalness:.58,roughness:.28}),
  dark:new THREE.MeshStandardMaterial({color:'#223848',metalness:.48,roughness:.43}),
  steel:new THREE.MeshStandardMaterial({color:'#72939c',metalness:.65,roughness:.3}),
  blue:new THREE.MeshStandardMaterial({color:'#66d4ec',emissive:'#159ccb',emissiveIntensity:1.6,metalness:.2,roughness:.24}),
 };
 const {bronze,gold,dark,steel,blue}=materials,groups=[body],legs=[],gears=[],gimbals=[];
 let parts=0;
 function group(parent,name,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);groups.push(g);return g;}
 function mesh(parent,geometry,material,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);parent.add(m);parts++;return m;
 }
 const box=(x,y,z,r=.018)=>new RoundedBoxGeometry(x,y,z,1,Math.min(r,x/4,y/4,z/4));
 function rod(parent,a,b,r,material){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av),mid=av.clone().add(bv).multiplyScalar(.5);
  const m=mesh(parent,new THREE.CylinderGeometry(r,r,d.length(),8),material,...mid);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;
 }
 function bolt(parent,x,y,z,axis='z'){
  return mesh(parent,new THREE.CylinderGeometry(.021,.021,.018,6),gold,x,y,z,axis==='z'?Math.PI/2:0);
 }
 function gear(parent,r,x,y,z,rx=0,ry=0){
  const g=group(parent,'Bewegliches Zahnrad',x,y,z);g.rotation.set(rx,ry,0);
  mesh(g,new THREE.TorusGeometry(r*.78,r*.12,5,20),bronze);
  mesh(g,new THREE.CylinderGeometry(r*.27,r*.27,.06,8),steel,0,0,0,Math.PI/2);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;mesh(g,new THREE.BoxGeometry(r*.28,r*.24,.065),gold,Math.cos(a)*r,Math.sin(a)*r,0,0,0,a);}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;mesh(g,new THREE.BoxGeometry(r*.13,r*1.35,.04),bronze,0,0,0,0,0,a);}
  gears.push(g);return g;
 }
 // Layered undercarriage, bevelled armour panels and a lit turbine collar.
 mesh(body,new THREE.CylinderGeometry(.31,.38,.34,12),dark,0,.43);
 mesh(body,new THREE.CylinderGeometry(.37,.40,.08,12),bronze,0,.23);
 mesh(body,new THREE.TorusGeometry(.37,.025,6,32),gold,0,.285,0,Math.PI/2);
 mesh(body,new THREE.CylinderGeometry(.34,.38,.055,16),gold,0,.64);
 mesh(body,new THREE.CylinderGeometry(.28,.31,.07,16),blue,0,.69);
 mesh(body,new THREE.CylinderGeometry(.32,.33,.035,16),bronze,0,.735);
 for(let i=0;i<6;i++){
  const panel=group(body,'Panzersegment '+i,0,.46,0);panel.rotation.y=i*Math.PI/3;
  mesh(panel,box(.31,.28,.09),bronze,0,0,.315);
  mesh(panel,box(.255,.21,.035),dark,0,.005,.369);
  mesh(panel,box(.22,.025,.025),gold,0,.11,.389);
  for(const x of [-.105,.105])for(const y of [-.075,.075])bolt(panel,x,y,.396);
  for(let j=0;j<3;j++)mesh(panel,box(.13,.012,.017,.004),steel,0,-.04+j*.039,.392);
 }
 // Four folding legs: capped shoulder bearing, armour, piston and treaded foot.
 for(let i=0;i<4;i++){
  const pivot=group(body,'Beinlager '+i,0,.38,0);pivot.rotation.y=i*Math.PI/2+Math.PI/4;
  const leg=group(pivot,'Klappbein '+i);legs.push(leg);
  mesh(leg,new THREE.CylinderGeometry(.095,.095,.22,12),bronze,0,0,.24,0,0,Math.PI/2);
  for(const side of [-1,1]){
   mesh(leg,new THREE.CylinderGeometry(.065,.065,.015,10),steel,side*.12,0,.24,0,0,Math.PI/2);
   bolt(leg,side*.128,0,.24);
  }
  rod(leg,[0,-.02,.24],[0,-.25,.55],.055,dark);
  mesh(leg,box(.16,.1,.34),bronze,0,-.105,.4,.59);
  mesh(leg,box(.105,.025,.25),dark,0,-.055,.4,.59);
  rod(leg,[.085,.025,.26],[.085,-.12,.43],.025,bronze);
  rod(leg,[.085,-.11,.41],[.085,-.255,.56],.016,steel);
  mesh(leg,box(.27,.09,.28),dark,0,-.33,.6);
  mesh(leg,box(.24,.025,.23),bronze,0,-.273,.6);
  for(const z of [.53,.61,.69])mesh(leg,box(.22,.012,.018,.003),gold,0,-.254,z);
 }
 gear(body,.16,-.26,.48,.25,0,-.35);gear(body,.12,.28,.48,.22,0,.45);
 const bearing=gear(body,.29,0,.76,0,Math.PI/2);bearing.name='Gezahnter Turmkranz';
 const turret=group(body,'Drehbarer Geschützturm',0,.77,0);
 mesh(turret,new THREE.CylinderGeometry(.28,.31,.12,16),dark,0,.03);
 mesh(turret,new THREE.TorusGeometry(.28,.025,6,32),gold,0,.09,0,Math.PI/2);
 for(const side of [-1,1]){
  mesh(turret,box(.12,.17,.31),bronze,side*.225,.14,.02,0,side*-.16);
  mesh(turret,box(.04,.085,.25),dark,side*.29,.15,.02);
  for(let i=0;i<3;i++)mesh(turret,box(.018,.012,.055,.003),steel,side*.317,.13+i*.033,-.04);
 }
 // Faceted reactor in a four-post cage, with two orbiting brass rings.
 const coreHolder=group(turret,'Freiliegender Energiekristall',0,.31,-.035);
 const core=mesh(coreHolder,new THREE.OctahedronGeometry(.19,1),blue);core.scale.set(1,1.2,1);core.userData.animated=true;
 for(let i=0;i<4;i++){
  const a=i*Math.PI/2+Math.PI/4,x=Math.cos(a)*.215,z=Math.sin(a)*.215-.035;
  rod(turret,[x,.1,z],[x*.7,.49,z*.7],.018,gold);
 }
 mesh(turret,new THREE.CylinderGeometry(.075,.12,.055,10),bronze,0,.535,-.035);
 mesh(turret,new THREE.OctahedronGeometry(.055,0),blue,0,.585,-.035);
 for(let i=0;i<2;i++){
  const g=group(turret,'Kreiselring '+i,0,.31,-.035);g.rotation.set(Math.PI*.5,i*.8,i*.8);gimbals.push(g);
  mesh(g,new THREE.TorusGeometry(.225+i*.02,.013,5,32),gold);
 }
 // Recoiling barrel with dark bore, nested collars, coils and sight vanes.
 const cannon=group(turret,'Rückstoßlauf',0,.11,.08);
 mesh(cannon,new THREE.CylinderGeometry(.115,.14,.47,12),dark,0,0,.25,Math.PI/2);
 for(const z of [.09,.31,.49]){
  mesh(cannon,new THREE.CylinderGeometry(.137,.137,.035,12),bronze,0,0,z,Math.PI/2);
  mesh(cannon,new THREE.TorusGeometry(.128,.014,5,24),gold,0,0,z+.018);
 }
 mesh(cannon,new THREE.CircleGeometry(.09,16),blue,0,0,.48);
 mesh(cannon,new THREE.TorusGeometry(.105,.026,6,24),steel,0,0,.515);
 for(const side of [-1,1])mesh(cannon,box(.035,.035,.34),gold,side*.13,.03,.27);
 const coil=[];for(let i=0;i<=64;i++){const t=i/64,a=t*Math.PI*6;coil.push(new THREE.Vector3(Math.cos(a)*.12,Math.sin(a)*.12,.12+t*.24));}
 mesh(cannon,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil),64,.011,4,false),bronze);
 mesh(cannon,box(.04,.055,.13),gold,0,.145,.36);
 // Bake static parts for each moving joint into a few material batches.
 for(const parent of groups){const batches=new Map();
  for(const m of [...parent.children])if(m.isMesh&&!m.userData.animated){m.updateMatrix();const geo=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone()).applyMatrix4(m.matrix);
   if(!batches.has(m.material))batches.set(m.material,[]);batches.get(m.material).push(geo);parent.remove(m);m.geometry.dispose();}
  for(const [material,geos] of batches){const geometry=mergeGeometries(geos);geos.forEach(g=>g.dispose());const m=new THREE.Mesh(geometry,material);m.castShadow=m.receiveShadow=true;parent.add(m);}
 }
 let drawCalls=0,triangles=0;body.traverse(o=>{if(o.isMesh){drawCalls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 return{body,turret,legs,gears,gimbals,core,cannon,materials,detail:{parts,drawCalls,triangles,armourPanels:6,pistons:4}};
}
