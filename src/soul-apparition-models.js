import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Sculpted three-piece skull. Geometry is shared; each marked victim owns its colour/fade state. */
export function createSoulApparitionModels() {
  const geometries = new Set(), materials = new Set(); let disposed = false;
  const own = geometry => (geometries.add(geometry), geometry);
  function material(name, color, order, emissive = '#000000') {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .73, metalness: .02, emissive,
      emissiveIntensity: name === 'eyes' ? .65 : .12, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    m.userData = { kind: name, order }; materials.add(m); return m;
  }
  const bone = material('bone', '#a8ad9b', 13), ivory = material('ivory', '#d4d1b7', 14),
    back = material('back', '#899584', 10), cavity = material('cavity', '#05090c', 12),
    fissure = material('fissure', '#56615a', 15), eyes = material('eyes', '#759b94', 15, '#6eaaa1');
  const mesh = (parent, geometry, mat, x=0,y=0,z=0) => {
    const m = new THREE.Mesh(geometry,mat);m.position.set(x,y,z);parent.add(m);return m;
  };
  function shape(points) {const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return s;}
  const extrude = (s,depth=.15,bevel=.025) => own(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,
    bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,steps:1,curveSegments:16}));
  function ridge(parent,points,radius,mat) {
    return mesh(parent,own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,radius,6,false)),mat);
  }
  const half = new THREE.Group();
  const dome=mesh(half,own(new THREE.SphereGeometry(1,24,18,Math.PI/2,Math.PI)),back,0,.45,-.22);
  dome.scale.set(.57,.56,.34);
  const face = new THREE.Shape();face.moveTo(.015,.10);face.lineTo(.105,.025);face.lineTo(.15,-.16);face.lineTo(.34,-.16);
  face.lineTo(.43,-.035);face.lineTo(.46,.10);face.bezierCurveTo(.62,.15,.59,.50,.48,.68);
  face.bezierCurveTo(.36,.87,.18,.94,.015,.93);face.lineTo(.015,.51);face.lineTo(.055,.37);face.lineTo(.015,.22);face.closePath();
  const socket = new THREE.Shape();socket.moveTo(.12,.345);socket.bezierCurveTo(.20,.405,.39,.48,.48,.43);
  socket.lineTo(.425,.245);socket.bezierCurveTo(.33,.145,.19,.16,.125,.235);socket.closePath();face.holes.push(socket);
  mesh(half,extrude(face,.14,.035),bone,0,0,.14);
  mesh(half,own(new THREE.ShapeGeometry(socket)),cavity,0,0,.115);
  mesh(half,own(new THREE.ShapeGeometry(shape([[.01,.205],[.11,.035],[.035,-.055],[.01,-.035]]))),cavity,0,0,.20);
  mesh(half,own(new THREE.ShapeGeometry(shape([[.02,-.10],[.33,-.10],[.32,-.40],[.02,-.42]]))),cavity,0,0,.12);
  mesh(half,extrude(shape([[.10,.40],[.465,.52],[.48,.445],[.13,.335]]),.055,.018),ivory,0,0,.29);
  ridge(half,[[.48,.17,.29],[.38,.045,.34],[.24,-.03,.34]],.036,ivory);
  ridge(half,[[.065,.31,.32],[.10,.18,.35],[.13,.075,.31]],.024,ivory);
  ridge(half,[[.45,.66,.26],[.49,.54,.30],[.51,.32,.28]],.018,back);
  ridge(half,[[.19,.84,.31],[.15,.74,.33],[.205,.68,.34],[.18,.61,.34]],.006,fissure);
  ridge(half,[[.35,.075,.355],[.32,.025,.36],[.35,-.025,.35]],.005,fissure);
  const eye=mesh(half,own(new THREE.SphereGeometry(1,12,8)),eyes,.275,.31,.18);eye.scale.set(.062,.027,.027);
  const toothGeometry=extrude(shape([[-.033,.068],[.034,.064],[.031,-.06],[.018,-.083],[-.025,-.071]]),.105,.010);
  for(let i=0;i<4;i++) {
    const tooth=mesh(half,toothGeometry,ivory,.052+i*.079,-.158,.23);
    tooth.rotation.z=-i*.055;tooth.scale.y=i===3?1.20:1-(i%2)*.07;
  }
  const mandible=new THREE.Group();mandible.name='Beweglicher Unterkiefer';
  const jawShape=new THREE.Shape();jawShape.moveTo(-.43,-.16);jawShape.lineTo(-.39,-.38);
  jawShape.bezierCurveTo(-.30,-.58,.30,-.58,.39,-.38);jawShape.lineTo(.43,-.16);jawShape.lineTo(.32,-.25);
  jawShape.bezierCurveTo(.23,-.39,-.23,-.39,-.32,-.25);jawShape.closePath();
  mesh(mandible,extrude(jawShape,.15,.025),bone,0,0,.12);
  ridge(mandible,[[-.30,-.40,.29],[0,-.49,.32],[.30,-.40,.29]],.022,ivory);
  for(let i=0;i<8;i++) {
    const tooth=mesh(mandible,toothGeometry,ivory,(i-3.5)*.077,-.272,.22);
    tooth.rotation.z=(i-3.5)*.025;tooth.scale.set(.9,.88,1);
  }
  // Merge details by material so extra tooth/cheek geometry does not add per-victim draw calls.
  const sourceGeometries=new Set();
  function compact(group) {
    group.updateMatrixWorld(true);const buckets=new Map(),sources=new Set();
    group.traverse(p=>{if(!p.isMesh)return;sources.add(p.geometry);
      const g=p.geometry.index?p.geometry.toNonIndexed():p.geometry.clone();g.applyMatrix4(p.matrixWorld);
      for(const key of Object.keys(g.attributes))if(!['position','normal','uv'].includes(key))g.deleteAttribute(key);
      if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
      if(!buckets.has(p.material))buckets.set(p.material,[]);buckets.get(p.material).push(g);
    });
    group.clear();
    for(const [mat,parts]of buckets){const merged=own(mergeGeometries(parts,false));parts.forEach(g=>g.dispose());
      const p=mesh(group,merged,mat);p.name='Totenkopf · '+mat.userData.kind;p.renderOrder=mat.userData.order;p.frustumCulled=false;}
    for(const g of sources)sourceGeometries.add(g);
  }
  compact(half);compact(mandible);
  for(const g of sourceGeometries){geometries.delete(g);g.dispose();}
  const pulseGeometry=own(new THREE.SphereGeometry(1,20,12));
  function spectralMaterial(smoke=false) {
    const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,
      uniforms:{uOpacity:{value:0},uTime:{value:0}},
      vertexShader:`varying vec3 vNormal,vView,vLocal;void main(){vLocal=position;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`,
      fragmentShader:`varying vec3 vNormal,vView,vLocal;uniform float uOpacity,uTime;
        void main(){float face=max(0.,dot(normalize(vNormal),normalize(vView)));
          float n=.5+.5*sin(vLocal.x*8.+uTime*13.+sin(vLocal.y*7.-uTime*9.))*sin(vLocal.z*6.+uTime*7.);
          float alpha=pow(face,${smoke?'1.3':'1.8'})*uOpacity*(.72+n*.28);
          vec3 color=${smoke?'mix(vec3(.016,.011,.023),vec3(.18,.018,.035),n*.27)':'mix(vec3(.10,.004,.018),vec3(.82,.085,.045),pow(face,3.)*(.65+n*.35))'};
          if(alpha<.003)discard;gl_FragColor=vec4(color,alpha);
          #include <colorspace_fragment>
        }`});materials.add(mat);return mat;
  }
  const pulseMaterial=spectralMaterial(),mistMaterial=spectralMaterial(true);
  const redBone=new THREE.Color('#8c1425'),redEye=new THREE.Color('#ff3427'),redEmission=new THREE.Color('#6b0717');
  function clone(prototype) {
    const root=prototype.clone(true),copies=new Map();
    root.traverse(p=>{if(!p.isMesh)return;const source=p.material;
      if(!copies.has(source)) {const m=source.clone();m.userData={...source.userData,baseColor:source.color?.clone(),baseEmissive:source.emissive?.clone(),baseEmission:source.emissiveIntensity,baseOpacity:source.opacity};copies.set(source,m);}
      p.material=copies.get(source);});return root;
  }
  function fade(root,opacity) {root.traverse(p=>{if(p.material&&!p.material.isShaderMaterial)p.material.opacity=p.material.userData.baseOpacity*opacity;});}
  function heat(root,value,pulse=0) {root.traverse(p=>{const m=p.material;if(!m?.color)return;const data=m.userData;
    m.color.copy(data.baseColor);m.emissive.copy(data.baseEmissive);m.emissiveIntensity=data.baseEmission;
    if(['bone','ivory','back'].includes(data.kind)){m.color.lerp(redBone,(1-Math.pow(1-value,2))*.97);m.emissive.lerp(redEmission,value);m.emissiveIntensity=.10+value*(.50+pulse*.20);}
    if(data.kind==='eyes'){m.color.lerp(redEye,value);m.emissive.lerp(redEye,value);m.emissiveIntensity=.65+value*(1.6+pulse*.7);}
  });}
  return {create(root) {
    const pieces=[new THREE.Group(),new THREE.Group(),new THREE.Group()];
    const left=clone(half),right=clone(half),jaw=clone(mandible);left.scale.x=-1;
    pieces[0].name='Totenkopf · linke Hälfte';pieces[1].name='Totenkopf · rechte Hälfte';pieces[2].name='Totenkopf · Unterkiefer';
    pieces[0].add(left);pieces[1].add(right);pieces[2].add(jaw);root.add(...pieces);
    const facing=(_renderer,_scene,camera)=>{if(!root.quaternion.equals(camera.quaternion)){root.quaternion.copy(camera.quaternion);root.updateMatrixWorld(true);}};
    root.traverse(p=>{if(p.isMesh)p.onBeforeRender=facing;});
    const effectRoot=new THREE.Group();effectRoot.name='Seelenurteil · weltgerichteter Einschlag';effectRoot.visible=false;
    const pulse=new THREE.Mesh(pulseGeometry,pulseMaterial.clone());pulse.name='Seelenurteil · fallender Impuls';pulse.frustumCulled=false;effectRoot.add(pulse);
    const mist=[];for(let i=0;i<3;i++){const p=new THREE.Mesh(pulseGeometry,mistMaterial.clone());p.name='Seelenurteil · Schattenstoß';p.frustumCulled=false;effectRoot.add(p);mist.push(p);}
    return {pieces,jaw,effectRoot,pulse,mist};
  },fade,heat,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
