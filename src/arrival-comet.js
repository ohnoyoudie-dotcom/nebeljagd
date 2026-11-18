import * as THREE from 'three';

function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(64,64,0,64,64,64);
  for (const [at,alpha] of [[0,1],[.12,.96],[.3,.55],[.6,.13],[1,0]]) gradient.addColorStop(at,`rgba(255,255,255,${alpha})`);
  ctx.fillStyle = gradient; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(canvas);
}

/** A bounded, camera-facing particle tail keeps the vertical dive legible from above. */
export function createArrivalComet(parent, { reducedMotion = false } = {}) {
  const air = new THREE.Group(), burst = new THREE.Group(), billboard = new THREE.Group();
  air.name = 'Ankunft · Magischer Komet'; burst.name = 'Ankunft · Lichtimpuls';
  parent.add(air,burst); air.add(billboard);
  const texture = glowTexture();
  const sprite = (group,color,size,opacity=1) => {
    const node = new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,opacity,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    node.scale.setScalar(size); group.add(node); return node;
  };
  const halo = sprite(billboard,'#6355ff',2.65,.4);
  const core = sprite(billboard,'#e9eeff',1.25,.95);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.57,24,16),new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{pulse:{value:0}},
    vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
    fragmentShader:'varying vec3 n; varying vec3 v; uniform float pulse; void main(){float rim=pow(1.-max(0.,dot(normalize(n),normalize(v))),2.3); gl_FragColor=vec4(mix(vec3(.35,.2,1.),vec3(.25,.85,1.),rim),(.09+rim*.72)*(1.+pulse*.04));}'
  })); air.add(shell);
  const tail = Array.from({length:reducedMotion?12:24},(_,i)=>sprite(billboard,i<8?'#8573ff':'#6650f2',1,0));
  const sparks = Array.from({length:reducedMotion?5:12},()=>sprite(billboard,'#a9c9ff',.11,0));
  const flash = sprite(burst,'#b0caff',1,0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.9,1,64),new THREE.MeshBasicMaterial({color:'#9dbbff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}));
  ring.rotation.x=-Math.PI/2; ring.position.y=.12; burst.add(ring);
  const motes=Array.from({length:reducedMotion?8:18},()=>sprite(burst,'#b6a7ff',.16,0));
  for(const group of [air,burst]) group.traverse(node=>{node.layers.enable(1);node.userData.ignoreVision=true;});
  const previous = new THREE.Vector3(),velocity=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();
  const direction = new THREE.Vector2(0,1),desired=new THREE.Vector2();
  let clock=0,wasActive=false,initialized=false;
  air.visible=burst.visible=false;
  return {
    update(dt,position,arrival,camera) {
      const delta=Math.max(0,dt);clock+=delta;
      const current=new THREE.Vector3(position.x,position.y+arrival.height+1.1,position.z);
      if(arrival.active&&!wasActive){initialized=false;direction.set(0,1);clock=0;}
      air.visible=arrival.active;air.position.copy(current);
      if(camera) {
        camera.getWorldQuaternion(billboard.quaternion);
        right.set(1,0,0).applyQuaternion(billboard.quaternion);up.set(0,1,0).applyQuaternion(billboard.quaternion);
      }
      if(initialized&&delta>0&&arrival.active){
        velocity.copy(current).sub(previous).divideScalar(delta);
        desired.set(-velocity.dot(right),-velocity.dot(up));
        // Even a nearly vertical view must retain a short, visible trailing plume.
        if(arrival.stage==='dive')desired.y+=Math.abs(velocity.y)*.28+5;
        if(desired.lengthSq()>1)direction.lerp(desired.normalize(),1-Math.exp(-delta*6)).normalize();
      }
      previous.copy(current);initialized=true;
      const length=arrival.stage==='dive'?3.4:1.65;
      const pulse=Math.sin(clock*(reducedMotion?1:3));shell.material.uniforms.pulse.value=pulse;
      halo.material.opacity=.37+pulse*.025;core.material.opacity=.94;
      for(let i=0;i<tail.length;i++){
        const t=(i+1)/tail.length,bend=Math.sin(t*3-clock*(reducedMotion?.5:2))*t*.2;
        tail[i].position.set(direction.x*t*length+direction.y*bend,direction.y*t*length-direction.x*bend,-.08);
        tail[i].scale.setScalar(.98*(1-t)**.65+.06);tail[i].material.opacity=.25*(1-t)**1.35;
      }
      for(let i=0;i<sparks.length;i++){
        const t=(clock*(reducedMotion?.16:.5)+i*.618)%1,side=Math.sin(i*2.399)*(.25+t*.4);
        sparks[i].position.set(direction.x*t*length+direction.y*side,direction.y*t*length-direction.x*side,.02);
        sparks[i].material.opacity=Math.sin(t*Math.PI)*.65;sparks[i].scale.setScalar(.06+(i%3)*.025);
      }
      if(wasActive&&!arrival.active&&arrival.impact<1){burst.position.copy(position);burst.position.y+=.08;}
      const age=arrival.impact*2.8;burst.visible=!arrival.active&&age<.75;
      flash.position.y=.8;flash.scale.setScalar(1.4+age*8);flash.material.opacity=Math.max(0,1-age/.48)*.85;
      ring.scale.setScalar(1+age*6);ring.material.opacity=Math.max(0,1-age/.65)*.6;
      for(let i=0;i<motes.length;i++){
        const a=i*2.399,r=.3+age*(2+i%4*.5);
        motes[i].position.set(Math.cos(a)*r,.3+Math.sin(Math.min(1,age/.75)*Math.PI)*(.4+i%3*.2),Math.sin(a)*r);
        motes[i].material.opacity=Math.max(0,1-age/.75)*.8;
      }
      wasActive=arrival.active;
    },
    inspect:()=>({active:air.visible,position:air.position.toArray(),tailParticles:tail.length,sparks:sparks.length,burst:burst.visible,burstPosition:burst.position.toArray(),burstOpacity:flash.material.opacity})
  };
}
