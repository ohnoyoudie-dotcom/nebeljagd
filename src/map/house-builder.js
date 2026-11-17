import { WALDHAUS_DEFINITION } from './waldhaus-definition.js';

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const HOUSE_STYLES = freeze([
  { id: 'natural', label: 'Naturholz', woodTint: '#ffffff', plasterTint: '#ffffff', floorTint: '#ffffff' },
  { id: 'lime', label: 'Heller Kalk', woodTint: '#c5b7a9', plasterTint: '#fffdf4', floorTint: '#e7e0ce' },
  { id: 'ochre', label: 'Warmer Ocker', woodTint: '#ebcba7', plasterTint: '#eac17d', floorTint: '#f0d7ae' },
  { id: 'dark', label: 'Dunkles Fachwerk', woodTint: '#a3988f', plasterTint: '#d1d8c5', floorTint: '#c3b8a5' },
]);
export const HOUSE_BUILDER_VARIANTS = freeze([
  { id: 'waldhaus-small', label: 'Kleines Waldhaus', footprintWidth: 10, footprintDepth: 8 },
  { id: 'waldhaus', label: 'Waldhaus', footprintWidth: 16, footprintDepth: 12 },
  { id: 'waldhaus-town', label: 'Schmales Stadthaus', footprintWidth: 10, footprintDepth: 16 },
  { id: 'waldhaus-corner', label: 'Eckhaus · L-Form', footprintWidth: 16, footprintDepth: 14 },
  { id: 'waldhaus-hall', label: 'Großes Gasthaus', footprintWidth: 20, footprintDepth: 14 },
]);
export const isBuilderHouse = variant => HOUSE_BUILDER_VARIANTS.some(entry => entry.id === variant);
export function getHouseAppearance(object = {}) {
  const style = HOUSE_STYLES.find(entry => entry.id === object.houseStyle) ?? HOUSE_STYLES[0];
  const seed = Number.isInteger(object.houseSeed) && object.houseSeed >= 0 && object.houseSeed <= 2147483647 ? object.houseSeed : 87123;
  return { ...style, style: style.id, seed };
}

const rect = (minX, maxX, minZ, maxZ, extra = {}) => ({ minX, maxX, minZ, maxZ, ...extra });
const wall = (name, minX, maxX, minZ, maxZ, external = false) => rect(minX,maxX,minZ,maxZ,
  {name, minY:0, maxY:3.18, type:'house-wall', external});
const window = (side, center, boundary, name) => ({ name, side, center, boundary,
  x:side==='north'||side==='south'?center:boundary, z:side==='north'||side==='south'?boundary:center,
  width:1.6, height:1.4, sillHeight:1.1 });
