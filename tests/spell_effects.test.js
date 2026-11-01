import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createSpellEffects } from '../src/spell-effects.js';
import { weaponStats } from '../src/loot-tiers.js';

function setup({ type = 'fireStaff', targetZ = null, wallZ = null } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const combat = createCombat();
  const target = targetZ === null ? null : combat.addTarget({
    id: 'tall-practice-target', position: { x: 0, y: 0, z: targetZ }, height: 3.4, radius: .65, maxHealth: 500,
  });
  const collision = createCollisionIndex([], wallZ === null ? [] : [{
    minX: -20, maxX: 20, minZ: wallZ, maxZ: wallZ + .1, minY: 0, maxY: 4, type: 'wall',
  }]);
  const world = { worldRadius: 500, heightAt: () => 0,
    traceProjectile: (start, end, radius) => collision.traceSegment(start, end, radius) };
  const other = type === 'fireStaff' ? 'iceStaff' : 'fireStaff';
  const weapons = createWeapons(scene, actor, world, null, { combat, placements: [
    { id: 'first', kind: type, rarity: 'rare', position: [0, 0] },
    { id: 'second', kind: other, rarity: 'common', position: [3, 0] },
  ] });
  assert.equal(weapons.interact(actor.position).type, type);
  let time = 0;
  function step(seconds = .02) { time += seconds; weapons.update(seconds, time, actor.position); }
  function until(predicate, message, limit = 120) {
    for (let i = 0; i < limit && !predicate(); i++) step();
    assert.ok(predicate(), message);
  }
  return { scene, actor, combat, target, weapons, step, until };
}

test('fire and ice target hits emit their own visible impact without applying damage twice', () => {
  for (const type of ['fireStaff', 'iceStaff']) {
    const { actor, target, weapons, step, until } = setup({ type, targetZ: 6 });
    weapons.attack(actor.position, 0);
    until(() => weapons.telemetry.damageHits === 1, `${type} reaches the target`);
    const state = weapons.telemetry, expected = weaponStats(type, 'rare');
    assert.equal(target.health, 500 - expected.damage);
    assert.equal(type === 'fireStaff' ? target.burnRemaining : target.slowRemaining,
      type === 'fireStaff' ? expected.burn.duration : expected.slow.duration);
    assert.equal(state.effects.emitted[type].launches, 1);
    assert.equal(state.effects.emitted[type].impacts, 1);
    assert.equal(state.effects.latestImpact.type, type);
    assert.equal(state.effects.latestImpact.point.y, state.lastSpellLaunch.position.y,
      'the tall target is hit at the original crystal height');
    assert.ok(state.effects.bursts.some(burst => burst.kind === 'impact' && burst.type === type && burst.visible));
    assert.equal(state.spellsActive, 0, 'the damaging projectile ends while its independent impact remains');
    assert.ok(state.effects.activeParticles > 0);
    for (let i = 0; i < 50; i++) step();
    assert.equal(target.health, 500 - expected.damage, 'the fading burst never becomes a second hit');
    assert.equal(weapons.telemetry.effects.emitted[type].impacts, 1);
    assert.equal(weapons.telemetry.effects.activeBursts, 0);
    assert.equal(weapons.telemetry.effects.activeParticles, 0);
    weapons.dispose();
  }
});

test('a wall between the body and staff muzzle produces one surface impact and blocks target damage', () => {
  const { actor, target, weapons, step, until } = setup({ targetZ: 4, wallZ: .5 });
  weapons.attack(actor.position, 0);
  until(() => weapons.telemetry.shotsFired === 1, 'the charged spell releases');
  const state = weapons.telemetry;
  assert.equal(state.damageHits, 0);
  assert.equal(target.health, 500);
  assert.equal(state.spellsActive, 0, 'the release sweep catches the near wall immediately');
  assert.equal(state.effects.emitted.fireStaff.impacts, 1);
  assert.ok(Math.abs(state.effects.latestImpact.point.z - (.5 - .13)) < 1e-7);
  const launch = state.lastSpellLaunch;
  const fraction = (state.effects.latestImpact.point.z - launch.bodyOrigin.z) / (launch.position.z - launch.bodyOrigin.z);
  const expectedY = launch.bodyOrigin.y + (launch.position.y - launch.bodyOrigin.y) * fraction;
  assert.ok(Math.abs(state.effects.latestImpact.point.y - expectedY) < 1e-7,
    'the near wall is hit on the actual body-to-crystal segment');
  for (let i = 0; i < 80; i++) step();
  assert.equal(target.health, 500);
  assert.equal(weapons.telemetry.effects.emitted.fireStaff.impacts, 1);
  weapons.dispose();
});

