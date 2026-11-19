// Shared, deterministic document -> surface. Ordered capsule strokes allow true
// subtraction: erasing a passage never deletes the rest of a mountain.
export const OBSTACLE_GRID = 1.5;
export const OBSTACLE_LIMITS = { strokes:512, points:512, cells:100000 };
export const OBSTACLE_BIOMES = ['auto','forest','snow','desert','swamp'];
export const OBSTACLE_COLORS = {forest:'#506044',snow:'#bdcbd0',desert:'#ae8050',swamp:'#424c3b',woodland:'#263f2c'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(x,z)=>`${x},${z}`;
// World-anchored broad relief: reproducible after export and across adjoining
// brush strokes. The editor height is the baseline, not a flat upper plane.
export function obstacleRelief(x,z){return 1+.24*Math.sin(x*.115+Math.sin(z*.071))+.14*Math.cos(z*.157-x*.049)+.055*Math.sin(x*.39+z*.21);}

export function obstacleBiome(biome) { return ['snow'].includes(biome)?'snow':['desert','dunes','sand'].includes(biome)?'desert':['marsh','swamp','mud'].includes(biome)?'swamp':'forest'; }
export function validateTerrainObstacles(strokes,bounds){
 const errors=[];
 if(!Array.isArray(strokes)||strokes.length>OBSTACLE_LIMITS.strokes)return ['Geländehindernisse: höchstens 512 Pinselstriche.'];
 const ids=new Set();let budget=0,forestArea=0;
 for(const s of strokes){
  if(!s||typeof s!=='object'){errors.push('Ungültiger Gelände-Pinselstrich.');continue;}
  if(Object.keys(s).some(k=>!['id','points','radius','height','biome','erase','style'].includes(k)))errors.push('Unbekannte Gelände-Eigenschaft.');
  if(typeof s.id!=='string'||!/^ridge-[a-zA-Z0-9_-]{1,70}$/.test(s.id)||ids.has(s.id))errors.push('Ungültige oder doppelte Gelände-ID.');ids.add(s.id);
  if(!Number.isFinite(s.radius)||s.radius<2||s.radius>40||!Number.isFinite(s.height)||s.height<2||s.height>10||!OBSTACLE_BIOMES.includes(s.biome)||typeof s.erase!=='boolean'||s.style!==undefined&&!['cliff','forest'].includes(s.style))errors.push('Ungültige Hindernisgröße, Höhe oder Biom.');
  if(!Array.isArray(s.points)||!s.points.length||s.points.length>OBSTACLE_LIMITS.points){errors.push('Geländestrich: 1 bis 512 Punkte erforderlich.');continue;}
  let length=0;
  for(let i=0;i<s.points.length;i++){
   const p=s.points[i];if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)){errors.push('Ungültiger Geländepunkt.');continue;}
   if(bounds&&(p[0]<bounds.minX||p[0]>bounds.maxX||p[1]<bounds.minZ||p[1]>bounds.maxZ))errors.push('Geländepunkt außerhalb der Karte.');
   if(i&&Array.isArray(s.points[i-1])&&s.points[i-1].every(Number.isFinite))length+=Math.hypot(p[0]-s.points[i-1][0],p[1]-s.points[i-1][1]);
  }
  if(!s.erase&&s.style==='forest')forestArea+=Math.PI*s.radius**2+length*s.radius*2;
  if(!s.erase)budget+=(Math.PI*(s.radius+4)**2+length*(s.radius+4)*2)/OBSTACLE_GRID**2;
 }
 if(forestArea>40000)errors.push('Dichter Wald: höchstens 40.000 m² gemalte Waldfläche pro Karte.');
 if(budget>OBSTACLE_LIMITS.cells)errors.push('Zu viel Felsfläche: vorhandene Striche verkleinern oder aufteilen.');
 return errors;
}
function segmentDistance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
export function createObstacleSurface(strokes=[],{isLand=()=>true,isWater=()=>false,biomeAt=()=> 'forest'}={}){
 const bins=new Map(),active=new Set(),g=OBSTACLE_GRID,bin=16;
 for(const s of strokes){
  const used=new Set();
  for(let i=0;i<Math.max(1,s.points.length-1);i++){
   const a=s.points[i],b=s.points[i+1]??a,r=s.radius+g*2;
   const entry={s,a,b};
   for(let x=Math.floor((Math.min(a[0],b[0])-r)/bin);x<=Math.floor((Math.max(a[0],b[0])+r)/bin);x++)for(let z=Math.floor((Math.min(a[1],b[1])-r)/bin);z<=Math.floor((Math.max(a[1],b[1])+r)/bin);z++){
    const k=key(x,z);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(entry);
   }
   if(!s.erase){
    const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/g));
    for(let j=0;j<=steps;j++){
     const cx=a[0]+(b[0]-a[0])*j/steps,cz=a[1]+(b[1]-a[1])*j/steps;
     for(let x=Math.floor((cx-r)/g);x<=Math.floor((cx+r)/g);x++)for(let z=Math.floor((cz-r)/g);z<=Math.floor((cz+r)/g);z++){
      if(Math.hypot((x+.5)*g-cx,(z+.5)*g-cz)>r+g)continue;
      used.add(key(x,z));
     }
    }
   }
  }
  for(const k of used){active.add(k);if(active.size>OBSTACLE_LIMITS.cells)throw new Error('Geländefläche überschreitet das Flächenlimit.');}
 }
 const raw=(x,z)=>{
  let d=-g*4,h=4,biome='auto',style='cliff',current=null,strokeD=-Infinity;
  const apply=()=>{if(!current)return;if(current.erase)d=Math.min(d,-strokeD);else {if(strokeD>0||strokeD>d){h=current.height;biome=current.biome;style=current.style??'cliff';}d=Math.max(d,strokeD);}};
  for(const e of bins.get(key(Math.floor(x/bin),Math.floor(z/bin)))??[]){
   if(e.s!==current){apply();current=e.s;strokeD=-Infinity;}
   const ripple=e.s.erase?0:.48*Math.sin(x*.47+Math.sin(z*.31))+.22*Math.sin(z*.83-x*.19);
   strokeD=Math.max(strokeD,e.s.radius-segmentDistance(x,z,e.a,e.b)+ripple);
  }apply();
  if(!isLand(x,z)||isWater(x,z))d=Math.min(d,-.25);
  return {x,z,d,h:h*obstacleRelief(x,z),style,biome:biome==='auto'?obstacleBiome(biomeAt(x,z)):biome};
 };
 const samples=new Map();
 function vertex(ix,iz){const k=key(ix,iz);if(!samples.has(k))samples.set(k,raw(ix*g,iz*g));return samples.get(k);}
 const triangles=[],edges=[];
 function clip(vs){
  const polygon=[],crossings=[];
  for(let i=0;i<3;i++){
   const a=vs[i],b=vs[(i+1)%3];if(a.d>0)polygon.push(a);
   if((a.d>0)!==(b.d>0)){
    const t=a.d/(a.d-b.d),p={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,d:0,h:a.h+(b.h-a.h)*t,style:a.d>0?a.style:b.style,biome:a.d>0?a.biome:b.biome};polygon.push(p);crossings.push(p);
   }
  }
  if(crossings.length===2)edges.push(crossings);
  for(let i=1;i<polygon.length-1;i++)triangles.push([polygon[0],polygon[i],polygon[i+1]]);
 }
 for(const k of active){const [x,z]=k.split(',').map(Number),a=vertex(x,z),b=vertex(x+1,z),c=vertex(x+1,z+1),d=vertex(x,z+1);clip([a,b,c]);clip([a,c,d]);}
 function sample(x,z){
  const ix=Math.floor(x/g),iz=Math.floor(z/g),u=x/g-ix,v=z/g-iz;
  if(!active.has(key(ix,iz)))return {d:-g*4,h:0,biome:'forest'};
  const a=vertex(ix,iz),b=vertex(ix+1,iz),c=vertex(ix+1,iz+1),e=vertex(ix,iz+1);
  const d=u>=v?a.d*(1-u)+b.d*(u-v)+c.d*v:a.d*(1-v)+c.d*u+e.d*(v-u);
  const h=u>=v?a.h*(1-u)+b.h*(u-v)+c.h*v:a.h*(1-v)+c.h*u+e.h*(v-u);
  const nearest=u>=v?(u>.5?(v>.5?c:b):a):(v>.5?(u>.5?c:e):a);
  return {d,h,style:nearest.style,biome:nearest.biome};
 }
 return{triangles,edges,sample,cells:active.size};
}
export function obstacleSurfaceSvg(surface){
 if(!surface.triangles.length)return '';
 const n=v=>Number(v.toFixed(2)),groups=new Map();
 for(const tri of surface.triangles){const b=tri[0].style==='forest'?'woodland':tri[0].biome;if(!groups.has(b))groups.set(b,[]);groups.get(b).push(`M${tri.map(p=>`${n(p.x)},${n(p.z)}`).join('L')}Z`);}
 const boundary=surface.edges.map(([a,b])=>`M${n(a.x)},${n(a.z)}L${n(b.x)},${n(b.z)}`).join('');
 return `<g id="terrain-obstacles" pointer-events="none"><defs><pattern id="ridge-forest-pattern" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#314732"/><circle cx="1.5" cy="2" r="1.7" fill="#233b29"/><circle cx="4.8" cy="5" r="1.4" fill="#4b6141"/></pattern></defs>${[...groups].map(([b,paths])=>`<path d="${paths.join('')}" fill="${(b==='woodland'?'url(#ridge-forest-pattern)':OBSTACLE_COLORS[b])}"/>`).join('')}<path d="${boundary}" fill="none" stroke="#292a25" stroke-width="1.3" stroke-linejoin="round"/><path d="${boundary}" transform="translate(-.3,-.3)" fill="none" stroke="#c9c0a1" stroke-opacity=".4" stroke-width=".35"/></g>`;
}
