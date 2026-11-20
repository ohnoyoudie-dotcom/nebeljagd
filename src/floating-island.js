import * as THREE from 'three';
import { landBoundaryRings } from './map/model.js';

const noise = `
float skyHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float skyNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(skyHash(i),skyHash(i+vec2(1.,0.)),f.x),mix(skyHash(i+vec2(0.,1.)),skyHash(i+1.),f.x),f.y);}
float skyFbm(vec2 p){return skyNoise(p)*.57+skyNoise(p*2.07+11.)*.28+skyNoise(p*4.13+23.)*.15;}
`;

/** A visual world edge, never a second playable surface. The original land
 * polygons remain authoritative for placement, projectiles and movement. */
export function createFloatingIsland(root, { map, heightAt, biomeAt, timeUniform }) {
  const group = new THREE.Group(); group.name = 'Schwebende Insel · Felskanten und Nebeltiefe';
  root.add(group);
  const positions=[], colors=[], indices=[];
  const palette={snow:'#778c99',forest:'#777665',dunes:'#aa8966',marsh:'#65706b'};
  for(const ring of landBoundaryRings(map)) {
    const samples=[];
    for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/9));
      for(let j=0;j<steps;j++) samples.push([THREE.MathUtils.lerp(a[0],b[0],j/steps),THREE.MathUtils.lerp(a[1],b[1],j/steps)]);
    }
    const area=ring.reduce((v,a,i)=>{const b=ring[(i+1)%ring.length];return v+a[0]*b[1]-b[0]*a[1];},0);
    const sign=area>0?1:-1,base=positions.length/3;
    for(let i=0;i<samples.length;i++) {
      const [x,z]=samples[i],prev=samples[(i+samples.length-1)%samples.length],next=samples[(i+1)%samples.length];
      const dx=next[0]-prev[0],dz=next[1]-prev[1],length=Math.hypot(dx,dz)||1;
      const nx=-dz/length*sign,nz=dx/length*sign;
      const variation=Math.sin(x*.087+z*.043)*.5+Math.sin(z*.139-x*.026)*.5;
      const color=new THREE.Color(palette[biomeAt(x,z)]??palette.forest);
      // The cap is precisely on the coastline, followed by broken strata and
      // an inward taper. No raised border or invisible walkable apron.
      const levels=[[0,heightAt(x,z)-.025],[.2,-2.5],[.8+variation*.3,-6+variation*.7],[2.5+variation*.6,-12+variation],[10+variation,-22+variation*2],[30+variation*2,-34+variation*3]];
      for(let j=0;j<levels.length;j++) {
        const [inset,y]=levels[j];positions.push(x+nx*inset,y,z+nz*inset);
        const tint=color.clone().multiplyScalar((.88-j*.085)*(1+variation*.07));colors.push(tint.r,tint.g,tint.b);
        if(j<levels.length-1){const a=base+i*6+j,b=base+((i+1)%samples.length)*6+j;indices.push(a,b,a+1,b,b+1,a+1);}
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vCliff;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCliff=position;');
    shader.fragmentShader='varying vec3 vCliff;\n'+noise+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float grain=skyFbm(vCliff.xz*.42+vCliff.y*.19);
      float strata=sin(vCliff.y*.85+skyNoise(vCliff.xz*.1)*4.);
      diffuseColor.rgb*=.62+grain*.60+strata*.055;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.17,.24,.29),smoothstep(7.,34.,-vCliff.y)*.65);`);
  };
  material.customProgramCacheKey=()=> 'floating-cliff-1';
  const cliff=new THREE.Mesh(geometry,material);cliff.name='Küstenfelsen · geschichteter Inselunterbau';cliff.receiveShadow=true;group.add(cliff);

  const width=(map.bounds.maxX-map.bounds.minX)*4,depth=(map.bounds.maxZ-map.bounds.minZ)*4;
  const centerX=(map.bounds.minX+map.bounds.maxX)/2,centerZ=(map.bounds.minZ+map.bounds.maxZ)/2;
  const floorGeo=new THREE.PlaneGeometry(width,depth,100,100);floorGeo.rotateX(-Math.PI/2);
  const p=floorGeo.attributes.position,c=[];
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),ridge=Math.sin(x*.008+Math.cos(z*.004)*2)*Math.cos(z*.009)+Math.sin(x*.019-z*.012)*.3;
    p.setY(i,-190+ridge*22);
    const tint=new THREE.Color('#344e5d').lerp(new THREE.Color('#678087'),(ridge+1.3)/2.6);c.push(tint.r,tint.g,tint.b);
  }
  floorGeo.setAttribute('color',new THREE.Float32BufferAttribute(c,3));floorGeo.computeVertexNormals();
  const floorMaterial=new THREE.MeshBasicMaterial({vertexColors:true});
  floorMaterial.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vDistantLand;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDistantLand=position.xz;');
    shader.fragmentShader='varying vec2 vDistantLand;\n'+noise+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 q=vDistantLand*.14;
      float hills=skyFbm(q+skyNoise(q*.37)*2.);
      float slope=skyFbm(q+vec2(.12,.08))-skyFbm(q-vec2(.12,.08));
      vec3 distantForest=vec3(.22,.32,.31),distantStone=vec3(.48,.53,.51);
      vec3 terrain=mix(distantForest,distantStone,smoothstep(.40,.68,hills));
      terrain*=clamp(.86+slope*3.,.65,1.15);
      diffuseColor.rgb=mix(terrain,vec3(.39,.49,.55),.46);`);
  };
  floorMaterial.customProgramCacheKey=()=> 'distant-landscape-1';
  const floor=new THREE.Mesh(floorGeo,floorMaterial);floor.position.set(centerX,0,centerZ);floor.name='Ferne Berglandschaft unter der Insel';group.add(floor);
  const mist=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{uTime:timeUniform},vertexShader:'varying vec2 vMist;void main(){vMist=(modelMatrix*vec4(position,1.)).xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vMist;uniform float uTime;${noise}
    void main(){vec2 q=vMist*.012+vec2(uTime*.006,uTime*.0025);
      float n=skyFbm(q+skyFbm(q*.53)*1.7);
      float alpha=smoothstep(.26,.78,n)*.65;
      gl_FragColor=vec4(mix(vec3(.30,.40,.47),vec3(.63,.72,.75),n),alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const clouds=new THREE.Mesh(new THREE.PlaneGeometry(width,depth),mist);clouds.rotation.x=-Math.PI/2;clouds.position.set(centerX,-75,centerZ);clouds.name='Langsam ziehender Tiefennebel';group.add(clouds);
  // Atmospheric background does not reveal enemies or interact with tactical sight.
  group.traverse(node=>{node.userData.ignoreVision=true;if(node.material)node.material.userData.ignoreVision=true;});
  return {mode:'floating',coastVertices:positions.length/3,cliffDepth:34,backgroundDepth:190};
}
