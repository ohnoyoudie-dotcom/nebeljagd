import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createForestWorld,pathDistance} from '../scripts/populate-forest.js';
import {rebuildGreenWorld,stripGeneratedForest,PREFIX,RIDGE_PREFIX} from '../scripts/rebuild-green-world.js';
import {createWorldSpatialModel} from '../src/generated-spatial.js';
import {createObstacleSurface} from '../src/map/terrain-obstacles.js';
import {validateWorldmap,pointInPolygon} from '../src/map/model.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {OBJECT_CATALOG} from '../src/map/objects.js';
const source=createForestWorld(JSON.parse(fs.readFileSync(new URL('./fixtures/forest-before-worldmap.json',import.meta.url)))).map;
const original=JSON.stringify(source),{map,report}=rebuildGreenWorld(source),base=stripGeneratedForest(source);
const spatial=createWorldSpatialModel(map),ridges=map.landscape.obstacles.filter(o=>o.id.startsWith(RIDGE_PREFIX));
const surface=createObstacleSurface(ridges,{isLand:(x,z)=>pointInPolygon([x,z],map.island.points),isWater:spatial.isWater,biomeAt:spatial.biomeAt});
const added=map.objects.filter(o=>o.id.startsWith(PREFIX)),houses=added.filter(o=>o.kind==='house'),roads=map.paths.filter(o=>o.id.startsWith(PREFIX));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function houseDistance(p,h){const d=getHouseDefinition(h).floorBounds,c=Math.cos(h.rotation),s=Math.sin(h.rotation),dx=p[0]-h.position[0],dz=p[1]-h.position[1],x=dx*c-dz*s,z=dx*s+dz*c;return Math.hypot(Math.max(d.minX-x,0,x-d.maxX),Math.max(d.minZ-z,0,z-d.maxZ));}

test('green rebuild replaces only the old authored generation and preserves original placements, painting, bridges and biomes',()=>{
 assert.equal(JSON.stringify(source),original);
 const restored=structuredClone(map);
 for(const key of ['objects','paths','barriers'])restored[key]=restored[key].filter(o=>!o.id.startsWith(PREFIX));
 restored.landscape.obstacles=restored.landscape.obstacles.filter(o=>!o.id.startsWith(RIDGE_PREFIX));
 if(!base.landscape.obstacles)delete restored.landscape.obstacles;
 assert.deepEqual(restored,base);
 assert.equal(report.baselineHash,createHash('sha256').update(JSON.stringify(base)).digest('hex'));
 assert.equal(report.preservedObjects,50);assert.equal(base.landscape.terrain.length,88);
 assert.deepEqual(validateWorldmap(map),{valid:true,errors:[],warnings:[]});
 assert.throws(()=>rebuildGreenWorld(map),/bereits vorhanden/);
});
test('town has rectangular blocks and several combat streets; houses have reachable outward doors',()=>{
 const city=report.blocks.filter(b=>b.place==='lindenwacht');assert.equal(city.length,16);
 assert.ok(city.filter(b=>b.houses.length>0).length>=14);assert.ok(city.filter(b=>b.houses.length===2).length>=6);
 assert.ok(roads.some(r=>r.width===10));assert.ok(roads.filter(r=>r.width===7).length>=8);
 for(const h of houses){assert.ok(Math.abs(Math.sin(h.rotation))<.0001);assert.ok(report.plots.some(p=>p.id===h.id));}
 for(const plot of report.plots){
  assert.ok(roads.some(r=>!r.id.includes('-zugang')&&pathDistance(plot.street,r)<.02));
  assert.ok(added.filter(o=>o.kind!=='house').every(o=>dist(o.position,plot.approach)>3.5));
 }
});
test('roads and bridge approaches stay dry and unobstructed across the entire new layout',()=>{
 for(const road of map.paths)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],n=Math.ceil(dist(a,b));
  for(let j=0;j<=n;j++){
   const p=a.map((v,k)=>v+(b[k]-v)*j/n);
   if(road.kind!=='bridge')assert.ok(!spatial.isWater(...p,road.width/2),road.id+' enters water');
   for(const h of houses)assert.ok(houseDistance(p,h)>.3,road.id+' crosses '+h.id);
   assert.ok(surface.sample(...p).d<0,road.id+' crosses a solid ridge');
  }
 }
 // All old/new roads and every doorway must join one network, not isolated loops.
 const cells=new Set(),key=(x,z)=>`${x},${z}`;
 for(const road of map.paths)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],n=Math.ceil(dist(a,b));for(let j=0;j<=n;j++)cells.add(key(Math.round((a[0]+(b[0]-a[0])*j/n)/2),Math.round((a[1]+(b[1]-a[1])*j/n)/2)));
 }
 const queue=[[-85,-40]],seen=new Set([key(...queue[0])]);
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const k=key(x+dx,z+dz);if(cells.has(k)&&!seen.has(k)){seen.add(k);queue.push([x+dx,z+dz]);}}}
 assert.equal(seen.size,cells.size,'disconnected street/doorway');
});
test('forest ridges are substantial editable strokes, remain inside the green biome and leave road corridors',()=>{
 assert.ok(ridges.length>=20);assert.ok(ridges.some(r=>r.style==='forest'));assert.ok(ridges.some(r=>r.style==='cliff'));
 assert.ok(surface.cells>20000&&surface.cells<65000);
 for(const r of ridges){assert.ok(r.points.length>=3);for(let i=1;i<r.points.length;i++){
  const a=r.points[i-1],b=r.points[i],n=Math.ceil(dist(a,b)/2);
  for(let j=0;j<=n;j++){const p=a.map((v,k)=>v+(b[k]-v)*j/n);for(let k=0;k<12;k++){
   const q=[p[0]+Math.cos(k*Math.PI/6)*(r.radius+1),p[1]+Math.sin(k*Math.PI/6)*(r.radius+1)];assert.equal(spatial.biomeAt(...q),'forest');assert.ok(pointInPolygon(q,map.island.points));
  }for(const road of roads)assert.ok(pathDistance(p,road)>r.radius+road.width/2+4.5);}
 }}
});
test('existing assets provide accessible normal and rare loot plus modest roadside containers',()=>{
 assert.ok(report.normalChests>=35);assert.ok(report.rareChests>=6&&report.rareChests<=12);
 assert.ok(report.counts.barrel>=40&&report.counts.crate>=30);
 for(const o of added){assert.ok(OBJECT_CATALOG.find(k=>k.kind===o.kind)?.variants.some(v=>v.id===o.variant&&!v.retired),o.id);assert.equal(spatial.biomeAt(...o.position),'forest');assert.ok(!spatial.isWater(...o.position));}
 for(const chest of added.filter(o=>o.kind==='chest')){
  const r=chest.variant==='kit-tripo-rare-chest'?5.5:1.5;
  assert.ok(surface.sample(...chest.position).d<0);
  assert.ok(houses.every(h=>houseDistance(chest.position,h)>r));
  for(const other of added.filter(o=>o.id!==chest.id&&o.kind!=='house'))assert.ok(dist(chest.position,other.position)>r+1,chest.id+' blocked by '+other.id);
  for(let k=0;k<12;k++)assert.ok(surface.sample(chest.position[0]+Math.cos(k*Math.PI/6)*r,chest.position[1]+Math.sin(k*Math.PI/6)*r).d<0);
 }
});
