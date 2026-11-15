import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createClockworkSpell, guardianLanding } from '../src/clockwork-spell.js';
import { createWeapons } from '../src/weapons.js';
import { awardDefeat,createProgressionState } from '../src/progression.js';
function fixture(){
 const scene=new THREE.Scene(),combat=createCombat(),p=new THREE.Vector3();
 const world={heightAt:()=>0,isLand:()=>true,traceProjectile:()=>null,concealmentAt:()=>0};
 const owner=combat.addTarget({id:'player',position:p,teamId:'blue'}),enemy=combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,9)});
 const spell=createClockworkSpell(scene,world,combat,'player');
 function cast(){assert.equal(spell.beginAim(p),true);spell.aimAt(p,{x:0,z:4});spell.update(3,p);assert.equal(spell.release(p,{damage:5}),true);for(let i=0;i<100&&!spell.telemetry.guardian;i++)spell.update(.01,p);assert.ok(spell.telemetry.guardian);}
 return{scene,combat,p,world,owner,enemy,spell,cast};
}
test('guardian unfolds, stays put, fires fast committed bolts and expires after eight seconds',()=>{
 const f=fixture();f.cast();const id=f.spell.telemetry.guardian.id;assert.equal(f.combat.targets.get(id).health,25);
 f.spell.update(.3,f.p);assert.equal(f.spell.telemetry.shots,0);
 f.spell.update(.15,f.p);assert.equal(f.spell.telemetry.shots,1);assert.equal(f.enemy.health,100);
 const bolt=f.spell.telemetry.bullets[0];assert.ok(Math.abs(Math.hypot(...Object.values(bolt.velocity))-14)<1e-6);
 f.enemy.position.x=3;f.spell.update(.75,f.p);assert.equal(f.enemy.health,100,'first bolt can be dodged');
 f.p.set(30,0,30);f.spell.update(2.9,f.p);assert.ok(f.enemy.health<100);assert.equal(f.spell.telemetry.guardian.position.z,4);
 f.spell.update(.4,f.p);assert.ok(f.spell.telemetry.guardian);f.spell.update(4,f.p);assert.equal(f.spell.telemetry.guardian,null);assert.equal(f.combat.targets.has(id),false);assert.equal(f.spell.telemetry.shots,8);
 f.spell.update(2,f.p);assert.equal(f.spell.telemetry.bullets.length,0);assert.equal(f.spell.busy,false);f.spell.dispose();assert.equal(f.scene.children.length,0);
});
test('guardian refuses allies, props, concealed targets and solid cover; no local-viewer-dependent AI',()=>{
 const f=fixture();f.cast();const ally=f.combat.addTarget({id:'ally',teamId:'blue',position:new THREE.Vector3(0,0,6)});
 f.combat.addTarget({id:'prop',destructible:true,position:new THREE.Vector3(1,0,6)});
 f.world.concealmentAt=()=>1;f.spell.update(.5,f.p);assert.equal(f.spell.telemetry.shots,0);
 f.world.concealmentAt=()=>0;f.world.traceProjectile=()=>({point:{x:0,y:1,z:7},t:.2,collider:{}});f.spell.update(1,f.p);assert.equal(f.spell.telemetry.shots,0);
 f.world.traceProjectile=()=>null;f.spell.update(.1,f.p);assert.equal(f.spell.telemetry.guardian.targetId,'enemy');assert.equal(f.spell.telemetry.shots,1);
 f.spell.update(.8,f.p);assert.equal(ally.health,100);assert.equal(f.enemy.health,95);f.spell.dispose();
});
test('walls appearing after launch intercept bolts; shields block damage',()=>{
 const f=fixture();f.cast();f.spell.update(.45,f.p);assert.equal(f.spell.telemetry.shots,1);
 f.world.traceProjectile=()=>({t:.1,point:{x:0,y:1,z:6},collider:{}});f.spell.update(.8,f.p);assert.equal(f.enemy.health,100);assert.equal(f.spell.telemetry.bullets.length,0);
 f.world.traceProjectile=()=>null;f.combat.activateShield('enemy');f.spell.update(1.2,f.p);assert.equal(f.enemy.health,100);assert.ok(f.combat.shieldState('enemy').blocks>0);f.spell.dispose();
});
test('destruction works through combat, gives no level reward, never leaves targets on death or reset',()=>{
 const f=fixture();f.cast();assert.equal(f.spell.beginAim(f.p),false);let t=f.combat.targets.get(f.spell.telemetry.guardian.id);
 assert.ok(f.combat.melee(new THREE.Vector3(0,0,3),0,2,Math.PI,'enemy').includes(t));
 assert.equal(f.combat.traceSegment({x:0,y:1,z:2},{x:0,y:1,z:5},.1,'enemy').target,t);
 const result=f.combat.hit(t,{sourceId:'enemy',damage:25});assert.equal(result.killed,true);assert.equal(awardDefeat(createProgressionState(),result,t),null);
 f.spell.update(.01,f.p);assert.equal(f.spell.telemetry.lastEnd,'destroyed');assert.equal(f.combat.targets.has(t.id),false);f.spell.update(1,f.p);
 f.cast();f.spell.reset();assert.equal(f.combat.targets.size,2);f.cast();f.combat.hit(f.owner,{sourceId:'enemy',damage:100});f.spell.update(.01,f.p);assert.equal(f.combat.targets.size,2);assert.equal(f.spell.telemetry.bullets.length,0);f.spell.dispose();
});
test('placement checks full footprint, overlapping actors, walls and water; impact revalidates',()=>{
 const f=fixture(),p=new THREE.Vector3(0,0,4);assert.equal(guardianLanding(f.world,f.combat,p),true);
 f.world.isWater=(x)=>x>.3;assert.equal(guardianLanding(f.world,f.combat,p),false);f.world.isWater=()=>false;
 assert.equal(guardianLanding(f.world,f.combat,f.enemy.position),false);
 f.spell.beginAim(f.p);f.spell.aimAt(f.p,p);f.spell.update(3,f.p);f.spell.release(f.p,{damage:5});f.enemy.position.copy(p);f.spell.update(1,f.p);assert.equal(f.spell.telemetry.active,false);assert.equal(f.combat.targets.size,2);f.spell.dispose();
});
test('weapon switching preserves the active guardian and both per-weapon cooldowns; restart cleans up',()=>{
 const f=fixture();f.spell.dispose();const actor=new THREE.Group();const proto=new THREE.Group();proto.add(new THREE.Mesh(new THREE.BoxGeometry(.1,1.7,.1),new THREE.MeshStandardMaterial()));
 const weapons=createWeapons(f.scene,actor,f.world,null,{combat:f.combat,tripoPrototypes:{'kit-tripo-shadow-staff':proto,'kit-tripo-clockwork-staff':proto},placements:[{id:'clock',kind:'clockworkStaff',position:[0,0],rarity:'common'},{id:'shadow',kind:'shadowStaff',position:[1,0],rarity:'common'}]});
 weapons.tryAutoPickup(f.p);weapons.attack(f.p,0);weapons.aimAt(f.p,new THREE.Vector3(0,0,4));for(let i=0;i<30;i++)weapons.update(.1,i*.1,f.p,0);assert.equal(weapons.releaseAttack(f.p),true);
 for(let i=0;i<10;i++)weapons.update(.1,3+i*.1,f.p,0);assert.ok(weapons.telemetry.clockwork.guardian);
 weapons.interact(new THREE.Vector3(1,0,0));assert.equal(weapons.equipped,'shadowStaff');assert.equal(weapons.attackCooldown,0);assert.ok(weapons.telemetry.clockwork.guardian);
 weapons.attack(f.p,0);weapons.aimAt(f.p,new THREE.Vector3(0,0,5));for(let i=0;i<20;i++)weapons.update(.1,4+i*.1,f.p,0);assert.equal(weapons.releaseAttack(f.p),true);
 weapons.interact(new THREE.Vector3(1,0,0));assert.equal(weapons.equipped,'clockworkStaff');assert.ok(weapons.attackCooldown>4);weapons.reset();assert.equal(f.combat.targets.size,2);weapons.dispose();
});

