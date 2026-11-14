import * as THREE from 'three';
import { REFLECTION_RULES } from './reflection-guard.js';
const vertex=`varying vec2 vUv;varying vec3 vNormal,vView,vLocal;void main(){vUv=uv;vLocal=position;vNormal=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vView=-p.xyz;gl_Position=projectionMatrix*p;}`;
function disposeRoot(root){const gs=new Set(),ms=new Set();root.traverse(p=>{if(p.geometry)gs.add(p.geometry);if(p.material)ms.add(p.material);});root.removeFromParent();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}
export { createBlinkVisuals } from './blink-visuals.js';
export function createReflectionSpell(scene,combat,ownerId,isVisible) {
  const root=new THREE.Group();root.name='Schutzstab · Reflexionskuppel';root.visible=false;scene.add(root);
  let clock=0,hitAge=1,blocks=0,casts=0,disposed=false;
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
    uniforms:{uTime:{value:0},uOpacity:{value:0},uHit:{value:new THREE.Vector3(0,0,1)},uHitAge:{value:1}},vertexShader:vertex,
    fragmentShader:`varying vec3 vNormal,vView,vLocal;uniform float uTime,uOpacity,uHitAge;uniform vec3 uHit;
    void main(){vec3 n=normalize(vLocal);float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.3);
      float latitude=asin(n.y);float arcs=pow(max(0.,cos(latitude*22.+uTime*1.6)),34.)*.065;
      float distance=acos(clamp(dot(n,uHit),-1.,1.));float ripple=exp(-pow((distance-uHitAge*4.)/.065,2.))*(1.-smoothstep(.05,.45,uHitAge));
      float flash=exp(-distance*distance*9.)*(1.-smoothstep(0.,.16,uHitAge));
      float alpha=(.035+rim*.48+arcs+ripple*.8+flash*.7)*uOpacity;
      vec3 color=mix(vec3(.10,.38,.85),vec3(.63,.94,1.),clamp(rim+ripple+flash,0.,1.));gl_FragColor=vec4(color,alpha);
      #include <colorspace_fragment>
    }`});
  const shell=new THREE.Mesh(new THREE.SphereGeometry(REFLECTION_RULES.radius,40,26),mat);root.add(shell);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.85,.025,6,64),new THREE.MeshBasicMaterial({color:'#91dbff',transparent:true,opacity:.6,depthWrite:false}));ring.rotation.x=-Math.PI/2;root.add(ring);
  function blocked(hit){blocks++;hitAge=0;mat.uniforms.uHit.value.set(hit.normal.x,hit.normal.y??0,hit.normal.z).normalize();}
  function update(dt){if(!combat?.targets?.get(ownerId)?.alive||!combat?.shieldState?.(ownerId)?.active){root.visible=false;return;}if(!(dt>0))return;clock+=dt;hitAge+=dt;const t=combat?.targets?.get(ownerId),g=combat?.shieldState?.(ownerId);root.visible=!!(t?.alive&&g?.active&&(!isVisible||isVisible(t.position)));
    if(!root.visible)return;root.position.copy(t.position);shell.position.y=(t.height??2.3)*.5;ring.position.y=.07;
    mat.uniforms.uTime.value=clock;mat.uniforms.uHitAge.value=hitAge;
    const age=REFLECTION_RULES.duration-g.remaining;mat.uniforms.uOpacity.value=THREE.MathUtils.smoothstep(age,0,.12)*THREE.MathUtils.smoothstep(g.remaining,0,.22);
    ring.material.opacity=mat.uniforms.uOpacity.value*.65;ring.rotation.z=clock*.4;
  }
  function reset(){combat?.clearShield?.(ownerId);root.visible=false;clock=0;hitAge=1;blocks=casts=0;}
  return {activate(){if(!combat?.activateShield?.(ownerId,blocked))return false;casts++;return true;},update,reset,
    get telemetry(){return {...combat?.shieldState?.(ownerId),casts,blocks,visible:root.visible,hitAge,position:{...root.position}};},
    dispose(){if(disposed)return;reset();disposed=true;disposeRoot(root);}};
}
