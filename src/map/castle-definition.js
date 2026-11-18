/** Human-scale interiors below imposing exterior fortifications, on the same
 * 140 × 120 metre footprint. The two courtyards remain open green ground. */
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const rect = (minX,maxX,minZ,maxZ,extra={}) => ({minX,maxX,minZ,maxZ,...extra});
const floorHeight=.18,wallHeight=3,exteriorWallHeight=7.5,towerHeight=12.2,outerThickness=.8,innerThickness=.6;
const walls=[],doors=[],rooms=[],floors=[],windows=[],torches=[];
function wall(name,axis,fixed,from,to,holes=[],external=false,thickness=external?outerThickness:innerThickness) {
  let edge=from;
  for(const [a,b] of [...holes,[to,to]].sort((a,b)=>a[0]-b[0])) {
    if(a>edge) walls.push(rect(...(axis==='x'?[edge,a,fixed-thickness/2,fixed+thickness/2]:[fixed-thickness/2,fixed+thickness/2,edge,a]),
      {name:`${name} ${walls.length}`,minY:0,maxY:floorHeight+wallHeight,type:'house-wall',material:'stone',external,
        outerPerimeter:external&&Math.abs(fixed)>(axis==='x'?59:69)}));
    edge=Math.max(edge,b);
  }
}
function doorway(name,axis,x,z,width=3.6,depth=innerThickness) { doors.push({name,axis,x,z,width,depth}); }
function room(id,name,minX,maxX,minZ,maxZ,role='chamber') {
  rooms.push(rect(minX,maxX,minZ,maxZ,{roomId:id,name,material:'stone',role}));
}
function floor(minX,maxX,minZ,maxZ,pattern='flagstone',role='room') { floors.push(rect(minX,maxX,minZ,maxZ,{material:'stone',pattern,role,alongZ:true})); }
function entrance(name,side,center,boundary,innerBoundary,width,exterior=false,courtyardId=null) {
  return {name,side,center,min:center-width/2,max:center+width/2,boundary,innerBoundary,depth:.9,
    exterior,courtyard:!exterior,courtyardId};
}
const courtyards=[
  rect(-43,-9,-27,27,{id:'west-court',name:'Westlicher Innenhof'}),
  rect(9,43,-27,27,{id:'east-court',name:'Östlicher Innenhof'}),
];
const courtyardLawnAreas=courtyards.map(c=>rect(c.minX+1,c.maxX-1,c.minZ+1,c.maxZ-1,
  {id:`${c.id}-lawn`,courtyardId:c.id,material:'grass',outdoor:true}));
