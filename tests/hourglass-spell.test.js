import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createHourglassSpell, HOURGLASS_RULES as rules } from '../src/hourglass-spell.js';
import { weaponStats, RARITIES } from '../src/loot-tiers.js';
import { createWeapons } from '../src/weapons.js';
import { createHourglassVisuals, HOURGLASS_VISUAL_BUDGET } from '../src/hourglass-visuals.js';

test('the sand vortex rises, orbits and reuses every buffer through pause and dissolution',()=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules),center=new THREE.Vector3();
 v.show(center,.3,true);assert.equal(v.telemetry.draws,1);assert.equal(v.telemetry.particles,0);assert.equal(v.telemetry.puffs,0);
 v.show(center,.75,true);const early=v.telemetry.opening;assert.ok(early>0&&early<1);
 const root=scene.getObjectByName('Sanduhrstab · Zeitfeld'),sand=root.getObjectByName('Sanduhrstab · kreisender Sand');
 const puffs=root.children.find(m=>m.geometry?.isInstancedBufferGeometry);
 assert.ok(puffs,'dust billows share one instanced draw');
 assert.equal(puffs.geometry.instanceCount,HOURGLASS_VISUAL_BUDGET.puffs);
 const bed=root.getObjectByName('Sanduhrstab · bodennaher Sand');
 const sheets=root.children.filter(m=>m!==root.children[0]&&m!==sand&&m!==puffs&&m!==bed);
 assert.equal(sheets.length,2);
 const buffers=root.children.flatMap(m=>Object.values(m.geometry.attributes).map(attribute=>({attribute,array:attribute.array})));
 const positions=sand.geometry.attributes.position.array;
 const heightOf=array=>Math.max(...array.filter((_,i)=>i%3===1));
 v.show(center,2,true);assert.equal(v.telemetry.opening,1);assert.equal(v.telemetry.currents,2);
 assert.equal(v.telemetry.particles,HOURGLASS_VISUAL_BUDGET.grains);assert.equal(v.telemetry.puffs,64);
 assert.equal(sand.geometry.attributes.position.count,7200);
 assert.ok(heightOf(positions)>1.5&&heightOf(positions)<=2.6,'sand rises visibly above a standing character');
 for(const sheet of sheets)assert.ok(heightOf(sheet.geometry.attributes.position.array)>1.5,'each sandy current has real 3D height');
 assert.ok(heightOf(puffs.geometry.attributes.center.array)>1.5,'billows rise with the sand');
 const drawn=root.children.filter(m=>m.visible);assert.equal(drawn.length,HOURGLASS_VISUAL_BUDGET.draws);
 assert.equal(drawn.length,6);assert.equal(drawn.filter(m=>m.isLight).length,0);
 const before=Array.from(positions);v.show(center,2.2,true);
 let radialMotion=0,verticalMotion=0;
 for(let i=0;i<positions.length;i+=3){
  const x=before[i],z=before[i+2],nx=positions[i],nz=positions[i+2];
  const turn=Math.atan2(x*nz-z*nx,x*nx+z*nz);
  assert.ok(turn>.1&&turn<.8,'sand visibly rotates in a consistent direction');
  const radius=Math.hypot(nx,nz),radialChange=Math.abs(Math.hypot(x,z)-radius);
  assert.ok(radius<=rules.radius,'active grains stay inside the marked field');
  assert.ok(radialChange<=.45,'small eddies cannot throw grains across the field in one short interval');
  radialMotion+=Number(radialChange>.001);
  verticalMotion+=Number(Math.abs(positions[i+1]-before[i+1])>.003);
 }
 assert.ok(radialMotion>sand.geometry.attributes.position.count*.6,'most grains drift between circular tracks');
 assert.ok(verticalMotion>sand.geometry.attributes.position.count*.6,'most grains rise and fall independently of their orbit');
 const paused=buffers.map(({array})=>Array.from(array));v.show(center,2.2,true);
 buffers.forEach(({array},i)=>assert.deepEqual(Array.from(array),paused[i],'all motion uses simulation time'));
 v.show(center,5.25,true);assert.ok(v.telemetry.opacity<.3);
 buffers.forEach(({attribute,array})=>assert.equal(attribute.array,array,'GPU buffers are reused'));
 assert.ok(heightOf(positions)<=.4,'dissolving sand settles near the floor');
 v.show(center,5.45,true);assert.equal(v.telemetry.particles,0);assert.equal(puffs.visible,false);
 const releases=new Map();
 root.children.forEach(m=>{for(const resource of [m.geometry,m.material]){releases.set(resource,0);resource.addEventListener('dispose',()=>releases.set(resource,releases.get(resource)+1));}});
 v.dispose();v.dispose();assert.equal(releases.size,12);
 for(const count of releases.values())assert.equal(count,1,'each geometry and material is released once');
 assert.equal(scene.children.length,0);
});

