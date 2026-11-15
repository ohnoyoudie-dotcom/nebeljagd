import { createStaffLob } from './staff-lob.js';
import { createShadowVisuals } from './shadow-visuals.js';
import { applyDarkened } from './darkened-status.js';
export const SHADOW_RULES=Object.freeze({range:20,radius:4,duration:3,fade:.55,blindSeconds:2,blindRadius:2.5,damage:8,cooldown:5.5});
export function createShadowSpell(scene,world,combat,ownerId,onDamage=()=>{},isVisible=null){
 const r=SHADOW_RULES,visuals=createShadowVisuals(scene,r,isVisible,world);let field=null,hits=0;
 const lob=createStaffLob(scene,world,{range:r.range,radius:r.radius,color:'#ab76e3',canBegin:()=>!field,
  onFlight:visuals.flying,onEndFlight:visuals.endFlight,onImpact(center,payload){
   if(world?.isWater?.(center.x,center.z)||world?.isLand&&!world.isLand(center.x,center.z))return;
   field={center,age:0,hitIds:new Set(),payload};hitEntrants();visuals.field(center,0);
  }});
 function hitEntrants(refreshOnly=false,remaining=r.blindSeconds){
  if(!field||remaining<=0)return;
  const owner=combat?.targets.get(ownerId);
  for(const t of combat?.targets.values()??[]){
   if(!t.alive||t.id===ownerId||t.destructible||t.targetable===false||owner?.teamId!=null&&owner.teamId===t.teamId)continue;
   if(Math.hypot(t.position.x-field.center.x,t.position.z-field.center.z)>r.radius+(t.radius??0)||Math.abs((t.position.y??0)-field.center.y)>2)continue;
   const hit=world?.traceProjectile?.({...field.center,y:field.center.y+.6},{...t.position,y:(t.position.y??0)+.6},.04);
   if(hit)continue;
   const status={sourceId:ownerId,darken:{duration:remaining,radius:r.blindRadius}};
   if(field.hitIds.has(t.id)){
    // Holding the status is not another hit: no extra damage, hit flashes,
    // floating numbers or progression events while standing in the mist.
    applyDarkened(t,status);
   }else if(!refreshOnly){
    field.hitIds.add(t.id);
    const result=combat.hit(t,{...field.payload,damage:field.payload.damage??r.damage,type:'shadowStaff',delivery:'area',...status});
    if(result){hits++;onDamage(result);}
   }
  }
 }
 function update(dt,position){if(!(dt>0))return;if(combat?.targets.get(ownerId)?.alive===false){reset();return;}
  visuals.update(dt);if(field){const previous=field.age;field.age+=dt;
   if(field.age<r.duration)hitEntrants();
   else if(previous<r.duration)hitEntrants(true,Math.max(0,r.blindSeconds-(field.age-r.duration)));
   visuals.field(field.center,field.age);if(field.age>=r.duration+r.fade){field=null;visuals.reset();}}
  lob.update(dt,position);
 }
 function reset(){lob.reset();field=null;hits=0;visuals.reset();}
 return{beginAim:lob.beginAim,aimAt:lob.aimAt,cancelAim:lob.cancelAim,release:lob.release,update,reset,
  get aiming(){return lob.aiming;},get busy(){return lob.flying||!!field;},get telemetry(){return{...lob.telemetry,active:!!field||lob.flying,hits,center:field?{...field.center}:null,age:field?.age??0,radius:r.radius,affected:field?[...field.hitIds]:[],visuals:visuals.telemetry};},dispose(){reset();lob.dispose();visuals.dispose();}};
}
