import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createMapArrival, islandPoint, portalArrivalPose, arrivalMapView, arrivalViewPoint, moveArrivalCursor } from '../src/map-arrival.js';
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
    let landed=0; for(let i=0;i<hz*4;i++) landed+=Number(a.update(1/hz).landed);
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
        a.update(3);fx.update(p,a.snapshot());assert(!fx.inspect().active);assert.equal(fx.inspect().opacity,0);
        assert.equal(root.children[0].children.length,count);
      }
    }
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('arcane aperture opens, freezes with the arrival clock, closes and disposes without a floor marker',()=>{
  const original=globalThis.document;
  globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  try {
    for(const reducedMotion of [false,true]) {
      const root=new Group(),fx=createArrivalTeleport(root,{reducedMotion}),a=createMapArrival(),p=new Vector3(30,2,-42);
      a.start(point);a.update(9.25);fx.update(p,a.snapshot());const slit=fx.inspect();
      assert(slit.portalVisible&&slit.width<.2);
      a.update(.35);fx.update(p,a.snapshot());const open=fx.inspect();
      assert(open.width>.9&&open.flash===0);assert.equal(open.style,'arcane-portal');
      a.update(0);fx.update(p,a.snapshot());assert.deepEqual(fx.inspect(),open);
      a.update(2.25);fx.update(p,a.snapshot());assert(fx.inspect().width<.3);
      a.update(.2);fx.update(p,a.snapshot());assert(!fx.inspect().portalVisible);
      a.update(.45);fx.update(p,a.snapshot());assert(!fx.inspect().active);
      assert.equal(root.children[0].children.filter(n=>n.isMesh).length,1);
      a.start(point);a.update(9.6);fx.update(p,a.snapshot());assert(fx.inspect().active);
      fx.reset();assert(!fx.inspect().active);
      // Rendering is skipped during map selection; reset must re-anchor even without an intervening update.
      a.start(point);a.update(9.6);const moved=new Vector3(90,3,70);fx.update(moved,a.snapshot());
      assert.deepEqual(fx.inspect().position,moved.toArray());
      fx.dispose();fx.dispose();assert.equal(root.children.length,0);
    }
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});

test('portal holds before the avatar walks out, uses a smooth step and ends at the safe target',()=>{
 const pose=t=>portalArrivalPose({stage:'teleport',active:true,progress:t/2.8});
 assert(!pose(.9).visible); assert.equal(pose(.9).offsetZ,-1.05);
 assert(pose(1.6).walking&&pose(1.6).visible);assert(Math.abs(pose(1.6).offsetZ+.525)<1e-9);
 assert(pose(1.6).speed>1);assert.equal(pose(2.3).offsetZ,0);assert(!pose(2.3).walking);
 assert.equal(portalArrivalPose({stage:'ground',active:false}).offsetZ,0);
});
test('zoom coordinates remain anchored to world metres; keyboard traverses the map without diagonal acceleration',()=>{
 const bounds={minX:-600,maxX:600,minZ:-720,maxZ:720};
 for(const zoom of [1,2,4]) {
   const view=arrivalMapView(bounds,{x:560,z:690},zoom),p={x:430,z:600};
   const selected=arrivalViewPoint(.5+(p.x-view.x)/view.span,.5+(p.z-view.z)/view.span,view);
   assert(Math.abs(selected.x-p.x)<1e-8&&Math.abs(selected.z-p.z)<1e-8);
   const full=arrivalMapView(bounds,null);assert(view.x+view.span/2<=full.span/2+1e-9);
 }
 const origin={x:0,z:0},right=moveArrivalCursor(origin,1,0,.1,bounds),diagonal=moveArrivalCursor(origin,1,1,.1,bounds);
 assert(Math.abs(right.x-Math.hypot(diagonal.x,diagonal.z))<1e-8);
 assert.equal(moveArrivalCursor({x:599,z:0},1,0,1,bounds).x,600);
 assert.equal(moveArrivalCursor(origin,1,0,.1,bounds,4).x,right.x/4);
});
