import * as THREE from 'three';
import { createSoulApparitionModels } from './soul-apparition-models.js';
import { SOUL_JUDGMENT_RULES } from './soul-judgment.js';

const AFTERMATH = .72;
/** Three skull fragments seal a judgment; its living jaw replaces the former reaper. */
export function createSoulMarkVisuals(scene, combat, isVisible, world) {
  const entries = new Map(), models = createSoulApparitionModels();let disposed=false;
  function remove(id, entry) {
    const materials=new Set();
    for(const root of [entry.root,entry.effectRoot]){root.removeFromParent();root.traverse(p=>{if(p.material)materials.add(p.material);});}
    materials.forEach(m=>m.dispose());entries.delete(id);
  }
  function visible(target) {
    const p=target.position;
    const concealed=!(target.revealRemaining>0)&&(target.concealed||world?.concealmentAt?.(p.x,p.z)>.01);
    return !concealed&&(!isVisible||isVisible(p,{concealed:false}));
  }
  function anchor(entry,target) {
    const p=target.position,height=target.height??2.3;
    entry.root.position.set(p.x,(p.y??0)+height+2.20,p.z);
    entry.effectRoot.position.set(p.x,p.y??0,p.z);
    entry.dropHeight=height+2.20;entry.bodyHeight=height*.52;
    entry.root.visible=visible(target);
  }
  function pose(entry,progress,sealed,fade=1,aftermath=0) {
    const clamp=THREE.MathUtils.smoothstep(progress,.86,1);
    const breathe=.5+.5*Math.sin(progress*32+progress*progress*20);
    entry.redHeat=sealed?.16+.84*THREE.MathUtils.smoothstep(progress,0,.72):0;
    entry.jawOpen=sealed?( .18+breathe*.58)*(1-clamp):0;
    if(aftermath>0)entry.jawOpen=0;
    const size=sealed?.95+THREE.MathUtils.smoothstep(progress,0,.45)*.12-clamp*.045:.95;
    entry.jaw.rotation.x=entry.jawOpen*.48;
    entry.jaw.position.y=-entry.jawOpen*.13;
    entry.root.rotation.z=0;
    entry.pieces.forEach((piece,i)=>{
      piece.visible=i<entry.shownCount;
      const reveal=i===entry.shownCount-1?entry.markReveal:1;
      piece.scale.setScalar(size*(.86+reveal*.14)*(1-aftermath*.13));
      piece.position.set(i<2?(i===0?-1:1)*aftermath*.13:0,aftermath*(i===2?-.10:.14),0);
      models.heat(piece,entry.redHeat,breathe);models.fade(piece,reveal*fade);
    });
    entry.phase=sealed?(progress<.86?'charging':'clamp'):'marks';
  }
  function showAftermath(entry) {
    const age=AFTERMATH-entry.aftermath,fraction=age/AFTERMATH;
    pose(entry,1,true,1-THREE.MathUtils.smoothstep(fraction,.12,1),fraction);
    entry.phase='executed';entry.effectRoot.visible=entry.root.visible;
    const fall=THREE.MathUtils.smoothstep(age,0,.18);
    entry.pulseActive=age<.24;
    entry.pulse.visible=entry.pulseActive;
    entry.pulse.position.set(0,THREE.MathUtils.lerp(entry.dropHeight-.15,entry.bodyHeight,fall),0);
    const width=.13+Math.sin(fall*Math.PI)*.16;
    entry.pulse.scale.set(width,.38+Math.sin(fall*Math.PI)*.55,width);
    entry.pulse.material.uniforms.uTime.value=age;
    entry.pulse.material.uniforms.uOpacity.value=(1-THREE.MathUtils.smoothstep(age,.15,.24))*.95;
    const burst=THREE.MathUtils.smoothstep(age,.11,.26),mistFade=(1-THREE.MathUtils.smoothstep(age,.26,.70))*burst;
    entry.mist.forEach((p,i)=>{
      const a=i*2.39996,size=.1+burst*(.72+i*.08);
      p.visible=mistFade>0;p.position.set(Math.sin(a)*burst*.25,entry.bodyHeight+Math.cos(a)*.15+age*.15,Math.cos(a)*burst*.25);
      p.scale.set(size,size*(.75+i*.05),size);p.material.uniforms.uTime.value=age+i*.27;p.material.uniforms.uOpacity.value=mistFade*.65;
    });
  }
  function executed(result) {
    const entry=entries.get(result.targetId),target=combat.targets.get(result.targetId);
    if(!entry||!target||entry.shownCount!==3||entry.aftermath>0||!result.killed||result.type!=='soul-judgment')return;
    anchor(entry,target);entry.aftermath=AFTERMATH;entry.markReveal=1;entry.shownCount=3;showAftermath(entry);
  }
  function update(marks,dt=0) {
    if(disposed)return;const delta=Number.isFinite(dt)&&dt>0?dt:0,strongest=new Map();
    for(const mark of marks){const old=strongest.get(mark.targetId);if(!old||mark.count>old.count||mark.count===old.count&&mark.remaining<old.remaining)strongest.set(mark.targetId,mark);}
    for(const [id,entry]of entries){
      const target=combat.targets.get(id);
      if(entry.aftermath>0){
        entry.aftermath=Math.max(0,entry.aftermath-delta);
        if(!entry.aftermath||!target){remove(id,entry);continue;}
        anchor(entry,target);showAftermath(entry);
      }else if(!strongest.has(id)||!target?.alive)remove(id,entry);
    }
    for(const [id,mark]of strongest){
      const target=combat.targets.get(id);if(!target?.alive)continue;
      let entry=entries.get(id);
      if(!entry){const root=new THREE.Group();root.name='Seelenrichter · Dreiteiliger Totenkopf';
        entry={root,...models.create(root),aftermath:0,shownCount:0,revealAge:0,markReveal:0,jawOpen:0,redHeat:0,pulseActive:false,phase:'marks'};
        scene.add(root,entry.effectRoot);entries.set(id,entry);
      }
      if(entry.aftermath>0)continue;
      if(entry.shownCount!==mark.count){entry.shownCount=mark.count;entry.revealAge=0;}else entry.revealAge+=delta;
      entry.markReveal=THREE.MathUtils.smoothstep(entry.revealAge,.10,.26);anchor(entry,target);
      entry.effectRoot.visible=false;entry.pulseActive=false;
      const sealed=mark.count===3,progress=THREE.MathUtils.clamp(1-mark.remaining/SOUL_JUDGMENT_RULES.delay,0,1);
      pose(entry,progress,sealed,sealed?1:Math.min(1,mark.remaining/.4));
    }
  }
  function reset(){for(const [id,entry]of entries)remove(id,entry);}
  return {update,executed,reset,get count(){return [...entries.values()].filter(e=>!e.aftermath).length;},
    get telemetry(){return [...entries].map(([targetId,e])=>({targetId,phase:e.phase,visible:e.root.visible,markReveal:e.markReveal,
      height:e.root.position.y,jawOpen:e.jawOpen,redHeat:e.redHeat,pulseActive:e.pulseActive&&e.effectRoot.visible}));},
    dispose(){if(disposed)return;reset();disposed=true;models.dispose();}};
}
