import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALDHAUS_DEFINITION, WALDHAUS_FURNITURE } from './map/waldhaus-definition.js';

const palettes = {
 wood: ['#765037','#82593d','#946b49','#a27750','#876044'],
 stone: ['#7b7b6b','#939282','#858674','#9e9b86','#6d7568'],
 plaster: ['#b4a184','#c3ad8d','#c7b294','#ac9c81'],
};
const seeded = () => {let n=87123;return()=>{n=(Math.imul(n,1664525)+1013904223)|0;return(n>>>0)/4294967296;};};
function surface(kind) {
  if(typeof document==='undefined')return null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');if(!c)return null;
  const r=seeded();c.fillStyle=kind==='cloth'?'#ddd8c7':kind==='stone'?'#c7c4b7':'#e2d5bd';c.fillRect(0,0,256,256);
  if(kind==='wood'){
    for(let i=0;i<90;i++){
      const x=r()*256;c.strokeStyle=`rgba(47,30,16,${.04+r()*.12})`;c.lineWidth=.45+r()*1.1;
      c.beginPath();c.moveTo(x,-4);c.bezierCurveTo(x+8,65,x-10,180,x+3,260);c.stroke();
    }
    for(let i=0;i<8;i++){
      const x=r()*256,y=r()*256;c.strokeStyle='#5e432e44';c.lineWidth=1;
      for(let ring=0;ring<3;ring++){c.beginPath();c.ellipse(x,y,2+ring*2,6+ring*4,.07,0,Math.PI*2);c.stroke();}
    }
  }else if(kind==='cloth'){
    for(let i=0;i<256;i+=3){c.fillStyle=i%2?'#ffffff24':'#493c281c';c.fillRect(i,0,1,256);c.fillRect(0,i,256,1);}
  }else if(kind==='plaster'){
    for(let i=0;i<80;i++){c.fillStyle=`rgba(97,83,61,${r()*.06})`;c.beginPath();c.ellipse(r()*256,r()*256,5+r()*24,3+r()*18,r()*6,0,Math.PI*2);c.fill();}
  }
  for(let i=0;i<2200;i++){c.fillStyle=r()>.5?'#fff8df1c':'#342e2518';c.fillRect(r()*256,r()*256,.6+r()*2,.5+r()*2);}
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  return texture;
}

/** The measured plan owns collision. This renderer uses the same plan and
 * keeps the upper front facade separate for the existing cutaway behavior. */
