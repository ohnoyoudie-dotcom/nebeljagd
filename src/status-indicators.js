import * as THREE from 'three';
import { activeStatusEffects, STATUS_DEFINITIONS } from './status-effects.js';
import { statusIconSvg } from './status-icons.js';

/** A bounded SVG overlay keeps small status glyphs sharp at every zoom/device scale. */
export function createStatusIndicators(container, {combat,world,isVisible=()=>true,capacity=128}={}) {
  const layer=document.createElement('div');layer.className='actor-status-layer playing-only';
  layer.setAttribute('aria-label','Aktive Statuseffekte');container.append(layer);
  const rows=new Map(),point=new THREE.Vector3();let visible=[];
  function make(id) {
    const element=document.createElement('div');element.className='actor-status-row';element.dataset.actorId=id;element.hidden=true;layer.append(element);
    const icons=new Map();
    for(const definition of STATUS_DEFINITIONS){
      const icon=document.createElement('span');icon.className='actor-status-icon';icon.dataset.status=definition.id;
      icon.setAttribute('role','img');icon.setAttribute('aria-label',definition.label);icon.title=definition.label;icon.hidden=true;
      icon.innerHTML=statusIconSvg(definition.id);element.append(icon);icons.set(definition.id,icon);
    }
    const row={element,icons};rows.set(id,row);return row;
  }
  function update(camera,{width,height,phase='playing'}={}) {
    visible=[];
    const enabled=phase==='playing'||phase==='paused';
    layer.hidden=!enabled;
    for(const row of rows.values())row.element.hidden=true;
    for(const [id,row] of rows)if(!combat.targets.has(id)){row.element.remove();rows.delete(id);}
    if(!enabled||!(width>0&&height>0))return;
    camera.updateMatrixWorld();world.root.updateWorldMatrix(true,false);
    for(const target of combat.targets.values()){
      if(!target.alive||target.destructible||target.targetable===false)continue;
      const concealed=!(target.revealRemaining>0)&&(target.concealed||(world.concealmentAt?.(target.position.x,target.position.z)??0)>.01);
      if(!target.local&&(target.visible===false||concealed||!isVisible(target.position,{concealed:!!concealed,local:false})))continue;
      const effects=activeStatusEffects(target,combat.shieldState(target.id));if(!effects.length)continue;
      point.copy(target.position);point.y+=Math.max(3.4,(target.height??2.3)+1.1);
      point.applyMatrix4(world.root.matrixWorld).project(camera);
      if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1)continue;
      const row=rows.get(target.id)??(rows.size<capacity?make(target.id):null);if(!row)continue;
      const ids=new Set(effects.map(effect=>effect.id));
      for(const [id,icon]of row.icons)icon.hidden=!ids.has(id);
      const columns=Math.min(4,effects.length),halfWidth=(columns*24+(columns-1)*3)/2;
      const x=THREE.MathUtils.clamp((point.x*.5+.5)*width,halfWidth+4,Math.max(halfWidth+4,width-halfWidth-4));
      const y=THREE.MathUtils.clamp((.5-point.y*.5)*height,Math.ceil(effects.length/4)*27+4,height-4);
      row.element.style.gridTemplateColumns=`repeat(${columns},24px)`;
      row.element.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;
      row.element.hidden=false;visible.push({id:target.id,effects:effects.map(e=>({...e}))});
    }
  }
  function reset(){visible=[];for(const row of rows.values())row.element.hidden=true;}
  return{update,reset,inspect:()=>({visible,allocated:rows.size}),dispose(){rows.clear();layer.remove();visible=[];}};
}
