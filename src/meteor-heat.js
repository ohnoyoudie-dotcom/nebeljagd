import * as THREE from 'three';

/** One bounded, screen-space refraction draw around the hot body and wake.
 * Copies the rendered scene once, only while heat is visible; no extra scene pass. */
export function createMeteorHeat(parent, capacity) {
  const geometry = new THREE.InstancedBufferGeometry(); geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  const centers = new Float32Array(capacity*3), shapes = new Float32Array(capacity*3);
  geometry.setAttribute('center',new THREE.InstancedBufferAttribute(centers,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('shape',new THREE.InstancedBufferAttribute(shapes,3).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount=0;
  const uniforms={uScene:{value:null},uResolution:{value:new THREE.Vector2(1,1)},uTime:{value:0}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms,
    vertexShader:`attribute vec3 center,shape;varying vec2 vUv;varying vec2 vHeat;
      void main(){vUv=position.xy;vHeat=shape.yz;vec4 p=modelViewMatrix*vec4(center,1.);p.xy+=position.xy*shape.x;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec2 vUv;varying vec2 vHeat;uniform sampler2D uScene;uniform vec2 uResolution;uniform float uTime;
      void main(){float r=length(vUv);float mask=smoothstep(.2,.48,r)*(1.-smoothstep(.65,1.,r))*vHeat.x;
        vec2 wave=vec2(sin(vUv.y*12.-uTime*7.+vHeat.y*31.),cos(vUv.x*10.+uTime*5.+vHeat.y*17.));
        vec2 uv=gl_FragCoord.xy/uResolution;vec2 offset=wave*1.8*mask/uResolution;
        vec3 refracted=texture2D(uScene,clamp(uv+offset,vec2(.001),vec2(.999))).rgb;
        gl_FragColor=vec4(refracted+vec3(.012,.004,0.)*mask,mask*.48);
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Meteorstab · Hitzeflimmern';mesh.frustumCulled=false;mesh.renderOrder=9;mesh.visible=false;parent.add(mesh);
  let texture=null,disposed=false;
  const size=new THREE.Vector2();
  mesh.onBeforeRender=renderer=>{
    renderer.getDrawingBufferSize(size);
    if(!texture||texture.image.width!==size.x||texture.image.height!==size.y){
      texture?.dispose();texture=new THREE.FramebufferTexture(size.x,size.y);
      texture.minFilter=texture.magFilter=THREE.LinearFilter;uniforms.uScene.value=texture;
    }
    uniforms.uResolution.value.copy(size);renderer.copyFramebufferToTexture(texture);
  };
  function update(age,body,puffs){
    uniforms.uTime.value=age;let count=0;
    const add=(position,radius,strength,seed)=>{if(count>=capacity)return;position.toArray(centers,count*3);shapes.set([radius,strength,seed],count*3);count++;};
    if(body?.visible)add(body.position,body.diameter*.76+.12,.8,0);
    for(const p of puffs)if(p.age<.9)add(p.position,p.size*(1.05+p.age*.6),(1-p.age/.9)*.38,p.seed);
    geometry.instanceCount=count;geometry.attributes.center.needsUpdate=geometry.attributes.shape.needsUpdate=true;mesh.visible=count>0;
  }
  function reset(){mesh.visible=false;geometry.instanceCount=0;uniforms.uTime.value=0;}
  return {update,reset,get telemetry(){return {visible:mesh.visible,samples:geometry.instanceCount};},
    dispose(){if(disposed)return;disposed=true;reset();mesh.removeFromParent();geometry.dispose();material.dispose();texture?.dispose();}};
}
