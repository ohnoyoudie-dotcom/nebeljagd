import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSoulMarkVisuals } from '../src/soul-mark-visuals.js';
import { createSunVisuals } from '../src/sun-visuals.js';
import { SUN_RULES } from '../src/sun-spell.js';

test('solar seed expands from a point; descending light reaches its target before the first damage pulse', () => {
  const scene = new THREE.Scene(), sun = createSunVisuals(scene, SUN_RULES, () => 0);
  const point = new THREE.Vector3(2, 0, 4), radii = [];
  for (const age of [0, .15, .35, .60, .7]) { sun.show(point, age); radii.push(sun.telemetry.seedRadius); }
  assert.ok(radii[0] < .1); assert.equal(radii.at(-1), SUN_RULES.radius);
  assert.ok(radii.every((r, i) => !i || r > radii[i-1]));
  sun.show(point, .75); assert.ok(sun.telemetry.descent > 0 && sun.telemetry.descent < 1);
  sun.show(point, .85); assert.equal(sun.telemetry.descent, 1);
  assert.ok(sun.telemetry.density >= .97); assert.equal(sun.telemetry.groundFill, 1);
  const children = scene.children[0].children.length;
  for (let i = 0; i < 100; i++) { sun.start(point); sun.show(point, 1); sun.hide(); }
  assert.equal(scene.children[0].children.length, children);
  assert.equal(sun.telemetry.visible, false); sun.dispose(); assert.equal(scene.children.length, 0);
});

test('three skull fragments call the reaper; only a confirmed execution produces an aftermath, which freezes on pause', () => {
  const scene = new THREE.Scene(), target = { id: 'v', alive: true, position: new THREE.Vector3(), height: 2.3 };
  const visuals = createSoulMarkVisuals(scene, { targets: new Map([['v', target]]) });
  const mark = { targetId: 'v', count: 1, remaining: 8 };
  visuals.update([mark]); assert.equal(visuals.telemetry[0].phase, 'marks');
  const root = scene.children[0];
  assert.equal(root.children.slice(0, 3).filter(p => p.visible).length, 1);
  mark.count = 2; visuals.update([mark]); assert.equal(root.children.slice(0, 3).filter(p => p.visible).length, 2);
  mark.count = 3; mark.remaining = 1; visuals.update([mark]); assert.equal(visuals.telemetry[0].phase, 'raised');
  mark.remaining = .12; visuals.update([mark]); assert.equal(visuals.telemetry[0].phase, 'strike');
  target.alive = false;
  visuals.executed({ targetId: 'v', killed: true, type: 'soul-judgment' }); visuals.update([], .1);
  assert.equal(visuals.telemetry[0].phase, 'executed'); assert.equal(visuals.count, 0);
  const cloak = root.getObjectByName('Sensenmann').children.find(p=>p.isMesh);
  const opacity = cloak.material.opacity;
  visuals.update([], 0); assert.equal(cloak.material.opacity, opacity);
  visuals.update([], .5); assert.equal(scene.children.length, 0);
  target.alive = true; visuals.update([mark]); target.alive = false;
  visuals.executed({ targetId: 'v', killed: true, type: 'direct' }); visuals.update([], .01);
  assert.equal(scene.children.length, 0);
  visuals.dispose();
});

test('apparitions respect concealment, revelation and visibility and reset without lingering sprites', () => {
  const scene = new THREE.Scene(), target = { id: 'v', alive: true, concealed: true, position: new THREE.Vector3() };
  let inSight = true;
  const visuals = createSoulMarkVisuals(scene, { targets: new Map([['v', target]]) }, () => inSight);
  const marks = [{ targetId: 'v', count: 3, remaining: 1 }];
  visuals.update(marks); assert.equal(visuals.telemetry[0].visible, false);
  target.revealRemaining = 2; visuals.update(marks); assert.equal(visuals.telemetry[0].visible, true);
  inSight = false; visuals.update(marks); assert.equal(visuals.telemetry[0].visible, false);
  visuals.reset(); assert.equal(scene.children.length, 0); visuals.dispose();
});

test('sculpted skull and compact reaper share bounded geometry and release it only on disposal', () => {
  const scene = new THREE.Scene(), target = {id:'v',alive:true,position:new THREE.Vector3(),height:2.3};
  const visuals = createSoulMarkVisuals(scene,{targets:new Map([['v',target]])});
  visuals.update([{targetId:'v',count:3,remaining:1}]);
  const root=scene.children[0], reaper=root.getObjectByName('Sensenmann');
  assert.ok(reaper.isGroup && !reaper.isSprite);
  root.updateMatrixWorld(true);
  const size=new THREE.Box3().setFromObject(reaper).getSize(new THREE.Vector3());
  assert.ok(size.y>1.5 && size.y<2.5, 'the reaper is smaller than the former 3.8-metre sprite');
  const geometries=new Set();root.traverse(p=>{if(p.geometry)geometries.add(p.geometry);});
  let disposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  visuals.reset();assert.equal(disposed,0);
  visuals.update([{targetId:'v',count:1,remaining:8}]);
  scene.children[0].traverse(p=>{if(p.geometry)assert.ok(geometries.has(p.geometry));});
  visuals.dispose();assert.equal(disposed,geometries.size);
});
