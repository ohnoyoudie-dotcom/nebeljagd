import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createObstacleSurface,validateTerrainObstacles,obstacleSurfaceSvg } from '../src/map/terrain-obstacles.js';
import { createTerrainObstacles } from '../src/terrain-obstacles.js';
import { validateWorldmap } from '../src/map/model.js';
import { ensureLandscape } from '../src/map/landscape.js';
import { createSightModel } from '../src/visibility-model.js';
const stroke=(id,points,extra={})=>({id:'ridge-'+id,points,radius:6,height:4,biome:'auto',erase:false,...extra});
const line=stroke('line',[[-20,0],[20,0]]),cut=stroke('cut',[[0,-12],[0,12]],{radius:3,erase:true});
function runtime(strokes){const scene=new THREE.Scene(),result=createTerrainObstacles(scene,{map:{landscape:{obstacles:strokes}},heightAt:()=>0,biomeAt:()=> 'meadow',isLand:()=>true,isWater:()=>false});return{scene,...result};}
test('connected strokes produce an outer cliff, subtract a passage, and support painting it back',()=>{
 const s=createObstacleSurface([line]);assert.ok(s.sample(0,0).d>0);assert.ok(s.sample(0,10).d<0);
 assert.ok(s.edges.every(([a,b])=>Math.abs((a.z+b.z)/2)>4||Math.abs((a.x+b.x)/2)>19),'no internal cliff seams in the connected ridge');
 const cutSurface=createObstacleSurface([line,cut]);assert.ok(cutSurface.sample(0,0).d<0);assert.ok(cutSurface.sample(-10,0).d>0);assert.ok(cutSurface.sample(10,0).d>0);
 assert.ok(createObstacleSurface([line,cut,stroke('refill',[[0,0]],{radius:4})]).sample(0,0).d>0);
 assert.ok(obstacleSurfaceSvg(cutSurface).includes('terrain-obstacles'));assert.deepEqual(createObstacleSurface([line,cut]).edges,cutSurface.edges);
});
test('biomaterial adapts per surface section and water remains unoccupied',()=>{
 const s=createObstacleSurface([line],{biomeAt:x=>x<0?'snow':'dunes',isWater:(x,z)=>x>12});
 assert.ok(s.triangles.some(t=>t.some(p=>p.biome==='snow')));assert.ok(s.triangles.some(t=>t.some(p=>p.biome==='desert')));assert.ok(s.sample(16,0).d<0);
 const manual=createObstacleSurface([stroke('sand',[[0,0]],{biome:'desert'})],{biomeAt:()=> 'snow'});assert.ok(manual.triangles.every(t=>t.every(p=>p.biome==='desert')));
});
test('painted ridge blocks walking, fast shots and vision; erased passage is really clear',()=>{
 const r=runtime([line,cut]);
 const p={x:10,y:0,z:5.9};r.resolveMovement(p,.42);assert.ok(r.surface.sample(p.x,p.z).d<=-.4);
 const deep={x:-10,y:0,z:0};r.resolveMovement(deep,.42);assert.ok(r.surface.sample(deep.x,deep.z).d<0);
 const free={x:0,y:0,z:0};r.resolveMovement(free,.42);assert.deepEqual(free,{x:0,y:0,z:0});
 const from={x:10,y:1,z:-100},to={x:10,y:1,z:100};assert.equal(r.traceProjectile(from,to).type,'terrainRidge');assert.equal(r.traceProjectile({...from,y:12},{...to,y:12}),null);
 assert.equal(r.traceProjectile({x:0,y:1,z:-15},{x:0,y:1,z:15}),null);assert.equal(r.traceProjectile(from,to,.06,()=>false),null);
 const sight=createSightModel({obstacles:r.obstacles,radius:40});sight.update({x:10,y:0,z:-10});assert.equal(sight.isVisible({x:10,z:10}),false);sight.update({x:0,y:0,z:-10});assert.equal(sight.isVisible({x:0,z:10}),true);
 r.dispose();assert.equal(r.scene.children.length,0);
});
test('terrain strokes survive normal map operations and validate malformed / excessive input',()=>{
 const map=JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json',import.meta.url)));const old=JSON.stringify(map.objects);
 ensureLandscape(map).obstacles=[stroke('saved',[[30,-42]])];ensureLandscape(map);assert.equal(map.landscape.obstacles.length,1);assert.equal(JSON.stringify(map.objects),old);assert.ok(validateWorldmap(map).valid);
 const loaded=JSON.parse(JSON.stringify(map));assert.deepEqual(loaded.landscape.obstacles,map.landscape.obstacles);
 for(const bad of [{...line,height:NaN},{...line,points:[[NaN,0]]},{...line,erase:'yes'},{...line,biome:'code'},{...line,extra:'unknown'}])assert.ok(validateTerrainObstacles([bad]).length);
 assert.ok(validateTerrainObstacles(Array.from({length:513},(_,i)=>({...line,id:'ridge-'+i}))).length);
 assert.ok(validateTerrainObstacles([stroke('oversize',[[-3000,0],[3000,0]],{radius:40})]).length);
});

test('dense forest uses the same passable cuts and derives existing trees without altering saved placements',()=>{
 const source=[{...line,style:'forest'},cut],map={objects:[],landscape:{obstacles:source}},before=JSON.stringify(map),scene=new THREE.Scene();
 const r=createTerrainObstacles(scene,{map,heightAt:()=>0,biomeAt:()=> 'forest',isLand:()=>true,isWater:()=>false});
 assert.ok(r.treePlacements.length>10);assert.equal(JSON.stringify(map),before);
 assert.ok(r.treePlacements.every(o=>r.surface.sample(...o.position).d>.4));assert.ok(r.treePlacements.every(o=>Math.abs(o.position[0])>3));
 const free={x:0,y:0,z:0};r.resolveMovement(free,.42);assert.equal(free.x,0);assert.equal(r.traceProjectile({x:0,y:1,z:-20},{x:0,y:1,z:20}),null);
 assert.equal(r.traceProjectile({x:12,y:1,z:-20},{x:12,y:1,z:20}).type,'terrainRidge');
 const sight=createSightModel({obstacles:r.obstacles,radius:40});sight.update({x:12,y:0,z:-10});assert.equal(sight.isVisible({x:12,z:10}),false);r.dispose();
});

test('joined cliff normals consistently face outwards without alternating dark seams',()=>{
 const r=runtime([line,cut]);let checked=0;
 r.root.traverse(mesh=>{if(mesh.name!=='Felsrücken · Erde und Biomkappe')return;const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=n.getX(i),nz=n.getZ(i);if(y<.5||y>3.3||Math.hypot(nx,nz)<.3)continue;checked++;
   assert.ok(r.surface.sample(x+nx*.2,z+nz*.2).d<r.surface.sample(x-nx*.2,z-nz*.2).d,'cliff normal must point towards free space');
  }
 });assert.ok(checked>50);r.dispose();
});
