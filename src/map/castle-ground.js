import { getHouseDefinition } from './house-builder.js';

/** Read-only world-space mask for castle surfaces. Lawn colour and cleared snow
 * are part of the placed building, never edits to the user's painted biome. */
export function createCastleGroundMask(map, {lawnsOnly=false,padding=0}={}) {
  const cells=new Map(),cellSize=32;
  for(const object of map.objects??[]) {
    if(object.kind!=='house'||object.variant!=='schlossanlage')continue;
    const definition=getHouseDefinition(object),scale=object.scale??1;
    const c=Math.cos(object.rotation??0),s=Math.sin(object.rotation??0),[x,z]=object.position;
    const areas=lawnsOnly?definition.courtyardLawnAreas??[]:[definition.floorBounds];
    for(const area of areas) {
      const hx=(area.maxX-area.minX)/2+padding,hz=(area.maxZ-area.minZ)/2+padding;
      const lx=(area.minX+area.maxX)/2,lz=(area.minZ+area.maxZ)/2;
      const px=x+scale*(c*lx+s*lz),pz=z+scale*(-s*lx+c*lz),radius=Math.hypot(hx,hz)*scale;
      const record={x:px,z:pz,c,s,hx:hx*scale,hz:hz*scale};
      for(let ix=Math.floor((px-radius)/cellSize);ix<=Math.floor((px+radius)/cellSize);ix++)
        for(let iz=Math.floor((pz-radius)/cellSize);iz<=Math.floor((pz+radius)/cellSize);iz++) {
          const key=`${ix},${iz}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(record);
        }
    }
  }
  return (x,z)=>{
    for(const area of cells.get(`${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`)??[]) {
      const dx=x-area.x,dz=z-area.z;
      if(Math.abs(area.c*dx-area.s*dz)<=area.hx&&Math.abs(area.s*dx+area.c*dz)<=area.hz)return true;
    }
    return false;
  };
}
