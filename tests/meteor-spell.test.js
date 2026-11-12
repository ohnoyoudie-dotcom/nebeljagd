import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCombat } from '../src/combat.js';
import { createMeteorSpell, METEOR_RULES as rules, meteorDiameter } from '../src/meteor-spell.js';
import { createMeteorVisuals, METEOR_VISUAL_BUDGET } from '../src/meteor-visuals.js';
import { HOURGLASS_RULES } from '../src/hourglass-spell.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { validateWorldmap } from '../src/map/model.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { renderWorldmapSvg } from '../src/map/render.js';

function setup(overrides = {}, options = {}) {
  const scene = new THREE.Scene(), combat = createCombat(), caster = new THREE.Vector3();
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false, traceProjectile: () => null, ...overrides };
  const hits = [], spell = createMeteorSpell(scene, world, combat, 'player', hit => hits.push(hit), null, options);
  const cast = (target = new THREE.Vector3(0, 0, 12)) => {
    assert.equal(spell.beginAim(caster, 0), true); spell.aimAt(caster, target); spell.update(3, caster);
    assert.equal(spell.release({ damage: 24 }), true);
  };
  return { scene, combat, caster, world, hits, spell, cast };
}

test('meteor grows continuously on a high arc and stays person-sized and uses the hourglass area radius', () => {
  const { spell, caster, cast } = setup(); cast();
  assert.equal(rules.radius, HOURGLASS_RULES.radius);
  assert.equal(spell.telemetry.flight.diameter, rules.startDiameter);
  const duration = spell.telemetry.flight.duration;
  spell.update(duration / 2, caster);
  const mid = spell.telemetry.flight;
  assert.ok(mid.position.y > 8); assert.ok(mid.diameter > 1 && mid.diameter < 1.2);
  spell.update(duration * .35, caster);
  assert.ok(spell.telemetry.flight.diameter > mid.diameter);
  assert.ok(spell.telemetry.flight.position.y < mid.position.y);
  const paused = spell.telemetry; spell.update(0, caster); assert.deepEqual(spell.telemetry, paused);
  spell.update(duration, caster); assert.equal(spell.telemetry.phase, 'impact');
  assert.equal(meteorDiameter(1), 1.75); assert.equal(meteorDiameter(-1), .45);
  spell.dispose();
});

test('impact hits once, fragments hit a target at most once and apply bounded burn without self damage', () => {
  const { spell, combat, caster, cast, hits } = setup();
  const target = combat.addTarget({ id: 'enemy', position: new THREE.Vector3(.3, 0, 12), radius: .8 });
  const owner = combat.addTarget({ id: 'player', position: new THREE.Vector3(0, 0, 12), radius: .8 });
  cast(); spell.update(spell.telemetry.flight.duration + .4, caster);
  assert.equal(hits.filter(h => h.type === 'meteor').length, 1);
  assert.equal(hits.filter(h => h.type === 'meteor-fragment').length, 1);
  assert.equal(target.health, 73); assert.equal(owner.health, 100); assert.equal(target.burnRemaining, 3);
  combat.update(10); assert.equal(target.health, 67); assert.equal(target.burnRemaining, 0);
  spell.update(10, caster); assert.equal(spell.telemetry.active, false); assert.equal(target.health, 67);
  assert.equal(spell.telemetry.visuals.draws, 0); spell.dispose();
});

test('growing physical flight is swept against tall walls and blast damage cannot cross them', () => {
  const trace = (a, b, radius) => {
    if (a.z < 6 - radius && b.z >= 6 - radius) {
      const t = (6 - radius - a.z) / (b.z - a.z);
      return { t, point: { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, z: 6-radius }, normal: { x:0,y:0,z:-1 } };
    }
    return null;
  };
  const { spell, combat, caster, cast } = setup({ traceProjectile: trace });
  const behind = combat.addTarget({ id: 'behind-wall', position: new THREE.Vector3(0,0,7) });
  cast(); spell.update(3, caster);
  assert.ok(spell.telemetry.center.z < 6); assert.equal(behind.health, 100);
  spell.dispose();
});

