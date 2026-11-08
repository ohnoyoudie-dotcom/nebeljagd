import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createWeapons } from '../src/weapons.js';
import { ARROW_LENGTH } from '../src/arrow-alignment.js';
import { TRIPO_PROP_DEFINITIONS } from '../src/map/tripo-prop-definitions.js';
import { aimBowAtDestructible, traceCombatProjectile } from '../src/projectile-collision.js';

const barrel = TRIPO_PROP_DEFINITIONS.find(p => p.kind === 'barrel');
const inspection = JSON.parse(readFileSync(new URL('../assets/imported/tripo-extra-weapons/inspections/ornate-bow.json', import.meta.url)));

function fixture({ yaw = 0, distance = 6, offset = 0, blocked = false, enemy = false } = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group();
  actor.scale.setScalar(1.2); actor.rotation.y = yaw; scene.add(actor);
  const position = { x: Math.sin(yaw) * distance + Math.cos(yaw) * offset, y: 0,
    z: Math.cos(yaw) * distance - Math.sin(yaw) * offset };
  const bodies = barrel.walls.map(b => ({ ...b, objectId: 'barrel', minX: b.minX + position.x,
    maxX: b.maxX + position.x, minZ: b.minZ + position.z, maxZ: b.maxZ + position.z }));
  if (blocked) bodies.push({ minX: -3, maxX: 3, minZ: 2, maxZ: 2.15, minY: 0, maxY: 3, type: 'house-wall' });
  const index = createCollisionIndex([], bodies), combat = createCombat();
  const target = combat.addTarget({ id: 'barrel', position, radius: barrel.destructible.radius,
    height: barrel.height, destructible: true, maxHealth: 60 });
  if (enemy) combat.addTarget({ id: 'front', position: { x: 0, y: 0, z: 2 }, radius: .65, height: 2.3, maxHealth: 100 });
  const world = { heightAt: () => 0, worldRadius: 100,
    traceProjectile: (a, b, r, accepts) => index.traceSegment(a, b, r, accepts) };
  const bounds = inspection.normalization.gltfBounds;
  const geometry = new THREE.BoxGeometry(...bounds[0].map((min, i) => bounds[1][i] - min));
  geometry.translate(...bounds[0].map((min, i) => (bounds[1][i] + min) / 2));
  const material = new THREE.MeshStandardMaterial(), model = new THREE.Group();
  model.add(new THREE.Mesh(geometry, material)); model.userData.bowRig = inspection.normalization.bowRig;
  let visible = true;
  const weapons = createWeapons(scene, actor, world, null, { combat, isVisible: () => visible,
    tripoPrototypes: { 'kit-tripo-ornate-bow': model },
    placements: [{ id: 'bow', kind: 'bow', variant: 'kit-tripo-ornate-bow', rarity: 'common', position: [0, 0] }] });
  weapons.interact(actor.position);
  return { scene, actor, combat, target, weapons, world,
    hide() { visible = false; },
    draw() { weapons.attack(actor.position, yaw); for (let i = 0; i < 30; i++) weapons.update(1 / 60, i / 60, actor.position); },
    dispose() { weapons.dispose(); geometry.dispose(); material.dispose(); } };
}

