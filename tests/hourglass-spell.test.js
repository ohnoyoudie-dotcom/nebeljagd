import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createHourglassSpell, HOURGLASS_RULES as rules } from '../src/hourglass-spell.js';
import { weaponStats, RARITIES } from '../src/loot-tiers.js';
import { createWeapons } from '../src/weapons.js';
import { createHourglassVisuals, HOURGLASS_VISUAL_BUDGET } from '../src/hourglass-visuals.js';

test('the sand sea opens in layers, has real height and recycles every buffer through dissolution',()=>{
 const scene=new THREE.Scene(),v=createHourglassVisuals(scene,rules),center=new THREE.Vector3();
 v.show(center,.3,true);assert.equal(v.telemetry.draws,1);assert.equal(v.telemetry.particles,0);
 v.show(center,.75,true);const early=v.telemetry.opening;assert.ok(early>0&&early<1);
 const root=scene.getObjectByName('Sanduhrstab · Zeitfeld'),sand=root.getObjectByName('Sanduhrstab · kreisender Sand');
 const shards=root.getObjectByName('Sanduhrstab · schwebende Zeitfragmente');
 const positions=sand.geometry.attributes.position.array,matrices=shards.instanceMatrix.array;
 v.show(center,2,true);assert.equal(v.telemetry.opening,1);assert.equal(v.telemetry.currents,2);
 assert.equal(v.telemetry.particles,HOURGLASS_VISUAL_BUDGET.grains);
 assert.ok(Math.max(...positions.filter((_,i)=>i%3===1))>.9,'sand floats above the ground plane');
 const drawn=root.children.filter(m=>m.visible);assert.equal(drawn.length,HOURGLASS_VISUAL_BUDGET.draws);
 assert.equal(drawn.filter(m=>m.isLight).length,0);
 const frame=Array.from(positions);v.show(center,2,true);assert.deepEqual(Array.from(positions),frame,'simulation time, not wall-clock time');
 v.show(center,5.25,true);assert.ok(v.telemetry.opacity<.3);assert.equal(sand.geometry.attributes.position.array,positions);assert.equal(shards.instanceMatrix.array,matrices);
 assert.ok(Math.max(...positions.filter((_,i)=>i%3===1))<.3,'sand falls to the floor');
 v.show(center,5.45,true);assert.equal(v.telemetry.particles,0);assert.equal(shards.visible,false);
 let released=0;root.children.forEach(m=>{m.geometry.addEventListener('dispose',()=>released++);m.material.addEventListener('dispose',()=>released++);});
 v.dispose();v.dispose();assert.equal(released,12);assert.equal(scene.children.length,0);
});

test('sand follows sloped terrain with cached height samples, including its warning boundary',()=>{
 const scene=new THREE.Scene();let samples=0;const height=(x,z)=>x*.2+z*.3;
 const visuals=createHourglassVisuals(scene,rules,(x,z)=>{samples++;return height(x,z);});
 const center=new THREE.Vector3(4,height(4,2),2);visuals.show(center,1,true);
 const count=samples;visuals.show(center,2,true);assert.equal(samples,count,'no terrain queries per animation frame');
 const root=scene.getObjectByName('Sanduhrstab · Zeitfeld');
 const points=root.getObjectByName('Sanduhrstab · kreisender Sand').geometry.attributes.position;
 for(let i=0;i<points.count;i++){const clearance=points.getY(i)+center.y-height(points.getX(i)+center.x,points.getZ(i)+center.z);assert.ok(clearance>=.034&&clearance<2);}
 const rim=root.children[0];rim.updateMatrix();
 const p=new THREE.Vector3();for(let i=0;i<rim.geometry.attributes.position.count;i++){p.fromBufferAttribute(rim.geometry.attributes.position,i).applyMatrix4(rim.matrix).add(center);assert.ok(Math.abs(p.y-height(p.x,p.z)-.055)<1e-6);}
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
