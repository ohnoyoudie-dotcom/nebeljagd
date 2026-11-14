import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCombat} from '../src/combat.js';
import {createWeapons} from '../src/weapons.js';
import {blinkLanding,createBlinkSpell,BLINK_RULES} from '../src/blink-spell.js';
import {traceCombatProjectile} from '../src/projectile-collision.js';
import {createReflectionSpell} from '../src/utility-staff-visuals.js';
const world={heightAt:()=>0,isLand:()=>true,isWater:()=>false,traceProjectile:()=>null,resolveMovement:p=>p};
function setup(type='blinkStaff',extra={}){
 const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);const combat=createCombat();const player=combat.addTarget({id:'player',position:actor.position,maxHealth:100});
 const prototype=new THREE.Group();prototype.add(new THREE.Mesh(new THREE.BoxGeometry(.1,1.7,.1),new THREE.MeshStandardMaterial()));
 const variant=`kit-tripo-${type==='blinkStaff'?'blink':'reflection'}-staff`;
 const weapons=createWeapons(scene,actor,{...world,...extra},null,{combat,placements:[{id:'staff',kind:type,variant,position:[0,0],rarity:'common'}],tripoPrototypes:{[variant]:prototype}});weapons.tryAutoPickup(actor.position);
 let time=0;const tick=seconds=>{for(let left=seconds;left>1e-8;){const dt=Math.min(.02,left);time+=dt;combat.update(dt);weapons.update(dt,time,actor.position);left-=dt;}};
 return {scene,actor,combat,player,weapons,tick,dispose(){weapons.dispose();prototype.children[0].geometry.dispose();prototype.children[0].material.dispose();}};
}
test('blink charges only reach, moves the real actor on release and honors pause/cancel/cooldown',t=>{
 const s=setup();t.after(()=>s.dispose());s.weapons.attack(s.actor.position,0);s.weapons.aimAt(s.actor.position,{x:0,z:20});s.tick(.75);
 assert.equal(s.actor.position.z,0);assert.ok(Math.abs(s.weapons.telemetry.blink.aimRange.radius-4)<.001);assert.equal(s.weapons.telemetry.blink.targetRadius,.6);
 const frozen=s.weapons.telemetry.blink;s.weapons.update(0,50);assert.deepEqual(s.weapons.telemetry.blink,frozen);
 s.tick(.75);assert.equal(s.weapons.releaseAttack(s.actor.position),true);assert.equal(s.actor.position.z,8);assert.equal(s.weapons.attackCooldown,4);
 assert.ok(s.weapons.telemetry.blink.visuals.active);assert.equal(s.weapons.attack(s.actor.position,0),null);s.tick(4);
 s.weapons.attack(s.actor.position,0);s.tick(.7);s.weapons.cancelAim();assert.equal(s.weapons.releaseAttack(s.actor.position),false);assert.equal(s.actor.position.z,8);
 s.weapons.reset();assert.equal(s.weapons.telemetry.blink.visuals.active,false);
});
test('blink cannot cross low walls or land in water, actors, cliffs, props or outside the map',()=>{
 const start=new THREE.Vector3(),goal={x:0,z:8};const combat=createCombat();
 const wall={...world,traceProjectile:()=>({point:{x:0,y:.45,z:3}})};const stop=blinkLanding(wall,combat,'player',start,goal,8);assert.equal(stop.blocked,true);assert.ok(stop.point.z<3&&stop.valid);
 for(const extra of [{isWater:(_x,z)=>z>7.7},{isLand:(_x,z)=>z<7.7},{resolveMovement:p=>{p.z-=.5;}},{heightAt:(x)=>x>.2?2:0}])assert.equal(blinkLanding({...world,...extra},combat,'player',start,goal,8).valid,false);
 combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,8)});assert.equal(blinkLanding(world,combat,'player',start,goal,8).valid,false);
});
test('invalid blink is rechecked at release and consumes no cooldown',t=>{
 let wet=false;const s=setup('blinkStaff',{isWater:()=>wet});t.after(()=>s.dispose());s.weapons.attack(s.actor.position,0);s.tick(1.5);wet=true;
 assert.equal(s.weapons.releaseAttack(s.actor.position),false);assert.equal(s.weapons.attackCooldown,0);assert.equal(s.actor.position.z,0);assert.equal(s.weapons.telemetry.blink.casts,0);
});
test('reflection follows its owner, blocks direct hit statuses, admits melee and ground spells, then expires',t=>{
 const s=setup('reflectionStaff');t.after(()=>s.dispose());assert.ok(s.weapons.attack(s.actor.position,0));s.tick(.2);
 s.actor.position.set(2,0,3);s.tick(.02);assert.equal(s.weapons.telemetry.reflection.position.x,2);assert.ok(s.weapons.telemetry.reflection.visible);
 const blocked=s.combat.hit('player',{sourceId:'enemy',type:'iceStaff',delivery:'projectile',damage:20,slow:{duration:2,multiplier:.2},burn:{duration:3,damagePerSecond:5}});
 assert.ok(blocked.blocked);assert.equal(s.player.health,100);assert.equal(s.player.slowRemaining,0);assert.equal(s.player.burnRemaining,0);
 s.combat.hit('player',{sourceId:'enemy',type:'sword',damage:10});s.combat.hit('player',{sourceId:'enemy',type:'sunStaff',damage:10});assert.equal(s.player.health,80);
 const frozen=s.weapons.telemetry.reflection;s.weapons.update(0,100);assert.deepEqual(s.weapons.telemetry.reflection,frozen);
 s.tick(1.6);assert.equal(s.combat.shieldState('player').active,false);s.combat.hit('player',{sourceId:'enemy',delivery:'projectile',damage:10});assert.equal(s.player.health,70);
 s.weapons.reset();assert.equal(s.weapons.telemetry.reflection.visible,false);assert.equal(s.weapons.attackCooldown,0);
});
test('shield sweeps are three-dimensional, owner-independent and respect an earlier wall',()=>{
 const combat=createCombat(),owner=combat.addTarget({id:'guarded',position:new THREE.Vector3(0,0,5)});combat.activateShield(owner.id);
 const a={x:0,y:1,z:0},b={x:0,y:1,z:10};assert.equal(traceCombatProjectile(world,combat,a,b,.1,'attacker').shield,true);
 assert.equal(traceCombatProjectile(world,combat,a,b,.1,'guarded'),null);
 assert.equal(combat.traceShield({...a,y:5},{...b,y:5},.1,'attacker'),null);
 const wall={t:.1,point:{x:0,y:1,z:1}};assert.equal(traceCombatProjectile({...world,traceProjectile:()=>wall},combat,a,b,.1,'attacker'),wall);
});
test('actual arrows, fire and soul shots deflect without burning, marking or damaging the shielded opponent',t=>{
 for(const type of ['bow','fireStaff','soulStaff']){
  const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);const combat=createCombat(),victim=combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,5)});let blocks=0;combat.activateShield('enemy',()=>blocks++);
  const proto=new THREE.Group();proto.add(new THREE.Mesh(new THREE.BoxGeometry(.1,1.7,.1),new THREE.MeshStandardMaterial()));
  const variant=type==='soulStaff'?'kit-tripo-soul-staff':type==='bow'?'wood':'ember';const weapons=createWeapons(scene,actor,world,null,{combat,placements:[{id:'staff',kind:type,variant,position:[0,0],rarity:'common'}],tripoPrototypes:{[variant]:proto}});t.after(()=>{weapons.dispose();proto.children[0].geometry.dispose();proto.children[0].material.dispose();});
  weapons.tryAutoPickup(actor.position);weapons.attack(actor.position,0);let deflected=false;
  for(let i=0;i<60;i++){combat.update(.02);weapons.update(.02,i*.02,actor.position);deflected ||= [...weapons.telemetry.spells,...weapons.telemetry.arrows].some(s=>s.mode==='deflected');}
  assert.ok(deflected);assert.equal(blocks,1);assert.equal(victim.health,100);assert.equal(victim.burnRemaining,0);assert.equal(weapons.telemetry.soul.marks.length,0);assert.equal(weapons.telemetry.damageHits,0);
 }
});
