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
  const capacity=Math.ceil(r.range/r.spacing);
  const pieces=new THREE.InstancedMesh(geometry,rockMat,capacity*3);pieces.frustumCulled=false;pieces.castShadow=true;pieces.receiveShadow=true;root.add(pieces);
  const fragmentMat=stone('#aa9671'),fragments=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.09,0),fragmentMat,capacity*5);fragments.frustumCulled=false;root.add(fragments);
  const cracks=[],puffs=[];let nodes=[],widths=[],direction=0,age=0;
  for(let i=0;i<capacity;i++){
    const mat=shader(`varying vec2 vUv;uniform float uOpen,uHeat,uDistance;
      void main(){vec2 p=vUv*2.-1.;float along=uDistance-p.y*.8;
        float bend=sin(along*7.)*.07+sin(along*15.+.2)*.025;
        float d=abs(p.x-bend),width=.012+.065*uOpen;
        float gap=1.-smoothstep(width*.55,width,d);
        float lip=exp(-pow((d-width)/.018,2.));
        float branch=exp(-pow((p.x-(p.y-.1)*.7)/.022,2.))*smoothstep(.1,.25,p.y)*(1.-smoothstep(.6,.85,p.y));
        float endFade=1.-smoothstep(.76,1.,abs(p.y));
        float alpha=max(gap*.94,(lip*.7+branch*.38)*uOpen)*endFade*uOpen;
        vec3 rock=vec3(.075,.043,.024),light=vec3(1.,.47,.085);
        vec3 color=mix(rock,light,clamp((lip+branch*.5)*uHeat,0.,1.));
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`,{uOpen:{value:0},uHeat:{value:0},uDistance:{value:i*r.spacing}});
    const crack=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.6),mat);crack.rotation.x=-Math.PI/2;crack.renderOrder=1;root.add(crack);cracks.push(crack);
    const puff=new THREE.Mesh(new THREE.PlaneGeometry(1.8,1.15),dustMaterial());faceCamera(puff);root.add(puff);puffs.push(puff);
  }
  function update(t){age=t;root.visible=nodes.length>0;let rockIndex=0,fragmentIndex=0;
    for(let i=0;i<capacity;i++){
      const p=nodes[i],local=t-r.warning-i*r.step,visible=!!p&&(!isVisible||isVisible(p));
      cracks[i].visible=visible&&local>=0&&local<r.fade;
      puffs[i].visible=visible&&local>=0&&local<.52;
      if(!p)continue;
      const spread=widths[i]/r.width;
      cracks[i].position.copy(p);cracks[i].position.y+=.045;cracks[i].rotation.z=-direction;cracks[i].scale.x=spread;
      cracks[i].material.uniforms.uOpen.value=local<0?0:(.45+.55*smooth(local,0,.08))*(1-smooth(local,.5,r.fade));
      cracks[i].material.uniforms.uHeat.value=local<0?0:1-smooth(local,.035,.23);
      puffs[i].position.copy(p);puffs[i].position.y+=.25+Math.max(0,local)*.4;
      puffs[i].scale.set((.7+Math.max(0,local)*1.6)*spread,.7+Math.max(0,local)*1.6,1);puffs[i].material.uniforms.uOpacity.value=local<0?0:(1-smooth(local,.06,.52))*.35;
      const growth=local<0?0:(.14+.86*smooth(local,0,.09))*(1-smooth(local,.2,.58));
      for(let j=0;j<3;j++){
        const side=(j-1)*.43*spread,forward=j===1?.06:-.12,height=j===1?1.85+(i%3)*.1:.7+(i%2)*.17;
        dummy.position.set(p.x+Math.cos(direction)*side+Math.sin(direction)*forward,p.y+height*growth*.5-.03,p.z-Math.sin(direction)*side+Math.cos(direction)*forward);
        dummy.rotation.set(.12*(j-1),direction+i*.51+j*.6,.12*(j-1));dummy.scale.set(.38*growth*Math.sqrt(spread),height*.6*growth,.35*growth);
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
  return{begin(points,_origin,yaw,nodeWidths){nodes=points.map(p=>p.clone());widths=nodeWidths;direction=yaw;update(0);},trim(n){nodes.length=n;},update,
    reset(){nodes=[];root.visible=false;},get telemetry(){return{visualStyle:'travelling-open-fissure',visible:root.visible,openCracks:cracks.filter(c=>c.visible).length,erupting:nodes.filter((_,i)=>age>=r.warning+i*r.step&&age<r.warning+i*r.step+.58).length};},dispose(){dispose(root);}};
}

export function createRuneWallVisuals(scene,r,ownerView,isVisible){
  const root=new THREE.Group();root.name='Runenmauer · arkanes Mauerwerk';root.visible=false;scene.add(root);
  const preview=new THREE.Mesh(new THREE.PlaneGeometry(r.width+.25,r.depth+.25),shader(`varying vec2 vUv;uniform vec3 uColor;uniform float uOpacity;
    void main(){vec2 p=abs(vUv*2.-1.);float edge=max(p.x,p.y);float line=exp(-pow((edge-.90)/.035,2.));
      gl_FragColor=vec4(uColor,(line*.9+.06)*uOpacity);
      #include <colorspace_fragment>
    }`,{uColor:{value:new THREE.Color('#83efff')},uOpacity:{value:1}}));
  preview.rotation.x=-Math.PI/2;preview.position.y=.07;preview.material.depthTest=false;preview.renderOrder=30;root.add(preview);

  // Broad, staggered ashlar instead of a grid of identical small tiles. The
  // plinth, dressed coping and end piers give the spell a coherent silhouette.
  const blocks=[],half=r.width/2,inner=half-.52;
  const add=(x,y,width,height,depth,row,kind='body')=>blocks.push({x,y,width,height,depth,row,kind});
  const widths=[1.05,.84,1.2,.96,1.12];
  for(let row=0;row<3;row++){
    let x=-inner,index=0;
    while(x<inner-.02){const w=Math.min(inner-x,index===0&&row%2?.57:widths[(index+row*2)%widths.length]);
      add(x+w/2,.45+row*.55,w-.045,.505,r.depth-.085-(index%3)*.012,row);x+=w;index++;}
  }
  for(let x=-inner;x<inner-.02;){const w=Math.min(1.15,inner-x);add(x+w/2,.105,w-.025,.20,r.depth,0,'plinth');x+=w;}
  for(let x=-inner;x<inner-.02;){const w=Math.min(.98,inner-x);add(x+w/2,1.98,w-.035,.29,r.depth,3,'coping');x+=w;}
  for(const sign of [-1,1]){
    const x=sign*(half-.26);
    for(let row=0;row<3;row++)add(x,.42+row*.58,.49,.54,r.depth,row,'pier');
    add(x,.1,.52,.19,r.depth,0,'plinth');add(x,2.12,.52,.34,r.depth,3,'coping');
  }
  const mat=stone('#6089ba');mat.roughness=.63;mat.metalness=.16;mat.emissive.set('#254f83');mat.emissiveIntensity=.14;
  mat.transparent=true;mat.opacity=ownerView?.87:1;mat.depthWrite=true;
  const dissolve={value:0},glow={value:0},baseCompile=mat.onBeforeCompile;
  mat.onBeforeCompile=s=>{
    baseCompile(s);s.uniforms.uArcaneGlow=glow;s.uniforms.uDissolve=dissolve;
    s.vertexShader='varying vec3 vWall;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      #ifdef USE_INSTANCING
        vWall=(instanceMatrix*vec4(transformed,1.)).xyz;
      #else
        vWall=transformed;
      #endif
    `);
    s.fragmentShader=`uniform float uArcaneGlow,uDissolve;varying vec3 vWall;
      float arcHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float arcNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(arcHash(i),arcHash(i+vec3(1,0,0)),f.x),mix(arcHash(i+vec3(0,1,0)),arcHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(arcHash(i+vec3(0,0,1)),arcHash(i+vec3(1,0,1)),f.x),mix(arcHash(i+vec3(0,1,1)),arcHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      `+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      float field=.9*(1.-clamp(vWall.y/2.3,0.,1.))+.04
        +arcNoise(vWall*3.8)*.12+arcNoise(vWall*10.7)*.06+sin(vWall.x*2.1)*.03;
      float dissolveEdge=0.;
      if(uDissolve>0.){
        float remaining=field-uDissolve;
        float coverage=smoothstep(-.018,.018,remaining);
        if(coverage<.015)discard;
        diffuseColor.a*=coverage;
        dissolveEdge=1.-smoothstep(0.,.10,remaining);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.28,.58,.78),dissolveEdge*.65);
      }
      totalEmissiveRadiance+=mix(vec3(.12,1.1,2.6),vec3(1.3,2.5,3.),pow(dissolveEdge,5.))*dissolveEdge;
      vec3 edgeP=abs(vStone);float edge=min(max(edgeP.x,edgeP.y),min(max(edgeP.x,edgeP.z),max(edgeP.y,edgeP.z)));
      float bevel=smoothstep(.425,.495,edge);
      totalEmissiveRadiance+=vec3(.035,.27,.55)*bevel*uArcaneGlow;
    `);
  };mat.customProgramCacheKey=()=> 'arcane-ashlar-coherent-dissolve-v3';
  const blockGeometry=new RoundedBoxGeometry(1,1,1,3,.075),face=blockGeometry.attributes.position;
  // Shallow hand-cut planes catch light across the stone faces; keep the
  // perimeter and the physical dimensions intact rather than adding decals.
  for(let i=0;i<face.count;i++){
    const x=face.getX(i),y=face.getY(i),z=face.getZ(i);
    const inset=Math.max(0,1-Math.pow(x/.46,2))*Math.max(0,1-Math.pow(y/.46,2));
    if(Math.abs(z)>.45)face.setZ(i,z+Math.sign(z)*inset*(.055+Math.sin(x*9+y*6)*.025));
  }
  blockGeometry.computeVertexNormals();
  const mesh=new THREE.InstancedMesh(blockGeometry,mat,blocks.length);mesh.name='Facettierte blaue Quader';mesh.castShadow=true;mesh.receiveShadow=false;mesh.frustumCulled=false;root.add(mesh);
  const shades=['#bfd5ed','#88aace','#b1c9df','#94b2d9','#d2dfed'];
  blocks.forEach((b,i)=>mesh.setColorAt(i,new THREE.Color(b.kind==='coping'?'#d4e4f5':b.kind==='pier'?'#9bbde3':shades[(i*3)%shades.length])));

  // Recessed light lives inside the masonry and is visible through its joints.
  // There are deliberately no freestanding glyphs or symbol decals.
  const coreMat=new THREE.MeshStandardMaterial({color:'#267ab6',emissive:'#46caff',emissiveIntensity:1.2,roughness:.3,transparent:true,opacity:.8,depthWrite:false});
  const core=new THREE.Mesh(new RoundedBoxGeometry(r.width-.16,1.88,r.depth-.25,2,.06),coreMat);core.name='Licht in den Fugen';root.add(core);
  const haloMat=shader(`varying vec2 vUv;uniform float uOpacity;
    void main(){vec2 p=vUv*2.-1.;float a=exp(-p.y*p.y*10.)*(1.-smoothstep(.72,1.,abs(p.x)))*uOpacity;
      gl_FragColor=vec4(.12,.56,1.,a);
      #include <colorspace_fragment>
    }`,{uOpacity:{value:0}});
  const halo=new THREE.Mesh(new THREE.PlaneGeometry(r.width+.5,2.4),haloMat);halo.rotation.x=-Math.PI/2;halo.position.y=.035;root.add(halo);
  // Soft camera-facing sparks, emitted from the receding masonry edge.
  const moteMat=shader(`varying vec2 vUv;uniform float uOpacity;
    void main(){vec2 p=vUv*2.-1.;float r=length(p);
      float a=exp(-r*r*4.)*(1.-smoothstep(.5,1.,r))*uOpacity;
      vec3 c=mix(vec3(.12,.5,1.),vec3(.8,.96,1.),exp(-r*r*12.));
      gl_FragColor=vec4(c,a);
      #include <colorspace_fragment>
    }`,{uOpacity:{value:0}});
  moteMat.blending=THREE.AdditiveBlending;
  moteMat.vertexShader=`varying vec2 vUv;void main(){vUv=uv;
    vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
    vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
    gl_Position=projectionMatrix*(center+vec4(position.xy*size,0.,0.));}`;
  const motes=new THREE.InstancedMesh(new THREE.PlaneGeometry(2,2),moteMat,96);motes.frustumCulled=false;motes.name='Arkaner Lichtstaub';root.add(motes);
  const dust=new THREE.Mesh(new THREE.PlaneGeometry(r.width+.7,1.1),dustMaterial());dust.material.uniforms.uColor.value.set('#86a9bf');dust.position.y=.2;faceCamera(dust);root.add(dust);
  const rubble=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.13,0),stone('#46668c'),18);rubble.frustumCulled=false;root.add(rubble);
  const dummy=new THREE.Object3D();let aiming=false,phase='idle',liveMotes=0;
  function place(center,angle){root.position.copy(center);root.rotation.y=angle;root.visible=!isVisible||isVisible(center);}
  function show(center,angle,age,collapseAge,health){
    aiming=false;place(center,angle);const dissolving=collapseAge!==null,emerge=smooth(age,r.warning,r.warning+r.rise);
    const energy=dissolving?1-smooth(collapseAge,.65,r.fade):emerge;
    dissolve.value=dissolving?smooth(collapseAge,.045,.76)*1.22:0;
    phase=dissolving?'dissolving':age<r.warning?'warning':age<r.warning+r.rise?'rising':'standing';
    preview.visible=!dissolving&&age<r.warning+r.rise;preview.material.uniforms.uColor.value.set('#86edff');preview.material.uniforms.uOpacity.value=1-emerge;
    mesh.visible=age>=r.warning;mesh.castShadow=!dissolving;
    glow.value=dissolving?energy*(.65+2.2*Math.exp(-Math.pow((collapseAge-.10)/.065,2))):energy*(.35+.10*Math.sin(age*2.4)+.3*(1-smooth(age,.25,.65)));
    core.visible=energy>.001&&(!dissolving||collapseAge<.22);core.position.y=.99;core.scale.y=Math.max(.001,emerge);coreMat.opacity=(dissolving?1-smooth(collapseAge,.04,.22):energy)*.8;coreMat.emissiveIntensity=.85+glow.value*.75;
    halo.visible=motes.visible=energy>.001;haloMat.uniforms.uOpacity.value=energy*.16;moteMat.uniforms.uOpacity.value=energy*(dissolving?.85:.45+health*.15);
    blocks.forEach((b,i)=>{
      const rise=smooth(age,r.warning+b.row*.01,r.warning+r.rise+b.row*.01);
      dummy.position.set(b.x,b.y-2.5*(1-rise),0);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(b.width,b.height,b.depth);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });mesh.instanceMatrix.needsUpdate=true;
    motes.count=dissolving?96:16;liveMotes=0;
    for(let i=0;i<motes.count;i++){
      const seed=(Math.sin(i*127.1+17.7)*43758.5453)%1,random=seed-Math.floor(seed);
      let size;
      if(dissolving){
        const born=(i/95)*.61,t=collapseAge-born,life=.32+random*.17,live=t>=0&&t<life;
        const progress=clamp(t/life,0,1),curl=Math.sin(i*2.4+progress*3.2);
        dummy.position.set(((i*0.6180339)%1*2-1)*half*.97+curl*progress*.22,
          2.3*(1-born/.65)+Math.max(0,t)*(1.1+random*.8),Math.sin(i*4.31)*.29+progress*Math.cos(i)*.22);
        size=live*Math.sin(progress*Math.PI)*(.055+random*.075);if(live)liveMotes++;
      }else{
        const t=(age*.38+i*.618)%1;dummy.position.set(Math.sin(i*4.31)*half*.95,.12+t*2.4,Math.cos(i*2.17)*.42);
        size=Math.sin(t*Math.PI)*(.025+random*.025);liveMotes++;
      }
      dummy.rotation.set(0,0,0);dummy.scale.set(size,size*(dissolving?1.6:1),size);dummy.updateMatrix();motes.setMatrixAt(i,dummy.matrix);
    }motes.instanceMatrix.needsUpdate=true;
    dust.visible=!dissolving&&age>=r.warning;dust.material.uniforms.uOpacity.value=dissolving?(1-smooth(collapseAge,.05,r.fade))*.25:(1-smooth(age,r.warning+.1,r.warning+.5))*.2;
    for(let i=0;i<18;i++){
      const t=dissolving?collapseAge:age-r.warning,a=i*2.4,live=t>=0&&t<.6;
      dummy.position.set((i%7-3)*(r.width/7)+Math.cos(a)*Math.max(0,t),.12+Math.max(0,t)*2.2-t*t*4,Math.sin(a)*Math.max(0,t)*1.1);
      dummy.rotation.set(t*4+i,t*6,i);dummy.scale.setScalar(live?(1-smooth(t,.25,.6))*(.5+i%3*.25):0);dummy.updateMatrix();rubble.setMatrixAt(i,dummy.matrix);
    }rubble.instanceMatrix.needsUpdate=true;rubble.visible=!dissolving&&age>=r.warning;
  }
  function hideBody(){mesh.visible=core.visible=halo.visible=motes.visible=dust.visible=rubble.visible=false;}
  return{aim(center,angle,valid){aiming=true;phase='aim';place(center,angle);hideBody();preview.visible=true;preview.material.uniforms.uOpacity.value=1;preview.material.uniforms.uColor.value.set(valid?'#83efff':'#ff6655');},
    cancelAim(){if(aiming){root.visible=false;aiming=false;}},show,reset(){root.visible=false;aiming=false;phase='idle';dissolve.value=0;liveMotes=0;},
    get telemetry(){return{phase,visualStyle:'arcane-ashlar-lit-joints',glyphs:0,stoneColor:'#6089ba',width:r.width,visible:root.visible,blocks:blocks.length,ownerTransparent:ownerView,dissolveStyle:'top-down-luminous-erosion',dissolve:dissolve.value,liveMotes};},dispose(){dispose(root);}};
}
