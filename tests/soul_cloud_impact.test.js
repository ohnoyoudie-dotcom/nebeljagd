import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSoulCloudVisual } from '../src/soul-cloud-visual.js';
import { createSoulCloudImpacts } from '../src/soul-cloud-impact.js';

test('soul impact briefly envelops a victim without changing gameplay state, freezes on pause and fully clears', () => {
  const scene=new THREE.Scene(), effects=createSoulCloudImpacts(scene);
  const target={id:'enemy',alive:true,health:100,height:2.3,position:new THREE.Vector3(2,0,3)};
  effects.impact(new THREE.Vector3(1.7,1.2,3),target);effects.update(.12);
  assert.equal(effects.telemetry.enveloping,1);assert.equal(effects.telemetry.visible,1);assert.equal(target.health,100);
  const root=scene.children.find(c=>c.visible), scale=root.scale.clone(), position=root.position.clone();
  assert.ok(scale.y>1 && scale.x>.8,'the burst covers the body rather than only the contact point');
  const state=effects.telemetry;effects.update(0);effects.update(NaN);effects.update(-1);
  assert.deepEqual(effects.telemetry,state);assert.deepEqual(root.position,position);assert.deepEqual(root.scale,scale);
  target.alive=false;effects.update(.04);assert.equal(effects.telemetry.visible,1,'an already-started puff fades on a corpse');
  effects.update(1);assert.equal(effects.telemetry.active,0);assert.equal(effects.telemetry.visible,0);
  effects.dispose();assert.equal(scene.children.length,0);
});

test('gas shrouds respect hidden targets and fog, and repeated impacts reuse bounded resources', () => {
  const scene=new THREE.Scene();let fog=true;
  const effects=createSoulCloudImpacts(scene,{isVisible:()=>!fog});
  const target={alive:true,concealed:true,revealRemaining:0,height:2.2,position:new THREE.Vector3()};
  effects.impact(new THREE.Vector3(0,1,0),target);effects.update(.04);assert.equal(effects.telemetry.visible,0);
  fog=false;effects.update(.04);assert.equal(effects.telemetry.visible,0);
  target.revealRemaining=1;effects.update(.04);assert.equal(effects.telemetry.visible,1);
  const geometry=new Set(),materials=new Set();scene.traverse(p=>{if(p.geometry)geometry.add(p.geometry);if(p.material)materials.add(p.material);});
  let geometryDisposed=0,materialDisposed=0;
  geometry.forEach(g=>g.addEventListener('dispose',()=>geometryDisposed++));materials.forEach(m=>m.addEventListener('dispose',()=>materialDisposed++));
  for(let i=0;i<100;i++)effects.impact(new THREE.Vector3(i*.01,1,0),target);
  assert.equal(effects.telemetry.active,effects.telemetry.capacity);assert.equal(scene.children.length,effects.telemetry.capacity);
  effects.reset();assert.equal(effects.telemetry.active,0);assert.equal(effects.telemetry.impacts,0);
  assert.equal(geometryDisposed,0);assert.equal(materialDisposed,0);
  effects.dispose();effects.dispose();assert.equal(geometryDisposed,geometry.size);assert.equal(materialDisposed,materials.size);
});

test('scenery produces a smaller, shorter puff and invalid impacts never consume a slot', () => {
  const scene=new THREE.Scene(),effects=createSoulCloudImpacts(scene);
  assert.equal(effects.impact({x:NaN,y:1,z:0}),false);assert.equal(effects.telemetry.active,0);
  effects.impact(new THREE.Vector3(0,1,0));effects.update(.15);
  assert.equal(effects.telemetry.enveloping,0);
  assert.ok(scene.children.find(c=>c.visible).scale.y<.7);
  effects.update(.36);assert.equal(effects.telemetry.active,0);effects.dispose();
});

test('moving soul gas owns one depth-tested volume with finite camera uniforms and bounded geometry', () => {
  const geometries=[],materials=[],clock={value:0},visual=createSoulCloudVisual(null,clock,m=>(materials.push(m),m),{ownGeometry:g=>(geometries.push(g),g)});
  const scene=new THREE.Scene();scene.add(visual.root);
  const mesh=visual.root.children[0],camera=new THREE.PerspectiveCamera(45,1,.1,100);camera.position.set(5,9,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const original=mesh.scale.clone();clock.value=.8;visual.update(.8);scene.updateMatrixWorld(true);mesh.onBeforeRender(null,scene,camera);
  assert.notDeepEqual(mesh.scale,original);assert.equal(visual.telemetry.draws,1);assert.ok(mesh.material.depthTest && !mesh.material.depthWrite);
  assert.ok(mesh.material.uniforms.uEye.value.toArray().every(Number.isFinite));assert.equal(geometries.length,1);assert.equal(materials.length,1);
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

test('world-derived concealment can hide targets without a concealed property and updates during a burst', () => {
  const scene=new THREE.Scene(),target={alive:true,height:2.3,position:new THREE.Vector3(),revealRemaining:0};
  let grass=true;
  const effects=createSoulCloudImpacts(scene,{isVisible:()=>true,isTargetVisible:t=>!grass||t.revealRemaining>0});
  effects.impact(new THREE.Vector3(0,1,0),target);effects.update(.05);assert.equal(effects.telemetry.visible,0);
  target.revealRemaining=.2;effects.update(.05);assert.equal(effects.telemetry.visible,1);
  target.revealRemaining=0;effects.update(.05);assert.equal(effects.telemetry.visible,0);
  grass=false;effects.update(.05);assert.equal(effects.telemetry.visible,1);effects.dispose();
});
