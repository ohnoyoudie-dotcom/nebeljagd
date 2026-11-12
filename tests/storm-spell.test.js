import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createStormSpell, STORM_RULES } from '../src/storm-spell.js';
import { createGravitySpell } from '../src/gravity-spell.js';

function setup({ visible = () => true, blocked = false } = {}) {
  const scene = new THREE.Scene(), combat = createCombat();
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false,
    traceProjectile: () => blocked ? { t: .5, point: { x: 0, y: 2, z: 0 } } : null };
  const storm = createStormSpell(scene, world, combat, 'caster', undefined, visible);
  const origin = new THREE.Vector3();
  const target = combat.addTarget({ id: 'enemy', position: new THREE.Vector3(1, 0, 0) });
  function cast() { storm.beginAim(origin); storm.aimAt(origin, origin); storm.release({ damage: 23 }); }
  return { scene, combat, world, storm, origin, target, cast };
}

test('storm shares the 3s / 20m charge, keeps a fixed area and supports pause and cancellation', () => {
  const { storm, origin, scene } = setup();
  storm.beginAim(origin); storm.aimAt(origin, { x: 100, z: 0 }); storm.update(1.5, origin);
  assert.equal(storm.telemetry.aim.x, 10); assert.equal(storm.telemetry.radius, 4.8);
  const before = storm.telemetry; storm.update(0, origin); assert.deepEqual(storm.telemetry, before);
  storm.update(1.5, origin); assert.equal(storm.telemetry.aim.x, 20);
  storm.aimAt(origin, { x: 2, z: 0 }); assert.equal(storm.telemetry.aim.x, 2);
  storm.cancelAim(); assert.equal(storm.release({ damage: 23 }), false);
  storm.beginAim(origin); assert.equal(storm.telemetry.aimRange.radius, 0);
  storm.dispose(); assert.equal(scene.children.length, 0);
});

test('five intermittent strikes distribute equipped damage, stun briefly, spare outsiders and clean up', () => {
  const { storm, combat, origin, target, cast } = setup();
  const outside = combat.addTarget({ id: 'outside', position: new THREE.Vector3(4.81, 0, 0) });
  const owner = combat.addTarget({ id: 'caster', position: origin });
  const prop = combat.addTarget({ id: 'crate', position: origin, destructible: true });
  cast(); assert.equal(storm.beginAim(origin), false);
  storm.update(.6, origin);
  // A fade-out ramp must not amplify opacity before its starting time.
  // Otherwise the compact cloud and subtle outline become opaque white discs.
  assert.ok(target.stunRemaining > .39); assert.equal(target.speedMultiplier, 0); assert.equal(target.canAct, false);
  assert.ok(Math.abs(target.health - 95.4) < 1e-9);
  combat.update(.41); assert.equal(target.speedMultiplier, 1); assert.equal(target.canAct, true);
  storm.update(3, origin);
  assert.equal(storm.telemetry.pulses, 5); assert.ok(Math.abs(target.health - 77) < 1e-8);
  assert.equal(target.stunRemaining, 0, 'expired strikes in a coarse update cannot add a fresh stun');
  assert.equal(outside.health, 100); assert.equal(owner.health, 100); assert.equal(prop.health, 100);
  assert.equal(storm.telemetry.active, false); assert.equal(storm.telemetry.visuals.bolts, 0);
  storm.dispose();
});

test('the active cloud and outline never amplify their designed transparency', () => {
  const { storm, scene, origin, cast } = setup(); cast();
  for (const dt of [.1, .5, 1, 1, .7, .2]) {
    storm.update(dt, origin);
    for (const name of ['Gewitterauge · plastische Gewitterwolke', 'Gewitter · dezente Wirkungsfläche']) {
      const opacity = scene.getObjectByName(name).material.uniforms.uOpacity.value;
      assert.ok(opacity >= 0 && opacity <= 1, `${name}: ${opacity}`);
    }
  }
  storm.dispose();
});

test('cover blocks descending strikes, fog hides visuals without changing combat, buffers stay bounded', () => {
  const blocked = setup({ blocked: true }); blocked.cast(); blocked.storm.update(1, blocked.origin);
  assert.equal(blocked.target.health, 100); assert.equal(blocked.target.stunRemaining, 0); blocked.storm.dispose();
  const s = setup({ visible: () => false }); s.cast(); s.storm.update(.6, s.origin);
  assert.ok(s.target.health < 100); assert.equal(s.storm.telemetry.visuals.visible, false);
  assert.equal(s.storm.telemetry.visuals.bolts, 0); s.storm.dispose();
  const many = setup();
  for (let i = 0; i < 40; i++) many.combat.addTarget({ id: 'extra'+i, position: new THREE.Vector3() });
  many.cast(); many.storm.update(.6, many.origin);
  assert.equal(many.storm.telemetry.hits, 41); assert.equal(many.storm.telemetry.visuals.bolts, 24);
  many.storm.reset(); assert.equal(many.storm.telemetry.visuals.bolts, 0); many.storm.dispose();
});

test('stun refresh, slow recovery, defeat and reset have independent status lifetimes', () => {
  const c = createCombat(), t = c.addTarget({ id: 't', position: new THREE.Vector3() });
  c.hit(t, { stun: .4, slow: { duration: 2, multiplier: .5 } }); c.update(.2);
  c.hit(t, { stun: .4 }); c.update(.3); assert.equal(t.canAct, false);
  c.update(.2); assert.equal(t.speedMultiplier, .5);
  c.hit(t, { stun: .4, damage: 100 }); assert.equal(t.stunRemaining, 0); assert.equal(t.canAct, false);
  c.reset(); assert.equal(t.canAct, true); assert.equal(t.stunRemaining, 0);
});

test('gravity target crosses solid cover and remains visible; flight still collides with the wall', () => {
  const { scene, combat, origin, world, storm } = setup({ blocked: true }); storm.dispose();
  const gravity = createGravitySpell(scene, world, combat, 'caster', undefined, () => false);
  gravity.beginAim(origin); gravity.aimAt(origin, { x: 0, z: 15 }); gravity.update(3, origin);
  assert.equal(gravity.telemetry.aim.z, 15);
  const visibleRings = []; scene.traverseVisible(p => { if (p.geometry?.type === 'RingGeometry' || p.userData.areaRadius) visibleRings.push(p); });
  assert.ok(visibleRings.length >= 2, 'target and reach rings stay visible behind cover');
  gravity.release({ damage: 14 }); gravity.update(.2, origin);
  assert.equal(gravity.telemetry.flight, null); assert.equal(gravity.telemetry.center.z, 0);
  gravity.dispose();
});