test('switching to ice while a fire projectile flies preserves both effects and the original fire hit', () => {
  const { actor, target, weapons, step, until } = setup({ targetZ: 12 });
  weapons.attack(actor.position, 0);
  until(() => weapons.telemetry.shotsFired === 1, 'fire releases');
  actor.position.x = 3;
  assert.equal(weapons.interact(actor.position).type, 'iceStaff');
  weapons.attack(actor.position, 0);
  until(() => weapons.telemetry.shotsFired === 2, 'ice releases while fire still flies');
  assert.deepEqual(new Set(weapons.telemetry.spells.map(spell => spell.type)), new Set(['fireStaff', 'iceStaff']));
  assert.equal(weapons.telemetry.effects.emitted.fireStaff.launches, 1);
  assert.equal(weapons.telemetry.effects.emitted.iceStaff.launches, 1);
  until(() => weapons.telemetry.damageHits === 1, 'the earlier fire spell reaches its original target');
  assert.equal(weapons.equipped, 'iceStaff');
  assert.equal(weapons.telemetry.effects.latestImpact.type, 'fireStaff');
  assert.equal(weapons.telemetry.effects.emitted.fireStaff.impacts, 1);
  assert.equal(weapons.telemetry.effects.emitted.iceStaff.impacts, 0);
  assert.equal(target.health, 500 - weaponStats('fireStaff', 'rare').damage);
  assert.equal(target.burnRemaining, 3);
  assert.equal(target.slowRemaining, 0);
  for (let i = 0; i < 80; i++) step();
  assert.equal(weapons.telemetry.effects.activeProjectiles, 0);
  weapons.dispose();
});

test('rolling or changing weapons during channeling cancels the effect without releasing a spell', () => {
  for (const cancel of ['roll', 'swap']) {
    const { actor, weapons, step } = setup();
    weapons.attack(actor.position, 0); step(.1);
    assert.equal(weapons.telemetry.effects.channelActive, true);
    assert.equal(weapons.telemetry.effects.channelVisible, true);
    if (cancel === 'roll') actor.userData.rolling = true;
    else { actor.position.x = 3; weapons.interact(actor.position); }
    step(); actor.userData.rolling = false;
    assert.equal(weapons.telemetry.effects.channelActive, false);
    for (let i = 0; i < 40; i++) step();
    assert.equal(weapons.telemetry.shotsFired, 0, cancel);
    assert.equal(weapons.telemetry.effects.emitted.fireStaff.launches, 0, cancel);
    assert.equal(weapons.telemetry.effects.activeProjectiles, 0);
    assert.equal(weapons.telemetry.effects.activeParticles, 0);
    weapons.dispose();
  }
});

test('paused updates do not emit or age effects and restart clears every active effect', () => {
  const { actor, weapons, step, until } = setup();
  weapons.attack(actor.position, 0); step(.1);
  for (let i = 0; i < 8; i++) weapons.update(0, 100 + i, actor.position);
  assert.equal(weapons.telemetry.effects.channelActive, true);
  assert.equal(weapons.telemetry.shotsFired, 0);
  until(() => weapons.telemetry.shotsFired === 1, 'unpausing releases exactly one spell');
  const effects = weapons.telemetry.effects, spells = weapons.telemetry.spells;
  assert.ok(effects.activeParticles > 0 && effects.activeBursts > 0);
  for (let i = 0; i < 12; i++) weapons.update(0, 200 + i, actor.position);
  assert.deepEqual(weapons.telemetry.effects, effects, 'paused frames cannot fill the particle pool or expire the flash');
  assert.deepEqual(weapons.telemetry.spells, spells);
  weapons.reset();
  const cleared = weapons.telemetry;
  assert.equal(cleared.spellsActive, 0);
  assert.equal(cleared.effects.activeProjectiles, 0);
  assert.equal(cleared.effects.activeParticles, 0);
  assert.equal(cleared.effects.activeBursts, 0);
  assert.equal(cleared.effects.channelActive, false);
  assert.equal(cleared.effects.latestImpact, null);
  assert.equal(cleared.effects.emitted.fireStaff.launches, 0);
  assert.equal(weapons.equipped, null);
  assert.ok(weapons.items.every(item => !item.collected));
  step(.2);
  assert.equal(weapons.telemetry.effects.activeParticles, 0);
  weapons.dispose();
});

