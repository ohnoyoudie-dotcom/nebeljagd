import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { getNatureDefinition } from './map/nature-kit-definitions.js';

const palettes={forest:{stone:'#77796a',cap:'#5b753e',leaf:'#527735',wood:'#69503b'},snow:{stone:'#73828d',cap:'#d9e5df',leaf:'#8ba394',wood:'#64594d'},desert:{stone:'#ac8153',cap:'#d0ad74',leaf:'#74804a',wood:'#766047'}};
/** Sculpted geometry, original vertex paint and world-independent mineral grain.
 * One merged solid batch plus at most one emissive batch per variant. */
export function createNatureModelParts(variant){
 const d=getNatureDefinition(variant);if(!d)return null;
 const p=palettes[d.biome],parts=[],glow=[],seed=[...variant].reduce((s,c)=>s+c.charCodeAt(0),0);
 let n=seed;const random=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};
 function add(g,color,position=[0,0,0],rotation=[0,0,0],emissive=false){
  g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);g.translate(...position);
  const geo=g.index?g.toNonIndexed():g.clone();g.dispose();geo.deleteAttribute('uv');
  const a=geo.attributes.position,normal=geo.attributes.normal,base=new THREE.Color(typeof color==='function'?'#ffffff':color),colors=[];
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i),grain=Math.sin(x*6.2+z*8.7+y*4.3)*.025+Math.sin(x*17.3-y*11.9)*.015;
   const shade=.88+Math.max(0,normal.getY(i))*.13+grain;const tint=typeof color==='function'?color(x,y,z,normal.getY(i)):(color===p.cap&&['arch','pillar','ruin'].includes(d.form)?new THREE.Color(p.stone).lerp(base,THREE.MathUtils.smoothstep(normal.getY(i),.3,.8)):base);colors.push(tint.r*shade,tint.g*shade,tint.b*shade);}
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));(emissive?glow:parts).push(geo);
 }
 function box(x,y,z,w,h,depth,color=p.stone,rot=0){add(new RoundedBoxGeometry(w,h,depth,1,Math.min(.075,w*.18,h*.18,depth*.18)),color,[x,y,z],[0,rot,0]);}
 function branch(a,b,r1,r2,color=p.wood){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av),g=new THREE.CylinderGeometry(r2,r1,delta.length(),9,1);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));add(g,color,av.add(bv).multiplyScalar(.5).toArray());}
 function rock(x,z,r,h,color=p.stone,cap=true){
  let g=d.form==='ridge'?new THREE.CylinderGeometry(r*.82,r, h,14,5):new THREE.IcosahedronGeometry(1,4);const a=g.attributes.position;
  for(let i=0;i<a.count;i++){if(d.form==='ridge'){const x=a.getX(i),y=a.getY(i)+h/2,z=a.getZ(i),angle=Math.atan2(z,x),t=y/h,j=1+.12*Math.sin(angle*3+seed)+.06*Math.sin(angle*7+t*5);a.setXYZ(i,x*j+.08*Math.sin(t*5),Math.max(.02,y+Math.min(t,.3)*.35*Math.sin(angle*4+seed)),z*.77*j);continue;}const u=a.getX(i),v=a.getY(i),w=a.getZ(i),j=1+.07*Math.sin(u*8+w*5+seed)+.04*Math.cos(v*13-u*7);a.setXYZ(i,u*r*j,Math.max(.015,(v+1)*.5*h)*(1+.04*Math.sin(u*5+w*9)),w*r*.76*j);}
  g.deleteAttribute('normal');g.deleteAttribute('uv');const smooth=mergeVertices(g,1e-4);g.dispose();g=smooth;g.computeVertexNormals();const stone=new THREE.Color(color),cover=new THREE.Color(p.cap);
  add(g,cap?((px,py,pz,ny)=>stone.clone().lerp(cover,THREE.MathUtils.smoothstep(ny,.15,.72)*THREE.MathUtils.smoothstep(py/h+Math.sin(px*5+pz*7)*.08,.36,.77))):color,[x,0,z],[0,.3,0]);
 }
 function leaf(a,b,width,color=p.leaf){
  const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),dir=bv.clone().sub(av),side=new THREE.Vector3(-dir.z,0,dir.x).normalize();const points=[],ids=[];
  for(let j=0;j<=6;j++){const t=j/6,c=av.clone().lerp(bv,t);c.y+=Math.sin(t*Math.PI)*width*.5;const w=Math.sin(Math.PI*t)*width;for(const sign of [-1,1])points.push(c.x+side.x*w*sign,c.y-Math.abs(sign*w)*.15,c.z+side.z*w*sign);if(j<6){const k=j*2;ids.push(k,k+1,k+2,k+1,k+3,k+2);}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(ids);g.computeVertexNormals();add(g,color);
 }
 function fern(x,z,size=1){for(let f=0;f<9;f++){const angle=f*2.399,dx=Math.cos(angle),dz=Math.sin(angle),length=(.65+random()*.35)*size;
  const end=[x+dx*length,.22*size,z+dz*length];let previous=[x,.04,z];for(let j=1;j<=8;j++){const t=j/8,point=[x+dx*length*t,.04+Math.sin(t*Math.PI)*.65*size,z+dz*length*t];branch(previous,point,.018*size*(1-t*.7),.012*size*(1-t*.7),'#748341');previous=point;}
  for(let j=1;j<8;j++){const t=j/8,stem=[x+dx*length*t,Math.sin(t*Math.PI)*.65*size,z+dz*length*t];for(const sign of [-1,1]){const reach=(1-t)*.35*size;leaf(stem,[stem[0]+dx*.12*size-dz*sign*reach,stem[1]-.10*size,stem[2]+dz*.12*size+dx*sign*reach],.055*size,f%2?'#638444':'#405f32');}}}}
 function cactus(x,z,h,r){branch([x,r,z],[x,h-r,z],r,r*.83,'#647d43');add(new THREE.SphereGeometry(r*.84,12,8),'#81904c',[x,h-r,z]);
  for(let k=0;k<9;k++){const a=k/9*Math.PI*2;branch([x+Math.cos(a)*r,.18,z+Math.sin(a)*r],[x+Math.cos(a)*r*.84,h-r,z+Math.sin(a)*r*.84],.018,.012,'#9aa269');
   for(let j=1;j<5;j++)branch([x+Math.cos(a)*r,j*h/5,z+Math.sin(a)*r],[x+Math.cos(a)*(r+.055),j*h/5+.025,z+Math.sin(a)*(r+.055)],.009,.001,'#cfba85');}}
 if(['boulders','ridge'].includes(d.form)){for(const [x,z,r,h]of d.rocks)rock(x,z,r,h);for(let i=0;i<7;i++){const a=random()*6.28,r=1.4+random();rock(Math.cos(a)*r,Math.sin(a)*r*.5,.10+random()*.17,.15+random()*.2,p.stone,false);}}
 if(d.form==='rubble'){for(let i=0;i<14;i++){const x=(random()-.5)*3,z=(random()-.5)*2.2,r=.12+random()*.32;rock(x,z,r,r*1.25,p.stone,i%4===0);}}
 if(d.form==='fern')fern(0,0);
 if(d.form==='shrub'){for(let i=0;i<12;i++){const a=i*2.4,x=Math.cos(a)*.7,z=Math.sin(a)*.6,h=.5+random()*.65;branch([0,.04,0],[x,h,z],.045,.016);for(let j=0;j<8;j++){const t=j/8;leaf([x*t,h*t,z*t],[x+(random()-.5)*.8,h+.12+(random()-.5)*.35,z+(random()-.5)*.7],.14,j%2?'#638043':'#426436');}}}
 if(d.form==='scrub'){for(let i=0;i<15;i++){const a=i*2.4,x=Math.cos(a)*.95,z=Math.sin(a)*.65,h=.5+random()*.5;branch([0,.02,0],[x,h,z],.035,.006);for(let j=0;j<3;j++)leaf([x*.7,h*.75,z*.7],[x+(random()-.5)*.4,h+.1,z+(random()-.5)*.4],.055,j%2?'#a29866':'#7d8059');}}
 if(d.form==='cactus'){cactus(0,0,3.4,.30);for(const s of [-1,1]){branch([0,1.1,0],[s*.7,1.5,0],.19,.17,'#647d43');cactus(s*.7,0,s>0?2.5:2.1,.18);}}
 if(d.form==='cactusCluster'){for(const [x,z,h,r]of [[0,0,1.35,.36],[-.72,.25,.8,.29],[.68,-.2,.9,.26]])cactus(x,z,h,r);}
 if(['deadTree','roots'].includes(d.form)){const h=d.form==='roots'?1.15:4.5;branch([0,.04,0],[.08,h*.5,0],.38,.24);branch([.08,h*.5,0],[-.13,h,0],.24,.055);
  for(let i=0;i<7;i++){const a=i*2.4,dx=Math.cos(a),dz=Math.sin(a);branch([0,.38,0],[dx*1.35,.04,dz*1.1],.13,.025);if(d.form==='deadTree'){const y=1.5+i*.35,end=[dx*(.8+random()*.6),y+.5,dz*.9];branch([.06,y,0],end,.16,.045);branch(end,[end[0]*1.22,end[1]+.65,end[2]*1.2],.045,.009);}}
 }
 if(d.form==='arch'){for(const s of [-1,1])for(let row=0;row<6;row++)box(s*2.1,row*.49+.245,0,.90,.46,1.15,p.stone,(random()-.5)*.045);
  for(let j=0;j<9;j++){const a=Math.PI*j/8;const g=new RoundedBoxGeometry(.64,.58,1.05,1,.055);add(g,j%3===0?p.cap:p.stone,[Math.cos(a)*1.95,2.6+Math.sin(a)*1.2,0],[0,0,a-Math.PI/2]);}
  rock(-2.4,.65,.28,.34,p.stone,false);rock(1.6,.85,.35,.32,p.stone,false);
 }
 if(d.form==='pillar'){box(-.35,.15,0,1.45,.3,1.45);for(let j=0;j<4;j++){add(new THREE.CylinderGeometry(.51,.55,.47,10),j%2?p.stone:p.cap,[-.35,.55+j*.47,0]);}box(-.35,2.5,0,1.28,.22,1.24,p.cap,.08);rock(.8,.5,.45,.5,p.stone,false);}
 if(d.form==='ruin'){for(let row=0;row<4;row++)for(let col=0;col<5-row;col++){const x=-1.5+col*.73+row*.16;box(x,.25+row*.44,0,.69,.41,.8,row===3?p.cap:p.stone,(random()-.5)*.08);}for(let i=0;i<5;i++)rock(.4+random()*1.3,(random()-.5)*1.2,.18+random()*.13,.3,p.stone,false);}
 if(['arch','ruin'].includes(d.form)&&d.biome==='forest'){fern(-1.8,.7,.46);for(let i=0;i<16;i++){const y=(d.form==='arch'?1.5:.6)+i*.06;leaf([-2,y,.58],[-1.6+Math.sin(i)*.2,y,.65],.08,'#516737');}}
 if(d.form==='signpost'){branch([0,0,0],[0,2.35,0],.12,.085);for(const [y,a]of [[1.95,.14],[1.5,-.2]]){box(0,y,0,1.75,.3,.12,'#987047',a);for(let i=0;i<3;i++)box(-.25+i*.22,y,.067,.15,.025,.012,'#dbc596',a);}}
 if(d.form==='lantern'){branch([-.25,0,0],[-.25,2.75,0],.11,.085);branch([-.25,2.68,0],[.48,2.68,0],.07,.06);branch([.38,2.65,0],[.38,2.35,0],.025,.025,'#454e4b');box(.38,2.02,0,.48,.08,.44,'#3d4848');box(.38,2.48,0,.54,.11,.49,'#454d45');for(const x of [.18,.58])for(const z of [-.18,.18])branch([x,2.06,z],[x,2.43,z],.027,.027,'#3a4443');add(new THREE.SphereGeometry(.17,12,8),'#ffcd77',[.38,2.25,0],[0,0,0],true);}
 if(d.form==='walkway'){for(let j=0;j<12;j++){const z=-1.9+j*.34;box((random()-.5)*.04,.10,z,2.2+(random()-.5)*.12,.15,.31,j%3?'#8c6946':'#a47b4e',(random()-.5)*.015);for(const x of [-.85,.85])add(new THREE.CylinderGeometry(.023,.023,.016,6),'#444b48',[x,.185,z]);}}
 if(d.form==='fence'){branch([-1.5,0,0],[-1.48,1.45,0],.12,.10);branch([1.5,0,0],[1.46,.85,0],.12,.09);branch([-1.5,.45,0],[1.5,.35,0],.07,.055);branch([-1.5,1.12,0],[-.2,.8,0],.07,.025);branch([1.5,.72,0],[.75,.60,0],.06,.028);branch([.2,.08,.2],[.9,.06,.5],.07,.025);}
 function finish(list,emissive){const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide,...(emissive?{emissive:'#ffb64b',emissiveIntensity:1.5}: {})});
  if(!emissive){material.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec3 vNatureSurface;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNatureSurface=position;');
   shader.fragmentShader='varying vec3 vNatureSurface;float natureHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float natureNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(natureHash(i),natureHash(i+vec2(1.,0.)),f.x),mix(natureHash(i+vec2(0.,1.)),natureHash(i+1.),f.x),f.y); }\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 mineral=vec2(vNatureSurface.x+vNatureSurface.z*.71,vNatureSurface.y+vNatureSurface.z*.33);diffuseColor.rgb*=.80+.24*natureNoise(mineral*5.)+.12*natureNoise(mineral*28.);');
  };material.customProgramCacheKey=()=> 'nature-mineral-grain-v1';}
  return {geometry,material,castShadow:!emissive,vegetationTint:false};}
 return [finish(parts,false),...(glow.length?[finish(glow,true)]:[])];
}
