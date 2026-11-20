/** Authored replacement of the 2026-11-19 generated forest, using editor data only.
 * Hand-placed objects, terrain painting, biomes and bridges are retained. */
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {CONNECTIONS,objectRadius,housePoint,pathDistance} from './populate-forest.js';
import {pointInPolygon,validateWorldmap} from '../src/map/model.js';
import {getHouseDefinition} from '../src/map/house-builder.js';
import {createWorldSpatialModel} from '../src/generated-spatial.js';
import {createObstacleSurface,validateTerrainObstacles} from '../src/map/terrain-obstacles.js';
export const PREFIX='green-world-';
export const RIDGE_PREFIX='ridge-green-';
export const PLACES=[
 {id:'lindenwacht',name:'Lindenwacht',center:[-170,-80],step:45,cells:4},
 {id:'farnhoehe',name:'Farnhöhe',center:[95,-435],step:30,cells:2},
 {id:'eichenruh',name:'Eichenruh',center:[-405,40],step:30,cells:2},
 {id:'moosbrunn',name:'Moosbrunn',center:[-100,155],step:30,cells:2},
 {id:'holzschlag',name:'Holzschlag',center:[-325,-190],step:30,cells:2},
 {id:'waldrain',name:'Waldrain',center:[-300,170],step:30,cells:2},
];
const round=v=>Math.round(v*100)/100,dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function stripGeneratedForest(source){
 const map=structuredClone(source);
 for(const key of ['objects','paths','barriers'])map[key]=map[key].filter(o=>!o.id.startsWith('forest-world-'));
 map.landscape.terrain=map.landscape.terrain.filter(o=>!o.id.startsWith('forest-world-'));
 return map;
}
export function rebuildGreenWorld(source){
 if(source.objects.some(o=>o.id.startsWith(PREFIX)))throw Error('Der neue Grünwald ist bereits vorhanden; spätere Editoränderungen werden nicht überschrieben.');
 const map=stripGeneratedForest(source),baseline=structuredClone(map),spatial=createWorldSpatialModel(map);
 const added=[],houses=[],routes=[],plots=[],blocks=[],occupied=[],ridges=[];
 let seed=20112026,serial=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
 const forest=(p,r=0)=>pointInPolygon(p,map.island.points)&&!spatial.isWater(...p,r)&&[...Array(12)].every((_,i)=>{
  const a=i*Math.PI/6,q=[p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r];return pointInPolygon(q,map.island.points)&&spatial.biomeAt(...q)==='forest';
 });
 const protectedPoint=(p,r=0)=>baseline.objects.some(o=>dist(p,o.position)<objectRadius(o)+r+6)||baseline.landscape.terrain.some(t=>dist(p,t.position)<t.radius+r+3);
 const route=(id,name,kind,width,points)=>{const path={id:PREFIX+id,name,kind,width,points:points.map(p=>p.map(round))};map.paths.push(path);routes.push(path);return path;};
 // Connect the same existing bridges and hand-placed tavern, with loops around the forest.
 for(const [id,name,kind,width,points] of CONNECTIONS){
  let p=points;
  if(id==='nordstrasse')p=[[-170,-80],[-170,-195],[-130,-230],[-90,-285],[-55,-335],[30,-365],[95,-380],[95,-435]];
  if(id==='holzweg')p=[[-170,-195],[-245,-220],[-325,-220],[-325,-190]];
  route(id,name,kind,kind==='main'?7:Math.max(4.5,width),p);
 }
 // An additional route gives the town a north-west flanking loop.
 route('nordwestschleife','Waldweg am Felsgrat','trail',5,[[-325,-190],[-355,-120],[-360,-70],[-315,-30]]);
 const add=(kind,variant,p,options={})=>{
  const o={id:PREFIX+(options.id??`${kind}-${++serial}`),name:options.name??`Grünwald · ${kind}`,kind,variant,position:p.map(round),rotation:options.rotation??round(range(0,Math.PI*2)),scale:options.scale??1,...options};
  o.id=PREFIX+(options.id??`${kind}-${serial}`);map.objects.push(o);added.push(o);return o;
 };
 const doorPoints=house=>getHouseDefinition(house).entrances.map(door=>{
  const sign=['north','west'].includes(door.side)?-1:1,along=['north','south'].includes(door.side);
  const at=d=>housePoint(house,along?[door.center,door.boundary+sign*d]:[door.boundary+sign*d,door.center]);
  return {threshold:at(.85),approach:at(3),normal:at(4).map((v,k)=>v-at(3)[k])};
 });
 function connectDoors(house){
  for(const [i,d] of doorPoints(house).entries()){
   // Intersect the outward door ray with the nearest parallel street; never
   // route an entrance around the wrong side or through another building.
   let best=null;
   for(const r of routes.filter(r=>!r.id.includes('-zugang')))for(let j=1;j<r.points.length;j++){
    const a=r.points[j-1],b=r.points[j],vx=b[0]-a[0],vz=b[1]-a[1],nx=d.normal[0],nz=d.normal[1],det=nx*vz-nz*vx;
    if(Math.abs(det)<.00001)continue;
    const dx=a[0]-d.approach[0],dz=a[1]-d.approach[1],t=(dx*vz-dz*vx)/det,u=(dx*nz-dz*nx)/det;
    if(t<0||u<-.00001||u>1.00001||t>45||best&&t>=best.t)continue;
    best={t,point:[d.approach[0]+nx*t,d.approach[1]+nz*t]};
   }
   if(!best)throw Error('Kein freier Türanschluss: '+house.id);
   route(house.id.slice(PREFIX.length)+'-zugang-'+i,house.name+' · Zugang','trail',3.2,[d.threshold,d.approach,best.point]);
   plots.push({id:house.id,...d,street:best.point});
  }
 }
 function houseClearance(p,h){
  const d=getHouseDefinition(h).floorBounds,c=Math.cos(h.rotation),s=Math.sin(h.rotation),dx=p[0]-h.position[0],dz=p[1]-h.position[1];
  const x=dx*c-dz*s,z=dx*s+dz*c;
  return Math.hypot(Math.max(d.minX-x,0,x-d.maxX),Math.max(d.minZ-z,0,z-d.maxZ));
 }
 function pathNearHouse(path,h){
  for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],n=Math.ceil(dist(a,b));for(let j=0;j<=n;j++)if(houseClearance(a.map((v,k)=>v+(b[k]-v)*j/n),h)<path.width/2+1.5)return true;}return false;
 }
 function house(id,name,p,variant,index,rotation=0,entrances=null){
  const probe={kind:'house',variant,position:p,scale:1,rotation},radius=objectRadius(probe);
  if(!forest(p,radius+2)||protectedPoint(p,radius)||houses.some(h=>dist(p,h.position)<radius+objectRadius(h)+2))return null;
  // True wall extents retain usable narrow-house alleys without reserving
  // an oversized circle around every rectangular building.
  if(routes.some(r=>pathNearHouse(r,probe)))return null;
  const h=add('house',variant,p,{id,name,rotation,houseStyle:['natural','lime','dark','ochre'][index%4],houseSeed:201100+index*137,
   houseRooms:variant==='waldhaus-small'?1:1+index%3,houseLayout:index%3,houseEntrances:entrances??(index%3===0?'double':'single'),houseStoneColor:['natural','moss','slate'][index%3],houseWallColor:['chalk','sage','clay','style','sand'][index%5]});
  houses.push(h);connectDoors(h);return h;
 }
 let hi=0;
 for(const place of PLACES){
  const half=place.cells*place.step/2,[cx,cz]=place.center;
  // Real street blocks, without a radial market plaza or circular house alignment.
  for(let i=0;i<=place.cells;i++){
   const offset=-half+i*place.step,w=place.cells===4?(i===2?10:7):6;
   route(place.id+'-strasse-ns-'+i,place.name+' · Nord-Süd-Straße','main',w,[[cx+offset,cz-half],[cx+offset,cz+half]]);
   route(place.id+'-strasse-ow-'+i,place.name+' · Querstraße','main',w,[[cx-half,cz+offset],[cx+half,cz+offset]]);
  }
  for(let ix=0;ix<place.cells;ix++)for(let iz=0;iz<place.cells;iz++){
   const x=cx-half+(ix+.5)*place.step,z=cz-half+(iz+.5)*place.step,id=place.id+'-block-'+ix+'-'+iz;
   const block={id,place:place.id,bounds:[x-place.step/2,z-place.step/2,x+place.step/2,z+place.step/2],houses:[]};blocks.push(block);
   const pair=place.cells===4&&(ix+iz)%3!==0;
   const lots=pair?[[-11,'waldhaus-town'],[11,'waldhaus-small']]:[[0,place.cells===4?['waldhaus-hall','waldhaus-corner','waldhaus'][hi%3]:'waldhaus-small']];
   for(const [n,[offset,variant]] of lots.entries()){
    const h=house(id+'-haus-'+n,place.name+' · Haus '+(hi+1),[x+offset,z],variant,hi++,(ix+iz+n)%2?Math.PI:0);
    if(h)block.houses.push(h.id);
   }
  }
 }
 for(const [id,p] of [['jaegerhaus',[-65,-242]],['nordwacht',[260,-467]],['osthaus',[85,148]]])house(id,'Einzelnes Waldhaus',p,'waldhaus-small',hi++,0,'single');
 // Long irregular barriers define valleys and combat clearings. Keep every
 // road, house, old painting and both bridge approaches outside their footprint.
 const obstacleDistance=p=>ridges.length?Math.min(...ridges.map(r=>pathDistance(p,r)-r.radius)):Infinity;
 function ridge(points,radius,height,style){
  const samples=[];
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],n=Math.ceil(dist(a,b)/3);for(let j=0;j<=n;j++)samples.push(a.map((v,k)=>v+(b[k]-v)*j/n));}
  if(samples.some(p=>!forest(p,radius+3)||protectedPoint(p,radius+4)||routes.some(r=>pathDistance(p,r)<radius+r.width/2+5)
    ||houses.some(h=>dist(p,h.position)<radius+objectRadius(h)+7)||PLACES.some(s=>Math.max(Math.abs(p[0]-s.center[0]),Math.abs(p[1]-s.center[1]))<s.cells*s.step/2+radius+10)
    ||obstacleDistance(p)<radius+10))return false;
  const s={id:RIDGE_PREFIX+(ridges.length+1),points:points.map(p=>p.map(round)),radius:round(radius),height:round(height),biome:'forest',style,erase:false};
  if(validateTerrainObstacles([...(map.landscape.obstacles??[]),...ridges,s],map.bounds).length)return false;
  ridges.push(s);return true;
 }
 // Bias half the candidates toward actual routes so roads travel between hills.
 const country=routes.filter(r=>!r.id.includes('-strasse-')&&!r.id.includes('-zugang'));
 for(let i=0;i<2800&&ridges.length<38;i++){
  let x=range(-485,300),z=range(-490,305),angle=range(0,Math.PI),length=range(30,85),radius=range(12,23);
  if(i%2===0){const road=country[Math.floor(random()*country.length)],j=1+Math.floor(random()*(road.points.length-1)),a=road.points[j-1],b=road.points[j],t=range(.15,.85),l=dist(a,b),nx=-(b[1]-a[1])/l,nz=(b[0]-a[0])/l,side=random()<.5?-1:1,offset=radius+range(15,40);x=a[0]+(b[0]-a[0])*t+nx*offset*side;z=a[1]+(b[1]-a[1])*t+nz*offset*side;angle=Math.atan2(b[1]-a[1],b[0]-a[0])+range(-.2,.2);}
  const dx=Math.cos(angle)*length/2,dz=Math.sin(angle)*length/2,bend=range(-6,6);
  ridge([[x-dx,z-dz],[x-Math.sin(angle)*bend,z+Math.cos(angle)*bend],[x+dx,z+dz]],radius,range(2.6,4.8),ridges.length%3===0?'forest':'cliff');
 }
 map.landscape.obstacles=[...(map.landscape.obstacles??[]),...ridges];
 const surface=createObstacleSurface(map.landscape.obstacles,{isLand:(x,z)=>pointInPolygon([x,z],map.island.points),isWater:spatial.isWater,biomeAt:spatial.biomeAt});
 function safe(p,r,{roadGap=1.5}={}){
  return forest(p,r+1)&&!protectedPoint(p,r)&&surface.sample(...p).d < -.5&&obstacleDistance(p)>r+2&&
   !houses.some(h=>dist(p,h.position)<objectRadius(h)+r+1)&&!routes.some(path=>pathDistance(p,path)<path.width/2+r+roadGap)&&
   !baseline.paths.filter(p=>p.kind==='bridge').some(path=>pathDistance(p,path)<path.width/2+r+4)&&
   !plots.some(d=>dist(p,d.approach)<r+3.5)&&!occupied.some(o=>dist(p,o.p)<r+o.r+1);
 }
 function prop(kind,variant,p,r,opts={}){if(!safe(p,r))return null;const o=add(kind,variant,p,opts);occupied.push({p:o.position,r});return o;}
 const loot=[];
 // Rare rewards occupy defensible but open side clearings, not a blocking street centre.
 for(const [i,anchor] of [...PLACES.map(s=>s.center),[-55,-335],[-360,-70],[120,260]].entries()){
  for(let attempt=0;attempt<100;attempt++){
   const a=range(0,Math.PI*2),r=i<6?range(PLACES[i].step*PLACES[i].cells/2+14,PLACES[i].step*PLACES[i].cells/2+38):range(14,34),p=[anchor[0]+Math.cos(a)*r,anchor[1]+Math.sin(a)*r];
   const o=prop('chest','kit-tripo-rare-chest',p,5.5,{name:'Seltene Truhe',rotation:0});if(o){loot.push(o.id);break;}
  }
 }
 for(const h of houses){
  const r=objectRadius(h);
  for(let i=0;i<50;i++){const a=range(0,Math.PI*2),radius=r+range(4,11),p=[h.position[0]+Math.cos(a)*radius,h.position[1]+Math.sin(a)*radius];
   const o=prop('chest','kit-tripo-chest',p,1.5,{name:'Schatztruhe',rotation:h.rotation});if(o){loot.push(o.id);break;}}
  for(let i=0,placed=0;i<35&&placed<3;i++){
   const a=range(0,Math.PI*2),radius=r+range(2,8),p=[h.position[0]+Math.cos(a)*radius,h.position[1]+Math.sin(a)*radius],barrel=i%2===0;
   if(prop(barrel?'barrel':'crate',barrel?'kit-tripo-barrel':['kit-tripo-crate-01','kit-tripo-crate-02'][i%2],p,barrel?.8:1.1,{name:barrel?'Holzfass':'Holzkiste',rotation:h.rotation+range(-.12,.12)}))placed++;
  }
 }
 for(const place of PLACES){
  for(let i=0;i<100;i++){const p=[place.center[0]+range(-20,20),place.center[1]+range(-20,20)];if(prop('well','kit-tripo-well',p,2,{name:place.name+' · Brunnen',rotation:0}))break;}
  for(let i=0;i<80;i++){const p=[place.center[0]+range(-45,45),place.center[1]+range(-45,45)];if(prop('wagon','kit-tripo-wagon',p,3,{name:place.name+' · Wagen',rotation:Math.PI/2}))break;}
 }
 // Loose trees soften the playable edges; solid dense forests are already
 // supplied by the painted terrain and need no duplicated authored tree mass.
 for(let i=0,trees=0;i<7500&&trees<650;i++){
  const p=[range(-500,325),range(-510,310)];if(PLACES.some(s=>Math.max(Math.abs(p[0]-s.center[0]),Math.abs(p[1]-s.center[1]))<s.cells*s.step/2+3))continue;
  if(i%8===0){prop('rock',['kit-tripo-01','kit-tripo-02','kit-tripo-03'][i%3],p,2.2,{scale:round(range(.7,1.1))});continue;}
  const scale=round(range(.65,1.15));if(prop('tree','kit-user-tree1',p,2.7*scale,{name:'Grünwald · Waldrandbaum',scale}))trees++;
 }
 for(let i=0;i<450;i++){
  const p=[range(-460,230),range(-465,260)];if(i%4===0)prop('log','kit-tripo-log-02',p,2.6,{scale:.8});
  else if(i%4===1)prop('stump','kit-tripo-stump-02',p,1.3,{scale:.8});
 }
 const valid=validateWorldmap(map);if(!valid.valid)throw Error(valid.errors.join('\n'));
 const counts=Object.fromEntries([...new Set(added.map(o=>o.kind))].map(k=>[k,added.filter(o=>o.kind===k).length]));
 return {map,report:{seed:20112026,baselineHash:createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),preservedObjects:baseline.objects.length,objects:added.length,counts,houses:houses.length,paths:routes.length,plots,blocks,settlements:PLACES,obstacles:ridges.length,obstacleCells:surface.cells,
   rareChests:added.filter(o=>o.variant==='kit-tripo-rare-chest').length,normalChests:added.filter(o=>o.variant==='kit-tripo-chest').length,loot,checks:{roadBuffer:5,rareChestClearance:5.5,mainStreetWidth:10,sideStreetWidth:7},warnings:valid.warnings}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const source=JSON.parse(await readFile('worldmap.json','utf8')),result=rebuildGreenWorld(source);
 if(process.argv.includes('--write')){await writeFile('worldmap.json',JSON.stringify(result.map,null,2)+'\n');await writeFile('docs/green-world-layout.json',JSON.stringify(result.report,null,2)+'\n');}
 console.log(JSON.stringify({...result.report,plots:undefined,blocks:undefined,loot:undefined},null,2));
}
