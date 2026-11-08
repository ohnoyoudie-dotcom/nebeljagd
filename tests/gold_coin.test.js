import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGoldCoinGeometry, GOLD_COIN_STYLE } from '../src/gold-coin.js';
import { createPickups } from '../src/pickups.js';

test('the solid coin has matching geometry, normals and colour on both hat-stamped faces', () => {
  const geometry = createGoldCoinGeometry();
  const p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color;
  const key = values => values.map(v=>Math.abs(v)<.000001?'0.00000':v.toFixed(5)).join(',');
  const vertices=new Set(), mirrored=[];
  for(let i=0;i<p.count;i++){
    vertices.add(key([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)]));
    mirrored.push(key([p.getX(i),p.getY(i),-p.getZ(i),n.getX(i),n.getY(i),-n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)]));
  }
  for(const vertex of mirrored)assert.ok(vertices.has(vertex),'each face vertex has an identical mirrored reverse');
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-size.y)<1e-6,'round face');
  assert.ok(Math.abs(size.x-.42)<1e-6 && size.z>.065 && size.z<.08,'half-sized disc with a solid thin edge');
  assert.ok([...Array(p.count).keys()].some(i=>Math.abs(p.getX(i))<.12 && p.getY(i)>.10 && p.getZ(i)>.03),'raised hat tip on the face');
  assert.ok(p.count/3<2500,'bounded geometry without extra coin stacks');
  geometry.dispose();
});

test('one shared coin per gold drop turns slowly clockwise and freezes while paused', () => {
  const scene=new THREE.Scene(), pickups=createPickups(scene,{placements:[]});
  const coin=pickups.addDrop({type:'gold',position:[0,0],amount:13},{pop:false});
  const second=pickups.addDrop({type:'gold',position:[2,0],amount:7},{pop:false});
  const viewer=new THREE.Vector3(0,0,3), options={canCollect:false};
  assert.equal(coin.visual.geometry,second.visual.geometry);
  assert.equal(coin.visual.material,second.visual.material);
  assert.equal(coin.floating.children.length,2,'one coin and one small glint');
  assert.ok(Math.abs(GOLD_COIN_STYLE.radius*2*coin.floating.scale.x-.504)<1e-6,'coin diameter is half the previous size');
  assert.equal(coin.visual.userData.coin.emblem,'wizard-hat');
  assert.equal(coin.visual.userData.coin.emblemSides,2);
  pickups.update(0,0,viewer,options);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);
  camera.position.set(0,29,18);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const projectedEdge = () => {
    scene.updateMatrixWorld(true);
    const centre=coin.visual.localToWorld(new THREE.Vector3()).project(camera);
    return coin.visual.localToWorld(new THREE.Vector3(GOLD_COIN_STYLE.radius,0,0)).project(camera).sub(centre);
  };
  const before=projectedEdge();
  pickups.update(.25,.25,viewer,options);
  assert.ok(projectedEdge().y<before.y,'the right edge moves downward: clockwise in the game camera');
  let previous=coin.visual.rotation.y;
  for(let i=0;i<20;i++){
    pickups.update(.1,i,viewer,options);
    assert.ok(coin.visual.rotation.y<previous,'continuous rotation without reversing');
    previous=coin.visual.rotation.y;
  }
  assert.ok(Math.abs(previous)>.5 && Math.abs(previous)<1,'slow turn, not a fast spinning token');
  const frozen={rotation:coin.visual.rotation.toArray(),height:coin.floating.position.y,glint:coin.glint.scale.clone(),ring:coin.ring.scale.clone()};
  pickups.update(0,999,viewer,options);
  assert.deepEqual({rotation:coin.visual.rotation.toArray(),height:coin.floating.position.y,glint:coin.glint.scale,ring:coin.ring.scale},frozen);
  assert.equal(coin.amount,13);
  pickups.reset();assert.equal(pickups.items.length,0);assert.equal(coin.group.parent,null);
});
