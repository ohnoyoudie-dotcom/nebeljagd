import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const smooth=THREE.MathUtils.smoothstep,clamp=THREE.MathUtils.clamp;
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment,uniforms={}){return new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});}
function dispose(root){const gs=new Set(),ms=new Set();root.traverse(p=>{if(p.geometry)gs.add(p.geometry);if(p.material)ms.add(p.material);if(p.isInstancedMesh)p.dispose();});root.removeFromParent();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
function stone(color){
  const mat=new THREE.MeshStandardMaterial({color,roughness:.95,metalness:.02});
  mat.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 vStone;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStone=position;');
    s.fragmentShader='varying vec3 vStone;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=sin(vStone.x*31.+sin(vStone.z*23.))*sin(vStone.y*39.+vStone.z*11.);
      float vein=pow(max(0.,1.-abs(sin(vStone.x*6.+vStone.y*3.+sin(vStone.z*8.)*.5))),18.);
      diffuseColor.rgb*=.93+grain*.055-vein*.12;`);
  };mat.customProgramCacheKey=()=> 'spell-weathered-stone-v1';return mat;
}
function dustMaterial(){return shader(`varying vec2 vUv;uniform float uOpacity;uniform vec3 uColor;
  void main(){vec2 p=vUv*2.-1.;float r=length(p);float billow=sin(p.x*11.+sin(p.y*7.))*sin(p.y*9.+p.x*3.);
    float a=exp(-r*r*3.5)*(1.-smoothstep(.55,1.,r))*(.8+billow*.2)*uOpacity;
    gl_FragColor=vec4(uColor,a);#include <colorspace_fragment>
  }`.replace(';#include',';\n#include'),{uOpacity:{value:0},uColor:{value:new THREE.Color('#bca184')}});}
function faceCamera(mesh){mesh.onBeforeRender=(_r,_s,c)=>{mesh.parent.getWorldQuaternion(mesh.quaternion).invert().multiply(c.quaternion);mesh.updateMatrixWorld(true);};}

export function createEarthbreakerVisuals(scene,r,isVisible){
  const root=new THREE.Group();root.name='Erdbrecher · wandernde Felswelle';root.visible=false;scene.add(root);
  const geometry=new THREE.IcosahedronGeometry(1,1),rockMat=stone('#796b54'),dummy=new THREE.Object3D();
  // A bevelled, asymmetric shard rather than a perfect cone or repeated pyramid.
  const pos=geometry.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),t=(y+1)*.5;pos.setXYZ(i,x*(1-t*.92)+t*t*.28,Math.max(-.65,y),z*(1-t*.86));}geometry.computeVertexNormals();
  const pieces=new THREE.InstancedMesh(geometry,rockMat,30);pieces.frustumCulled=false;pieces.castShadow=true;pieces.receiveShadow=true;root.add(pieces);
  const fragmentMat=stone('#aa9671'),fragments=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.09,0),fragmentMat,50);fragments.frustumCulled=false;root.add(fragments);
  const cracks=[],puffs=[];let nodes=[],direction=0,age=0;
  for(let i=0;i<10;i++){
    const mat=shader(`varying vec2 vUv;uniform float uAge,uOpacity;
      void main(){vec2 p=vUv*2.-1.;float bend=sin(p.y*12.)*.11+sin(p.y*27.)*.035;
        float fissure=exp(-pow((p.x-bend)/.028,2.));float halo=exp(-pow((p.x-bend)/.11,2.))*.25;
        float branches=exp(-pow((p.x-(p.y-.1)*.85)/.024,2.))*smoothstep(.12,.20,p.y)*(1.-smoothstep(.6,.8,p.y))*.45;
        float fade=(1.-smoothstep(.7,1.,abs(p.y)))*(1.-smoothstep(.55,.92,abs(p.x)));
        gl_FragColor=vec4(1.,.58,.16,(fissure+halo+branches)*fade*uOpacity);
        #include <colorspace_fragment>
      }`,{uAge:{value:0},uOpacity:{value:0}});
    const crack=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.6),mat);crack.rotation.x=-Math.PI/2;crack.renderOrder=1;root.add(crack);cracks.push(crack);
    const puff=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.15),dustMaterial());faceCamera(puff);root.add(puff);puffs.push(puff);
  }
  function update(t){age=t;root.visible=nodes.length>0;let rockIndex=0,fragmentIndex=0;
    for(let i=0;i<10;i++){
      const p=nodes[i],local=t-r.warning-i*r.step,visible=!!p&&(!isVisible||isVisible(p));
      cracks[i].visible=puffs[i].visible=visible;
      if(!p)continue;
      cracks[i].position.copy(p);cracks[i].position.y+=.045;cracks[i].rotation.z=-direction;
      cracks[i].material.uniforms.uOpacity.value=(local<0?.34+smooth(t,0,r.warning)*.45:1-smooth(local,.06,.6));
      puffs[i].position.copy(p);puffs[i].position.y+=.25+Math.max(0,local)*.4;
      puffs[i].scale.setScalar(.7+Math.max(0,local)*1.6);puffs[i].material.uniforms.uOpacity.value=local<0?0:(1-smooth(local,.06,.52))*.35;
      const growth=smooth(local,0,.09)*(1-smooth(local,.2,.58));
      for(let j=0;j<3;j++){
        const side=(j-1)*.43,forward=j===1?.06:-.12,height=j===1?1.85+(i%3)*.1:.7+(i%2)*.17;
        dummy.position.set(p.x+Math.cos(direction)*side+Math.sin(direction)*forward,p.y+height*growth*.5-.03,p.z-Math.sin(direction)*side+Math.cos(direction)*forward);
        dummy.rotation.set(.12*(j-1),direction+i*.51+j*.6,.12*(j-1));dummy.scale.set(.38*growth,height*.6*growth,.35*growth);
        if(!visible)dummy.scale.setScalar(0);dummy.updateMatrix();pieces.setMatrixAt(rockIndex++,dummy.matrix);
      }
      for(let j=0;j<5;j++){
        const a=i*2.4+j*1.26,life=local>=0&&local<.52,travel=Math.max(0,local);
        dummy.position.set(p.x+Math.cos(a)*travel*2.4,p.y+.1+travel*2.8-travel*travel*5.2,p.z+Math.sin(a)*travel*2.4);
        dummy.rotation.set(a+travel*6,i+travel*8,j);dummy.scale.setScalar(visible&&life?(1-smooth(travel,.3,.52))*(.65+(j%3)*.3):0);dummy.updateMatrix();fragments.setMatrixAt(fragmentIndex++,dummy.matrix);
      }
    }
    pieces.count=rockIndex;fragments.count=fragmentIndex;pieces.instanceMatrix.needsUpdate=fragments.instanceMatrix.needsUpdate=true;
  }
  return{begin(points,_origin,yaw){nodes=points.map(p=>p.clone());direction=yaw;update(0);},trim(n){nodes.length=n;},update,
    reset(){nodes=[];root.visible=false;},get telemetry(){return{visualStyle:'amber-fissures-stone-wave',visible:root.visible,erupting:nodes.filter((_,i)=>age>=r.warning+i*r.step&&age<r.warning+i*r.step+.58).length};},dispose(){dispose(root);}};
}

export function createRuneWallVisuals(scene,r,ownerView,isVisible){
  const root=new THREE.Group();root.name='Runenmauer · gemeißelter Stein';root.visible=false;scene.add(root);
  const preview=new THREE.Mesh(new THREE.PlaneGeometry(r.width+.25,r.depth+.25),shader(`varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;
    void main(){vec2 p=abs(vUv*2.-1.);float edge=max(p.x,p.y);float line=exp(-pow((edge-.90)/.035,2.));
      gl_FragColor=vec4(uColor,(line*.9+.06)*uOpacity);#include <colorspace_fragment>
    }`.replace(';#include',';\n#include'),{uColor:{value:new THREE.Color('#83efff')},uOpacity:{value:1}}));
  preview.rotation.x=-Math.PI/2;preview.position.y=.07;preview.material.depthTest=false;preview.renderOrder=30;root.add(preview);
  const blocks=[];
  for(let row=0;row<4;row++)for(let x=-r.width/2-(row%2)*.25;x<r.width/2-.01;x+=.5){
    const left=Math.max(-r.width/2,x),right=Math.min(r.width/2,x+.5);blocks.push({x:(left+right)/2,y:.07+row*.49+.235,width:right-left-.025,height:.46,depth:r.depth-.045,row});
  }
  for(let i=0;i<7;i++)blocks.push({x:-1.5+i*.5,y:2.12,width:.46,height:i%2?.18:.32,depth:r.depth+.04,row:4});
  const mat=stone('#849391');mat.transparent=ownerView;mat.opacity=ownerView?.66:1;mat.depthWrite=!ownerView;
  const mesh=new THREE.InstancedMesh(new RoundedBoxGeometry(1,1,1,2,.085),mat,blocks.length);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;root.add(mesh);
  blocks.forEach((_,i)=>mesh.setColorAt(i,new THREE.Color().setHSL(.12+(i%3)*.015,.07,.65+(i%5)*.035)));
  const glyphMaterial=shader(`varying vec2 vUv;uniform float uOpacity,uTime;
    float segment(vec2 p,vec2 a,vec2 b){vec2 d=b-a;return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.,1.));}
    void main(){vec2 p=vUv*2.-1.;float d=min(min(segment(p,vec2(0.,.85),vec2(.65,0.)),segment(p,vec2(.65,0.),vec2(0.,-.85))),min(segment(p,vec2(0.,-.85),vec2(-.65,0.)),segment(p,vec2(-.65,0.),vec2(0.,.85))));
      d=min(d,segment(p,vec2(-.35,0.),vec2(.35,0.)));d=min(d,segment(p,vec2(0.,-.4),vec2(0.,.4)));
      float a=(exp(-d*d*1600.)+exp(-d*d*160.)*.2)*uOpacity*(.9+.1*sin(uTime*3.));gl_FragColor=vec4(.38,.9,1.,a);
      #include <colorspace_fragment>
    }`,{uOpacity:{value:0},uTime:{value:0}});
  const glyphs=[];for(const z of [-r.depth/2-.01,r.depth/2+.01])for(const x of [-1.05,0,1.05]){
    const glyph=new THREE.Mesh(new THREE.PlaneGeometry(.55,.92),glyphMaterial);glyph.position.set(x,1.15,z);if(z<0)glyph.rotation.y=Math.PI;root.add(glyph);glyphs.push(glyph);
  }
  const dust=new THREE.Mesh(new THREE.PlaneGeometry(4.2,1.1),dustMaterial());dust.position.y=.2;faceCamera(dust);root.add(dust);
  const rubble=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.13,0),stone('#849391'),18);rubble.frustumCulled=false;root.add(rubble);
  const dummy=new THREE.Object3D();let aiming=false,phase='idle';
  function place(center,angle){root.position.copy(center);root.rotation.y=angle;root.visible=!isVisible||isVisible(center);}
  function show(center,angle,age,collapseAge,health){
    aiming=false;place(center,angle);const falling=collapseAge!==null,emerge=smooth(age,r.warning,r.warning+r.rise);
    phase=falling?'crumbling':age<r.warning?'warning':age<r.warning+r.rise?'rising':'standing';
    preview.visible=!falling&&age<r.warning+r.rise;preview.material.uniforms.uColor.value.set('#86edff');preview.material.uniforms.uOpacity.value=1-emerge;
    mesh.visible=age>=r.warning;glyphMaterial.uniforms.uOpacity.value=falling?1-smooth(collapseAge,0,.18):emerge*(.65+health*.25);glyphMaterial.uniforms.uTime.value=age;
    glyphs.forEach(g=>g.visible=mesh.visible);
    blocks.forEach((b,i)=>{
      const rise=smooth(age,r.warning+b.row*.035,r.warning+r.rise+b.row*.025),fall=falling?collapseAge:0;
      dummy.position.set(b.x+Math.sin(i*12.3)*fall*.55,b.y-2.5*(1-rise)-fall*fall*5.4,Math.cos(i*9.1)*fall*.65);
      dummy.rotation.set(fall*Math.sin(i)*1.8,fall*Math.cos(i)*1.4,fall*Math.sin(i*2)*.8);
      dummy.scale.set(b.width,b.height,b.depth).multiplyScalar(falling?1-smooth(fall,.3,r.fade):1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });mesh.instanceMatrix.needsUpdate=true;
    dust.visible=age>=r.warning;dust.material.uniforms.uOpacity.value=falling?(1-smooth(collapseAge,.05,r.fade))*.35:(1-smooth(age,r.warning+.1,r.warning+.5))*.28;
    for(let i=0;i<18;i++){
      const t=falling?collapseAge:age-r.warning,a=i*2.4,live=t>=0&&t<.6;
      dummy.position.set((i%7-3)*.48+Math.cos(a)*Math.max(0,t),.12+Math.max(0,t)*2.2-t*t*4,Math.sin(a)*Math.max(0,t)*1.1);
      dummy.rotation.set(t*4+i,t*6,i);dummy.scale.setScalar(live?(1-smooth(t,.25,.6))*(.5+i%3*.25):0);dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix);
    }rubble.instanceMatrix.needsUpdate=true;rubble.visible=age>=r.warning;
  }
  return{aim(center,angle,valid){aiming=true;phase='aim';place(center,angle);mesh.visible=dust.visible=rubble.visible=false;glyphs.forEach(g=>g.visible=false);preview.visible=true;preview.material.uniforms.uOpacity.value=1;preview.material.uniforms.uColor.value.set(valid?'#83efff':'#ff6655');},
    cancelAim(){if(aiming){root.visible=false;aiming=false;}},show,reset(){root.visible=false;aiming=false;phase='idle';},
    get telemetry(){return{phase,visible:root.visible,blocks:blocks.length,ownerTransparent:ownerView};},dispose(){dispose(root);}};
}
