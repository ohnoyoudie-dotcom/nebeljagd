import * as THREE from 'three';

/** Small sculpted apparitions share geometry; each victim owns its fading materials. */
export function createSoulApparitionModels() {
  const geometries = new Set(), materials = new Set();
  const own = g => (geometries.add(g), g);
  function material(color, roughness = .7, metalness = 0, emissive = '#000000') {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive,
      emissiveIntensity: .26, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    materials.add(m); return m;
  }
  const bone = material('#a5aeaa'), ivory = material('#d0d2bc'), cavity = material('#080e16'),
    robe = material('#17232c'), seam = material('#405561'), metal = material('#879ba4', .3, .65),
    edge = material('#d4e1dc', .25, .55), wood = material('#302e30'), eyes = material('#9bc5bd', .4, 0, '#a9ded2');
  function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
    const p = new THREE.Mesh(geometry, mat); p.position.set(x,y,z); p.frustumCulled = false; parent.add(p); return p;
  }
  function shape(points) { const s = new THREE.Shape(); points.forEach(([x,y],i) => i ? s.lineTo(x,y) : s.moveTo(x,y)); s.closePath(); return s; }
  function extrude(s, depth = .10, bevel = .025) {
    return own(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel,
      bevelThickness: bevel, bevelSegments: 2, steps: 1, curveSegments: 12 }));
  }
  function tube(parent, points, radius, mat) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return mesh(parent, own(new THREE.TubeGeometry(curve, 16, radius, 5, false)), mat);
  }
  const parts = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  for (let side=0;side<2;side++) {
    const half = parts[side]; half.scale.x = side ? 1 : -1;
    const face = new THREE.Shape();
    face.moveTo(.025,-.08); face.lineTo(.10,-.02); face.lineTo(.16,-.19); face.lineTo(.35,-.14);
    face.lineTo(.43,.01); face.bezierCurveTo(.55,.28,.40,.61,.035,.61);
    face.lineTo(.025,.43); face.lineTo(.045,.34); face.lineTo(.018,.17); face.closePath();
    const socket = shape([[.10,.23],[.35,.29],[.37,.16],[.22,.045],[.115,.075]]);
    face.holes.push(socket); mesh(half,extrude(face,.14,.035),bone);
    mesh(half,own(new THREE.ShapeGeometry(socket)),cavity,0,0,-.008);
    // Sharp brows and cheek planes create a bone mask rather than a flat emoji.
    tube(half,[[.08,.275,.19],[.23,.32,.205],[.37,.34,.14]],.035,ivory);
    tube(half,[[.34,.05,.18],[.28,-.08,.20],[.19,-.12,.18]],.027,ivory);
    tube(half,[[.25,.53,.18],[.21,.44,.19],[.26,.40,.19]],.006,cavity);
    const eye = mesh(half,own(new THREE.SphereGeometry(.032,8,6)),eyes,.22,.15,.025); eye.scale.y=.42;
    for(let i=0;i<3;i++) {
      const tooth = mesh(half,extrude(shape([[-.026,.05],[.026,.05],[.022,-.045],[-.018,-.055]]),.075,.008),ivory,.075+i*.082,-.20,.08);
      tooth.rotation.z = -.10*i;
    }
  }
  const jaw = parts[2];
  mesh(jaw,extrude(shape([[-.31,-.27],[-.25,-.45],[-.11,-.51],[.11,-.51],[.25,-.45],[.31,-.27],[.21,-.29],[.14,-.36],[-.14,-.36],[-.21,-.29]]),.12,.022),bone,0,0,.015);
  for(let i=0;i<6;i++) mesh(jaw,extrude(shape([[-.024,.04],[.024,.04],[.026,-.04],[-.025,-.04]]),.07,.008),ivory,(i-2.5)*.074,-.31,.08);

  const reaper = new THREE.Group(); reaper.name = 'Sensenmann';
  // Open, pointed hood: the face sits inside a deep bevelled cloth recess.
  const hood = new THREE.Shape(); hood.moveTo(-.39,.42); hood.bezierCurveTo(-.50,.86,-.28,1.24,.07,1.37);
  hood.bezierCurveTo(.13,1.13,.50,.94,.35,.43); hood.lineTo(.18,.34); hood.lineTo(-.22,.34); hood.closePath();
  const opening = new THREE.Shape(); opening.moveTo(-.22,.47); opening.bezierCurveTo(-.28,.73,-.16,1.06,.015,1.12);
  opening.bezierCurveTo(.25,.96,.29,.65,.19,.46); opening.closePath(); hood.holes.push(opening);
  mesh(reaper,extrude(hood,.18,.045),robe,0,0,-.09);
  mesh(reaper,own(new THREE.ShapeGeometry(opening)),cavity,0,0,-.11);
  const face = new THREE.Group(); face.position.set(0,.76,.025); face.scale.setScalar(.45); reaper.add(face);
  parts.forEach(p => face.add(p.clone(true)));
  // A curved mantle with irregular, tapered folds and a torn translucent hem.
  const positions=[], colors=[], indices=[], rows=17, columns=28;
  for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++) {
    const v=j/rows, a=i/columns*Math.PI*2;
    const r=.23+v*.17+Math.sin(a*7+v*3)*(.025+v*.028);
    const hem=Math.sin(a*7)*.075+Math.sin(a*11)*.035;
    positions.push(Math.cos(a)*r, .51-v*1.40+hem*v*v*v, Math.sin(a)*r*.52-.09);
    const shade=.50+(.5+.5*Math.cos(a*7+v*3))*.5;
    colors.push(shade,shade,shade);
    if(j<rows&&i<columns){const n=j*(columns+1)+i;indices.push(n,n+1,n+columns+1,n+1,n+columns+2,n+columns+1);}
  }
  const cloth = own(new THREE.BufferGeometry()); cloth.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  cloth.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); cloth.setIndex(indices); cloth.computeVertexNormals();
  const clothMaterial = robe.clone(); clothMaterial.vertexColors=true; materials.add(clothMaterial);
  clothMaterial.onBeforeCompile = shader => {
    shader.vertexShader='varying float vClothY;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvClothY = position.y;');
    shader.fragmentShader='varying float vClothY;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','diffuseColor.a *= smoothstep(-.95, -.48, vClothY);\n#include <opaque_fragment>');
  };
  clothMaterial.customProgramCacheKey=()=> 'spectral-cloth-hem'; mesh(reaper,cloth,clothMaterial);
  for(const sign of [-1,1]) {
    tube(reaper,[[sign*.13,.56,.08],[sign*.34,.40,.10],[sign*.48,.05,.17]],.115,robe);
    tube(reaper,[[sign*.17,.44,.20],[sign*.24,.17,.20],[sign*.30,-.31,.18]],.012,seam);
    const hand=mesh(reaper,own(new THREE.IcosahedronGeometry(.075,1)),bone,sign*.48,.025,.19); hand.scale.set(.7,1.25,.7);
  }
  const clasp=mesh(reaper,own(new THREE.OctahedronGeometry(.075)),metal,0,.39,.26);clasp.scale.set(1,1.25,.45);

  const scythe = new THREE.Group(); scythe.name = 'Sense';
  tube(scythe,[[0,-.85,0],[.025,0,0],[.08,.85,0],[.02,1.12,0]],.025,wood);
  const blade=new THREE.Shape();blade.moveTo(.035,1.04);blade.bezierCurveTo(-.30,1.24,-.86,1.10,-1.16,.53);
  blade.bezierCurveTo(-.71,.84,-.36,.91,.03,.86);blade.closePath();mesh(scythe,extrude(blade,.035,.012),metal);
  tube(scythe,[[-1.15,.54,.045],[-.78,.79,.045],[-.38,.89,.045],[.02,.87,.045]],.012,edge);
  for(let i=0;i<4;i++) mesh(scythe,own(new THREE.TorusGeometry(.031,.008,5,12)),metal,.02,.02+i*.055,0).rotation.x=Math.PI/2;

  function clone(prototype, order) {
    const root=prototype.clone(true);
    root.traverse(p=>{if(!p.isMesh)return;const source=p.material;p.material=source.clone();p.material.onBeforeCompile=source.onBeforeCompile;p.material.customProgramCacheKey=source.customProgramCacheKey;p.renderOrder=order;p.userData.baseOpacity=p.material.opacity;});
    return root;
  }
  function fade(root, opacity) { root.traverse(p=>{if(p.material)p.material.opacity=p.userData.baseOpacity*opacity;}); }
  return { create(root) {
    const pieces=parts.map(p=>{const part=new THREE.Group();part.add(clone(p,14));return part;}), apparition=clone(reaper,12), weapon=clone(scythe,13);
    root.add(...pieces,apparition,weapon);
    // Face the viewing camera while retaining real bevels, depth and lighting.
    const facing = (_renderer,_scene,camera) => {
      if (!root.quaternion.equals(camera.quaternion)) {
        root.quaternion.copy(camera.quaternion); root.updateMatrixWorld(true);
      }
    };
    root.traverse(p=>{if(p.isMesh)p.onBeforeRender=facing;});
    return {pieces,reaper:apparition,scythe:weapon};
  }, fade, dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());} };
}
