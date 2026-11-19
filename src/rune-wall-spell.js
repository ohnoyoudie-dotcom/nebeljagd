import * as THREE from 'three';
import { runeWallPlacement } from './rune-wall-placement.js';
import { temporaryObstacles } from './temporary-obstacles.js';
import { createRuneWallVisuals } from './stone-spell-visuals.js';
import { createStaffAimRing } from './staff-aim.js';

export const RUNE_WALL_RULES=Object.freeze({range:14,chargeSeconds:.8,width:7,depth:.65,height:2.3,warning:.08,rise:.14,duration:3,fade:1.1,cooldown:6,health:50});
let nextWallId=0;
export function createRuneWallSpell(scene,world,combat,ownerId,isVisible=null){
  const r=RUNE_WALL_RULES,barriers=temporaryObstacles(world);
  const reach=createStaffAimRing(r.range,{range:true});scene.add(reach);
  let aim=null,field=null,casts=0,pieces=[],pieceKey='';
  const placement=(origin,requested,range,angle=null)=>runeWallPlacement(world,combat,r,origin,requested,range,angle);
  function syncVisuals(value,preview=false){
    const spans=value.spans.length?value.spans:[{start:-r.width/2,end:r.width/2,height:value.center.y}];
    const key=spans.map(s=>`${s.start}:${s.end}`).join('|');
    if(key!==pieceKey){for(const p of pieces)p.visual.dispose();pieces=spans.map(s=>({visual:createRuneWallVisuals(scene,{...r,width:s.end-s.start},ownerId==='player',isVisible)}));pieceKey=key;}
    spans.forEach((s,i)=>{
      const offset=(s.start+s.end)/2,center=new THREE.Vector3(value.center.x+offset*Math.cos(value.angle),s.height,value.center.z-offset*Math.sin(value.angle));
      if(preview)pieces[i].visual.aim(center,value.angle,value.valid);
      else pieces[i].visual.show(center,value.angle,value.age,value.collapseAge,(value.target?.health??r.health)/r.health);
    });
  }
  function refresh(position){if(!aim)return;aim.origin.copy(position);aim.range=r.range*Math.min(1,aim.age/r.chargeSeconds);Object.assign(aim,placement(position,aim.requested,aim.range));
    syncVisuals(aim,true);reach.position.copy(position);reach.position.y+=.08;reach.scale.setScalar(Math.max(.001,aim.range/r.range));reach.visible=true;}
  function cancelAim(){aim=null;reach.visible=false;for(const p of pieces)p.visual.cancelAim();}
  function removeSolid(){if(!field)return;for(let i=0;i<field.spans.length;i++)barriers.remove(field.id+'-'+i);combat?.removeTarget(field.id);field.target=null;}
  function collapse(){if(!field||field.collapseAge!==null)return;removeSolid();field.collapseAge=0;}
  function update(dt,position){
    if(!(dt>0))return;if(aim){aim.age+=dt;refresh(position);}
    if(!field)return;
    if(combat?.targets.get(ownerId)?.alive===false){reset();return;}
    field.age+=dt;
    if(field.collapseAge===null&&!field.target&&field.age>=r.warning){
      const checked=placement(field.origin,field.center,r.range,field.angle);
      field.spans=checked.spans;
      if(!checked.valid){field=null;for(const p of pieces)p.visual.reset();return;}
      else{
        field.target=combat?.addTarget({id:field.id,name:'Runenmauer',position:field.center.clone(),radius:r.width/2,height:r.height,maxHealth:r.health,destructible:true,projectileColliderOnly:true});
        field.spans.forEach((s,i)=>{
          const offset=(s.start+s.end)/2,center={x:field.center.x+offset*Math.cos(field.angle),y:s.height,z:field.center.z-offset*Math.sin(field.angle)};
          barriers.add(field.id+'-'+i,{center,angle:field.angle,width:s.end-s.start,depth:r.depth,height:r.height,ownerId,targetId:field.id,alive:()=>!!field?.target?.alive});
        });
      }
    }
    if(field.collapseAge===null&&(field.target&&!field.target.alive||field.age>=r.warning+r.rise+r.duration))collapse();
    if(field.collapseAge!==null)field.collapseAge+=dt;
    syncVisuals(field);
    if(field.collapseAge>=r.fade){field=null;for(const p of pieces)p.visual.reset();}
  }
  function reset(){removeSolid();field=null;casts=0;cancelAim();for(const p of pieces)p.visual.reset();}
  return{
    beginAim(position,direction=0){if(aim||field)return false;aim={origin:position.clone(),requested:new THREE.Vector3(position.x+Math.sin(direction)*r.range,0,position.z+Math.cos(direction)*r.range),age:0};refresh(position);return true;},
    aimAt(position,p){if(aim&&Number.isFinite(p?.x)&&Number.isFinite(p?.z)){aim.requested.set(p.x,0,p.z);refresh(position);}},cancelAim,
    release(position){if(!aim)return false;refresh(position);if(!aim.valid){cancelAim();return false;}
      field={id:'rune-wall-'+ownerId+'-'+(++nextWallId),origin:position.clone(),center:new THREE.Vector3(aim.center.x,aim.center.y,aim.center.z),spans:aim.spans,angle:aim.angle,age:0,collapseAge:null,target:null};casts++;cancelAim();syncVisuals(field);return true;},
    update,reset,get aiming(){return!!aim;},get busy(){return!!field;},
    get telemetry(){return{width:r.width,warning:r.warning,rise:r.rise,aiming:!!aim,valid:aim?.valid??false,aim:aim?{...aim.center}:null,aimRange:aim?{radius:aim.range,maximum:r.range}:null,casts,active:!!field,solid:!!field?.target?.alive,health:field?.target?.health??0,center:field?{...field.center}:null,age:field?.age??0,collapseAge:field?.collapseAge??null,barriers:barriers.size,segments:field?.spans??aim?.spans??[],visuals:pieces[0]?.visual.telemetry??{}};},
    dispose(){reset();for(const p of pieces)p.visual.dispose();reach.removeFromParent();reach.geometry.dispose();reach.material.dispose();},
  };
}
