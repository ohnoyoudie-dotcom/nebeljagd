import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';

for (const variant of ['wood', 'kit-tripo-ornate-bow']) test(`arrow nock, direction and flight stay aligned: ${variant}`, () => {
  const scene = new THREE.Scene(), actor = new THREE.Group();
  scene.add(actor); actor.scale.setScalar(1.2); actor.rotation.y = -.7;
  const prototype = new THREE.Group();
  prototype.add(new THREE.Mesh(new THREE.BoxGeometry(.1,1.4,.08), new THREE.MeshStandardMaterial()));
  prototype.userData.bowRig = {stringLower:[.1,-.7,0],stringUpper:[.1,.7,0],stringRadiusMetres:.02,drawDistanceMetres:.25};
  const world = {bounds:100,heightAt:()=>0,traceProjectile:()=>null};
  const weapons = createWeapons(scene,actor,world,null,{placements:[{id:'bow',kind:'bow',variant,position:[0,0],rarity:'common'}],tripoPrototypes:{'kit-tripo-ornate-bow':prototype}});
  assert.equal(weapons.interact(actor.position).type,'bow');
  const bow = actor.children.find(part=>part.userData.variant===variant);
  const loaded = actor.getObjectByName('Aufgelegter Pfeil');
  const aim = 1.1;
  weapons.attack(actor.position,aim);
  weapons.update(.1,.1,actor.position);
  actor.updateWorldMatrix(true,true);
  const rig = bow.userData.bowRig;
  const nock = rig ? rig.lower.clone().lerp(rig.upper,.5) : new THREE.Vector3(.02,0,0);
  nock.x += weapons.telemetry.bowDraw * (rig?.drawDistance ?? .31);
  bow.localToWorld(nock);
  const tail=loaded.localToWorld(new THREE.Vector3(0,0,-.43));
  assert.ok(tail.distanceTo(nock)<1e-6,'arrow tail touches animated string');
  const tip=loaded.localToWorld(new THREE.Vector3(0,0,.43));
  assert.ok(Math.abs(tip.distanceTo(tail)-.86)<1e-6,'same physical length on bow and in flight');
  const forward=new THREE.Vector3(Math.sin(aim),0,Math.cos(aim));
  assert.ok(tip.clone().sub(tail).normalize().dot(forward)> .999999);
  actor.rotation.y=.6; // rotate during draw; committed aim must remain fixed
  weapons.update(.14,.24,actor.position);
  const flying=scene.children.find(part=>part.name==='Fliegender Pfeil'&&part.visible);
  assert.ok(flying); assert.equal(flying.userData.trail,undefined);
  const heading=new THREE.Vector3(0,0,1).applyQuaternion(flying.quaternion);
  assert.ok(heading.dot(forward)>.999999);
  const previous=flying.position.clone();
  weapons.update(.05,.29,actor.position);
  const motion=flying.position.clone().sub(previous);
  assert.ok(motion.clone().normalize().dot(forward)>.999999);
  assert.ok(Math.abs(motion.y)<1e-9);
  weapons.dispose();
});

test('actual uploaded arrow endpoints align to flight and collision axis in all three dimensions', async () => {
  const {readFileSync}=await import('node:fs');
  const {alignArrowModel,ARROW_TIP,ARROW_TAIL}=await import('../src/arrow-alignment.js');
  const bytes=readFileSync(new URL('../assets/imported/tripo-projectiles/runtime/feathered-arrow.glb',import.meta.url));
  const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const accessor=doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION],view=doc.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType,5126);
  const offset=28+jsonLength+(view.byteOffset??0)+(accessor.byteOffset??0);
  const vertices=Array.from({length:accessor.count},(_,i)=>new THREE.Vector3(...[0,1,2].map(k=>bytes.readFloatLE(offset+i*(view.byteStride??12)+k*4))));
  for(const endpoint of [ARROW_TIP,ARROW_TAIL])assert.ok(vertices.some(v=>v.distanceTo(new THREE.Vector3(...endpoint))<1e-6),'measured endpoint belongs to the real mesh');
  const source=new THREE.Group(),model=alignArrowModel(source);model.updateMatrixWorld(true);
  for(const [point,z] of [[ARROW_TIP,.43],[ARROW_TAIL,-.43]]) {
    const actual=source.localToWorld(new THREE.Vector3(...point));
    assert.ok(actual.distanceTo(new THREE.Vector3(0,0,z))<1e-7);
  }
});
