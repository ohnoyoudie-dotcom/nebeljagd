import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';
import { chargedStaffRange } from './staff-charge.js';
import { traceRangedProjectile } from './projectile-collision.js';

/** A charged ground target and a swept ballistic delivery. Callbacks own the
 * distinct payload/visuals; impact never teleports through an obstructed arc. */
export function createStaffLob(scene, world, { range=20, radius=2.5, color='#b497ee', valid=()=>true,
  canBegin=()=>true, onImpact=()=>{}, onFlight=()=>{}, onEndFlight=()=>{} }={}) {
  const ground=p=>world?.heightAt?.(p.x,p.z)??0;
  const targetRing=createStaffAimRing(radius,{color}),reach=createStaffAimRing(range,{range:true});scene.add(targetRing,reach);
  let aim=null,flight=null,casts=0;
  function refresh(position){
    aim.caster.copy(position);aim.range=chargedStaffRange(aim.age,range);
    const dx=aim.requested.x-position.x,dz=aim.requested.z-position.z,factor=Math.min(1,aim.range/(Math.hypot(dx,dz)||1));
    aim.target.set(position.x+dx*factor,0,position.z+dz*factor);aim.target.y=ground(aim.target);
    aim.valid=(!world?.isLand||world.isLand(aim.target.x,aim.target.z))&&!world?.isWater?.(aim.target.x,aim.target.z)&&valid(aim.target);
    targetRing.position.copy(aim.target);targetRing.position.y+=.07;targetRing.visible=true;targetRing.userData.update(aim.age);
    targetRing.material.uniforms.uColor.value.set(aim.valid?color:'#ff6655');
    reach.position.copy(position);reach.position.y+=.06;reach.scale.setScalar(Math.max(.001,aim.range/range));reach.visible=true;
  }
  function cancelAim(){aim=null;targetRing.visible=reach.visible=false;}
  function beginAim(position,direction=0){if(aim||flight||!canBegin())return false;
    aim={caster:position.clone(),requested:new THREE.Vector3(position.x+Math.sin(direction)*range,0,position.z+Math.cos(direction)*range),target:new THREE.Vector3(),age:0,range:0,valid:false};refresh(position);return true;}
  function aimAt(position,p){if(aim&&Number.isFinite(p?.x)&&Number.isFinite(p?.z)){aim.requested.set(p.x,0,p.z);refresh(position);}}
  function release(position,payload,tip){
    if(!aim)return false;refresh(position);if(!aim.valid||!canBegin()){cancelAim();return false;}
    const start=tip?.clone?.()??new THREE.Vector3(position.x,position.y+1.3,position.z),target=aim.target.clone();target.y+=.12;
    const blocked=traceRangedProjectile(world,{x:position.x,y:position.y+1.2,z:position.z},start,.14);
    flight={start,target,position:start.clone(),age:0,duration:Math.max(.55,start.distanceTo(target)/13),payload:{...payload}};
    cancelAim();casts++;
    if(blocked){const data=flight;flight=null;onEndFlight();onImpact(new THREE.Vector3(blocked.point.x,ground(blocked.point),blocked.point.z),data.payload,true);}
    else onFlight(start,0);
    return true;
  }
  const next=new THREE.Vector3(),previous=new THREE.Vector3();
  function update(dt,position){
    if(!(dt>0))return;if(aim){aim.age+=dt;refresh(position);}
    if(!flight)return;
    // Fixed maximum substeps cover the curved path even on a slow tablet frame.
    let remaining=Math.min(dt,flight.duration-flight.age);
    while(flight&&remaining>1e-8){const step=Math.min(1/90,remaining),f=flight;remaining-=step;previous.copy(f.position);f.age+=step;
      const t=Math.min(1,f.age/f.duration);next.copy(f.start).lerp(f.target,t);next.y+=Math.sin(t*Math.PI)*2.7;
      const hit=traceRangedProjectile(world,previous,next,.14),floor=ground(next);
      if(hit||next.y<floor+.08||t>=1-1e-8){
        const p=hit?new THREE.Vector3(hit.point.x,ground(hit.point),hit.point.z):new THREE.Vector3(next.x,floor,next.z);
        flight=null;onEndFlight();onImpact(p,f.payload,!!hit);break;
      }
      f.position.copy(next);onFlight(next,t);
    }
  }
  function reset(){cancelAim();flight=null;casts=0;onEndFlight();}
  return {beginAim,aimAt,release,cancelAim,update,reset,get aiming(){return!!aim;},get flying(){return!!flight;},
    get telemetry(){return{aiming:!!aim,valid:aim?.valid??false,aim:aim?.target.clone()??null,aimRange:aim?{radius:aim.range,maximum:range}:null,casts,flight:flight?{position:{...flight.position},age:flight.age,duration:flight.duration}:null};},
    dispose(){reset();for(const ring of [targetRing,reach]){ring.removeFromParent();ring.geometry.dispose();ring.material.dispose();}}};
}
