/** Original Waldhaus layout, in metres. Art and collisions use the same source. */
const floorHeight=.18;
const box=(name,minX,maxX,minZ,maxZ,height=3,type='house-wall')=>({name,minX,maxX,minZ,maxZ,minY:0,maxY:floorHeight+height,type});
export const WALDHAUS_FURNITURE=[
 {id:'hearth',type:'fireplace',label:'Kamin',x:-5.24,z:-.65,width:.92,depth:1.8,height:2.7},
 {id:'counter',type:'counter',label:'Anrichte',x:-4.5,z:-3.65,width:2.1,depth:.85,height:1.05},
 {id:'table',type:'table',label:'Esstisch',x:-.6,z:.25,width:1.7,depth:1.25,height:.9},
 {id:'stool-n',type:'stool',label:'Hocker',x:-.6,z:-.9,width:.52,depth:.52,height:.52},
 {id:'stool-s',type:'stool',label:'Hocker',x:-.6,z:1.4,width:.52,depth:.52,height:.52},
 {id:'stool-w',type:'stool',label:'Hocker',x:-1.9,z:.25,width:.52,depth:.52,height:.52},
 {id:'bed',type:'bed',label:'Bett',x:4.65,z:-2.05,width:1.7,depth:2.6,height:1.05},
 {id:'wardrobe',type:'wardrobe',label:'Schrank',x:2.65,z:-3.75,width:1.25,depth:.65,height:1.9},
 {id:'shelves',type:'shelves',label:'Vorratsregal',x:5.22,z:1.9,width:.7,depth:2.2,height:1.85},
 {id:'chest',type:'chest',label:'Vorratstruhe',x:3.65,z:3.55,width:1.35,depth:.8,height:.8},
 {id:'barrel-a',type:'barrel',label:'Fass',x:2.5,z:.8,width:.7,depth:.7,height:.9},
 {id:'barrel-b',type:'barrel',label:'Fass',x:3.35,z:.8,width:.7,depth:.7,height:1.05},
];
const architecturalWalls=[
 box('west facade',-6,-5.7,-4.5,4.5),box('east facade',5.7,6,-4.5,4.5),
 box('north facade west',-5.7,-3.6,-4.5,-4.2),box('north facade east',-1.8,5.7,-4.5,-4.2),
 box('south facade west',-5.7,-3.8,4.2,4.5),box('south facade east',-1.6,5.7,4.2,4.5),
 box('bedroom divider north',1.5,1.8,-4.2,-3.3),
 box('room divider middle',1.5,1.8,-1.7,1.3),
 box('storage divider south',1.5,1.8,2.9,4.2),
 box('bedroom storage wall',1.8,5.7,-.15,.15),
];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const WALDHAUS_DEFINITION=freeze({
 id:'house:waldhaus',kind:'house',variant:'waldhaus',label:'Waldhaus',asset:'waldhaus',file:null,
 procedural:true,proceduralHouse:true,textured:true,roofless:true,solid:true,height:3.18,
 targetHeight:3.18,normalization:{scale:1,offset:[0,0,0]},
 footprint:{halfWidth:6,halfDepth:4.5},terrain:{padding:1.2,maxTriangleEdge:1},
 floorHeight,insideHalfWidth:5.7,insideHalfDepth:4.2,entranceHalfWidth:1.1,
 interior:{halfWidth:5.7,halfDepth:4.2,minX:-5.7,maxX:5.7,minZ:-4.2,maxZ:4.2,centerX:0,centerZ:0,entranceHalfWidth:1.1},
 floorBounds:{minX:-6,maxX:6,minZ:-4.5,maxZ:4.5},
 entrances:[
  {name:'Haupteingang',side:'south',center:-2.7,min:-3.8,max:-1.6,innerBoundary:4.2,boundary:4.5,depth:.8},
  {name:'Hinterausgang',side:'north',center:-2.7,min:-3.6,max:-1.8,innerBoundary:-4.2,boundary:-4.5,depth:.8},
 ],
 rooms:[{name:'Wohnraum',minX:-5.7,maxX:1.5,minZ:-4.2,maxZ:4.2},
  {name:'Schlafzimmer',minX:1.8,maxX:5.7,minZ:-4.2,maxZ:-.15},
  {name:'Vorratsraum',minX:1.8,maxX:5.7,minZ:.15,maxZ:4.2}],
 circles:[],architecturalWalls,
 walls:[...architecturalWalls,...WALDHAUS_FURNITURE.map(f=>({...box(f.label,f.x-f.width/2,f.x+f.width/2,f.z-f.depth/2,f.z+f.depth/2,f.height,'furniture'),fixtureId:f.id}))],
 qaRoutes:{
  entrances:[{name:'Haupteingang',from:[-2.7,6],to:[-2.7,3.2]},{name:'Hinterausgang',from:[-2.7,-6],to:[-2.7,-3.2]}],
  rooms:[{name:'Schlafzimmer',from:[.3,-2.5],to:[2.8,-2.5]},{name:'Vorratsraum',from:[.3,2.1],to:[3.2,2.1]},{name:'Wohnraum',from:[-2.7,3.3],to:[-2.7,-3.3]}],
  openFloor:[-3,1.8],
 },
});
freeze(WALDHAUS_FURNITURE);
