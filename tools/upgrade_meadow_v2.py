"""Upgrade the existing terrain layer without replacing maps or object systems."""
from pathlib import Path
HERE=Path(__file__).resolve().parent/'grass-ground'
if 'rei-ground-dense-wind-v3' in (HERE/'runtime.js').read_text():
    print('Meadow v2 is already applied.'); raise SystemExit(0)
def change(text,old,new):
    found=text.count(old)
    if found!=1:raise RuntimeError(f'Expected one anchor, got {found}: {old[:100]}')
    return text.replace(old,new)
def edit(name,pairs):
    p=HERE/name;text=p.read_text(encoding='utf-8')
    for old,new in pairs:text=change(text,old,new)
    p.write_text(text,encoding='utf-8')
edit('common.js',[
 ('version: 1, type:','version: 2, type:'),
 ('height: number(s.height, .65, .15, 2.0), density: number(s.density, 1.6, .35, 3),','height: number(s.height, .85, .15, 2.0), density: number(s.version === 2 ? s.density : Number.isFinite(s.density) ? s.density * 6 : 9.6, 9.6, 2, 18),'),
 ("'#78ab43'","'#659a36'"),
 ('groundBlend: number(s.groundBlend, .55, 0, 1)','groundBlend: number(s.groundBlend, .35, 0, 1)'),
 ('for(const line of [...map.paths,...map.rivers])','for(const line of [...(map.paths||[]),...(map.rivers||[])])'),
 ("if(obj.kind!=='house') continue;","if(!['house','chest','crate','rock','mound','shrine'].includes(obj.kind)) continue;"),
 ("const hx=(tavern?12.35:obj.variant==='kit-timber'?3.7:8.5)*scale;","const extents={chest:[1.02,.77],crate:[.76,.76],rock:[1.35,1.35],shrine:[1,1],mound:obj.variant==='knoll'?[3.3,2.8]:[6.3,3.3]};\n    const hx=(extents[obj.kind]?.[0]??(tavern?12.35:obj.variant==='kit-timber'?3.7:8.5))*scale;"),
 ("const hz=(tavern?12.35:obj.variant==='kit-timber'?4.0:7.5)*scale;","const hz=(extents[obj.kind]?.[1]??(tavern?12.35:obj.variant==='kit-timber'?4.0:7.5))*scale;")
])
edit('editor.js',[
 ("Number(v).toFixed(1)+'×',groundBlend","Number(v).toFixed(1)+' / m²',groundBlend"),
 ('min="0.35" max="3" step="0.05"','min="2" max="18" step="0.5"'),
 ('Rei-Wiese · mit Wind','Dichte Rei-Wiese · mit Wind'),
 ('NEU · GRAS','DICHTE WIESE'),
 ('Schematische Materialvorschau des Grases','Schematische Grasvorschau – das 3D-Spiel zeigt die echte Wiese'),
 ('i<64','i<130'),('(s.height/.65)','(s.height/.85)')
])
edit('runtime.js',[
 ('chunkSize=12','chunkSize=10'),('alphaTest:.26','alphaTest:.22'),
 ('float reiGust=.58+.42*sin(dot(reiRoot,vec2(.073,.097))-reiTime*reiSpeed*.65);','float reiGust=.55+.45*sin(dot(reiRoot,reiDirection)*.28-reiTime*reiSpeed*1.15);'),
 ('float reiWave=sin(reiPhase+reiTime*reiSpeed*1.7)+.32*sin(reiPhase*2.3+reiTime*reiSpeed*2.9);','float reiWave=.45+sin(dot(reiRoot,reiDirection)*.47-reiTime*reiSpeed*1.5)*.65+.22*sin(reiPhase*2.3+reiTime*reiSpeed*2.4);'),
 ('float reiBend=pow(uv.y,2.)*reiWind*(.16+reiGust*.30)*reiWave;','float reiBend=pow(uv.y,1.7)*reiWind*(.22+reiGust*.35)*reiWave;'),
 ('vReiTile=vec2(mod(reiId,2.),1.);','vReiTile=vec2(mod(reiId,2.),floor(reiId/2.));'),
 ('diffuseColor.rgb*=mix(vec3(.71,.79,.64),vec3(1.15,1.12,.91),smoothstep(0.,1.,vReiHeight));','diffuseColor.rgb*=mix(vec3(.43,.54,.32),vec3(1.12,1.14,.83),smoothstep(0.,1.,vReiHeight));'),
 ('rei-ground-rooted-wind-v2','rei-ground-dense-wind-v3'),
 ('for(let card=0;card<2;card++)','for(let card=0;card<3;card++)'),
 ('const angle=card*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),base=positions.length/3;','const angle=card*2.39996,c=Math.cos(angle),s=Math.sin(angle),base=positions.length/3;'),
 ('positions.push(edge*c+h*h*.10*s,h,edge*s+h*h*.10*c);','const lean=.12+Math.pow(h,1.6)*.48;\n      positions.push(edge*c+lean*s,h,edge*s-lean*c);'),
 ("const spacing=1/Math.sqrt(settings.density*(currentQuality==='low'?.65:1));","const spacing=1/Math.sqrt(settings.density*(currentQuality==='low'?.60:1));"),
 ('const h=settings.height*(.75+.5*hash(gx,gz,63)),w=.82+.4*hash(gx,gz,73);','const h=settings.height*(.72+.54*hash(gx,gz,63)),w=.66+.30*hash(gx,gz,73);'),
 ('colorAt(x,z,groundColor);color.copy(baseColor).lerp(groundColor,settings.groundBlend).multiplyScalar(.90+hash(gx,gz,97)*.20);','colorAt(x,z,groundColor);\n      const patch=.91+.11*Math.sin(x*.12+Math.sin(z*.09))+.07*Math.cos(z*.18-x*.05);\n      color.copy(baseColor).lerp(groundColor,settings.groundBlend*.55).multiplyScalar(patch*(.86+hash(gx,gz,97)*.24));'),
 ("const radius=currentQuality==='low'?32:46;","const radius=currentQuality==='low'?28:38;"),
 ('frame===1?9:2','frame===1?9:3'),
 ("source:'Blender/Gras/textures/grass4_mask_01.png'","source:'Blender/Gras/textures/grass4_mask_02.png',cardsPerTuft:3,layoutVersion:2"),
 ("excludedAreas:'paths, rivers, sea, rotated house footprints'","excludedAreas:'paths, rivers, sea, rotated buildings, chests, crates, rocks and shrines'")
])
edit('build.py',[
 ('grass4_mask_01.png','grass4_mask_02.png'),
 ("for name,content in [('map-editor.html',editor),('nebeljagd.html',game)]:","exec((SRC/'regression_patch.py').read_text(),globals())\nfor name,content in [('map-editor.html',editor),('nebeljagd.html',game)]:")
])
(HERE/'solid-bodies.js').write_text(r'''/* Movement-only actor separation. Combat and visibility rules stay intact. */
function reiSeparateActors(position,radius,targets,ignoredId,playerPosition=null) {
 let changed=false;
 const bodies=[...(targets?.values?.()||[])];
 if(playerPosition)bodies.push({id:'player',position:playerPosition,radius:.42,height:2.25,alive:true});
 for(const body of bodies){
  if(body.id===ignoredId||body.alive===false||body.solid===false||!body.position)continue;
  if(Math.abs((body.position.y||0)-(position.y||0))>(body.height||2.25))continue;
  let dx=position.x-body.position.x,dz=position.z-body.position.z;
  const limit=radius+(body.radius||.52)+.002,distance=Math.hypot(dx,dz);
  if(distance>=limit)continue;
  if(distance<1e-8){dx=1;dz=0;}else{dx/=distance;dz/=distance;}
  position.x=body.position.x+dx*limit;position.z=body.position.z+dz*limit;changed=true;
 }
 return changed;
}
function reiMoveSolid(position,from,radius,world,targets,ignoredId='player',playerPosition=null){
 const dx=position.x-from.x,dz=position.z-from.z;
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/Math.min(.16,radius*.4)));
 position.x=from.x;position.z=from.z;
 for(let i=0;i<steps;i++){
  position.x+=dx/steps;position.z+=dz/steps;
  for(let pass=0;pass<4;pass++){
   world.resolveMovement(position,radius);
   if(!reiSeparateActors(position,radius,targets,ignoredId,playerPosition))break;
  }
  world.resolveMovement(position,radius);
 }
 return position;
}
function reiChestRayClear(world,chest,x,z,height){
 if(!world?.traceProjectile)return true;
 const dx=x-chest.x,dz=z-chest.z,d=Math.hypot(dx,dz);
 if(d<1e-6)return false;
 const angle=chest.group?.rotation?.y||0,c=Math.cos(angle),s=Math.sin(angle);
 const lx=(dx*c-dz*s)/d,lz=(dx*s+dz*c)/d,scale=chest.scale||1;
 const exit=Math.min(Math.abs(lx)>1e-8?.88*scale/Math.abs(lx):Infinity,Math.abs(lz)>1e-8?.59*scale/Math.abs(lz):Infinity)+.06;
 const start=Math.min(exit,d);
 const hit=world.traceProjectile({x:chest.x+dx/d*start,y:height+.5,z:chest.z+dz/d*start},{x,y:height+.5,z},.04);
 return !hit||hit.collider?.objectId===chest.id||hit.collider?.id===chest.id;
}
''',encoding='utf-8')
(HERE/'regression_patch.py').write_text(r'''# Executed in build.py after the original grass integration.
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
      // Angular filtering only changes the visual penumbra, never actor secrecy.
      float angularStep = .26 / max(distanceToViewer, 2.) / 6.28318530718;
      for (int tap = -4; tap <= 4; tap++) {
        float weight = 5. - abs(float(tap));
        float limit = texture2D(uTacticalSight, vec2(fract(angle + float(tap)*angularStep + .5 / ${a.toFixed(1)}), .5)).r * uTacticalRadius;
        visibility += weight * (1. - smoothstep(limit - .2, limit + 1.6, distanceToViewer));
      }
      visibility /= 25.;
      float radiusFade = 1. - smoothstep(uTacticalRadius - 4.5, uTacticalRadius + .25, distanceToViewer);
      visibility = min(radiusFade, visibility);
      float luminance = dot(color, vec3(.2126,.7152,.0722));
      vec3 obscured = mix(color,vec3(luminance),.10)*.20;
      return mix(obscured,color,visibility);"""
game=game[:start]+shader+game[end:]
game=once(game,'tactical-sight-v2-pale','tactical-sight-v3-soft-charcoal')
game=once(game,'appearance:`translucent-blue-grey`,sceneryTransmission:.42','appearance:`soft-transparent-charcoal`,sceneryTransmission:.20,softEdges:true')
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
''',encoding='utf-8')
print('Dense meadow, static boxes, bidirectional actor collisions and dark soft vision applied.')
