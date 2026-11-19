import * as THREE from 'three';
import { ARRIVAL_TELEPORT_SECONDS, ARRIVAL_FADE_SECONDS } from './map-arrival.js';

const smooth = (a,b,x) => THREE.MathUtils.smoothstep(x,a,b);
const vertex = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 vUv;uniform float uTime,uOpacity;
void main(){
  vec2 p=(vUv-.5)*3.;float r=length(p),a=atan(p.y,p.x),t=uTime;
  float wav=.012*sin(a*9.-t*5.)+.006*sin(a*17.+t*8.);
  float d=r-1.+wav;
  float rim=exp(-d*d*1900.);
  float fringe=exp(-d*d*170.);
  float haze=exp(-d*d*26.);
  float inside=1.-smoothstep(.94,1.01,r);
  float spiral=pow(max(0.,sin(r*24.-a*3.+t*4.)),12.);
  float innerArc=exp(-pow(r-(.62+.09*sin(a*2.-t*2.)),2.)*1300.)*pow(.5+.5*sin(a+t*3.),4.);
  float flecks=.62+.38*sin(a*23.-t*12.)*sin(a*7.+t*5.);
  vec3 deep=mix(vec3(.015,.012,.055),vec3(.065,.025,.17),r);
  deep+=vec3(.035,.045,.16)*spiral*smoothstep(.1,.9,r);
  deep+=vec3(.1,.12,.32)*innerArc;
  vec3 color=deep*inside+vec3(.12,.055,.36)*haze+vec3(.32,.2,.72)*fringe;
  color+=mix(vec3(.55,.45,1.),vec3(.65,.88,1.),.5+.5*sin(a*3.-t))*rim*flecks;
  float alpha=clamp(inside*.92+haze*.22+fringe*.5+rim,0.,1.)*uOpacity;
  if(alpha<.003)discard;
  gl_FragColor=vec4(color,alpha);
  #include <colorspace_fragment>
}`;

/** A standing aperture behind the avatar; all parts share one fixed arrival anchor. */
export function createArrivalTeleport(parent, { reducedMotion = false } = {}) {
  const group = new THREE.Group(); group.name = 'Ankunft · Arkane Pforte'; parent.add(group);
  const portalMaterial = new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
    uniforms:{uTime:{value:0},uOpacity:{value:0}},transparent:true,depthWrite:false,
    side:THREE.DoubleSide,toneMapped:false});
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(3.3,5.4),portalMaterial);
  portal.name='Stehende arkane Öffnung';portal.position.set(0,1.85,-.85);portal.rotation.x=-.32;group.add(portal);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.18,'rgba(255,255,255,.7)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const texture=new THREE.CanvasTexture(canvas);
  const sprite = color => {const s=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));group.add(s);return s;};
  const flash=sprite('#d9e6ff'),aura=sprite('#8065ff');
  const sparks=Array.from({length:reducedMotion?8:18},(_,i)=>sprite(i%3?'#a89aff':'#c4eeff'));
  let previous='ground',age=0,width=0,disposed=false;
  group.visible=false;
  return {
    reset(){previous='ground';age=0;width=0;group.visible=false;portal.visible=false;portalMaterial.uniforms.uOpacity.value=0;flash.material.opacity=0;aura.material.opacity=0;},
    update(position,arrival) {
      if(disposed)return;
      const appearing=arrival.stage==='teleport';
      if(appearing&&previous!=='teleport')group.position.copy(position);
      group.visible=appearing||(!arrival.active&&arrival.settled<1);
      age=appearing?arrival.progress*ARRIVAL_TELEPORT_SECONDS:ARRIVAL_TELEPORT_SECONDS+arrival.settled*ARRIVAL_FADE_SECONDS;
      const opening=smooth(0,.28,age),closing=smooth(.7,1,age);
      width=(.035+.965*opening)*(1-closing);
      portal.scale.set(Math.max(.001,width),(.7+.3*opening)*(1-closing*.3),1);
      portal.visible=appearing&&age<1;
      portalMaterial.uniforms.uTime.value=age*(reducedMotion?.25:1);
      portalMaterial.uniforms.uOpacity.value=smooth(0,.08,age)*(1-smooth(.88,1,age));
      // The short reveal pulse masks the original avatar's appearance, without altering its materials.
      const pulse=smooth(.26,.4,age)*(1-smooth(.4,.66,age));
      flash.position.set(0,1.1,.08);flash.scale.set(1.7+pulse*.7,2.8+pulse*.6,1);flash.material.opacity=pulse*.72;
      aura.position.copy(portal.position);aura.scale.set(3.2*width,4.3,1);aura.material.opacity=portalMaterial.uniforms.uOpacity.value*.13;
      const decay=1-smooth(.88,ARRIVAL_TELEPORT_SECONDS+ARRIVAL_FADE_SECONDS,age);
      for(let i=0;i<sparks.length;i++){
        const a=i*2.399+age*(reducedMotion?.12:.6),scatter=Math.max(0,age-.7)*(reducedMotion?.6:1.6);
        const x=Math.cos(a)*(1.12*width+scatter),y=1.85+Math.sin(a)*1.82;
        sparks[i].position.set(x,y+scatter*(.4+i%3*.2),-.85-Math.sin(a)*.57+scatter*Math.sin(i*3.1));
        const size=.055+(i%3)*.015;sparks[i].scale.set(size,size*(1.4+closing),1);
        sparks[i].material.opacity=opening*decay*(.5+.3*Math.sin(i*1.7+age*3.)**2);
      }
      previous=arrival.stage;
    },
    inspect:()=>({style:'arcane-portal',active:group.visible,position:group.position.toArray(),
      particles:sparks.length,opacity:group.visible?Math.max(flash.material.opacity,portalMaterial.uniforms.uOpacity.value):0,
      portalVisible:group.visible&&portal.visible,width,age,flash:flash.material.opacity,disposed}),
    dispose(){if(disposed)return;disposed=true;group.visible=false;group.removeFromParent();portal.geometry.dispose();portalMaterial.dispose();texture.dispose();for(const s of [flash,aura,...sparks])s.material.dispose();},
  };
}
