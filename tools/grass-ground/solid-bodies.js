/* Movement-only actor separation. Combat and visibility rules stay intact. */
function reiSeparateActors(position,radius,targets,ignoredId,playerPosition=null) {
 let changed=false;
 const bodies=[...(targets?.values?.()||[])];
 if(playerPosition)bodies.push({id:'player',position:playerPosition,radius:.42,height:2.25,alive:true});
 for(const body of bodies){
  if(body.id===ignoredId||body.alive===false||body.solid===false||!body.position)continue;
  if(Math.abs((body.position.y||0)-(position.y||0))>(body.height||2.25))continue;
  let dx=position.x-body.position.x,dz=position.z-body.position.z;
  const limit=radius+(body.radius||.52)+.002,distance=Math.hypot(dx,dz);
  if(distance>=limit)continue;
  if(distance<1e-8){dx=1;dz=0;}else{dx/=distance;dz/=distance;}
  position.x=body.position.x+dx*limit;position.z=body.position.z+dz*limit;changed=true;
 }
 return changed;
}
function reiMoveSolid(position,from,radius,world,targets,ignoredId='player',playerPosition=null){
 const dx=position.x-from.x,dz=position.z-from.z;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/Math.min(.16,radius*.4)));
 position.x=from.x;position.z=from.z;
 for(let i=0;i<steps;i++){
  position.x+=dx/steps;position.z+=dz/steps;
  for(let pass=0;pass<4;pass++){
   world.resolveMovement(position,radius);
   if(!reiSeparateActors(position,radius,targets,ignoredId,playerPosition))break;
  }
  world.resolveMovement(position,radius);
 }
 return position;
}
function reiChestRayClear(world,chest,x,z,height){
 if(!world?.traceProjectile)return true;
 const dx=x-chest.x,dz=z-chest.z,d=Math.hypot(dx,dz);
 if(d<1e-6)return false;
 const angle=chest.group?.rotation?.y||0,c=Math.cos(angle),s=Math.sin(angle);
 const lx=(dx*c-dz*s)/d,lz=(dx*s+dz*c)/d,scale=chest.scale||1;
 const exit=Math.min(Math.abs(lx)>1e-8?.88*scale/Math.abs(lx):Infinity,Math.abs(lz)>1e-8?.59*scale/Math.abs(lz):Infinity)+.06;
 const start=Math.min(exit,d);
 const hit=world.traceProjectile({x:chest.x+dx/d*start,y:height+.5,z:chest.z+dz/d*start},{x,y:height+.5,z},.04);
 return !hit||hit.collider?.objectId===chest.id||hit.collider?.id===chest.id;
}
