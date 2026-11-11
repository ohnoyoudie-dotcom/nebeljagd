import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createGravitySpell, GRAVITY_RULES, gravityPullStep } from '../src/gravity-spell.js';
import { createCollisionIndex } from '../src/collision.js';
import { createPracticeActors } from '../src/practice-actors.js';
import { createSpecialWeapons } from '../src/special-weapons.js';
import { RARITIES, weaponStats } from '../src/loot-tiers.js';

function scenario(blocked = false, visible = () => true) {
  const scene = new THREE.Scene();
  const world = {
    heightAt: () => 0, isLand: () => true, isWater: () => false,
    traceProjectile: blocked ? () => ({ type: 'wall' }) : () => null,
    resolveMovement: () => {},
  };
  const combat = createCombat();
  const opponentPosition = new THREE.Vector3(1.8, 0, 0);
  const opponent = combat.addTarget({ id: 'opponent', position: opponentPosition, health: 100 });
  const hits = [];
  const gravity = createGravitySpell(scene, world, combat, 'player', result => hits.push(result), visible);
  return { scene, world, combat, gravity, opponent, hits };
}

// Existing field checks start their clock at the physical landing.
function land(gravity, position) {
  const duration = gravity.telemetry.flight?.duration;
  if (duration) gravity.update(duration, position);
}

test('gravity uses a visible warning, limited pull, one explosion and a resettable lifecycle', () => {
  const { gravity, opponent, hits } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  assert.equal(gravity.beginAim(origin, 0), true);
  gravity.aimAt(origin, { x: 0, z: 0 });
  assert.equal(gravity.telemetry.aiming, true);
  assert.equal(gravity.release({ damage: 14 }), true);
  land(gravity, origin);
  assert.equal(gravity.telemetry.active, true);
  gravity.update(.2, origin);
  assert.equal(opponent.position.x, 1.8);
  assert.equal(opponent.health, 100);
  gravity.update(.4, origin);
  assert.ok(opponent.position.x < 1.8);
  for (let i = 0; i < 16; i++) gravity.update(.2, origin, i * .2);
  assert.ok(opponent.position.x >= .2 - 1e-6);
  assert.ok(opponent.position.x <= .5);
  assert.equal(opponent.health, 86);
  assert.equal(hits.length, 1);
  assert.equal(gravity.telemetry.active, false);
  gravity.reset();
  assert.equal(gravity.telemetry.castCount, 0);
  gravity.dispose();
});

test('gravity respects world blockers and never pulls or damages through walls', () => {
  const { gravity, opponent, hits } = scenario(true);
  const origin = new THREE.Vector3(0, 0, 0);
  gravity.beginAim(origin, 0);
  gravity.aimAt(origin, { x: 0, z: 0 });
  gravity.release({ damage: 14 }); land(gravity, origin);
  for (let i = 0; i < 20; i++) gravity.update(.2, origin);
  assert.equal(opponent.position.x, 1.8);
  assert.equal(opponent.health, 100);
  assert.equal(hits.length, 0);
  gravity.dispose();
});

test('gravity grows its reachable distance while held and can be cancelled without casting', () => {
  const { gravity } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  gravity.beginAim(origin, 0);
  gravity.aimAt(origin, { x: 50, z: 0 });
  assert.equal(gravity.telemetry.aim.x, 0);
  gravity.update(1.5, origin);
  assert.ok(Math.abs(gravity.telemetry.aim.x - 10) < 1e-6);
  gravity.update(1.5, origin);
  assert.ok(Math.abs(gravity.telemetry.aim.x - 20) < 1e-6);
  gravity.cancelAim();
  assert.equal(gravity.release({ damage: 14 }), false);
  assert.equal(gravity.telemetry.active, false);
  gravity.dispose();
});

