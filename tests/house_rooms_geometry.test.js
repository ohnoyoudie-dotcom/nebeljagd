import test from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Vector3 } from 'three';
import { HOUSE_BUILDER_VARIANTS, getHouseDefinition } from '../src/map/house-builder.js';
import { createCollisionIndex } from '../src/collision.js';
import { createWaldhausModel } from '../src/waldhaus-model.js';

const configurations=HOUSE_BUILDER_VARIANTS.flatMap(({id:variant})=>[1,2,3].flatMap(houseRooms=>[0,1,2].flatMap(houseLayout=>['single','double'].map(houseEntrances=>({variant,houseRooms,houseLayout,houseEntrances})))));
const inside=(p,a)=>p[0]>a.minX&&p[0]<a.maxX&&p[1]>a.minZ&&p[1]<a.maxZ;
const point=([x,z])=>({x,y:1,z});
const roomAt=(def,p)=>def.rooms.find(a=>inside(p,a))?.roomId;

test('All room-count/layout/entrance combinations have connected usable rooms and continuous capsule-clear doors',()=>{
 for(const config of configurations) {
  const def=getHouseDefinition(config),label=JSON.stringify(config),index=createCollisionIndex([],def.walls);
  const roomIds=new Set(def.rooms.map(r=>r.roomId));
  assert.equal(def.roomCount,config.houseRooms,label);
  assert.equal(roomIds.size,config.houseRooms,label);
  assert.equal(def.entrances.length,config.houseEntrances==='single'?1:2,label);
  assert.equal(def.interiorDoorways.length,config.houseRooms-1,label);
  const links=new Map([...roomIds].map(id=>[id,new Set()]));
  for(const route of [...def.qaRoutes.entrances,...def.qaRoutes.rooms]) {
   for(const offset of [-.55,0,.55]) {
    const from=[...route.from],to=[...route.to],axis=from[0]===to[0]?0:1;
    from[axis]+=offset;to[axis]+=offset;
    assert.equal(index.traceSegment(point(from),point(to),.42),null,`${label} ${route.name} offset ${offset}`);
   }
  }
  for(const route of def.qaRoutes.rooms) {
   const a=roomAt(def,route.from),b=roomAt(def,route.to);
   assert.ok(a&&b&&a!==b,`${label} ${route.name}: room ownership ${a}/${b}`);
   links.get(a).add(b);links.get(b).add(a);
  }
  const first=roomAt(def,def.qaRoutes.entrances[0].to);assert.ok(first,`${label}: entry leads into a room`);
  const seen=new Set([first]),queue=[first];
  for(const id of queue)for(const neighbor of links.get(id))if(!seen.has(neighbor)){seen.add(neighbor);queue.push(neighbor);}
  assert.equal(seen.size,roomIds.size,`${label}: every room reachable from main door`);
  for(const e of def.qaRoutes.entrances)assert.ok(seen.has(roomAt(def,e.to)),`${label}: secondary door leads into connected interior`);
 }
});

test('Curated room floors cover the full original shell once and preserve the open L courtyard',()=>{
 for(const config of configurations) {
  const def=getHouseDefinition(config),label=JSON.stringify(config),areas=def.floorAreas;
  const area=areas.reduce((sum,a)=>sum+(a.maxX-a.minX)*(a.maxZ-a.minZ),0);
  assert.ok(Math.abs(area-(config.variant==='waldhaus-corner'?160:def.footprint.halfWidth*def.footprint.halfDepth*4))<1e-7,label);
  for(let i=0;i<areas.length;i++)for(let j=i+1;j<areas.length;j++) {
   const a=areas[i],b=areas[j];
   assert.ok(Math.min(a.maxX,b.maxX)-Math.max(a.minX,b.minX)<=1e-7||Math.min(a.maxZ,b.maxZ)-Math.max(a.minZ,b.minZ)<=1e-7,`${label}: overlapping floor panels`);
  }
  for(const a of areas)for(const v of Object.values(a))if(typeof v==='number')assert.ok(Number.isFinite(v));
  if(config.variant==='waldhaus-corner')for(const p of [[2,2],[4,4],[6,5]])assert.ok(!areas.some(a=>inside(p,a)),`${label}: courtyard must stay open`);
 }
});

test('Every curated plan has visually open doors at ankle, avatar and shoulder height',()=>{
 for(const config of configurations) {
  const definition=getHouseDefinition(config),model=createWaldhausModel({definition});
  model.group.updateMatrixWorld(true);
  try {
   for(const route of [...definition.qaRoutes.entrances,...definition.qaRoutes.rooms])for(const h of [.2,.8,1.8])for(const offset of [-.5,0,.5]) {
    const xAxis=route.from[0]!==route.to[0];
    const from=new Vector3(route.from[0]+(xAxis?0:offset),definition.floorHeight+h,route.from[1]+(xAxis?offset:0));
    const to=new Vector3(route.to[0]+(xAxis?0:offset),from.y,route.to[1]+(xAxis?offset:0));
    const delta=to.clone().sub(from);
    assert.equal(new Raycaster(from,delta.clone().normalize(),.001,delta.length()).intersectObject(model.group,true).length,0,`${JSON.stringify(config)} ${route.name} h=${h} offset=${offset}`);
   }
  } finally {model.dispose();}
 }
});

test('Unconfigured saved houses keep their existing plan; explicit plans are immutable and repeatable',()=>{
 for(const {id} of HOUSE_BUILDER_VARIANTS) {
  const original=getHouseDefinition(id),snapshot=JSON.stringify(original);
  for(const houseRooms of [1,2,3])for(const houseLayout of [0,1,2]) {
   const object={variant:id,houseRooms,houseLayout},a=getHouseDefinition(object),b=getHouseDefinition(object);
   assert.equal(a,b);assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.walls)&&Object.isFrozen(a.rooms));
  }
  assert.equal(getHouseDefinition(id),original);assert.equal(JSON.stringify(original),snapshot);
 }
});
