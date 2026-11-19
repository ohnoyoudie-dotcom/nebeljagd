import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createMapArrival, islandPoint } from '../src/map-arrival.js';
import { createArrivalTeleport } from '../src/arrival-teleport.js';

const point = {x:30,y:2,z:-42};
test('map selection locks before teleport, freezes on pause, lands only once at any simulation rate', () => {
  for (const hz of [30,60,120]) {
    const a=createMapArrival(); a.start(point);
    assert.equal(a.snapshot().stage,'select'); assert.equal(a.snapshot().height,0);
    assert(a.select({x:300,y:0,z:100}));
    const frozen=a.snapshot(); a.update(0); assert.deepEqual(a.snapshot(),frozen);
    a.update(8); assert.equal(a.snapshot().stage,'reveal');
    assert(!a.select(point)); assert.equal(a.snapshot().target.x,300);
    a.update(1.2); assert.equal(a.snapshot().stage,'teleport');
    let landed=0; for(let i=0;i<hz*2;i++) landed+=Number(a.update(1/hz).landed);
    assert.equal(landed,1); assert.equal(a.snapshot().stage,'ground'); assert.equal(a.snapshot().settled,1);
    a.start(point); assert.equal(a.snapshot().stage,'select'); a.cancel(); assert(!a.update(20).landed);
  }
});
test('missing or malformed safe choices cannot auto-spawn; returned targets cannot mutate the selection',()=>{
  const a=createMapArrival();a.start(null);a.update(20);assert.equal(a.snapshot().stage,'select');
  assert(!a.select({x:NaN,y:0,z:0}));assert(!a.select(null));
  assert(a.select(point));const s=a.snapshot();s.target.x=900;
  assert.equal(a.snapshot().target.x,30);a.update(.01);assert.equal(a.snapshot().stage,'reveal');
});
test('selection projection maps CSS-normalized coordinates across all island bounds',()=>{
  const bounds={minX:-600,maxX:600,minZ:-720,maxZ:720},scale=232/1440;
  for(const [x,z] of [[-600,-720],[600,720],[30,-42],[0,0]]){
    const p=islandPoint((128+x*scale)/256,(128+z*scale)/256,bounds);
    assert(Math.abs(p.x-x)<1e-9);assert(Math.abs(p.z-z)<1e-9);
  }
  assert.equal(islandPoint(-.1,.5,bounds),null);assert.equal(islandPoint(NaN,.5,bounds),null);
});
test('teleport particles stay anchored, fade out and reuse their nodes over restarts',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  try {
    for(const reducedMotion of [false,true]){
      const root=new Group(),fx=createArrivalTeleport(root,{reducedMotion}),a=createMapArrival(),p=new Vector3(30,2,-42);
      const count=root.children[0].children.length;
      for(let run=0;run<3;run++){
        a.start(point);fx.update(p,a.snapshot());assert(!fx.inspect().active);
        a.update(9.3);fx.update(p,a.snapshot());assert(fx.inspect().active);
        const anchor=fx.inspect().position;a.update(.8);fx.update(new Vector3(60,2,50),a.snapshot());assert.deepEqual(fx.inspect().position,anchor);
        a.update(1);fx.update(p,a.snapshot());assert(!fx.inspect().active);assert.equal(fx.inspect().opacity,0);
        assert.equal(root.children[0].children.length,count);
      }
    }
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
