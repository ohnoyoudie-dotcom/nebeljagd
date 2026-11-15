import { createStaffLob } from './staff-lob.js';
import { createShadowVisuals } from './shadow-visuals.js';
export const SHADOW_RULES=Object.freeze({range:20,radius:2.5,duration:3,fade:.55,blindSeconds:2,blindRadius:2.5,damage:8,cooldown:5.5});
export function createShadowSpell(scene,world,combat,ownerId,onDamage=()=>{},isVisible=null){
 const r=SHADOW_RULES,visuals=createShadowVisuals(scene,r,isVisible);let field=null,hits=0;
 const lob=createStaffLob(scene,world,{range:r.range,radius:r.radius,color:'#ab76e3',canBegin:()=>!field,
  onFlight:visuals.flying,onEndFlight:visuals.endFlight,onImpact(center,payload){
   if(world?.isWater?.(center.x,center.z)||world?.isLand&&!world.isLand(center.x,center.z))return;
   field={center,age:0,hitIds:new Set(),payload};hitEntrants();visuals.field(center,0);
  }});
 function hitEntrants(){
  if(!field||field.age>=r.duration)return;
  const owner=combat?.targets.get(ownerId);
  for(const t of combat?.targets.values()??[]){
   if(!t.alive||t.id===ownerId||t.destructible||t.targetable===false||field.hitIds.has(t.id)||owner?.teamId!=null&&owner.teamId===t.teamId)continue;
   if(Math.hypot(t.position.x-field.center.x,t.position.z-field.center.z)>r.radius+(t.radius??0)||Math.abs((t.position.y??0)-field.center.y)>2)continue;
   const hit=world?.traceProjectile?.({...field.center,y:field.center.y+.6},{...t.position,y:(t.position.y??0)+.6},.04);
   if(hit)continue;
   field.hitIds.add(t.id);
   const result=combat.hit(t,{...field.payload,damage:field.payload.damage??r.damage,type:'shadowStaff',sourceId:ownerId,delivery:'area',darken:{duration:r.blindSeconds,radius:r.blindRadius}});
   if(result){hits++;onDamage(result);}
  }
 }
 function update(dt,position){if(!(dt>0))return;if(combat?.targets.get(ownerId)?.alive===false){reset();return;}
  visuals.update(dt);if(field){field.age+=dt;hitEntrants();visuals.field(field.center,field.age);if(field.age>=r.duration+r.fade){field=null;visuals.reset();}}
  lob.update(dt,position);
 }
 function reset(){lob.reset();field=null;hits=0;visuals.reset();}
 return{beginAim:lob.beginAim,aimAt:lob.aimAt,cancelAim:lob.cancelAim,release:lob.release,update,reset,
  get aiming(){return lob.aiming;},get busy(){return lob.flying||!!field;},get telemetry(){return{...lob.telemetry,active:!!field||lob.flying,hits,center:field?{...field.center}:null,age:field?.age??0,radius:r.radius,affected:field?[...field.hitIds]:[],visuals:visuals.telemetry};},dispose(){reset();lob.dispose();visuals.dispose();}};
}
