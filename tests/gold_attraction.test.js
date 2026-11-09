import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPickups} from '../src/pickups.js';

test('nearby gold accelerates toward a moving player and pays exactly once on arrival',()=>{
 const pickups=createPickups(new THREE.Scene(),{placements:[]});
 const coin=pickups.addDrop({type:'gold',position:[0,0],amount:19},{pop:false});
 const player=new THREE.Vector3(3,0,0),events=[];
 const tick=dt=>pickups.update(dt,0,player,{onCollect:e=>events.push(e)});
 tick(.1);assert.equal(coin.x,0,'outside attraction radius');
 player.x=2.5;tick(.05);
 assert.ok(coin.x>0&&coin.x<.3);assert.equal(events.length,0,'no payment until arrival');
 const first=coin.x;tick(.05);assert.ok(coin.x-first>first,'accelerates');
 const frozen=coin.group.position.clone();tick(0);assert.deepEqual(coin.group.position,frozen);
 player.z=.5;
 for(let i=0;i<60;i++)tick(1/60);
 assert.ok(coin.collected);assert.ok(coin.z>.3,'tracks changed player position');
 assert.equal(events.length,1);assert.equal(events[0].amount,19);
 tick(1);assert.equal(events.length,1);
 pickups.reset();assert.equal(pickups.items.length,0);
});

test('attraction respects walls, fog, disabled collection and chest flight; hearts stay put',()=>{
 let blocked=true,visible=true;
 const pickups=createPickups(new THREE.Scene(),{placements:[{id:'heart',kind:'heart',position:[0,0]}],isVisible:()=>visible,
  world:{traceProjectile:()=>blocked?{}:null}});
 const coin=pickups.addDrop({type:'gold',position:[0,0]},{pop:false});
 const player=new THREE.Vector3(2,0,0);
 const tick=(options={})=>pickups.update(.05,0,player,{health:50,...options});
 tick();assert.equal(coin.x,0);
 blocked=false;visible=false;tick();assert.equal(coin.x,0);
 visible=true;tick({canCollect:false});assert.equal(coin.x,0);
 tick();assert.ok(coin.x>0);assert.equal(pickups.items[0].x,0);
 blocked=true;const x=coin.x;tick();assert.equal(coin.x,x,'new obstacle stops an active pull');
 blocked=false;
 const airborne=pickups.addDrop({type:'gold',position:[0,1],origin:[0,0]});
 tick();assert.equal(airborne.x,0);assert.equal(airborne.z,1);assert.ok(!airborne.collected);
});
