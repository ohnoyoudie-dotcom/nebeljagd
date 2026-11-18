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
  const streaks=Array.from({length:reducedMotion?4:16},(_,i)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.055,1),material.clone());mesh.userData.phase=i*.618;air.add(mesh);return mesh;});
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
    for(let i=0;i<streaks.length;i++){
      const mesh=streaks[i],p=(clock*(arrival.stage==='dive'?3.5:1)+mesh.userData.phase)%1,a=i*2.399,r=.45+(i%3)*.35;
      mesh.position.set(Math.cos(a)*r,arrival.height+.5+p*6,Math.sin(a)*r);mesh.rotation.y=a;mesh.scale.y=1+p*3;
      mesh.material.opacity=Math.sin(p*Math.PI)*.7*Math.min(1,arrival.height/3);
    }
    const age=arrival.impact*2.8;
    for(const cloud of clouds){const {angle,speed,lift}=cloud.userData,r=.3+speed*Math.min(age,1.1);cloud.position.set(Math.cos(angle)*r,.12+Math.sin(Math.min(1,age/1.5)*Math.PI)*lift,Math.sin(angle)*r);cloud.scale.setScalar(.6+Math.min(age,1)*2);cloud.material.opacity=Math.max(0,1-age/1.25)**1.3*.85;}
    crater.material.opacity=Math.min(1,age*12)*(1-THREE.MathUtils.smoothstep(age,1.15,2.8))*.9;
    shock.visible=age<.45;shock.scale.setScalar(1+age*8);shock.material.opacity=Math.max(0,1-age/.45)*.6;
    chips.visible=age<.9;chips.material.opacity=Math.max(0,1-age/.9);
    for(let i=0;i<8;i++){const a=i*2.399,r=(2.4+i*.13)*age;matrix.position.set(Math.cos(a)*r,Math.max(.03,(1.8+i*.12)*age-4*age*age),Math.sin(a)*r);matrix.rotation.set(age*6,a,age*4);matrix.scale.setScalar(1+i%3*.2);matrix.updateMatrix();chips.setMatrixAt(i,matrix.matrix);}chips.instanceMatrix.needsUpdate=true;
  },inspect:()=>({active:ground.visible,position:ground.position.toArray(),craterOpacity:crater.material.opacity,clouds:clouds.length}) };
}

// A single atlas provides the entire island at altitude without drawing thousands of distant props.
export function createAerialAtlas(parent, canvas, projection, world = null) {
  // Sample the actual biome and painted ground colours for the distant terrain.
  // The selection map stays cartographic; the view underneath uses the game's landscape.
  if(world){
    const surface=document.createElement('canvas');surface.width=surface.height=384;
    const context=surface.getContext('2d'),pixels=context.createImageData(384,384),color=new THREE.Color();
    const span=256/projection.scale;
    for(let row=0;row<384;row++)for(let column=0;column<384;column++){
      const x=projection.centerX+(column/383-.5)*span,z=projection.centerZ+(row/383-.5)*span,index=(row*384+column)*4;
      if(world.isWater(x,z)){pixels.data[index]=29;pixels.data[index+1]=66;pixels.data[index+2]=78;}
      else {const h=Math.sin(column*12.9898+row*78.233)*43758.5453,j=(h-Math.floor(h)-.5)*span/384;world.colorAt(x+j,z-j*.73,color);color.multiplyScalar(.94);color.convertLinearToSRGB();pixels.data[index]=Math.round(color.r*255);pixels.data[index+1]=Math.round(color.g*255);pixels.data[index+2]=Math.round(color.b*255);}
      pixels.data[index+3]=255;
    }
    context.putImageData(pixels,0,0);canvas=surface;
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const side=256/projection.scale;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(side,side),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
  mesh.rotation.x=-Math.PI/2;mesh.position.set(projection.centerX,10,projection.centerZ);parent.add(mesh);
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(side*12,side*12),new THREE.MeshBasicMaterial({color:'#1d424e',transparent:true,depthWrite:false,toneMapped:false}));ocean.rotation.x=-Math.PI/2;ocean.position.set(projection.centerX,-6,projection.centerZ);parent.add(ocean);
  for(const node of [mesh,ocean]){node.layers.set(1);node.userData.ignoreVision=true;}
  return {update(height){const alpha=THREE.MathUtils.smoothstep(height,70,200);mesh.visible=ocean.visible=alpha>0;mesh.material.opacity=ocean.material.opacity=alpha;}};
}