test('normal bow and staff attacks can destroy the compact guardian with yaw-only aiming',()=>{
 for(const kind of ['bow','fireStaff','iceStaff']){
  const f=fixture();f.cast();const guardian=f.combat.targets.get(f.spell.telemetry.guardian.id);
  const actor=new THREE.Group();actor.scale.setScalar(1.2);actor.position.set(0,0,1);
  const weapons=createWeapons(f.scene,actor,f.world,null,{combat:f.combat,ownerId:'enemy',placements:[{id:'attack',kind,position:[0,1],rarity:'common'}]});
  weapons.tryAutoPickup(actor.position);weapons.attack(actor.position,0);if(kind==='bow')weapons.releaseAttack(actor.position);
  for(let i=0;i<60;i++)weapons.update(.02,i*.02,actor.position,0);
  assert.ok(guardian.health<25,kind+' hits through the normal projectile pipeline');weapons.dispose();f.spell.dispose();
 }
});

test('emitted bolts remain perfectly straight after targets move, disappear or switch',()=>{
 const f=fixture();f.cast();f.spell.update(.41,f.p);const first=f.spell.telemetry.bullets[0];assert.ok(first);
 f.enemy.position.set(3,0,9);f.combat.addTarget({id:'other',position:new THREE.Vector3(-4,0,4)});
 f.spell.update(.05,f.p);const next=f.spell.telemetry.bullets.find(b=>b.id===first.id);assert.ok(next);assert.deepEqual(next.velocity,first.velocity);
 for(const axis of ['x','y','z'])assert.ok(Math.abs(next.position[axis]-first.position[axis]-first.velocity[axis]*.05)<1e-7);
 f.enemy.health=0;f.spell.update(.05,f.p);const last=f.spell.telemetry.bullets.find(b=>b.id===first.id);assert.ok(last);assert.deepEqual(last.velocity,first.velocity);
 assert.equal(f.spell.telemetry.homing,false);assert.equal(f.spell.telemetry.projectileSpeed,14);assert.equal(f.spell.telemetry.duration,8);f.spell.dispose();
});
