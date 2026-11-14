import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createWeapons } from '../src/weapons.js';

function setup(worldExtra = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const combat = createCombat();
  const target = combat.addTarget({ id: 'victim', position: new THREE.Vector3(0, 0, 4),
    radius: .8, height: 2.3, maxHealth: 300 });
  const model = new THREE.Group(), geometry = new THREE.BoxGeometry(.1, 1.7, .1);
  geometry.translate(0, .5, 0);
  const material = new THREE.MeshStandardMaterial(); model.add(new THREE.Mesh(geometry, material));
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false,
    traceProjectile: () => null, concealmentAt: () => 0, ...worldExtra };
  const weapons = createWeapons(scene, actor, world, null, { combat,
    isVisible: (_p, options = {}) => !options.concealed,
    placements: [{ id: 'staff', kind: 'soulStaff', variant: 'kit-tripo-soul-staff', position: [0, 0], rarity: 'common' }],
    tripoPrototypes: { 'kit-tripo-soul-staff': model } });
  weapons.tryAutoPickup(actor.position);
  let time = 0;
  function tick(seconds) {
    for (let left = seconds; left > 1e-8; ) {
      const dt = Math.min(.02, left); time += dt; combat.update(dt);
      weapons.update(dt, time, actor.position); left -= dt;
    }
  }
  function shootUntilContact() {
    assert.ok(weapons.attack(actor.position, 0));
    for (let i = 0; i < 100 && !weapons.telemetry.effects.soulImpacts.active; i++) tick(.02);
    assert.equal(weapons.telemetry.effects.soulImpacts.active, 1, 'one swept contact creates one cloud burst');
  }
  return { scene, actor, combat, target, weapons, tick, shootUntilContact,
    dispose() { weapons.dispose(); geometry.dispose(); material.dispose(); } };
}

test('a real soul hit envelops its victim before the raised skull fragment fades in', t => {
  const s = setup(); t.after(() => s.dispose()); s.shootUntilContact();
  assert.equal(s.target.health, 300, 'the visual burst adds no direct damage');
  assert.equal(s.weapons.telemetry.soul.marks[0].count, 1);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.enveloping, 1);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.visible, 1);
  assert.equal(s.weapons.telemetry.effects.emitted.soulStaff.impacts, 1);
  assert.ok(s.weapons.telemetry.effects.bursts.every(b => b.kind !== 'impact'), 'no generic impact shock ring is added');
  let appearance = s.weapons.telemetry.soul.apparitions[0];
  assert.equal(appearance.markReveal, 0);
  assert.ok(appearance.height >= s.target.height + 2.2 - 1e-9, 'the skull clears the label and health bar');
  s.tick(.08); assert.equal(s.weapons.telemetry.soul.apparitions[0].markReveal, 0);
  s.tick(.08); appearance = s.weapons.telemetry.soul.apparitions[0];
  assert.ok(appearance.markReveal > 0 && appearance.markReveal < 1);
  s.tick(.12); assert.equal(s.weapons.telemetry.soul.apparitions[0].markReveal, 1);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.enveloping, 1);
  s.tick(.8); assert.equal(s.weapons.telemetry.effects.soulImpacts.active, 0);
  assert.equal(s.weapons.telemetry.soul.marks[0].count, 1, 'mist expiry does not consume the gameplay mark');
});

test('grass concealment hides the shroud and skull even without a target.concealed flag; reveal restores both', t => {
  const s = setup({ concealmentAt: (_x, z) => z > 3 ? 1 : 0 }); t.after(() => s.dispose());
  assert.equal(s.target.concealed, undefined);
  s.shootUntilContact(); s.tick(.28);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.visible, 0);
  assert.equal(s.weapons.telemetry.soul.apparitions[0].visible, false);
  s.target.revealRemaining = 1; s.tick(.02);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.visible, 1);
  assert.equal(s.weapons.telemetry.soul.apparitions[0].visible, true);
  s.target.revealRemaining = 0; s.tick(.02);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.visible, 0);
  assert.equal(s.weapons.telemetry.soul.apparitions[0].visible, false);
});

test('a wall creates only a small cloud puff; pause freezes it and reset removes all active effects', t => {
  const s = setup({ traceProjectile(a, b) {
    if (a.z < 2 && b.z >= 2) {
      const k = (2 - a.z) / (b.z - a.z);
      return { t: k, point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: 2 }, normal: { x: 0, y: 0, z: -1 } };
    }
    return null;
  } }); t.after(() => s.dispose());
  s.shootUntilContact(); s.tick(.12);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.enveloping, 0);
  assert.equal(s.weapons.telemetry.soul.marks.length, 0); assert.equal(s.target.health, 300);
  const puff = s.scene.children.find(p => p.name === 'Seelenwolke · Trefferhülle' && p.visible);
  assert.ok(puff && puff.scale.y < .7);
  const before = s.weapons.telemetry.effects, position = puff.position.clone(), scale = puff.scale.clone();
  s.weapons.update(0, 999, s.actor.position);
  assert.deepEqual(s.weapons.telemetry.effects, before);
  assert.deepEqual(puff.position, position); assert.deepEqual(puff.scale, scale);
  s.weapons.reset();
  assert.equal(s.weapons.telemetry.effects.soulImpacts.active, 0);
  assert.equal(s.weapons.telemetry.effects.soulImpacts.visible, 0);
  assert.equal(s.weapons.telemetry.effects.soulCloudProjectiles, 0);
  assert.equal(s.weapons.telemetry.soul.apparitions.length, 0);
});
