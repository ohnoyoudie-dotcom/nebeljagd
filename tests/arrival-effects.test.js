import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { createAerialAtlas, createArrivalEffects } from '../src/arrival-effects.js';
import { createArrival } from '../src/arrival.js';

test('aerial atlas avoids tactical vision shading and only appears in the flight render layer',()=>{
 const root=new Group();const atlas=createAerialAtlas(root,{width:1024,height:1024},{scale:.2,centerX:0,centerZ:0});
 atlas.update(1600);assert(root.children.every(n=>n.visible&&n.userData.ignoreVision&&n.layers.mask===2));
 atlas.update(0);assert(root.children.every(n=>!n.visible));
});
test('landing dust and crater remain at the impact, fade completely and reset without duplicating objects',()=>{
 const original=globalThis.document;
 const context={createRadialGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 try{
  const root=new Group(),fx=createArrivalEffects(root),arrival=createArrival(),point=new Vector3(400,3,540);
  arrival.start();arrival.dive();fx.update(.1,point,arrival.snapshot(),'dunes');arrival.update(6.2);fx.update(.1,point,arrival.snapshot(),'dunes');
  assert(fx.inspect().active);const anchor=fx.inspect().position;
  arrival.update(.25);fx.update(.25,new Vector3(410,3,540),arrival.snapshot());assert.deepEqual(fx.inspect().position,anchor);assert(fx.inspect().craterOpacity>.5);
  arrival.update(3);fx.update(3,point,arrival.snapshot());assert(!fx.inspect().active);assert.equal(fx.inspect().craterOpacity,0);
  arrival.start();fx.update(.1,point,arrival.snapshot());assert(!fx.inspect().active);assert.equal(root.children.length,2);
 }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