test('hold duration controls placement up to twenty metres in three seconds, never the field size or damage', () => {
  for (const [held, distance] of [[0, 0], [.6, 4], [1.5, 10], [2.99, 20 * 2.99 / 3], [3, 20], [5, 20]]) {
    const { gravity } = scenario();
    const origin = new THREE.Vector3();
    gravity.beginAim(origin, 0); gravity.aimAt(origin, { x: 100, z: 0 });
    gravity.update(held, origin);
    assert.ok(Math.abs(gravity.telemetry.aim.x - distance) < 1e-8);
    assert.equal(gravity.telemetry.radius, 3.2);
    const before = gravity.telemetry;
    gravity.update(0, origin, 500); assert.deepEqual(gravity.telemetry, before, 'pause freezes charge and visuals');
    gravity.aimAt(origin, { x: -100, z: 0 });
    assert.ok(Math.abs(gravity.telemetry.aim.x + distance) < 1e-8, 'mouse changes direction at the current charge');
    gravity.release({ damage: 14 }); land(gravity, origin);
    assert.ok(Math.abs(gravity.telemetry.center.x + distance) < 1e-8);
    assert.equal(gravity.release({ damage: 14 }), false, 'release never fires twice');
    gravity.dispose();
  }
});

test('nearby targets are not overshot and the range follows a moving caster', () => {
  const { gravity, scene } = scenario();
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0); gravity.aimAt(origin, { x: 2, z: 0 }); gravity.update(3, origin);
  assert.equal(gravity.telemetry.aim.x, 2);
  origin.set(4, 0, -2); gravity.aimAt(origin, { x: 100, z: 100 }); gravity.update(.1, origin);
  assert.ok(Math.abs(Math.hypot(gravity.telemetry.aim.x - 4, gravity.telemetry.aim.z + 2) - 20) < 1e-8);
  assert.equal(scene.getObjectByName('Gravitationsstab · wachsende Reichweite').position.x, 4);
  gravity.cancelAim();
  gravity.beginAim(origin, 0); assert.equal(gravity.telemetry.aimRange.radius, 0, 'each press starts a fresh charge');
  gravity.dispose();
});

test('the larger field pulls and hits targets at three metres, with one hit and no damage during warning or pull', () => {
  const { gravity, combat, opponent, hits } = scenario();
  const origin = new THREE.Vector3(); opponent.position.x = 3.1;
  const outside = combat.addTarget({ id: 'outside', position: new THREE.Vector3(3.8, 0, 0), health: 100 });
  const owner = combat.addTarget({ id: 'player', position: new THREE.Vector3(), health: 100 });
  gravity.beginAim(origin, 0); gravity.release({ damage: 14 }); land(gravity, origin);
  gravity.update(.4, origin); assert.equal(opponent.position.x, 3.1);
  gravity.update(2.98, origin); assert.equal(opponent.health, 100);
  assert.ok(opponent.position.x < 3.1 && opponent.position.x >= 1.6);
  gravity.update(.03, origin); assert.equal(opponent.health, 86); assert.equal(hits.length, 1);
  gravity.update(.6, origin); assert.equal(hits.length, 1);
  assert.equal(outside.health, 100); assert.equal(outside.position.x, 3.8); assert.equal(owner.health, 100);
  gravity.dispose();
});

test('the spatial vortex freezes on pause, respects visibility and releases its reusable resources', () => {
  let visible = true;
  const { gravity, scene } = scenario(false, () => visible); const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0); gravity.release({ damage: 14 }); land(gravity, origin); gravity.update(1.9, origin);
  const core = scene.getObjectByName('Gravitationsfeld · Singularität');
  const surface = scene.getObjectByName('Gravitationsfeld · gefärbter Bodenstrudel');
  const debris = scene.getObjectByName('Gravitationsfeld · schwebende Trümmer');
  assert.ok(core.position.y > .8 && core.visible, 'the singularity floats above the ground');
  const bounds = new THREE.Box3().setFromBufferAttribute(surface.geometry.attributes.position);
  assert.ok(bounds.max.y - bounds.min.y > .2 && bounds.max.y - bounds.min.y < .4,
    'the filled ground vortex has shallow physical depth');
  assert.equal(debris.count, 64); assert.equal(gravity.telemetry.visuals.dustCount, 160);
  assert.ok(gravity.telemetry.visuals.fieldDraws <= 15, 'bounded effect draw count');
  const matrix = Array.from(debris.instanceMatrix.array), spin = surface.material.uniforms.uSpin.value;
  gravity.update(0, origin, 200);
  assert.deepEqual(Array.from(debris.instanceMatrix.array), matrix); assert.equal(surface.material.uniforms.uSpin.value, spin);
  visible = false; gravity.update(.02, origin); assert.equal(gravity.telemetry.visuals.fieldVisible, false);
  visible = true; gravity.update(.02, origin); assert.equal(gravity.telemetry.visuals.fieldVisible, true);
  let disposed = 0; surface.geometry.addEventListener('dispose', () => disposed++);
  gravity.reset(); assert.equal(gravity.telemetry.visuals.fieldVisible, false);
  gravity.dispose(); assert.equal(disposed, 1); assert.equal(scene.children.length, 0);
});

