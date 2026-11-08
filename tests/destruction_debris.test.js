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

test('barrels and crates scatter outward, lift and tumble before landing', () => {
  for (const kind of ['barrel', 'crate']) {
    const s=scene(kind), debris=createDestructionDebris(s.root,()=>0,{random:seeded(1742)});
    debris.burst(s.item);
    const meshes=s.root.children[0].children, starts=meshes.map(m=>({position:m.position.clone(),rotation:m.quaternion.clone()}));
    for(let i=0;i<15;i++)debris.update(1/60);
    assert.equal(debris.stats.airborne,meshes.length,'the burst must launch all pieces, not collapse onto the floor');
    const quadrants=new Set();
    meshes.forEach((m,i)=>{
      const start=starts[i],dx=m.position.x-start.position.x,dz=m.position.z-start.position.z;
      assert.ok(Math.hypot(dx,dz)>(kind==='barrel'?.5:.65),'pieces visibly separate within a quarter second');
      assert.ok(m.position.y>start.position.y+(kind==='barrel'?.25:.35),'each piece follows a raised arc');
      assert.ok(m.quaternion.angleTo(start.rotation)>(kind==='barrel'?.7:1),'pieces tumble in flight');
      const rx=start.position.x-s.item.x,rz=start.position.z-s.item.z;
      if(Math.hypot(rx,rz)>.1)assert.ok(dx*rx+dz*rz>0,'outer pieces move away from the prop centre');
      quadrants.add(`${Math.sign(dx)},${Math.sign(dz)}`);
    });
    assert.equal(quadrants.size,4,'scatter surrounds the broken prop');
    assert.ok(debris.stats.farthestTravel>(kind==='barrel'?.8:1));
    for(let i=0;i<165;i++)debris.update(1/60);
    assert.equal(debris.stats.settled,meshes.length);
    assert.ok(debris.stats.farthestTravel>(kind==='barrel'?1.5:2),'debris lands beyond the old prop footprint');
    assert.ok(debris.stats.farthestTravel<7,'scatter remains local to the destroyed prop');
    disposeScene(s,debris);
  }
});

test('barrel fragments have a calmer launch while crates retain their original speed and tumble', () => {
  const results = {};
  for (const kind of ['barrel', 'crate']) {
    // Keep the sample airborne: a stave rotating into the floor receives an
    // overlap correction, which must not be mistaken for its launch impulse.
    const s=scene(kind), debris=createDestructionDebris(s.root,()=>-5,{random:seeded(32041)});
    debris.burst(s.item);
    const meshes=s.root.children[0].children, starts=meshes.map(mesh=>({position:mesh.position.clone(),rotation:mesh.quaternion.clone()}));
    const initial=debris.stats.lastBurst, dt=1/240;
    debris.update(dt);
    const speeds=[],spins=[];
    meshes.forEach((mesh,i)=>{
      const start=starts[i], speed=Math.hypot(mesh.position.x-start.position.x,mesh.position.z-start.position.z)/dt;
      const spin=mesh.quaternion.angleTo(start.rotation)/dt;
      assert.ok(speed >= (kind==='barrel'?2.38:3.18) && speed <= (kind==='barrel'?4.41:5.81),
        `${kind} horizontal launch remains within its intended strength`);
      assert.ok(spin >= (kind==='barrel'?3.49:4.99) && spin <= (kind==='barrel'?7.51:11.01),
        `${kind} flight rotation has its own intensity`);
      if(start.position.y>.5){
        const rise=(mesh.position.y-start.position.y)/dt;
        assert.ok(rise >= (kind==='barrel'?2.60:3.15) && rise <= (kind==='barrel'?4.01:5.01),
          `${kind} vertical launch remains bounded before gravity slows it`);
      }
      speeds.push(speed);spins.push(spin);
    });
    const average=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
    results[kind]={speed:average(speeds),spin:average(spins)};
    assert.equal(initial.fragments,meshes.length);
    assert.ok(Math.abs(initial.averageHorizontalSpeed-results[kind].speed)<.02,'telemetry describes the actual mesh launch');
    assert.ok(Math.abs(initial.averageSpinSpeed-results[kind].spin)<.01);
    disposeScene(s,debris);
  }
  assert.ok(results.barrel.speed < results.crate.speed*.88,'barrels visibly lose some explosive force');
  assert.ok(results.barrel.spin < results.crate.spin*.85,'barrels also tumble less violently');
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
