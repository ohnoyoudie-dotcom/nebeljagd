import * as THREE from 'three';
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x-a)/(b-a), 0, 1); return t*t*(3-2*t); };
const ellipse = (x, y, rx, ry) => Math.hypot(x/rx, y/ry);
// The same bone silhouette forms the hit fragments and the apparition's face.
function skull(x, y) {
  const crown = ellipse(x,y-.19,.65,.66)<1 && y>-.23;
  const cheek = ellipse(x,y+.18,.51,.31)<1;
  const jaw = Math.abs(x)<.36 && y<-.23 && y>-.70+Math.abs(x)*.20;
  const eyes = ellipse(Math.abs(x)-.28,y-.08+Math.abs(x)*.12,.175,.19)<1;
  const nose = Math.abs(x)<.085*(1-(y+.24)/.22) && y>-.24 && y<-.02;
  const teeth = y<-.37 && y>-.56 && Math.abs(Math.sin(x*36))<.28;
  return (crown || cheek || jaw) && !(eyes || nose || teeth);
}
function texture(sample, width=160, height=192) {
  const pixels = new Uint8Array(width*height*4);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const sum=[0,0,0,0];
    // Four coverage samples soften bone, cloth and blade edges.
    for(const ox of [.25,.75]) for(const oy of [.25,.75]) {
      const c=sample((x+ox)/width*2-1,(y+oy)/height*2-1);
      for(let k=0;k<4;k++) sum[k]+=c[k]/4;
    }
    pixels.set(sum,(y*width+x)*4);
  }
  const map=new THREE.DataTexture(pixels,width,height);
  map.colorSpace=THREE.SRGBColorSpace; map.minFilter=map.magFilter=THREE.LinearFilter; map.needsUpdate=true;
  return map;
}
export function createSoulApparitionTextures() {
  const pieces=[0,1,2].map(part=>texture((x,y)=>{
    const section=y<-.26?2:x<0?0:1;
    const seam=Math.abs(y+.26)<.022 || y>-.26 && Math.abs(x)<.018;
    const shade=205+40*smooth(-.7,.6,y)-Math.abs(x)*25;
    return [shade*.91,shade*.96,shade,skull(x,y)&&section===part&&!seam?255:0];
  }));
  const reaper=texture((x,y)=>{
    const hood=ellipse(x,y-.52,.40,.43);
    const width=.25+(.32-y)*.20+Math.sin(y*11)*.025;
    const cloth=y<.34&&y>-.91&&Math.abs(x)<width;
    const sleeve=ellipse(Math.abs(x)-.35,y+.02,.25,.27)<1;
    if(hood>1&&!cloth&&!sleeve)return [0,0,0,0];
    const edge=Math.max(smooth(.81,1,hood)*(y>.30?1:0),smooth(.70,1,Math.abs(x)/width)*(cloth?1:0));
    const fold=(.5+.5*Math.cos(x*35+Math.sin(y*5)*1.8))**5;
    let c=[13+fold*18+edge*43,17+fold*22+edge*54,24+fold*28+edge*64];
    if(ellipse(x,y-.53,.27,.29)<1)c=[5,8,13];
    if(skull(x/.31,(y-.53)/.27))c=[153,177,186];
    if(ellipse(Math.abs(x)-.085,y-.54,.035,.018)<1)c=[197,233,229];
    const hem=-.86+Math.sin(x*24)*.08+Math.sin(x*41)*.035;
    return [...c,smooth(hem,hem+.24,y)*(y<-.40?.76:.96)*255];
  },192,256);
  const scythe=texture((x,y)=>{
    const handle=Math.abs(x-(.34+y*.11))<.025&&y>-.92&&y<.69;
    const r=ellipse(x-.43,y-.05,1.15,.68);
    const blade=x<.47&&y>.10&&r<1&&r>.79+smooth(-.72,.43,x)*.10;
    if(blade){const rim=smooth(.94,1,r);return [139+rim*83,165+rim*73,180+rim*65,245];}
    return handle?[68,81,92,255]:[0,0,0,0];
  },224,224);
  return {pieces,reaper,scythe,dispose(){[...pieces,reaper,scythe].forEach(t=>t.dispose());}};
}
