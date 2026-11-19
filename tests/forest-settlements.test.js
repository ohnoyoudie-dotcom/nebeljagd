import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {PREFIX,objectRadius,pathDistance,housePoint,createForestWorld} from '../scripts/populate-forest.js';
import {validateWorldmap,pointInPolygon} from '../src/map/model.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {OBJECT_CATALOG, isObjectPlaceable} from '../src/map/objects.js';
import {createWorldSpatialModel} from '../src/generated-spatial.js';
// Exercise the authoring recipe on its fixture, so later manual map edits stay free.
const baselineSource=JSON.parse(fs.readFileSync(new URL('./fixtures/forest-before-worldmap.json',import.meta.url)));
const {map,report}=createForestWorld(baselineSource);
const added=map.objects.filter(o=>o.id.startsWith(PREFIX)),houses=added.filter(o=>o.kind==='house'),paths=map.paths.filter(p=>p.id.startsWith(PREFIX));
const spatial=createWorldSpatialModel(map);
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
test('forest authoring preserves every pre-existing object, painted area and unrelated map setting',()=>{
 const baseline=structuredClone(map);
 for(const key of ['objects','paths','barriers'])baseline[key]=baseline[key].filter(o=>!o.id.startsWith(PREFIX));
 baseline.landscape.terrain=baseline.landscape.terrain.filter(o=>!o.id.startsWith(PREFIX));
 assert.equal(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),report.baselineHash);
 assert.equal(baseline.objects.length,50);assert.equal(baseline.landscape.terrain.length,88);
 assert.deepEqual(validateWorldmap(map),{valid:true,errors:[],warnings:[]});
 assert.throws(()=>createForestWorld(map),/bereits vorhanden/);
});
test('new settlements use only current editor assets and leave other biomes and loot alone',()=>{
 assert(houses.length>=36);assert.equal(report.settlements.length,6);assert(added.filter(o=>o.kind==='tree').length>=700);
 for(const o of added){
   const variant=OBJECT_CATALOG.find(k=>k.kind===o.kind)?.variants.find(v=>v.id===o.variant);
   assert(variant&&!variant.retired,`${o.id}: unavailable asset`);
   assert(isObjectPlaceable(o.kind,o.variant)||(o.kind==='tree'&&o.variant==='kit-user-tree1'&&fs.existsSync(new URL('../assets/imported/user-trees/styled/tree1-woodland.glb',import.meta.url))),`${o.id}: not in current placement palette`);
   assert(!['chest','heart','crystal'].includes(o.kind)&&!o.kind.endsWith('Staff'));
   assert.equal(spatial.biomeAt(...o.position),'forest',o.id);assert(pointInPolygon(o.position,map.island.points),o.id);
 }
 for(const h of houses){
   const d=getHouseDefinition(h);
   for(const p of [[d.floorBounds.minX,d.floorBounds.minZ],[d.floorBounds.maxX,d.floorBounds.minZ],[d.floorBounds.minX,d.floorBounds.maxZ],[d.floorBounds.maxX,d.floorBounds.maxZ]]){
    const q=housePoint(h,p);assert(pointInPolygon(q,map.island.points));assert.equal(spatial.biomeAt(...q),'forest');
   }
 }
});
test('roads stay on dry ground, avoid buildings and lead to the actual house entrances',()=>{
 for(const path of paths)for(let i=1;i<path.points.length;i++){
  const a=path.points[i-1],b=path.points[i],steps=Math.max(1,Math.ceil(dist(a,b)/2));
  for(let n=0;n<=steps;n++){
   const p=[a[0]+(b[0]-a[0])*n/steps,a[1]+(b[1]-a[1])*n/steps];
   assert(!spatial.isWater(...p,path.width/2),path.id+' crosses water');
   for(const h of houses){
    const x=p[0]-h.position[0],z=p[1]-h.position[1],c=Math.cos(h.rotation),s=Math.sin(h.rotation),u=(x*c-z*s)/h.scale,v=(x*s+z*c)/h.scale;
    for(const r of getHouseDefinition(h).footprintAreas??[getHouseDefinition(h).floorBounds])assert(!(u>r.minX+.1&&u<r.maxX-.1&&v>r.minZ+.1&&v<r.maxZ-.1),`${path.id} crosses ${h.id}`);
   }
  }
 }
 for(const h of houses){
  const access=paths.find(p=>p.id===h.id+'-zugang');assert(access,h.id);assert.equal(access.points.length>=2,true);
  const plot=report.plots.find(p=>p.id===h.id);assert(dist(access.points[0],plot.threshold)<.02);
  assert(paths.some(p=>p!==access&&pathDistance(access.points.at(-1),p)<p.width/2+.5),h.id+' disconnected approach');
  for(const o of added.filter(o=>o.kind!=='house'))assert(dist(o.position,plot.approach)>2.2,h.id+' blocked door');
 }
 for(let i=0;i<houses.length;i++)for(const b of houses.slice(i+1))assert(dist(houses[i].position,b.position)>objectRadius(houses[i])+objectRadius(b)+2.4);
});
test('all village streets, remote houses and both bridges form one connected network',()=>{
 const cells=new Set(),key=(x,z)=>`${x},${z}`;
 for(const road of map.paths)for(let i=1;i<road.points.length;i++){
  const a=road.points[i-1],b=road.points[i],n=Math.max(1,Math.ceil(dist(a,b)));
  for(let j=0;j<=n;j++)cells.add(key(Math.round((a[0]+(b[0]-a[0])*j/n)/2),Math.round((a[1]+(b[1]-a[1])*j/n)/2)));
 }
 const queue=[[-85,-40]],seen=new Set([key(...queue[0])]);
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const k=key(x+dx,z+dz);if(cells.has(k)&&!seen.has(k)){seen.add(k);queue.push([x+dx,z+dz]);}}}
 assert.equal(seen.size,cells.size,'unreachable disconnected road section');
});
