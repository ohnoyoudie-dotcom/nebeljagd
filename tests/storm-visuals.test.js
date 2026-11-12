import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStormVisuals } from '../src/storm-visuals.js';
import { STORM_RULES } from '../src/storm-spell.js';

function setup() {
  const scene = new THREE.Scene();
  const visuals = createStormVisuals(scene, STORM_RULES, () => 0, () => true);
  visuals.start(new THREE.Vector3(3, 0, 2));
  visuals.show(new THREE.Vector3(3, 0, 2), .6);
  return { scene, visuals, bolts: scene.getObjectByName('Gewitter · verzweigte Einschläge') };
}

test('lightning branches connect to the jagged trunk and terminate at the collision point', () => {
  const { visuals, bolts } = setup();
  visuals.strike({ x: 5, y: .08, z: 4 }, 19);
  const p = bolts.geometry.attributes.position;
  const point = i => new THREE.Vector3().fromBufferAttribute(p, i);
  assert.ok(point(23*6+2).distanceTo(new THREE.Vector3(2,.08,2)) < 1e-6);
  for (let i=1;i<24;i++) assert.ok(point(i*6).distanceTo(point((i-1)*6+2)) < 1e-6);
  for (let branch=0;branch<5;branch++) {
    const first=24+branch*6;
    assert.ok(Array.from({length:23},(_,i)=>i+1).some(node=>point(first*6).distanceTo(point(node*6))<1e-6), 'a fork must start on an actual trunk node');
    for(let j=1;j<6;j++)assert.ok(point((first+j)*6).distanceTo(point((first+j-1)*6+2)) < 1e-6);
  }
  // Shared corners must agree on extrusion as well as centre position;
  // independent segment normals leave triangular holes in a thick bolt.
  for(const [start,count] of [[0,24],[24,6],[30,6],[36,6],[42,6],[48,6]]) for(let i=1;i<count;i++) {
    const left=(start+i-1)*6+2,right=(start+i)*6;
    const tangents=bolts.geometry.attributes.aTangent,widths=bolts.geometry.attributes.aWidth;
    assert.ok(new THREE.Vector3().fromBufferAttribute(tangents,left).distanceTo(new THREE.Vector3().fromBufferAttribute(tangents,right))<1e-6);
    assert.equal(widths.getX(left),widths.getX(right));
  }
  assert.ok(p.array.every(Number.isFinite));
  visuals.dispose();
});

test('late frames retain only the impact afterglow, then clear every pooled effect', () => {
  const { visuals, bolts } = setup();
  visuals.strike({x:4,y:0,z:3},8,.43);
  assert.equal(visuals.telemetry.bolts,0);
  assert.equal(visuals.telemetry.impacts,1);
  assert.ok(bolts.geometry.attributes.aEnergy.array.every(v=>v===0));
  visuals.update(.2);
  assert.equal(visuals.telemetry.impacts,0);
  visuals.strike({x:4,y:0,z:3},9,1);
  assert.equal(visuals.telemetry.impacts,0,'expired coarse-frame strikes cannot flash again');
  visuals.dispose();
});

test('repeated busy storms reuse bounded render batches and dispose all GPU resources', () => {
  const { scene, visuals, bolts } = setup();
  const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  assert.ok(meshes.length<=8);
  assert.equal(visuals.telemetry.draws,meshes.length);
  const positions=bolts.geometry.attributes.position.array;
  let disposed=0;
  for(const m of meshes)m.geometry.addEventListener('dispose',()=>disposed++);
  for(let i=0;i<200;i++) {
    visuals.strike({x:4,y:0,z:3},i);visuals.update(.001);
    assert.ok(visuals.telemetry.bolts<=24);assert.ok(visuals.telemetry.impacts<=24);
  }
  assert.equal(bolts.geometry.attributes.position.array,positions);
  visuals.hide();assert.equal(visuals.telemetry.draws,0);assert.equal(visuals.telemetry.impacts,0);
  visuals.dispose();assert.equal(scene.children.length,0);assert.equal(disposed,meshes.length);
});

