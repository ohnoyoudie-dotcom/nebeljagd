import * as THREE from 'three';

const SIZE=128,REPEAT_METRES=10,LAWN_HEIGHT=.003;
const fract=value=>value-Math.floor(value);
const hash=(x,y)=>fract(Math.sin(x*127.1+y*311.7+83.2)*43758.5453);
function noise(x,y,frequency) {
  const px=x*frequency,py=y*frequency,ix=Math.floor(px),iy=Math.floor(py);
  const smooth=t=>t*t*(3-2*t),u=smooth(fract(px)),v=smooth(fract(py));
  const at=(a,b)=>hash((a+frequency)%frequency,(b+frequency)%frequency);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix,iy),at(ix+1,iy),u),THREE.MathUtils.lerp(at(ix,iy+1),at(ix+1,iy+1),u),v);
}
let pixels;
function lawnTexture() {
  // A neutral painted earth/grass substrate, matching the game's muted grass
  // palette. Natural ground-cover blades can still grow above this thin layer.
  if(!pixels) {
    pixels=new Uint8Array(SIZE*SIZE*4);
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
      const u=x/SIZE,v=y/SIZE;
      const shade=205+noise(u,v,4)*23+noise(u,v,16)*13+(noise(u,v,32)-.5)*7;
      const i=(y*SIZE+x)*4;
      pixels[i]=shade-6;pixels[i+1]=shade;pixels[i+2]=shade-12;pixels[i+3]=255;
    }
  }
  const texture=new THREE.DataTexture(pixels,SIZE,SIZE,THREE.RGBAFormat);
  texture.name='Schlossanlage · gemalter grüner Hofboden';texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

/** Two outdoor lawns share one small mesh. This is a surface finish, never an
 * indoor floor or collider, and it stays green over snow, sand and map paint. */
export function createCastleCourtyards({definition}={}) {
  const areas=definition?.courtyardLawnAreas??[],group=new THREE.Group();
  group.name='Schlossanlage · grüne Innenhöfe';
  const vertices=[],normals=[],uvs=[];
  for(const area of areas) {
    const corners=[[area.minX,area.minZ],[area.minX,area.maxZ],[area.maxX,area.maxZ],[area.maxX,area.minZ]];
    for(const i of [0,1,2,0,2,3]) {
      const [x,z]=corners[i];vertices.push(x,LAWN_HEIGHT,z);normals.push(0,1,0);uvs.push(x/REPEAT_METRES,z/REPEAT_METRES);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  const map=lawnTexture(),material=new THREE.MeshStandardMaterial({color:'#52733d',map,roughness:1});
  material.name='Schlossanlage · grüner Rasenboden';material.userData.castleSurface='grass';
  if(areas.length) {
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=material.name;mesh.receiveShadow=true;group.add(mesh);
  }
  const stats={lawns:areas.length,drawCalls:areas.length?1:0,triangles:areas.length*2};
  group.userData.castleCourtyards=stats;let disposed=false;
  return {group,stats,dispose(){if(disposed)return;disposed=true;geometry.dispose();material.dispose();map.dispose();group.removeFromParent();}};
}
