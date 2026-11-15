import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat } from '../src/combat.js';
import { activeStatusEffects } from '../src/status-effects.js';
const ids=(target,combat)=>activeStatusEffects(target,combat.shieldState(target.id)).map(e=>e.id);
function fixture(){const combat=createCombat();const target=combat.addTarget({id:'player',position:{x:0,y:0,z:0},health:100});return{combat,target};}
test('the eight status icons follow actual combat effects and shield lifetime',()=>{
 const {combat,target}=fixture();assert.deepEqual(ids(target,combat),[]);
 combat.hit(target,{sourceId:'enemy',burn:{duration:3,damagePerSecond:1},poison:{duration:3,damagePerSecond:1},slow:{duration:3,multiplier:.5},stun:3,reveal:3,blind:{duration:3,radius:3}});
 combat.setTimeSlow(target,'hourglass',.5,3);combat.activateShield('player');
 assert.deepEqual(ids(target,combat),['burn','poison','cold','slow','stun','revealed','blind','shield']);
 const paused=activeStatusEffects(target,combat.shieldState('player'));combat.update(0);assert.deepEqual(activeStatusEffects(target,combat.shieldState('player')),paused);
 combat.update(1.81);assert.equal(ids(target,combat).includes('shield'),false);assert.equal(ids(target,combat).length,7);
 combat.update(1.2);assert.deepEqual(ids(target,combat),[]);
});
test('light and shadow share one blind icon until both have expired; field refresh is immediate',()=>{
 const {combat,target}=fixture();combat.hit(target,{sourceId:'enemy',blind:{duration:1,radius:3},darken:{duration:2,radius:2.5}});
 assert.deepEqual(ids(target,combat),['blind']);assert.equal(activeStatusEffects(target)[0].remaining,2);
 combat.update(1.2);assert.deepEqual(ids(target,combat),['blind']);
 combat.hit(target,{sourceId:'enemy',darken:{duration:2,radius:2.5}});assert.equal(activeStatusEffects(target)[0].remaining,2);
 combat.update(2.01);assert.deepEqual(ids(target,combat),[]);
});
test('slowing sources expire independently and never show an inactive hourglass',()=>{
 const {combat,target}=fixture();combat.setTimeSlow(target,'a',.5,.2);combat.setTimeSlow(target,'b',.7,1);
 combat.hit(target,{sourceId:'enemy',slow:{duration:.5,multiplier:.5}});assert.deepEqual(ids(target,combat),['cold','slow']);
 combat.update(.6);assert.deepEqual(ids(target,combat),['slow']);combat.update(.5);assert.deepEqual(ids(target,combat),[]);
 combat.setTimeSlow(target,'none',1,5);assert.deepEqual(ids(target,combat),[]);
});
test('death, reset and destructibles never retain status badges',()=>{
 const {combat,target}=fixture();combat.hit(target,{sourceId:'enemy',burn:{duration:3,damagePerSecond:1}});combat.activateShield('player');combat.hit(target,{sourceId:'enemy',damage:200});assert.deepEqual(ids(target,combat),[]);
 combat.reset();assert.deepEqual(ids(target,combat),[]);
 assert.deepEqual(activeStatusEffects({alive:true,destructible:true,burnRemaining:3}),[]);
});
