import * as THREE from 'three';
import { createGroundGrassExclusion } from './meadow-ground.js';
const random=(x,z,seed=0)=>{let v=Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^seed;v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967296;};

/** Decorative only: fixed world-space clusters, clear paths and house entrances,
 * no loot, collision, or changes to the saved object collection. */
export function woodlandDetailPlacements(map,{spatial,ridgeSurface=null}={}){
 if(map.landscape?.woodlandDetails===false)return [];
 const excluded=createGroundGrassExclusion(map,{padding:.7}),occupied=new Set(),result=[];
 const green=new Set(['meadow','forest','marsh']);
 const addCluster=(x,z,kind,cx,cz,salt=0)=>{
  const seed=random(cx,cz,473+salt),count=kind==='stone'?1+Math.floor(seed*2):kind==='mushroom'?2+Math.floor(seed*3):3+Math.floor(seed*4);
  let added=false;
  for(let i=0;i<count&&result.length<12000;i++){
   const a=random(cx+i,cz,551+salt)*Math.PI*2,d=Math.sqrt(random(cx,cz+i,912+salt))*(kind==='flower'?1.15:.65),px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;
   if(!spatial.isLand(px,pz)||spatial.isWater(px,pz)||!green.has(spatial.biomeAt(px,pz))||excluded(px,pz))continue;
   // Painted roads can be authored as soil stamps rather than path polylines.
   const covered=spatial.terrainPaint?.near(px,pz).some(s=>!['meadow','forest'].includes(s.type)&&Math.hypot(px-s.position[0],pz-s.position[1])<s.radius*.9);
   if(covered)continue;
   // Keep small decorations away from the vertical edge of a raised plateau.
   const edge=ridgeSurface?.sample(px,pz).d;if(Number.isFinite(edge)&&Math.abs(edge)<.5)continue;
   result.push({x:px,z:pz,kind,seed:random(cx+i,cz-i,781+salt),scale:.7+random(cx-i,cz+i,629+salt)*.65});added=true;
  }
  if(added)occupied.add(Math.floor(x/7)+','+Math.floor(z/7));
 };
 const trees=(map.objects??[]).filter(o=>o.kind==='tree');
 for(const tree of trees){
  const [tx,tz]=tree.position,cx=Math.floor(tx/7),cz=Math.floor(tz/7),key=cx+','+cz;
  if(occupied.has(key))continue;occupied.add(key);
  const seed=random(cx,cz,473);if(seed<.2||!green.has(spatial.biomeAt(tx,tz)))continue;
  const angle=random(cx,cz,117)*Math.PI*2,distance=2+random(cx,cz,19)*2.3;
  addCluster(tx+Math.cos(angle)*distance,tz+Math.sin(angle)*distance,seed>.62?'mushroom':'flower',cx,cz);
  if(result.length>=5000)break;
 }
 // Open lawns also receive occasional clusters. Most of each 12 m cell stays
 // completely empty. Hash-sorted candidates keep the global budget spatially
 // even instead of exhausting it from one side of a large map to the other.
 const bounds=map.bounds;
 if(bounds&&[bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)){
  const area=Math.max(0,(bounds.maxX-bounds.minX)*(bounds.maxZ-bounds.minZ)),cell=Math.max(12,Math.sqrt(area/50000)),candidates=[];
  for(let cx=Math.floor(bounds.minX/cell);cx<=Math.floor(bounds.maxX/cell);cx++)for(let cz=Math.floor(bounds.minZ/cell);cz<=Math.floor(bounds.maxZ/cell);cz++){
   const seed=random(cx,cz,3179);if(seed<.42)continue;
   const x=(cx+.5)*cell+(random(cx,cz,3181)-.5)*cell*.8,z=(cz+.5)*cell+(random(cx,cz,3187)-.5)*cell*.8;
   if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ||!spatial.isLand(x,z)||spatial.isWater(x,z)||!green.has(spatial.biomeAt(x,z))||occupied.has(Math.floor(x/7)+','+Math.floor(z/7)))continue;
   const kindSeed=random(cx,cz,3191),mushroomThreshold=spatial.biomeAt(x,z)==='meadow'?.9:.74;
   candidates.push({x,z,cx,cz,seed,kind:kindSeed<.2?'stone':kindSeed>mushroomThreshold?'mushroom':'flower'});
  }
  candidates.sort((a,b)=>a.seed-b.seed);
  for(const c of candidates){if(result.length>=12000)break;addCluster(c.x,c.z,c.kind,c.cx,c.cz,4000);}
 }

 return result;
}
export function createWoodlandDetails(parent,{map,spatial,heightAt,ridgeSurface}){
 const placements=woodlandDetailPlacements(map,{spatial,ridgeSurface}),root=new THREE.Group();root.name='Waldboden · Pilze und kleine Blumen';parent.add(root);
 const chunks=new Map(),geometries=[],materials=[],dummy=new THREE.Object3D();
 for(const p of placements){const k=Math.floor(p.x/32)+','+Math.floor(p.z/32);if(!chunks.has(k))chunks.set(k,{x:(Math.floor(p.x/32)+.5)*32,z:(Math.floor(p.z/32)+.5)*32,items:[],group:new THREE.Group()});chunks.get(k).items.push(p);}
 const stemGeometry=new THREE.CylinderGeometry(.026,.038,1,5),capGeometry=new THREE.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI*.56),petalGeometry=new THREE.SphereGeometry(1,6,4),leafGeometry=new THREE.SphereGeometry(1,6,3),stoneGeometry=new THREE.IcosahedronGeometry(1,1);
 geometries.push(stemGeometry,capGeometry,petalGeometry,leafGeometry,stoneGeometry);
 const stemMat=new THREE.MeshStandardMaterial({color:'#b6aa80',roughness:.95}),capMat=new THREE.MeshStandardMaterial({roughness:.87,side:THREE.DoubleSide}),flowerMat=new THREE.MeshStandardMaterial({roughness:.9}),leafMat=new THREE.MeshStandardMaterial({color:'#4d6d38',roughness:.95});const stoneMat=new THREE.MeshStandardMaterial({roughness:1});materials.push(stemMat,capMat,flowerMat,leafMat,stoneMat);
 for(const chunk of chunks.values()){
  const mushrooms=chunk.items.filter(p=>p.kind==='mushroom'),flowers=chunk.items.filter(p=>p.kind==='flower'),stones=chunk.items.filter(p=>p.kind==='stone');root.add(chunk.group);
  const batch=(geometry,material,count,name)=>{const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.visible=count>0;mesh.name=name;mesh.receiveShadow=true;chunk.group.add(mesh);return mesh;};
  const stems=batch(stemGeometry,stemMat,mushrooms.length+flowers.length,'Pilzstiele und Blütenstängel'),caps=batch(capGeometry,capMat,mushrooms.length,'Kleine Pilzkappen'),petals=batch(petalGeometry,flowerMat,flowers.length*6,'Helle und violette Blüten'),leaves=batch(leafGeometry,leafMat,flowers.length*2,'Blätter am Waldboden'),pebbles=batch(stoneGeometry,stoneMat,stones.length,'Vereinzelte kleine Kiesel');
  const set=(mesh,i,x,y,z,sx,sy,sz,angle=0)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,angle,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);};
  [...mushrooms,...flowers].forEach((p,i)=>{const h=(p.kind==='mushroom'?.26:.32)*p.scale;set(stems,i,p.x,heightAt(p.x,p.z)+h/2,p.z,p.kind==='mushroom'?1:.45,h,p.kind==='mushroom'?1:.45);});
  mushrooms.forEach((p,i)=>{const size=(.14+p.seed*.10)*p.scale;set(caps,i,p.x,heightAt(p.x,p.z)+.25*p.scale,p.z,size,size*.54,size*.9,p.seed*6);caps.setColorAt(i,new THREE.Color(p.seed>.66?'#7e699b':p.seed>.33?'#a76b47':'#d0b58b'));});
  stones.forEach((p,i)=>{
   const size=(.09+p.seed*.10)*p.scale;
   set(pebbles,i,p.x,heightAt(p.x,p.z)+size*.22,p.z,size*1.25,size*.48,size*.85,p.seed*6.28);
   pebbles.setColorAt(i,new THREE.Color(['#7c8070','#999783','#696f63','#aaa38c'][Math.floor(p.seed*4)]));
  });
  flowers.forEach((p,i)=>{
   const y=heightAt(p.x,p.z),color=new THREE.Color(p.seed>.67?'#d5cba9':p.seed>.3?'#cbd0c0':'#9692bf'),size=.078*p.scale;
   for(let j=0;j<5;j++){const a=j*Math.PI*2/5+p.seed*6;set(petals,i*6+j,p.x+Math.cos(a)*size*.85,y+.32*p.scale,p.z+Math.sin(a)*size*.85,size,.025*p.scale,size*.7,a);petals.setColorAt(i*6+j,color);}
   set(petals,i*6+5,p.x,y+.34*p.scale,p.z,size*.38,.025,size*.38);petals.setColorAt(i*6+5,new THREE.Color('#c5a457'));
   for(let j=0;j<2;j++){const a=p.seed*6+j*2.1;set(leaves,i*2+j,p.x+Math.cos(a)*.09,y+.04,p.z+Math.sin(a)*.09,.13*p.scale,.025,.045*p.scale,a);}
  });
 }
 return{stats:{stones:placements.filter(p=>p.kind==='stone').length,mushrooms:placements.filter(p=>p.kind==='mushroom').length,flowers:placements.filter(p=>p.kind==='flower').length,chunks:chunks.size},update(player,range=70){for(const c of chunks.values())c.group.visible=Math.hypot(player.x-c.x,player.z-c.z)<range+24;},dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());root.removeFromParent();}};
}