test('repeated overlapping spells reuse bounded VFX pools and dispose their resources once', () => {
  const scene = new THREE.Scene(), effects = createSpellEffects(scene);
  const visual = effects.createProjectile(), point = new THREE.Vector3(0, 1.4, 0);
  const nodes = () => { let count = 0; scene.traverse(() => count++); return count; };
  const initialNodes = nodes();
  for (let i = 0; i < 100; i++) {
    const type = i % 2 ? 'iceStaff' : 'fireStaff';
    effects.launch(visual, type, point, 0);
    effects.fire(type, point, 0);
    effects.advance(visual, point, new THREE.Vector3(0, 1.4, 2), .1, i / 10);
    effects.end(visual);
    effects.impact(type, point, { x: 0, y: 0, z: -1 }, 0);
  }
  effects.channel('iceStaff', point, 0, .5); effects.update(.01, 10);
  const state = effects.telemetry;
  assert.equal(nodes(), initialNodes, 'casting does not append scene objects');
  assert.ok(state.activeParticles > 0 && state.activeParticles <= state.capacity.particles);
  assert.ok(state.activeBursts > 0 && state.activeBursts <= state.capacity.bursts);
  assert.deepEqual(state.emitted, { fireStaff: { launches: 50, impacts: 50 }, iceStaff: { launches: 50, impacts: 50 } });
  const resources = new Set();
  scene.traverse(object => {
    if (object.geometry && !object.isSprite) resources.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  const disposals = new Map();
  for (const resource of resources) resource.addEventListener('dispose', () => disposals.set(resource, (disposals.get(resource) ?? 0) + 1));
  effects.dispose(); effects.dispose();
  assert.equal(scene.children.length, 0);
  for (const resource of resources) assert.equal(disposals.get(resource), 1, `${resource.type ?? 'geometry'} disposed exactly once`);
  assert.equal(effects.telemetry.activeParticles, 0);
  assert.equal(effects.telemetry.activeBursts, 0);
  assert.equal(effects.telemetry.channelActive, false);
});

test('fog hides projectiles, charge, release connectors and impact particles at their own positions', () => {
  let reveal = false;
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, { isVisible: point => reveal || point.x < 0 });
  const left = new THREE.Vector3(-8, 1.4, 0), right = new THREE.Vector3(8, 1.4, 0);
  const visible = effects.createProjectile(), hidden = effects.createProjectile();
  effects.launch(visible, 'fireStaff', left, 0);
  effects.launch(hidden, 'iceStaff', right, 0);
  effects.fire('iceStaff', new THREE.Vector3(8, 2.8, 0), 0, right);
  effects.impact('iceStaff', right, null, 0);
  effects.channel('iceStaff', right, 0, .5); effects.update(.01, .01);
  const state = effects.telemetry;
  assert.equal(state.activeProjectiles, 2);
  assert.equal(state.visibleProjectiles, 1);
  assert.equal(visible.group.visible, true);
  assert.equal(hidden.group.visible, false);
  assert.ok(state.activeParticles > 0);
  assert.equal(state.visibleParticles, 0);
  assert.ok(state.bursts.length > 0 && state.bursts.every(burst => !burst.visible));
  assert.equal(state.channelActive, true);
  assert.equal(state.channelVisible, false);
  reveal = true; effects.update(0, .01);
  assert.equal(effects.telemetry.visibleProjectiles, 2);
  assert.ok(effects.telemetry.visibleParticles > 0);
  assert.ok(effects.telemetry.bursts.every(burst => burst.visible));
  assert.equal(effects.telemetry.channelVisible, true);
  effects.dispose();
});

test('a world-space trail outlives its projectile briefly, then expires or clears immediately on reset', () => {
  const scene = new THREE.Scene(), effects = createSpellEffects(scene);
  const visual = effects.createProjectile();
  const start = new THREE.Vector3(0, 1.4, 0), finish = new THREE.Vector3(0, 1.4, 3.6);
  effects.launch(visual, 'fireStaff', start, 0);
  effects.advance(visual, start, finish, .2, .2); effects.update(.2, .2);
  assert.equal(effects.telemetry.activeTrails, 1);
  assert.ok(effects.telemetry.visibleTrailSegments > 0);
  effects.end(visual);
  assert.equal(effects.telemetry.activeProjectiles, 0);
  assert.equal(effects.telemetry.activeTrails, 1, 'ending the projectile preserves its fading wake');
  const stopped = effects.telemetry;
  effects.update(0, 500);
  assert.deepEqual(effects.telemetry, stopped, 'paused wall-clock time cannot expire the remaining trail');
  for (let i = 0; i < 3; i++) effects.update(.1, .3 + i * .1);
  assert.equal(effects.telemetry.activeTrails, 0);
  assert.equal(effects.telemetry.visibleTrailSegments, 0);
  effects.launch(visual, 'iceStaff', start, 0);
  effects.advance(visual, start, finish, .2, .7); effects.update(.2, .7);
  assert.equal(effects.telemetry.activeTrails, 1);
  effects.reset();
  assert.equal(effects.telemetry.activeTrails, 0, 'restart removes the wake without waiting for its fade');
  assert.equal(effects.telemetry.visibleTrailSegments, 0);
  effects.dispose();
});

test('visible trail sections remain behind a hidden projectile without revealing their fogged continuation', () => {
  let visibility = 'left';
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, {
    isVisible: point => visibility === 'all' || (visibility === 'left' && point.x < 0),
  });
  const visual = effects.createProjectile();
  const start = new THREE.Vector3(-2, 1.4, 0), finish = new THREE.Vector3(2, 1.4, 0);
  effects.launch(visual, 'iceStaff', start, Math.PI / 2);
  effects.advance(visual, start, finish, .2, .2); effects.update(.2, .2);
  const partial = effects.telemetry;
  assert.equal(partial.activeProjectiles, 1);
  assert.equal(partial.visibleProjectiles, 0, 'the projectile head has entered the hidden half');
  assert.equal(partial.activeTrails, 1);
  assert.ok(partial.visibleTrailSegments > 0, 'the already-visible portion of the wake stays in the world');
  visibility = 'all'; effects.update(0, .2);
  assert.ok(effects.telemetry.visibleTrailSegments > partial.visibleTrailSegments,
    'revealing the hidden half exposes additional sections, rather than an entire previously leaking ribbon');
  visibility = 'none'; effects.update(0, .2);
  assert.equal(effects.telemetry.activeTrails, 1);
  assert.equal(effects.telemetry.visibleTrailSegments, 0);
  effects.dispose();
});