test('pull cannot exceed 1.5m, cross the centre or run with zero dt', () => {
  assert.equal(GRAVITY_RULES.maxPull, 1.5);
  assert.equal(gravityPullStep(2, 0, 1), .5);
  assert.equal(gravityPullStep(2, 0, 3), 1.5, 'the same displacement is spread over the three-second field');
  assert.ok(Math.abs(gravityPullStep(2, 1.4, 1) - .1) < 1e-8);
  assert.equal(gravityPullStep(.1, 0, 1), 0);
  assert.equal(gravityPullStep(2, 0, 0), 0);
});

test('three-second gravity suction shows dust and victim tethers before its single final impulse', () => {
  const { gravity, scene, opponent } = scenario();
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0);
  gravity.release({ damage: 14 }); land(gravity, origin);
  gravity.update(.2, origin, .2);
  assert.equal(opponent.health, 100, 'warning is non-damaging');
  const dust = scene.getObjectByName('Gravitationsfeld · angehobener Bodenstaub');
  const marker = scene.getObjectByName('Gravitation · Zugkraft am Gegner 1');
  const tether = scene.getObjectByName('Gravitation · Energiezüge zum Gegner');
  assert.ok(dust && marker && tether, 'visual-only reaction layers exist');
  gravity.update(.5, origin, .7);
  assert.equal(gravity.telemetry.visuals.phase, 'pull');
  assert.ok(dust.visible && marker.visible && tether.visible);
  assert.ok(tether.geometry.drawRange.count > 0);
  assert.ok(opponent.gravityVisual?.remaining > 0, 'actual movement drives the character response');
  assert.equal(opponent.health, 100, 'still no damage during pulling');
  gravity.update(2.72, origin, 3.42);
  assert.equal(opponent.health, 86);
  assert.equal(gravity.telemetry.visuals.phase, 'collapse');
  assert.ok(scene.getObjectByName('Gravitation · Aufblitzen beim Kollaps').visible);
  gravity.reset();
  assert.equal(marker.visible, false);
  assert.equal(gravity.telemetry.visuals.affectedCount, 0);
  gravity.dispose();
});

test('gravity and poison share ordinary target circles and exactly the same reach in metres throughout charging', () => {
  const { scene, world, combat, gravity } = scenario(); const caster = new THREE.Vector3();
  const poison = createSpecialWeapons(scene, world, combat, 'player', () => {});
  for (const rarity of Object.keys(RARITIES)) {
    assert.equal(weaponStats('gravityStaff', rarity).range, GRAVITY_RULES.range);
    assert.equal(weaponStats('poisonStaff', rarity).range, GRAVITY_RULES.range);
  }
  const gravityTarget = scene.getObjectByName('Gravitationsstab · Zielkreis').children[0];
  const poisonTarget = scene.getObjectByName('Giftwolke · Zielbereich');
  const gravityRange = scene.getObjectByName('Gravitationsstab · wachsende Reichweite').children[0];
  const poisonRange = scene.getObjectByName('Giftstab · maximale Reichweite');
  assert.ok(gravityTarget.geometry.isBufferGeometry && gravityTarget.material.isMeshBasicMaterial);
  assert.equal(gravityTarget.geometry.type, 'RingGeometry');
  assert.equal(gravityTarget.geometry.parameters.outerRadius, 3.2, 'target circle marks the actual field');
  assert.equal(poisonTarget.geometry.parameters.outerRadius, 4.8, 'poison retains its actual cloud radius');
  assert.deepEqual(gravityRange.geometry.parameters, poisonRange.geometry.parameters);
  for (const [g, p] of [[gravityTarget, poisonTarget], [gravityRange, poisonRange]]) {
    assert.equal(g.material.color.getHex(), p.material.color.getHex());
    assert.equal(g.material.opacity, p.material.opacity);
    assert.equal(g.material.depthTest, p.material.depthTest);
    assert.equal(g.renderOrder, p.renderOrder);
  }
  for (let cast = 0; cast < 2; cast++) {
    gravity.beginAim(caster, 0); poison.beginAim(caster, 0);
    for (const dt of [0, .01, .29, 0, .7, .5, .5, .99, .01, 1]) {
      gravity.update(dt, caster); poison.update(dt, caster, 0);
      const g = gravity.telemetry.aimRange, p = poison.telemetry.aimRange;
      assert.equal(g.maximum, 20); assert.equal(g.radius, p.radius);
      assert.equal(gravityRange.scale.x, poisonRange.scale.x);
      assert.equal(g.heldSeconds, p.heldSeconds);
      caster.x += .1;
      gravity.aimAt(caster, { x: 100, z: 20 }); poison.aimAt(caster, { x: 100, z: 20 });
      assert.equal(gravity.telemetry.active, false, 'charging never casts');
    }
    gravity.cancelAim(); poison.cancelAim();
  }
  gravity.dispose(); poison.dispose(); assert.equal(scene.children.length, 0);
});

