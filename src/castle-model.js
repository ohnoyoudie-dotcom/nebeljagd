import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getHouseAppearance } from './map/house-builder.js';
import { getHouseMaterialColors } from './map/house-colors.js';
import { createWaldhausSurface } from './waldhaus-materials.js';
import { createWaldhausStoneSegment, WALDHAUS_STONE_LENGTH } from './waldhaus-stone.js';

const seeded = seed => { let state=seed;return () => {state=(Math.imul(state,1664525)+1013904223)|0;return (state>>>0)/4294967296;}; };

// Forty-four triangles give each block real chamfers and broken corners. The
// three shared shapes are instanced; a castle does not allocate a mesh per stone.
function dressedBlock(seed=0, slab=false) {
  const random=seeded(seed+671),positions=[],normals=[],uvs=[],b=slab?.014:.065;
  const push=(points,normal)=>{
    const a=new THREE.Vector3(...points[0]),c=new THREE.Vector3(...points[1]),d=new THREE.Vector3(...points[2]);
    if(c.sub(a).cross(d.sub(a)).dot(new THREE.Vector3(...normal))<0)points.reverse();
    const n=new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]),new THREE.Vector3(...points[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]),new THREE.Vector3(...points[0]))).normalize();
    for(let i=1;i<points.length-1;i++)for(const v of [points[0],points[i],points[i+1]]) {
      positions.push(...v);normals.push(n.x,n.y,n.z);
      const ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
      uvs.push((ay>ax&&ay>az?v[0]:ax>az?v[2]:v[0])+.5+seed*.173,(ay>ax&&ay>az?v[2]:v[1])+.5+seed*.257);
    }
  };
  if(slab) {
    push([[-.5+b,.5,-.5+b],[.5-b,.5,-.5+b],[.5-b,.5,.5-b],[-.5+b,.5,.5-b]],[0,1,0]);
    for(let axis=0;axis<3;axis+=2)for(const sign of [-1,1]) {
      const across=axis===0?2:0,p=[];
      for(const [side,top] of [[-1,false],[1,false],[1,true],[-1,true]]) {
        const v=[0,0,0];v[axis]=sign*(top?.5-b:.5);v[across]=side*(top?.5-b:.5);v[1]=top?.5:-.5;p.push(v);
      }
      const normal=[0,.5,0];normal[axis]=sign;push(p,normal);
    }
  } else {
    const inset=.5-b;
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]) {
      const other=[0,1,2].filter(k=>k!==axis),p=[];
      for(const [u,v]of [[-1,-1],[1,-1],[1,1],[-1,1]]){const q=[0,0,0];q[axis]=sign*.5;q[other[0]]=u*inset;q[other[1]]=v*inset;p.push(q);}
      const normal=[0,0,0];normal[axis]=sign;push(p,normal);
    }
    for(let axis=0;axis<3;axis++)for(let second=axis+1;second<3;second++)for(const a of [-1,1])for(const c of [-1,1]) {
      const third=3-axis-second,p=[];
      for(const [v,swapped]of [[-1,false],[1,false],[1,true],[-1,true]]) {const q=[0,0,0];q[axis]=a*(swapped?inset:.5);q[second]=c*(swapped?.5:inset);q[third]=v*inset;p.push(q);}
      const normal=[0,0,0];normal[axis]=a;normal[second]=c;push(p,normal);
    }
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]) {
      const signs=[x,y,z],p=[];for(let axis=0;axis<3;axis++)p.push(signs.map((s,k)=>s*(axis===k?.5:inset)));
      push(p,signs);
    }
  }
  // A continuous warp keeps coincident vertices together. It changes the bevel
  // silhouette without noisy per-triangle cracks or round pebble-like masonry.
  const phase=random()*6;
  for(let i=0;i<positions.length;i+=3) {
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    if(!slab){positions[i]+=Math.sin(y*4+z*3+phase)*.008;positions[i+2]+=Math.sin(x*3-y*4+phase)*.009;}
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

/** Empty, roofless castle architecture. All walkable space and wall openings
 * are supplied by the shared editor/collision plan, including the open court. */
export function createCastleModel({definition:def,stoneMaterial,houseStyle,houseSeed,houseStoneColor,houseWallColor}={}) {
  if(!def||def.architecture!=='castle')throw new TypeError('Castle model needs the shared castle definition.');
  const appearance=getHouseAppearance({houseStyle,houseSeed}),colors=getHouseMaterialColors({houseStoneColor,houseWallColor});
  const random=seeded(appearance.seed),floor=def.floorHeight,stoneTint=new THREE.Color(colors.stone.color),woodTint=new THREE.Color(appearance.woodTint);
  const wallTint=new THREE.Color(colors.wall.color??appearance.plasterTint);
  const group=new THREE.Group(),outer=new THREE.Group(),roof=new THREE.Group(),frontFacade=new THREE.Group(),interior=new THREE.Group();
  group.name=def.label;outer.name='Schlossanlage · verwittertes Mauerwerk';interior.name='Schlossanlage · Säle und Wandelgänge';
  roof.name='Schlossanlage · offener Dachschnitt';roof.visible=false;frontFacade.name='Schlossanlage · offene Vorderfassade';group.add(outer,roof,frontFacade,interior);
  const materials=new Set(),textures=new Set(),geometries=new Set(),batches=new Map();
  const makeMaterial=(name,kind,options={})=>{
    const maps=kind?createWaldhausSurface(kind):{};for(const texture of Object.values(maps))if(texture)textures.add(texture);
    const material=new THREE.MeshStandardMaterial({roughness:.95,...maps,...(kind?{bumpScale:kind==='wood'?.045:.07}:{}),...options});
    material.name='Schlossanlage · '+name;materials.add(material);return material;
  };
  const stone=makeMaterial('behauener Feldstein','stone'),paving=makeMaterial('abgetretene Kalksteinplatten','stone',{bumpScale:.045}),wood=makeMaterial('dunkles Eichenholz','wood'),plaster=makeMaterial('Kalkputz','plaster'),mortar=makeMaterial('vertiefte Fugen',null),iron=makeMaterial('geschwärztes Eisen',null,{metalness:.7,roughness:.6}),glass=makeMaterial('rauchiges Bleiglas',null,{metalness:.1,roughness:.38});
  const blocks=Array.from({length:3},(_,i)=>dressedBlock(i)),slabs=Array.from({length:2},(_,i)=>dressedBlock(i,true));
  const cube=new THREE.BoxGeometry(1,1,1);[...blocks,...slabs,cube].forEach(geo=>geometries.add(geo));
  const dummy=new THREE.Object3D(),tint=new THREE.Color();let parts=0,stones=0,floorTiles=0;
  function box(parent,material,x,y,z,w,h,d,color,rotation=0,shape=blocks[parts%3]) {
    if(w<=0||h<=0||d<=0)return;
    const key=parent.uuid+':'+material.uuid+':'+shape.uuid;
    if(!batches.has(key))batches.set(key,{parent,material,shape,instances:[]});
    tint.set(color);
    if(material===stone||material===paving)tint.multiply(stoneTint);
    if(material===wood)tint.multiply(woodTint);
    if(material===plaster)tint.multiply(wallTint);
    dummy.position.set(x,y,z);dummy.rotation.set(0,rotation,0);dummy.scale.set(w,h,d);dummy.updateMatrix();
    batches.get(key).instances.push({matrix:dummy.matrix.clone(),color:tint.clone()});parts++;
  }
  const pick=(a,b)=>new THREE.Color(a).lerp(new THREE.Color(b),random()).getHex();
  // Stone floors are laid in irregular, staggered courses rather than a huge
  // repeated grid. Only covered floor rectangles receive a foundation.
  for(const area of def.floorAreas) {
    const width=area.maxX-area.minX,depth=area.maxZ-area.minZ;
    box(interior,mortar,(area.minX+area.maxX)/2,floor-.11,(area.minZ+area.maxZ)/2,width,.13,depth,'#726c59',0,cube);
    if(area.material==='wood') {
      const alongZ=area.alongZ!==false,acrossMin=alongZ?area.minX:area.minZ,acrossMax=alongZ?area.maxX:area.maxZ;
      const alongMin=alongZ?area.minZ:area.minX,alongMax=alongZ?area.maxZ:area.maxX;
      for(let edge=acrossMin;edge<acrossMax-.001;) {
        const width=Math.min(.42+random()*.16,acrossMax-edge),across=edge+width/2;edge+=width;
        for(let start=alongMin;start<alongMax-.001;) {
          let length=Math.min((start===alongMin?1:2)+random()*2.4,alongMax-start);if(alongMax-start-length<.35)length=alongMax-start;
          const along=start+length/2;start+=length;
          box(interior,wood,alongZ?across:along,floor-.025,alongZ?along:across,alongZ?width-.012:length-.014,.05,alongZ?length-.014:width-.012,pick('#827052','#9b8460'),0,cube);floorTiles++;
        }
      }
    } else {
      for(let z=area.minZ;z<area.maxZ-.001;) {
        const row=Math.min(1.1+random()*.35,area.maxZ-z),cz=z+row/2;
        for(let x=area.minX;x<area.maxX-.001;) {
          let span=Math.min((x===area.minX?.6:1.25)+random()*.75,area.maxX-x);if(area.maxX-x-span<.35)span=area.maxX-x;
          const cx=x+span/2;
          const distance=Math.min(cx-area.minX,area.maxX-cx,cz-area.minZ,area.maxZ-cz);
          const c=new THREE.Color(pick('#a19a80','#b5ac91')).multiplyScalar(distance<.7?.88:1);
          box(interior,paving,cx,floor-.035,cz,span-.025,.07,row-.025,c,0,slabs[floorTiles%2]);floorTiles++;x+=span;
        }
        z+=row;
      }
    }
  }
  // Borrow only the original wall material maps. The owning environment kit
  // remains alive when an individual castle is removed from the scene.
  const sourceMaterial=stoneMaterial?.clone()??makeMaterial('Steinsockel Vorschau','stone');
  sourceMaterial.color.multiply(stoneTint);sourceMaterial.name='Schlossanlage · originale Tripo-Sockel';materials.add(sourceMaterial);
  const basePieces=[];
  for(const wall of def.architecturalWalls) {
    const w=wall.maxX-wall.minX,d=wall.maxZ-wall.minZ,alongX=w>d,length=alongX?w:d,thickness=alongX?d:w;
    const cx=(wall.minX+wall.maxX)/2,cz=(wall.minZ+wall.maxZ)/2,height=wall.maxY-floor;
    const bearing=alongX?0:Math.PI/2;
    // The highly sculpted source stones are reserved for the exposed outer
    // north/south plinths; the rest uses the same full-scale dressed masonry.
    const originalBase=alongX&&wall.external&&(Math.abs(cz)>def.footprint.halfDepth-1);
    box(outer,mortar,cx,floor+height/2,cz,w-.06,height-.02,d-.06,'#605e50',0,cube);
    if(originalBase)for(let start=0;start<length-.001;start+=WALDHAUS_STONE_LENGTH) {
      const span=Math.min(WALDHAUS_STONE_LENGTH,length-start),geo=createWaldhausStoneSegment(span);
      geo.scale(1,1,thickness/.36);geo.translate(cx-length/2+start+WALDHAUS_STONE_LENGTH/2,floor,cz);basePieces.push(geo);
    }
    const base=originalBase?.6:0,available=height-base-.17,courses=Math.max(1,Math.round(available/.49)),courseHeight=available/courses;
    for(let row=0;row<courses;row++) {
      const y=floor+base+(row+.5)*courseHeight;
      for(let offset=0;offset<length-.001;) {
        let span=Math.min((offset===0?.65:1.35)+random()*.65,length-offset);if(length-offset-span<.38)span=length-offset;
        const center=-length/2+offset+span/2,depth=thickness-.025+random()*.015;
        box(outer,stone,cx+(alongX?center:0),y,cz+(alongX?0:center),span-.035,courseHeight-.028,depth,pick('#9b957f','#b5aa8f'),bearing);stones++;offset+=span;
      }
    }
    // Individually cut coping pieces make wall direction and open door gaps
    // legible at the overhead game camera without a continuous timber outline.
    for(let offset=0;offset<length-.001;) {
      const span=Math.min(1.12+random()*.3,length-offset),center=-length/2+offset+span/2;
      box(outer,stone,cx+(alongX?center:0),floor+height-.07,cz+(alongX?0:center),span-.018,.16,thickness+.025,pick('#b3ab91','#c1b89d'),bearing,slabs[0]);offset+=span;
    }
  }
  if(basePieces.length) {
    const geo=mergeGeometries(basePieces,false);basePieces.forEach(piece=>piece.dispose());geometries.add(geo);
    const mesh=new THREE.Mesh(geo,sourceMaterial);mesh.name='Schlossanlage · originale verwitterte Sockelsteine';mesh.castShadow=mesh.receiveShadow=true;outer.add(mesh);
  }
  // The chamber walls carry restrained limewash panels framed by heavy oak.
  // Panels lie on an existing wall face; they never create new collision.
  for(const area of def.floorAreas.filter(a=>a.material==='wood')) {
    for(const wall of def.architecturalWalls) {
      const w=wall.maxX-wall.minX,d=wall.maxZ-wall.minZ,alongX=w>d;
      const from=alongX?Math.max(wall.minX,area.minX+.1):Math.max(wall.minZ,area.minZ+.1);
      const to=alongX?Math.min(wall.maxX,area.maxX-.1):Math.min(wall.maxZ,area.maxZ-.1);
      if(to-from<1.8)continue;
      const fixed=(alongX?wall.minZ+wall.maxZ:wall.minX+wall.maxX)/2;
      const min=alongX?area.minZ:area.minX,max=alongX?area.maxZ:area.maxX;
      let sign;if(Math.abs(fixed-min)<.6)sign=1;else if(Math.abs(fixed-max)<.6)sign=-1;else continue;
      const face=fixed+sign*((alongX?d:w)/2+.015),span=to-from-.18,center=(from+to)/2;
      box(outer,plaster,alongX?center:face,floor+1.72,alongX?face:center,alongX?span:.026,1.48,alongX?.026:span,'#c4bda6',0,cube);
      for(const y of [.94,2.52])box(outer,wood,alongX?center:face+sign*.022,floor+y,alongX?face+sign*.022:center,alongX?span+.05:.1,.12,alongX?.1:span+.05,'#63503c',0,cube);
      const bays=Math.ceil(span/2.5);
      for(let i=0;i<=bays;i++){const p=center-span/2+i*span/bays;box(outer,wood,alongX?p:face+sign*.02,floor+1.72,alongX?face+sign*.02:p,alongX?.13:.1,1.65,alongX?.1:.13,'#69553c',0,cube);}
    }
  }
  function portal(x,z,width,alongX,depth) {
    const bearing=alongX?0:Math.PI/2,clearHalf=width/2;
    // Both the frame and its base are outside the plan's useful door width.
    for(const sign of [-1,1]) {
      const p=sign*(clearHalf+.22),px=x+(alongX?p:0),pz=z+(alongX?0:p);
      for(let row=0;row<6;row++)box(outer,stone,px,floor+(row+.5)*.49,pz,.42,.47,depth+.045,pick('#b6ab90','#cbc0a2'),bearing);
      box(outer,stone,px,floor+3.015,pz,.48,.13,depth+.085,'#c3b89a',bearing);
    }
    box(interior,paving,x,floor-.018,z,alongX?width:depth,.044,alongX?depth:width,'#c4b99a',0,slabs[0]);
    // Flush dark band separates the threshold from the surrounding paving.
    for(const side of [-1,1])box(interior,stone,x+(alongX?0:side*(depth/2-.04)),floor-.009,z+(alongX?side*(depth/2-.04):0),alongX?width:.055,.023,alongX?.055:width,'#827a67',0,cube);
  }
  for(const door of def.interiorDoorways)portal(door.x,door.z,door.width,door.axis==='x',door.depth??.5);
  for(const entry of def.entrances) {
    const alongX=['north','south'].includes(entry.side),wallCenter=(entry.boundary+entry.innerBoundary)/2;
    portal(alongX?entry.center:wallCenter,alongX?wallCenter:entry.center,entry.max-entry.min,alongX,Math.abs(entry.boundary-entry.innerBoundary));
    const sign=['north','west'].includes(entry.side)?-1:1;
    // Two shallow slabs match the movement ramp, including courtyard doors.
    for(const [offset,height,depth]of [[.22,.12,.42],[.55,.06,.26]])box(outer,paving,
      alongX?entry.center:entry.boundary+sign*offset,height/2,alongX?entry.boundary+sign*offset:entry.center,
      alongX?entry.max-entry.min:depth,height,alongX?depth:entry.max-entry.min,'#afa58c',0,slabs[0]);
  }
  for(const window of def.windows) {
    const alongX=['north','south'].includes(window.side),rotation=alongX?0:Math.PI/2;
    // The shared window boundary is the interior wall face. Positive depth
    // must point into its room, not bury glazing and mullions inside masonry.
    const sign=['north','west'].includes(window.side)?1:-1,width=window.width??1.4,height=window.height??1.35;
    const fixed=window.boundary,center=window.center,y=floor+(window.sillHeight??1.05)+height/2;
    const panel=(material,offsetX,offsetY,offsetDepth,w,h,d,color)=>box(outer,material,
      alongX?center+offsetX:fixed+sign*offsetDepth,y+offsetY,alongX?fixed+sign*offsetDepth:center+offsetX,w,h,d,color,rotation,cube);
    panel(wood,0,0,.035,width+.18,height+.18,.12,'#3f3b30');
    panel(glass,0,0,.105,width-.12,height-.1,.035,'#697e77');
    for(const side of [-1,1])panel(stone,side*(width/2+.13),0,.06,.21,height+.38,.25,'#b6ac91');
    for(const side of [-1,1])panel(stone,0,side*(height/2+.12),.09,width+.44,.22,.34,'#bdb293');
    for(const offset of [-width*.24,width*.24])panel(iron,offset,0,.14,.035,height-.1,.045,'#4b4b3f');
    panel(iron,0,0,.14,width-.12,.035,.045,'#4b4b3f');
  }
  for(const {parent,material,shape,instances}of batches.values()) {
    const mesh=new THREE.InstancedMesh(shape,material,instances.length);mesh.name=material.name;
    instances.forEach(({matrix,color},index)=>{mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color);});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    mesh.castShadow=material!==glass;mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);
  }
  let triangles=0,drawCalls=0;group.traverse(node=>{if(node.isMesh){drawCalls++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3*(node.isInstancedMesh?node.count:1);}});
  const stats={drawCalls,triangles,parts,stones,floorTiles,rooms:def.roomCount??def.rooms.length,entrances:def.entrances.length};
  group.userData.castle={...stats,style:'weathered-stone-courtyard-castle',variant:def.variant,floorHeight:floor,houseSeed:appearance.seed,houseStyle:appearance.style,houseStoneColor:colors.stone.id,houseWallColor:colors.wall.id};
  let disposed=false;
  return {group,roof,frontFacade,interior,stats,dispose(){if(disposed)return;disposed=true;group.traverse(node=>{if(node.isInstancedMesh)node.dispose();});geometries.forEach(geo=>geo.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());group.removeFromParent();}};
}
