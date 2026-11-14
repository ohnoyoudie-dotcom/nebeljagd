import { createCollisionIndex } from './collision.js';

/** Small, shared set of spell-created barriers. Keep the authored collision
 * index intact; rotated barriers are swept exactly in their own local frame. */
export function temporaryObstacles(world) {
  if (world.temporaryObstacles) return world.temporaryObstacles;
  const entries = new Map(), originalTrace = world.traceProjectile?.bind(world), originalResolve = world.resolveMovement?.bind(world);
  function local(p, e) { const x = p.x-e.center.x, z=p.z-e.center.z; return {x:x*e.cos-z*e.sin,y:(p.y??e.center.y)-e.center.y,z:x*e.sin+z*e.cos}; }
  function global(p, e) { return {x:e.center.x+p.x*e.cos+p.z*e.sin,y:e.center.y+(p.y??0),z:e.center.z-p.x*e.sin+p.z*e.cos}; }
  const registry = {
    add(id, { center, angle, width, depth, height, ownerId, targetId, alive = () => true }) {
      if(entries.has(id))throw new Error('Duplicate temporary barrier: '+id);
      const e={center:{...center},cos:Math.cos(angle),sin:Math.sin(angle)};
      const collider={minX:-width/2,maxX:width/2,minZ:-depth/2,maxZ:depth/2,minY:0,maxY:height};
      const corners=[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]].map(([x,z])=>global({x,z},e));
      e.body={type:'runeWall',objectKind:'runeWall',ownerId,ownerSeeThrough:true,objectId:targetId,destructibleId:targetId,
        minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z)),
        minY:center.y,maxY:center.y+height,corners,get destroyed(){return !alive();}};
      e.index=createCollisionIndex([], [collider]); entries.set(id,e); return e.body;
    },
    remove(id) { entries.delete(id); },
    list() { return [...entries.values()].map(e=>e.body).filter(b=>!b.destroyed); },
    get size() { return entries.size; },
  };
  world.traceProjectile = (start,end,radius=.06,accepts=null) => {
    let nearest=originalTrace?.(start,end,radius,accepts)??null;
    for(const e of entries.values()){
      if(e.body.destroyed || accepts&&!accepts(e.body))continue;
      const hit=e.index.traceSegment(local(start,e),local(end,e),radius);
      if(hit&&(!nearest||hit.t<nearest.t))nearest={...hit,point:global(hit.point,e),collider:e.body,type:'runeWall',
        normal:{x:hit.normal.x*e.cos+hit.normal.z*e.sin,z:-hit.normal.x*e.sin+hit.normal.z*e.cos,y:0}};
    }
    return nearest;
  };
  world.resolveMovement = (position,radius=.42) => {
    originalResolve?.(position,radius);
    for(let pass=0;pass<2;pass++)for(const e of entries.values()){
      if(e.body.destroyed || (position.y??e.center.y)>e.body.maxY || (position.y??e.center.y)+2<e.body.minY)continue;
      const p=local(position,e); e.index.resolve(p,radius);const next=global(p,e);position.x=next.x;position.z=next.z;
    }
    return position;
  };
  world.temporaryObstacles=registry; return registry;
}