test('animated effect transforms and shader uniforms stay finite and freeze with a paused simulation', () => {
  const scene = new THREE.Scene(), effects = createSpellEffects(scene);
  const visual = effects.createProjectile(), origin = new THREE.Vector3(0, 1.4, 0), tip = new THREE.Vector3(0, 2.8, 0);
  const end = new THREE.Vector3(0, 1.4, 1.8);
  effects.launch(visual, 'fireStaff', origin, 0);
  effects.advance(visual, origin, end, .1, .1);
  effects.fire('fireStaff', tip, 0, origin);
  effects.impact('iceStaff', new THREE.Vector3(2, 1.4, 0), null, 0);
  effects.channel('fireStaff', tip, 0, .5); effects.update(.1, .1);

  function snapshot() {
    const objects = [];
    scene.traverseVisible(object => {
      const transform = [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()];
      assert.ok(transform.every(Number.isFinite));
      const uniforms = [];
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const [name, uniform] of Object.entries(material?.uniforms ?? {})) {
          const value = uniform.value;
          const numbers = typeof value === 'number' ? [value] : value?.toArray ? value.toArray() :
            ArrayBuffer.isView(value) ? Array.from(value) : null;
          if (numbers) {
            assert.ok(numbers.every(Number.isFinite), `${name} has finite shader inputs`);
            uniforms.push([name, numbers]);
          }
        }
      }
      objects.push({ id: object.uuid, transform, uniforms,
        instances: object.isInstancedMesh ? Array.from(object.instanceMatrix.array) : null });
    });
    return objects;
  }

  const before = snapshot();
  for (let i = 0; i < 8; i++) {
    effects.advance(visual, end, end, 0, 100 + i);
    effects.update(0, 100 + i);
  }
  assert.deepEqual(snapshot(), before, 'global render time may advance while the actual effect animation is paused');
  effects.update(Number.NaN, Number.POSITIVE_INFINITY);
  assert.deepEqual(snapshot(), before, 'invalid elapsed time cannot poison active transforms or shader uniforms');
  effects.dispose();
});
