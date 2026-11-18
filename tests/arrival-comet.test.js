import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3, PerspectiveCamera } from 'three';
import { createArrivalComet } from '../src/arrival-comet.js';
import { createArrival, arrivalSteeringSpeed } from '../src/arrival.js';

test('unsafe landings hover, remain steerable and land once after reaching safe ground',()=>{
 for(const hz of [30,60,120]) {
  const a=createArrival();a.start();a.dive();let landings=0;
  for(let i=0;i<hz*12;i++)landings+=Number(a.update(1/hz,{canLand:false}).landed);
  assert.equal(landings,0);assert(a.snapshot().active&&a.snapshot().waitingForLanding);assert(a.snapshot().height>1);
  const held=a.snapshot();a.update(0,{canLand:false});assert.deepEqual(a.snapshot(),held);
  assert(arrivalSteeringSpeed(held,1440)>100);
  for(let i=0;i<hz;i++)landings+=Number(a.update(1/hz,{canLand:true}).landed);
  assert.equal(landings,1);assert.equal(a.snapshot().stage,'ground');assert(!a.snapshot().waitingForLanding);
  a.start();assert(!a.snapshot().waitingForLanding);
 }
 assert(arrivalSteeringSpeed({stage:'dive',height:10},1440)<10);
});

test('comet resets, freezes when paused and transforms into a separately anchored fading burst',()=>{
 const original=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
 try {
  for(const reducedMotion of [false,true]){
   const root=new Group(),fx=createArrivalComet(root,{reducedMotion}),a=createArrival(),p=new Vector3(30,2,50),camera=new PerspectiveCamera();
   camera.position.set(0,20,10);camera.lookAt(0,0,0);
   const count=()=>{let n=0;root.traverse(()=>n++);return n;},nodes=count();
   for(let run=0;run<4;run++) {
    a.start();fx.update(.1,p,a.snapshot(),camera);assert(fx.inspect().active);assert(!fx.inspect().burst);
    a.dive();a.update(.4);fx.update(.4,p,a.snapshot(),camera);
    const before=fx.inspect();fx.update(0,p,a.snapshot(),camera);assert.deepEqual(fx.inspect(),before);
    a.update(6.2);fx.update(.1,p,a.snapshot(),camera);assert(!fx.inspect().active);assert(fx.inspect().burst);
    const anchor=fx.inspect().burstPosition;a.update(.2);fx.update(.2,p.clone().addScalar(10),a.snapshot(),camera);assert.deepEqual(fx.inspect().burstPosition,anchor);
    a.update(1);fx.update(1,p,a.snapshot(),camera);assert(!fx.inspect().burst);assert.equal(fx.inspect().burstOpacity,0);
    assert.equal(count(),nodes);
   }
   assert(fx.inspect().tailParticles<25);assert(fx.inspect().sparks<=12);
  }
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
