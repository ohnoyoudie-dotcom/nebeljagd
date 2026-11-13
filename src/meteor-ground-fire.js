import * as THREE from 'three';

export const METEOR_FIRE_SLICES = 24;
const TERRAIN_SIZE = 21, NOISE_SIZE = 32, FIRE_HEIGHT = 2.35;
const fract = x => x - Math.floor(x);
function fieldNoise(x, z) {
  const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);
  const hash=(a,b)=>fract(Math.sin(a*127.1+b*311.7)*43758.5453);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz),hash(ix+1,iz),fx),THREE.MathUtils.lerp(hash(ix,iz+1),hash(ix+1,iz+1),fx),fz);
}
function footprint(x,z) {
  const shape=fieldNoise(x*2.7+7.1,z*2.7-3.7)*.7+fieldNoise(x*5.3-4.2,z*5.3-4.2)*.3;
  const edge=Math.hypot(x*1.035+.045,z*.965-.055);
  const bend=(shape-.5)*.28+Math.sin(x*3.2+z*2.7)*.045;
  return 1-THREE.MathUtils.smoothstep(edge-bend,.68,.995);
}
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}`;

/** One continuous, terrain-relative fire density sampled by depth-tested volume
 * slices. There are no individual flame sprites or per-slice flame shapes. */
export function createMeteorGroundFire(parent, rules, heightAt = () => 0) {
  const root = new THREE.Group(); root.name = 'Meteorstab · brennende Einschlagsfläche'; root.visible = false; parent.add(root);
  // Includes the entire asymmetric, feathered support, not just its nominal
  // radius. Neither the terrain decal nor the slices may crop a noisy edge.
  const extent = rules.radius * 1.32;
  const groundGeometry = new THREE.PlaneGeometry(extent * 2, extent * 2, TERRAIN_SIZE - 1, TERRAIN_SIZE - 1);
  groundGeometry.rotateX(-Math.PI / 2);
  const time = { value: 0 }, fade = { value: 0 };
  // R stores terrain height, G the shared feathered footprint. Baking the
  // static mask once avoids doing several noise octaves for every slice.
  const terrainBytes = new Uint8Array(TERRAIN_SIZE ** 2 * 2);
  for(let row=0;row<TERRAIN_SIZE;row++)for(let col=0;col<TERRAIN_SIZE;col++){
    const x=(col/(TERRAIN_SIZE-1)*2-1)*extent/rules.radius;
    const z=(row/(TERRAIN_SIZE-1)*2-1)*extent/rules.radius;
    terrainBytes[(row*TERRAIN_SIZE+col)*2+1]=Math.round(footprint(x,z)*255);
  }
  const terrainTexture = new THREE.DataTexture(terrainBytes,TERRAIN_SIZE,TERRAIN_SIZE,THREE.RGFormat,THREE.UnsignedByteType);
  terrainTexture.minFilter=terrainTexture.magFilter=THREE.LinearFilter;
  terrainTexture.unpackAlignment=1;terrainTexture.needsUpdate=true;
  const groundMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uTime: time, uFade: fade, uExtent: { value: extent / rules.radius }, uTerrain: { value: terrainTexture } },
    vertexShader: `varying vec2 vUv;uniform float uExtent;
      void main(){vUv=vec2(uv.x*2.-1.,1.-uv.y*2.)*uExtent;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uFade,uExtent;uniform sampler2D uTerrain;${noise}
      void main(){vec2 texUv=(vUv/(uExtent*2.)+.5)*${(TERRAIN_SIZE - 1) / TERRAIN_SIZE}+${.5 / TERRAIN_SIZE};
        float edge=texture2D(uTerrain,texUv).g;float n=noise(vUv*13.);
        float ember=smoothstep(.7,.92,n)*smoothstep(.49,.77,noise(vUv*5.1));
        vec3 color=mix(vec3(.012,.007,.003),vec3(.033,.018,.008),n);
        color=mix(color,vec3(.53,.045,.001),ember*(.65+.2*sin(uTime*3.1+n*19.)));
        gl_FragColor=vec4(color,edge*uFade*.62);
        #include <colorspace_fragment>
      }` });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.renderOrder = -1; root.add(ground);

  const noiseBytes = new Uint8Array(NOISE_SIZE ** 3); let random = 0x9e3779b9;
  for (let i = 0; i < noiseBytes.length; i++) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
    noiseBytes[i] = random & 255;
  }
  const noiseTexture = new THREE.Data3DTexture(noiseBytes, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  noiseTexture.format = THREE.RedFormat; noiseTexture.type = THREE.UnsignedByteType;
  noiseTexture.minFilter = noiseTexture.magFilter = THREE.LinearFilter;
  noiseTexture.wrapS = noiseTexture.wrapT = noiseTexture.wrapR = THREE.RepeatWrapping;
  noiseTexture.unpackAlignment = 1; noiseTexture.needsUpdate = true;
  const terrainHeights = new Float32Array(TERRAIN_SIZE ** 2);
  const uniforms = {
    uTime: time, uFade: fade, uNoise: { value: noiseTexture }, uTerrain: { value: terrainTexture },
    uHeightRange: { value: new THREE.Vector2(0, .01) }, uRadius: { value: rules.radius }, uExtent: { value: extent },
    uVolumeCenter: { value: new THREE.Vector3(0, FIRE_HEIGHT / 2, 0) },
    uHalfBox: { value: new THREE.Vector3(extent, FIRE_HEIGHT / 2, extent) },
    uRight: { value: new THREE.Vector3(1,0,0) }, uUp: { value: new THREE.Vector3(0,1,0) }, uForward: { value: new THREE.Vector3(0,0,-1) },
    uPlane: { value: new THREE.Vector3() }, uStep: { value: 0 },
    uCamera: { value: new THREE.Vector3() }, uOrtho: { value: true },
  };
  const flameGeometry = new THREE.InstancedBufferGeometry(); flameGeometry.setIndex([0,1,2,0,2,3]);
  flameGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0], 3));
  const slices = new Float32Array(METEOR_FIRE_SLICES);
  const bounds = new Float32Array(METEOR_FIRE_SLICES*4);
  uniforms.uBounds={value:bounds};
  for (let i = 0; i < slices.length; i++) slices[i] = .5 - (i + .5) / METEOR_FIRE_SLICES;
  flameGeometry.setAttribute('slice', new THREE.InstancedBufferAttribute(slices, 1));
  flameGeometry.instanceCount = METEOR_FIRE_SLICES;
  const flameMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true,
    toneMapped: false, blending: THREE.NormalBlending, glslVersion: THREE.GLSL3, uniforms,
    vertexShader: `in float slice;out vec3 vLocal;uniform vec4 uBounds[${METEOR_FIRE_SLICES}];
      uniform vec3 uVolumeCenter,uRight,uUp,uForward,uPlane;
      void main(){vec2 uv=position.xy*.5+.5;vec4 bounds=uBounds[int((.5-slice)*${METEOR_FIRE_SLICES}.)];
        vLocal=uVolumeCenter+uRight*mix(bounds.x,bounds.y,uv.x)+uUp*mix(bounds.z,bounds.w,uv.y)+uForward*slice*uPlane.z;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(vLocal,1.);}`,
    fragmentShader: `precision highp sampler3D;
      in vec3 vLocal;out vec4 fireColor;
      #define gl_FragColor fireColor
      uniform sampler3D uNoise;uniform sampler2D uTerrain;
      uniform vec2 uHeightRange;uniform vec3 uVolumeCenter,uHalfBox,uForward,uCamera;
      uniform float uTime,uFade,uRadius,uExtent,uStep;uniform bool uOrtho;
      void main(){
        vec3 box=abs(vLocal-uVolumeCenter);if(any(greaterThan(box,uHalfBox)))discard;
        vec2 terrainUv=(vLocal.xz/(uExtent*2.)+.5)*${(TERRAIN_SIZE - 1) / TERRAIN_SIZE} + ${.5 / TERRAIN_SIZE};
        vec2 bed=texture(uTerrain,terrainUv).rg;float edge=bed.g;if(edge<.003)discard;
        float terrain=uHeightRange.x+bed.r*uHeightRange.y;
        float h=vLocal.y-terrain;if(h<.015||h>${FIRE_HEIGHT})discard;
        vec3 p=vec3(vLocal.x,h,vLocal.z);
        float roll=.5+.25*sin(p.x*.85+p.z*1.05+h*.55-uTime*.9)+.25*cos(p.z*.75-p.x*.8+h*.8+uTime*.7);
        p.xz+=vec2(sin(h*2.7+roll*6.+uTime*.8),cos(h*2.1+roll*5.-uTime*.6))*(.08+h*.16);
        float coarse=texture(uNoise,(p*vec3(2.45,.82,2.45)+vec3(2.,-uTime*2.2,17.))/32.).r;
        float fine=texture(uNoise,(p*vec3(6.3,2.1,6.3)+vec3(19.,-uTime*4.2,5.))/32.).r;
        float fuel=coarse*.72+fine*.28;
        float threshold=.16+h*.29;
        float density=smoothstep(threshold,threshold+.12,fuel)*smoothstep(.015,.15,h);
        density*=pow(edge,1.2)*(1.-smoothstep(1.9,${FIRE_HEIGHT},h));
        if(density<.002)discard;
        float heat=clamp((fuel-.18)*1.5+(1.-h/${FIRE_HEIGHT})*.3,0.,1.);
        vec3 color=mix(vec3(.72,.012,.0005),vec3(1.,.16,.001),smoothstep(.1,.65,heat));
        color=mix(color,vec3(1.,.66,.075),smoothstep(.62,.9,heat));
        color=mix(color,vec3(1.,.94,.61),smoothstep(.9,1.,heat)*.55);
        float rayCorrection=uOrtho?1.:1./max(.2,abs(dot(normalize(vLocal-uCamera),uForward)));
        float alpha=1.-exp(-density*uStep*rayCorrection*2.2*uFade);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }` });
  const flames = new THREE.Mesh(flameGeometry, flameMaterial); flames.frustumCulled = false; root.add(flames);
  const localCamera = new THREE.Matrix4(), inverse = new THREE.Matrix4();
  const corners=new Float32Array(24),edges=[0,1,0,2,0,4,1,3,1,5,2,3,2,6,3,7,4,5,4,6,5,7,6,7];
  function projectionExtent(axis, half) { return Math.abs(axis.x)*half.x+Math.abs(axis.y)*half.y+Math.abs(axis.z)*half.z; }
  flames.onBeforeRender = (_renderer, _scene, camera) => {
    inverse.copy(flames.matrixWorld).invert(); localCamera.multiplyMatrices(inverse, camera.matrixWorld);
    uniforms.uRight.value.setFromMatrixColumn(localCamera, 0).normalize();
    uniforms.uUp.value.setFromMatrixColumn(localCamera, 1).normalize();
    uniforms.uForward.value.setFromMatrixColumn(localCamera, 2).normalize().negate();
    uniforms.uCamera.value.setFromMatrixPosition(localCamera); uniforms.uOrtho.value = Boolean(camera.isOrthographicCamera);
    const half = uniforms.uHalfBox.value;
    uniforms.uPlane.value.set(projectionExtent(uniforms.uRight.value, half), projectionExtent(uniforms.uUp.value, half), projectionExtent(uniforms.uForward.value, half)*2);
    uniforms.uStep.value = uniforms.uPlane.value.z / METEOR_FIRE_SLICES;
    // Tighten each slice to its actual intersection with the volume box. Far
    // and near slices must not shade the whole projected box just to discard it.
    const right=uniforms.uRight.value,up=uniforms.uUp.value,forward=uniforms.uForward.value;
    for(let i=0;i<8;i++){
      const x=(i&1?1:-1)*half.x,y=(i&2?1:-1)*half.y,z=(i&4?1:-1)*half.z;
      corners[i*3]=x*right.x+y*right.y+z*right.z;
      corners[i*3+1]=x*up.x+y*up.y+z*up.z;
      corners[i*3+2]=x*forward.x+y*forward.y+z*forward.z;
    }
    for(let i=0;i<METEOR_FIRE_SLICES;i++){
      const depth=slices[i]*uniforms.uPlane.value.z;let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(let e=0;e<edges.length;e+=2){
        const a=edges[e]*3,b=edges[e+1]*3,az=corners[a+2],bz=corners[b+2];
        if(az===bz||(depth-az)*(depth-bz)>0)continue;
        const t=(depth-az)/(bz-az),x=corners[a]+(corners[b]-corners[a])*t,y=corners[a+1]+(corners[b+1]-corners[a+1])*t;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      bounds[i*4]=minX;bounds[i*4+1]=maxX;bounds[i*4+2]=minY;bounds[i*4+3]=maxY;
    }
  };
  let enabled = false, disposed = false;
  function ignite(center, active = true) {
    enabled = active; root.position.copy(center);
    let minimum = Infinity, maximum = -Infinity;
    const positions = groundGeometry.attributes.position;
    for (let row = 0; row < TERRAIN_SIZE; row++) for (let col = 0; col < TERRAIN_SIZE; col++) {
      const i = row*TERRAIN_SIZE+col;
      const x = col/(TERRAIN_SIZE-1)*extent*2-extent, z = row/(TERRAIN_SIZE-1)*extent*2-extent;
      const y = heightAt(center.x+x,center.z+z)-center.y;
      terrainHeights[i]=y; minimum=Math.min(minimum,y); maximum=Math.max(maximum,y);
    }
    const range = Math.max(.01, maximum-minimum); uniforms.uHeightRange.value.set(minimum,range);
    for (let i = 0; i < terrainHeights.length; i++) terrainBytes[i*2]=Math.round((terrainHeights[i]-minimum)/range*255);
    terrainTexture.needsUpdate = true;
    for (let i = 0; i < positions.count; i++) positions.setY(i,heightAt(center.x+positions.getX(i),center.z+positions.getZ(i))-center.y+.045);
    positions.needsUpdate = true; groundGeometry.computeBoundingSphere();
    uniforms.uVolumeCenter.value.y=(minimum+maximum+FIRE_HEIGHT)*.5;
    uniforms.uHalfBox.value.y=(maximum-minimum+FIRE_HEIGHT)*.5;
  }
  function update(age, visible = true) {
    const opacity=Math.min(1,age/.12)*THREE.MathUtils.clamp((rules.groundFireSeconds+rules.groundFireFade-age)/rules.groundFireFade,0,1);
    root.visible=enabled&&visible&&opacity>0;fade.value=opacity;time.value=age;
  }
  function reset(){enabled=false;root.visible=false;fade.value=time.value=0;}
  return { ignite,update,reset,
    get telemetry(){return{visible:root.visible,mode:'volume',slices:root.visible?METEOR_FIRE_SLICES:0,draws:root.visible?2:0};},
    dispose(){if(disposed)return;disposed=true;reset();root.removeFromParent();groundGeometry.dispose();groundMaterial.dispose();flameGeometry.dispose();flameMaterial.dispose();noiseTexture.dispose();terrainTexture.dispose();},
  };
}