test('the first lightning flash stays bright across a slow frame before flickering out', () => {
  const { visuals, bolts } = setup();
  visuals.strike({x:4,y:0,z:3},5);
  visuals.update(.05);
  assert.equal(bolts.geometry.attributes.aEnergy.getX(0),1);
  visuals.update(.18);
  assert.ok(bolts.geometry.attributes.aEnergy.getX(0)>.85,'the second discharge remains bright, not a gray tail');
  visuals.update(.25);
  assert.equal(bolts.geometry.attributes.aEnergy.getX(0),0);
  assert.equal(visuals.telemetry.impacts,1,'ground afterglow can outlive the bolt');
  visuals.dispose();
});

test('bolt thickness and fork locations vary while every shared corner stays closed', () => {
  const { visuals, bolts } = setup();
  const profiles=[];
  for(const seed of [19,32]) {
    visuals.strike({x:5,y:.08,z:4},seed);
    const slot=profiles.length,base=slot*54*6;
    const p=bolts.geometry.attributes.position,w=bolts.geometry.attributes.aWidth;
    const widths=Array.from({length:25},(_,i)=>w.getX(base+(i===24?23*6+2:i*6)));
    assert.ok(Math.max(...widths)<.21 && Math.min(...widths)>.05);
    assert.ok(widths.some((value,i)=>i>0 && value>widths[i-1]),'local width variation breaks the uniform ribbon');
    const roots=[];
    for(let branch=0;branch<5;branch++) {
      const start=new THREE.Vector3().fromBufferAttribute(p,base+(24+branch*6)*6);
      roots.push(Array.from({length:23},(_,i)=>i+1).find(i=>start.distanceTo(new THREE.Vector3().fromBufferAttribute(p,base+i*6))<1e-6));
    }
    assert.ok(roots.every(Number.isInteger));profiles.push({widths,roots});
  }
  assert.notDeepEqual(profiles[0].roots,profiles[1].roots);
  visuals.dispose();
});

test('impact dust rises and dissipates while ground sparks travel outward, with complete pooled cleanup', () => {
  const { scene, visuals } = setup();
  const dust=scene.getObjectByName('Gewitter · kurze Staubstöße'),sparks=scene.getObjectByName('Gewitter · aufsprühende Funken');
  const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
  visuals.strike({x:4,y:0,z:3},8);visuals.update(.1);
  dust.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  const earlyY=position.y,earlyWidth=scale.x;
  assert.ok(dust.geometry.attributes.aEnergy.getX(0)>0);
  sparks.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  const earlyDistance=Math.hypot(position.x-1,position.z-1);
  assert.ok(earlyDistance>.2 && position.y<.2,'the ground spark skims the terrain');
  visuals.update(.15);
  dust.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  assert.ok(position.y>earlyY && scale.x>earlyWidth);
  sparks.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  assert.ok(Math.hypot(position.x-1,position.z-1)>earlyDistance);
  visuals.update(.4);
  assert.ok(dust.geometry.attributes.aEnergy.array.every(value=>value===0));
  // Three's decompose() returns unit scale for a singular matrix; inspect its
  // actual basis instead to verify that expired instances render no geometry.
  for(let i=0;i<sparks.count;i++){sparks.getMatrixAt(i,matrix);assert.ok(matrix.elements.slice(0,12).every(value=>value===0));}
  visuals.dispose();
});


test('return strokes differ per bolt without changing collision endpoints or cleanup', () => {
  const { visuals, bolts } = setup();
  for(let seed=1;seed<=12;seed++)visuals.strike({x:4,y:0,z:3},seed);
  visuals.update(.20);
  const energy=bolts.geometry.attributes.aEnergy;
  const values=Array.from({length:12},(_,i)=>energy.getX(i*54*6));
  assert.ok(values.some(v=>v===0) && values.some(v=>v>.9),'return flashes should not all switch together');
  visuals.update(.4);assert.ok(energy.array.every(v=>v===0));
  visuals.dispose();
});
