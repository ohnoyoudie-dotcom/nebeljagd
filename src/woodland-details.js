import * as THREE from 'three';
import { createGroundGrassExclusion } from './meadow-ground.js';
const random=(x,z,seed=0)=>{let v=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^seed;v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967296;};

/** Decorative only: fixed world-space clusters, clear paths and house entrances,
 * no loot, collision, or changes to the saved object collection. */
export function woodlandDetailPlacements(map,{spatial,ridgeSurface=null}={}){
 if(map.landscape?.woodlandDetails===false)return [];
 const excluded=createGroundGrassExclusion(map,{padding:.7}),occupied=new Set(),result=[];
 const trees=(map.objects??[]).filter(o=>o.kind==='tree');
 for(const tree of trees){
  const [tx,tz]=tree.position,cx=Math.floor(tx/7),cz=Math.floor(tz/7),key=cx+','+cz;
  if(occupied.has(key))continue;occupied.add(key);
  const seed=random(cx,cz,473);if(seed<.36)continue;
  const biome=spatial.biomeAt(tx,tz);if(!['meadow','forest','marsh'].includes(biome))continue;
  const angle=random(cx,cz,117)*Math.PI*2,distance=2+random(cx,cz,19)*2.3;
  const x=tx+Math.cos(angle)*distance,z=tz+Math.sin(angle)*distance;
  const kind=seed>.72?'mushroom':'flower',count=kind==='mushroom'?2+Math.floor(seed*4):4+Math.floor(seed*6);
  for(let i=0;i<count;i++){
   const a=random(cx+i,cz,551)*Math.PI*2,d=Math.sqrt(random(cx,cz+i,912))*(kind==='mushroom'?.65:1.2),px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;
   if(!spatial.isLand(px,pz)||spatial.isWater(px,pz)||excluded(px,pz))continue;
   // Painted roads can be authored as soil stamps rather than path polylines.
   const covered=spatial.terrainPaint?.near(px,pz).some(s=>!['meadow','forest'].includes(s.type)&&Math.hypot(px-s.position[0],pz-s.position[1])<s.radius*.9);
   if(covered)continue;
   result.push({x:px,z:pz,kind,seed:random(cx+i,cz-i,781),scale:.7+random(cx-i,cz+i,629)*.65});
  }
  if(result.length>=5000)break;
 }
 return result;
}
export function createWoodlandDetails(parent,{map,spatial,heightAt,ridgeSurface}){
 const placements=woodlandDetailPlacements(map,{spatial,ridgeSurface}),root=new THREE.Group();root.name='Waldboden · Pilze und kleine Blumen';parent.add(root);
 const chunks=new Map(),geometries=[],materials=[],dummy=new THREE.Object3D();
 for(const p of placements){const k=Math.floor(p.x/32)+','+Math.floor(p.z/32);if(!chunks.has(k))chunks.set(k,{x:(Math.floor(p.x/32)+.5)*32,z:(Math.floor(p.z/32)+.5)*32,items:[],group:new THREE.Group()});chunks.get(k).items.push(p);}
 const stemGeometry=new THREE.CylinderGeometry(.026,.038,1,5),capGeometry=new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI*.56),petalGeometry=new THREE.SphereGeometry(1,6,4),leafGeometry=new THREE.SphereGeometry(1,6,3);
 geometries.push(stemGeometry,capGeometry,petalGeometry,leafGeometry);
 const stemMat=new THREE.MeshStandardMaterial({color:'#b6aa80',roughness:.95}),capMat=new THREE.MeshStandardMaterial({roughness:.87,side:THREE.DoubleSide}),flowerMat=new THREE.MeshStandardMaterial({roughness:.9}),leafMat=new THREE.MeshStandardMaterial({color:'#4d6d38',roughness:.95});materials.push(stemMat,capMat,flowerMat,leafMat);
 for(const chunk of chunks.values()){
  const mushrooms=chunk.items.filter(p=>p.kind==='mushroom'),flowers=chunk.items.filter(p=>p.kind==='flower');root.add(chunk.group);
  const batch=(geometry,material,count,name)=>{const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.name=name;mesh.receiveShadow=true;chunk.group.add(mesh);return mesh;};
  const stems=batch(stemGeometry,stemMat,mushrooms.length+flowers.length,'Pilzstiele und Blütenstängel'),caps=batch(capGeometry,capMat,mushrooms.length,'Kleine Pilzkappen'),petals=batch(petalGeometry,flowerMat,flowers.length*6,'Helle und violette Blüten'),leaves=batch(leafGeometry,leafMat,flowers.length*2,'Blätter am Waldboden');
  const set=(mesh,i,x,y,z,sx,sy,sz,angle=0)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,angle,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  chunk.items.forEach((p,i)=>{const h=(p.kind==='mushroom'?.26:.32)*p.scale;set(stems,i,p.x,heightAt(p.x,p.z)+h/2,p.z,p.kind==='mushroom'?1:.45,h,p.kind==='mushroom'?1:.45);});
  mushrooms.forEach((p,i)=>{const size=(.14+p.seed*.10)*p.scale;set(caps,i,p.x,heightAt(p.x,p.z)+.25*p.scale,p.z,size,size*.54,size*.9,p.seed*6);caps.setColorAt(i,new THREE.Color(p.seed>.66?'#7e699b':p.seed>.33?'#a76b47':'#d0b58b'));});
  flowers.forEach((p,i)=>{
   const y=heightAt(p.x,p.z),color=new THREE.Color(p.seed>.67?'#d5cba9':p.seed>.3?'#cbd0c0':'#9692bf'),size=.065*p.scale;
   for(let j=0;j<5;j++){const a=j*Math.PI*2/5+p.seed*6;set(petals,i*6+j,p.x+Math.cos(a)*size*.85,y+.32*p.scale,p.z+Math.sin(a)*size*.85,size,.025*p.scale,size*.7,a);petals.setColorAt(i*6+j,color);}
   set(petals,i*6+5,p.x,y+.34*p.scale,p.z,size*.38,.025,size*.38);petals.setColorAt(i*6+5,new THREE.Color('#c5a457'));
   for(let j=0;j<2;j++){const a=p.seed*6+j*2.1;set(leaves,i*2+j,p.x+Math.cos(a)*.09,y+.04,p.z+Math.sin(a)*.09,.13*p.scale,.025,.045*p.scale,a);}
  });
 }
 return{stats:{mushrooms:placements.filter(p=>p.kind==='mushroom').length,flowers:placements.filter(p=>p.kind==='flower').length,chunks:chunks.size},update(player,range=70){for(const c of chunks.values())c.group.visible=Math.hypot(player.x-c.x,player.z-c.z)<range+24;},dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}};
}