export function createWaldhausModel() {
  const def=WALDHAUS_DEFINITION,r=seeded(),floor=def.floorHeight??.18;
  const group=new THREE.Group();group.name='Waldhaus';
  const outer=new THREE.Group(),roof=new THREE.Group(),frontFacade=new THREE.Group(),interior=new THREE.Group();
  outer.name='Waldhaus · verwittertes Fachwerk';roof.name='Waldhaus · offener Dachschnitt';roof.visible=false;
  frontFacade.name='Waldhaus · obere Vorderfassade';interior.name='Waldhaus · drei eingerichtete Räume';
  group.add(outer,roof,frontFacade,interior);
  const textures=new Set(),materials=new Map(),batches=new Map(),dummy=new THREE.Object3D(),color=new THREE.Color();
  const mat=(id,textureKind,extra={})=>{
    const map=textureKind?surface(textureKind):null;if(map)textures.add(map);
    const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,...(map?{map}:{}),...extra});m.name='Waldhaus · '+id;materials.set(id,m);return m;
  };
  const W=mat('Holz','wood'),S=mat('Stein','stone'),P=mat('Kalkputz','plaster'),C=mat('Leinen','cloth');
  const M=mat('Eisen',null,{metalness:.65,roughness:.55}),L=mat('Warmes Licht',null,{emissive:'#ffae47',emissiveIntensity:1.25,roughness:.5});
  const G=mat('Glas',null,{emissive:'#75816b',emissiveIntensity:.15,metalness:.15,roughness:.4});
  let parts=0;
  function geometry(parent,material,geo,x,y,z,tint='#ffffff',rotation=[0,0,0]) {
    // Match texture grain to physical metres, including rounded corners.
    const pos=geo.attributes.position,normal=geo.attributes.normal,uv=geo.attributes.uv;
    if(uv)for(let i=0;i<pos.count;i++){
      const ax=Math.abs(normal.getX(i)),ay=Math.abs(normal.getY(i)),az=Math.abs(normal.getZ(i));
      if(ay>=ax&&ay>=az)uv.setXY(i,pos.getX(i)*.65,pos.getZ(i)*.65);
      else if(ax>az)uv.setXY(i,pos.getZ(i)*.65,pos.getY(i)*.65);
      else uv.setXY(i,pos.getX(i)*.65,pos.getY(i)*.65);
    }
    dummy.position.set(x,y,z);dummy.rotation.set(rotation[0]??0,rotation[1]??0,rotation[2]??0);dummy.scale.set(1,1,1);dummy.updateMatrix();geo.applyMatrix4(dummy.matrix);
    if(geo.index){const old=geo;geo=old.toNonIndexed();old.dispose();}
    color.set(tint);const colors=new Float32Array(geo.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    if(!batches.has(parent))batches.set(parent,new Map());const byMaterial=batches.get(parent);
    if(!byMaterial.has(material))byMaterial.set(material,[]);byMaterial.get(material).push(geo);parts++;
  }
  function box(parent,material,x,y,z,w,h,d,tint,rotation=[0,0,0],round=.025) {
    const bevel=Math.min(round,w*.2,h*.2,d*.2);
    geometry(parent,material,new RoundedBoxGeometry(w,h,d,1,bevel),x,y,z,tint,rotation);
  }
  function beam(parent,a,b,w=.12,tint='#5a3e2b',depth=w){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5);
    const geo=new RoundedBoxGeometry(w,v.length(),depth,1,Math.min(.02,w*.18));geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));
    geometry(parent,W,geo,mid.x,mid.y,mid.z,tint);
  }
  function cylinder(parent,material,x,y,z,rt,rb,h,tint,rotation=[0,0,0],segments=14){geometry(parent,material,new THREE.CylinderGeometry(rt,rb,h,segments),x,y,z,tint,rotation);}
  function sphere(parent,material,x,y,z,sx,sy,sz,tint){const geo=new THREE.SphereGeometry(1,10,7);geo.scale(sx,sy,sz);geometry(parent,material,geo,x,y,z,tint);}
  const choose=kind=>palettes[kind][Math.floor(r()*palettes[kind].length)];
  let F=interior;const fixtures=[];
  // Low plinth is level with the logical floor; individual boards provide seams.
  box(outer,S,0,floor*.42,0,12,.12,9,'#6c7063');
  for(let col=0;col<25;col++)for(let row=0;row<3;row++){
    const x=-5.76+col*.48,z=-2.98+row*2.98;
    box(F,W,x,floor-.026,z,.465,.052,2.965,choose('wood'),[0,0,0],.008);
    for(const end of [-1,1])cylinder(F,M,x-.16,floor+.003,z+end*1.35,.014,.014,.005,'#4a4334',[],6);
  }
  // Keep all shell and partition edges on the authored collision plan.
  for(const wall of def.architecturalWalls){
    const w=wall.maxX-wall.minX,d=wall.maxZ-wall.minZ,x=(wall.minX+wall.maxX)/2,z=(wall.minZ+wall.maxZ)/2;
    const h=Math.min(3.05,(wall.maxY??3.23)-floor),front=z>4&&w>d;
    const low=Math.min(.64,h),parent=front?frontFacade:outer;
    box(outer,S,x,floor+low/2,z,w,low,d,choose('stone'));
    box(parent,P,x,floor+low+(h-low)/2,z,w,h-low,d*.94,choose('plaster'));
    box(parent,W,x,floor+h+.025,z,w+.025,.14,d+.07,'#60432f');
    box(outer,W,x,floor+low+.035,z,w+.02,.11,d+.05,'#6b4a32');
    const alongX=w>d,len=alongX?w:d;
    const posts=Math.max(1,Math.ceil(len/2.25));
    for(let i=0;i<=posts;i++){
      const offset=-len/2+Math.min(len-.045,Math.max(.045,i*len/posts));
      box(parent,W,x+(alongX?offset:0),floor+h*.5,z+(alongX?0:offset),alongX?.15:w+.08,h,alongX?d+.08:.15,'#65452e');
    }
    // Hand-laid stone courses with varied widths and staggered joints.
    const blocks=Math.max(1,Math.floor(len/.68));
    for(let row=0;row<2;row++)for(let j=0;j<blocks;j++){
      const step=len/blocks,pos=-len/2+(j+.5)*step,tint=choose('stone');
      box(outer,S,x+(alongX?pos:0),floor+.15+row*.28,z+(alongX?0:pos),alongX?step-.025:w+.055,.25,alongX?d+.055:step-.025,tint,[0,(r()-.5)*.012,0],.045);
    }
  }
  // Door frames stay outside all openings; their lintels clear avatar height.
  function portal(x,z,width,alongX=true,parent=outer){
    for(const side of [-1,1])box(parent,W,x+(alongX?side*(width/2+.08):0),floor+1.46,z+(alongX?0:side*(width/2+.08)),alongX?.14:.38,2.92,alongX?.38:.14,'#725035');
    box(parent,W,x,floor+2.91,z,alongX?width+.22:.38,.19,alongX?.38:width+.22,'#825c3d');
  }
  portal(-2.7,4.35,2.2,true,frontFacade);portal(-2.7,-4.35,1.8);
  portal(1.65,-2.5,1.6,false,F);portal(1.65,2.1,1.6,false,F);
  // Flat thresholds match the floor transition ramps and stay inside door widths.
  for(const [z,width,sign] of [[4.5,2.2,1],[-4.5,1.8,-1]]){
    box(outer,S,-2.7,floor*.45,z+sign*.31,width,.12,.64,'#a09c86');
    box(outer,S,-2.7,floor*.22,z+sign*.63,width+.16,.07,.25,'#878c7b');
  }
  function windowPanel(x,z,side='north'){
    const holder=new THREE.Group();holder.name='Waldhaus · bleiverglastes Fenster';outer.add(holder);holder.position.set(x,0,z);holder.rotation.y=side==='east'?-Math.PI/2:0;
    box(holder,W,0,floor+1.92,0,1.38,1.3,.12,'#4d3829');box(holder,G,0,floor+1.92,.075,1.14,1.05,.055,'#92a898');
    for(const x of [-.57,0,.57])box(holder,W,x,floor+1.92,.12,.055,1.1,.06,'#aa8050');
    box(holder,W,0,floor+1.92,.12,1.16,.06,.06,'#aa8050');
    for(const side of [-1,1]){
      box(holder,W,side*.88,floor+1.92,.06,.35,1.22,.1,'#65724b');
      for(const y of [1.56,2.27])box(holder,M,side*.88,floor+y,.125,.31,.055,.035,'#4b4e40');
    }
    box(holder,S,0,floor+1.22,.12,1.62,.13,.28,'#9b9b82');
  }
  windowPanel(3.8,-4.19);windowPanel(-.55,-4.19);windowPanel(5.69,1.7,'east');
  function lantern(parent,x,z,rotation=0){
    const h=new THREE.Group();h.name='Waldhaus · Laterne';parent.add(h);h.position.set(x,0,z);h.rotation.y=rotation;
    beam(h,[0,floor+2.2,0],[0,floor+2.2,.25],.065,'#4c3826');
    box(h,M,0,floor+1.93,.25,.28,.40,.24,'#4b4232');box(h,L,0,floor+1.93,.27,.19,.29,.16,'#ffd482');
    for(const side of [-1,1])box(h,M,side*.10,floor+1.93,.36,.025,.37,.026,'#514737');
    box(h,M,0,floor+1.71,.25,.34,.065,.29,'#4a3e2c');cylinder(h,M,0,floor+2.19,.25,.035,.22,.15,'#4a3e2c',[],4);
  }
  lantern(outer,-4.1,-4.15);lantern(F,1.44,-.95,Math.PI/2);lantern(frontFacade,-4.03,4.55,Math.PI);
  function rug(x,z,w,d){
    box(F,C,x,floor+.011,z,w,.018,d,'#687444',[0,0,0],.006);
    for(const sign of [-1,1]){
      box(F,C,x,floor+.023,z+sign*(d/2-.10),w-.1,.009,.055,'#b29c69');
      box(F,C,x+sign*(w/2-.1),floor+.023,z,.055,.009,d-.1,'#b29c69');
      for(let i=0;i<Math.floor(w/.11);i++)box(F,C,x-w/2+.06+i*.11,floor+.014,z+sign*(d/2+.04),.025,.012,.11,'#a28d61',[],.003);
    }
  }
  rug(-.6,.35,2.7,2.55);rug(3.1,-1.6,.95,2.45);
  function stool(x,z){
    cylinder(F,W,x,floor+.55,z,.29,.3,.11,'#997047');
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;beam(F,[x+Math.sin(a)*.2,floor+.05,z+Math.cos(a)*.2],[x+Math.sin(a)*.15,floor+.51,z+Math.cos(a)*.15],.09,'#67462e');}
  }
  function table(x,z){
    for(let i=0;i<4;i++)box(F,W,x-.64+i*.425,floor+.85,z,.405,.12,1.25,choose('wood'));
    for(const a of [-1,1])for(const b of [-1,1])box(F,W,x+a*.64,floor+.42,z+b*.45,.13,.83,.13,'#69492e');
    for(const side of [-1,1])box(F,W,x,floor+.67,z+side*.48,1.45,.14,.1,'#765232');
    box(F,C,x+.12,floor+.917,z,.46,.014,1.33,'#78814e',[],.003);
    cylinder(F,S,x-.35,floor+.935,z-.12,.20,.19,.035,'#d4c4a1');
    cylinder(F,M,x+.47,floor+1.01,z+.15,.09,.08,.18,'#a58b54');
    geometry(F,M,new THREE.TorusGeometry(.07,.018,5,10),x+.57,floor+1.02,z+.15,'#9f8650',[0,Math.PI/2,0]);
    candle(x+.08,z-.22,floor+.93);
  }
  function candle(x,z,y){
    cylinder(F,M,x,y+.02,z,.12,.13,.04,'#7b673c');cylinder(F,C,x,y+.14,z,.043,.048,.22,'#e0cfa3');sphere(F,L,x,y+.29,z,.035,.085,.035,'#ffdc8d');
  }
  function barrel(x,z,radius=.36,height=.82){
    cylinder(F,W,x,floor+height*.5,z,radius*.84,radius*.84,height,'#815637',[],16);
    sphere(F,W,x,floor+height*.5,z,radius,height*.48,radius,'#8d603e');
    for(const band of [.16,.76]){
      const y=floor+height*band;geometry(F,M,new THREE.TorusGeometry(radius*(band<.2?.94:.97),.031,5,16),x,y,z,'#52544a',[Math.PI/2,0,0]);
    }
    cylinder(F,W,x,floor+height+.007,z,radius*.82,radius*.82,.035,'#9b7350');
    for(let i=0;i<3;i++)box(F,W,x-.15+i*.15,floor+height+.028,z,.012,.008,radius*1.5,'#5a3f2b',[],.002);
  }
  function jar(x,z,y,tint='#9b7751',size=.13){
    sphere(F,S,x,y+size*.65,z,size,size*.8,size,tint);cylinder(F,S,x,y+size*1.4,z,size*.5,size*.55,size*.3,tint);
    cylinder(F,W,x,y+size*1.58,z,size*.55,size*.55,.03,'#5b452b');
  }
  function shelf(x,z,width=1.25,rotation=0){
    const h=new THREE.Group();h.position.set(x,0,z);h.rotation.y=rotation;h.name='Waldhaus · Vorratsregal';F.add(h);
    for(const side of [-1,1])box(h,W,side*(width/2-.06),floor+.95,0,.10,1.9,.36,'#6d4c30');
    for(let row=0;row<4;row++){
      const y=floor+.12+row*.52;box(h,W,0,y,0,width,.08,.42,choose('wood'));
      for(let item=0;item<3;item++){
        const px=-width*.3+item*width*.3;
        if(row===1){box(h,C,px,y+.17,0,.22,.25,.25,['#8d8c6a','#ab9875','#61764e'][item]);box(h,C,px,y+.30,0,.22,.025,.26,'#c4b493');}
        else{cylinder(h,S,px,y+.14,0,.1,.13,.22,['#9a7b55','#71816b','#ac966e'][item]);cylinder(h,W,px,y+.27,0,.095,.095,.035,'#59422d');}
      }
    }
  }
  // Each detailed furnishing is fitted to its exact shared collision footprint.
  // All child meshes are baked back into the same small material batch below.
  function fixture(id,build){
    const plan=WALDHAUS_FURNITURE.find(item=>item.id===id);
    if(!plan)throw new Error(`Unknown Waldhaus fixture: ${id}`);
    const parent=F,h=new THREE.Group();h.name='Waldhaus · '+plan.label;interior.add(h);F=h;
    build({x:0,z:0});fixtures.push({group:h,plan});F=parent;
  }
  fixture('table',p=>table(p.x,p.z));
  for(const id of ['stool-n','stool-s','stool-w'])fixture(id,p=>stool(p.x,p.z));
  fixture('bed',bed=>{
    box(F,W,bed.x,floor+.24,bed.z,1.7,.32,2.6,'#725035');
    box(F,C,bed.x,floor+.48,bed.z,1.58,.21,2.42,'#d4c6a6',[0,0,0],.08);
    box(F,C,bed.x,floor+.61,bed.z+.38,1.59,.12,1.64,'#66794b',[0,0,0],.04);
    for(const side of [-1,1])box(F,C,bed.x+side*.65,floor+.68,bed.z+.38,.07,.012,1.56,'#b1a675',[],.003);
    box(F,C,bed.x,floor+.64,bed.z-.83,1.15,.22,.48,'#e3d3b2',[0,0,-.035],.09);
    for(const end of [-1,1]){
      box(F,W,bed.x,floor+(end<0?.8:.42),bed.z+end*1.26,1.72,end<0?.97:.32,.14,'#855d3e');
      for(const side of [-1,1]){box(F,W,bed.x+side*.80,floor+.57,bed.z+end*1.26,.12,1.04,.12,'#67462e');sphere(F,W,bed.x+side*.80,floor+1.13,bed.z+end*1.26,.09,.09,.09,'#87623e');}
    }
  });
  fixture('wardrobe',wardrobe=>{
    box(F,W,wardrobe.x,floor+.91,wardrobe.z,1.2,1.82,.7,'#6e4c32');
    for(const side of [-1,1]){box(F,W,wardrobe.x+side*.295,floor+.91,wardrobe.z+.365,.55,1.62,.055,'#9c754b');box(F,W,wardrobe.x+side*.295,floor+.91,wardrobe.z+.405,.39,1.40,.03,'#7e5938');sphere(F,M,wardrobe.x+side*.07,floor+.92,wardrobe.z+.45,.034,.034,.034,'#b69b59');}
    box(F,W,wardrobe.x,floor+1.88,wardrobe.z,1.32,.12,.79,'#9b754e');jar(wardrobe.x-.32,wardrobe.z,floor+1.94,'#657646',.17);
  });
  fixture('chest',chest=>{
    box(F,W,chest.x,floor+.30,chest.z,1.3,.56,.8,'#8a5b38');
    // A rounded lid, broad iron straps and a warm brass clasp.
    box(F,W,chest.x,floor+.65,chest.z,1.3,.24,.8,'#a07045',[],.10);
    for(const side of [-1,1]){box(F,M,chest.x+side*.43,floor+.36,chest.z+.405,.07,.59,.035,'#54564c');box(F,M,chest.x+side*.43,floor+.78,chest.z,.07,.035,.75,'#54564c');}
    box(F,M,chest.x,floor+.49,chest.z+.435,.15,.19,.055,'#b29458');
  });
  fixture('shelves',p=>shelf(p.x,p.z,2.2,-Math.PI/2));
  for(const id of ['barrel-a','barrel-b'])fixture(id,p=>barrel(p.x,p.z));
  fixture('counter',counter=>{
    box(F,W,counter.x,floor+.51,counter.z,1.9,.95,.83,'#785133');box(F,W,counter.x,floor+1.04,counter.z,2.03,.13,.96,'#a67c50');
    for(let i=0;i<5;i++)box(F,W,counter.x-.74+i*.37,floor+.52,counter.z+.43,.31,.78,.045,i%2?'#8d633e':'#7d5433');
    jar(counter.x-.55,counter.z,floor+1.11,'#6b7e56',.18);jar(counter.x+.3,counter.z,floor+1.11,'#b39362',.12);candle(counter.x+.65,counter.z-.1,floor+1.1);
  });
  fixture('hearth',hearth=>{
    // West-wall hearth: arched stone surround, dark recess, logs and ember core.
    box(F,S,hearth.x,floor+.09,hearth.z,.9,.18,1.8,'#8d8b77');
    box(F,M,hearth.x-.18,floor+.58,hearth.z,.32,.98,1.35,'#28271f');
    for(const side of [-1,1])for(let row=0;row<4;row++)box(F,S,hearth.x+.13,floor+.18+row*.28,hearth.z+side*.69,.63,.26,.35,choose('stone'),[0,0,(r()-.5)*.025],.055);
    for(let j=0;j<5;j++){const a=(j+.5)/5*Math.PI;box(F,S,hearth.x+.13,floor+1.04+Math.sin(a)*.23,hearth.z+Math.cos(a)*.60,.65,.27,.29,choose('stone'),[Math.cos(a)*.22,0,0],.05);}
    box(F,S,hearth.x-.10,floor+1.92,hearth.z,.66,1.23,1.24,'#8a8976');box(F,W,hearth.x+.17,floor+1.39,hearth.z,.96,.14,1.81,'#62422d');
    for(let row=0;row<4;row++)for(let block=0;block<3;block++)box(F,S,hearth.x+.25,floor+1.55+row*.27,hearth.z-.41+block*.40,.045,.24,.37,choose('stone'),[],.025);
    for(const turn of [-.32,.32])cylinder(F,W,hearth.x+.20,floor+.25,hearth.z,.085,.095,1.05,'#3f2e21',[Math.PI/2,turn,0],8);
    for(let i=0;i<5;i++)sphere(F,L,hearth.x+.24,floor+.35+i%2*.07,hearth.z-.38+i*.19,.08,.13+(i%3)*.05,.08,i%2?'#ffb449':'#d36525');
    jar(hearth.x+.14,hearth.z-.5,floor+1.46,'#7d8954',.16);
  });
  // A small green woven wall banner ties the building to its woodland palette.
  box(outer,C,-.1,floor+1.94,-4.13,.52,.94,.025,'#657445',[],.004);
  box(outer,W,-.1,floor+2.46,-4.09,.67,.055,.065,'#715035');
  for(let layer=0;layer<3;layer++)geometry(outer,C,new THREE.ConeGeometry(.19-layer*.035,.22,3),-.1,floor+1.77+layer*.15,-4.105,'#c4b17d',[0,Math.PI/2,0]);
  group.updateMatrixWorld(true);
  const descendant=(node,ancestor)=>{for(let current=node;current;current=current.parent)if(current===ancestor)return true;return false;};
  for(const fixture of fixtures){
    const bounds=new THREE.Box3();
    for(const [parent,byMaterial]of batches)if(descendant(parent,fixture.group))for(const geometries of byMaterial.values())for(const geo of geometries){
      geo.computeBoundingBox();bounds.union(geo.boundingBox.clone().applyMatrix4(parent.matrixWorld));
    }
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),plan=fixture.plan;
    fixture.fit=new THREE.Matrix4().makeTranslation(plan.x,floor,plan.z)
      .multiply(new THREE.Matrix4().makeScale(plan.width/size.x,plan.height/size.y,plan.depth/size.z))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
  }
  const consolidated=new Map();
  for(const [parent,byMaterial]of batches){
    const anchor=descendant(parent,frontFacade)?frontFacade:descendant(parent,interior)?interior:outer;
    if(!consolidated.has(anchor))consolidated.set(anchor,new Map());
    const target=consolidated.get(anchor),fitted=fixtures.find(fixture=>descendant(parent,fixture.group));
    for(const [material,geometries]of byMaterial){
      if(!target.has(material))target.set(material,[]);
      for(const geo of geometries){geo.applyMatrix4(parent.matrixWorld);if(fitted)geo.applyMatrix4(fitted.fit);target.get(material).push(geo);}
    }
  }
  for(const anchor of [outer,interior,frontFacade])anchor.clear();
  for(const [parent,byMaterial]of consolidated)for(const [material,geometries]of byMaterial){
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,material);mesh.name=parent.name+' · '+material.name;mesh.castShadow=material!==L;mesh.receiveShadow=true;parent.add(mesh);
  }
  let drawCalls=0,triangles=0;group.traverse(node=>{if(node.isMesh){drawCalls++;triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;}});
  const stats={drawCalls,triangles,parts,rooms:3,entrances:2};group.userData.waldhaus={...stats,style:'weathered-timber-stone',floorHeight:floor};
  let disposed=false;
  return{group,roof,frontFacade,interior,stats,dispose(){if(disposed)return;disposed=true;const geometries=new Set();group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.removeFromParent();}};
}
