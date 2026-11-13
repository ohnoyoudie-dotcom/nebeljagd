import * as THREE from 'three';

/** Small pooled flames on each stone, plus a short trail left in world space. */
export function createMeteorFragmentFire(parent, count, lifetime, visible) {
  const capacity=count*11, centers=new Float32Array(capacity*3), shapes=new Float32Array(capacity*4);
  const geometry=new THREE.InstancedBufferGeometry();geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,1,1,0,-1,1,0],3));
  geometry.setAttribute('center',new THREE.InstancedBufferAttribute(centers,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('shape',new THREE.InstancedBufferAttribute(shapes,4).setUsage(THREE.DynamicDrawUsage));geometry.instanceCount=0;
  const clock={value:0};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,toneMapped:false,uniforms:{uTime:clock},
    vertexShader:`attribute vec3 center;attribute vec4 shape;varying vec2 vUv;varying vec2 vData;
      void main(){vUv=position.xy;vData=shape.zw;vec4 p=modelViewMatrix*vec4(center,1.);
        p.xy+=position.xy*shape.xy;gl_Position=projectionMatrix*p;}`,
    fragmentShader:`varying vec2 vUv;varying vec2 vData;uniform float uTime;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=vUv;float flow=uTime*3.+vData.x*17.;
        float n=noise(vec2(p.x*3.+vData.x*11.,p.y*5.-flow));
        p.x+=(n-.5)*p.y*.8;
        float width=(1.-p.y)*.8+.08;
        float mass=(1.-smoothstep(width*.25,width,abs(p.x)))*(1.-smoothstep(.65+n*.22,1.,p.y));
        float alpha=mass*smoothstep(0.,.12,p.y)*vData.y;
        vec3 color=mix(vec3(1.,.07,.001),vec3(1.,.65,.06),mass*(1.-p.y*.6));
        gl_FragColor=vec4(color,alpha*.8);
        #include <colorspace_fragment>
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='Meteorstab · brennende Splitter und Feuerschweife';mesh.frustumCulled=false;parent.add(mesh);
  const stones=Array.from({length:count},()=>({active:false,position:new THREE.Vector3(),last:new THREE.Vector3(),radius:.24,fade:1,elapsed:0,seen:false}));
  const trail=Array.from({length:count*8},()=>({position:new THREE.Vector3(),age:1,size:.1,seed:0}));
  const sorted=[],matrix=new THREE.Matrix4();let cursor=0,disposed=false;
  function sync(items){for(let i=0;i<stones.length;i++){const s=stones[i],f=items[i];s.active=Boolean(f?.active);
    if(s.active){s.position.copy(f.position);s.radius=f.radius??.24;s.fade=THREE.MathUtils.clamp((lifetime-f.age)/.3,0,1);}
    else s.seen=false;
  }}
  // Sort the single transparent batch back to front; ordinary depth tests
  // keep solid stones, terrain and actors visible through the flame edges.
  const cards=Array.from({length:capacity},()=>({position:new THREE.Vector3(),width:0,height:0,seed:0,alpha:0,depth:0}));
  function add(x,y,z,width,height,seed,alpha){const c=cards[sorted.length];c.position.set(x,y,z);c.width=width;c.height=height;c.seed=seed;c.alpha=alpha;sorted.push(c);}
  function upload(){for(let i=0;i<sorted.length;i++){const c=sorted[i];c.position.toArray(centers,i*3);shapes.set([c.width,c.height,c.seed,c.alpha],i*4);}
    geometry.instanceCount=sorted.length;geometry.attributes.center.needsUpdate=geometry.attributes.shape.needsUpdate=true;}
  mesh.onBeforeRender=(_r,_s,camera)=>{matrix.multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld);const e=matrix.elements;
    for(const c of sorted)c.depth=e[2]*c.position.x+e[6]*c.position.y+e[10]*c.position.z+e[14];sorted.sort((a,b)=>a.depth-b.depth);upload();};
  function update(dt){if(disposed||!(dt>0))return;clock.value+=dt;sorted.length=0;
    for(const t of trail)t.age+=dt;
    for(let i=0;i<stones.length;i++){const s=stones[i];if(!s.active)continue;s.elapsed+=dt;
      if(s.seen&&s.elapsed>=.04&&s.position.distanceToSquared(s.last)>.025**2){const t=trail[cursor++%trail.length];t.position.copy(s.position);t.age=0;t.size=s.radius*.7*s.fade;t.seed=i*.173;s.last.copy(s.position);s.elapsed=0;}
      if(!s.seen){s.last.copy(s.position);s.seen=true;s.elapsed=0;}
      if(!visible(s.position))continue;
      for(let j=0;j<3;j++){const angle=j*Math.PI*2/3+i*.7,r=s.radius*.8;
        add(s.position.x+Math.cos(angle)*r,s.position.y-s.radius*.2,s.position.z+Math.sin(angle)*r,
          s.radius*.7*s.fade,s.radius*(1.8+.3*Math.sin(clock.value*9+i+j))*s.fade,i*.173+j*.21,s.fade*.85);}
    }
    for(const t of trail){if(t.age>=.32||!visible(t.position))continue;const fade=1-t.age/.32;
      add(t.position.x,t.position.y+t.age*.5,t.position.z,t.size*fade,t.size*2.3*fade,t.seed,fade*.65);}
    upload();
  }
  function reset(){for(const s of stones){s.active=s.seen=false;s.elapsed=0;}for(const t of trail)t.age=1;sorted.length=0;geometry.instanceCount=0;clock.value=0;cursor=0;}
  return{sync,update,reset,get telemetry(){return{flames:geometry.instanceCount,draws:Number(geometry.instanceCount>0)};},dispose(){if(disposed)return;disposed=true;reset();mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
