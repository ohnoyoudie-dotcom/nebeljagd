import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createSunSpell, SUN_RULES } from '../src/sun-spell.js';
import { solarEnvelope } from '../src/sun-envelope.js';
import { createVision } from '../src/vision.js';

function fixture() {
  const scene = new THREE.Scene(), combat = createCombat();
  const world = { heightAt: () => 0, isLand: () => true,
    traceProjectile: (_start, end) => end.x === 2 ? { collider: { objectId: 'roof' } } : null };
  for (const [id, x] of [['enemy', 0], ['covered', 2], ['caster', 0]]) {
    combat.addTarget({ id, position: new THREE.Vector3(x, 0, 4), maxHealth: 100, concealed: true });
  }
  const spell = createSunSpell(scene, world, combat, 'caster');
  const position = new THREE.Vector3();
  spell.beginAim(position); spell.aimAt(position, { x: 0, z: 4 }); spell.update(3, position);
  assert.equal(spell.telemetry.aimRange.radius, SUN_RULES.range);
  spell.release({ damage: 24 });
  return { scene, combat, spell, position };
}
test('sunlight warns before damage, reveals grass targets, blinds them and respects roof cover', () => {
  const { combat, spell, position, scene } = fixture();
  const enemy = combat.targets.get('enemy');
  spell.update(.399, position); assert.equal(enemy.health, 100);
  assert.equal(spell.telemetry.visuals.damageEligible, false);
  assert.ok(spell.telemetry.visuals.brightness > 0);
  spell.update(.001, position); assert.equal(enemy.health, 97);
  assert.equal(spell.telemetry.visuals.phase, 'beam');
  assert.equal(spell.telemetry.visuals.damageEligible, true);
  assert.equal(enemy.blindRadius, 3); assert.ok(enemy.revealRemaining > 2);
  spell.update(SUN_RULES.duration + SUN_RULES.fade + .01, position);
  assert.equal(enemy.health, 76);
  assert.equal(combat.targets.get('covered').health, 100);
  assert.equal(combat.targets.get('caster').health, 100);
  assert.equal(spell.telemetry.pulses, 8); assert.equal(spell.busy, false);
  spell.dispose(); assert.equal(scene.children.length, 0);
});
test('coarse frames cannot add damage pulses, pause freezes effects, restart removes the beam', () => {
  const run = step => {
    const { combat, spell, position } = fixture();
    spell.update(0, position); assert.equal(spell.telemetry.age, 0);
    for (let time = 0; time < 4 - 1e-8; time += step) {
      combat.update(step); spell.update(step, position);
    }
    const health = combat.targets.get('enemy').health;
    spell.reset(); combat.reset();
    assert.equal(spell.telemetry.active, false); assert.equal(spell.telemetry.visuals.visible, false);
    assert.equal(combat.targets.get('enemy').blindRemaining, 0);
    spell.dispose(); return health;
  };
  assert.equal(run(.05), 76); assert.equal(run(4), 76);
});
test('blindness limits actor visibility immediately and clears without changing normal sight', () => {
  const scene = new THREE.Scene();
  const vision = createVision(scene, { spawn: { x: 0, z: 0 }, heightAt: () => 0, projectileObstacles: [] }, { radius: 30 });
  const near = { x: 2, z: 0 }, far = { x: 8, z: 0 };
  assert.equal(vision.isVisible(far), true);
  vision.setSightLimit(3); assert.equal(vision.isVisible(near), true); assert.equal(vision.isVisible(far), false);
  assert.equal(vision.isVisible(far, { local: true }), true);
  vision.setSightLimit(); assert.equal(vision.isVisible(far), true); assert.equal(vision.inspect().radius, 30);
  vision.dispose();
});
test('sun aiming rejects an invalid landing point instead of reusing the last valid target', () => {
  const scene = new THREE.Scene(), combat = createCombat(); let water = false;
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => water };
  const spell = createSunSpell(scene, world, combat, 'caster'), p = new THREE.Vector3();
  spell.beginAim(p); spell.update(3, p); water = true; spell.aimAt(p, {x: 3, z: 4});
  assert.equal(spell.release({damage: 24}), false); assert.equal(spell.aiming, false); assert.equal(spell.busy, false);
  spell.dispose();
});

test('brightness and damage use one threshold; the lingering fade cannot deal additional damage', () => {
  const {combat,spell,position}=fixture(), target=combat.targets.get('enemy');
  assert.ok(SUN_RULES.warning<.85);assert.ok(SUN_RULES.fade>=.8);
  assert.equal(solarEnvelope(SUN_RULES.warning-.001,SUN_RULES).damageEligible,false);
  const threshold=solarEnvelope(SUN_RULES.warning,SUN_RULES);
  assert.equal(threshold.brightness,threshold.damageThreshold);assert.equal(threshold.damageEligible,true);
  spell.update(SUN_RULES.warning+SUN_RULES.duration+.01,position);
  assert.equal(target.health,76);assert.equal(spell.telemetry.pulses,8);
  assert.equal(spell.telemetry.visuals.phase,'fade');assert.equal(spell.telemetry.visuals.damageEligible,false);
  const before=spell.telemetry.visuals;spell.update(0,position);assert.deepEqual(spell.telemetry.visuals,before);
  spell.update(SUN_RULES.fade,position);assert.equal(target.health,76);assert.equal(spell.busy,false);
  spell.dispose();
});

test('growing sunlight only hits inside its illuminated footprint, even when frames cross several pulses', () => {
  function run(coarse) {
    const {combat,spell,position}=fixture();
    const edge=combat.addTarget({id:'edge',position:new THREE.Vector3(2.5,0,4),maxHealth:100});
    const rim=combat.addTarget({id:'rim',position:new THREE.Vector3(3.05,0,4),maxHealth:100});
    if(coarse)spell.update(4,position);
    else {
      spell.update(.4,position);
      assert.ok(spell.telemetry.visuals.effectiveRadius<2.5);
      for(const target of [edge,rim]) {
        assert.equal(target.health,100);
        assert.ok(!(target.blindRemaining>0) && !(target.revealRemaining>0),'unlit targets get no status effects');
      }
      spell.update(.3,position);assert.equal(edge.health,97);assert.equal(rim.health,100);
      spell.update(.3,position);assert.equal(edge.health,94);assert.equal(rim.health,97);
      spell.update(3,position);
    }
    const healths=[edge.health,rim.health];spell.dispose();return healths;
  }
  assert.deepEqual(run(false),[79,82]);assert.deepEqual(run(true),[79,82]);
});