test('meteor collision radius grows and actual arc clears a low prop instead of a flat aiming ray', () => {
  let largestRadius = 0;
  const { spell, caster, cast } = setup({ traceProjectile(a,b,radius) {
    largestRadius = Math.max(largestRadius, radius);
    if (a.z < 6 && b.z >= 6 && Math.min(a.y,b.y)-radius < 1) return { t:.5,point:{x:0,y:1,z:6} };
    return null;
  } });
  cast(); spell.update(spell.telemetry.flight.duration + .01, caster);
  assert.ok(Math.abs(spell.telemetry.center.z-12)<.01); assert.ok(largestRadius>.85 && largestRadius<=.875);
  spell.dispose();
});

test('meteor aim can be cancelled, rejects water and cannot cast twice or continue after reset', () => {
  const { spell, caster, world, cast } = setup();
  spell.beginAim(caster,0); spell.update(1.5,caster);
  assert.equal(spell.telemetry.aimRange.radius,10); spell.cancelAim(); assert.equal(spell.release({damage:24}),false);
  world.isWater=()=>true; spell.beginAim(caster,0); assert.equal(spell.release({damage:24}),false);
  world.isWater=()=>false; cast(); assert.equal(spell.release({damage:24}),false); assert.equal(spell.beginAim(caster,0),false);
  spell.reset(); assert.equal(spell.telemetry.active,false); assert.equal(spell.telemetry.visuals.draws,0); assert.equal(spell.telemetry.casts,0);
  cast(); spell.update(6,caster); assert.equal(spell.telemetry.active,false); spell.dispose();
});

test('meteor effects use fixed pools, respect visibility and dispose only owned resources', () => {
  const scene = new THREE.Scene(), geometry = new THREE.IcosahedronGeometry(.5), material = new THREE.MeshBasicMaterial({color:'#e98d33'});
  let sharedDisposals=0; geometry.addEventListener('dispose',()=>sharedDisposals++); material.addEventListener('dispose',()=>sharedDisposals++);
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry,material));
  const v=createMeteorVisuals(scene,rules,{prototype,isVisible:()=>false});
  const resources=[];scene.traverse(o=>{if(o.geometry&&o.geometry!==geometry)resources.push(o.geometry);});
  const arrays=resources.flatMap(g=>Object.values(g.attributes).map(a=>({a,array:a.array})));
  for(let i=0;i<300;i++){v.flight(new THREE.Vector3(0,5,0),3,i/60);v.update(1/60);}
  assert.equal(v.telemetry.draws,0); assert.ok(v.telemetry.puffs<=METEOR_VISUAL_BUDGET.puffs);
  for(const {a,array} of arrays)assert.equal(a.array,array);
  v.dispose();v.dispose();assert.equal(sharedDisposals,0);assert.equal(scene.children.length,0);
  geometry.dispose();material.dispose();
});

test('uploaded meteor staff is preserved, textured, visible in the editor and roundtrips as its own variant', () => {
  const report=JSON.parse(readFileSync('assets/imported/tripo-meteor-staff/inspections/meteor-staff.json'));
  for(const file of [report.source,report.runtime])assert.equal(createHash('sha256').update(readFileSync(file.path)).digest('hex'),file.sha256);
  const bytes=readFileSync(report.runtime.path),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.ok(report.runtime.triangles<=6000&&report.runtime.bytes<400000);
  for(const mesh of doc.meshes)for(const p of mesh.primitives){assert.ok(p.attributes.NORMAL!==undefined);assert.ok(p.attributes.TEXCOORD_0!==undefined);}
  assert.ok(doc.materials.some(m=>m.pbrMetallicRoughness?.baseColorTexture));
  const schema=JSON.parse(readFileSync('worldmap.schema.json'));
  assert.ok(schema.$defs.worldObject.properties.kind.enum.includes('meteorStaff'));
  assert.ok(schema.$defs.worldObject.allOf.some(r=>r.if?.properties?.kind?.const==='meteorStaff'&&r.then.properties.variant.enum.includes('kit-tripo-meteor-staff')));
  const map=JSON.parse(readFileSync('worldmap.json')), before=JSON.stringify(map.objects);
  map.objects.push(makeWorldObject('meteorStaff',[30,-42],{id:'meteor-test'}));
  assert.equal(validateWorldmap(map).valid,true);
  assert.equal(normalizeWorldmap(JSON.parse(JSON.stringify(map))).objects.at(-1).variant,'kit-tripo-meteor-staff');
  assert.equal(JSON.stringify(map.objects.slice(0,-1)),before);
  assert.ok(renderWorldmapSvg(map).includes('id="world-object-meteorStaff"'));
  assert.equal(getVariantAsset('meteorStaff','kit-tripo-meteor-staff').format,'glb');
});

