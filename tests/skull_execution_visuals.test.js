import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSoulMarkVisuals } from '../src/soul-mark-visuals.js';

function setup() {
  const scene=new THREE.Scene(),a={id:'a',alive:true,position:new THREE.Vector3(4,2,6),height:2.3},
    b={id:'b',alive:true,position:new THREE.Vector3(-3,0,2),height:2.3};
  const visuals=createSoulMarkVisuals(scene,{targets:new Map([['a',a],['b',b]])},()=>true,{concealmentAt:()=>0});
  return {scene,a,b,visuals};
}
function bone(root){let result;root.traverse(p=>{if(!result&&p.material?.userData.kind==='bone')result=p.material;});return result;}

test('only a completed skull reddens and talks, with independent colour state for simultaneous victims',t=>{
  const {scene,a,b,visuals}=setup();t.after(()=>visuals.dispose());
  const marks=[{targetId:'a',count:3,remaining:1.1},{targetId:'b',count:1,remaining:8}];
  visuals.update(marks);visuals.update(marks,.28);
  const skulls=scene.children.filter(p=>p.name==='Seelenrichter · Dreiteiliger Totenkopf');
  const first=visuals.telemetry.find(e=>e.targetId===a.id),second=visuals.telemetry.find(e=>e.targetId===b.id);
  assert.equal(first.phase,'charging');assert.ok(first.redHeat>.35);assert.ok(first.jawOpen>.3);
  assert.equal(second.phase,'marks');assert.equal(second.redHeat,0);assert.equal(second.jawOpen,0);
  assert.notEqual(bone(skulls[0]),bone(skulls[1]));
  assert.ok(bone(skulls[1]).color.equals(bone(skulls[1]).userData.baseColor));
  assert.ok(!bone(skulls[0]).color.equals(bone(skulls[0]).userData.baseColor));
  assert.equal(skulls[0].getObjectByName('Sensenmann'),undefined);assert.equal(skulls[0].getObjectByName('Sense'),undefined);
  const jaw=skulls[0].getObjectByName('Beweglicher Unterkiefer'),before=jaw.position.y;
  marks[0].remaining=.9;visuals.update(marks,.2);assert.notEqual(jaw.position.y,before);
  const frozen=visuals.telemetry,pose=jaw.position.clone();visuals.update(marks,0);
  assert.deepEqual(visuals.telemetry,frozen);assert.deepEqual(jaw.position,pose);
  marks[0].remaining=.02;visuals.update(marks,.1);assert.equal(visuals.telemetry[0].phase,'clamp');
  assert.ok(visuals.telemetry[0].jawOpen<.02);assert.equal(visuals.telemetry[0].pulseActive,false);
});

test('confirmed execution drops a world-aligned pulse onto the moving victim and survives the consumed mark',t=>{
  const {scene,a,visuals}=setup();t.after(()=>visuals.dispose());
  const marks=[{targetId:a.id,count:3,remaining:.02}];visuals.update(marks);visuals.update(marks,.28);
  const skull=scene.getObjectByName('Seelenrichter · Dreiteiliger Totenkopf');
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);camera.position.set(0,29,18);camera.lookAt(0,0,0);
  skull.children[0].children[0].children[0].onBeforeRender(null,scene,camera);
  a.alive=false;visuals.executed({targetId:a.id,killed:true,type:'soul-judgment'});
  assert.equal(visuals.telemetry[0].pulseActive,true);assert.equal(visuals.telemetry[0].phase,'executed');
  const effect=scene.getObjectByName('Seelenurteil · weltgerichteter Einschlag'),pulse=effect.getObjectByName('Seelenurteil · fallender Impuls');
  visuals.update([],.18);a.position.set(7,3,5);visuals.update([],0);scene.updateMatrixWorld(true);
  const point=pulse.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(point.x-a.position.x)<1e-8&&Math.abs(point.z-a.position.z)<1e-8,'billboarding cannot rotate the strike away from the victim');
  assert.ok(Math.abs(point.y-(a.position.y+a.height*.52))<1e-8);
  const snapshot=visuals.telemetry,position=pulse.position.clone(),opacity=pulse.material.uniforms.uOpacity.value;
  visuals.update([],0);assert.deepEqual(visuals.telemetry,snapshot);assert.deepEqual(pulse.position,position);assert.equal(pulse.material.uniforms.uOpacity.value,opacity);
  a.concealed=true;visuals.update([],.01);assert.equal(effect.visible,false);assert.equal(visuals.telemetry[0].pulseActive,false);
  a.revealRemaining=1;visuals.update([],.01);assert.equal(effect.visible,true);
  visuals.update([],1);assert.equal(scene.children.length,0);
});

test('incomplete skulls, unsuccessful hits and other weapons cannot play a successful execution',t=>{
  const {scene,a,visuals}=setup();t.after(()=>visuals.dispose());
  let mark={targetId:a.id,count:2,remaining:5};visuals.update([mark]);
  visuals.executed({targetId:a.id,killed:true,type:'soul-judgment'});assert.equal(visuals.telemetry[0].pulseActive,false);
  mark={...mark,count:3,remaining:.1};visuals.update([mark]);
  for(const result of [{killed:false,type:'soul-judgment'},{killed:true,type:'direct'}]) {
    visuals.executed({targetId:a.id,...result});assert.equal(visuals.telemetry[0].pulseActive,false);
    assert.equal(scene.getObjectByName('Seelenurteil · weltgerichteter Einschlag').visible,false);
  }
  a.alive=false;visuals.update([],.01);assert.equal(scene.children.length,0);
});
