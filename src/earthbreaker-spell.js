import * as THREE from 'three';
import { createEarthbreakerVisuals } from './stone-spell-visuals.js';
import { colliderTarget } from './projectile-collision.js';

export const EARTHBREAKER_RULES=Object.freeze({range:18,width:1.35,endWidth:2.8,warning:.38,spacing:1.1,step:.04,fade:.62,cooldown:1.8,damage:18});
export function createEarthbreakerSpell(scene,world,combat,ownerId,onDamage=()=>{},isVisible=null){
  const r=EARTHBREAKER_RULES,ground=p=>world?.heightAt?.(p.x,p.z)??0;
  const visuals=createEarthbreakerVisuals(scene,r,isVisible);let wave=null,casts=0,hits=0;
  const widthAt=p=>r.width+(r.endWidth-r.width)*Math.min(1,Math.hypot(p.x-wave.origin.x,p.z-wave.origin.z)/r.range);
  const solid=(a,b)=>world?.traceProjectile?.({...a,y:ground(a)+.35},{...b,y:ground(b)+.35},.12);
  function cast(position,direction,payload){
    if(wave)return false;
    const origin=position.clone(),dx=Math.sin(direction),dz=Math.cos(direction),nodes=[];
    let previous=origin,contact=null;
    for(let distance=.65;distance<=r.range;distance+=.22){
      const p=new THREE.Vector3(origin.x+dx*distance,0,origin.z+dz*distance);p.y=ground(p);
      if(world?.isWater?.(p.x,p.z)||world?.isLand&&!world.isLand(p.x,p.z)||Math.abs(p.y-ground(previous))>.55)break;
      contact=solid(previous,p);if(contact)break;
      if(!nodes.length||distance>=.65+nodes.length*r.spacing-.01)nodes.push(p);
      previous=p;
    }
    // Even a blocked cast announces and impacts the first solid object.
    wave={origin,direction,nodes,age:0,next:0,hitIds:new Set(),payload:{...payload,type:'earthbreakerStaff',sourceId:ownerId,delivery:'area'},contact};
    casts++;visuals.begin(nodes,origin,direction,nodes.map(widthAt));return true;
  }
  function damage(target){if(!target?.alive||target.id===ownerId||wave.hitIds.has(target.id))return;
    wave.hitIds.add(target.id);const result=combat?.hit(target,wave.payload);if(result){hits++;onDamage(result);}}
  function update(dt){
    if(!(dt>0)||!wave)return;wave.age+=dt;
    while(wave.next<wave.nodes.length&&wave.age>=r.warning+wave.next*r.step){
      const index=wave.next++,p=wave.nodes[index],previous=index?wave.nodes[index-1]:wave.origin;
      const obstruction=solid(previous,p);
      if(obstruction){damage(colliderTarget(combat,obstruction.collider,ownerId));wave.nodes.length=index;wave.contact=null;visuals.trim(index);break;}
      for(const t of combat?.targets?.values()??[]){
        if(!t.alive||t.id===ownerId||t.targetable===false||wave.hitIds.has(t.id))continue;
        const x=t.position.x-p.x,z=t.position.z-p.z,along=x*Math.sin(wave.direction)+z*Math.cos(wave.direction),side=x*Math.cos(wave.direction)-z*Math.sin(wave.direction);
        if(Math.abs(along)>r.spacing*.58+(t.radius??.4)||Math.abs(side)>widthAt(p)*.5+(t.radius??.4)||Math.abs((t.position.y??ground(t.position))-p.y)>1.4)continue;
        const cover=solid(p,t.position);
        if(cover&&cover.collider?.objectId!==t.id&&cover.collider?.destructibleId!==t.id)continue;
        damage(t);
      }
    }
    if(wave.next>=wave.nodes.length&&wave.age>=r.warning+wave.nodes.length*r.step&&wave.contact){
      damage(colliderTarget(combat,wave.contact.collider,ownerId));wave.contact=null;
    }
    visuals.update(wave.age);
    if(wave.age>=r.warning+Math.max(1,wave.nodes.length)*r.step+r.fade){wave=null;visuals.reset();}
  }
  function reset(){wave=null;casts=hits=0;visuals.reset();}
  return {cast,update,reset,get busy(){return !!wave;},get telemetry(){return{casts,hits,range:r.range,startWidth:r.width,endWidth:r.endWidth,active:!!wave,age:wave?.age??0,nodes:wave?.nodes.map(p=>({...p}))??[],...visuals.telemetry};},dispose(){reset();visuals.dispose();}};
}