test('meteor archive and extracted original remain pinned alongside the bounded runtime package', () => {
  const root = 'assets/imported/tripo-meteor-projectile/';
  const manifest = JSON.parse(readFileSync(root + 'runtime-manifest.json'));
  assert.deepEqual(manifest.sources.map(s => s.path).sort(), ['assets/inbox/Meteor Projektil.glb', 'assets/inbox/Meteor Projektil.rar']);
  for (const source of manifest.sources) assert.equal(createHash('sha256').update(readFileSync(source.path)).digest('hex'), source.sha256);
  for (const file of manifest.files) assert.equal(createHash('sha256').update(readFileSync(root + file.path)).digest('hex'), file.sha256);
});


test('fragment scatter varies per cast, has unequal trajectories and bounces only once', () => {
  let seed = 1234;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const { spell, caster, cast } = setup({}, { random });
  cast(); spell.update(spell.telemetry.flight.duration + .001, caster);
  const first = spell.telemetry.fragmentStates;
  assert.equal(first.length, 6);
  assert.equal(new Set(first.map(f => f.velocity.y)).size, 6);
  assert.equal(new Set(first.map(f => f.diameter)).size, 6);
  assert.ok(first.every(f => f.diameter >= .24 && f.diameter <= .448));
  let bounced = false;
  for (let i=0;i<80;i++) {
    spell.update(.02, caster);
    bounced ||= spell.telemetry.fragmentStates.some(f => f.active && f.bounces === 1);
    assert.ok(spell.telemetry.fragmentStates.every(f => f.bounces <= 2));
  }
  assert.ok(bounced, 'at least one shard visibly rebounds from the ground');
  assert.equal(spell.telemetry.fragments, 0);
  spell.update(rules.aftermath + .1, caster); cast(); spell.update(spell.telemetry.flight.duration + .001, caster);
  assert.notDeepEqual(spell.telemetry.fragmentStates, first);
  spell.dispose();
});

test('smaller blast leaves targets outside the hourglass radius untouched', () => {
  const { spell, combat, caster, cast } = setup();
  const outside = combat.addTarget({ id:'outside', position:new THREE.Vector3(4,0,12), radius:.1 });
  cast(); spell.update(spell.telemetry.flight.duration + .001, caster);
  assert.equal(outside.health,100); spell.dispose();
});

test('mini meteors reuse uploaded geometry and lava material; fire blooms and cleans up', () => {
  const scene = new THREE.Scene(), geometry = new THREE.IcosahedronGeometry(.5), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map:texture });
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry,material));
  let sharedDisposals = 0;
  for (const resource of [geometry,material,texture]) resource.addEventListener('dispose',()=>sharedDisposals++);
  const v = createMeteorVisuals(scene,rules,{prototype});
  v.impact(new THREE.Vector3());
  v.fragments([{active:true,position:new THREE.Vector3(1,.5,0),age:.2,radius:.16,spin:new THREE.Vector3(3,4,5)}]);
  v.update(.2);
  const chip = scene.getObjectByName('Meteorstab · kleine Meteorsplitter');
  assert.equal(chip.geometry,geometry); assert.equal(chip.material.map,texture); assert.equal(chip.material.emissiveMap,texture);
  assert.equal(v.telemetry.fragments,1); assert.equal(v.telemetry.fragmentModel,'uploaded');
  assert.ok(v.telemetry.fire > 0 && v.telemetry.fire <= METEOR_VISUAL_BUDGET.fire);
  const before=v.telemetry; v.update(0); assert.deepEqual(v.telemetry,before);
  v.update(1); assert.equal(v.telemetry.fire,0);
  v.reset(); assert.equal(v.telemetry.draws,0);
  v.dispose(); assert.equal(sharedDisposals,0);
  geometry.dispose(); material.dispose(); texture.dispose();
});


