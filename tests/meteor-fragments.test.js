import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createMeteorSpell, METEOR_RULES } from '../src/meteor-spell.js';

function fixture(overrides = {}, options = {}) {
  let seed = 1234;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const caster = new THREE.Vector3(), combat = createCombat(), hits = [];
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false, traceProjectile: () => null, ...overrides };
  const spell = createMeteorSpell(new THREE.Scene(), world, combat, 'player', result => hits.push(result), null, { random, ...options });
  function cast() {
    spell.beginAim(caster); spell.aimAt(caster, new THREE.Vector3(0,0,12)); spell.update(3,caster);
    assert.equal(spell.release({ damage: 24 }), true);
    spell.update(spell.telemetry.flight.duration + .001, caster);
  }
  return { caster, combat, world, spell, hits, cast };
}

const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const speed = f => Math.hypot(f.velocity.x,f.velocity.z);

test('visible mini meteors fly, rebound, roll and rotate before their bounded lifetime ends', () => {
  const { spell,caster,cast } = fixture(); cast();
  spell.update(.6,caster);
  const flight = spell.telemetry.fragmentStates;
  assert.equal(flight.length,8);
  assert.ok(flight.every(f => f.active && f.phase === 'airborne' && f.position.y > f.diameter/2));
  assert.ok(flight.every(f => f.diameter >= .432 && f.diameter <= .648));
  spell.update(1.4,caster);
  const rolling = spell.telemetry.fragmentStates;
  assert.ok(rolling.some(f => f.active && f.phase === 'rolling'));
  assert.ok(rolling.every(f => f.bounces >= 1 && f.bounces <= 2));
  spell.update(.35,caster);
  const later = spell.telemetry.fragmentStates;
  assert.ok(later.some((f,i) => f.active && f.phase === 'rolling' && distance(f.position,rolling[i].position) > .05));
  assert.ok(later.some((f,i) => f.active && speed(f) < speed(rolling[i])));
  assert.ok(later.some((f,i) => JSON.stringify(f.orientation) !== JSON.stringify(rolling[i].orientation)));
  assert.ok(later.every(f => distance(f.position,{x:0,z:12}) < 8),'fragments remain around the impact, not lost far beyond the camera');
  const paused = spell.telemetry; spell.update(0,caster); assert.deepEqual(spell.telemetry,paused);
  spell.update(METEOR_RULES.fragmentLife - spell.telemetry.age + .05,caster);
  assert.equal(spell.telemetry.fragments,0);
  spell.reset(); assert.deepEqual(spell.telemetry.fragmentStates,[]); spell.dispose();
});

test('a shard survives a target impact visually, while direct hits and burn stay capped', () => {
  const { spell,combat,caster,cast,hits } = fixture();
  const enemy = combat.addTarget({id:'enemy',position:new THREE.Vector3(0,0,12),radius:1,height:3});
  const owner = combat.addTarget({id:'player',position:new THREE.Vector3(0,0,12),radius:1,height:3});
  cast(); spell.update(.25,caster);
  assert.equal(hits.filter(h => h.type==='meteor-fragment').length,1);
  assert.equal(enemy.health,73); assert.equal(enemy.burnRemaining,3); assert.equal(owner.health,100);
  assert.equal(spell.telemetry.fragments,8,'a target hit no longer deletes a visible fragment');
  spell.update(2.1,caster);
  assert.equal(hits.filter(h => h.type==='meteor-fragment').length,1);
  assert.ok(spell.telemetry.fragmentStates.some(f => f.active && f.phase==='rolling'));
  assert.equal(enemy.health,73);
  combat.update(3); assert.equal(enemy.health,67); assert.equal(owner.health,100);
  spell.dispose();
});

test('clearing an overlapping target cannot teleport a surviving shard through a thin wall', () => {
  const wall = { minX:1.05, maxX:1.15, minZ:-3, maxZ:3, minY:0, maxY:3 };
  const collision = createCollisionIndex([], [wall]);
  const { spell,combat,caster,hits } = fixture({ traceProjectile:(...args)=>collision.traceSegment(...args) }, { random:()=>0 });
  caster.set(0,0,-5);
  const enemy = combat.addTarget({ id:'enemy', position:new THREE.Vector3(), radius:1, height:3 });
  spell.beginAim(caster); spell.aimAt(caster,new THREE.Vector3()); spell.update(3,caster);
  assert.equal(spell.release({damage:24},null,{point:{x:0,y:0,z:0}}),true);
  spell.update(1/60,caster);
  const first = spell.telemetry.fragmentStates[0], incomingSide = wall.minX - first.diameter/2;
  assert.ok(first.active && first.position.x <= incomingSide,'target clearance stops before the wall');
  assert.ok(first.velocity.x < 0,'the blocked shard rebounds towards the incoming side');
  spell.update(.5,caster);
  const later = spell.telemetry.fragmentStates[0];
  assert.ok(later.active && later.position.x <= incomingSide,'the surviving shard remains on the incoming side');
  assert.equal(hits.filter(h=>h.type==='meteor-fragment').length,1);
  assert.equal(enemy.health,73); assert.equal(enemy.burnRemaining,3);
  spell.dispose();
});

test('rolling follows sloping ground and uses physical low-barrier collisions', () => {
  const heightAt=(x,z)=>x*.04+z*.025;
  const { spell,world,caster,cast } = fixture({heightAt}); cast(); spell.update(2,caster);
  const before=spell.telemetry.fragmentStates;
  const index=before.findIndex(f=>f.active && f.phase==='rolling' && f.velocity.x>.3);
  assert.ok(index>=0);
  const chosen=before[index], wallX=chosen.position.x+chosen.diameter/2+.025;
  let physicalChecks=0,contacts=0;
  world.traceProjectile=(a,b,radius,filter)=>{
    if(filter)return null; // Flight may clear this low barrier.
    physicalChecks++;
    if(a.x<=wallX-radius && b.x>=wallX-radius){
      contacts++; const t=(wallX-radius-a.x)/(b.x-a.x);
      return {t,point:{x:wallX-radius,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},normal:{x:-1,y:0,z:0}};
    }
    return null;
  };
  spell.update(.25,caster);
  const after=spell.telemetry.fragmentStates;
  assert.ok(physicalChecks>0 && contacts>0);
  assert.ok(after[index].position.x <= wallX-chosen.diameter/2);
  assert.ok(after[index].velocity.x<0,'rock rebounds from the low wall');
  for(const f of after.filter(f=>f.active && f.phase==='rolling'))assert.ok(Math.abs(f.position.y-heightAt(f.position.x,f.position.z)-f.diameter/2)<1e-8);
  spell.dispose();
});

test('rolling fragments extinguish on water rather than floating across it', () => {
  const { spell,world,caster,cast } = fixture(); cast(); spell.update(2,caster);
  const before=spell.telemetry.fragmentStates;
  const index=before.findIndex(f=>f.active && f.phase==='rolling'); assert.ok(index>=0);
  const point=before[index].position;
  world.isWater=(x,z)=>Math.hypot(x-point.x,z-point.z)<.4;
  spell.update(.02,caster);
  assert.equal(spell.telemetry.fragmentStates[index].active,false);
  assert.ok(spell.telemetry.fragmentStates.some(f=>f.active));
  spell.dispose();
});
