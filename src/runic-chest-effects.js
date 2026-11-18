import * as THREE from 'three';

/** Runtime-only rune circle; surfaces follow the real ground and all owned
 * resources are bounded and released with the chest. No per-frame allocation. */
export function createRunicChestEffects({x,z,y,radius,heightAt}) {
  const group=new THREE.Group();group.name='Truhe · Runensiegel';
  const geometries=[],materials=[],textures=[];
  const cyan=new THREE.Color('#51ddd0'),gold=new THREE.Color('#ffd793');
  function material(color,opacity=.8) {
    const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});materials.push(m);return m;
  }
  function arc(inner,outer,start=0,length=Math.PI*2,color='#51ddd0',opacity=.8) {
    const geo=new THREE.RingGeometry(inner,outer,Math.max(8,Math.ceil(length*40)),1,start,length);
    geo.rotateX(-Math.PI/2);const a=geo.attributes.position;
    for(let i=0;i<a.count;i++)a.setY(i,(heightAt(x+a.getX(i),z+a.getZ(i))??y)-y+.045);
    geo.computeBoundingSphere();geometries.push(geo);
    const mesh=new THREE.Mesh(geo,material(color,opacity));group.add(mesh);return mesh;
  }
  const outer=arc(radius-.035,radius+.035,0,Math.PI*2,'#4b9e98',.24);
  const inner=arc(radius-.23,radius-.215,0,Math.PI*2,'#4b9e98',.14);
  const sectors=[];
  for(let i=0;i<8;i++)sectors.push(arc(radius-.16,radius-.075,i*Math.PI/4+.055,Math.PI/4-.11,'#51ddd0',0));
  // The narrow travelling strokes provide motion without rotating terrain-
  // fitted geometry or covering the ring's actual progress segments.
  const sweep=arc(radius-.31,radius-.285,0,Math.PI*2,'#a5fff0',0);
  const sweepMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{phase:{value:0},strength:{value:0}},
    vertexShader:'varying vec2 plane;void main(){plane=vec2(position.x,-position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float phase;uniform float strength;varying vec2 plane;void main(){float angle=atan(plane.y,plane.x);float d=mod(phase-angle+6.2831853,6.2831853);gl_FragColor=vec4(.48,1.,.86,exp(-d*5.)*strength);}'
  });materials.push(sweepMaterial);sweep.material=sweepMaterial;
  const glyphPositions=[],glyphColors=[];
  for(let i=0;i<8;i++) {
    const angle=(i+.5)*Math.PI/4,cx=Math.cos(angle)*(radius-.48),cz=-Math.sin(angle)*(radius-.48);
    const points=[[0,-.12],[.075,0],[0,.12],[-.075,0]];
    for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[0,2]])for(const index of [a,b]) {
      const [u,v]=points[index],px=cx+Math.cos(angle)*u-Math.sin(angle)*v,pz=cz-Math.sin(angle)*u-Math.cos(angle)*v;
      glyphPositions.push(px,(heightAt(x+px,z+pz)??y)-y+.055,pz);glyphColors.push(.1,.2,.18);
    }
  }
  const glyphGeometry=new THREE.BufferGeometry();glyphGeometry.setAttribute('position',new THREE.Float32BufferAttribute(glyphPositions,3));glyphGeometry.setAttribute('color',new THREE.Float32BufferAttribute(glyphColors,3));geometries.push(glyphGeometry);
  const glyphMaterial=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});materials.push(glyphMaterial);group.add(new THREE.LineSegments(glyphGeometry,glyphMaterial));
  const burst=arc(.82,.88,0,Math.PI*2,'#ffd793',0);
  const size=32,data=new Uint8Array(size*size*4);
  for(let py=0;py<size;py++)for(let px=0;px<size;px++) {const i=(py*size+px)*4,d=Math.hypot((px+.5)/size*2-1,(py+.5)/size*2-1);data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.max(0,1-d)**2*255;}
  const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;textures.push(texture);
  const coreMaterial=new THREE.SpriteMaterial({map:texture,color:'#ffe3a8',transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});materials.push(coreMaterial);
  const core=new THREE.Sprite(coreMaterial);core.position.y=.75;core.scale.set(2.1,2.1,1);group.add(core);
  const positions=new Float32Array(24*3),geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geometries.push(geo);
  const pm=new THREE.PointsMaterial({color:'#96f6e5',map:texture,size:.15,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});materials.push(pm);
  const particles=new THREE.Points(geo,pm);particles.frustumCulled=false;group.add(particles);
  group.position.set(x,y,z);
  function update(charge,opened,elapsed) {
    const p=charge.progress,active=charge.active&&!opened,fade=opened?Math.max(0,1-elapsed/1.2):1;
    outer.material.opacity=(.18+(active?.15:0))*fade;inner.material.opacity=.14*fade;
    for(let i=0;i<8;i++) {sectors[i].material.opacity=THREE.MathUtils.clamp(p*8-i,0,1)*.85*fade;sectors[i].material.color.copy(opened?gold:cyan);}
    glyphMaterial.opacity=.85*fade;
    const colors=glyphGeometry.attributes.color;
    for(let i=0;i<colors.count;i++) {const lit=THREE.MathUtils.clamp(p*8-Math.floor(i/10),0,1),color=opened?gold:cyan;colors.setXYZ(i,color.r*(.15+.85*lit),color.g*(.15+.85*lit),color.b*(.15+.85*lit));}colors.needsUpdate=true;
    sweepMaterial.uniforms.phase.value=charge.phase%(Math.PI*2);
    sweepMaterial.uniforms.strength.value=active?.35+.5*p:0;
    burst.visible=opened&&elapsed<.65;burst.scale.setScalar(1+elapsed*4);burst.material.opacity=opened?Math.sin(Math.min(1,elapsed/.65)*Math.PI)*.55:0;
    core.visible=opened&&elapsed<.85;coreMaterial.opacity=opened?Math.sin(Math.min(1,elapsed/.85)*Math.PI)*.8:0;
    particles.visible=active||opened&&elapsed<1.2;pm.color.copy(opened?gold:cyan);pm.opacity=opened?Math.max(0,1-elapsed/1.2)*.85:.35+p*.3;
    for(let i=0;i<24;i++) {
      const a=i*2.39996,cycle=(charge.phase*.12+i/24)%1;
      const r=opened?.35+elapsed*(.7+(i%5)*.16):radius*(1-cycle)*.65;
      positions[i*3]=Math.cos(a)*r;positions[i*3+2]=Math.sin(a)*r;
      positions[i*3+1]=opened?.65+elapsed*(1.1+(i%4)*.2)-elapsed*elapsed*.75:.15+cycle*.6;
    }
    geo.attributes.position.needsUpdate=true;
  }
  update({progress:0,phase:0,active:false},false,0);
  let disposed=false;
  return {group,update,dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());group.removeFromParent();}};
}
