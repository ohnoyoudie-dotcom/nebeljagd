/** Combat-owned guards: only direct missiles are stopped; damage zones and melee remain valid. */
export const REFLECTION_RULES = Object.freeze({ duration: 1.8, cooldown: 8, radius: 1.4 });
export function createReflectionGuards(targets) {
  const guards = new Map();
  function activate(id, onBlock) {
    const target = targets.get(id);
    if (!target?.alive || target.destructible || guards.has(id)) return false;
    guards.set(id, { remaining: REFLECTION_RULES.duration, onBlock, blocks: 0 }); return true;
  }
  function state(id) { const g=guards.get(id);return { active:!!g,remaining:g?.remaining??0,blocks:g?.blocks??0 }; }
  function block(target, payload, point, normal) {
    const g=guards.get(target?.id);
    if (!g || !target.alive || payload.sourceId===target.id) return false;
    g.blocks++;g.onBlock?.({point:point??{x:target.position.x,y:(target.position.y??0)+1.2,z:target.position.z},normal:normal??{x:0,y:0,z:1},type:payload.type});return true;
  }
  function trace(start,end,radius=0,excludeId) {
    let nearest=null;
    const dx=end.x-start.x,dy=(end.y??0)-(start.y??0),dz=end.z-start.z,a=dx*dx+dy*dy+dz*dz;
    for(const [id] of guards) {
      const target=targets.get(id);if(!target?.alive||id===excludeId||target.targetable===false)continue;
      const center={x:target.position.x,y:(target.position.y??0)+(target.height??2.3)*.5,z:target.position.z};
      const x=start.x-center.x,y=(start.y??0)-center.y,z=start.z-center.z,reach=REFLECTION_RULES.radius+Math.max(0,radius),c=x*x+y*y+z*z-reach*reach;
      // A just-reflected missile leaving the surface must not hit the same guard twice.
      if(c>=-1e-7 && c<=1e-7 && x*dx+y*dy+z*dz>=0)continue;
      let t=0;
      if(c>0){if(a<1e-12)continue;const b=x*dx+y*dy+z*dz,d=b*b-a*c;if(d<0)continue;t=(-b-Math.sqrt(d))/a;if(t<0||t>1)continue;}
      if(nearest&&nearest.t<=t)continue;
      const point={x:start.x+dx*t,y:(start.y??0)+dy*t,z:start.z+dz*t};
      const n=Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z)||1;
      nearest={target,t,point,normal:{x:(point.x-center.x)/n,y:(point.y-center.y)/n,z:(point.z-center.z)/n},shield:true,type:'reflection'};
    }return nearest;
  }
  return { activate,state,block,trace,clear:id=>guards.delete(id),reset:()=>guards.clear(),
    update(dt){if(!(dt>0))return;for(const [id,g]of guards){g.remaining-=dt;if(g.remaining<=1e-8||!targets.get(id)?.alive)guards.delete(id);}} };
}
