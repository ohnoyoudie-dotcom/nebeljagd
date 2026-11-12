import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCombat } from '../src/combat.js';
import { createMeteorSpell, METEOR_RULES as rules, meteorDiameter } from '../src/meteor-spell.js';
import { createMeteorVisuals, METEOR_VISUAL_BUDGET } from '../src/meteor-visuals.js';
import { SPECIAL_RULES } from '../src/special-weapons.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { validateWorldmap } from '../src/map/model.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { renderWorldmapSvg } from '../src/map/render.js';

function setup(overrides = {}) {
  const scene = new THREE.Scene(), combat = createCombat(), caster = new THREE.Vector3();
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false, traceProjectile: () => null, ...overrides };
  const hits = [], spell = createMeteorSpell(scene, world, combat, 'player', hit => hits.push(hit));
  const cast = (target = new THREE.Vector3(0, 0, 12)) => {
    assert.equal(spell.beginAim(caster, 0), true); spell.aimAt(caster, target); spell.update(3, caster);
    assert.equal(spell.release({ damage: 24 }), true);
  };
  return { scene, combat, caster, world, hits, spell, cast };
}

test('meteor grows continuously on a high arc and uses exactly the poison area radius', () => {
  const { spell, caster, cast } = setup(); cast();
  assert.equal(rules.radius, SPECIAL_RULES.cloudRadius);
  assert.equal(spell.telemetry.flight.diameter, rules.startDiameter);
  const duration = spell.telemetry.flight.duration;
  spell.update(duration / 2, caster);
  const mid = spell.telemetry.flight;
  assert.ok(mid.position.y > 8); assert.ok(mid.diameter > 2 && mid.diameter < 3);
  spell.update(duration * .35, caster);
  assert.ok(spell.telemetry.flight.diameter > mid.diameter);
  assert.ok(spell.telemetry.flight.position.y < mid.position.y);
  const paused = spell.telemetry; spell.update(0, caster); assert.deepEqual(spell.telemetry, paused);
  spell.update(duration, caster); assert.equal(spell.telemetry.phase, 'impact');
  assert.equal(meteorDiameter(1), 4.2); assert.equal(meteorDiameter(-1), .45);
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
  assert.ok(Math.abs(spell.telemetry.center.z-12)<.01); assert.ok(largestRadius>2);
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
