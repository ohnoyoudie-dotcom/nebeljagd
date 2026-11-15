const ARCS=new Set(['meteorStaff','poisonStaff','gravityStaff']);
const FIELDS=new Set(['sunStaff','hourglassStaff','lightningStaff','blinkStaff','runeWallStaff']);
export function aimKind(type){return ARCS.has(type)?'arc':FIELDS.has(type)?'area':type==='earthbreakerStaff'?'wave':type==='reflectionStaff'?'self':'direction';}
export function touchAimVector(dx,dy,radius=64,deadZone=8){
  const distance=Math.hypot(dx,dy);
  if(!Number.isFinite(distance)||distance<=deadZone)return null;
  return {x:dx/distance,z:dy/distance,ratio:Math.min(1,(distance-deadZone)/(radius-deadZone)),distance};
}
export function directionTo(origin,target,fallback){const x=target.x-origin.x,z=target.z-origin.z;return Math.hypot(x,z)>.08?Math.atan2(x,z):fallback;}