test('a high drawn bow pitches down at the lined-up barrel while its arrow stays on the real string and flight axis', () => {
  for (const yaw of [0, .73, 1.8]) {
    const f = fixture({ yaw });
    try {
      f.draw();
      f.actor.rotation.y = yaw + .2;
      f.weapons.update(1 / 60, .6, f.actor.position, yaw);
      const state = f.weapons.telemetry;
      assert.equal(state.bowAim?.targetId, 'barrel'); assert.ok(state.bowAim.pitch > 0);
      const held = f.actor.children.find(part => part.userData.variant === 'kit-tripo-ornate-bow');
      const loaded = f.actor.getObjectByName('Aufgelegter Pfeil');
      f.actor.updateWorldMatrix(true, true);
      const nock = held.userData.bowRig.lower.clone().lerp(held.userData.bowRig.upper, .5);
      nock.x += state.bowDraw * held.userData.bowRig.drawDistance; held.localToWorld(nock);
      const tail = loaded.localToWorld(new THREE.Vector3(0, 0, -ARROW_LENGTH / 2));
      const tip = loaded.localToWorld(new THREE.Vector3(0, 0, ARROW_LENGTH / 2));
      assert.ok(tail.distanceTo(nock) < 1e-7, 'the drawn arrow tail remains on the rotated bowstring');
      assert.ok(nock.y > barrel.height + .055, 'this is the original high grip that otherwise overflies the barrel');
      assert.ok(Math.abs(tip.distanceTo(tail) - ARROW_LENGTH) < 1e-7);
      const forward = tip.clone().sub(tail).normalize(); assert.ok(forward.y < 0);
      const heldPosition = held.position.clone(), heldOrientation = held.quaternion.clone();
      for (let i = 0; i < 20; i++) f.weapons.update(1 / 60, 1 + i / 60, f.actor.position);
      assert.ok(held.position.distanceTo(heldPosition) < 1e-9, 'aim preserves the hand grip anchor');
      assert.ok(held.quaternion.angleTo(heldOrientation) < 1e-7, 'pitch never accumulates each held frame');
      f.weapons.releaseAttack(f.actor.position);
      const arrow = f.scene.children.find(part => part.name === 'Fliegender Pfeil' && part.visible);
      assert.ok(arrow); const from = arrow.position.clone();
      assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(arrow.quaternion).dot(forward) > .999999);
      f.weapons.update(.02, 2, f.actor.position);
      assert.ok(arrow.position.clone().sub(from).normalize().dot(forward) > .999999, 'visible pitch equals actual swept flight direction');
      for (let i = 0; i < 80; i++) f.weapons.update(1 / 60, 2 + i / 60, f.actor.position);
      assert.equal(f.target.health, 38, 'the normal low barrel receives one common-arrow hit');
      assert.equal(f.weapons.telemetry.damageHits, 1);
    } finally { f.dispose(); }
  }
});

test('bow pitch assistance never snaps off axis, exceeds range, reveals hidden props or bypasses nearer cover/targets', () => {
  for (const options of [{ offset: 2 }, { distance: 30 }, { blocked: true }, { enemy: true }, { hidden: true }]) {
    const f = fixture(options);
    try {
      if (options.hidden) f.hide();
      f.draw(); assert.equal(f.weapons.telemetry.bowAim, null, JSON.stringify(options));
      f.weapons.releaseAttack(f.actor.position);
      for (let i = 0; i < 90; i++) f.weapons.update(1 / 60, 1 + i / 60, f.actor.position);
      assert.equal(f.target.health, 60, 'an untargeted high shot cannot receive an invisible taller barrel collider');
      if (options.enemy) assert.equal(f.combat.targets.get('front').health, 78);
      if (options.blocked) assert.equal(f.weapons.telemetry.lastImpact.type, 'house-wall');
    } finally { f.dispose(); }
  }
});

test('bow aim includes the real arrow radius when its centerline grazes the physical barrel rim', () => {
  const f = fixture();
  try {
    const origin = { x: barrel.destructible.radius + .028, y: 1.8, z: 0 };
    const point = { x: origin.x, y: barrel.height * .6, z: 6 };
    const collision = traceCombatProjectile(f.world, f.combat, origin, point, .055, 'player');
    assert.equal(collision?.target, f.target, 'the unchanged physical arrow sweep really hits the rim');
    const aim = aimBowAtDestructible(f.world, f.combat, origin, 0, 24.3, 'player');
    assert.equal(aim?.targetId, f.target.id, 'the broad phase must not discard this verified physical contact');
    assert.ok(aim.pitch > 0);
  } finally { f.dispose(); }
});
