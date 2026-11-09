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

const seeded = seed => () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0;
  return (seed >>> 0) / 4294967296;
};
const snapshot = root => root.children[0].children.map(mesh => ({
  position: mesh.position.toArray(), quaternion: mesh.quaternion.toArray(),
}));
function disposeScene(s, debris) {
  debris.dispose(); s.mesh.dispose(); s.geometry.dispose(); s.material.dispose(); s.texture.dispose();
}

test('barrels separate in staggered stages, keep their original fragments and settle close to the prop', () => {
  const s=scene(),debris=createDestructionDebris(s.root,()=>0,{random:seeded(1742)});
  debris.burst(s.item);
  const meshes=s.root.children[0].children, initial=snapshot(s.root);
  assert.equal(debris.stats.pending,meshes.length);
  debris.update(.10);
  const moved=meshes.filter((mesh,i)=>mesh.position.distanceTo(new THREE.Vector3(...initial[i].position))>.001).length;
  assert.ok(moved>0 && moved<meshes.length,'some boards fall while the rest still retain the barrel shape');
  assert.ok(debris.stats.pending>0 && debris.stats.pending<meshes.length);
  const paused=snapshot(s.root);debris.update(0);assert.deepEqual(snapshot(s.root),paused);
  for(let i=0;i<180;i++)debris.update(1/60);
  assert.equal(debris.stats.pending,0);assert.equal(debris.stats.settled,meshes.length);
  assert.ok(debris.stats.farthestTravel>.7,'the barrel still visibly breaks apart');
  assert.ok(debris.stats.farthestTravel<3.2,'boards stay in a compact area');
  assert.equal(meshes.length,initial.length,'all original textured fragments are retained');
  disposeScene(s,debris);
});

test('barrels have shorter, varied launches while crates keep their immediate burst', () => {
  const results={};
  for(const kind of ['barrel','crate']) {
    const s=scene(kind),debris=createDestructionDebris(s.root,()=>-5,{random:seeded(32041)});
    debris.burst(s.item);
    const launch=debris.stats.lastBurst;
    if(kind==='barrel') {
      assert.ok(new Set(launch.launchSamples.map(p=>p.delay.toFixed(3))).size>=4);
      assert.ok(launch.launchSamples.every(p=>p.delay>0 && p.delay<.34));
      assert.ok(launch.averageHorizontalSpeed>=1.7 && launch.averageHorizontalSpeed<=3.2);
      assert.ok(launch.averageUpwardSpeed>=1.9 && launch.averageUpwardSpeed<=2.95);
    } else {
      assert.ok(launch.launchSamples.every(p=>p.delay===0));
      assert.ok(launch.averageHorizontalSpeed>=3.2 && launch.averageHorizontalSpeed<=5.8);
      assert.ok(launch.averageUpwardSpeed>=3.2 && launch.averageUpwardSpeed<=5);
    }
    // Measure real motion once all release delays have passed, above a low floor.
    for(let i=0;i<24;i++)debris.update(1/60);
    const meshes=s.root.children[0].children, before=meshes.map(m=>m.position.clone());
    debris.update(1/240);
    results[kind]=meshes.reduce((sum,m,i)=>sum+Math.hypot(m.position.x-before[i].x,m.position.z-before[i].z)*240,0)/meshes.length;
    assert.ok(results[kind]>1);
    disposeScene(s,debris);
  }
  assert.ok(results.barrel<results.crate*.8,'actual barrel flight is more compact');
});

test('separate barrels have different release rhythms, including after reset', () => {
  const s=scene(),debris=createDestructionDebris(s.root,()=>0,{random:seeded(32)});
  const rhythms=[];
  for(let i=0;i<3;i++) {
    debris.burst(s.item);
    rhythms.push(debris.stats.lastBurst.launchSamples.map(p=>p.delay));
    debris.reset();
  }
  assert.notDeepEqual(rhythms[0],rhythms[1]);assert.notDeepEqual(rhythms[1],rhythms[2]);
  disposeScene(s,debris);
});

test('burst randomness is reproducible when injected but changes flight between independent break seeds', () => {
  const flight = seed => {
    const s=scene(),debris=createDestructionDebris(s.root,()=>0,{random:seeded(seed)});
    debris.burst(s.item);
    for(let i=0;i<18;i++)debris.update(1/60);
    const result=snapshot(s.root);
    disposeScene(s,debris);
    return result;
  };
  const first=flight(1321), replay=flight(1321), different=flight(99931);
  assert.deepEqual(first,replay,'injected seeds make failure reproduction exact');
  assert.notDeepEqual(first,different,'independent break seeds cannot replay the same canned explosion');
  assert.equal(first.length,different.length,'random flight does not change the original fracture count');
  assert.ok(first.filter((piece,i)=>piece.position.some((coordinate,axis)=>Math.abs(coordinate-different[i].position[axis])>.05)).length>=first.length/2,
    'variation changes the flight of many fragments, not a single decorative piece');
});

test('each break samples randomness once, animation and pause consume none, and reset does not replay a launch', () => {
  const s=scene();let calls=0;
  const debris=createDestructionDebris(s.root,()=>0,{random:()=>{calls++;return .42;}});
  assert.equal(calls,0);
  const launch = () => {
    debris.burst(s.item);
    for(let i=0;i<12;i++)debris.update(1/60);
    return snapshot(s.root);
  };
  const first=launch();
  assert.equal(calls,1,'one entropy sample controls the whole textured burst');
  const frozen=snapshot(s.root), stats=debris.stats;
  for(let i=0;i<30;i++)debris.update(0);
  assert.deepEqual(snapshot(s.root),frozen);
  assert.deepEqual(debris.stats,stats);
  assert.equal(calls,1,'pausing never reshuffles trajectories');
  debris.reset();
  assert.equal(calls,1);
  const second=launch();
  assert.equal(calls,2);
  assert.notDeepEqual(second,first,'a new break varies even when the entropy source returns the same value');
  debris.burst(s.item);
  assert.equal(calls,3);
  assert.equal(debris.stats.bursts,3,'the burst sequence survives reset');
  for(let i=0;i<12;i++)debris.update(1/60);
  assert.notDeepEqual(snapshot(s.root).slice(-second.length),second,'consecutive breaks also vary without a reset');
  debris.update(10.1);
  assert.equal(debris.stats.active,0);
  assert.equal(calls,3,'flight, settling and expiry never request fresh randomness');
  disposeScene(s,debris);
});

test('fragments settle on terrain, pause, fade gradually, and expire without disposing shared assets', () => {
  const s=scene(), floor=(x,z)=>(x-3)*.08+(z-4)*.06, debris=createDestructionDebris(s.root,floor,{random:seeded(1742)});
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
  const s=scene(),debris=createDestructionDebris(s.root,()=>0,{random:seeded(1742)});
  for(let i=0;i<30;i++)debris.burst(s.item);
  assert.equal(debris.stats.active,DEBRIS_RULES.maximum);
  debris.reset();assert.equal(debris.stats.active,0);assert.equal(s.root.children[0].children.length,0);
  debris.burst(s.item);assert.ok(debris.stats.active>0);debris.dispose();
});
