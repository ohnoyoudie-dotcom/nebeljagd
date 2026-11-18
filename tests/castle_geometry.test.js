import test from 'node:test';
import assert from 'node:assert/strict';
import { CASTLE_DEFINITION as castle } from '../src/map/castle-definition.js';
import { getHouseDefinition, HOUSE_BUILDER_VARIANTS } from '../src/map/house-builder.js';
import { createCollisionIndex } from '../src/collision.js';
import { houseFloorFactorAt } from '../src/map/house-floor.js';

const point=([x,z],y=1.2)=>({x,y,z});
const inside=(x,z,a)=>x>a.minX&&x<a.maxX&&z>a.minZ&&z<a.maxZ;
const factor=(x,z)=>houseFloorFactorAt(x,z,castle.floorBounds,castle.interior,castle.entrances,castle.footprintAreas);
const movementWalls=castle.walls.filter(w=>!w.projectileOnly);
function placement(rotation,scale) {
 const c=Math.cos(rotation),s=Math.sin(rotation),origin={x:41,y:2,z:-18};
 return {
  toWorld:p=>({x:origin.x+scale*(c*p.x+s*p.z),y:origin.y+scale*p.y,z:origin.z+scale*(-s*p.x+c*p.z)}),
  toLocal:p=>({x:(c*(p.x-origin.x)-s*(p.z-origin.z))/scale,y:(p.y-origin.y)/scale,z:(s*(p.x-origin.x)+c*(p.z-origin.z))/scale}),
 };
}

test('castle is one fixed 140m by 120m plan with two great halls and a traversable corridor loop',()=>{
 assert.equal(HOUSE_BUILDER_VARIANTS.find(v=>v.id==='schlossanlage').fixedLayout,true);
 assert.equal(castle.fixedLayout,true);
 assert.deepEqual(castle.footprint,{halfWidth:70,halfDepth:60});
 assert.equal(castle.rooms.filter(r=>r.role==='great-hall').length,2);
 assert.equal(castle.rooms.filter(r=>r.role==='chamber').length,19);
 assert.equal(castle.rooms.filter(r=>r.role==='gate').length,2);
 assert.equal(castle.rooms.filter(r=>r.role==='corridor').length,6);
 assert.equal(castle.rooms.filter(r=>r.role==='tower').length,4);
 assert.equal(castle.entrances.filter(e=>e.exterior).length,2);
 assert.equal(castle.entrances.filter(e=>e.courtyard).length,8);
 assert.ok(Object.isFrozen(castle)&&Object.isFrozen(castle.walls)&&Object.isFrozen(castle.floorAreas));
 for(const houseRooms of [1,2,3])for(const houseLayout of [0,1,2])for(const houseEntrances of ['single','double']) {
  assert.equal(getHouseDefinition({variant:'schlossanlage',houseRooms,houseLayout,houseEntrances}),castle);
 }
 assert.equal(castle.courtyards.length,2);
 assert.equal(castle.footprint.halfWidth*castle.footprint.halfDepth*4,70*60*4,'fourfold footprint without scaling walls or doors');
 const index=createCollisionIndex([],movementWalls);
 for(const loop of castle.qaRoutes.loops)for(let i=1;i<loop.length;i++)assert.equal(index.traceSegment(point(loop[i-1]),point(loop[i]),.42),null,'both courtyard loops and outer ring remain open');
});

