import { getHouseDefinition } from './house-builder.js';

/** Snow exclusion for castle masonry only. Open courtyards retain their
 * actual biome, paint and snow, including after rotation and scaling. */
export function createCastleGroundMask(map, {padding=0}={}) {
  const cells=new Map(),cellSize=32;
  for(const object of map.objects??[]) {
    if(object.kind!=='house'||object.variant!=='schlossanlage')continue;
    const definition=getHouseDefinition(object),scale=object.scale??1;
    const c=Math.cos(object.rotation??0),s=Math.sin(object.rotation??0),[x,z]=object.position;
    const areas=[definition.floorBounds];
    for(const area of areas) {
      const hx=(area.maxX-area.minX)/2+padding,hz=(area.maxZ-area.minZ)/2+padding;
      const lx=(area.minX+area.maxX)/2,lz=(area.minZ+area.maxZ)/2;
      const px=x+scale*(c*lx+s*lz),pz=z+scale*(-s*lx+c*lz),radius=Math.hypot(hx,hz)*scale;
      const holes=(definition.courtyardGroundAreas??[]).map(h=>({minX:(h.minX-lx)*scale,maxX:(h.maxX-lx)*scale,minZ:(h.minZ-lz)*scale,maxZ:(h.maxZ-lz)*scale}));
      const record={x:px,z:pz,c,s,hx:hx*scale,hz:hz*scale,holes};
      for(let ix=Math.floor((px-radius)/cellSize);ix<=Math.floor((px+radius)/cellSize);ix++)
        for(let iz=Math.floor((pz-radius)/cellSize);iz<=Math.floor((pz+radius)/cellSize);iz++) {
          const key=`${ix},${iz}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(record);
        }
    }
  }
  return (x,z)=>{
    for(const area of cells.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)??[]) {
      const dx=x-area.x,dz=z-area.z;
      const lx=area.c*dx-area.s*dz,lz=area.s*dx+area.c*dz;
      if(Math.abs(lx)<=area.hx&&Math.abs(lz)<=area.hz&&!area.holes.some(h=>lx>=h.minX&&lx<=h.maxX&&lz>=h.minZ&&lz<=h.maxZ))return true;
    }
    return false;
  };
}