function entrance(side, center, boundary, name) {
  const sign=side==='north'||side==='west'?-1:1;
  return {name,side,center,min:center-1.3,max:center+1.3,boundary,innerBoundary:boundary-sign*.3,depth:.8};
}
function splitWall(name, axis, fixed, from, to, holes = [], external = false) {
  const spans=[]; let edge=from;
  for(const [min,max] of holes.sort((a,b)=>a[0]-b[0])) {
    if(min>edge)spans.push([edge,min]); edge=max;
  }
  if(edge<to)spans.push([edge,to]);
  return spans.map(([a,b],i)=>axis==='x'?wall(`${name} ${i}`,a,b,fixed-.15,fixed+.15,external):wall(`${name} ${i}`,fixed-.15,fixed+.15,a,b,external));
}
function complete(meta, {areas, rooms, walls, entrances, doors = [], windows, openFloor}) {
  const hx=meta.footprintWidth/2,hz=meta.footprintDepth/2;
  return freeze({ ...WALDHAUS_DEFINITION, id:`house:${meta.id}`, variant:meta.id, asset:meta.id, label:meta.label,
    footprint:{halfWidth:hx,halfDepth:hz},floorBounds:rect(-hx,hx,-hz,hz),
    insideHalfWidth:hx-.3,insideHalfDepth:hz-.3,
    interior:{halfWidth:hx-.3,halfDepth:hz-.3,minX:-hx+.3,maxX:hx-.3,minZ:-hz+.3,maxZ:hz-.3,centerX:0,centerZ:0,entranceHalfWidth:1.3},
    floorAreas:areas,footprintAreas:meta.id==='waldhaus-corner'?[rect(-8,0,-7,7),rect(-8,8,-7,-1)]:[rect(-hx,hx,-hz,hz)],
    rooms, architecturalWalls:walls,walls,entrances,interiorDoorways:doors,windows,
    qaRoutes:{openFloor,...(meta.id==='waldhaus-corner'?{courtyard:[4,4]}:{}), entrances:entrances.map(e=>{
      const s=e.side==='north'||e.side==='west'?-1:1,alongX=e.side==='north'||e.side==='south';
      return {name:e.name,from:alongX?[e.center,e.boundary+s*1.5]:[e.boundary+s*1.5,e.center],to:alongX?[e.center,e.boundary-s*1.5]:[e.boundary-s*1.5,e.center]};
    }),rooms:doors.map(d=>({name:d.name,from:d.axis==='z'?[d.x-1.5,d.z]:[d.x,d.z-1.5],to:d.axis==='z'?[d.x+1.5,d.z]:[d.x,d.z+1.5]})),clearedFurniture:[]}
  });
}
function rectangle(meta, entrances, rooms, doors, partitions, windows, areas) {
  const hx=meta.footprintWidth/2,hz=meta.footprintDepth/2;
  const walls=[...splitWall('Nordfassade','x',-hz+.15,-hx+.3,hx-.3,entrances.filter(e=>e.side==='north').map(e=>[e.min,e.max]),true),
    ...splitWall('Südfassade','x',hz-.15,-hx+.3,hx-.3,entrances.filter(e=>e.side==='south').map(e=>[e.min,e.max]),true),
    wall('Westfassade',-hx,-hx+.3,-hz,hz,true),wall('Ostfassade',hx-.3,hx,-hz,hz,true),...partitions];
  return complete(meta,{areas:areas??[rect(-hx,hx,-hz,hz,{alongZ:true})],rooms,walls,entrances,doors,windows,openFloor:[entrances[0].center,hz-2]});
}
const small=HOUSE_BUILDER_VARIANTS[0],town=HOUSE_BUILDER_VARIANTS[2],corner=HOUSE_BUILDER_VARIANTS[3],hall=HOUSE_BUILDER_VARIANTS[4];
const definitions = new Map([['waldhaus',WALDHAUS_DEFINITION]]);
definitions.set(small.id,rectangle(small,[entrance('south',0,4,'Haupteingang')],
  [rect(-4.7,4.7,-3.7,3.7,{name:'Wohnraum'})],[],[],
  [window('north',-2.7,-3.69,'Nordfenster'),window('north',2.7,-3.69,'Nordfenster rechts'),window('west',0,-4.69,'Seitenfenster')]));
definitions.set(town.id,rectangle(town,[entrance('south',0,8,'Haupteingang'),entrance('north',0,-8,'Hinterausgang')],
  [rect(-4.7,4.7,2.15,7.7,{name:'Vorderzimmer'}),rect(-4.7,4.7,-2.15,1.85,{name:'Mittelzimmer'}),rect(-4.7,4.7,-7.7,-2.45,{name:'Hinterzimmer'})],
  [{name:'Durchgang Mittelzimmer',x:0,z:2,width:2.6,axis:'x'},{name:'Durchgang Hinterzimmer',x:0,z:-2.3,width:2.6,axis:'x'}],
  [...splitWall('Raumteiler vorn','x',2,-4.7,4.7,[[-1.3,1.3]]),...splitWall('Raumteiler hinten','x',-2.3,-4.7,4.7,[[-1.3,1.3]])],
  [window('west',5,-4.69,'Fenster Vorderzimmer'),window('east',0,4.69,'Fenster Mittelzimmer'),window('west',-5,-4.69,'Fenster Hinterzimmer')],
  [rect(-5,5,2,8,{alongZ:true}),rect(-5,5,-2.3,2,{alongZ:false}),rect(-5,5,-8,-2.3,{alongZ:true})]));
const hallDoors=[{name:'Durchgang Küche',x:3,z:-3.5,width:2.6,axis:'z'},{name:'Durchgang Kammer',x:3,z:3.5,width:2.6,axis:'z'}];
definitions.set(hall.id,rectangle(hall,[entrance('south',-3,7,'Haupteingang'),entrance('north',-3,-7,'Hinterausgang')],
  [rect(-9.7,2.85,-6.7,6.7,{name:'Großer Saal'}),rect(3.15,9.7,-6.7,-.15,{name:'Küche'}),rect(3.15,9.7,.15,6.7,{name:'Kammer'})],hallDoors,
  [...splitWall('Raumteiler','z',3,-6.7,6.7,[[-4.8,-2.2],[2.2,4.8]]),wall('Nebenraumteiler',3.15,9.7,-.15,.15)],
  [window('north',1,-6.69,'Saalfenster hinten'),window('north',6,-6.69,'Küchenfenster'),window('east',3.5,9.69,'Kammerfenster'),window('west',-3,-9.69,'Saalfenster links'),window('west',3,-9.69,'Saalfenster rechts')],
  [rect(-10,3,-7,7,{alongZ:true}),rect(3,10,-7,0,{alongZ:false}),rect(3,10,0,7,{alongZ:false})]));
