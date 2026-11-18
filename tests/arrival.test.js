import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createArrival, steerArrival } from '../src/arrival.js';
test('arrival lands once with a smooth height, independent of simulation rate', () => {
 for (const hz of [30,60,120]) {
  const a=createArrival();a.start();let last=24,landings=0;
  for(let i=0;i<hz*5;i++){const s=a.update(1/hz);assert(s.height>=0&&s.height<=last);last=s.height;landings+=s.landed?1:0;}
  assert.equal(landings,1);assert.equal(a.snapshot().active,false);assert.equal(a.snapshot().height,0);
 }
});
test('pause preserves descent; restart and cancellation clear landing state',()=>{
 const a=createArrival();a.start();a.update(1.3);const s=a.snapshot();a.update(0);assert.deepEqual(a.snapshot(),s);
 a.update(3);assert(a.snapshot().impact<1);a.start();assert.equal(a.snapshot().height,24);assert.equal(a.snapshot().impact,1);
 a.cancel();assert.equal(a.snapshot().height,0);assert.equal(a.snapshot().active,false);assert.equal(a.update(1).landed,false);
});
test('arrival steering normalizes diagonals and rejects unsafe or distant collision resolution',()=>{
 const p=new Vector3();const d=new Vector3(1,0,1);const resolve=()=>{};
 steerArrival(p,d,1,{resolve,safe:()=>true});assert(Math.abs(p.length()-5)<1e-8);
 const before=p.clone();steerArrival(p,d,1,{resolve,safe:()=>false});assert(p.equals(before));
 steerArrival(p,d,1,{resolve:v=>v.x+=100,safe:()=>true});assert(p.equals(before));
});
