import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLE_DEFINITION as castle } from '../src/map/castle-definition.js';
import { getHouseDefinition, HOUSE_BUILDER_VARIANTS } from '../src/map/house-builder.js';
import { createCollisionIndex } from '../src/collision.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';

const point=([x,z],y=1.2)=>({x,y,z});
const inside=(x,z,a)=>x>a.minX&&x<a.maxX&&z>a.minZ&&z<a.maxZ;
const factor=(x,z)=>houseFloorFactorAt(x,z,castle.floorBounds,castle.interior,castle.entrances,castle.footprintAreas);
function placement(rotation,scale) {
 const c=Math.cos(rotation),s=Math.sin(rotation),origin={x:41,y:2,z:-18};
 return {
  toWorld:p=>({x:origin.x+scale*(c*p.x+s*p.z),y:origin.y+scale*p.y,z:origin.z+scale*(-s*p.x+c*p.z)}),
  toLocal:p=>({x:(c*(p.x-origin.x)-s*(p.z-origin.z))/scale,y:(p.y-origin.y)/scale,z:(s*(p.x-origin.x)+c*(p.z-origin.z))/scale}),
 };
}

test('castle is one fixed 70m by 60m plan with two great halls and a traversable corridor loop',()=>{
 assert.equal(HOUSE_BUILDER_VARIANTS.find(v=>v.id==='schlossanlage').fixedLayout,true);
 assert.equal(castle.fixedLayout,true);
 assert.deepEqual(castle.footprint,{halfWidth:35,halfDepth:30});
 assert.equal(castle.rooms.filter(r=>r.role==='great-hall').length,2);
 assert.equal(castle.rooms.filter(r=>r.role==='chamber').length,10);
 assert.equal(castle.rooms.filter(r=>r.role==='gate').length,2);
 assert.equal(castle.rooms.filter(r=>r.role==='corridor').length,4);
 assert.equal(castle.entrances.filter(e=>e.exterior).length,2);
 assert.equal(castle.entrances.filter(e=>e.courtyard).length,4);
 assert.ok(Object.isFrozen(castle)&&Object.isFrozen(castle.walls)&&Object.isFrozen(castle.floorAreas));
 for(const houseRooms of [1,2,3])for(const houseLayout of [0,1,2])for(const houseEntrances of ['single','double']) {
  assert.equal(getHouseDefinition({variant:'schlossanlage',houseRooms,houseLayout,houseEntrances}),castle);
 }
 const index=createCollisionIndex([],castle.walls);
 for(let i=1;i<castle.qaRoutes.loop.length;i++)assert.equal(index.traceSegment(point(castle.qaRoutes.loop[i-1]),point(castle.qaRoutes.loop[i]),.42),null,'complete ring remains open');
});

test('castle exterior gates, courtyard transitions and room doors stay capsule-clear when rotated and scaled',()=>{
 const index=createCollisionIndex([],castle.walls),snapshot=JSON.stringify(castle);
 const routes=[...castle.qaRoutes.entrances,...castle.qaRoutes.courtyardEntrances,...castle.qaRoutes.rooms];
 for(const [rotation,scale] of [[0,1],[Math.PI/2,1.25],[Math.PI/3,.8]]) {
  const {toWorld,toLocal}=placement(rotation,scale);
  for(const route of routes)for(const offset of [-.55,0,.55]) {
   const from=[...route.from],to=[...route.to],axis=from[0]===to[0]?0:1;
   from[axis]+=offset;to[axis]+=offset;
   const start=toWorld(point(from)),end=toWorld(point(to));
   assert.equal(index.traceSegment(toLocal(start),toLocal(end),.42/scale),null,`${route.name} capsule trace at ${rotation}/${scale}/${offset}`);
   for(let i=0;i<=24;i++) {
    const t=i/24,p={x:start.x+(end.x-start.x)*t,y:start.y,z:start.z+(end.z-start.z)*t},local=toLocal(p);
    index.resolve(local,.42/scale);const resolved=toWorld(local);
    assert.ok(Math.hypot(resolved.x-p.x,resolved.z-p.z)<1e-7,`${route.name}: no invisible door obstacle`);
   }
  }
 }
 assert.equal(JSON.stringify(castle),snapshot);
});