test('castle exterior gates, courtyard transitions and room doors stay capsule-clear when rotated and scaled',()=>{
 const index=createCollisionIndex([],movementWalls),snapshot=JSON.stringify(castle);
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
 const index=createCollisionIndex([],movementWalls),queue=[[0,58]],seen=new Set(['0,58']);
 function walkable(x,z) {
  if(x<-69||x>69||z<-59||z>59)return false;
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
 assert.ok(seen.has('0,-58'),'secondary gate connected to main gate');
});

test('castle stone floors cover the wings once, preserve both outdoor courts and ramp only through real door openings',()=>{
 const areas=castle.floorAreas;
 assert.equal(areas.reduce((sum,a)=>sum+(a.maxX-a.minX)*(a.maxZ-a.minZ),0),140*120-2*34*54);
 for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++) {
  const a=areas[i],b=areas[j];
  assert.ok(Math.min(a.maxX,b.maxX)<=Math.max(a.minX,b.minX)||Math.min(a.maxZ,b.maxZ)<=Math.max(a.minZ,b.minZ),'floor rectangles do not overlap');
 }
 for(const room of castle.rooms) {
  const x=(room.minX+room.maxX)/2,z=(room.minZ+room.maxZ)/2;
  assert.equal(factor(x,z),1,room.name);
  assert.equal(room.material,'stone');
 }
 for(const [x,z] of castle.qaRoutes.courtyards.flatMap(([x,z])=>[[x,z],[x-9,z-18],[x+9,z+18]])) {
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

test('castle stone walls stop movement and projectiles up to their physical height independently of the visible cutaway',()=>{
 const index=createCollisionIndex([],castle.walls);
 const movement=createCollisionIndex([],movementWalls);
 assert.ok(castle.walls.every(w=>w.type==='house-wall'&&!w.fixtureId));
 for(const wall of movementWalls) {
  const x=(wall.minX+wall.maxX)/2,z=(wall.minZ+wall.maxZ)/2,p={x,y:1,z};
  movement.resolve(p,.42);
  assert.ok(Math.hypot(p.x-x,p.z-z)>.42,wall.name);
  const axis=wall.maxX-wall.minX>wall.maxZ-wall.minZ?'z':'x';
  const from={x,y:1,z,[axis]:(axis==='z'?wall.minZ:wall.minX)-1},to={x,y:1,z,[axis]:(axis==='z'?wall.maxZ:wall.maxX)+1};
  assert.ok(index.traceSegment(from,to,.06),`${wall.name}: projectile blocked`);
  assert.equal(index.traceSegment({...from,y:castle.height+.3},{...to,y:castle.height+.3},.06),null,`${wall.name}: open above all architecture`);
 }
});


test('green court centres stay outdoors while one-metre stone borders and barred windows retain their own surfaces',()=>{
 assert.equal(castle.courtyardPavingAreas.length,8);
 assert.equal(castle.courtyardGroundAreas.length,2);
 for(const court of castle.courtyards) {
  const lawn=castle.courtyardGroundAreas.find(a=>a.courtyardId===court.id),border=castle.courtyardPavingAreas.filter(a=>a.courtyardId===court.id);
  assert.deepEqual([lawn.minX,lawn.maxX,lawn.minZ,lawn.maxZ],[court.minX+1,court.maxX-1,court.minZ+1,court.maxZ-1]);
  assert.equal(lawn.material,'terrain');assert.equal(lawn.outdoor,true);assert.equal(border.length,4);
  const areas=[lawn,...border],area=a=>(a.maxX-a.minX)*(a.maxZ-a.minZ);
  assert.equal(areas.reduce((sum,a)=>sum+area(a),0),area(court),'lawn and border cover the court exactly once');
  for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++) {
   const a=areas[i],b=areas[j];assert.ok(Math.min(a.maxX,b.maxX)<=Math.max(a.minX,b.minX)||Math.min(a.maxZ,b.maxZ)<=Math.max(a.minZ,b.minZ));
  }
 }
 assert.ok(castle.courtyardPavingAreas.every(a=>a.material==='stone'&&a.outdoor===true));
 assert.ok(castle.floorAreas.every(a=>a.material==='stone'));
 assert.ok(castle.architecturalWalls.every(w=>w.material==='stone'));
 for(const window of castle.windows) {
  assert.equal(window.glazed,false);assert.equal(window.barred,true);
  assert.ok(window.sillHeight>=1&&window.sillHeight+window.height<castle.wallHeight);
  const alongX=['north','south'].includes(window.side),normal=['north','west'].includes(window.side)?-1:1;
  const centre=window.boundary+normal*window.wallThickness/2;
  const parent=castle.architecturalWalls.find(w=>alongX?centre>=w.minZ&&centre<=w.maxZ&&window.center-window.width/2>w.minX&&window.center+window.width/2<w.maxX:centre>=w.minX&&centre<=w.maxX&&window.center-window.width/2>w.minZ&&window.center+window.width/2<w.maxZ);
  assert.ok(parent,window.name+' has a complete host stone wall, away from doorway gaps');
 }
});

test('torch mounts illuminate covered galleries without occupying doorways or courtyards',()=>{
 assert.ok(castle.torches.length>=30&&castle.torches.length<=48);
 const ids=new Set();
 for(const torch of castle.torches) {
  assert.ok(!ids.has(torch.id));ids.add(torch.id);
  const [nx,nz]=torch.normal;assert.equal(Math.abs(nx)+Math.abs(nz),1);
  const x=torch.x+nx*.6,z=torch.z+nz*.6;
  assert.equal(factor(x,z),1,'torch faces a covered floor');
  assert.ok(!castle.courtyards.some(c=>inside(x,z,c)));
  const index=createCollisionIndex([],movementWalls),p={x,y:1,z},before={...p};index.resolve(p,.42);
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<1e-7,'mounted torch opens into a clear gallery');
  for(const door of castle.interiorDoorways)assert.ok(Math.hypot(torch.x-door.x,torch.z-door.z)>door.width/2+1.1,'torch does not crowd an interior doorway');
 }
});

test('four corner towers have reachable ground floors and high octagonal cover without invisible lower-floor obstacles',()=>{
 assert.equal(castle.towers.length,4);assert.equal(castle.qaRoutes.towers.length,4);
 assert.equal(castle.exteriorWallHeight,7.5);assert.equal(castle.towerHeight,12.2);
 assert.deepEqual(castle.cutawayBounds,{minX:-70,maxX:70,minZ:-60,maxZ:60});
 const movement=createCollisionIndex([],movementWalls),projectiles=createCollisionIndex([],castle.walls);
 for(const tower of castle.towers) {
  assert.equal(tower.footprintPoints.length,8);assert.equal(tower.height,12.2);
  for(const [x,z] of tower.footprintPoints)assert.ok(inside(x,z,tower.baseBounds),'octagonal upper stage stays on its stone plinth');
  assert.ok(tower.baseBounds.minX>=-70&&tower.baseBounds.maxX<=70&&tower.baseBounds.minZ>=-60&&tower.baseBounds.maxZ<=60);
  const room=castle.rooms.find(r=>r.roomId===tower.roomId);assert.equal(room.role,'tower');
  assert.equal(factor(tower.x,tower.z),1);const p=point([tower.x,tower.z]);movement.resolve(p,.42);assert.deepEqual(p,point([tower.x,tower.z]));
  const direction=tower.x<0?1:-1,from=point([tower.x,tower.z],9),to=point([tower.x+direction*12,tower.z],9);
  assert.ok(projectiles.traceSegment(from,to,.06),'upper octagonal wall catches elevated projectiles');
  assert.ok(projectiles.traceSegment(point([tower.x,tower.z],14),point([tower.x,tower.z],10),.06),'upper terrace catches descending projectiles');
  assert.equal(projectiles.traceSegment(point([tower.x,tower.z],4),point([tower.x,tower.z],2.5),.06),null,'hollow plinth band does not create an invisible low ceiling');
 }
 const low=point([0,62],1.6),behind=point([0,57],1.6);
 assert.equal(projectiles.traceSegment(low,behind,.06),null,'the main arch leaves ground-level passage open');
 assert.equal(projectiles.traceSegment({...low,y:5},{...behind,y:5},.06),null,'curved arch opening remains free above the player');
 assert.ok(projectiles.traceSegment({...low,y:7.6},{...behind,y:7.6},.06),'solid arch crown blocks elevated shots');
 assert.ok(castle.walls.filter(w=>w.projectileOnly).every(w=>w.minY>=castle.floorHeight+castle.cutawayHeight));
 for(const w of castle.architecturalWalls)assert.equal(w.maxY,castle.floorHeight+castle.cutawayHeight);
 for(const w of movementWalls.filter(w=>w.outerPerimeter))assert.equal(w.maxY,castle.floorHeight+castle.exteriorWallHeight);
});
