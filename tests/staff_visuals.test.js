import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSoulMarkVisuals } from '../src/soul-mark-visuals.js';
import { createSunVisuals } from '../src/sun-visuals.js';
import { SUN_RULES } from '../src/sun-spell.js';

test('the solar footprint grows with brightness, drops motes at peak and slowly fades without allocations', () => {
  const scene=new THREE.Scene(),sun=createSunVisuals(scene,SUN_RULES,()=>0),point=new THREE.Vector3(2,0,4);
  const values=[],radii=[];
  for(const age of [0,.1,.28,.4,SUN_RULES.rise]){sun.show(point,age);values.push(sun.telemetry.brightness);radii.push(sun.telemetry.effectiveRadius);}
  assert.equal(values[0],0);assert.equal(values.at(-1),1);
  assert.ok(values.every((v,i)=>!i||v>values[i-1]));
  assert.ok(radii[0]<.3 && radii.every((v,i)=>!i||v>radii[i-1]));assert.equal(radii.at(-1),SUN_RULES.radius);
  assert.equal(sun.telemetry.damageEligible,true);assert.ok(sun.telemetry.density>=.97);
  const root=scene.children[0],beam=root.getObjectByName('Sonnenkern');
  sun.show(point,.1);root.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(beam).getSize(new THREE.Vector3()),height=size.y;
  assert.equal(sun.telemetry.fallingParticles,0,'particles wait for high brightness');
  sun.show(point,1);root.updateMatrixWorld(true);assert.equal(new THREE.Box3().setFromObject(beam).getSize(new THREE.Vector3()).y,height);
  assert.ok(new THREE.Box3().setFromObject(beam).getSize(new THREE.Vector3()).x>size.x*5,'the visible column itself widens');
  assert.equal(sun.telemetry.particleDirection,'down');assert.ok(sun.telemetry.fallingParticles>0);
  assert.equal(sun.telemetry.beamLayers,1,'the light uses one continuous radial profile');
  assert.ok(sun.telemetry.particleSpeedMin>30 && sun.telemetry.particleSpeedMax<50,'rain crosses the column quickly');
  const particles=root.getObjectByName('Fallende Sonnenfunken'),m=new THREE.Matrix4();
  sun.show(point,1);particles.getMatrixAt(0,m);const y=m.elements[13];
  sun.show(point,1.04);particles.getMatrixAt(0,m);assert.ok(y-m.elements[13]>1.5,'the rain falls over 1.5m in 40ms');
  assert.ok(m.elements[5]>m.elements[0]*10,'fast droplets have long slender downward trails');
  sun.show(point,SUN_RULES.warning+SUN_RULES.duration+SUN_RULES.fade*.5);
  assert.equal(sun.telemetry.phase,'fade');assert.equal(sun.telemetry.damageEligible,false);
  assert.ok(Math.abs(sun.telemetry.brightness-.5)<1e-8);assert.equal(sun.telemetry.effectiveRadius,SUN_RULES.radius);
  const count=root.children.length;
  for(let i=0;i<100;i++){sun.start(point);sun.show(point,1);sun.hide();}
  assert.equal(root.children.length,count);assert.equal(sun.telemetry.visible,false);
  sun.dispose();assert.equal(scene.children.length,0);
});

test('three skull fragments charge a living jaw; only confirmed execution produces a pause-safe aftermath', () => {
  const scene=new THREE.Scene(),target={id:'v',alive:true,position:new THREE.Vector3(),height:2.3};
  const visuals=createSoulMarkVisuals(scene,{targets:new Map([['v',target]])});
  const mark={targetId:'v',count:1,remaining:8};visuals.update([mark]);
  const root=scene.children[0];assert.equal(root.children.filter(p=>p.visible).length,1);
  mark.count=2;visuals.update([mark]);assert.equal(root.children.filter(p=>p.visible).length,2);
  mark.count=3;mark.remaining=1;visuals.update([mark]);assert.equal(visuals.telemetry[0].phase,'charging');
  assert.equal(root.getObjectByName('Sensenmann'),undefined);assert.equal(root.getObjectByName('Sense'),undefined);
  mark.remaining=.12;visuals.update([mark]);assert.equal(visuals.telemetry[0].phase,'clamp');
  target.alive=false;visuals.executed({targetId:'v',killed:true,type:'soul-judgment'});visuals.update([],.1);
  assert.equal(visuals.telemetry[0].phase,'executed');assert.equal(visuals.count,0);
  const frozen=visuals.telemetry;visuals.update([],0);assert.deepEqual(visuals.telemetry,frozen);
  visuals.update([],1);assert.equal(scene.children.length,0);
  target.alive=true;visuals.update([mark]);target.alive=false;
  visuals.executed({targetId:'v',killed:true,type:'direct'});visuals.update([],.01);assert.equal(scene.children.length,0);
  visuals.dispose();
});

test('skull and execution respect concealment, revelation and visibility and reset without lingering effects', () => {
  const scene=new THREE.Scene(),target={id:'v',alive:true,concealed:true,position:new THREE.Vector3()};let inSight=true;
  const visuals=createSoulMarkVisuals(scene,{targets:new Map([['v',target]])},()=>inSight);
  const marks=[{targetId:'v',count:3,remaining:1}];visuals.update(marks);assert.equal(visuals.telemetry[0].visible,false);
  target.revealRemaining=2;visuals.update(marks);assert.equal(visuals.telemetry[0].visible,true);
  inSight=false;visuals.update(marks);assert.equal(visuals.telemetry[0].visible,false);
  visuals.reset();assert.equal(scene.children.length,0);visuals.dispose();
});

test('detailed skull geometry stays shared and is released only on disposal', () => {
  const scene=new THREE.Scene(),target={id:'v',alive:true,position:new THREE.Vector3(),height:2.3};
  const visuals=createSoulMarkVisuals(scene,{targets:new Map([['v',target]])});visuals.update([{targetId:'v',count:3,remaining:1}]);
  const root=scene.children[0];assert.ok(root.getObjectByName('Beweglicher Unterkiefer').isGroup);
  root.updateMatrixWorld(true);const size=new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  assert.ok(size.x>1 && size.x<1.5 && size.y<2,'the detailed skull stays compact at gameplay scale');
  const geometries=new Set();scene.traverse(p=>{if(p.geometry)geometries.add(p.geometry);});
  let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  visuals.reset();assert.equal(disposed,0);visuals.update([{targetId:'v',count:1,remaining:8}]);
  scene.traverse(p=>{if(p.geometry)assert.ok(geometries.has(p.geometry));});
  visuals.dispose();assert.equal(disposed,geometries.size);
});
