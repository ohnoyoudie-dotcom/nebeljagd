import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createIslandWater } from '../src/island-water.js';
import { pointInPolygon } from '../src/map/model.js';

for(const reverse of [false,true])test(`calm sea keeps shore ribbons on water, including lake holes (reverse=${reverse})`,()=>{
  const outer=[[-50,-50],[50,-50],[50,50],[-50,50]],hole=[[-10,-10],[10,-10],[10,10],[-10,10]];
  const map={bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},island:{points:reverse?[...outer].reverse():outer},waterAreas:[{points:reverse?[...hole].reverse():hole}]};
  const before=JSON.stringify(map),root=new THREE.Group(),time={value:0};
  const stats=createIslandWater(root,{map,heightAt:()=>.5,timeUniform:time});
  assert.equal(JSON.stringify(map),before);assert.equal(stats.meshes,3);assert.equal(stats.seaTriangles,2);
  assert.equal(root.children.length,3);assert.equal(root.children[0].material.uniforms.uTime,time);assert.equal(root.children[2].material.uniforms.uTime,time);
  assert.equal(root.children[2].material.depthWrite,false);assert.equal(root.children[2].material.forceSinglePass,true);
  const p=root.children[2].geometry.attributes.position;
  for(let i=1;i<p.count;i+=2){
    const q=[p.getX(i),p.getZ(i)];
    assert.ok(!pointInPolygon(q,outer)||pointInPolygon(q,hole));
  }
  const bank=root.children[1].geometry.attributes.position;
  for(let i=0;i<bank.count;i+=2){assert.ok(bank.getY(i)>bank.getY(i+1));assert.ok(Math.hypot(bank.getX(i)-bank.getX(i+1),bank.getZ(i)-bank.getZ(i+1))>0);}
  assert.equal(stats.shoreProfile,'sloped-shallow-gradient');
  for(const mesh of root.children){assert.ok([...mesh.geometry.attributes.position.array].every(Number.isFinite));assert.equal(mesh.castShadow,false);assert.equal(mesh.userData.ignoreVision,true);mesh.geometry.dispose();mesh.material.dispose();}
});
