import * as THREE from 'three';
import { temporaryObstacles } from './temporary-obstacles.js';
import { createRuneWallVisuals } from './stone-spell-visuals.js';
import { createStaffAimRing } from './staff-aim.js';

export const RUNE_WALL_RULES=Object.freeze({range:10,chargeSeconds:.8,width:7,depth:.65,height:2.3,warning:.08,rise:.14,duration:3,fade:.65,cooldown:6,health:50});
let nextWallId=0;
export function createRuneWallSpell(scene,world,combat,ownerId,isVisible=null){
  const r=RUNE_WALL_RULES,barriers=temporaryObstacles(world),ground=p=>world?.heightAt?.(p.x,p.z)??0;
  const visuals=createRuneWallVisuals(scene,r,ownerId==='player',isVisible),reach=createStaffAimRing(r.range,{range:true});scene.add(reach);
  let aim=null,field=null,casts=0;
  function placement(origin,requested,range){
    const dx=requested.x-origin.x,dz=requested.z-origin.z,length=Math.hypot(dx,dz),factor=Math.min(1,range/(length||1));
    const center=new THREE.Vector3(origin.x+dx*factor,0,origin.z+dz*factor);center.y=ground(center);
    const angle=Math.atan2(dx,dz),cos=Math.cos(angle),sin=Math.sin(angle);
    let valid=length*factor>=2;
    const sight=world.traceProjectile({...origin,y:ground(origin)+.6},{...center,y:center.y+.6},.1);
    if(sight)valid=false;
    for(let x=-r.width/2;x<=r.width/2+.01&&valid;x+=.25)for(const z of [-r.depth/2,0,r.depth/2]){
      const p=new THREE.Vector3(center.x+x*cos+z*sin,0,center.z-x*sin+z*cos);p.y=ground(p);
      if(world?.isLand&&!world.isLand(p.x,p.z)||world?.isWater?.(p.x,p.z)||Math.abs(p.y-center.y)>.35){valid=false;break;}
      const probe=p.clone();world.resolveMovement(probe,.45);
      if(Math.hypot(probe.x-p.x,probe.z-p.z)>.01||world.traceProjectile({...p,y:p.y+.08},{...p,y:p.y+r.height},.15)){valid=false;break;}
    }
    for(const t of combat?.targets?.values()??[]){
      if(!t.alive||t.targetable===false)continue;
      const x=t.position.x-center.x,z=t.position.z-center.z,localX=x*cos-z*sin,localZ=x*sin+z*cos;
      if(Math.abs((t.position.y??center.y)-center.y)<r.height&&Math.abs(localX)<r.width/2+(t.radius??.45)+.15&&Math.abs(localZ)<r.depth/2+(t.radius??.45)+.15)valid=false;
    }
    return{center,angle,valid};
  }
  function refresh(position){if(!aim)return;aim.origin.copy(position);aim.range=r.range*Math.min(1,aim.age/r.chargeSeconds);Object.assign(aim,placement(position,aim.requested,aim.range));
    visuals.aim(aim.center,aim.angle,aim.valid);reach.position.copy(position);reach.position.y+=.08;reach.scale.setScalar(Math.max(.001,aim.range/r.range));reach.visible=true;}
  function cancelAim(){aim=null;reach.visible=false;visuals.cancelAim();}
  function removeSolid(){if(!field)return;barriers.remove(field.id);combat?.removeTarget(field.id);field.target=null;}
  function collapse(){if(!field||field.collapseAge!==null)return;removeSolid();field.collapseAge=0;}
  function update(dt,position){
    if(!(dt>0))return;if(aim){aim.age+=dt;refresh(position);}
    if(!field)return;
    if(combat?.targets.get(ownerId)?.alive===false){reset();return;}
    field.age+=dt;
    if(field.collapseAge===null&&!field.target&&field.age>=r.warning){
      // Someone can enter the footprint during the warning: never spawn a
      // solid wall through that actor, an existing prop, or another new wall.
      if(!placement(field.origin,field.center,r.range).valid){collapse();}
      else{
        field.target=combat?.addTarget({id:field.id,name:'Runenmauer',position:field.center.clone(),radius:r.width/2,height:r.height,maxHealth:r.health,destructible:true,projectileColliderOnly:true});
        barriers.add(field.id,{center:field.center,angle:field.angle,width:r.width,depth:r.depth,height:r.height,ownerId,targetId:field.id,alive:()=>!!field?.target?.alive});
      }
    }
    if(field.collapseAge===null&&(field.target&&!field.target.alive||field.age>=r.warning+r.rise+r.duration))collapse();
    if(field.collapseAge!==null)field.collapseAge+=dt;
    visuals.show(field.center,field.angle,field.age,field.collapseAge,field.target?.health/r.health||0);
    if(field.collapseAge>=r.fade){field=null;visuals.reset();}
  }
  function reset(){removeSolid();field=null;casts=0;cancelAim();visuals.reset();}
  return{
    beginAim(position,direction=0){if(aim||field)return false;aim={origin:position.clone(),requested:new THREE.Vector3(position.x+Math.sin(direction)*r.range,0,position.z+Math.cos(direction)*r.range),age:0};refresh(position);return true;},
    aimAt(position,p){if(aim&&Number.isFinite(p?.x)&&Number.isFinite(p?.z)){aim.requested.set(p.x,0,p.z);refresh(position);}},cancelAim,
    release(position){if(!aim)return false;refresh(position);if(!aim.valid){cancelAim();return false;}
      field={id:'rune-wall-'+ownerId+'-'+(++nextWallId),origin:position.clone(),center:aim.center.clone(),angle:aim.angle,age:0,collapseAge:null,target:null};casts++;cancelAim();visuals.show(field.center,field.angle,0,null,1);return true;},
    update,reset,get aiming(){return!!aim;},get busy(){return!!field;},
    get telemetry(){return{width:r.width,warning:r.warning,rise:r.rise,aiming:!!aim,valid:aim?.valid??false,aim:aim?{...aim.center}:null,aimRange:aim?{radius:aim.range,maximum:r.range}:null,casts,active:!!field,solid:!!field?.target?.alive,health:field?.target?.health??0,center:field?{...field.center}:null,age:field?.age??0,collapseAge:field?.collapseAge??null,barriers:barriers.size,visuals:visuals.telemetry};},
    dispose(){reset();visuals.dispose();reach.removeFromParent();reach.geometry.dispose();reach.material.dispose();},
  };
}