test('the sand bed opens after warning, freezes on pause and fully disappears with the storm',t=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules),center=new THREE.Vector3();
 t.after(()=>v.dispose());
 const bed=scene.getObjectByName('Sanduhrstab · bodennaher Sand'),u=bed.material.uniforms;
 assert.ok(bed.material.depthTest,'standing characters and walls must occlude the sand bed');
 assert.equal(bed.material.depthWrite,false,'the effect must not leave an opaque depth footprint');
 v.show(center,rules.warning*.5,true);assert.equal(bed.visible,false);assert.equal(v.telemetry.ground,false);
 v.show(center,rules.warning+.2,true);assert.equal(bed.visible,true);assert.ok(u.uOpening.value>0&&u.uOpening.value<1);
 v.show(center,2,true);assert.equal(u.uOpening.value,1);assert.equal(u.uOpacity.value,1);
 const frozen=Object.fromEntries(Object.entries(u).map(([key,{value}])=>[key,value]));
 v.show(center,2,true);for(const key in frozen)assert.equal(u[key].value,frozen[key]);
 v.show(center,2.2,true);assert.ok(u.uTime.value>frozen.uTime);
 v.show(center,rules.warning+rules.duration+rules.dissolve*.6,true);
 assert.ok(u.uDissolve.value>.5);assert.ok(u.uOpacity.value<.5);
 v.show(center,rules.warning+rules.duration+rules.dissolve+.01,true);
 assert.equal(bed.visible,false);assert.equal(v.telemetry.ground,false);assert.equal(u.uOpacity.value,0);
});

test('dissolving sand keeps its orbit direction while slowing down',t=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules),center=new THREE.Vector3();
 t.after(()=>v.dispose());
 const sand=scene.getObjectByName('Sanduhrstab · kreisender Sand');
 const frames=[.2,.4,.6].map(elapsed=>{
  v.show(center,rules.warning+rules.duration+elapsed,true);
  assert.equal(v.telemetry.phase,'dissolve');
  return Array.from(sand.geometry.attributes.position.array);
 });
 const angle=(a,b,i)=>Math.atan2(a[i]*b[i+2]-a[i+2]*b[i],a[i]*b[i]+a[i+2]*b[i+2]);
 for(let i=0;i<frames[0].length;i+=3){
  const first=angle(frames[0],frames[1],i),second=angle(frames[1],frames[2],i);
  assert.ok(first>0&&second>0,'settling grains must not reverse their active orbit direction');
  assert.ok(second<first,'equal time intervals cover smaller angles as sand settles');
 }
});

test('rotating sand fills the center, middle and edge in every direction',()=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules);
 for(const age of [1.2,2.4,4]){
  v.show(new THREE.Vector3(),age,true);
  const points=scene.getObjectByName('Sanduhrstab · kreisender Sand').geometry.attributes.position;
  const bins=new Array(32).fill(0);
  for(let i=0;i<points.count;i++){
   const x=points.getX(i),z=points.getZ(i),r=Math.hypot(x,z)/rules.radius;
   const ring=Math.min(3,Math.floor(r*r*4)),sector=Math.min(7,Math.floor((Math.atan2(z,x)+Math.PI)/(Math.PI*2)*8));
   bins[ring*8+sector]++;
  }
  assert.ok(bins.every(n=>n>=120),'no empty center, annular gaps or missing angular sectors');
 }
 v.dispose();
});

test('sand and clouds vary their speeds without breaking the prevailing flow',t=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules),center=new THREE.Vector3();
 t.after(()=>v.dispose());
 const sand=scene.getObjectByName('Sanduhrstab · kreisender Sand').geometry.attributes.position;
 const clouds=scene.getObjectByName('Sanduhrstab · aufgewirbelter Staub').geometry.attributes.center;
 const capture=age=>{v.show(center,age,true);return [sand.array.slice(),clouds.array.slice()];};
 const frames=[1.5,2,2.5].map(capture);
 const turns=(before,after,indices)=>{
  const values=[];
  for(const i of indices){
   values.push(Math.atan2(before[i]*after[i+2]-before[i+2]*after[i],before[i]*after[i]+before[i+2]*after[i+2]));
  }
  return values;
 };
 const means=[];
 for(let layer=0;layer<2;layer++){
  // Select one annulus once, then track those same grains/clouds through both
  // intervals even when radial eddies carry them outside the initial annulus.
  const indices=[],initial=frames[0][layer];
  for(let i=0;i<initial.length;i+=3){
   const radius=Math.hypot(initial[i],initial[i+2])/rules.radius;
   if(radius>=.45&&radius<=.7)indices.push(i);
  }
  const first=turns(frames[0][layer],frames[1][layer],indices),second=turns(frames[1][layer],frames[2][layer],indices);
  assert.ok(first.length>=10);
  assert.ok([...first,...second].every(angle=>angle>.55&&angle<1.6),'bounded motion keeps one forward flow');
  assert.ok(Math.max(...first)-Math.min(...first)>.18,'nearby elements must not orbit as a rigid block');
  assert.ok(first.some((angle,i)=>Math.abs(angle-second[i])>.025),'gentle gusts change individual speeds over time');
  means.push(first.reduce((sum,n)=>sum+n,0)/first.length);
 }
 assert.ok(Math.abs(means[0]-means[1])<.15,'clouds and grains retain a similar overall flow');
});

