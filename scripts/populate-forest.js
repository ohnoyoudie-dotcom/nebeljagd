import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { pointInPolygon, distanceToSegment, validateWorldmap } from '../src/map/model.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { getHouseDefinition } from '../src/map/house-builder.js';
import { createWorldSpatialModel } from '../src/generated-spatial.js';

export const PREFIX='forest-world-';
export const SETTLEMENTS=[
  {id:'lindenwacht',name:'Lindenwacht',center:[-170,-80],ring:42,lots:62,angles:Array.from({length:16},(_,i)=>11.25+i*22.5),square:12},
  {id:'farnhoehe',name:'Farnhöhe',center:[95,-435],ring:23,lots:39,angles:Array.from({length:8},(_,i)=>22.5+i*45),square:10},
  {id:'eichenruh',name:'Eichenruh',center:[-405,40],ring:22,lots:38,angles:[22.5,67.5,112.5,202.5,247.5,292.5],square:10},
  {id:'moosbrunn',name:'Moosbrunn',center:[-100,155],ring:22,lots:38,angles:[22.5,67.5,112.5,202.5,247.5,292.5],square:10},
  {id:'holzschlag',name:'Holzschlag',center:[-325,-190],ring:12,lots:27,angles:[45,135,225],square:7},
  {id:'waldrain',name:'Waldrain',center:[-300,170],ring:12,lots:27,angles:[35,155,220],square:7},
];
export const CONNECTIONS=[
  ['nordstrasse','Nordstraße','main',5.8,[[-170,-80],[-170,-175],[-130,-230],[-90,-285],[-55,-335],[30,-365],[95,-380],[95,-435]]],
  ['weststrasse','Weststraße','main',5.5,[[-170,-80],[-260,-80],[-315,-30],[-360,40],[-405,40]]],
  ['suedstrasse','Südstraße','main',5.2,[[-170,-80],[-170,25],[-120,80],[-100,105],[-100,155]]],
  ['holzweg','Holzfällerweg','trail',3.4,[[-170,-175],[-245,-155],[-325,-155],[-325,-190]]],
  ['waldbogen','Westlicher Waldbogen','trail',3.8,[[-405,40],[-405,120],[-360,160],[-300,170],[-240,155],[-170,155],[-100,155]]],
  ['nordbrueckenweg','Weg zur Nordbrücke','main',5,[[-55,-335],[0,-315],[65,-295],[125,-288],[161,-324]]],
  ['suedbrueckenweg','Weg zur Südbrücke','trail',3.6,[[-100,155],[-20,125],[35,140],[65,210],[120,260],[190,285],[226,313]]],
  ['jaegerpfad','Jägerpfad','trail',2.8,[[-90,-285],[-85,-250],[-65,-230]]],
  ['nordgratpfad','Nordgratpfad','trail',3.2,[[95,-435],[155,-435],[210,-455],[260,-455]]],
  ['ostlichtung','Pfad zur Ostlichtung','trail',2.8,[[35,140],[65,160],[85,160]]],
  ['frostsaum','Pfad zum Frostsaum','trail',3,[[-325,-190],[-370,-210],[-405,-235]]],
  ['wirtshausweg','Anschluss zum vorhandenen Wirtshaus','trail',3,[[-170,-80],[-90,-80],[-60,-110],[-35,-105],[-35,-60]]],
];
const RINGS={
 lindenwacht:[[-42,-25],[-29,-39],[5,-42],[38,-30],[46,-5],[39,27],[14,42],[-22,37],[-43,13]],
 farnhoehe:[[-24,-9],[-17,-23],[9,-26],[27,-7],[21,17],[1,24],[-20,15]],
 eichenruh:[[-17,-26],[10,-22],[21,-4],[15,24],[-9,27],[-23,8]],
 moosbrunn:[[-25,-12],[-12,-23],[12,-20],[25,3],[16,21],[-8,25],[-22,10]],
 holzschlag:[[-12,-9],[8,-14],[16,4],[3,12],[-12,6]],
 waldrain:[[-15,-5],[-5,-13],[13,-9],[15,7],[0,13],[-12,6]],
};
const round=n=>Math.round(n*100)/100;
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function pathDistance(p,path){return Math.min(...path.points.slice(1).map((b,i)=>distanceToSegment(p,path.points[i],b)));}
export function objectRadius(o){
  const d=getEnvironmentKitDefinition(o.kind,o.variant);
  return (d?Math.hypot(d.footprint.halfWidth,d.footprint.halfDepth):o.kind==='mound'?6.5:o.kind==='tree'?3:o.radius??1.6)*o.scale;
}
export function housePoint(o,p){const c=Math.cos(o.rotation),s=Math.sin(o.rotation);return [o.position[0]+(p[0]*c+p[1]*s)*o.scale,o.position[1]+(-p[0]*s+p[1]*c)*o.scale];}
export function createForestWorld(source){
  if(source.objects.some(o=>o.id.startsWith(PREFIX)))throw new Error('Der Waldausbau ist bereits vorhanden. Vorhandene Platzierungen werden nicht überschrieben.');
  const map=structuredClone(source),spatial=createWorldSpatialModel(source),added=[],houses=[],routes=[],plots=[];
  let seed=19112026,serial=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const range=(a,b)=>a+(b-a)*random();
  const originalProtected=p=>source.objects.some(o=>distance(p,o.position)<objectRadius(o)+7)||source.landscape.terrain.some(t=>distance(p,t.position)<t.radius+4);
  const forest=(p,margin=0)=>pointInPolygon(p,map.island.points)&&spatial.biomeAt(...p)==='forest'&&[0,1,2,3,4,5,6,7].every(i=>{const a=i*Math.PI/4,q=[p[0]+Math.sin(a)*margin,p[1]+Math.cos(a)*margin];return pointInPolygon(q,map.island.points)&&spatial.biomeAt(...q)==='forest';});
  const junctions=new Set(SETTLEMENTS.map(p=>p.center.join(',')));
  const uses=new Map();for(const route of CONNECTIONS)for(const p of route[4])uses.set(p.join(','),(uses.get(p.join(','))??0)+1);
  for(const [p,n] of uses)if(n>1)junctions.add(p);
  function soften(points){
    if(points.length<3)return points;
    const out=[points[0]];
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1];
      if(junctions.has(b.join(','))){out.push(b);continue;}
      const d=Math.min(8,distance(a,b)*.25,distance(b,c)*.25),lerp=(p,q,t)=>p.map((v,k)=>v+(q[k]-v)*t);
      const from=lerp(b,a,d/distance(a,b)),to=lerp(b,c,d/distance(b,c));out.push(from);
      for(let j=1;j<=5;j++){const t=j/5;out.push(from.map((v,k)=>(1-t)**2*v+2*(1-t)*t*b[k]+t*t*to[k]));}
    }out.push(points.at(-1));return out;
  }
  const route=(id,name,kind,width,points)=>{const p={id:PREFIX+id,name,kind,width,points:soften(points).map(p=>p.map(round))};map.paths.push(p);routes.push(p);return p;};
  for(const spec of CONNECTIONS)route(...spec);
  const add=(kind,variant,position,options={})=>{const o={id:PREFIX+(options.id??`${kind}-${++serial}`),name:options.name??`Waldlandschaft · ${kind}`,kind,variant,position:position.map(round),rotation:round(options.rotation??range(0,Math.PI*2)),scale:round(options.scale??1),...options};o.id=PREFIX+(options.id??`${kind}-${serial}`);added.push(o);map.objects.push(o);return o;};
  function addHouse(id,name,p,rotation,variant,index,center){
    const o={id, name, rotation:round(rotation),scale:1,houseStyle:['natural','dark','lime','ochre'][index%4],houseSeed:191100+index*113,
      houseRooms:variant==='waldhaus-small'?1:1+index%3,houseLayout:index%3,houseEntrances:index%4===0?'double':'single',houseStoneColor:['natural','moss','slate'][index%3],houseWallColor:['style','chalk','sage','clay','sand'][index%5]};
    const probe={...o,kind:'house',variant,position:p},radius=objectRadius(probe);
    if(!forest(p,radius+3)||originalProtected(p)||houses.some(h=>distance(p,h.position)<radius+objectRadius(h)+2.5)||routes.some(r=>pathDistance(p,r)<radius+r.width/2+1.2))return null;
    const house=add('house',variant,p,o);houses.push(house);
    const d=getHouseDefinition(house),door=d.entrances[0],along=door.side==='north'||door.side==='south',sign=['north','west'].includes(door.side)?-1:1;
    const threshold=housePoint(house,along?[door.center,door.boundary+sign*.85]:[door.boundary+sign*.85,door.center]);
    const outside=housePoint(house,along?[door.center,door.boundary+sign*3]:[door.boundary+sign*3,door.center]);
    const nearest=routes.filter(r=>r.id.includes('ring')||r.id.includes('gasse')).flatMap(r=>r.points.map(point=>({point,d:distance(point,outside)}))).sort((a,b)=>a.d-b.d)[0];
    const end=center??nearest?.point;
    route(id+'-zugang',name+' · Zugang','trail',2.4,[threshold,outside,end]);
    plots.push({id:house.id,threshold,approach:outside});return house;
  }
  let houseIndex=0;
  for(const place of SETTLEMENTS){
    const [x,z]=place.center,r=place.ring;
    const shape=RINGS[place.id]; const ring=[...shape,shape[0]].map(([dx,dz])=>[x+dx,z+dz]);
    route(place.id+'-ring',place.name+' · Rundweg',place.square>10?'main':'trail',place.square>10?5:3.4,ring);
    for(const [axis,points] of [['ns',[[x,z-r],[x,z],[x,z+r]]],['ow',[[x-r,z],[x,z],[x+r,z]]]])route(place.id+'-gasse-'+axis,place.name+' · Dorfstraße',place.square>10?'main':'trail',place.square>10?5:3.4,points);
    map.landscape.terrain.push({id:PREFIX+place.id+'-platz',name:place.name+' · Dorfplatz',color:place.id==='lindenwacht'?'#8e897d':'#9d835c',type:place.id==='lindenwacht'?'cobble':'earth',position:place.center,radius:place.square,strength:.95,hardness:.7,variation:.12,seed:1911+houseIndex});
    for(let i=0;i<place.angles.length;i++){
      const a=(place.angles[i]+Math.sin(i*2.3)*2.4)*Math.PI/180,lot=place.lots+Math.sin(i*1.7)*2,p=[x+Math.sin(a)*lot,z+Math.cos(a)*lot];
      const variants=place.id==='lindenwacht'?['waldhaus-town','waldhaus','waldhaus-corner','waldhaus-small']:['waldhaus-small','waldhaus','waldhaus-corner'];
      const variant=i===0&&place.id==='lindenwacht'?'waldhaus-hall':variants[i%variants.length];
      const index=houseIndex++;
      for(const shift of [0,3,-3,6,-6]){
        const angle=a+shift*Math.PI/180,position=[x+Math.sin(angle)*lot,z+Math.cos(angle)*lot];
        if(addHouse(place.id+'-haus-'+(i+1),place.name+' · '+(i===0?'Gasthaus':'Haus '+(i+1)),position,angle+Math.PI,variant,index))break;
        if(shift===-6)addHouse(place.id+'-haus-'+(i+1),place.name+' · Haus '+(i+1),position,angle+Math.PI,'waldhaus-small',index);
      }
    }
    if(place.id==='lindenwacht')for(const [i,[dx,dz]] of [[-17,-17],[17,-17],[-17,17],[17,17]].entries())addHouse(place.id+'-hof-'+i,'Lindenwacht · Markthaus '+(i+1),[x+dx,z+dz],dz<0?0:Math.PI,'waldhaus-small',houseIndex++,[x+dx,z]);
  }
  for(const [id,name,p,access] of [['jaegerhaus','Jägerhaus',[-56,-242],[-65,-230]],['nordwacht','Haus am Nordgrat',[260,-467],[260,-455]],['osthaus','Haus an der Ostlichtung',[85,148],[85,160]]])addHouse(id,name,p,0,'waldhaus-small',houseIndex++,access);
  // Conservative spacing keeps trunks, rock piles, garden props and all doors off the walkable network.
  const occupied=houses.map(o=>({p:o.position,r:objectRadius(o)+3}));
  function scenery(kind,variant,p,r,options={}){
    if(!forest(p,r+3)||originalProtected(p)||routes.some(path=>pathDistance(p,path)<path.width/2+r+2.2)||map.paths.filter(p=>p.kind==='bridge').some(path=>pathDistance(p,path)<path.width/2+r+5)||occupied.some(o=>distance(p,o.p)<r+o.r))return false;
    if(kind==='fence'){
      const angle=options.rotation??0,c=Math.cos(angle)*2,s=Math.sin(angle)*2;
      map.barriers.push({id:PREFIX+'gartenzaun-'+(++serial),name:options.name,kind,variant,points:[[p[0]-c,p[1]+s],[p[0]+c,p[1]-s]].map(p=>p.map(round)),scale:1,gaps:[]});
    }else add(kind,variant,p,options);
    occupied.push({p,r});return true;
  }
  for(const place of SETTLEMENTS){
    const [x,z]=place.center;
    for(const [dx,dz] of [[8,8],[-8,8],[8,-8],[-8,-8],[15,7],[-15,7],[15,-7],[-15,-7],[7,13],[-7,13]])if(scenery('well','kit-tripo-well',[x+dx,z+dz],1.8,{name:place.name+' · Brunnen',rotation:0}))break;
    for(let i=0;i<90;i++){
      const a=range(0,Math.PI*2),r=range(place.lots-8,place.lots+17),p=[x+Math.sin(a)*r,z+Math.cos(a)*r];
      if(i%5===0)scenery('tree','kit-user-tree1',p,2.7,{name:place.name+' · Gartenbaum',scale:.7});
      else if(i%9===0)scenery('wagon','kit-tripo-wagon',p,2.4,{name:place.name+' · abgestellter Wagen'});
      else if(i%7===0)scenery('fence','kit-cross-wood',p,2.4,{name:place.name+' · Gartenzaun',rotation:round(a)});
      else if(i%3===0)scenery('tree','kit-user-tree1',p,2.9,{name:place.name+' · junger Baum',scale:round(range(.65,.9))});
    }
  }
  // Dense, uneven groves with open glades. Stable authoring data, never runtime randomness.
  const groves=[];
  for(let i=0;i<600&&groves.length<40;i++){
    const p=[range(-500,335),range(-505,280)];
    if(forest(p,23)&&!SETTLEMENTS.some(s=>distance(p,s.center)<s.lots+28)&&groves.every(g=>distance(p,g)>37))groves.push(p);
  }
  for(const [g,center] of groves.entries())for(let i=0;i<100;i++){
    const a=range(0,Math.PI*2),radius=Math.sqrt(random())*range(24,43),p=[center[0]+Math.sin(a)*radius,center[1]+Math.cos(a)*radius];
    const scale=round(range(.85,1.4)),variant='kit-user-tree1';
    scenery('tree',variant,p,3.3*scale,{name:'Grünwald · Baumgruppe '+(g+1),scale});
  }
  for(let i=0;i<1800;i++){
    const p=[range(-500,330),range(-505,280)];
    if(SETTLEMENTS.some(s=>distance(p,s.center)<s.ring+8))continue;
    if(i%13===0)scenery('rock','kit-tripo-03',p,9,{name:'Grünwald · große Felsgruppe',scale:round(range(1.8,2.4))});
    else if(i%7===0)scenery('rock',['kit-tripo-01','kit-tripo-02','kit-tripo-03'][i%3],p,2.8,{scale:round(range(.9,1.6))});
    else if(i%5===0)scenery('stump','kit-tripo-stump-02',p,1.7,{scale:round(range(.7,1.1))});
    else if(i%3===0)scenery('log','kit-tripo-log-02',p,3.5,{scale:round(range(.8,1.2)),name:'Grünwald · umgestürzter Stamm'});
    else if(i%2===0)scenery('tree','kit-user-tree1',p,3,{name:'Grünwald · junger Baum',scale:round(range(.65,.95))});
  }
  const validation=validateWorldmap(map);if(!validation.valid)throw new Error(validation.errors.join('\n'));
  return {map,report:{baselineHash:createHash('sha256').update(JSON.stringify(source)).digest('hex'),seed:19112026,settlements:SETTLEMENTS.map(p=>({...p,houses:houses.filter(h=>h.id.startsWith(PREFIX+p.id)).length})),plots,
    objects:added.length,barriers:map.barriers.length-source.barriers.length,houses:houses.length,paths:routes.length,groves:groves.length,counts:Object.fromEntries([...new Set(added.map(o=>o.kind))].map(kind=>[kind,added.filter(o=>o.kind===kind).length])),warnings:validation.warnings}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const source=JSON.parse(await readFile('worldmap.json','utf8')),result=createForestWorld(source);
  if(process.argv.includes('--write')){await writeFile('worldmap.json',JSON.stringify(result.map,null,2)+'\n');await writeFile('docs/forest-settlements.json',JSON.stringify(result.report,null,2)+'\n');}
  console.log(JSON.stringify(result.report,null,2));
}
