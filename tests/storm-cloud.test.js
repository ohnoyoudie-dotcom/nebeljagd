import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStormCloud } from '../src/storm-cloud.js';

function uniforms() {
  return {uAge:{value:0},uOpacity:{value:1},uFlash:{value:0},
    uCutouts:{value:Array.from({length:8},()=>new THREE.Vector3())},uCutoutCount:{value:0}};
}

test('the thunderhead is a closed outward-facing volume within the compact rendering budget', () => {
  const cloud=createStormCloud(uniforms()),geometry=cloud.meshes[0].geometry;
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  assert.ok(cloud.triangles<20000,'one compact cloud must stay below its triangle budget');
  const edges=new Map(),vertices=new Map(),adjacency=new Map();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3(),face=new THREE.Vector3(),normal=new THREE.Vector3();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
  for(let i=0;i<p.count;i++) {
    a.fromBufferAttribute(p,i);normal.fromBufferAttribute(n,i);
    assert.ok(Number.isFinite(a.x+a.y+a.z+normal.x+normal.y+normal.z));
    assert.ok(Math.abs(normal.length()-1)<1e-5,'surface normals must stay normalized');
    assert.ok(Math.hypot(a.x,a.z)<1.9,'the cloud must leave most of the 4.8m area visible');
    vertices.set(key(i),a.clone());
  }
  for(let i=0;i<p.count;i+=3) {
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    ab.subVectors(b,a);ac.subVectors(c,a);face.crossVectors(ab,ac);
    normal.fromBufferAttribute(n,i);
    assert.ok(face.dot(normal)>-1e-7,'backwards faces create holes in the thunderhead');
    const ids=[key(i),key(i+1),key(i+2)];
    for(let j=0;j<3;j++) {
      const x=ids[j],y=ids[(j+1)%3],edge=[x,y].sort().join('|');
      edges.set(edge,(edges.get(edge)||0)+1);
      if(!adjacency.has(x))adjacency.set(x,new Set());
      adjacency.get(x).add(y);
      if(!adjacency.has(y))adjacency.set(y,new Set());
      adjacency.get(y).add(x);
    }
  }
  for(const count of edges.values())assert.equal(count,2,'no exposed boundaries or intersecting surface shells');
  const pending=[vertices.keys().next().value],seen=new Set();
  while(pending.length){const id=pending.pop();if(seen.has(id))continue;seen.add(id);for(const next of adjacency.get(id))if(!seen.has(next))pending.push(next);}
  assert.equal(seen.size,vertices.size,'the cloud must be one connected mass');
  cloud.dispose();
});

test('cached cloud construction keeps each instance independently editable and disposable', () => {
  const first=createStormCloud(uniforms()),second=createStormCloud(uniforms());
  const firstPosition=first.meshes[0].geometry.attributes.position;
  const secondPosition=second.meshes[0].geometry.attributes.position;
  const original=secondPosition.getX(0);
  firstPosition.setX(0,1000);assert.equal(secondPosition.getX(0),original);
  let firstDisposed=0,secondDisposed=0;
  for(const mesh of first.meshes){mesh.geometry.addEventListener('dispose',()=>firstDisposed++);mesh.material.addEventListener('dispose',()=>firstDisposed++);}
  for(const mesh of second.meshes){mesh.geometry.addEventListener('dispose',()=>secondDisposed++);mesh.material.addEventListener('dispose',()=>secondDisposed++);}
  first.dispose();assert.equal(firstDisposed,6);assert.equal(secondDisposed,0);
  const third=createStormCloud(uniforms());
  assert.equal(third.meshes[0].geometry.attributes.position.getX(0),original,'a reused template cannot inherit a prior instance mutation');
  second.dispose();third.dispose();assert.equal(secondDisposed,6);
});