// A genuine L: west wing plus northern wing. The south-east courtyard has no
// foundation, planks, collision or interior volume.
const cornerEntrances=[entrance('south',-4,7,'Haupteingang'),entrance('south',4,-1,'Hofeingang')];
const cornerWalls=[wall('Westfassade',-8,-7.7,-7,7,true),wall('Nordfassade',-7.7,8,-7,-6.7,true),wall('Ostfassade',7.7,8,-6.7,-1,true),
  ...splitWall('Hoffassade','x',-1.15,0,7.7,[[2.7,5.3]],true),wall('Innenhoffassade',-.3,0,-1,7,true),
  ...splitWall('Südfassade','x',6.85,-7.7,-.3,[[-5.3,-2.7]],true),
  ...splitWall('Flügelteiler','x',-1.15,-7.7,-.3,[[-5.3,-2.7]]),
  ...splitWall('Kammerteiler','z',1,-6.7,-1.3,[[-5.3,-2.7]])];
definitions.set(corner.id,complete(corner,{areas:[rect(-8,0,-7,7,{alongZ:true}),rect(0,8,-7,-1,{alongZ:false})],
  rooms:[rect(-7.7,-.3,-1,6.7,{name:'Westflügel'}),rect(-7.7,.85,-6.7,-1.3,{name:'Eckzimmer'}),rect(1.15,7.7,-6.7,-1.3,{name:'Nordflügel'})],
  walls:cornerWalls,entrances:cornerEntrances,doors:[{name:'Durchgang Eckzimmer',x:-4,z:-1.15,width:2.6,axis:'x'},{name:'Durchgang Nordflügel',x:1,z:-4,width:2.6,axis:'z'}],
  windows:[window('west',3,-7.69,'Fenster Westflügel'),window('north',-4,-6.69,'Fenster Eckzimmer'),window('north',4,-6.69,'Fenster Nordflügel'),window('east',-4,7.69,'Giebelfenster')],openFloor:[-4,4]}));
const cache = new Map();
export function getHouseDefinition(objectOrVariant = 'waldhaus') {
  const object = typeof objectOrVariant==='string'?{variant:objectOrVariant}:objectOrVariant??{};
  const base=definitions.get(object.variant);
  if(!base)return null;
  const mode=object.houseEntrances;
  if(mode!=='single'&&mode!=='double')return base;
  if((mode==='single'&&base.entrances.length===1)||(mode==='double'&&base.entrances.length===2))return base;
  const key=base.variant+':'+mode;if(cache.has(key))return cache.get(key);
  let walls=[...base.architecturalWalls],entrances=[...base.entrances];
  if(mode==='single') {
    for(const e of entrances.slice(1)) {
      const horizontal=e.side==='north'||e.side==='south';
      walls.push(horizontal?wall('Geschlossener Hinterausgang',e.min,e.max,Math.min(e.boundary,e.innerBoundary),Math.max(e.boundary,e.innerBoundary),true):wall('Geschlossener Hinterausgang',Math.min(e.boundary,e.innerBoundary),Math.max(e.boundary,e.innerBoundary),e.min,e.max,true));
    }
    entrances=entrances.slice(0,1);
  } else {
    const e=entrance('north',0,-base.footprint.halfDepth,'Hinterausgang');
    walls=walls.flatMap(w=>{
      if(Math.abs(w.minZ-e.boundary)>.001||Math.abs(w.maxZ-e.innerBoundary)>.001||w.minX>e.min||w.maxX<e.max)return [w];
      return [wall(w.name+' links',w.minX,e.min,w.minZ,w.maxZ,true),wall(w.name+' rechts',e.max,w.maxX,w.minZ,w.maxZ,true)];
    });
    entrances.push(e);
  }
  const result=freeze({...base,architecturalWalls:walls,walls,entrances,
    qaRoutes:{...base.qaRoutes,entrances:entrances.map(e=>{const s=e.side==='north'||e.side==='west'?-1:1,h=e.side==='north'||e.side==='south';return {name:e.name,from:h?[e.center,e.boundary+s*1.5]:[e.boundary+s*1.5,e.center],to:h?[e.center,e.boundary-s*1.5]:[e.boundary-s*1.5,e.center]};})}});
  cache.set(key,result);return result;
}
