import * as THREE from 'three';
import { createStaffLob } from './staff-lob.js';
import { createClockworkVisuals } from './clockwork-visuals.js';
import { traceRangedProjectile, colliderTarget } from './projectile-collision.js';
export const CLOCKWORK_RULES=Object.freeze({range:20,radius:.6,duration:8,deploy:.4,attackRange:6,interval:1,damage:5,health:25,cooldown:8,speed:14,shotRange:8});
export function guardianLanding(world,combat,p){
 if(!Number.isFinite(p.y))return false;
 for(let i=0;i<9;i++){const a=i*Math.PI/4,r=i===8?0:.55,x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;
  if(world?.isLand&&!world.isLand(x,z)||world?.isWater?.(x,z)||Math.abs((world?.heightAt?.(x,z)??0)-p.y)>.4)return false;}
 const probe=p.clone();world?.resolveMovement?.(probe,.55);if(probe.distanceToSquared(p)>.0001)return false;
 if(world?.traceProjectile?.({...p,y:p.y+.05},{...p,y:p.y+1.1},.5))return false;
 for(const t of combat?.targets.values()??[])if(t.alive&&t.targetable!==false&&Math.abs((t.position.y??0)-p.y)<2&&Math.hypot(t.position.x-p.x,t.position.z-p.z)<.55+(t.radius??.45))return false;
 return true;
}
export function createClockworkSpell(scene,world,combat,ownerId,onDamage=()=>{},isVisible=null){
 const r=CLOCKWORK_RULES,visuals=createClockworkVisuals(scene,isVisible),bullets=[];
 let guardian=null,serial=0,shots=0,hits=0,lastEnd=null;
 const owner=()=>combat?.targets.get(ownerId),ally=t=>t.id===ownerId||owner()?.teamId!=null&&t.teamId===owner().teamId;
 const lob=createStaffLob(scene,world,{range:r.range,radius:r.radius,color:'#7ddcff',canBegin:()=>!guardian&&!visuals.fading,
  valid:p=>guardianLanding(world,combat,p),onFlight:visuals.flying,onEndFlight:visuals.endFlight,
  onImpact(p,payload,blocked){if(blocked||!guardianLanding(world,combat,p)||!combat){visuals.placed(p);visuals.end();lastEnd='blocked';return;}
   const target=combat.addTarget({id:`clockwork-${ownerId}-${++serial}`,position:p.clone(),radius:.5,height:2.25,maxHealth:r.health,
    // Match the vertical combat lane of figures: yaw-only bow/staff controls
    // must also be able to hit this compact summon without a pitch input.
    destructible:true,summoned:true,progressionReward:false,ownerId,teamId:owner()?.teamId});
   guardian={target,position:target.position,age:0,nextShot:r.deploy,direction:0,targetId:null,payload};visuals.placed(p);
  }});
 function end(reason){if(!guardian)return;combat.removeTarget(guardian.target.id);lastEnd=reason;guardian=null;visuals.end();}
 const origin=new THREE.Vector3(),aimPoint=new THREE.Vector3();
 function selectTarget(){let best=null,distance=Infinity;if(!guardian)return null;
  origin.copy(guardian.position);origin.y+=.88;
  for(const t of combat.targets.values()){
   if(!t.alive||t.destructible||t.summoned||t.targetable===false||ally(t))continue;
   const d=Math.hypot(t.position.x-origin.x,t.position.z-origin.z);if(d>r.attackRange||d>=distance)continue;
   if(!(t.revealRemaining>0)&&(t.concealed||(world?.concealmentAt?.(t.position.x,t.position.z)??0)>.01))continue;
   aimPoint.copy(t.position);aimPoint.y+=(t.height??2.3)*.45;
   if(traceRangedProjectile(world,origin,aimPoint,.1))continue;
   distance=d;best=t;
  }return best;
 }
 function moveBullets(dt){for(let i=bullets.length-1;i>=0;i--){const b=bullets[i],step=Math.min(dt,Math.max(0,r.shotRange/r.speed-b.age)),next=b.position.clone().addScaledVector(b.velocity,step);
  const ignored=new Set([b.guardianId]);for(const t of combat.targets.values())if(ally(t))ignored.add(t.id);
  const terrain=traceRangedProjectile(world,b.position,next,.1),body=combat.traceSegment(b.position,next,.1,ownerId,ignored),shield=combat.traceShield?.(b.position,next,.1,ownerId);
  let hit=shield&&(!body||shield.t<=body.t)?shield:body;
  if(terrain&&(!hit||(terrain.t??0)<=hit.t))hit={...terrain,target:colliderTarget(combat,terrain.collider,ownerId)};
  b.age+=step;
  if(hit){if(hit.target&&!ally(hit.target)){
    const result=combat.hit(hit.target,{...b.payload,type:'clockworkStaff',sourceId:ownerId,damage:b.payload.damage??r.damage,delivery:'projectile',point:hit.point,normal:hit.normal});
    if(result&&!result.blocked){hits++;onDamage(result);}
   }bullets.splice(i,1);
  }else if(b.age>=r.shotRange/r.speed-1e-8)bullets.splice(i,1);else b.position.copy(next);
 }}
 function update(dt,position){if(!(dt>0))return;if(owner()?.alive===false){reset();return;}
  // Substeps make targeting, lifetime and swept bolts independent of frame rate.
  let remaining=Math.min(dt,10);while(remaining>1e-8){const step=Math.min(1/60,remaining);remaining-=step;
   moveBullets(step);
   if(guardian){guardian.age+=step;
    if(!guardian.target.alive)end('destroyed');else if(guardian.age>=r.deploy+r.duration-1e-8)end('expired');
    else{const target=selectTarget();guardian.targetId=target?.id??null;
     if(target){guardian.direction=Math.atan2(target.position.x-guardian.position.x,target.position.z-guardian.position.z);
      if(guardian.age+1e-8>=guardian.nextShot){
       origin.copy(guardian.position);origin.y+=.88;aimPoint.copy(target.position);aimPoint.y+=(target.height??2.3)*.45;
       // Snapshot once at the muzzle. Flight never reads a target position:
       // later turret turns and target changes cannot steer an emitted bolt.
       const velocity=aimPoint.clone().sub(origin).normalize().multiplyScalar(r.speed);
       bullets.push({id:shots+1,origin:origin.clone(),position:origin.clone(),velocity,age:0,payload:{...guardian.payload},guardianId:guardian.target.id});shots++;guardian.nextShot=guardian.age+r.interval;visuals.fire();
      }
     }
    }
   }
   visuals.update(step,guardian?{age:guardian.age,health:guardian.target.health,direction:guardian.targetId?guardian.direction:undefined}:null,bullets);
   lob.update(step,position);
  }
 }
 function reset(){if(guardian)combat.removeTarget(guardian.target.id);guardian=null;bullets.length=0;shots=hits=0;lastEnd=null;lob.reset();visuals.reset();}
 return{beginAim:lob.beginAim,aimAt:lob.aimAt,release:lob.release,cancelAim:lob.cancelAim,update,reset,
  get aiming(){return lob.aiming;},get busy(){return lob.flying||!!guardian||visuals.fading;},
  get telemetry(){return{...lob.telemetry,active:!!guardian,duration:r.duration,projectileSpeed:r.speed,homing:false,guardian:guardian?{id:guardian.target.id,position:{...guardian.position},health:guardian.target.health,age:guardian.age,targetId:guardian.targetId}:null,shots,hits,bullets:bullets.map(b=>({id:b.id,origin:{...b.origin},position:{...b.position},velocity:{...b.velocity}})),lastEnd,visuals:visuals.telemetry};},
  dispose(){reset();lob.dispose();visuals.dispose();}};
}
