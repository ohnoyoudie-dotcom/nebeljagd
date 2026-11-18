import * as THREE from 'three';

function dustTexture() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  for(let i=0;i<7;i++) {
    const a=i*2.399, x=64+Math.cos(a)*19, y=64+Math.sin(a)*19;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,39);
    gradient.addColorStop(0,'rgba(255,255,255,.35)');gradient.addColorStop(.4,'rgba(255,255,255,.2)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
  }
  return new THREE.CanvasTexture(canvas);
}
function craterTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
  const shade=ctx.createRadialGradient(128,128,10,128,128,110);shade.addColorStop(0,'#201c1688');shade.addColorStop(.6,'#29251d88');shade.addColorStop(.77,'#52463799');shade.addColorStop(1,'#3a302000');ctx.fillStyle=shade;ctx.fillRect(0,0,256,256);
  for(let i=0;i<14;i++) {
    const a=i*2.399;ctx.strokeStyle=i%2?'#28221999':'#d9c39566';ctx.lineWidth=i%2?2:3;ctx.beginPath();
    for(let j=0;j<5;j++){const r=35+j*15+(i%3)*3,t=a+Math.sin(j*2+i)*.1,x=128+Math.cos(t)*r,y=128+Math.sin(t)*r;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
export function createArrivalEffects(parent, { reducedMotion = false } = {}) {
  const air=new THREE.Group(),ground=new THREE.Group();air.name='Anflug · Luftspuren';ground.name='Landung · Staub und vergänglicher Krater';parent.add(air,ground);
  const material=new THREE.MeshBasicMaterial({color:'#d7f2e9',transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
  const marker=new THREE.Mesh(new THREE.RingGeometry(1.2,1.28,64),material);marker.rotation.x=-Math.PI/2;air.add(marker);
  const dustMap=dustTexture();
  const clouds=Array.from({length:reducedMotion?10:20},(_,i)=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:dustMap,color:'#b8a587',transparent:true,depthWrite:false,opacity:0,rotation:i*1.71}));
    sprite.userData={angle:i*2.399,speed:1.5+(i%5)*.45,lift:.6+(i%4)*.25};ground.add(sprite);return sprite;
  });
  const crater=new THREE.Mesh(new THREE.PlaneGeometry(5.4,5.4),new THREE.MeshBasicMaterial({map:craterTexture(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,toneMapped:false}));crater.rotation.x=-Math.PI/2;ground.add(crater);
  const shock=new THREE.Mesh(new THREE.RingGeometry(.9,1,64),material.clone());shock.rotation.x=-Math.PI/2;shock.position.y=.025;ground.add(shock);
  const chips=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.09,0),new THREE.MeshStandardMaterial({color:'#796e59',roughness:1,transparent:true}),8);ground.add(chips);const matrix=new THREE.Object3D();
  air.traverse(node=>{node.layers.enable(1);node.userData.ignoreVision=true;});
  let clock=0,wasAirborne=false;
  ground.visible=false;
  return { update(dt,position,arrival,biome='grass') {
    clock+=dt;air.position.copy(position);air.position.y+=.06;air.visible=arrival.active;
    const dustColor=biome==='snow'?'#e3e5dc':['desert','dunes','sand'].includes(biome)?'#d1ad78':['swamp','marsh'].includes(biome)?'#8c947a':'#b6a487';
    if(wasAirborne&&!arrival.active&&arrival.impact<1){ground.position.copy(position);ground.position.y+=.065;ground.rotation.y=Math.random()*Math.PI*2;for(const cloud of clouds)cloud.material.color.set(dustColor);shock.material.color.set(dustColor);}
    wasAirborne=arrival.active;ground.visible=!arrival.active&&arrival.impact<1;
    marker.visible=arrival.height<75;marker.material.opacity=.5;
    const age=arrival.impact*2.8;
    for(const cloud of clouds){const {angle,speed,lift}=cloud.userData,r=.3+speed*Math.min(age,1.1);cloud.position.set(Math.cos(angle)*r,.12+Math.sin(Math.min(1,age/1.5)*Math.PI)*lift,Math.sin(angle)*r);cloud.scale.setScalar(.6+Math.min(age,1)*2);cloud.material.opacity=Math.max(0,1-age/1.25)**1.3*.85;}
    crater.material.opacity=Math.min(1,age*12)*(1-THREE.MathUtils.smoothstep(age,1.15,2.8))*.9;
    shock.visible=age<.45;shock.scale.setScalar(1+age*8);shock.material.opacity=Math.max(0,1-age/.45)*.6;
    chips.visible=age<.9;chips.material.opacity=Math.max(0,1-age/.9);
    for(let i=0;i<8;i++){const a=i*2.399,r=(2.4+i*.13)*age;matrix.position.set(Math.cos(a)*r,Math.max(.03,(1.8+i*.12)*age-4*age*age),Math.sin(a)*r);matrix.rotation.set(age*6,a,age*4);matrix.scale.setScalar(1+i%3*.2);matrix.updateMatrix();chips.setMatrixAt(i,matrix.matrix);}chips.instanceMatrix.needsUpdate=true;
  },inspect:()=>({active:ground.visible,position:ground.position.toArray(),craterOpacity:crater.material.opacity,clouds:clouds.length}) };
}