test('sand follows sloped terrain with cached height samples, including its warning boundary',()=>{
 const scene=new THREE.Scene();let samples=0;const height=(x,z)=>x*.2+z*.3;
 const visuals=createHourglassVisuals(scene,rules,(x,z)=>{samples++;return height(x,z);});
 const center=new THREE.Vector3(4,height(4,2),2);visuals.show(center,1,true);
 const count=samples;visuals.show(center,2,true);assert.equal(samples,count,'no terrain queries per animation frame');
 const root=scene.getObjectByName('Sanduhrstab · Zeitfeld');
 const points=root.getObjectByName('Sanduhrstab · kreisender Sand').geometry.attributes.position;
 for(let i=0;i<points.count;i++){const clearance=points.getY(i)+center.y-height(points.getX(i)+center.x,points.getZ(i)+center.z);assert.ok(clearance>=.034&&clearance<=2.6);}
 const surfaces=[[root.children[0],.055],[root.getObjectByName('Sanduhrstab · bodennaher Sand'),.075]];
 const checkSurfaces=()=>{for(const [mesh,clearance] of surfaces){
  mesh.updateMatrix();const p=new THREE.Vector3();
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
   p.fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrix).add(center);
   assert.ok(Math.abs(p.y-height(p.x,p.z)-clearance)<1e-6,'warning and sand bed must follow the slope');
  }
 }};
 checkSurfaces();center.set(-3,height(-3,7),7);visuals.show(center,2,true);checkSurfaces();
 assert.equal(samples,count*2,'recasting elsewhere samples the new terrain once');
 visuals.dispose();
});

function scenario() {
 const scene = new THREE.Scene(), combat = createCombat();
 const world = {heightAt:()=>0,isLand:()=>true,isWater:()=>false,traceProjectile:()=>null};
 const caster = new THREE.Vector3();
 const target = combat.addTarget({id:'enemy',position:new THREE.Vector3(1,0,0)});
 const self = combat.addTarget({id:'player',position:caster});
 const spell = createHourglassSpell(scene,world,combat,'player');
 const step = dt => {combat.update(dt);spell.update(dt,caster);};
 const cast = () => {spell.beginAim(caster,0);spell.aimAt(caster,caster);assert.ok(spell.release());};
 return {scene,combat,world,caster,target,self,spell,step,cast};
}

test('hourglass warns before progressively slowing without damage or pulling, and recovers after exit',()=>{
 const {target,self,spell,step,cast}=scenario();cast();step(.59);
 assert.equal(target.speedMultiplier,1);assert.equal(spell.telemetry.visuals.phase,'warning');
 step(.11);const first=target.speedMultiplier;assert.ok(first<.85&&first>.75);
 for(let i=0;i<24;i++)step(.1);
 assert.ok(Math.abs(target.speedMultiplier-.35)<1e-8);assert.equal(target.health,100);assert.equal(target.position.x,1);assert.equal(self.speedMultiplier,1);
 target.position.x=10;step(.1);step(.1);assert.ok(target.speedMultiplier>.35);step(.1);assert.equal(target.speedMultiplier,1);
 target.position.x=1;step(.1);assert.ok(target.speedMultiplier>.75,'reentry starts fresh');
 spell.reset();assert.equal(target.speedMultiplier,1);spell.dispose();
});

test('time slow composes with ice and multiple casters without multiplying, and death/reset clear it',()=>{
 const {combat,target,spell}=scenario();const a=Symbol(),b=Symbol();
 combat.hit(target,{damage:0,slow:{duration:2,multiplier:.5}});
 combat.setTimeSlow(target,a,.65);assert.equal(target.speedMultiplier,.5);
 combat.setTimeSlow(target,b,.35);assert.equal(target.speedMultiplier,.35);
 combat.update(.3);assert.equal(target.speedMultiplier,.5,'ice persists after the time effects expire');
 combat.setTimeSlow(target,a,.35);combat.hit(target,{damage:1000});assert.equal(target.timeSlows.size,0);
 combat.reset();assert.equal(target.speedMultiplier,1);spell.dispose();
});