test('ground fire ignites late entrants, refreshes one burn, respects pause and expires', () => {
  const { spell, combat, caster, cast } = setup();
  cast(); spell.update(spell.telemetry.flight.duration + 1.7, caster);
  assert.equal(spell.telemetry.fragments,0);
  assert.equal(spell.telemetry.groundFire.active,true);
  assert.equal(spell.telemetry.visuals.groundFire.visible,true);
  const target=combat.addTarget({id:'late',position:new THREE.Vector3(0,0,12)});
  const owner=combat.addTarget({id:'player',position:new THREE.Vector3(0,0,12)});
  spell.update(.21,caster);
  assert.equal(target.burnRemaining,3);assert.equal(owner.burnRemaining,0);
  assert.equal(target.health,100);assert.equal(target.burnSourceId,'player');
  for(let i=0;i<20;i++){combat.update(.05);spell.update(.05,caster);}
  assert.ok(Math.abs(target.health-98)<1e-8,'one 2 DPS stream, not stacked field/fragment damage');
  assert.ok(target.burnRemaining>2.7);
  const frozen=spell.telemetry;spell.update(0,caster);assert.deepEqual(spell.telemetry,frozen);
  target.position.x=10;
  const remaining=target.burnRemaining;
  for(let i=0;i<10;i++){combat.update(.05);spell.update(.05,caster);}
  assert.ok(Math.abs(target.burnRemaining-(remaining-.5))<1e-8,'leaving stops burn refresh');
  spell.update(10,caster);assert.equal(spell.telemetry.groundFire,null);assert.equal(spell.telemetry.visuals.draws,0);
  combat.update(10);assert.equal(target.burnRemaining,0);spell.dispose();
});

test('ground fire cannot ignite through walls, across water, above the ground or after expiry', () => {
  const { spell,combat,caster,cast,world }=setup();
  cast();spell.update(spell.telemetry.flight.duration+1.7,caster);
  const blocked=combat.addTarget({id:'wall',position:new THREE.Vector3(1,0,12)});
  const wet=combat.addTarget({id:'water',position:new THREE.Vector3(-1,0,12)});
  const high=combat.addTarget({id:'high',position:new THREE.Vector3(0,3,12)});
  world.traceProjectile=(a,b)=>b.x>.5?{point:b,collider:{}}:null;
  world.isWater=x=>x<-.5;
  spell.update(.3,caster);
  for(const target of [blocked,wet,high])assert.equal(target.burnRemaining,0);
  spell.update(rules.groundFireSeconds-spell.telemetry.age+.05,caster);
  assert.equal(spell.telemetry.groundFire.active,false);
  const late=combat.addTarget({id:'expired',position:new THREE.Vector3(0,0,12)});
  spell.update(.1,caster);assert.equal(late.burnRemaining,0);
  spell.reset();assert.equal(spell.telemetry.visuals.draws,0);spell.dispose();
});

test('a random mini meteor ignites a hit outside the burning ground independently', () => {
  const { spell,combat,caster,cast }=setup({}, {random:()=>.99});
  cast();spell.update(spell.telemetry.flight.duration+.7,caster);
  const f=spell.telemetry.fragmentStates.find(f=>f.active && Math.hypot(f.position.x,f.position.z-12)>3.8);
  assert.ok(f,'a shard has left the ground-fire radius');
  const target=combat.addTarget({id:'shard-only',position:new THREE.Vector3(f.position.x,0,f.position.z),height:3,radius:.3});
  spell.update(.05,caster);
  assert.equal(target.health,97);assert.equal(target.burnRemaining,3);assert.equal(target.burnSourceId,'player');
  assert.ok(spell.telemetry.fragmentHitIds.includes(target.id));
  combat.update(2);assert.equal(target.health,93);assert.equal(target.burnRemaining,1);
  spell.dispose();
});