test('target energy strands do not reveal an enemy hidden from the caster', () => {
  const { gravity, scene, opponent } = scenario(false, p => p.x < 1);
  const origin = new THREE.Vector3();
  gravity.beginAim(origin, 0);
  gravity.release({ damage: 14 }); land(gravity, origin);
  gravity.update(.8, origin);
  assert.equal(gravity.telemetry.visuals.fieldVisible, true);
  assert.equal(gravity.telemetry.visuals.affectedCount, 0);
  assert.equal(scene.getObjectByName('Gravitation · Energiezüge zum Gegner').visible, false);
  assert.ok(opponent.position.x < 1.8, 'hidden target still receives the normal pull');
  gravity.dispose();
});

test('the gravity field bends actual map grass inward only during its suction phase', () => {
  const { gravity } = scenario();
  const origin = new THREE.Vector3(0, 0, 0);
  const before = [{ x: 10, z: 12, radius: 1, dirX: 0, dirZ: 1, strength: .4 }];
  assert.deepEqual(gravity.appendGrassInteractors([...before]), before);
  gravity.beginAim(origin, 0);
  gravity.release({ damage: 14 }); land(gravity, origin);
  gravity.update(.2, origin);
  assert.equal(gravity.appendGrassInteractors([...before]).length, 1, 'warning has no suction wind');
  gravity.update(.45, origin);
  const interactors = gravity.appendGrassInteractors([...before]);
  assert.equal(interactors.length, 5);
  assert.deepEqual(interactors[0], before[0], 'existing player interaction is retained');
  for (const effect of interactors.slice(1)) {
    assert.ok(effect.strength > 0 && effect.strength <= 1);
    const directionX = gravity.telemetry.center.x - effect.x;
    const directionZ = gravity.telemetry.center.z - effect.z;
    assert.ok(effect.dirX * directionX + effect.dirZ * directionZ > 0,
      'vegetation bends toward the gravity core');
  }
  const almostFull = Array.from({ length: 7 }, () => ({ x: 0, z: 0 }));
  assert.equal(gravity.appendGrassInteractors(almostFull).length, 8, 'never exceeds the GPU interactor budget');
  gravity.update(3, origin);
  assert.equal(gravity.appendGrassInteractors([]).length, 0, 'collapse stops the grass suction');
  gravity.dispose();
});

