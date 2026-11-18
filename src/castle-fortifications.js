import * as THREE from 'three';

/** Upper masonry only. Geometry is batched by the caller, and all coordinates
 * remain castle-local so the visual section and shadow section match exactly. */
export function addCastleFortifications({definition:def,group,box,materials,shapes,geometries,palette,random}) {
  const {stone,paving,trim,mortar,iron,banner}=materials,{blocks,slabs,cube}=shapes;
  const floor=def.floorHeight,base=floor+(def.cutawayHeight??def.wallHeight),wallTop=floor+(def.exteriorWallHeight??7.5);
  const stats={towers:0,stones:0,terraceTiles:0,banners:0,wallHeight:def.exteriorWallHeight??7.5,towerHeight:def.towerHeight??12.2,mainGate:false};
  const variation=(color,range=.13)=>new THREE.Color(color).multiplyScalar(1-range*.5+random()*range);
  const grout=new THREE.Color(palette.wall).multiplyScalar(.61);
  const block=(material,x,y,z,w,h,d,color,rotation=0,shape=blocks[stats.stones%3])=>{
    box(group,material,x,y,z,w,h,d,color,rotation,shape);if(material===stone||material===trim)stats.stones++;
  };
  function segment(a,b,y0,y1,thickness,{slit=false,course=.56}={}) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length,bearing=Math.atan2(-uz,ux);
    const point=t=>[a[0]+ux*t,a[1]+uz*t];
    const rows=Math.max(1,Math.ceil((y1-y0)/course)),step=(y1-y0)/rows;
    for(let row=0;row<rows;row++) {
      const cy=y0+(row+.5)*step,opening=slit&&cy>floor+6.25&&cy<floor+7.55;
      const spans=opening?[[0,length/2-.18],[length/2+.18,length]]:[[0,length]];
      for(const [from,to]of spans) {
        const [cx,cz]=point((from+to)/2);
        block(mortar,cx,cy,cz,to-from,step,thickness-.025,grout,bearing,cube);
        for(let edge=from;edge<to-.001;) {
          let span=Math.min((edge===from?(row%2?.68:1.20):1.32)+random()*.36,to-edge);if(to-edge-span<.36)span=to-edge;
          const [x,z]=point(edge+span/2);
          block(stone,x,cy,z,span-.018,step-.021,thickness,variation(palette.wall),bearing);edge+=span;
        }
      }
    }
    return {length,bearing,point};
  }
  function coping(a,b,y,thickness,height=.22) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),bearing=Math.atan2(-dz,dx);
    const count=Math.max(1,Math.ceil(length/1.4));
    for(let i=0;i<count;i++)block(trim,a[0]+dx*(i+.5)/count,y,a[1]+dz*(i+.5)/count,length/count-.012,height,thickness,variation(palette.trim,.06),bearing,slabs[0]);
  }
  function merlons(a,b,top,thickness,merlonHeight=1.0) {
    const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),bearing=Math.atan2(-dz,dx),count=Math.max(1,Math.round(length/2.35));
    for(let i=0;i<count;i++) {
      const t=(i+.5)/count,w=Math.min(1.22,length/count*.58),x=a[0]+dx*t,z=a[1]+dz*t;
      block(stone,x,top-merlonHeight/2,z,w,merlonHeight-.08,thickness,variation(palette.wall),bearing);
      block(trim,x,top-.045,z,w+.09,.09,thickness+.08,variation(palette.trim,.05),bearing,slabs[0]);
    }
  }
  function wallSpans(wall) {
    const alongX=wall.maxX-wall.minX>wall.maxZ-wall.minZ,from=alongX?wall.minX:wall.minZ,to=alongX?wall.maxX:wall.maxZ;
    // The continuous curtain wall is also the square outer base of each
    // corner bastion. Truncating it at a tower's bounding box would leave a
    // gap before the octagonal tower face and disagree with physical cover.
    return {alongX,spans:[[from,to]],fixed:alongX?(wall.minZ+wall.maxZ)/2:(wall.minX+wall.maxX)/2};
  }
  for(const wall of def.architecturalWalls.filter(w=>w.outerPerimeter)) {
    const {alongX,spans,fixed}=wallSpans(wall),thickness=def.wallThickness;
    for(const [from,to]of spans) {
      const a=alongX?[from,fixed]:[fixed,from],b=alongX?[to,fixed]:[fixed,to],bodyTop=wallTop-.95;
      segment(a,b,base,bodyTop,thickness);
      coping(a,b,bodyTop-.10,thickness+.18,.24);merlons(a,b,wallTop,thickness+.03,.95);
      // Slender stone pilasters remain on the solid wall footprint. The wider
      // upper shoulder reads as a buttress without blocking the ground path.
      const length=to-from,count=Math.floor(length/12);
      for(let i=0;i<count;i++) {
        const t=from+(i+.5)*length/count,x=alongX?t:fixed,z=alongX?fixed:t,bearing=alongX?0:Math.PI/2;
        for(let y=base+.3;y<bodyTop-.3;y+=.61)block(trim,x,y,z,.72,.59,thickness+.10,variation(palette.trim,.08),bearing);
        block(trim,x,bodyTop-.22,z,1.05,.42,thickness+.28,variation(palette.trim,.05),bearing);
      }
    }
  }
  const cap=new THREE.CylinderGeometry(.5,.5,1,8,1,false,Math.PI/8);geometries.add(cap);
  function polygonSpan(points,z) {
    const intersections=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      if(Math.abs(a[1]-b[1])<1e-6||z<Math.min(a[1],b[1])||z>Math.max(a[1],b[1]))continue;
      intersections.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));
    }
    return [Math.min(...intersections),Math.max(...intersections)];
  }
  for(const tower of def.towers??[]) {
    const points=tower.footprintPoints,top=floor+tower.height,bodyTop=top-1.10,thickness=tower.wallThickness??.6,bounds=tower.baseBounds;
    // A broad square string course establishes the playable lower tower room;
    // its chamfered octagonal upper body then rises above that sturdy base.
    for(const z of [bounds.minZ+.35,bounds.maxZ-.35])coping([bounds.minX+.35,z],[bounds.maxX-.35,z],base+.13,.70,.26);
    for(const x of [bounds.minX+.35,bounds.maxX-.35])coping([x,bounds.minZ+.70],[x,bounds.maxZ-.70],base+.13,.70,.26);
    block(mortar,tower.x,floor+(tower.capHeight??tower.height-1.10),tower.z,tower.radius*2,.24,tower.radius*2,grout,0,cap);
    // Small slate flags and actual recessed joints give the upper terrace a
    // human scale. Edge rows stay wholly inside the octagon; the exposed dark
    // perimeter is a narrow stone border, rather than stretched giant UVs.
    const capTop=floor+(tower.capHeight??tower.height-1.10)+(tower.capThickness??.24)/2;
    const zMin=Math.min(...points.map(p=>p[1]))+.18,zMax=Math.max(...points.map(p=>p[1]))-.18;
    for(let z=zMin,row=0;z<zMax-.15;row++) {
      const depth=Math.min(1.10,zMax-z),lo=polygonSpan(points,z),hi=polygonSpan(points,z+depth);
      const xMin=Math.max(lo[0],hi[0])+.18,xMax=Math.min(lo[1],hi[1])-.18;
      for(let x=xMin;x<xMax-.08;) {
        let span=Math.min((x===xMin&&row%2?.72:1.35)+random()*.15,xMax-x);if(xMax-x-span<.35)span=xMax-x;
        block(paving,x+span/2,capTop,z+depth/2,span-.034,.006,depth-.034,variation(new THREE.Color(palette.floor).multiplyScalar(.91),.13),0,slabs[stats.terraceTiles%2]);
        stats.terraceTiles++;x+=span;
      }
      z+=depth;
    }
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length];
      segment(a,b,base+.26,bodyTop,thickness,{slit:i%2===0});
      coping(a,b,base+.44,thickness+.15,.20);
      coping(a,b,bodyTop-.14,thickness+.28,.28);
      merlons(a,b,top,thickness+.12,1.10);
    }
    stats.towers++;
  }
  // A true semicircular stone arch leaves its entire opening empty. The ring
  // uses wedge geometry rather than a flat decal or a beam across the doorway.
  const gate=def.mainGate;
  if(gate) {
    const r=gate.archRise??gate.width/2,outerR=r+.58,spring=floor+gate.springHeight,top=floor+gate.height,depth=gate.depth;
    const count=17,halfAngle=Math.PI/count/2-.007;
    const shape=new THREE.Shape();shape.moveTo(Math.cos(-halfAngle)*r,Math.sin(-halfAngle)*r);shape.lineTo(Math.cos(-halfAngle)*outerR,Math.sin(-halfAngle)*outerR);
    shape.absarc(0,0,outerR,-halfAngle,halfAngle,false);shape.lineTo(Math.cos(halfAngle)*r,Math.sin(halfAngle)*r);shape.absarc(0,0,r,halfAngle,-halfAngle,true);shape.closePath();
    const wedge=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:2,steps:1});wedge.translate(0,0,-depth/2);geometries.add(wedge);
    for(let i=0;i<count;i++) {
      block(trim,gate.x,spring,gate.z,1,1,1,variation(palette.trim,.08),[0,0,(i+.5)*Math.PI/count],wedge);
    }
    const outerWidth=r+.9;
    const coreShape=new THREE.Shape();coreShape.moveTo(-outerWidth,base-spring);coreShape.lineTo(-outerWidth,top-.7-spring);coreShape.lineTo(outerWidth,top-.7-spring);
    coreShape.lineTo(outerWidth,base-spring);coreShape.lineTo(outerR,base-spring);coreShape.lineTo(outerR,0);coreShape.absarc(0,0,outerR,0,Math.PI,false);coreShape.lineTo(-outerR,base-spring);coreShape.closePath();
    const core=new THREE.ExtrudeGeometry(coreShape,{depth:depth-.08,bevelEnabled:false,curveSegments:24,steps:1});core.translate(0,0,-(depth-.08)/2);geometries.add(core);
    block(mortar,gate.x,spring,gate.z,1,1,1,grout,0,core);
    for(const side of [-1,1]) {
      const x=gate.x+side*(r+.43),width=.86,bodyTop=top-.70;
      segment([x-width/2,gate.z],[x+width/2,gate.z],base,bodyTop,depth,{course:.52});
      block(trim,x,base+.18,gate.z,1.10,.36,depth+.13,palette.trim);
      block(trim,x,spring,gate.z,1.16,.25,depth+.20,palette.trim);
    }
    // Individual small courses fill the arch's spandrel and crown while
    // following the curved opening. Their lower edge stays outside the ring.
    const columnWidth=.62;
    for(let x=-outerWidth;x<outerWidth-.001;x+=columnWidth) {
      const w=Math.min(columnWidth,outerWidth-x),cx=x+w/2,nearest=Math.max(0,Math.abs(cx)-w/2);
      const low=spring+Math.sqrt(Math.max(0,outerR*outerR-nearest*nearest));
      if(top-.7>low)segment([gate.x+x,gate.z],[gate.x+x+w,gate.z],low,top-.7,depth-.07,{course:.50});
    }
    coping([gate.x-outerWidth-.2,gate.z],[gate.x+outerWidth+.2,gate.z],top-.64,depth+.26,.25);
    merlons([gate.x-outerWidth,gate.z],[gate.x+outerWidth,gate.z],top,depth,.70);
    stats.mainGate=true;
  }
  const cloth=new THREE.BufferGeometry();
  const positions=[],columns=8,rows=5;
  const vertex=(col,row)=>{const x=col/columns-.5,y=.5-row/rows,notch=row===rows?Math.max(0,1-Math.abs(x)*2)*.20:0;return[x,y+notch,Math.sin(col/columns*Math.PI*3)*.055+Math.sin(row/rows*2)*.015];};
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++)for(const [c,r]of [[col,row],[col,row+1],[col+1,row+1],[col,row],[col+1,row+1],[col+1,row]])positions.push(...vertex(c,r));
  cloth.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));cloth.computeVertexNormals();geometries.add(cloth);
  for(const side of [-1,1])for(const sign of [-1,1]) {
    const x=sign*6.3,z=side*60.08,bearing=side>0?0:Math.PI,y=floor+5.05;
    block(banner,x,y,z,1.35,2.75,1,side>0?'#263b52':'#4a303c',bearing,cloth);
    block(iron,x,y+1.48,z,1.70,.085,.12,palette.iron,bearing,cube);
    block(trim,x,y+.18,z+side*.095,.30,.30,.018,'#b9a36c',[0,bearing,Math.PI/4],cube);
    stats.banners++;
  }
  return stats;
}
