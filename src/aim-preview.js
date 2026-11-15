import * as THREE from 'three';
export function createAimPreview(scene,world){
 const geometry=new THREE.BufferGeometry(),positions=new Float32Array(384);geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 const material=new THREE.LineBasicMaterial({color:'#a6e6ff',transparent:true,opacity:.75,depthWrite:false});
 const line=new THREE.Line(geometry,material);line.frustumCulled=false;line.visible=false;scene.add(line);let mode=null;
 const height=p=>(world.heightAt?.(p.x,p.z)??0)+.09;
 return {hide(){line.visible=false;mode=null;},update(origin,direction,kind,range=6,target=null,arcHeight=0){
   line.visible=kind==='direction'||kind==='wave'||(kind==='arc'&&!!target);mode=line.visible?kind:null;if(!line.visible)return;
   const dx=Math.sin(direction),dz=Math.cos(direction),points=[];
   if(kind==='arc'&&target){for(let i=0;i<=32;i++){const t=i/32;points.push({x:origin.x+(target.x-origin.x)*t,z:origin.z+(target.z-origin.z)*t,y:(origin.y+1.4)*(1-t)+(target.y??height(target))*t+4*t*(1-t)*arcHeight});}}
   else if(kind==='wave'){
     const nodes=[];let previous=origin;
     for(let d=.4;d<=range;d+=.4){const p={x:origin.x+dx*d,z:origin.z+dz*d};p.y=height(p);
       if(world.isWater?.(p.x,p.z)||world.isLand&&!world.isLand(p.x,p.z)||Math.abs(p.y-height(previous))>.55||world.traceProjectile?.({...previous,y:height(previous)+.3},{...p,y:p.y+.3},.12))break;
       nodes.push({...p,w:(1.35+1.45*d/range)/2});previous=p;}
     for(const p of nodes)points.push({x:p.x+dz*p.w,y:p.y,z:p.z-dx*p.w});
     for(const p of [...nodes].reverse())points.push({x:p.x-dz*p.w,y:p.y,z:p.z+dx*p.w});if(points.length)points.push(points[0]);
   }else{const length=Math.min(range,6),end={x:origin.x+dx*length,z:origin.z+dz*length};points.push({...origin,y:height(origin)},{...end,y:height(end)}, {x:end.x-dx*.5+dz*.25,y:height(end),z:end.z-dz*.5-dx*.25},{...end,y:height(end)},{x:end.x-dx*.5-dz*.25,y:height(end),z:end.z-dz*.5+dx*.25});}
   points.slice(0,128).forEach((p,i)=>positions.set([p.x,p.y,p.z],i*3));geometry.setDrawRange(0,Math.min(128,points.length));geometry.attributes.position.needsUpdate=true;
 },get mode(){return mode;},dispose(){line.removeFromParent();geometry.dispose();material.dispose();}};
}