test('release throws a dark projectile with a curved, pauseable flight before landing and field opening', () => {
  const { gravity, scene, opponent } = scenario();
  const caster = new THREE.Vector3(), hand = new THREE.Vector3(0, 1.4, 0);
  gravity.beginAim(caster, 0); gravity.aimAt(caster, { x: 0, z: 10 }); gravity.update(3, caster);
  gravity.release({ damage: 14 }, hand);
  const first = gravity.telemetry;
  assert.equal(first.phase, 'flight'); assert.equal(first.landed, false);
  assert.equal(first.visuals.fieldVisible, false); assert.equal(first.arrival.visible, false);
  assert.equal(gravity.beginAim(caster, 0), false, 'the cast has a fixed bounded projectile capacity');
  gravity.update(first.flight.duration / 2, caster);
  assert.ok(gravity.telemetry.flight.position.y > 3.8, 'the projectile has a clearly visible high arc');
  assert.ok(Math.abs(gravity.telemetry.flight.position.z - 5) < 1e-7);
  assert.ok(scene.getObjectByName('Gravitationsprojektil · umlaufende Energiepartikel').count === 8);
  const before = gravity.telemetry;
  gravity.update(0, caster, 100); assert.deepEqual(gravity.telemetry, before);
  gravity.update(first.flight.duration / 2, caster);
  assert.equal(gravity.telemetry.flight, null); assert.equal(gravity.telemetry.phase, 'impact');
  assert.equal(gravity.telemetry.arrival.visible, true); assert.equal(gravity.telemetry.visuals.fieldVisible, false);
  assert.equal(opponent.health, 100);
  gravity.update(.25, caster); assert.equal(gravity.telemetry.phase, 'opening');
  assert.equal(gravity.telemetry.visuals.fieldVisible, true);
  gravity.reset(); assert.equal(gravity.telemetry.active, false); assert.equal(gravity.telemetry.arrival.visible, false);
  gravity.dispose(); assert.equal(scene.children.length, 0);
});

test('coarse frames sweep the gravity arc against actual barriers and preserve cover behind the impact', () => {
  for (const height of [1.99, 8]) {
    const { gravity, world, opponent } = scenario();
    const index = createCollisionIndex([], [{ type: 'wall', minX: -2, maxX: 2,
      minZ: 4.9, maxZ: 5.1, minY: 0, maxY: height }]);
    const caster = new THREE.Vector3(); opponent.position.set(0, 0, 7);
    gravity.beginAim(caster, 0); gravity.aimAt(caster, { x: 0, z: 10 }); gravity.update(3, caster);
    gravity.release({ damage: 14 }, new THREE.Vector3(0, 1.4, 0));
    world.traceProjectile = (...args) => index.traceSegment(...args);
    world.resolveMovement = (...args) => index.resolve(...args);
    gravity.update(gravity.telemetry.flight.duration + .1, caster);
    assert.equal(gravity.telemetry.flight, null);
    assert.ok(Math.abs(gravity.telemetry.center.z - (height < 2 ? 10 : 4.62)) < .05);
    gravity.update(GRAVITY_RULES.warning + GRAVITY_RULES.pullDuration + .01, caster);
    if (height >= 2) { assert.equal(opponent.health, 100); assert.equal(opponent.position.z, 7); }
    else assert.equal(opponent.health, 86, 'low cover does not block the final impulse');
    gravity.dispose();
  }
});

test('flight precedes a full three-second field, one final hit and a short clean finish', () => {
  const { gravity, opponent, hits } = scenario(); const caster = new THREE.Vector3();
  gravity.beginAim(caster, 0); gravity.release({ damage: 14 }, new THREE.Vector3(0, 1.4, 0));
  const duration = gravity.telemetry.flight.duration;
  assert.equal(GRAVITY_RULES.pullDuration, 3);
  gravity.update(duration + 3.38, caster);
  assert.equal(opponent.health, 100);
  gravity.update(.03, caster); assert.equal(opponent.health, 86); assert.equal(hits.length, 1);
  gravity.update(.1, caster); assert.equal(hits.length, 1);
  assert.equal(gravity.telemetry.active, true, 'one brief area impulse remains');
  gravity.update(.13, caster); assert.equal(hits.length, 1); assert.equal(gravity.telemetry.active, false);
  gravity.dispose();
});

