import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fractureGeometry, createDestructionDebris, DEBRIS_RULES } from '../src/destruction-debris.js';

test('fractures preserve every original triangle and UV without changing the prototype', () => {
  for (const kind of ['barrel', 'crate']) {
    const source = kind === 'barrel' ? new THREE.CylinderGeometry(.55, .5, 1.3, 24, 4) : new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const positions = source.attributes.position.array.slice(), uvs = source.attributes.uv.array.slice();
    const pieces = fractureGeometry(source, kind);
    assert.ok(pieces.length >= 8 && pieces.length <= 14);
    assert.equal(pieces.reduce((s, p) => s + p.geometry.attributes.position.count, 0), source.index.count);
    const original = source.toNonIndexed(), restored = [];
    for (const { geometry, pivot, restNormal } of pieces) {
      assert.ok(Math.abs(restNormal.length()-1)<1e-8);
      const p = geometry.attributes.position, uv = geometry.attributes.uv;
      assert.equal(p.count, uv.count);
      for (let i = 0; i < p.count; i++) restored.push([p.getX(i)+pivot.x,p.getY(i)+pivot.y,p.getZ(i)+pivot.z,uv.getX(i),uv.getY(i)].map(n=>n.toFixed(5)).join(','));
    }
    const expected = Array.from({length:original.attributes.position.count},(_,i)=>[
      original.attributes.position.getX(i),original.attributes.position.getY(i),original.attributes.position.getZ(i),original.attributes.uv.getX(i),original.attributes.uv.getY(i),
    ].map(n=>n.toFixed(5)).join(','));
    // Quantized coordinates can differ by signed zero after recentering.
    assert.deepEqual(restored.map(s=>s.replaceAll('-0.00000','0.00000')).sort(), expected.map(s=>s.replaceAll('-0.00000','0.00000')).sort());
    assert.deepEqual(source.attributes.position.array, positions); assert.deepEqual(source.attributes.uv.array, uvs);
    pieces.forEach(p=>p.geometry.dispose()); source.dispose(); original.dispose();
  }
});

function scene(kind = 'barrel') {
  const root = new THREE.Group(), texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({map:texture});
  const geometry = kind === 'barrel' ? new THREE.CylinderGeometry(.5,.5,1.3,24,4) : new THREE.BoxGeometry(1.2,1.3,1.2,2,2,2);
  geometry.translate(0,.65,0);
  const mesh = new THREE.InstancedMesh(geometry,material,1), matrix = new THREE.Matrix4().makeTranslation(3,0,4);
  mesh.setMatrixAt(0,matrix);
  return {root,material,texture,geometry,mesh,item:{kind,x:3,z:4,scale:1,instances:[{mesh,originalMatrix:matrix}]}};
}

test('barrels and crates scatter outward, lift and tumble before landing', () => {
  for (const kind of ['barrel', 'crate']) {
    const s=scene(kind), debris=createDestructionDebris(s.root,()=>0);
    debris.burst(s.item);
    const meshes=s.root.children[0].children, starts=meshes.map(m=>({position:m.position.clone(),rotation:m.quaternion.clone()}));
    for(let i=0;i<15;i++)debris.update(1/60);
    assert.equal(debris.stats.airborne,meshes.length,'the burst must launch all pieces, not collapse onto the floor');
    const quadrants=new Set();
    meshes.forEach((m,i)=>{
      const start=starts[i],dx=m.position.x-start.position.x,dz=m.position.z-start.position.z;
      assert.ok(Math.hypot(dx,dz)>.65,'pieces visibly separate within a quarter second');
      assert.ok(m.position.y>start.position.y+.35,'each piece follows a raised arc');
      assert.ok(m.quaternion.angleTo(start.rotation)>1,'pieces tumble in flight');
      const rx=start.position.x-s.item.x,rz=start.position.z-s.item.z;
      if(Math.hypot(rx,rz)>.1)assert.ok(dx*rx+dz*rz>0,'outer pieces move away from the prop centre');
      quadrants.add(`${Math.sign(dx)},${Math.sign(dz)}`);
    });
    assert.equal(quadrants.size,4,'scatter surrounds the broken prop');
    assert.ok(debris.stats.farthestTravel>1);
    for(let i=0;i<165;i++)debris.update(1/60);
    assert.equal(debris.stats.settled,meshes.length);
    assert.ok(debris.stats.farthestTravel>2,'debris lands beyond the old prop footprint');
    assert.ok(debris.stats.farthestTravel<7,'scatter remains local to the destroyed prop');
    debris.dispose();s.geometry.dispose();s.material.dispose();s.texture.dispose();
  }
});

test('fragments settle on terrain, pause, fade gradually, and expire without disposing shared assets', () => {
  const s=scene(), floor=(x,z)=>(x-3)*.08+(z-4)*.06, debris=createDestructionDebris(s.root,floor);
  let sharedDisposed=0; s.texture.addEventListener('dispose',()=>sharedDisposed++); s.geometry.addEventListener('dispose',()=>sharedDisposed++);
  debris.burst(s.item); const initial=debris.stats.active; assert.ok(initial>=12);
  for(let i=0;i<180;i++)debris.update(1/60);
  assert.equal(debris.stats.settled,initial); assert.equal(debris.stats.averageOpacity,1);
  const group=s.root.children[0], positions=group.children.map(m=>m.position.clone());
  const fragments=fractureGeometry(s.geometry,'barrel');
  group.children.forEach((m,i)=>assert.ok(fragments[i].restNormal.clone().applyQuaternion(m.quaternion).y>.999,
    'stave faces and lids rest upward, never balanced on an edge'));
  fragments.forEach(p=>p.geometry.dispose());
  group.children.forEach(m=>{assert.equal(m.material.map,s.texture);assert.notEqual(m.material,s.material);assert.ok(m.position.y>=floor(m.position.x,m.position.z));});
  for(let i=0;i<30;i++)debris.update(0);
  assert.deepEqual(group.children.map(m=>m.position),positions);
  debris.update(5,()=>false);assert.ok(Math.abs(debris.stats.averageOpacity-.5)<1e-8);assert.ok(group.children.every(m=>!m.visible));
  debris.update(2.1);assert.equal(debris.stats.active,0);assert.equal(sharedDisposed,0);
  debris.dispose();debris.dispose();assert.equal(s.root.children.length,0);assert.equal(sharedDisposed,0);
});

test('many destructions stay bounded and restart clears debris immediately',()=>{
  const s=scene(),debris=createDestructionDebris(s.root,()=>0);
  for(let i=0;i<30;i++)debris.burst(s.item);
  assert.equal(debris.stats.active,DEBRIS_RULES.maximum);
  debris.reset();assert.equal(debris.stats.active,0);assert.equal(s.root.children[0].children.length,0);
  debris.burst(s.item);assert.ok(debris.stats.active>0);debris.dispose();
});
