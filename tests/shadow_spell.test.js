import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createShadowSpell } from '../src/shadow-spell.js';
import { createDarkenedIndicators } from '../src/shadow-visuals.js';
import { effectiveSightRadius } from '../src/darkened-status.js';
import { createVision } from '../src/vision.js';

function fixture(){
 const scene=new THREE.Scene(),combat=createCombat(),p=new THREE.Vector3();
 const world={heightAt:()=>0,isLand:()=>true,traceProjectile:()=>null,concealmentAt:()=>0};
 const owner=combat.addTarget({id:'player',position:p,teamId:'blue'});
 const enemy=combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,5)});
 const spell=createShadowSpell(scene,world,combat,'player');
 function cast(){assert.equal(spell.beginAim(p),true);spell.aimAt(p,{x:0,z:5});spell.update(3,p);assert.equal(spell.release(p,{damage:8}),true);for(let i=0;i<60&&!spell.telemetry.center;i++)spell.update(1/60,p);assert.ok(spell.telemetry.center);}
 return{scene,combat,p,world,owner,enemy,spell,cast};
}
test('four metre field holds darkness, refreshes on reentry, but damages each opponent only once',()=>{
 const f=fixture();f.cast();assert.equal(f.spell.telemetry.radius,4);assert.equal(f.enemy.health,92);assert.equal(f.enemy.darkenedRemaining,2);
 assert.equal(f.enemy.speedMultiplier,1);assert.equal(f.enemy.canAct,true);assert.equal(f.owner.health,100);
 f.combat.update(.8);f.spell.update(.8,f.p);assert.equal(f.enemy.darkenedRemaining,2);
 f.enemy.position.x=8;f.combat.update(.5);f.spell.update(.5,f.p);assert.equal(f.enemy.darkenedRemaining,1.5);
 f.enemy.position.x=0;f.combat.update(.1);f.spell.update(.1,f.p);assert.equal(f.enemy.darkenedRemaining,2);assert.equal(f.enemy.health,92);
 const late=f.combat.addTarget({id:'late',position:new THREE.Vector3(3.8,0,5)});
 const ally=f.combat.addTarget({id:'ally',position:late.position.clone(),teamId:'blue'});
 f.spell.update(.1,f.p);assert.equal(late.health,92);assert.equal(ally.health,100);assert.equal(f.spell.telemetry.hits,2);
 f.enemy.position.x=8;f.combat.update(1.1);f.spell.update(1.1,f.p);assert.ok(Math.abs(f.enemy.darkenedRemaining-.9)<1e-8);
 f.combat.update(.9);f.spell.update(.9,f.p);assert.equal(f.enemy.darkenedRemaining,0);
 const tooLate=f.combat.addTarget({id:'too-late',position:late.position.clone()});f.spell.update(.1,f.p);assert.equal(tooLate.health,100);
 f.spell.update(1,f.p);assert.equal(f.spell.busy,false);f.spell.dispose();assert.equal(f.scene.children.length,0);
});
test('field expiry starts the two second tail, including frames crossing the expiry boundary',()=>{
 const f=fixture();f.cast();f.combat.update(2.9);f.spell.update(2.9,f.p);assert.equal(f.enemy.darkenedRemaining,2);
 f.combat.update(.3);f.spell.update(.3,f.p);assert.ok(Math.abs(f.enemy.darkenedRemaining-1.8)<1e-8);assert.equal(f.enemy.health,92);
 f.combat.update(1.8);f.spell.update(1.8,f.p);assert.equal(f.enemy.darkenedRemaining,0);assert.equal(f.spell.telemetry.hits,1);f.spell.dispose();
});
test('new cover stops refreshing darkness while an opponent remains inside the field radius',()=>{
 const f=fixture();f.cast();f.world.traceProjectile=()=>({t:0,point:{x:0,y:1,z:3},collider:{}});
 f.combat.update(.6);f.spell.update(.6,f.p);assert.equal(f.enemy.darkenedRemaining,1.4);
 f.world.traceProjectile=()=>null;f.combat.update(.1);f.spell.update(.1,f.p);assert.equal(f.enemy.darkenedRemaining,2);assert.equal(f.enemy.health,92);f.spell.dispose();
});
test('shadow statuses coexist with sunlight and enforce real geometric sight without immobilization',()=>{
 const {combat,enemy}=fixture();const vision=createVision(new THREE.Scene(),{spawn:{x:0,z:0},heightAt:()=>0,projectileObstacles:[]});
 combat.hit(enemy,{sourceId:'player',darken:{duration:2,radius:2.5}});
 combat.hit(enemy,{sourceId:'player',blind:{duration:4,radius:3}});
 vision.setSightLimit(effectiveSightRadius(enemy),{smoke:true});assert.equal(vision.isVisible({x:2.4,z:0}),true);assert.equal(vision.isVisible({x:2.6,z:0}),false);
 combat.update(2);assert.equal(effectiveSightRadius(enemy),3);combat.update(2);assert.equal(effectiveSightRadius(enemy),Infinity);
 combat.hit(enemy,{sourceId:'player',darken:{duration:2,radius:2.5}});combat.reset();assert.equal(enemy.darkenedRemaining,0);vision.dispose();
});
test('status markers never expose concealed, occluded or expired enemies',()=>{
 const f=fixture();let visible=true,concealed=0;
 f.world.concealmentAt=()=>concealed;
 const marks=createDarkenedIndicators(f.scene,f.combat,f.world,()=>visible);
 f.cast();marks.update(.1);assert.deepEqual(marks.telemetry.visibleTargets,['enemy']);
 visible=false;marks.update(.1);assert.deepEqual(marks.telemetry.visibleTargets,[]);
 visible=true;concealed=1;marks.update(.1);assert.deepEqual(marks.telemetry.visibleTargets,[]);
 concealed=0;marks.update(.1);assert.deepEqual(marks.telemetry.visibleTargets,['enemy']);
 f.combat.update(2);marks.update(.1);assert.deepEqual(marks.telemetry.visibleTargets,[]);marks.dispose();f.spell.dispose();assert.equal(f.scene.children.length,0);
});
test('field respects cover, arc cannot tunnel through tall walls, invalid ground cancels',()=>{
 const f=fixture();f.world.traceProjectile=(a,b)=>a.z<2&&b.z>=2?{t:.5,point:{x:0,y:2,z:2},collider:{}}:a.z===2&&b.z>2?{t:0,point:a,collider:{}}:null;
 f.cast();assert.equal(f.spell.telemetry.center.z,2);assert.equal(f.enemy.health,100);f.spell.reset();
 f.world.isWater=()=>true;assert.equal(f.spell.beginAim(f.p),true);f.spell.update(3,f.p);assert.equal(f.spell.release(f.p,{damage:8}),false);
 f.spell.reset();f.combat.hit(f.owner,{sourceId:'enemy',damage:100});f.spell.update(.1,f.p);assert.equal(f.spell.busy,false);f.spell.dispose();
});
