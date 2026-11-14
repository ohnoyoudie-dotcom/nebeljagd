import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createEarthbreakerSpell } from '../src/earthbreaker-spell.js';
import { createRuneWallSpell } from '../src/rune-wall-spell.js';
import { temporaryObstacles } from '../src/temporary-obstacles.js';
import { createSightModel } from '../src/visibility-model.js';
import { traceCombatProjectile } from '../src/projectile-collision.js';
import { createWeapons } from '../src/weapons.js';
function setup(extra={}){
 const world={heightAt:()=>0,isLand:()=>true,isWater:()=>false,resolveMovement:p=>p,traceProjectile:()=>null,...extra};
 const combat=createCombat(),scene=new THREE.Scene(),player=new THREE.Vector3();combat.addTarget({id:'player',position:player});
 return{world,combat,scene,player};
}
function raise(s,controller,goal={x:0,z:5}){assert.ok(controller.beginAim(s.player,0));controller.aimAt(s.player,goal);controller.update(1.5,s.player);assert.ok(controller.release(s.player));controller.update(.65,s.player);}
test('earthbreaker warns, freezes on pause, progresses and hits each opponent only once per cast',()=>{
 for(const dt of [.02,.25]){
  const s=setup(),near=s.combat.addTarget({id:'near',position:new THREE.Vector3(0,0,2)}),far=s.combat.addTarget({id:'far',position:new THREE.Vector3(0,0,8)});
  const spell=createEarthbreakerSpell(s.scene,s.world,s.combat,'player');assert.ok(spell.cast(s.player,0,{damage:18}));
  spell.update(.3);assert.equal(near.health,100);const frozen=spell.telemetry;spell.update(0);assert.deepEqual(spell.telemetry,frozen);
  for(let t=0;t<2;t+=dt)spell.update(dt);
  assert.equal(near.health,82);assert.equal(far.health,82);assert.equal(spell.telemetry.hits,2);assert.equal(spell.busy,false);spell.dispose();assert.equal(s.scene.children.length,0);
 }
});
test('earthbreaker cannot cross solid cover, water gaps, cliffs or a wall raised after the warning',()=>{
 const index=createCollisionIndex([],[{minX:-2,maxX:2,minZ:3,maxZ:3.4,minY:0,maxY:2}]);
 for(const extra of [{traceProjectile:(...args)=>index.traceSegment(...args)},{isWater:(_x,z)=>z>3&&z<3.6},{heightAt:(_x,z)=>z>3?3:0}]){
  const s=setup(extra),enemy=s.combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,5)}),spell=createEarthbreakerSpell(s.scene,s.world,s.combat,'player');
  spell.cast(s.player,0,{damage:18});spell.update(2);assert.equal(enemy.health,100);spell.dispose();
 }
 const s=setup(),enemy=s.combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,5)}),spell=createEarthbreakerSpell(s.scene,s.world,s.combat,'player');
 spell.cast(s.player,0,{damage:18});temporaryObstacles(s.world).add('late',{center:{x:0,y:0,z:3},angle:0,width:3.5,depth:.65,height:2.3,ownerId:'enemy'});
 spell.update(2);assert.equal(enemy.health,100);spell.dispose();
});
test('runemauer uses real rotated collision, blocks both firing directions, admits shots above it and clears on expiry',()=>{
 const s=setup(),spell=createRuneWallSpell(s.scene,s.world,s.combat,'player');raise(s,spell,{x:4,z:4});assert.ok(spell.telemetry.solid);
 const center=spell.telemetry.center,dx=Math.SQRT1_2,dz=Math.SQRT1_2;
 const a={x:center.x-dx*3,y:1,z:center.z-dz*3},b={x:center.x+dx*3,y:1,z:center.z+dz*3};
 assert.equal(s.world.traceProjectile(a,b,.05).type,'runeWall');assert.equal(s.world.traceProjectile(b,a,.05).type,'runeWall');
 assert.equal(s.world.traceProjectile({...a,y:3},{...b,y:3},.05),null);
 const p=new THREE.Vector3(center.x,0,center.z);s.world.resolveMovement(p,.42);assert.ok(Math.hypot(p.x-center.x,p.z-center.z)>.7);
 const frozen=spell.telemetry;spell.update(0,s.player);assert.deepEqual(spell.telemetry,frozen);
 spell.update(4.5,s.player);assert.equal(s.world.traceProjectile(a,b,.05),null);assert.equal(s.world.temporaryObstacles.size,0);assert.equal(s.combat.targets.size,1);spell.dispose();assert.equal(s.scene.children.length,0);
});
test('runemauer allows owner vision, blocks enemy vision, is destructible without phantom circular hits',()=>{
 const s=setup(),spell=createRuneWallSpell(s.scene,s.world,s.combat,'player');raise(s,spell);
 const dynamicObstacles=()=>s.world.temporaryObstacles.list(),owner=createSightModel({dynamicObstacles,ownerId:'player'}),enemy=createSightModel({dynamicObstacles,ownerId:'enemy'});
 owner.update(s.player);enemy.update(s.player);assert.ok(owner.isVisible({x:0,z:8}));assert.equal(enemy.isVisible({x:0,z:8}),false);
 const shot=traceCombatProjectile(s.world,s.combat,{x:1.5,y:1,z:2},{x:1.5,y:1,z:8},.05,'player');assert.ok(shot.target?.destructible);
 assert.equal(traceCombatProjectile(s.world,s.combat,{x:-3,y:1,z:3.6},{x:3,y:1,z:3.6},.05,'player'),null,'the large target circle must not catch shots passing outside the wall');
 s.combat.hit(shot.target,{damage:50,sourceId:'enemy',delivery:'projectile'});assert.equal(s.world.traceProjectile({x:0,y:1,z:2},{x:0,y:1,z:8}),null,'destroyed cover stops blocking immediately');
 spell.update(.01,s.player);assert.equal(spell.telemetry.visuals.phase,'crumbling');spell.update(1,s.player);assert.equal(s.combat.targets.size,1);spell.dispose();
});
test('wall placement rejects occupied or wet ground and revalidates when it becomes solid',()=>{
 for(const extra of [{isWater:()=>true},{heightAt:(x)=>x>1?3:0}]){const s=setup(extra),spell=createRuneWallSpell(s.scene,s.world,s.combat,'player');spell.beginAim(s.player,0);spell.update(1.5,s.player);assert.equal(spell.release(s.player),false);spell.dispose();}
 const s=setup(),spell=createRuneWallSpell(s.scene,s.world,s.combat,'player');spell.beginAim(s.player,0);spell.aimAt(s.player,{x:0,z:5});spell.update(1.5,s.player);assert.ok(spell.release(s.player));
 s.combat.addTarget({id:'entrant',position:new THREE.Vector3(0,0,5)});spell.update(.4,s.player);assert.equal(spell.telemetry.solid,false);assert.equal(s.world.temporaryObstacles.size,0);spell.dispose();
});
test('real weapon integration casts both staffs, cancels invalid aims, and preserves cooldown through swaps',()=>{
 const s=setup(),actor=new THREE.Group();s.scene.add(actor);
 const prototype=new THREE.Group();prototype.add(new THREE.Mesh(new THREE.BoxGeometry(.1,1.7,.1),new THREE.MeshStandardMaterial()));
 const weapons=createWeapons(s.scene,actor,s.world,null,{combat:s.combat,placements:[{id:'rune',kind:'runeWallStaff',variant:'kit-tripo-rune-wall-staff',position:[0,0],rarity:'common'},{id:'earth',kind:'earthbreakerStaff',variant:'kit-tripo-earthbreaker-staff',position:[1,0],rarity:'common'}],tripoPrototypes:{'kit-tripo-rune-wall-staff':prototype,'kit-tripo-earthbreaker-staff':prototype}});
 weapons.tryAutoPickup(s.player);weapons.attack(s.player,0);weapons.update(1.5,0,s.player);weapons.cancelAim();assert.equal(weapons.releaseAttack(s.player),false);assert.equal(weapons.attackCooldown,0);
 weapons.attack(s.player,0);weapons.aimAt(s.player,{x:0,z:5});for(let i=0;i<80;i++)weapons.update(.02,i*.02,s.player);assert.ok(weapons.releaseAttack(s.player));assert.equal(weapons.attackCooldown,6);
 for(let i=0;i<40;i++)weapons.update(.02,2+i*.02,s.player);assert.ok(weapons.telemetry.runeWall.solid);
 weapons.interact(new THREE.Vector3(1,0,0));assert.equal(weapons.equipped,'earthbreakerStaff');assert.equal(weapons.attackCooldown,0);assert.ok(weapons.attack(s.player,Math.PI/2));assert.ok(weapons.telemetry.earthbreaker.active);weapons.interact(new THREE.Vector3(1,0,0));assert.equal(weapons.equipped,'runeWallStaff');assert.ok(weapons.attackCooldown>5);weapons.reset();assert.equal(s.world.temporaryObstacles.size,0);assert.equal(s.combat.targets.size,1);weapons.dispose();prototype.children[0].geometry.dispose();prototype.children[0].material.dispose();
});
