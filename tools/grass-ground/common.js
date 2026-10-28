/* Nebeljagd: terrain grass settings, shared by editor and runtime. */
function reiGroundSettings(map) {
  const s = map && map.groundCover || {};
  const number = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return {
    version: 2, type: s.type === 'rei-grass' ? 'rei-grass' : 'existing',
    height: number(s.height, .85, .15, 2.0), density: number(s.version === 2 ? s.density : Number.isFinite(s.density) ? s.density * 6 : 9.6, 9.6, 2, 18),
    color: /^#[\da-f]{6}$/i.test(s.color || '') ? s.color : '#659a36',
    groundBlend: number(s.groundBlend, .35, 0, 1),
    scope: s.scope === 'all' ? 'all' : 'green',
    windEnabled: s.windEnabled !== false,
    windStrength: number(s.windStrength, .45, 0, 1),
    windSpeed: number(s.windSpeed, 1, .1, 3), windDirection: number(s.windDirection, 45, 0, 360)
  };
}
function reiRegionHasGrass(map, region, settings = reiGroundSettings(map)) {
  if (settings.type !== 'rei-grass') return false;
  if (region?.groundCover === 'none') return false;
  if (region?.groundCover === 'rei-grass') return true;
  return settings.scope === 'all' || ['meadow', 'forest', 'heath', 'marsh'].includes(region?.biome);
}
function reiPointInPolygon(x,z, points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if((a[1]>z)!==(b[1]>z) && x < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
function reiRegionAt(map,x,z) {
  for(let i=map.regions.length-1;i>=0;i--) if(reiPointInPolygon(x,z,map.regions[i].points)) return map.regions[i];
  return map.regions[0];
}
function reiSegmentDistance(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/length)):0;
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
}
function reiGrassExclusions(map) {
  // Spatial bins keep checks local even on maps with thousands of buildings.
  const size=32,bins=new Map();
  const insert=(shape,minX,minZ,maxX,maxZ)=>{
    for(let x=Math.floor(minX/size);x<=Math.floor(maxX/size);x++)
      for(let z=Math.floor(minZ/size);z<=Math.floor(maxZ/size);z++) {
        const key=x+','+z; if(!bins.has(key)) bins.set(key,[]); bins.get(key).push(shape);
      }
  };
  for(const line of [...(map.paths||[]),...(map.rivers||[])]) {
    const radius=line.width/2+.65;
    for(let i=1;i<line.points.length;i++) {
      const a=line.points[i-1],b=line.points[i];
      insert({a,b,radius},Math.min(a[0],b[0])-radius,Math.min(a[1],b[1])-radius,Math.max(a[0],b[0])+radius,Math.max(a[1],b[1])+radius);
    }
  }
  for(const obj of map.objects||[]) {
    if(!['house','chest','crate','rock','mound','shrine'].includes(obj.kind)) continue;
    const scale=obj.scale||1,tavern=obj.variant?.startsWith('tavern-');
    // Uploaded taverns are normalized by the existing loader to a <=24 m footprint.
    const extents={chest:[1.02,.77],crate:[.76,.76],rock:[1.35,1.35],shrine:[1,1],mound:obj.variant==='knoll'?[3.3,2.8]:[6.3,3.3]};
    const hx=(extents[obj.kind]?.[0]??(tavern?12.35:obj.variant==='kit-timber'?3.7:8.5))*scale;
    const hz=(extents[obj.kind]?.[1]??(tavern?12.35:obj.variant==='kit-timber'?4.0:7.5))*scale;
    const [x,z]=obj.position,rotation=obj.rotation||0,c=Math.cos(rotation),s=Math.sin(rotation),r=Math.hypot(hx,hz);
    insert({x,z,hx,hz,c,s},x-r,z-r,x+r,z+r);
  }
  return (x,z)=>{
    for(const q of bins.get(Math.floor(x/size)+','+Math.floor(z/size))||[]) {
      if(q.a) {if(reiSegmentDistance(x,z,q.a,q.b)<q.radius) return true;}
      else {const dx=x-q.x,dz=z-q.z; if(Math.abs(dx*q.c-dz*q.s)<q.hx && Math.abs(dx*q.s+dz*q.c)<q.hz)return true;}
    }
    return false;
  };
}