// Four disjoint one-metre borders protect the stone thresholds without paving
// over the living courtyard ground. Neither surface becomes an indoor floor.
const courtyardPavingAreas=courtyards.flatMap(c=>[
  rect(c.minX,c.maxX,c.minZ,c.minZ+1),rect(c.minX,c.maxX,c.maxZ-1,c.maxZ),
  rect(c.minX,c.minX+1,c.minZ+1,c.maxZ-1),rect(c.maxX-1,c.maxX,c.minZ+1,c.maxZ-1),
].map((a,i)=>({...a,id:`${c.id}-border-${i}`,courtyardId:c.id,material:'stone',pattern:'cobble',outdoor:true})));
const entrances=[
  entrance('Südtor','south',0,60,59.2,5.6,true),
  entrance('Nordtor','north',0,-60,-59.2,5,true),
];
// The lower wall architecture remains at the readable interior cutaway height.
// Its independent physical exterior height does not shrink with the camera.
wall('Westfassade','z',-69.6,-60,60,[],true);
wall('Ostfassade','z',69.6,-60,60,[],true);
wall('Nordfassade','x',-59.6,-69.2,69.2,[[-2.5,2.5]],true);
wall('Südfassade','x',59.6,-69.2,69.2,[[-2.8,2.8]],true);
for(const court of courtyards) {
  const west=court.minX<0,cx=(court.minX+court.maxX)/2,name=west?'Westhof':'Osthof';
  wall(`${name} Nordwand`,'x',-27.4,court.minX-.8,court.maxX+.8,[[cx-2.1,cx+2.1]],true);
  wall(`${name} Südwand`,'x',27.4,court.minX-.8,court.maxX+.8,[[cx-2.4,cx+2.4]],true);
  const outer=west?court.minX:court.maxX,inner=west?court.maxX:court.minX,outerDoor=west?-8:8;
  wall(`${name} Außenwand`,'z',outer+(west?-.4:.4),-27,27,[[outerDoor-1.9,outerDoor+1.9]],true);
  wall(`${name} Mittelgangwand`,'z',inner+(west?.4:-.4),-27,27,[[-2.5,2.5]],true);
  entrances.push(entrance(`${name} Nordzugang`,'south',cx,-27,-27.8,4.2,false,court.id),
    entrance(`${name} Südzugang`,'north',cx,27,27.8,4.8,false,court.id),
    entrance(`${name} Außengang`,west?'east':'west',outerDoor,outer,outer+(west?-.8:.8),3.8,false,court.id),
    entrance(`${name} Mittelhalle`,west?'west':'east',0,inner,inner+(west?.8:-.8),5,false,court.id));
}
// Northern wing: two large stone halls have a second doorway into the gate
// hall and corner suites. This gives combat routes beyond single dead ends.
const northDoors=[[-56,3.6],[-26,5],[0,5.6],[26,5],[56,3.6]];
wall('Nordflügel Raumfront','x',-33,-69.2,69.2,northDoors.map(([x,w])=>[x-w/2,x+w/2]));
for(const x of [-43,-9,9,43]) {
  const z=Math.abs(x)===43?-40:-45,width=3.6;
  wall('Nordflügel Saalverbindung','z',x,-59.2,-33.3,[[z-width/2,z+width/2]]);
  doorway('Seiteneingang Nordsaal','z',x,z,width);
}
for(const [x,width] of northDoors)doorway(x===0?'Nordtorhalle':Math.abs(x)===26?'Eingang Nordsaal':'Eingang Nordsuite','x',x,-33,width);
for(const sign of [-1,1]) {
  const a=sign<0?-69.2:43.3,b=sign<0?-43.3:69.2,c=(a+b)/2,name=sign<0?'Nordwest':'Nordost';
  wall(`${name} Suite`,'x',-46,a,b,[[c-1.8,c+1.8]]);doorway(`${name} Hinterkammer`,'x',c,-46);
  room(`${name}-rear`,`${name}kammer hinten`,a,b,-59.2,-46.3);
  room(`${name}-front`,`${name}kammer vorn`,a,b,-45.7,-33.3);
}
room('west-hall','Großer Westsaal',-42.7,-9.3,-59.2,-33.3,'great-hall');
room('east-hall','Großer Ostsaal',9.3,42.7,-59.2,-33.3,'great-hall');
room('north-gate','Nordtorhalle',-8.7,8.7,-59.2,-33.3,'gate');
room('north-gallery','Nördlicher Wandelgang',-69.2,69.2,-32.7,-27,'corridor');
for(const [a,b] of [[-70,-43],[-43,-9],[-9,9],[9,43],[43,70]])floor(a,b,-60,-33,Math.abs(a)===43?'slate':'flagstone');
floor(-70,70,-33,-27,'slate','corridor');
// Southern wing has differently proportioned chambers and three rear suites.
// The transverse room links give a second route parallel to the outer gallery.
const southSplits=[-45,-22,-8,8,33,50],southBounds=[-69.2,...southSplits,69.2];
const southDoors=[[-57,3.6],[-33.5,3.6],[-15,3.6],[0,5.6],[20.5,4.2],[41.5,3.6],[59.5,3.6]];
wall('Südflügel Raumfront','x',33,-69.2,69.2,southDoors.map(([x,w])=>[x-w/2,x+w/2]));
for(const x of southSplits) {
  wall('Südflügel Raumverbindung','z',x,33.3,59.2,[[39.2,42.8]]);
  doorway('Verbindung Südzimmer','z',x,41);
}
for(const [x,width]of southDoors)doorway(x===0?'Südtorhalle':'Eingang Südzimmer','x',x,33,width);
for(let i=0;i<southBounds.length-1;i++) {
  const a=southBounds[i]+(i?.3:0),b=southBounds[i+1]-(i<southBounds.length-2?.3:0),c=(a+b)/2;
  const role=i===3?'gate':'chamber',name=i===3?'Südtorhalle':`Südliche Kammer ${i<3?i+1:i}`;
  if([0,1,6].includes(i)) {
    wall(`${name} Hinterkammer`,'x',47,a,b,[[c-1.8,c+1.8]]);doorway(`${name} Hinterkammer`,'x',c,47);
    room(`south-${i}-front`,`${name} vorn`,a,b,33.3,46.7);
    room(`south-${i}-rear`,`${name} hinten`,a,b,47.3,59.2);
  } else room(i===3?'south-gate':`south-${i}`,name,a,b,33.3,59.2,role);
}
room('south-gallery','Südlicher Wandelgang',-69.2,69.2,27,32.7,'corridor');
floor(-70,70,27,33,'slate','corridor');
const southFloorBounds=[-70,...southSplits,70];
for(let i=0;i<southFloorBounds.length-1;i++)floor(southFloorBounds[i],southFloorBounds[i+1],33,60,i%3===0?'slate':'flagstone');
// Side wings contain three linked rooms each. Six-metre galleries join the
// north and south corridors around both courts without requiring an outdoor run.
for(const sign of [-1,1]) {
  const name=sign<0?'West':'Ost',x=sign*49,a=sign<0?-69.2:49.3,b=sign<0?-49.3:69.2;
  wall(`${name}flügel Raumfront`,'z',x,-27,27,[[-19.8,-16.2],[-1.8,1.8],[16.2,19.8]]);
  for(const z of [-27,-9,9,27]) {
    const connecting=Math.abs(z)===9,c=(a+b)/2;
    wall(`${name}flügel Raumteiler`,'x',z,a,b,connecting?[[c-1.8,c+1.8]]:[]);
    if(connecting)doorway(`${name}liche Kammerverbindung`,'x',c,z);
  }
  for(const [i,z]of [-18,0,18].entries()) {
    doorway(`Eingang ${name}kammer ${i+1}`,'z',x,z);
    room(`${name}-chamber-${i}`,`${name}kammer ${i+1}`,a,b,z-8.7,z+8.7);
    floor(sign<0?-70:49,sign<0?-49:70,z-9,z+9,i===1?'slate':'flagstone');
  }
  room(`${name}-gallery`,`${name}licher Wandelgang`,sign<0?-48.7:43,sign<0?-43:48.7,-27,27,'corridor');
  floor(sign<0?-49:43,sign<0?-43:49,-27,27,'slate','corridor');
}
// Central cross-hall makes the two courts distinct and provides a sheltered
// route from gate to gate, with open portals instead of overhead lintels.
for(const z of [-10,10]) {
  wall('Mittelhalle Portalwand','x',z,-8.2,8.2,[[-3,3]]);
  doorway('Portal Mittelhalle','x',0,z,6);
}
room('central-north','Nördliche Mittelgalerie',-8.2,8.2,-27,-10.3,'corridor');
room('central-cross','Große Mittelhalle',-8.2,8.2,-9.7,9.7,'hall');
room('central-south','Südliche Mittelgalerie',-8.2,8.2,10.3,27,'corridor');
floor(-9,9,-27,-10,'slate','corridor');floor(-9,9,-10,10,'flagstone','hall');floor(-9,9,10,27,'slate','corridor');
// The tower ground floors are genuine connected rooms, not closed decorative
// cylinders. Square stone plinths carry the octagonal upper stages. A shallow
// entry niche preserves every existing rear-room doorway and its approach.
const towers=[];
for(const north of [true,false])for(const sign of [-1,1]) {
  const cardinal=`${north?'north':'south'}${sign<0?'west':'east'}`;
  const name=`${north?'Nord':'Süd'}${sign<0?'west':'ost'}turm`;
  const partition=sign*(north?56:57),cx=sign*(north?63:63.5),cz=north?-53:53.5;
  const baseBounds=rect(sign<0?-70:partition,sign<0?partition:70,north?-60:47,north?-46:60);
  const groundBounds=rect(sign<0?-69.2:partition+.3,sign<0?partition-.3:69.2,north?-59.2:47.3,north?-46.3:59.2);
  const priorId=north?`${sign<0?'Nordwest':'Nordost'}-rear`:`south-${sign<0?0:6}-rear`;
  const remaining=rooms.find(r=>r.roomId===priorId);
  if(sign<0)remaining.minX=partition+.3;else remaining.maxX=partition-.3;
  wall(`${name} Erdgeschosswand`,'z',partition,north?-59.2:49.2,north?-48.2:59.2,[[cz-1.8,cz+1.8]]);
  doorway(`${name} Zugang`,'z',partition,cz,3.6);
  const roomId=`tower-${cardinal}`;
  room(roomId,`${name} · Erdgeschoss`,groundBounds.minX,groundBounds.maxX,groundBounds.minZ,groundBounds.maxZ,'tower');
  const radius=north?7.25:6.7;
  const footprintPoints=Array.from({length:8},(_,i)=>{
    const angle=Math.PI/8+i*Math.PI/4;return[cx+Math.cos(angle)*radius,cz+Math.sin(angle)*radius];
  });
  towers.push({id:`castle-${cardinal}-tower`,name,x:cx,z:cz,radius,height:towerHeight,wallThickness:.6,capHeight:towerHeight-1.1,capThickness:.24,baseBounds,groundBounds,
    roomId,footprintPoints,entrance:{name:`${name} Zugang`,axis:'z',x:partition,z:cz,width:3.6,depth:innerThickness}});
}
const mainGate={name:'Großes Südtor',x:0,z:59.6,side:'south',width:5.6,height:8.8,springHeight:4,archRise:2.8,depth:1.8};
// Window boundary is the room-facing wall surface. Renderers carve the actual
// opening and add iron bars; the shared wall collider keeps a barred aperture
// impassable to players and projectiles without turning it into another gate.
function window(side,center,boundary,width=1.8) {
  const horizontal=side==='north'||side==='south';
  windows.push({name:`Vergittertes Schlossfenster ${side} ${center}`,side,center,boundary,
    x:horizontal?center:boundary,z:horizontal?boundary:center,width,height:1.45,sillHeight:1.05,
    wallThickness:outerThickness,glazed:false,barred:true});
}
for(const side of ['north','south'])for(const x of [-63,-53,-37,-26,-15,-4.5,4.5,15,26,37,54,64])window(side,x,side==='north'?-59.19:59.19);
for(const side of ['west','east'])for(const z of [-53,-39,-18,0,18,39,53])window(side,z,side==='west'?-69.19:69.19);
// Repeated but not door-adjacent corridor sconces. Their normals point from
// the actual wall face into walkable interior space, never into an open court.
for(const w of walls) {
  let normal;
  if(w.name.startsWith('Nordflügel Raumfront'))normal=[0,1];
  else if(w.name.startsWith('Südflügel Raumfront'))normal=[0,-1];
  else if(w.name.startsWith('Westflügel Raumfront'))normal=[1,0];
  else if(w.name.startsWith('Ostflügel Raumfront'))normal=[-1,0];
  else if(w.name.startsWith('Westhof Mittelgangwand'))normal=[1,0];
  else if(w.name.startsWith('Osthof Mittelgangwand'))normal=[-1,0];
  else continue;
  const horizontal=normal[1]!==0,from=horizontal?w.minX:w.minZ,to=horizontal?w.maxX:w.maxZ,length=to-from;
  const count=Math.max(0,Math.floor((length-3)/10)+1);
  for(let i=0;i<count;i++) {
    const along=from+(i+.5)*length/count;
    if(!horizontal&&Math.abs(Math.abs(along)-10)<1.3)continue;
    torches.push({id:`castle-torch-${torches.length+1}`,x:horizontal?along:normal[0]>0?w.maxX:w.minX,
      z:horizontal?normal[1]>0?w.maxZ:w.minZ:along,normal,height:1.9});
  }
}
const entryRoute=e=>{
  const sign=e.side==='north'||e.side==='west'?-1:1,horizontal=e.side==='north'||e.side==='south';
  return {name:e.name,from:horizontal?[e.center,e.boundary+sign*1.5]:[e.boundary+sign*1.5,e.center],
    to:horizontal?[e.center,e.boundary-sign*1.5]:[e.boundary-sign*1.5,e.center]};
};
const courtyardPoints=courtyards.map(c=>[(c.minX+c.maxX)/2,(c.minZ+c.maxZ)/2]);
const outerLoop=[[-46,-30],[46,-30],[46,30],[-46,30],[-46,-30]];
// Visual wall cutaway never changes movement, sight or projectile cover. Only
// the actual perimeter gets a high collider; courtyard walls remain readable.
const physicalWalls=walls.map(w=>({...w,maxY:w.outerPerimeter?floorHeight+exteriorWallHeight:w.maxY}));
const overhead=(name,minX,maxX,minZ,maxZ,minY,maxY)=>physicalWalls.push(rect(minX,maxX,minZ,maxZ,
  {name,minY,maxY,type:'house-wall',material:'stone',projectileOnly:true}));
