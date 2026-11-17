/** One-storey castle in metres. The open courtyard is deliberately absent from
 * the covered footprint, floor panels and shelter rooms. All renderers and
 * collision consumers share these walls and genuinely open passages. */
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const rect = (minX,maxX,minZ,maxZ,extra={}) => ({minX,maxX,minZ,maxZ,...extra});
const floorHeight=.18,wallHeight=3;
const walls=[],doors=[],rooms=[],floors=[];
function wall(name,axis,fixed,from,to,holes=[],external=false,thickness=external?.7:.5) {
  let edge=from;
  for(const [a,b] of [...holes,[to,to]].sort((a,b)=>a[0]-b[0])) {
    if(a>edge) walls.push(rect(...(axis==='x'?[edge,a,fixed-thickness/2,fixed+thickness/2]:[fixed-thickness/2,fixed+thickness/2,edge,a]),
      {name:`${name} ${walls.length}`,minY:0,maxY:floorHeight+wallHeight,type:'house-wall',external}));
    edge=Math.max(edge,b);
  }
}
function doorway(name,axis,x,z,width=3.2) { doors.push({name,axis,x,z,width}); }
function room(id,name,minX,maxX,minZ,maxZ,material='stone',role='chamber') {
  rooms.push(rect(minX,maxX,minZ,maxZ,{roomId:id,name,material,role}));
}
function floor(minX,maxX,minZ,maxZ,material='stone') { floors.push(rect(minX,maxX,minZ,maxZ,{material,alongZ:true})); }
function entrance(name,side,center,boundary,innerBoundary,width,exterior=false) {
  return {name,side,center,min:center-width/2,max:center+width/2,boundary,innerBoundary,depth:.9,
    exterior,courtyard:!exterior};
}
const entrances=[
  entrance('Südtor','south',0,30,29.3,5,true),
  entrance('Nordtor','north',0,-30,-29.3,4,true),
  entrance('Hofdurchgang Nord','south',0,-12,-12.7,4),
  entrance('Hofdurchgang Süd','north',0,12,12.7,5),
  entrance('Hofdurchgang West','east',0,-17,-17.7,3.6),
  entrance('Hofdurchgang Ost','west',0,17,17.7,3.6),
];
// Outer enclosure. A north and south gate connect the compound to the map.
wall('Westfassade','z',-34.65,-30,30,[],true);
wall('Ostfassade','z',34.65,-30,30,[],true);
wall('Nordfassade','x',-29.65,-34.3,34.3,[[-2,2]],true);
wall('Südfassade','x',29.65,-34.3,34.3,[[-2.5,2.5]],true);
// Courtyard-side walls, with generous openings and no lintels across the view.
wall('Hoffassade Nord','x',-12.35,-17.7,17.7,[[-2,2]],true);
wall('Hoffassade Süd','x',12.35,-17.7,17.7,[[-2.5,2.5]],true);
wall('Hoffassade West','z',-17.35,-12,12,[[-1.8,1.8]],true);
wall('Hoffassade Ost','z',17.35,-12,12,[[-1.8,1.8]],true);
// The northern wing contains two great halls, two chambers and a rear gate hall.
const northDoors=[[-29,3.2],[-14,4],[0,4],[14,4],[29,3.2]];
wall('Nordflügel Raumfront','x',-17,-34.3,34.3,northDoors.map(([x,w])=>[x-w/2,x+w/2]));
for(const x of [-24,-4,4,24]) wall('Nordflügel Raumteiler','z',x,-29.3,-17.25);
for(const [x,width] of northDoors) doorway(x===0?'Nordtorhalle':Math.abs(x)===14?'Durchgang großer Saal':'Durchgang Nordkammer','x',x,-17,width);
room('north-west-chamber','Nordwestkammer',-34.3,-24.25,-29.3,-17.25,'wood');
room('west-hall','Großer Westsaal',-23.75,-4.25,-29.3,-17.25,'stone','great-hall');
room('north-gate','Nordtorhalle',-3.75,3.75,-29.3,-17.25,'stone','gate');
room('east-hall','Großer Ostsaal',4.25,23.75,-29.3,-17.25,'stone','great-hall');
room('north-east-chamber','Nordostkammer',24.25,34.3,-29.3,-17.25,'wood');
room('north-gallery','Nördlicher Verbindungsgang',-34.3,34.3,-16.75,-12,'stone','corridor');
for(const [a,b,material] of [[-35,-24,'wood'],[-24,-4,'stone'],[-4,4,'stone'],[4,24,'stone'],[24,35,'wood']])floor(a,b,-30,-17,material);
floor(-35,35,-17,-12);
// The south gate opens through a broad hall onto the courtyard. Side rooms
// stay empty for separate editor furnishings; the ring remains traversable.
const southDoors=[[-28.5,3.2],[-13,3.2],[0,5],[13,3.2],[28.5,3.2]];
wall('Südflügel Raumfront','x',17,-34.3,34.3,southDoors.map(([x,w])=>[x-w/2,x+w/2]));
for(const x of [-22,-4,4,22])wall('Südflügel Raumteiler','z',x,17.25,29.3);
for(const [x,width] of southDoors)doorway(x===0?'Südtorhalle':'Durchgang Südkammer','x',x,17,width);
room('south-west-outer','Südwestkammer',-34.3,-22.25,17.25,29.3,'wood');
room('south-west-inner','Westliche Wachstube',-21.75,-4.25,17.25,29.3,'wood');
room('south-gate','Südtorhalle',-3.75,3.75,17.25,29.3,'stone','gate');
room('south-east-inner','Östliche Wachstube',4.25,21.75,17.25,29.3,'wood');
room('south-east-outer','Südostkammer',22.25,34.3,17.25,29.3,'wood');
room('south-gallery','Südlicher Verbindungsgang',-34.3,34.3,12,16.75,'stone','corridor');
floor(-35,35,12,17);
for(const [a,b] of [[-35,-22],[-22,-4],[-4,4],[4,22],[22,35]])floor(a,b,17,30,a===-4?'stone':'wood');
// East and west galleries connect both long horizontal corridors, creating a
// loop even when the courtyard is occupied. Two side chambers in each wing.
for(const sign of [-1,1]) {
  const name=sign<0?'West':'Ost',x=sign*22;
  wall(`${name}flügel Raumfront`,'z',x,-12,12,[[-7.6,-4.4],[4.4,7.6]]);
  const a=sign<0?-34.3:22.25,b=sign<0?-22.25:34.3;
  for(const z of [-12,0,12])wall(`${name}flügel Raumteiler`,'x',z,a,b);
  for(const z of [-6,6])doorway(`Durchgang ${name}kammer ${z<0?'Nord':'Süd'}`,'z',x,z);
  room(`${name}-north`,`${name}kammer Nord`,a,b,-11.75,-.25,'wood');
  room(`${name}-south`,`${name}kammer Süd`,a,b,.25,11.75,'wood');
  room(`${name}-gallery`,`${name}licher Verbindungsgang`,sign<0?-21.75:17,sign<0?-17:21.75,-12,12,'stone','corridor');
  floor(sign<0?-35:22,sign<0?-22:35,-12,0,'wood');
  floor(sign<0?-35:22,sign<0?-22:35,0,12,'wood');
  floor(sign<0?-22:17,sign<0?-17:22,-12,12);
}
const windows=[];
function window(side,center,boundary,width=1.8) {
  const horizontal=side==='north'||side==='south';
  windows.push({name:`Schlossfenster ${side} ${center}`,side,center,boundary,
    x:horizontal?center:boundary,z:horizontal?boundary:center,width,height:1.45,sillHeight:1.05});
}
for(const side of ['north','south'])for(const x of [-29,-19,-10,10,19,29])window(side,x,side==='north'?-29.29:29.29);
for(const side of ['west','east'])for(const z of [-23,-6,6,23])window(side,z,side==='west'?-34.29:34.29);
const entryRoute=e=>{
  const sign=e.side==='north'||e.side==='west'?-1:1,horizontal=e.side==='north'||e.side==='south';
  return {name:e.name,from:horizontal?[e.center,e.boundary+sign*1.5]:[e.boundary+sign*1.5,e.center],
    to:horizontal?[e.center,e.boundary-sign*1.5]:[e.boundary-sign*1.5,e.center]};
};
export const CASTLE_DEFINITION=freeze({
  id:'house:schlossanlage',kind:'house',variant:'schlossanlage',label:'Schlossanlage',asset:'schlossanlage',file:null,
  procedural:true,proceduralHouse:true,architecture:'castle',fixedLayout:true,textured:true,roofless:true,solid:true,
  height:floorHeight+wallHeight,targetHeight:floorHeight+wallHeight,normalization:{scale:1,offset:[0,0,0]},
  footprint:{halfWidth:35,halfDepth:30},terrain:{padding:1.2,maxTriangleEdge:1},
  floorHeight,wallHeight,wallThickness:.7,insideHalfWidth:34.3,insideHalfDepth:29.3,entranceHalfWidth:2.5,
  interior:{halfWidth:34.3,halfDepth:29.3,minX:-34.3,maxX:34.3,minZ:-29.3,maxZ:29.3,centerX:0,centerZ:0,entranceHalfWidth:2.5},
  floorBounds:rect(-35,35,-30,30),
  footprintAreas:[rect(-35,35,-30,-12),rect(-35,35,12,30),rect(-35,-17,-12,12),rect(17,35,-12,12)],
  floorAreas:floors,courtyardBounds:rect(-17,17,-12,12),rooms,roomCount:rooms.length,
  entrances,interiorDoorways:doors,windows,circles:[],architecturalWalls:walls,walls,
  qaRoutes:{openFloor:[0,24],courtyard:[0,0],entrances:entrances.filter(e=>e.exterior).map(entryRoute),
    courtyardEntrances:entrances.filter(e=>e.courtyard).map(entryRoute),
    rooms:doors.map(d=>({name:d.name,from:d.axis==='z'?[d.x-1.5,d.z]:[d.x,d.z-1.5],to:d.axis==='z'?[d.x+1.5,d.z]:[d.x,d.z+1.5]})),
    loop:[[-19.85,-14.85],[19.85,-14.85],[19.85,14.85],[-19.85,14.85],[-19.85,-14.85]],clearedFurniture:[]},
});
