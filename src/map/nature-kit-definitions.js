/** Original project-native scenery. Dimensions and collision are metres. */
const definitions=[];
const circle=(x,z,radius,maxY)=>({x,z,radius,minY:0,maxY});
const wall=(minX,maxX,minZ,maxZ,maxY,minY=0)=>({minX,maxX,minZ,maxZ,minY,maxY,type:'nature'});
function add(variant,label,form,biome,width,depth,height,extra={}){
 definitions.push({id:`nature:${variant}`,kind:'nature',variant,label,form,biome,asset:variant,file:null,
 procedural:true,natureKit:true,height,targetHeight:height,footprint:{halfWidth:width/2,halfDepth:depth/2},
 walls:[],circles:[],normalization:{scale:1,offset:[0,0,0]},...extra});
}
for(const [biome,label] of [['forest','Wald'],['snow','Schnee'],['desert','Sandstein']]){
 for(const [form,name,w,d,h] of [['boulders','Felsgruppe',5.4,3.4,2.5],['ridge','Felsvorsprung',6.6,3.2,3.5],['rubble','Geröll',3.8,2.9,.65]]){
  const rocks=form==='ridge'?[[-2.05,0,1.15,2.4],[-.3,.1,1.3,3.4],[1.65,-.15,1.25,2.8]]:form==='boulders'?[[-1.1,.1,1.1,1.65],[.65,-.2,1.35,2.35],[1.6,.8,.5,.7]]:[];
  add(`${biome}-${form}`,`${name} · ${label}`,form,biome,w,d,h,{rocks,circles:rocks.map(([x,z,r,h])=>circle(x,z,r*.83,h))});
 }
}
add('forest-fern','Farnbüschel','fern','forest',2,2,.95);
add('forest-shrub','Laubgebüsch','shrub','forest',2.6,2.1,1.45);
add('dry-scrub','Trockene Sträucher','scrub','desert',2.3,1.7,1.2);
add('cactus-tall','Kaktus · Verzweigt','cactus','desert',2.3,1.8,3.5,{circles:[circle(0,0,.32,3.3)]});
add('cactus-cluster','Kakteen · Kleine Gruppe','cactusCluster','desert',2.6,2,1.4);
add('dead-tree','Dürrer Baum','deadTree','desert',4,3,4.8,{circles:[circle(0,0,.36,4.5)]});
add('exposed-roots','Wurzelstock · Freiliegende Wurzeln','roots','forest',3.2,2.8,1.25,{circles:[circle(0,0,.4,1.2)]});
for(const [biome,label] of [['forest','Moosstein'],['snow','Froststein'],['desert','Sandstein']]){
 add(`${biome}-arch`,`Verwitterter Torbogen · ${label}`,'arch',biome,5.6,2.4,4.2,{walls:[wall(-2.6,-1.65,-.65,.65,3.3),wall(1.65,2.6,-.65,.65,3.3),{...wall(-1.7,1.7,-.55,.55,4.2,3.1),projectileOnly:true}]});
 add(`${biome}-pillar`,`Säulenreste · ${label}`,'pillar',biome,2.6,2,2.7,{circles:[circle(-.35,0,.65,2.5)]});
 add(`${biome}-ruin`,`Mauerrest · ${label}`,'ruin',biome,4.5,2.4,2.1,{walls:[wall(-1.9,1.9,-.48,.48,1.6)]});
}
add('wood-signpost','Wegweiser · Holz','signpost','forest',1.9,.8,2.4,{circles:[circle(0,0,.14,2.4)]});
add('path-lantern','Weglaterne · Warmes Licht','lantern','forest',1.4,1,2.9,{circles:[circle(-.25,0,.13,2.8)]});
add('plank-walkway','Holzsteg · Bodenelement','walkway','forest',2.4,4.2,.2);
add('broken-fence','Zaunrest · Gebrochen','fence','forest',3.6,1.2,1.5,{walls:[wall(-1.65,-1.35,-.18,.18,1.5),wall(1.35,1.65,-.18,.18,.9)]});
export const NATURE_KIT_DEFINITIONS=Object.freeze(definitions.map(d=>Object.freeze({...d,solid:Boolean(d.circles.length||d.walls.length)})));
export const getNatureDefinition=variant=>NATURE_KIT_DEFINITIONS.find(d=>d.variant===variant)??null;
