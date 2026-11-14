import * as THREE from 'three';
import { createSoulCloudVisual } from './soul-cloud-visual.js';

const CAPACITY = 8;
const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
/** Visual-only gas bursts, bounded independently of the hit/mark bookkeeping. */
export function createSoulCloudImpacts(scene, { isVisible = null, isTargetVisible = null } = {}) {
  const geometries = new Set(), materials = new Set(), clock = { value: 0 };
  const ownGeometry = g => (geometries.add(g), g), ownMaterial = m => (materials.add(m), m);
  const entries = Array.from({ length: CAPACITY }, (_, i) => {
    const visual = createSoulCloudVisual(null, clock, ownMaterial, { ownGeometry, seed: 5.2+i*3.71, impact: true });
    visual.root.name = 'Seelenwolke · Trefferhülle'; visual.root.visible = false; scene.add(visual.root);
    return { visual, age: 0, duration: 0, target: null, origin: new THREE.Vector3(), center: new THREE.Vector3(), drift: i*2.39996 };
  });
  let cursor = 0, impacts = 0, disposed = false;
  const canSee = (p, target) => {
    if (target && isTargetVisible && !isTargetVisible(target)) return false;
    if (target?.concealed && !(target.revealRemaining > 0)) return false;
    return !isVisible || isVisible(p, { concealed: !!target?.concealed && !(target.revealRemaining > 0) });
  };
  function show(entry) {
    const { visual, age, duration, target } = entry;
    if (!duration) { visual.root.visible = false; return; }
    // The initial burst catches up with its victim, then naturally drifts away.
    if (target?.position && age < .14) {
      const p=target.position, height=Math.min(3.2, Math.max(.8,target.height ?? 2.3));
      entry.center.set(p.x,(p.y ?? entry.origin.y-height*.5)+height*.49,p.z);
    }
    const spread = 1-Math.exp(-age*25), remaining = Math.max(0,1-age/duration);
    visual.root.position.copy(entry.origin).lerp(entry.center, THREE.MathUtils.smoothstep(age,0,.11));
    visual.root.position.x += Math.sin(entry.drift)*age*.15;
    visual.root.position.z += Math.cos(entry.drift)*age*.15;
    visual.root.position.y += age*.25;
    const size=(target ? 1.02 : .58)*(.20+spread*.85);
    const height=target ? Math.min(1.4,Math.max(.7,(target.height ?? 2.3)*.55)) : .55;
    visual.root.scale.set(size,height*(.25+spread*.80),size);
    const fade=THREE.MathUtils.smoothstep(remaining,0,.64);
    visual.update(clock.value,fade);
    visual.root.visible = age < duration && canSee(visual.root.position,target);
  }
  function impact(point, target = null) {
    if (disposed || !valid(point)) return false;
    const entry=entries[cursor++%CAPACITY]; impacts++;
    entry.age=0;entry.duration=target ? .78 : .50;entry.target=target;
    entry.origin.copy(point);entry.center.copy(point);
    if(target?.position) {
      const p=target.position,height=target.height ?? 2.3;
      entry.center.set(p.x,(p.y ?? point.y-height*.5)+height*.49,p.z);
    }
    show(entry);return true;
  }
  function update(dt) {
    if(disposed || !Number.isFinite(dt) || !(dt>0))return;
    clock.value+=dt;
    for(const entry of entries) {
      if(!entry.duration)continue;
      entry.age=Math.min(entry.duration,entry.age+dt);
      if(entry.age>=entry.duration){entry.duration=0;entry.target=null;entry.visual.root.visible=false;continue;}
      show(entry);
    }
  }
  function reset() {
    for(const e of entries){e.duration=e.age=0;e.target=null;e.visual.root.visible=false;}
    clock.value=0;cursor=impacts=0;
  }
  return {impact,update,reset,get telemetry(){return {
    active:entries.filter(e=>e.duration>0).length,visible:entries.filter(e=>e.visual.root.visible).length,
    enveloping:entries.filter(e=>e.duration>0&&e.target).length,capacity:CAPACITY,impacts,
  };},dispose(){if(disposed)return;reset();disposed=true;entries.forEach(e=>e.visual.root.removeFromParent());
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
