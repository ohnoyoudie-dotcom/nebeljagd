import * as THREE from 'three';
import { createStaffAimRing } from './staff-aim.js';
import { createBlinkVisuals } from './utility-staff-visuals.js';
export const BLINK_RULES=Object.freeze({range:8,chargeSeconds:1.5,radius:.6,bodyRadius:.42,cooldown:4});
/** Swept body clearance prevents crossing walls, including low fences. Landing must fit the whole avatar. */
export function blinkLanding(world,combat,ownerId,origin,requested,range) {
  const r=BLINK_RULES,dx=requested.x-origin.x,dz=requested.z-origin.z,length=Math.hypot(dx,dz),factor=Math.min(1,Math.max(0,range)/(length||1));
  const p=new THREE.Vector3(origin.x+dx*factor,0,origin.z+dz*factor),ground=(x,z)=>world?.heightAt?.(x,z)??0;
  p.y=ground(p.x,p.z);
  const wall=world?.traceProjectile?.({x:origin.x,y:(origin.y??ground(origin.x,origin.z))+.45,z:origin.z},{x:p.x,y:p.y+.45,z:p.z},r.bodyRadius);
  if(wall?.point){p.x=wall.point.x-dx/(length||1)*.08;p.z=wall.point.z-dz/(length||1)*.08;p.y=ground(p.x,p.z);}
  let valid=Number.isFinite(p.y)&&Math.hypot(p.x-origin.x,p.z-origin.z)>.55;
  for(let i=0;i<9&&valid;i++) {const angle=i*Math.PI/4,rad=i===8?0:r.bodyRadius,x=p.x+Math.cos(angle)*rad,z=p.z+Math.sin(angle)*rad;
    valid=!(world?.isLand&&!world.isLand(x,z))&&!world?.isWater?.(x,z)&&Math.abs(ground(x,z)-p.y)<.65;}
  const probe=p.clone();world?.resolveMovement?.(probe,r.bodyRadius);
  if(probe.distanceToSquared(p)>.0001)valid=false;
  for(const t of combat?.targets?.values()??[])if(t.alive&&t.id!==ownerId&&t.targetable!==false&&Math.abs((t.position.y??0)-p.y)<2.3&&Math.hypot(t.position.x-p.x,t.position.z-p.z)<r.bodyRadius+(t.radius??.45)+.08)valid=false;
  return {point:p,valid,blocked:!!wall};
}
export function createBlinkSpell(scene,world,combat,ownerId,isVisible,onTeleport) {
  const r=BLINK_RULES,ring=createStaffAimRing(r.radius,{color:'#81e9ff'}),rangeRing=createStaffAimRing(r.range,{range:true});
  scene.add(ring,rangeRing);const visuals=createBlinkVisuals(scene,isVisible);let aim=null,casts=0,last=null;
  function refresh(position){if(!aim)return;aim.origin.copy(position);aim.range=r.range*Math.min(1,aim.age/r.chargeSeconds);
    const landing=blinkLanding(world,combat,ownerId,position,aim.requested,aim.range);Object.assign(aim,landing);
    ring.position.copy(aim.point);ring.position.y+=.07;ring.visible=!isVisible||isVisible(aim.point);ring.userData.update(aim.age);
    ring.material.uniforms.uColor.value.set(aim.valid?'#81e9ff':'#ff6d75');rangeRing.position.copy(position);rangeRing.position.y+=.06;rangeRing.scale.setScalar(Math.max(.001,aim.range/r.range));rangeRing.visible=true;
  }
  function cancelAim(){aim=null;ring.visible=rangeRing.visible=false;}
  return {beginAim(position,direction=0){if(aim)return false;aim={origin:position.clone(),requested:new THREE.Vector3(position.x+Math.sin(direction)*r.range,0,position.z+Math.cos(direction)*r.range),age:0,range:0};refresh(position);return true;},
    aimAt(position,p){if(aim&&Number.isFinite(p?.x)&&Number.isFinite(p?.z)){aim.requested.set(p.x,0,p.z);refresh(position);}},cancelAim,
    release(position){if(!aim)return false;refresh(position);if(!aim.valid){cancelAim();return false;}
      const from=position.clone(),to=aim.point.clone();position.copy(to);onTeleport?.(from,to);visuals.trigger(from,to);last={from:{...from},to:{...to}};casts++;cancelAim();return true;},
    update(dt,position){if(!(dt>0))return;if(aim){aim.age+=dt;refresh(position);}visuals.update(dt);},
    reset(){cancelAim();casts=0;last=null;visuals.reset();},
    get aiming(){return !!aim;},get telemetry(){return {aiming:!!aim,aim:aim?{...aim.point}:null,valid:aim?.valid??false,blocked:aim?.blocked??false,aimRange:aim?{radius:aim.range,maximum:r.range,heldSeconds:aim.age}:null,targetRadius:r.radius,casts,last,visuals:visuals.telemetry};},
    dispose(){cancelAim();visuals.dispose();for(const m of [ring,rangeRing]){m.removeFromParent();m.geometry.dispose();m.material.dispose();}}};
}
