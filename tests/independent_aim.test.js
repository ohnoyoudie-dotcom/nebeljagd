import test from 'node:test';
import assert from 'node:assert/strict';
import {aimKind,touchAimVector,directionTo} from '../src/aim-input.js';
import {createLocomotionController} from '../src/locomotion.js';
import {createWeapons} from '../src/weapons.js';
import * as THREE from 'three';
test('independent aim maps right-thumb direction and distance with a stable dead zone',()=>{
 assert.equal(touchAimVector(3,4),null);assert.equal(touchAimVector(NaN,4),null);
 const near=touchAimVector(32,0),far=touchAimVector(128,0);assert.equal(near.x,1);assert.ok(near.ratio<.5);assert.equal(far.ratio,1);
 assert.equal(directionTo({x:0,z:0},{x:5,z:0},Math.PI),Math.PI/2);assert.equal(directionTo({x:0,z:0},{x:0,z:0},1),1);
 assert.equal(aimKind('meteorStaff'),'arc');assert.equal(aimKind('sunStaff'),'area');assert.equal(aimKind('earthbreakerStaff'),'wave');
});
test('backpedaling keeps the aim-facing yaw while leaning and running backwards',()=>{
 const c=createLocomotionController();let m;for(let i=0;i<30;i++)m=c.update(.016,{moving:true,speed:5.6,direction:0,travelDirection:Math.PI,currentYaw:0});
 assert.equal(m.yaw,0);assert.equal(m.backward,true);assert.ok(m.forwardLean<0);assert.ok(m.walkWeight>.9);
});
test('a projectile retains its committed direction during windup while the cursor changes',()=>{
 const scene=new THREE.Scene(),actor=new THREE.Group();scene.add(actor);
 const world={heightAt:()=>0,isLand:()=>true,isWater:()=>false,traceProjectile:()=>null,resolveMovement:p=>p};
 const w=createWeapons(scene,actor,world,null,{placements:[{id:'f',kind:'fireStaff',position:[0,0],rarity:'common'}]});
 const origin=new THREE.Vector3();w.tryAutoPickup(origin);assert.equal(w.equipped,'fireStaff');w.attack(origin,Math.PI/2);
 assert.equal(w.firingDirection,Math.PI/2);actor.rotation.y=-Math.PI/2;w.update(.25,0,origin,-Math.PI/2);
 assert.equal(w.telemetry.lastSpellLaunch.direction,Math.PI/2);w.dispose();
});
