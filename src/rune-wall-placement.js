/** A wall is a set of free strips, never an all-or-nothing footprint. */
export function runeWallPlacement(world, combat, rules, origin, requested, range, fixedAngle = null) {
  const ground = (x,z) => world.heightAt?.(x,z) ?? 0;
  const dx=requested.x-origin.x,dz=requested.z-origin.z,length=Math.hypot(dx,dz),factor=Math.min(1,range/(length||1));
  const center={x:origin.x+dx*factor,z:origin.z+dz*factor};center.y=ground(center.x,center.z);
  const angle=fixedAngle??Math.atan2(dx,dz),cos=Math.cos(angle),sin=Math.sin(angle);
  const count=Math.ceil(rules.width/.125),step=rules.width/count,spans=[];
  let start=null,base=null;
  const close=end=>{if(start!==null&&end-start>=1.1)spans.push({start,end,height:base});start=null;base=null;};
  for(let i=0;i<count;i++){
    const a=-rules.width/2+i*step,b=a+step,x=(a+b)/2;
    const middle={x:center.x+x*cos,z:center.z-x*sin};const y=ground(middle.x,middle.z);
    let free=true;
    for(const offset of [-step/2,0,step/2])for(const z of [-rules.depth/2,0,rules.depth/2]){
      const p={x:center.x+(x+offset)*cos+z*sin,y,z:center.z-(x+offset)*sin+z*cos};
      if(world.isLand&&!world.isLand(p.x,p.z)||world.isWater?.(p.x,p.z)||Math.abs(ground(p.x,p.z)-y)>.25){free=false;break;}
      const probe={...p};world.resolveMovement?.(probe,.12);
      if(Math.hypot(probe.x-p.x,probe.z-p.z)>.005||world.traceProjectile?.({...p,y:y+.08},{...p,y:y+rules.height},.1)){free=false;break;}
    }
    for(const t of combat?.targets?.values()??[]){
      if(!t.alive||t.targetable===false||t.projectileColliderOnly)continue;
      const tx=t.position.x-middle.x,tz=t.position.z-middle.z;
      if(Math.abs((t.position.y??y)-y)<rules.height&&Math.abs(tx*cos-tz*sin)<step/2+(t.radius??.45)+.15&&Math.abs(tx*sin+tz*cos)<rules.depth/2+(t.radius??.45)+.15)free=false;
    }
    if(!free){close(a);continue;}
    if(start!==null&&Math.abs(y-base)>.25)close(a);
    if(start===null){start=a;base=y;}
  }
  close(rules.width/2);
  return{center,angle,spans,valid:length*factor>=2&&spans.length>0};
}
