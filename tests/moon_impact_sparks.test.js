import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createImpactSparks } from '../src/impact-sparks.js';
import { createSpecialWeapons } from '../src/special-weapons.js';
import { createCollisionIndex } from '../src/collision.js';

test('small spark streaks fly away from the contact surface, pause, fade and respect visibility',()=>{
  const scene=new THREE.Scene();let visible=true;
  const sparks=createImpactSparks(scene,()=>visible),mesh=scene.children[0],matrix=new THREE.Matrix4();
  assert.equal(mesh.visible,false);
  sparks.emit({x:0,y:1.4,z:5},{x:0,z:-1},0);
  assert.equal(sparks.telemetry.active,10);assert.equal(sparks.telemetry.visible,10);
  sparks.update(.1);
  for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);assert.ok(matrix.elements[14]<4.9,'streaks travel outward, not through the wall');
    const scale=new THREE.Vector3().setFromMatrixScale(matrix);assert.ok(scale.y>scale.x*2,'elongated sparks');
  }
  const frozen=mesh.instanceMatrix.array.slice(),colors=mesh.instanceColor.array.slice();
  sparks.update(0);assert.deepEqual(mesh.instanceMatrix.array,frozen);assert.deepEqual(mesh.instanceColor.array,colors);
  visible=false;sparks.update(.01);assert.equal(mesh.visible,false);assert.equal(sparks.telemetry.visible,0);
  visible=true;sparks.update(.01);assert.ok(sparks.telemetry.visible>0);
  sparks.update(.5);assert.equal(sparks.telemetry.active,0);assert.equal(mesh.visible,false);
  let released=0;for(const resource of [mesh.geometry,mesh.material])resource.addEventListener('dispose',()=>released++);
  sparks.dispose();sparks.dispose();assert.equal(released,2);assert.equal(scene.children.length,0);
});

test('spark storage is bounded and reset removes all remaining particles',()=>{
  const scene=new THREE.Scene(),sparks=createImpactSparks(scene);
  for(let i=0;i<30;i++)sparks.emit({x:0,y:1,z:0},{x:0,z:0},Math.PI/2);
  assert.equal(sparks.telemetry.active,32);assert.equal(sparks.telemetry.visible,32);
  assert.ok(sparks.telemetry.lastImpact.normal.x<-.99,'invalid normal falls back against the flight direction');
  sparks.reset();assert.equal(sparks.telemetry.active,0);assert.equal(sparks.telemetry.bursts,0);sparks.dispose();
});

test('a swept moon collision emits exactly once; ordinary range return emits no obstacle sparks',()=>{
  const scene=new THREE.Scene(),wall={minX:-2,maxX:2,minZ:5,maxZ:5.5,minY:0,maxY:3};
  const index=createCollisionIndex([], [wall]);
  const special=createSpecialWeapons(scene,{heightAt:()=>0,traceProjectile:(...args)=>index.traceSegment(...args)},null,'player',()=>{});
  const player=new THREE.Vector3(),origin=new THREE.Vector3(0,1.4,0);
  special.launchMoon(origin,0,{});special.update(.1,player,.1);
  assert.equal(special.telemetry.moonImpacts.bursts,0);
  special.update(.2,player,.3);
  assert.equal(special.telemetry.moon.mode,'returning');assert.equal(special.telemetry.moonImpacts.bursts,1);
  assert.ok(Math.abs(special.telemetry.moonImpacts.lastImpact.position.z-4.85)<1e-8);
  for(let t=.3;t<1.5;t+=.05)special.update(.05,player,t);
  assert.equal(special.telemetry.moon,null);assert.equal(special.telemetry.moonImpacts.bursts,1);assert.equal(special.telemetry.moonImpacts.active,0);
  special.reset();wall.destroyed=true;special.launchMoon(origin,0,{});
  for(let t=0;t<2;t+=.05)special.update(.05,player,t);
  assert.equal(special.telemetry.moonImpacts.bursts,0,'no contact effect on reaching maximum range');
  special.dispose();
});

test('a wall immediately in front of the staff tip also produces one impact burst',()=>{
  const scene=new THREE.Scene(),special=createSpecialWeapons(scene,{heightAt:()=>0},null,'player',()=>{});
  const origin=new THREE.Vector3(0,1.4,.8),contact={point:new THREE.Vector3(0,1.4,.45),normal:{x:0,z:-1}};
  assert.equal(special.launchMoon(origin,0,{},contact),true);
  assert.equal(special.telemetry.moonImpacts.bursts,1);assert.equal(special.telemetry.moon.mode,'returning');
  assert.equal(special.launchMoon(origin,0,{},contact),false);assert.equal(special.telemetry.moonImpacts.bursts,1);
  special.reset();assert.equal(special.telemetry.moonImpacts.active,0);special.dispose();
});
