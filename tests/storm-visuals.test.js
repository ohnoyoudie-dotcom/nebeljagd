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
  assert.ok(point(11*6+2).distanceTo(new THREE.Vector3(2,.08,2)) < 1e-6);
  for (let i=1;i<12;i++) assert.ok(point(i*6).distanceTo(point((i-1)*6+2)) < 1e-6);
  for (let branch=0;branch<3;branch++) {
    const first=12+branch*4;
    assert.ok(point(first*6).distanceTo(point((3+branch*3)*6)) < 1e-6, 'a fork must start on its actual trunk node');
    for(let j=1;j<4;j++)assert.ok(point((first+j)*6).distanceTo(point((first+j-1)*6+2)) < 1e-6);
  }
  // Shared corners must agree on extrusion as well as centre position;
  // independent segment normals leave triangular holes in a thick bolt.
  for(const [start,count] of [[0,12],[12,4],[16,4],[20,4]]) for(let i=1;i<count;i++) {
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
  visuals.update(.15);
  assert.ok(bolts.geometry.attributes.aEnergy.getX(0)>.85,'the second discharge remains bright, not a gray tail');
  visuals.update(.25);
  assert.equal(bolts.geometry.attributes.aEnergy.getX(0),0);
  assert.equal(visuals.telemetry.impacts,1,'ground afterglow can outlive the bolt');
  visuals.dispose();
});