test('every castle room is reachable from the south gate without having to cross the courtyard',()=>{
 const index=createCollisionIndex([],castle.walls),queue=[[0,28]],seen=new Set(['0,28']);
 function walkable(x,z) {
  if(x<-34||x>34||z<-29||z>29)return false;
  if(!castle.footprintAreas.some(a=>x>=a.minX&&x<=a.maxX&&z>=a.minZ&&z<=a.maxZ))return false;
  const p=point([x,z]),before={...p};index.resolve(p,.42);
  return Math.hypot(p.x-before.x,p.z-before.z)<1e-7;
 }
 for(let i=0;i<queue.length;i++) {
  const [x,z]=queue[i];
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
   const nx=x+dx,nz=z+dz,key=`${nx},${nz}`;
   if(!seen.has(key)&&walkable(nx,nz)&&index.traceSegment(point([x,z]),point([nx,nz]),.42)===null){seen.add(key);queue.push([nx,nz]);}
  }
 }
 for(const room of castle.rooms) {
  const x=Math.round((room.minX+room.maxX)/2),z=Math.round((room.minZ+room.maxZ)/2);
  assert.ok(seen.has(`${x},${z}`),`${room.name}: room centre reachable inside compound`);
 }
 assert.ok(seen.has('0,-28'),'secondary gate connected to main gate');
});

test('castle floors cover the wings once, preserve outdoor courtyard and ramp only through real door openings',()=>{
 const areas=castle.floorAreas;
 assert.equal(areas.reduce((sum,a)=>sum+(a.maxX-a.minX)*(a.maxZ-a.minZ),0),70*60-34*24);
 for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++) {
  const a=areas[i],b=areas[j];
  assert.ok(Math.min(a.maxX,b.maxX)<=Math.max(a.minX,b.minX)||Math.min(a.maxZ,b.maxZ)<=Math.max(a.minZ,b.minZ),'floor rectangles do not overlap');
 }
 for(const room of castle.rooms) {
  const x=(room.minX+room.maxX)/2,z=(room.minZ+room.maxZ)/2;
  assert.equal(factor(x,z),1,room.name);
  assert.ok(['stone','wood'].includes(room.material));
 }
 for(const [x,z] of [[0,0],[-10,-7],[10,7],[0,-10],[15,5]]) {
  assert.equal(factor(x,z),null,'courtyard is outdoor ground');
  assert.ok(!castle.rooms.some(r=>inside(x,z,r)),'courtyard never counts as a sheltered room');
 }
 for(const e of castle.entrances) {
  const sign=['north','west'].includes(e.side)?-1:1,horizontal=['north','south'].includes(e.side);
  let previous=0;
  for(let i=0;i<=20;i++) {
   const distance=e.depth*(1-i/20),x=horizontal?e.center:e.boundary+sign*distance,z=horizontal?e.boundary+sign*distance:e.center;
   const height=factor(x,z)??0;
   assert.ok(height+1e-7>=previous&&height<=1,`${e.name}: monotonic ramp into indoor floor`);previous=height;
  }
  assert.equal(previous,1);
 }
});

test('castle stone walls stop movement and low projectiles without invisible obstacles above their cutaway height',()=>{
 const index=createCollisionIndex([],castle.walls);
 assert.ok(castle.walls.every(w=>w.type==='house-wall'&&!w.fixtureId));
 for(const wall of castle.walls) {
  const x=(wall.minX+wall.maxX)/2,z=(wall.minZ+wall.maxZ)/2,p={x,y:1,z};
  index.resolve(p,.42);
  assert.ok(Math.hypot(p.x-x,p.z-z)>.42,wall.name);
  const axis=wall.maxX-wall.minX>wall.maxZ-wall.minZ?'z':'x';
  const from={x,y:1,z,[axis]:(axis==='z'?wall.minZ:wall.minX)-1},to={x,y:1,z,[axis]:(axis==='z'?wall.maxZ:wall.maxX)+1};
  assert.ok(index.traceSegment(from,to,.06),`${wall.name}: projectile blocked`);
  assert.equal(index.traceSegment({...from,y:castle.height+.3},{...to,y:castle.height+.3},.06),null,`${wall.name}: open above visible walls`);
 }
});
