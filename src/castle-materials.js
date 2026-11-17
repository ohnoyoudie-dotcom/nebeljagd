import * as THREE from 'three';

const templates=new Map();
const fract=value=>value-Math.floor(value);
const hash=(x,y,seed)=>fract(Math.sin(x*127.1+y*311.7+seed*17.3)*43758.5453123);
const smooth=t=>t*t*(3-2*t);
function noise(x,y,frequency,seed) {
  const px=x*frequency,py=y*frequency,ix=Math.floor(px),iy=Math.floor(py),u=smooth(fract(px)),v=smooth(fract(py));
  const sample=(a,b)=>hash((a+frequency)%frequency,(b+frequency)%frequency,seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(sample(ix,iy),sample(ix+1,iy),u),THREE.MathUtils.lerp(sample(ix,iy+1),sample(ix+1,iy+1),u),v);
}
function template(kind) {
  const size=256,color=new Uint8Array(size*size*4),relief=new Uint8Array(size*size*4),wall=kind==='wall';
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,broad=noise(u,v,4,wall?9:43)-.5,fine=noise(u,v,32,13)-.5;
    const grit=hash(x,y,17)-.5;
    // Rough wall stone has fractured mineral grains. Floor slate has much
    // quieter worn lamination, fine veins and shallow relief instead.
    const vein=Math.sin(v*Math.PI*18+Math.sin(u*Math.PI*6)*.75+broad*3);
    const fissure=wall?Math.max(0,.075-Math.abs(noise(u,v,16,29)-.47))/.075:Math.max(0,vein-.94)*8;
    const shade=wall?232+broad*33+fine*10+grit*4-fissure*9:239+broad*18+fine*3-fissure*3;
    const height=wall?128+broad*50+fine*39+grit*11-fissure*28:128+broad*13+fine*6-fissure*7;
    const i=(y*size+x)*4;
    for(let channel=0;channel<3;channel++){color[i+channel]=THREE.MathUtils.clamp(shade,0,255);relief[i+channel]=THREE.MathUtils.clamp(height,0,255);}
    color[i+3]=relief[i+3]=255;
  }
  return {size,map:color,bumpMap:relief};
}
/** Caller-owned texture objects share immutable deterministic pixel templates.
 * CPU generation also works in tests; neither surface depends on a browser. */
export function createCastleSurface(kind) {
  if(!['wall','floor'].includes(kind))throw new TypeError('Unknown castle stone surface');
  if(!templates.has(kind))templates.set(kind,template(kind));
  const data=templates.get(kind),result={};
  for(const key of ['map','bumpMap']) {
    const texture=new THREE.DataTexture(data[key],data.size,data.size,THREE.RGBAFormat);
    texture.name=`Schlossanlage · ${kind==='wall'?'rauer Bruchstein':'abgetretener Schiefer'} · ${key}`;
    texture.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
    texture.userData.castleSurface=kind;result[key]=texture;
  }
  return result;
}
