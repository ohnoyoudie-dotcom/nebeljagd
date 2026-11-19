import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { createObstacleSurface, OBSTACLE_COLORS } from './map/terrain-obstacles.js';

const palettes={forest:['#929082','#605b48'],snow:['#78858c','#535c67'],desert:['#b88650','#755432'],swamp:['#6c7563','#454b3f']};
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
export function createTerrainObstacles(parent,{map,heightAt,biomeAt,isLand,isWater}){
 const surface=createObstacleSurface(map.landscape?.obstacles??[],{isLand,isWater,biomeAt});
 const root=new THREE.Group();root.name='Gemalte Felsrücken';parent.add(root);
 const chunks=new Map(),color=new THREE.Color();
 const relief=(x,z)=>.24*Math.sin(x*.31)*Math.cos(z*.27)+.09*Math.sin(x*.9+z*.6);
 const top=p=>heightAt(p.x,p.z)+p.h+relief(p.x,p.z);
 const put=(vertices,colors)=>{
  const x=vertices.reduce((sum,p)=>sum+p[0],0)/3,z=vertices.reduce((sum,p)=>sum+p[2],0)/3,k=`${Math.floor(x/64)},${Math.floor(z/64)}`;
  if(!chunks.has(k))chunks.set(k,{positions:[],colors:[],x:(Math.floor(x/64)+.5)*64,z:(Math.floor(z/64)+.5)*64});
  const c=chunks.get(k);c.positions.push(...vertices.flat());c.colors.push(...colors.flat());
 };
 for(const tri of surface.triangles){
  const vertices=tri.map(p=>[p.x,top(p),p.z]),colors=tri.map(p=>{color.set(OBSTACLE_COLORS[p.biome]);color.multiplyScalar(.94+hash(Math.floor(p.x/4),Math.floor(p.z/4))*.13);return color.toArray();});
  put([vertices[0],vertices[2],vertices[1]],[colors[0],colors[2],colors[1]]);
 }
 for(const [a,b] of surface.edges){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.0001)continue;
  let nx=-dz/len,nz=dx/len;const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2;
  if(surface.sample(mx+nx*.2,mz+nz*.2).d>0){nx=-nx;nz=-nz;}
  const levels=[0,.10,.38,.68,.9,1];
  const point=(p,t)=>{const bulge=Math.sin(t*Math.PI)*(.16+.13*Math.sin(p.x*.9+p.z*.7));return[p.x+nx*bulge,heightAt(p.x,p.z)-.08+(top(p)-heightAt(p.x,p.z)+.08)*t,p.z+nz*bulge];};
  for(let i=0;i<levels.length-1;i++){
   const t=levels[i],u=levels[i+1],v=[point(a,t),point(b,t),point(b,u),point(a,u)];
   const colors=[a,b,b,a].map((p,j)=>{const y=j<2?t:u;color.set(palettes[p.biome][y<.12?1:0]);color.multiplyScalar(.84+.2*hash(Math.floor(p.x*.7),Math.floor(p.z*.7))+y*.13);if(y>.9)color.lerp(new THREE.Color(OBSTACLE_COLORS[p.biome]),(y-.9)*6);return color.toArray();});
   put([v[0],v[1],v[2]],[colors[0],colors[1],colors[2]]);put([v[0],v[2],v[3]],[colors[0],colors[2],colors[3]]);
  }
 }
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide});
 material.onBeforeCompile=s=>{
  s.vertexShader='varying vec3 vRidge;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRidge=position;');
  s.fragmentShader=`varying vec3 vRidge;
   float ridgeHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   vec2 ridgeCell(vec2 p){vec2 cell=floor(p);float first=20.,second=20.,id=0.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec2 q=cell+vec2(float(x),float(y));vec2 center=q+vec2(.2)+vec2(ridgeHash(q),ridgeHash(q+19.3))*.6;float d=length(center-p);if(d<first){second=first;first=d;id=ridgeHash(q);}else second=min(second,d);}return vec2(second-first,id);}
   float ridgeNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ridgeHash(i),ridgeHash(i+vec2(1,0)),f.x),mix(ridgeHash(i+vec2(0,1)),ridgeHash(i+vec2(1,1)),f.x),f.y);}
  `+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=vRidge;float n=ridgeNoise(p.xz*.75);float upright=1.-abs(normalize(cross(dFdx(vRidge),dFdy(vRidge))).y);
   // Broad strata and broken seams, not a stretched brick texture.
   float strata=abs(sin(p.y*5.6+n*.8));float seam=1.-smoothstep(.025,.12,strata);
   float chips=ridgeNoise(vec2(p.x+p.z*.71,p.y)*5.2);
   float broad=ridgeNoise(p.xz*.27+p.y*.17);
   vec3 face=abs(normalize(cross(dFdx(vRidge),dFdy(vRidge))));
   vec2 rockUV=face.x>face.z?p.zy:p.xy;
   vec2 cells=ridgeCell(rockUV*vec2(.72,1.1)+vec2(n*.17,0.));
   float fracture=1.-smoothstep(.012,.055,cells.x);
   float rockShade=.83+cells.y*.32-fracture*.27;
   float capShade=.83+broad*.26+ridgeNoise(p.xz*3.)*.08;
   diffuseColor.rgb*=mix(capShade,rockShade,upright)+(chips-.5)*.09-seam*.07*upright;
  `);
 };material.customProgramCacheKey=()=> 'painted-ridge-strata-v1';
 for(const chunk of chunks.values()){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(chunk.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(chunk.colors,3));const smoothGeometry=mergeVertices(geometry,.0001);geometry.dispose();smoothGeometry.computeVertexNormals();smoothGeometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(smoothGeometry,material);mesh.name='Felsrücken · Erde und Biomkappe';mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);chunk.mesh=mesh;
 }
 // Edge stones are small accents. The ridge itself is one joined surface.
 const count=Math.min(1200,Math.floor(surface.edges.length/5)),stones=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,1),new THREE.MeshStandardMaterial({roughness:.95}),count),dummy=new THREE.Object3D();
 stones.name='Lockere Steine am Felsfuß';stones.castShadow=stones.receiveShadow=true;
 for(let i=0;i<count;i++){
  const [a,b]=surface.edges[Math.floor(i*surface.edges.length/count)],x=(a.x+b.x)/2,z=(a.z+b.z)/2,v=hash(x,z),size=.16+v*.3;
  dummy.position.set(x,heightAt(x,z)+size*.35,z);dummy.rotation.set(v,hash(z,x)*6,v*.4);dummy.scale.set(size*1.3,size*.7,size);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);stones.setColorAt(i,new THREE.Color(palettes[a.biome][0]));
 }
 if(count)root.add(stones);
 // Embedded outcrops break the silhouette of the earth face without stacking
 // independent boulders into the traversable outline.
 const outcrops=[];let spacing=0;
 for(const [a,b] of surface.edges){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);spacing+=len;
  if(spacing<2.1||outcrops.length>=1800)continue;spacing=0;
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2,seed=hash(x,z);if(seed<.22)continue;
  let nx=-dz/(len||1),nz=dx/(len||1);if(surface.sample(x+nx*.2,z+nz*.2).d>0){nx=-nx;nz=-nz;}
  outcrops.push({x,z,nx,nz,seed,h:(a.h+b.h)/2,biome:a.biome});
 }
 const outcropMat=material.clone();outcropMat.vertexColors=false;outcropMat.onBeforeCompile=material.onBeforeCompile;outcropMat.customProgramCacheKey=material.customProgramCacheKey;
 const outcropGeometry=new THREE.DodecahedronGeometry(1,1),outcropPos=outcropGeometry.attributes.position;
 for(let i=0;i<outcropPos.count;i++){const x=outcropPos.getX(i),y=outcropPos.getY(i),z=outcropPos.getZ(i),scale=1+.13*Math.sin(x*11+y*7+z*9);outcropPos.setXYZ(i,x*scale,y*scale,z*scale);}outcropGeometry.computeVertexNormals();
 const outcropMesh=new THREE.InstancedMesh(outcropGeometry,outcropMat,outcrops.length);outcropMesh.name='Eingelagerte Felsplatten';outcropMesh.castShadow=outcropMesh.receiveShadow=true;
 outcrops.forEach((p,i)=>{dummy.position.set(p.x-p.nx*.12,heightAt(p.x,p.z)+p.h*(.28+p.seed*.37),p.z-p.nz*.12);dummy.rotation.set(.08*Math.sin(i),Math.atan2(p.nx,p.nz),.12*Math.cos(i));dummy.scale.set(.65+p.seed*.6,.65+p.h*.18,.33);dummy.updateMatrix();outcropMesh.setMatrixAt(i,dummy.matrix);outcropMesh.setColorAt(i,new THREE.Color(palettes[p.biome][0]).multiplyScalar(.93+p.seed*.2));});
 if(outcrops.length)root.add(outcropMesh);
 const obstacles=surface.edges.map(([a,b])=>({type:'terrainRidge',objectKind:'rock',corners:[{x:a.x,z:a.z},{x:b.x,z:b.z}],minX:Math.min(a.x,b.x)-.05,maxX:Math.max(a.x,b.x)+.05,minZ:Math.min(a.z,b.z)-.05,maxZ:Math.max(a.z,b.z)+.05,minY:Math.min(heightAt(a.x,a.z),heightAt(b.x,b.z)),maxY:Math.max(top(a),top(b))}));
 function resolveMovement(p,radius=.42){
  if(!surface.triangles.length)return p;
  for(let i=0;i<10;i++){
   const s=surface.sample(p.x,p.z);if(s.d<=-radius)break;
   const e=.15,gx=surface.sample(p.x+e,p.z).d-surface.sample(p.x-e,p.z).d,gz=surface.sample(p.x,p.z+e).d-surface.sample(p.x,p.z-e).d,len=Math.hypot(gx,gz);
   if(len>.001){const distance=Math.max(.15,Math.min(3,s.d+radius+.03));p.x-=gx/len*distance;p.z-=gz/len*distance;}
   else break;
  }
  // A teleport/spawn deep inside a flat cap still resolves to a real outer edge.
  if(surface.sample(p.x,p.z).d>-radius){
   let nearest=null,distance=Infinity;
   for(const [a,b] of surface.edges){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1))),x=a.x+dx*t,z=a.z+dz*t,d=Math.hypot(p.x-x,p.z-z);if(d<distance){distance=d;nearest={x,z,dx,dz};}}
   if(nearest){let nx=-nearest.dz,nz=nearest.dx,len=Math.hypot(nx,nz)||1;nx/=len;nz/=len;if(surface.sample(nearest.x+nx*.2,nearest.z+nz*.2).d>0){nx=-nx;nz=-nz;}p.x=nearest.x+nx*(radius+.12);p.z=nearest.z+nz*(radius+.12);}
  }
  return p;
 }
 function traceProjectile(start,end,radius=.06,accepts=null){
  if(!surface.triangles.length)return null;
  const collider={type:'terrainRidge',objectKind:'rock'};if(accepts&&!accepts(collider))return null;
  const dx=end.x-start.x,dz=end.z-start.z,dy=(end.y??0)-(start.y??0),length=Math.hypot(dx,dz,dy),steps=Math.max(1,Math.ceil(length/.15));
  const occupied=t=>{const x=start.x+dx*t,z=start.z+dz*t,y=(start.y??0)+dy*t,s=surface.sample(x,z),ground=heightAt(x,z);return s.d>=-radius&&y+radius>=ground&&y-radius<=ground+s.h+relief(x,z);};
  for(let i=0;i<=steps;i++)if(occupied(i/steps)){
   let lo=Math.max(0,(i-1)/steps),hi=i/steps;for(let j=0;j<9;j++){const t=(lo+hi)/2;if(occupied(t))hi=t;else lo=t;}
   const point={x:start.x+dx*hi,y:(start.y??0)+dy*hi,z:start.z+dz*hi},gx=surface.sample(point.x+.1,point.z).d-surface.sample(point.x-.1,point.z).d,gz=surface.sample(point.x,point.z+.1).d-surface.sample(point.x,point.z-.1).d,n=Math.hypot(gx,gz)||1;
   return{t:hi,point,normal:{x:-gx/n,y:0,z:-gz/n},collider,type:'terrainRidge'};
  }return null;
 }
 return{root,surface,obstacles,resolveMovement,traceProjectile,update(player,range=125){for(const c of chunks.values())c.mesh.visible=Math.hypot(c.x-player.x,c.z-player.z)<range+64;},stats:{strokes:map.landscape?.obstacles?.length??0,triangles:surface.triangles.length,chunks:chunks.size},dispose(){root.traverse(o=>{o.geometry?.dispose();});material.dispose();outcropMat.dispose();if(!outcrops.length)outcropGeometry.dispose();stones.material.dispose();if(!count)stones.geometry.dispose();root.removeFromParent();}};
}
