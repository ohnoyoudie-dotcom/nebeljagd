game=once(game,'if(r.opened||!i(u(r)))continue;','if(r.opened)continue;')
game=once(game,'Jm.outputColorSpace=N,Jm.toneMapping=4,Jm.toneMappingExposure=1,Jm.shadowMap.enabled=!0,Jm.shadowMap.type=2;','Jm.outputColorSpace=N,Jm.toneMapping=4,Jm.toneMappingExposure=1,Jm.shadowMap.enabled=!0,Jm.shadowMap.type=3;')
game=once(game,'eh.shadow.bias=-15e-5,eh.shadow.normalBias=.035,eh.shadow.radius=3,','eh.shadow.bias=-8e-5,eh.shadow.normalBias=.018,eh.shadow.mapSize.set(2048,2048),eh.shadow.radius=5,eh.shadow.blurSamples=16,')
# Executed in build.py after the original grass integration.
game=once(game,'<script type="module">','<script type="module">'+(SRC/'solid-bodies.js').read_text()+'\n')
game=once(game,'let[t,n]=e.position,i=e.scale,a=e.variant;if(pe(t,n).count++','if(e.kind===`chest`)_e(e,[{minX:-.87,maxX:.87,minZ:-.58,maxZ:.58,maxY:.95}],null);let[t,n]=e.position,i=e.scale,a=e.variant;if(pe(t,n).count++')
game=once(game,'e.kind===`crate`&&he(e,.55,.9)','e.kind===`crate`&&_e(e,[{minX:-.56,maxX:.56,minZ:-.56,maxZ:.56,maxY:1.05}],null)')
game=once(game,'function d(e,t){return!r?.traceProjectile?.({x:t.x,y:(t.y??n(t.x,t.z))+.65,z:t.z},u(e),.03)}','function d(e,t){const hit=r?.traceProjectile?.({x:t.x,y:(t.y??n(t.x,t.z))+.65,z:t.z},u(e),.03);return !hit||hit.collider?.objectId===e.id||hit.collider?.id===e.id}')
game=once(game,'if(!n?.traceProjectile?.({x:i,y:o+.5,z:a},{x:u,y:f+.5,z:d},.12))return[u,d]','if(reiChestRayClear(n,e,u,d,o))return[u,d]')
game=once(game,'$.addScaledVector(_h,n*e),Q.resolveMovement($,.42)','$.addScaledVector(_h,n*e),reiMoveSolid($,vh,.42,Q,uh.targets,`player`)')
game=once(game,'let j=new q,M=new q;function P(e,n,a)','const reiActorTargets=n.targets;let j=new q,M=new q;function P(e,n,a)')
game=once(game,'c.position.copy(M),t.resolveMovement?.(c.position,.52)','c.position.copy(M),reiMoveSolid(c.position,j,.52,t,reiActorTargets,e.id,a)')
start=game.index('      float limit = texture2D(uTacticalSight,')
end=game.index('      return mix(obscured, color, visibility);',start)+len('      return mix(obscured, color, visibility);')
shader="""      float visibility = 0.;
      // Wider angular filtering + sub-pixel dithering removes visible 8-bit distance bands.
      float angularStep = .20 / max(distanceToViewer, 2.) / 6.28318530718;
      float dither = (fract(sin(dot(point, vec2(12.9898,78.233))) * 43758.5453) - .5) * .16;
      for (int tap = -6; tap <= 6; tap++) {
        float weight = 7. - abs(float(tap));
        float limit = texture2D(uTacticalSight, vec2(fract(angle + float(tap)*angularStep + .5 / ${a.toFixed(1)}), .5)).r * uTacticalRadius;
        visibility += weight * (1. - smoothstep(limit - .55, limit + 2.65, distanceToViewer + dither));
      }
      visibility /= 49.;
      float radiusFade = 1. - smoothstep(uTacticalRadius - 6.0, uTacticalRadius + .35, distanceToViewer + dither);
      visibility = min(radiusFade, visibility);
      visibility = visibility*visibility*(3.0-2.0*visibility);
      float luminance = dot(color, vec3(.2126,.7152,.0722));
      vec3 obscured = mix(color,vec3(luminance),.08)*.20;
      return mix(obscured,color,visibility);"""
game=game[:start]+shader+game[end:]
game=once(game,'tactical-sight-v2-pale','tactical-sight-v4-continuous-charcoal')
game=once(game,'appearance:`translucent-blue-grey`,sceneryTransmission:.42','appearance:`soft-transparent-charcoal`,sceneryTransmission:.20,softEdges:true,continuousFalloff:true')
extra="""
if(new URLSearchParams(location.search).has('inspect')){
 window.nebeljagdMovementProbe=({from,to,radius=.42,actors=true})=>{
  const start=new q(from[0],Q.heightAt(from[0],from[1]),from[1]);
  const p=new q(to[0],Q.heightAt(to[0],to[1]),to[1]);
  reiMoveSolid(p,start,radius,Q,actors?uh.targets:null,'player');return {x:p.x,z:p.z};
 };
 window.nebeljagdActorProbe=({id,from,to})=>{
  const target=uh.targets.get(id);if(!target)throw new Error('Unknown actor');
  const a=new q(from[0],Q.heightAt(from[0],from[1]),from[1]);
  const b=new q(to[0],Q.heightAt(to[0],to[1]),to[1]);
  reiMoveSolid(b,a,target.radius,Q,uh.targets,id,$);return {x:b.x,z:b.z};
 };
 window.nebeljagdPhysicsState=()=>({chestBodies:Q.projectileObstacles.filter(b=>b.type==='chest').length,crateBodies:Q.projectileObstacles.filter(b=>b.type==='crate').length,liveActors:[...uh.targets.values()].filter(b=>b.id!=='player'&&b.alive).map(b=>({id:b.id,radius:b.radius,x:b.position.x,z:b.position.z}))});
}
"""
end=game.index('</script>');game=game[:end]+extra+game[end:]

game=once(game,'window.nebeljagdPhysicsState=()=>',"window.nebeljagdCaptureFrame=()=>{Jm.render(Ym,Xm);return Jm.domElement.toDataURL('image/png')};window.nebeljagdPhysicsState=()=>")

game=once(game,'let s=_m({obstacles:r.projectileObstacles,radius:i,samples:a})','let s=_m({obstacles:r.projectileObstacles.filter(b=>![`chest`,`crate`].includes(b.type)),radius:i,samples:a})')
