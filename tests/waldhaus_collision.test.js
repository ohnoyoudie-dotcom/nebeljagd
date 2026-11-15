import test from 'node:test';
import assert from 'node:assert/strict';
import { WALDHAUS_DEFINITION as house, WALDHAUS_FURNITURE } from '../src/map/waldhaus-definition.js';
import { createCollisionIndex } from '../src/collision.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';
import { createGroundGrassExclusion } from '../src/meadow-ground.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';
import { createLobbyMap } from '../src/lobby-map.js';
import { makeWorldObject } from '../src/map/objects.js';

const point = ([x,z],y=1.2)=>({x,y,z});
function placement(rotation,scale){
 const c=Math.cos(rotation),s=Math.sin(rotation),origin={x:12,y:2,z:-8};
 return {
  toWorld:p=>({x:origin.x+scale*(c*p.x+s*p.z),y:origin.y+scale*p.y,z:origin.z+scale*(-s*p.x+c*p.z)}),
  toLocal:p=>({x:(c*(p.x-origin.x)-s*(p.z-origin.z))/scale,y:(p.y-origin.y)/scale,z:(s*(p.x-origin.x)+c*(p.z-origin.z))/scale}),
 };
}

test('the roomy 16 by 12 metre Waldhaus shell has two exterior entrances and full-capsule access to each room after rotation and scale',()=>{
 const snapshot=structuredClone(house),index=createCollisionIndex([],house.walls);
 assert.deepEqual(house.footprint,{halfWidth:8,halfDepth:6});
 assert.equal(house.entrances.length,2);assert.equal(house.qaRoutes.entrances.length,2);assert.ok(house.qaRoutes.rooms.length>=2);
 for(const [rotation,scale]of [[0,1],[Math.PI/2,1.25],[Math.PI/3,.8]]){
  const {toWorld,toLocal}=placement(rotation,scale);
  for(const route of [...house.qaRoutes.entrances,...house.qaRoutes.rooms,...(house.qaRoutes.clearedFurniture??[])]){
   const start=toWorld(point(route.from)),end=toWorld(point(route.to));
   assert.equal(index.traceSegment(toLocal(start),toLocal(end),.42/scale),null,`${route.name}: continuous capsule passage`);
   for(let i=0;i<=48;i++){
    const t=i/48,p={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t};
    const local=toLocal(p);index.resolve(local,.42/scale);const moved=toWorld(local);
    assert.ok(Math.hypot(moved.x-p.x,moved.z-p.z)<1e-7,`${route.name}: movement resolver at scale ${scale}`);
   }
  }
 }
 assert.deepEqual(house,snapshot,'Collision queries must not mutate the shared house definition');
});

test('empty Waldhaus has no leftover furniture collision while exterior and room walls still stop movement and projectiles',()=>{
 const index=createCollisionIndex([],house.walls),walls=house.walls.filter(w=>w.type==='house-wall'),furniture=house.walls.filter(w=>w.type==='furniture');
 assert.ok(walls.length>=9,'The empty shell keeps exterior walls and separate room partitions');
 assert.equal(furniture.length,0);assert.deepEqual(WALDHAUS_FURNITURE,[]);
 assert.ok(house.walls.every(body=>!body.fixtureId),'No invisible furnishing remains in the collision data');
 for(const body of walls){
  const p={x:(body.minX+body.maxX)/2,y:Math.min(1,body.maxY-.1),z:(body.minZ+body.maxZ)/2};
  const alone=createCollisionIndex([],[body]);const before={...p};alone.resolve(p,.42);
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)>.42,body.name);
  const horizontal=body.maxX-body.minX>body.maxZ-body.minZ;
  const start={...before,[horizontal?'z':'x']:(horizontal?body.minZ:body.minX)-1};
  const end={...before,[horizontal?'z':'x']:(horizontal?body.maxZ:body.maxX)+1};
  assert.ok(index.traceSegment(start,end,.06),`${body.name}: low shot must collide`);
  const top=(body.maxY??4)+.2;assert.equal(alone.traceSegment({...start,y:top},{...end,y:top},.06),null,`${body.name}: no invisible full-height wall`);
 }
 // These original fixture centres must now be ordinary walkable floor, even
 // for a full player capsule. Crossing them also catches invisible shot blockers.
 const formerFixtures=[['Kamin',-5.24,-.65],['Anrichte',-4.5,-3.65],['Tisch',-.6,.25],
  ['Bett',4.65,-2.05],['Truhe',3.65,3.55],['Fass',3.35,.8]];
 for(const scale of [1,.8,1.25])for(const [name,x,z]of formerFixtures){
  const p={x,y:.7,z};index.resolve(p,.42/scale);assert.deepEqual(p,{x,y:.7,z},`${name}: removed fixture must not stop movement`);
  assert.equal(index.traceSegment({x:x-.25,y:.7,z},{x:x+.25,y:.7,z},.06/scale),null,`${name}: removed fixture must not stop shots`);
 }
});

test('both Waldhaus thresholds rise smoothly to one indoor floor and never extend beyond their actual doorway',()=>{
 const factor=(x,z)=>houseFloorFactorAt(x,z,house.floorBounds,house.interior,house.entrances);
 for(const entrance of house.entrances){
  assert.ok(['south','north'].includes(entrance.side));assert.ok(entrance.max-entrance.min>=1.6);
  const x=(entrance.min+entrance.max)/2,direction=entrance.side==='south'?1:-1;
  assert.equal(factor(x,entrance.boundary+direction*(entrance.depth+.01)),null);
  let previous=0;
  for(let i=1;i<=20;i++){
   const value=factor(x,entrance.boundary+direction*entrance.depth*(1-i/20));assert.ok(value>=previous&&value<=1);previous=value;
  }
  assert.equal(previous,1);assert.equal(factor(entrance.max+.5,entrance.boundary+direction*entrance.depth*.5),null);
 }
 assert.equal(factor(...house.qaRoutes.openFloor),1);
});

test('rotated Waldhaus foundation flattens terrain and excludes grass without changing the map document',()=>{
 for(const [rotation,scale]of [[0,1],[Math.PI/4,1.35],[Math.PI/2,.8]]){
  const map=createLobbyMap();map.objects=[makeWorldObject('house',[12,-8],{variant:'waldhaus',rotation,scale})];
  const snapshot=structuredClone(map),excluded=createGroundGrassExclusion(map,{padding:0}),spatial=createWorldSpatialModel(map);
  const level=spatial.groundAt(12,-8),{halfWidth:hx,halfDepth:hz}=house.footprint,c=Math.cos(rotation),s=Math.sin(rotation);
  const toWorld=(x,z)=>[12+scale*(c*x+s*z),-8+scale*(-s*x+c*z)];
  for(const x of [-hx+.1,0,hx-.1])for(const z of [-hz+.1,0,hz-.1]){
   const [px,pz]=toWorld(x,z);assert.equal(excluded(px,pz),true);assert.ok(Math.abs(spatial.groundAt(px,pz)-level)<1e-8);
  }
  for(const [x,z]of [[hx+.1,0],[0,hz+.1]])assert.equal(excluded(...toWorld(x,z)),false);
  assert.deepEqual(map,snapshot);
 }
});
