import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, PerspectiveCamera } from 'three';
import { createArrival, steerArrival, resolveArrivalTarget, arrivalSteeringSpeed, arrivalCameraNear } from '../src/arrival.js';
const bounds={minX:-600,maxX:600,minZ:-720,maxZ:720};
test('start immediately descends without a selection phase and pause freezes descent',()=>{
 const a=createArrival();a.start();const s=a.snapshot();assert.equal(s.stage,'dive');assert.equal(s.height,1600);
 a.update(.1);assert(a.snapshot().height<1600);assert(a.snapshot().progress>0);
 const frozen=a.snapshot();a.update(0);assert.deepEqual(a.snapshot(),frozen);
});
test('automatic descent lands once at every simulation rate and returns upright before impact',()=>{
 for(const hz of [30,60,120]){
  const a=createArrival();a.start();let last=1600,landings=0;
  for(let i=0;i<hz*14;i++){const s=a.update(1/hz);assert(s.height>=0&&s.height<=last);last=s.height;landings+=s.landed?1:0;if(s.height<1)assert(s.diveTilt<.4);}
  assert.equal(landings,1);assert.equal(a.snapshot().stage,'ground');assert.equal(a.snapshot().impact,1);
 }
});
test('restart clears the old impact and cancellation leaves no airborne pose',()=>{
 const a=createArrival();a.start({height:2000});a.update(10);assert.equal(a.snapshot().impact,0);a.start({height:1800});assert.equal(a.snapshot().height,1800);assert.equal(a.snapshot().impact,1);a.cancel();assert.equal(a.snapshot().height,0);assert.equal(a.snapshot().diveTilt,0);assert(!a.update(9).landed);
});
test('air steering can cross the full world, normalizes diagonals and stays within map bounds',()=>{
 const p=new Vector3(-550,0,-600);steerArrival(p,new Vector3(1,0,1),10,{bounds});assert.deepEqual([p.x,p.z],[600,720]);
 const q=new Vector3();steerArrival(q,new Vector3(1,0,1),1,{bounds});assert(Math.abs(q.length()-280)<1e-8);
});
test('landing validation rejects water, out-of-bounds points and large or unstable collision corrections',()=>{
 const opts={bounds,safe:p=>p.x>=0,heightAt:()=>3,resolve:()=>{}};
 assert.equal(resolveArrivalTarget(new Vector3(-5,0,0),opts),null);assert.equal(resolveArrivalTarget(new Vector3(900,0,0),opts),null);
 assert.equal(resolveArrivalTarget(new Vector3(50,0,0),{...opts,resolve:p=>p.x+=1}),null);
 assert.equal(resolveArrivalTarget(new Vector3(50,0,0),{...opts,resolve:p=>p.x=60}),null);
 const p=resolveArrivalTarget(new Vector3(50,0,0),{...opts,resolve:p=>p.x=Math.max(50.5,p.x)});assert.deepEqual(p.toArray(),[50.5,3,0]);
});

test('immediate drop provides enough steering travel to reach every world corner from spawn',()=>{
 for(const target of [new Vector3(-600,0,-720),new Vector3(600,0,-720),new Vector3(-600,0,720),new Vector3(600,0,720)]){
  const a=createArrival(),p=new Vector3(30,0,-42);a.start();let reached=false;
  for(let i=0;i<600;i++){
   const direction=target.clone().sub(p),speed=arrivalSteeringSpeed(a.snapshot(),1440);
   if(direction.length()<speed/60+1){reached=true;break;}
   steerArrival(p,direction,1/60,{bounds,speed});a.update(1/60);
  }
  assert(reached,`Unreachable corner ${target.x},${target.z}`);
 }
});

test('high-altitude camera resolves nearby sea and land depths without clipping the comet',()=>{
 const camera=new PerspectiveCamera(65,1,arrivalCameraNear(1600),10000);camera.position.set(0,1615,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const land=new Vector3(0,0,0).project(camera).z,sea=new Vector3(0,-.35,0).project(camera).z;
 assert(Math.abs(land-sea)*.5*(2**24)>5);
 assert(camera.near<15-4);assert.equal(arrivalCameraNear(0),.1);
});
