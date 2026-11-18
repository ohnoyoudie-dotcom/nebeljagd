import * as THREE from 'three';
import { getHouseAppearance } from './map/house-builder.js';
import { getCastleMaterialColors } from './map/castle-colors.js';
import { createCastleSurface } from './castle-materials.js';
import { createCastleTorches } from './castle-torches.js';
import { createCastleCourtyards } from './castle-courtyards.js';
import { addCastleFortifications } from './castle-fortifications.js';
import { createCastleCutaway, installCastleSection } from './castle-cutaway.js';

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

/** A playable stone plan beneath a separate, sectionable fortified skyline.
 * The shared definition supplies every physical wall, room and doorway. */
export function createCastleModel({definition:def,houseStyle,houseSeed,houseStoneColor,houseWallColor}={}) {
  if(!def||def.architecture!=='castle')throw new TypeError('Castle model needs the shared castle definition.');
  const appearance=getHouseAppearance({houseStyle,houseSeed}),palette=getCastleMaterialColors({houseStyle,houseStoneColor,houseWallColor});
  const random=seeded(appearance.seed),floor=def.floorHeight;
  const group=new THREE.Group(),outer=new THREE.Group(),upper=new THREE.Group(),roof=new THREE.Group(),frontFacade=new THREE.Group(),interior=new THREE.Group();
  group.name=def.label;outer.name='Schlossanlage · dunkler Naturstein';interior.name='Schlossanlage · Schieferböden und Galerien';
  upper.name='Schlossanlage · Wehrmauern und Ecktürme';upper.userData.castleFortifications=true;
  roof.name='Schlossanlage · offener Dachschnitt';roof.visible=false;frontFacade.name='Schlossanlage · offene Vorderfassade';group.add(outer,upper,roof,frontFacade,interior);
  const cutaway=createCastleCutaway({definition:def,group:upper});
  const materials=new Set(),textures=new Set(),geometries=new Set(),batches=new Map(),staticMeshes=[];
  const makeMaterial=(name,kind,options={})=>{
    const maps=kind?createCastleSurface(kind):{};Object.values(maps).forEach(texture=>textures.add(texture));
    const material=new THREE.MeshStandardMaterial({roughness:.98,...maps,...(kind?{bumpScale:kind==='wall'?.10:.022}:{}),...options});
    material.name='Schlossanlage · '+name;material.userData.castleSurface=kind??'metal';materials.add(material);return material;
  };
  const stone=makeMaterial('rauer grauer Bruchstein','wall'),paving=makeMaterial('glatte abgetretene Schieferplatten','floor',{roughness:.94}),trim=makeMaterial('behauene Einfassungen','wall',{bumpScale:.045}),mortar=makeMaterial('tiefe Steinmörtelfugen',null),iron=makeMaterial('geschmiedete Fenstergitter',null,{metalness:.76,roughness:.65});
  const upperMaterial=material=>{const copy=material.clone();copy.name=material.name+' · obere Wehrarchitektur';materials.add(copy);return installCastleSection(copy,cutaway.uniform);};
  const upperMaterials={stone:upperMaterial(stone),paving:upperMaterial(paving),trim:upperMaterial(trim),mortar:upperMaterial(mortar),iron:upperMaterial(iron),
    banner:installCastleSection(makeMaterial('gefaltete Außenbanner',null,{roughness:.96,side:THREE.DoubleSide}),cutaway.uniform)};
  const depthMaterial=installCastleSection(new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking}),cutaway.uniform);
  const distanceMaterial=installCastleSection(new THREE.MeshDistanceMaterial(),cutaway.uniform);
  materials.add(depthMaterial);materials.add(distanceMaterial);
  const blocks=Array.from({length:3},(_,i)=>dressedBlock(i)),slabs=Array.from({length:2},(_,i)=>dressedBlock(i,true)),cube=new THREE.BoxGeometry(1,1,1);
  [...blocks,...slabs,cube].forEach(geo=>geometries.add(geo));
  const dummy=new THREE.Object3D(),tint=new THREE.Color();let parts=0,stones=0,floorTiles=0,windowApertures=0;
  function box(parent,material,x,y,z,w,h,d,color,rotation=0,shape=blocks[parts%3]) {
    if(w<=.0001||h<=.0001||d<=.0001)return;
    const key=parent.uuid+':'+material.uuid+':'+shape.uuid;
    if(!batches.has(key))batches.set(key,{parent,material,shape,instances:[]});
    tint.set(color);dummy.position.set(x,y,z);dummy.rotation.set(...(Array.isArray(rotation)?rotation:[0,rotation,0]));dummy.scale.set(w,h,d);dummy.updateMatrix();
    batches.get(key).instances.push({matrix:dummy.matrix.clone(),color:tint.clone()});parts++;
  }
  const varied=(base,amount=.12)=>new THREE.Color(base).multiplyScalar(1-amount*.5+random()*amount);
  const baseMortar=new THREE.Color(palette.wall).multiplyScalar(.64);
  function pavedArea(area,top,outdoor=false) {
    const width=area.maxX-area.minX,depth=area.maxZ-area.minZ;
    const tint=new THREE.Color(palette.floor).multiplyScalar(outdoor?.81:area.pattern==='flagstone'?1.07:1);
    box(interior,mortar,(area.minX+area.maxX)/2,top-(outdoor?.053:.075),(area.minZ+area.maxZ)/2,width,.10,depth,new THREE.Color(palette.floor).multiplyScalar(.73),0,cube);
    // Every paving tile keeps metre-sized detail even on the fourfold grounds.
    // Staggered rows, subtle colours and small joints avoid a regular brick grid.
    let rowIndex=0;
    for(let z=area.minZ;z<area.maxZ-.001;rowIndex++) {
      let row=Math.min((outdoor?1.55:1.12)+random()*.32,area.maxZ-z);if(area.maxZ-z-row<.4)row=area.maxZ-z;
      for(let x=area.minX;x<area.maxX-.001;) {
        let span=Math.min((x===area.minX?(rowIndex%2?.72:1.42):1.5)+random()*.6,area.maxX-x);if(area.maxX-x-span<.4)span=area.maxX-x;
        const cx=x+span/2,cz=z+row/2,c=varied(tint,outdoor?.16:.10);
        box(interior,paving,cx,top-.032,cz,span-.018,.064,row-.018,c,0,slabs[floorTiles%2]);floorTiles++;x+=span;
      }
      z+=row;
    }
  }
  for(const area of def.floorAreas)pavedArea(area,floor);
  for(const area of def.courtyardPavingAreas??[])pavedArea(area,.008,true);
  // Restrained stone inlays articulate large halls without adding furniture or
  // a raised obstacle. They follow each hall, not the underlying floor tiling.
  for(const room of def.rooms.filter(r=>['great-hall','gate','hall','central-hall'].includes(r.role))) {
    const inset=.65,x0=room.minX+inset,x1=room.maxX-inset,z0=room.minZ+inset,z1=room.maxZ-inset;
    const colour=new THREE.Color(palette.floor).multiplyScalar(.76);
    for(const z of [z0,z1])box(interior,paving,(x0+x1)/2,floor+.002,z,x1-x0,.004,.17,colour,0,cube);
    for(const x of [x0,x1])box(interior,paving,x,floor+.002,(z0+z1)/2,.17,.004,z1-z0,colour,0,cube);
  }
  function matchingWindows(wall,alongX) {
    const from=alongX?wall.minX:wall.minZ,to=alongX?wall.maxX:wall.maxZ;
    const min=alongX?wall.minZ:wall.minX,max=alongX?wall.maxZ:wall.maxX;
    return def.windows.filter(window=>['north','south'].includes(window.side)===alongX&&window.boundary>=min-.05&&window.boundary<=max+.05&&window.center-window.width/2>=from-.001&&window.center+window.width/2<=to+.001);
  }
  function openSpans(from,to,holes) {
    const spans=[];let edge=from;
    for(const [a,b]of holes.sort((a,b)=>a[0]-b[0])) {if(a>edge)spans.push([edge,a]);edge=Math.max(edge,b);}
    if(edge<to)spans.push([edge,to]);return spans;
  }
  for(const wall of def.architecturalWalls) {
    const w=wall.maxX-wall.minX,d=wall.maxZ-wall.minZ,alongX=w>d,thickness=alongX?d:w;
    const from=alongX?wall.minX:wall.minZ,to=alongX?wall.maxX:wall.maxZ,fixed=alongX?(wall.minZ+wall.maxZ)/2:(wall.minX+wall.maxX)/2;
    const height=wall.maxY-floor,bearing=alongX?0:Math.PI/2,windows=matchingWindows(wall,alongX);
    windowApertures+=windows.length;
    // Split both the mortar core AND the visible blocks around true openings.
    // A dark decal in front of an opaque wall is deliberately not a window.
    const yEdges=[0,height-.16];
    for(let y=.52;y<height-.16;y+=.52) {
      const apertureEdge=windows.flatMap(window=>[window.sillHeight,window.sillHeight+window.height]).find(edge=>Math.abs(edge-y)<.12);
      yEdges.push(apertureEdge??y);
    }
    for(const window of windows)yEdges.push(window.sillHeight,window.sillHeight+window.height);
    const levels=[...new Set(yEdges.filter(y=>y>=0&&y<=height-.16).map(y=>Math.round(y*1000)/1000))].sort((a,b)=>a-b);
    for(let row=0;row<levels.length-1;row++) {
      const low=levels[row],high=levels[row+1],cy=floor+(low+high)/2;
      const holes=windows.filter(window=>(low+high)/2>window.sillHeight&&(low+high)/2<window.sillHeight+window.height).map(window=>[window.center-window.width/2,window.center+window.width/2]);
      for(const [a,b]of openSpans(from,to,holes)) {
        box(outer,mortar,alongX?(a+b)/2:fixed,cy,alongX?fixed:(a+b)/2,alongX?b-a:thickness-.05,high-low,alongX?thickness-.05:b-a,baseMortar,0,cube);
        for(let edge=a;edge<b-.001;) {
          let span=Math.min((edge===a?(row%2?.7:1.2):1.42)+random()*.58,b-edge);if(b-edge-span<.42)span=b-edge;
          const center=edge+span/2;
          box(outer,stone,alongX?center:fixed,cy,alongX?fixed:center,span-.026,Math.max(.015,high-low-.023),thickness-.012,varied(palette.wall,.16),bearing);stones++;edge+=span;
        }
      }
    }
    for(let edge=from;edge<to-.001;) {
      const span=Math.min(1.22+random()*.25,to-edge),center=edge+span/2;
      box(outer,trim,alongX?center:fixed,floor+height-.07,alongX?fixed:center,span-.012,.16,thickness+.035,varied(palette.trim,.055),bearing,slabs[0]);edge+=span;
    }
  }
  function portal(x,z,width,alongX,depth) {
    const bearing=alongX?0:Math.PI/2,height=def.wallHeight;
    for(const sign of [-1,1]) {
      const p=sign*(width/2+.245),px=x+(alongX?p:0),pz=z+(alongX?0:p),rows=Math.ceil(height/.51),step=height/rows;
      for(let row=0;row<rows;row++)box(outer,trim,px,floor+(row+.5)*step,pz,.47,step-.018,depth+.035,varied(palette.trim,.07),bearing);
      box(outer,trim,px,floor+height+.015,pz,.50,.11,depth+.06,palette.trim,bearing,slabs[0]);
    }
    box(interior,paving,x,floor-.019,z,alongX?width:depth,.040,alongX?depth:width,varied(palette.trim,.035),0,slabs[0]);
    for(const side of [-1,1])box(interior,stone,x+(alongX?0:side*(depth/2-.04)),floor-.009,z+(alongX?side*(depth/2-.04):0),alongX?width:.045,.022,alongX?.045:width,new THREE.Color(palette.floor).multiplyScalar(.7),0,cube);
  }
  for(const door of def.interiorDoorways)portal(door.x,door.z,door.width,door.axis==='x',door.depth??.6);
  for(const entry of def.entrances) {
    const alongX=['north','south'].includes(entry.side),fixed=(entry.boundary+entry.innerBoundary)/2,sign=['north','west'].includes(entry.side)?-1:1;
    portal(alongX?entry.center:fixed,alongX?fixed:entry.center,entry.max-entry.min,alongX,Math.abs(entry.boundary-entry.innerBoundary));
    const depth=entry.depth??.9;
    // Three broad, shallow stone treads are always below the physical ramp.
    for(let i=0;i<3;i++) {
      const span=depth/3,height=floor*(1-(i+1)/3)+.008,offset=(i+.5)*span;
      box(outer,paving,alongX?entry.center:entry.boundary+sign*offset,height/2,alongX?entry.boundary+sign*offset:entry.center,alongX?entry.max-entry.min:span-.008,height,alongX?span-.008:entry.max-entry.min,varied(palette.trim,.04),0,slabs[0]);
    }
  }
  for(const window of def.windows) {
    const alongX=['north','south'].includes(window.side),bearing=alongX?0:Math.PI/2,inward=['north','west'].includes(window.side)?1:-1;
    const thickness=window.wallThickness??def.wallThickness,width=window.width,height=window.height;
    const fixed=window.boundary-inward*thickness/2,center=window.center,bottom=floor+window.sillHeight,top=bottom+height;
    const panel=(material,offsetX,y,depth,w,h,d,color,shape=blocks[0])=>box(outer,material,alongX?center+offsetX:fixed+depth, y,alongX?fixed+depth:center+offsetX,w,h,d,color,bearing,shape);
    // Full-depth stone reveals frame an empty aperture, readable from either
    // side. No glass, shutter, timber backing, or opaque interior panel.
    for(const side of [-1,1])for(let row=0;row<3;row++)panel(trim,side*(width/2+.12),bottom+(row+.5)*height/3,0,.23,height/3-.015,thickness+.035,varied(palette.trim,.06));
    panel(trim,0,bottom-.11,0,width+.48,.20,thickness+.22,palette.trim,slabs[0]);
    panel(trim,0,top+.12,0,width+.48,.22,thickness+.12,palette.trim,slabs[0]);
    // Individual forged bars and cross ties leave genuine air between them.
    for(const fraction of [-.32,0,.32]) {
      panel(iron,width*fraction,(bottom+top)/2,0,.055,height+.06,.065,palette.iron,cube);
      panel(iron,width*fraction,bottom+height*.48,0,.09,.085,.085,new THREE.Color(palette.iron).multiplyScalar(1.25),cube);
    }
    for(const fraction of [.28,.72])panel(iron,0,bottom+height*fraction,0,width+.025,.045,.06,palette.iron,cube);
  }
  const fortifications=addCastleFortifications({definition:def,group:upper,box,materials:upperMaterials,shapes:{blocks,slabs,cube},geometries,palette,random});
  stones+=fortifications.stones;
  for(const {parent,material,shape,instances}of batches.values()) {
    const mesh=new THREE.InstancedMesh(shape,material,instances.length);mesh.name=material.name;
    instances.forEach(({matrix,color},index)=>{mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color);});
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
    if(parent===upper){mesh.userData.castleUpper=true;mesh.customDepthMaterial=depthMaterial;mesh.customDistanceMaterial=distanceMaterial;}
    mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();parent.add(mesh);staticMeshes.push(mesh);
  }
  let triangles=0,drawCalls=0;for(const mesh of staticMeshes){drawCalls++;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*mesh.count;}
  const torches=createCastleTorches({definition:def,seed:appearance.seed}),courtyards=createCastleCourtyards({definition:def});group.add(courtyards.group,torches.group);
  const stats={drawCalls:drawCalls+torches.stats.drawCalls+courtyards.stats.drawCalls,triangles:triangles+torches.stats.triangles+courtyards.stats.triangles,staticDrawCalls:drawCalls,staticTriangles:triangles,parts,stones,floorTiles,rooms:def.roomCount??def.rooms.length,entrances:def.entrances.length,windows:windowApertures,torches:torches.stats,courtyards:courtyards.stats,fortifications};
  group.userData.castle={...stats,style:'fortified-stone-castle-green-courts',variant:def.variant,floorHeight:floor,houseSeed:appearance.seed,houseStyle:appearance.style,houseStoneColor,houseWallColor,cutaway:cutaway.stats};
  let disposed=false;
  return {group,roof,frontFacade,interior,stats,get cutaway(){return cutaway.stats;},update(dt,time,playerLocal,options){if(!disposed){cutaway.update(dt,playerLocal);torches.update(dt,time,playerLocal,options);}},dispose(){
    if(disposed)return;disposed=true;torches.dispose();courtyards.dispose();staticMeshes.forEach(mesh=>mesh.dispose());geometries.forEach(geo=>geo.dispose());materials.forEach(material=>material.dispose());textures.forEach(texture=>texture.dispose());group.removeFromParent();
  }};
}