test('a storm stun temporarily overrides time slow and the remaining slow resumes afterwards',()=>{
 const {combat,target,spell}=scenario();combat.setTimeSlow(target,Symbol(),.5,1);
 combat.hit(target,{damage:0,stun:.4});assert.equal(target.speedMultiplier,0);assert.equal(target.canAct,false);
 combat.update(.45);assert.equal(target.speedMultiplier,.5);assert.equal(target.canAct,true);
 combat.update(.6);assert.equal(target.speedMultiplier,1);spell.dispose();
});

test('warning, active and dissolution freeze, respect visibility and release resources',()=>{
 const {scene,world,combat,caster,spell:idle}=scenario();let visible=true;
 const s=createHourglassSpell(scene,world,combat,'other',()=>visible);
 s.beginAim(caster);s.release();s.update(1,caster);
 // Locate this controller's visible root (the fixture also owns an idle one).
 const root=scene.children.find(n=>n.name==='Sanduhrstab · Zeitfeld'&&n.visible);
 const sand=root.getObjectByName('Sanduhrstab · kreisender Sand');
 const frozen=Array.from(sand.geometry.attributes.position.array);s.update(0,caster);assert.deepEqual(Array.from(sand.geometry.attributes.position.array),frozen);
 visible=false;s.update(.1,caster);assert.equal(s.telemetry.visuals.visible,false);
 visible=true;s.update(3.6,caster);assert.equal(s.telemetry.visuals.phase,'dissolve');assert.ok(s.telemetry.visuals.opacity>0);assert.ok(s.telemetry.visuals.draws<=6);
 s.update(1,caster);assert.equal(s.telemetry.active,false);assert.equal(s.telemetry.visuals.draws,0);
 let disposed=0;sand.geometry.addEventListener('dispose',()=>disposed++);s.dispose();s.dispose();assert.equal(disposed,1);idle.dispose();assert.equal(scene.children.length,0);
});

test('aim follows the charged reach and rejects water, while a wall protects affected targets',()=>{
 const {world,caster,spell,target,step}=scenario();spell.beginAim(caster,0);spell.aimAt(caster,{x:50,z:0});step(1.5);
 assert.equal(spell.telemetry.aim.x,10);assert.equal(spell.telemetry.casts,0);
 spell.cancelAim();assert.equal(spell.release(),false);
 world.isWater=()=>true;spell.beginAim(caster);assert.equal(spell.release(),false);
 world.isWater=()=>false;spell.beginAim(caster);spell.release();world.traceProjectile=()=>({type:'wall'});step(2);
 assert.equal(target.speedMultiplier,1);spell.dispose();
});

test('large time steps and resets cannot leave a live field or permanent slowdown',()=>{
 const {spell,target,step,cast}=scenario();cast();step(30);assert.equal(spell.telemetry.active,false);assert.equal(target.speedMultiplier,1);
 cast();step(1);assert.ok(target.speedMultiplier<1);spell.reset();assert.equal(target.speedMultiplier,1);
 assert.equal(spell.telemetry.visuals.draws,0);spell.dispose();
});

test('hourglass release routes through the real weapon controller, imported model and cooldown',()=>{
 const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);const combat=createCombat();
 const model=new THREE.Group();model.add(new THREE.Mesh(new THREE.BoxGeometry(.2,1.7,.2),new THREE.MeshBasicMaterial()));
 model.userData.weaponTipPoint=[0,.85,0];model.userData.weaponSource='assets/inbox/Sanduhrenstab.glb';
 const weapons=createWeapons(scene,actor,{heightAt:()=>0,isLand:()=>true,traceProjectile:()=>null},null,{combat,
  placements:[{id:'clock',kind:'hourglassStaff',variant:'kit-tripo-hourglass-staff',position:[0,0],rarity:'common'}],tripoPrototypes:{'kit-tripo-hourglass-staff':model}});
 weapons.tryAutoPickup(actor.position);assert.ok(weapons.attack(actor.position,0));weapons.aimAt(actor.position,actor.position);
 assert.equal(weapons.telemetry.shotsFired,0);assert.ok(weapons.releaseAttack(actor.position));assert.equal(weapons.telemetry.shotsFired,1);
 assert.equal(weapons.telemetry.hourglass.visuals.phase,'warning');assert.equal(weapons.telemetry.effects.activeProjectiles,0);
 assert.equal(weapons.attack(actor.position,0),null);weapons.reset();assert.equal(weapons.telemetry.hourglass.active,false);weapons.dispose();
});

test('rarity never increases hourglass crowd control or adds damage',()=>{
 for(const rarity of Object.keys(RARITIES)){const stats=weaponStats('hourglassStaff',rarity);assert.equal(stats.damage,0);assert.equal(stats.cooldown,3.1);assert.equal(stats.range,rules.range);}
});