for(const tower of towers) {
  const b=tower.baseBounds;
  for(const z of [b.minZ+.35,b.maxZ-.35])overhead(`${tower.name} Sockelband waagerecht ${z}`,
    b.minX+.35,b.maxX-.35,z-.35,z+.35,floorHeight+wallHeight,floorHeight+wallHeight+.26);
  for(const x of [b.minX+.35,b.maxX-.35])overhead(`${tower.name} Sockelband senkrecht ${x}`,
    x-.35,x+.35,b.minZ+.70,b.maxZ-.70,floorHeight+wallHeight,floorHeight+wallHeight+.26);
  // Collision uses short axis-aligned slices of each diagonal face, rather
  // than one large box through the hollow octagonal tower or its door below.
  for(let side=0;side<8;side++) {
    const a=tower.footprintPoints[side],b=tower.footprintPoints[(side+1)%8],dx=b[0]-a[0],dz=b[1]-a[1];
    const count=Math.abs(dx)<1e-7||Math.abs(dz)<1e-7?1:Math.ceil(Math.hypot(dx,dz)/.4);
    const pad=tower.wallThickness/2;
    for(let i=0;i<count;i++) {
      const ax=a[0]+dx*i/count,bx=a[0]+dx*(i+1)/count,az=a[1]+dz*i/count,bz=a[1]+dz*(i+1)/count;
      overhead(`${tower.name} Obergeschosswand ${side}-${i}`,Math.min(ax,bx)-pad,Math.max(ax,bx)+pad,
        Math.min(az,bz)-pad,Math.max(az,bz)+pad,floorHeight+wallHeight,floorHeight+towerHeight);
    }
  }
  // A high stone terrace cap is projectile cover, never an invisible obstacle
  // on the accessible ground floor. Polygon scan strips preserve cut corners.
  const xs=tower.footprintPoints.map(p=>p[0]),minX=Math.min(...xs),maxX=Math.max(...xs),count=Math.ceil((maxX-minX)/.4);
  for(let i=0;i<count;i++) {
    const x0=minX+(maxX-minX)*i/count,x1=minX+(maxX-minX)*(i+1)/count,cx=(x0+x1)/2,zs=[];
    for(let side=0;side<8;side++) {
      const a=tower.footprintPoints[side],b=tower.footprintPoints[(side+1)%8];
      if((a[0]<=cx&&b[0]>=cx||b[0]<=cx&&a[0]>=cx)&&Math.abs(a[0]-b[0])>1e-7)
        zs.push(a[1]+(b[1]-a[1])*(cx-a[0])/(b[0]-a[0]));
    }
    overhead(`${tower.name} Wehrterrasse ${i}`,x0,x1,Math.min(...zs),Math.max(...zs),
      floorHeight+tower.capHeight-tower.capThickness/2,floorHeight+tower.capHeight+tower.capThickness/2);
  }
}
for(const side of [-1,1]) {
  const x=mainGate.x+side*(mainGate.width/2+.43);
  overhead(`Großes Südtor Oberpfeiler ${side}`,x-.43,x+.43,mainGate.z-mainGate.depth/2,mainGate.z+mainGate.depth/2,
    floorHeight+wallHeight,floorHeight+mainGate.height-.7);
}
// The main opening stays clear up to its curved arch, including at head height.
for(let i=0,count=28;i<count;i++) {
  const x0=-mainGate.width/2+mainGate.width*i/count,x1=-mainGate.width/2+mainGate.width*(i+1)/count,x=(x0+x1)/2;
  const opening=mainGate.springHeight+Math.sqrt(Math.max(0,mainGate.archRise**2-x*x));
  overhead(`Großes Südtor Bogen ${i}`,mainGate.x+x0,mainGate.x+x1,mainGate.z-mainGate.depth/2,mainGate.z+mainGate.depth/2,
    floorHeight+opening,floorHeight+mainGate.height);
}
export const CASTLE_DEFINITION=freeze({
  id:'house:schlossanlage',kind:'house',variant:'schlossanlage',label:'Schlossanlage',asset:'schlossanlage',file:null,
  procedural:true,proceduralHouse:true,architecture:'castle',fixedLayout:true,textured:true,roofless:true,solid:true,
  height:floorHeight+towerHeight,targetHeight:floorHeight+towerHeight,normalization:{scale:1,offset:[0,0,0]},
  footprint:{halfWidth:70,halfDepth:60},terrain:{padding:1.2,maxTriangleEdge:1},
  floorHeight,wallHeight,exteriorWallHeight,towerHeight,cutawayHeight:wallHeight,cutawayBounds:rect(-70,70,-60,60),
  towers,mainGate,wallThickness:outerThickness,insideHalfWidth:69.2,insideHalfDepth:59.2,entranceHalfWidth:2.8,
  interior:{halfWidth:69.2,halfDepth:59.2,minX:-69.2,maxX:69.2,minZ:-59.2,maxZ:59.2,centerX:0,centerZ:0,entranceHalfWidth:2.8},
  floorBounds:rect(-70,70,-60,60),
  footprintAreas:[rect(-70,70,-60,-27),rect(-70,70,27,60),rect(-70,-43,-27,27),rect(-9,9,-27,27),rect(43,70,-27,27)],
  floorAreas:floors,courtyardBounds:courtyards[0],courtyards,
  courtyardPavingAreas,courtyardLawnAreas,rooms,roomCount:rooms.length,
  entrances,interiorDoorways:doors,windows,torches:torches.slice(0,48),circles:[],architecturalWalls:walls,walls:physicalWalls,
  qaRoutes:{openFloor:[0,53],courtyard:courtyardPoints[0],courtyards:courtyardPoints,
    entrances:entrances.filter(e=>e.exterior).map(entryRoute),courtyardEntrances:entrances.filter(e=>e.courtyard).map(entryRoute),
    rooms:doors.map(d=>({name:d.name,from:d.axis==='z'?[d.x-1.5,d.z]:[d.x,d.z-1.5],to:d.axis==='z'?[d.x+1.5,d.z]:[d.x,d.z+1.5]})),
    towers:towers.map(t=>({name:t.entrance.name,from:[t.entrance.x+(t.x<0?1.5:-1.5),t.z],to:[t.entrance.x+(t.x<0?-1.5:1.5),t.z]})),
    loop:outerLoop,loops:[outerLoop,[[0,-30],[-46,-30],[-46,30],[0,30],[0,-30]],[[0,-30],[46,-30],[46,30],[0,30],[0,-30]]],
    clearedFurniture:[]},
});