test('debris is swallowed before one short impulse, then every field layer is completely hidden', () => {
  const { gravity, scene, opponent, hits } = scenario(); const caster = new THREE.Vector3();
  gravity.beginAim(caster, 0); gravity.release({ damage: 14 }); land(gravity, caster);
  gravity.update(.28, caster);
  const debris = scene.getObjectByName('Gravitationsfeld · schwebende Trümmer');
  const dust = scene.getObjectByName('Gravitationsfeld · angehobener Bodenstaub');
  assert.ok(dust.visible, 'decorative suction starts during opening');
  assert.equal(dust.geometry.attributes.position.count, 160);
  gravity.update(1.62, caster);
  assert.ok(gravity.telemetry.visuals.liveDebris > 0 && gravity.telemetry.visuals.liveDebris < 64);
  assert.equal(opponent.health, 100, 'the orb gathers debris without premature damage');
  const before = Array.from(debris.instanceMatrix.array);
  gravity.update(0, caster, 999); assert.deepEqual(Array.from(debris.instanceMatrix.array), before);
  gravity.update(1.48, caster); assert.equal(opponent.health, 100, 'three-second field has not yet finished');
  gravity.update(.03, caster);
  assert.ok(scene.getObjectByName('Gravitation · Aufblitzen beim Kollaps').visible);
  assert.ok(scene.getObjectByName('Gravitation · letzter Flächenimpuls').visible);
  assert.equal(debris.visible, false); assert.equal(dust.visible, false);
  assert.equal(gravity.telemetry.visuals.liveDebris, 0);
  assert.equal(gravity.telemetry.visuals.liveDust, 0);
  assert.equal(opponent.health, 86); assert.equal(hits.length, 1);
  assert.ok(gravity.telemetry.visuals.fieldDraws <= 15);
  gravity.update(.22, caster); assert.equal(gravity.telemetry.active, false);
  const cleared = gravity.telemetry;
  assert.equal(cleared.visuals.fieldDraws, 0); assert.equal(cleared.arrival.visible, false);
  assert.equal(cleared.visuals.vortex.surfaceOpacity, 0);
  assert.equal(cleared.visuals.vortex.sphereVisible, false);
  assert.equal(cleared.visuals.vortex.capVisible, false);
  assert.equal(cleared.visuals.vortex.shellCount, 0);
  assert.equal(scene.getObjectByName('Gravitation · letzter Flächenimpuls').visible, false);
  gravity.update(5, caster); assert.equal(hits.length, 1); assert.equal(gravity.telemetry.visuals.fieldDraws, 0);
  gravity.dispose();
});

test('eight visible victims use shared instanced feedback and respect the field draw and grass budgets', () => {
  const { gravity, combat, scene } = scenario(); const caster = new THREE.Vector3();
  for (let i = 0; i < 12; i++) combat.addTarget({ id: 'crowd-' + i,
    position: new THREE.Vector3(Math.sin(i) * 2.3, 0, Math.cos(i) * 2.3), health: 100 });
  gravity.beginAim(caster, 0); gravity.release({ damage: 14 }); land(gravity, caster); gravity.update(.7, caster);
  assert.equal(gravity.telemetry.visuals.affectedCount, 8);
  assert.equal(scene.getObjectByName('Gravitation · gebündelte Fußrunen').count, 8);
  assert.equal(scene.getObjectByName('Gravitation · Energie an betroffenen Körpern').count, 8);
  assert.ok(gravity.telemetry.visuals.fieldDraws <= 15);
  assert.ok(gravity.appendGrassInteractors([]).length <= 8);
  gravity.reset();
  for (const target of combat.targets.values()) assert.equal(target.gravityVisual, undefined);
  gravity.dispose();
});

test('actual practice bodies brace against the pull and their pose freezes on pause', () => {
  const scene = new THREE.Scene(), combat = createCombat();
  const world = { spawn: { x: 0, z: 0 }, heightAt: () => 0, isLand: () => true,
    isWater: () => false, concealmentAt: () => 0, resolveMovement: () => {}, traceProjectile: () => null };
  const actors = createPracticeActors(scene, { world, combat });
  combat.targets.get('practice-1').position.set(1.8, 0, 0);
  const gravity = createGravitySpell(scene, world, combat, 'player'); const caster = new THREE.Vector3();
  gravity.beginAim(caster, 0); gravity.release({ damage: 14 }); land(gravity, caster); gravity.update(.8, caster);
  actors.update(.05, 1, caster);
  assert.ok(actors.inspect()[0].gravityResponse > .1);
  const pivot = actors.root.children[0].children[0];
  const pose = () => { const values = []; pivot.traverse(object => values.push([...object.position.toArray(), ...object.quaternion.toArray()])); return values; };
  const before = pose(); actors.update(0, 999, caster); assert.deepEqual(pose(), before);
  gravity.dispose(); actors.dispose(); assert.equal(scene.children.length, 0);
});
