/** Integrate a gradual exposure curve exactly, independent of frame rate.
 * 0.7s to react, then 18–50% of the map's configured DPS over eight seconds. */
export function advanceZoneExposure(previous,dt,inDanger,rate){
 if(!inDanger)return {exposure:0,damage:0};
 const start=Math.max(0,previous||0),end=start+Math.max(0,dt||0);
 const integral=t=>{const u=Math.max(0,t-.7),ramp=Math.min(8,u);return Math.max(0,rate)*(.18*u+.32*(ramp*ramp/16+Math.max(0,u-8)));};
 return {exposure:end,damage:integral(end)-integral(start)};
}
