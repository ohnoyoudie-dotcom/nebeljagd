import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';

function setup(type, offset = 1.5) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const position = type === 'bow' ? new THREE.Vector3(-4, 0, 11) : new THREE.Vector3(-11, 0, 6);
  actor.position.copy(position);
  const wallZ = position.z + offset;
  const traces = [];
  const world = { bounds: 100, heightAt: () => 0,
    traceProjectile(start, end) {
      traces.push({ start: { ...start }, end: { ...end } });
      if (start.z > wallZ || end.z < wallZ) return null;
      const t = (wallZ - start.z) / (end.z - start.z);
      return { type: 'house', point: { x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t, z: wallZ }, normal: { x: 0, z: -1 } };
    } };
  const weapons = createWeapons(scene, actor, world);
  assert.equal(weapons.interact(position).type, type);
  return { weapons, position, traces, wallZ };
}

test('bow draws before release and swept flight impacts the wall without passing through', () => {
  const { weapons, position, traces, wallZ } = setup('bow');
  weapons.attack(position, 0);
  weapons.update(.12, .12, position);
  assert.equal(weapons.telemetry.attackPhase, 'draw');
  assert.equal(weapons.telemetry.shotsFired, 0);
  assert.ok(weapons.telemetry.bowDraw > .3);
  weapons.update(.12, .24, position);
  assert.equal(weapons.telemetry.shotsFired, 1);
  assert.equal(weapons.telemetry.impacts, 1);
  assert.equal(weapons.telemetry.arrowsFlying, 0);
  assert.equal(weapons.telemetry.lastImpact.point.z, wallZ);
  assert.ok(traces.length >= 2, 'body-to-muzzle and flight are both swept');
  assert.equal(weapons.attack(position, 0), null, 'cooldown blocks repeated input');
  for (let i = 0; i < 10; i++) weapons.update(.1, .34 + i * .1, position);
  assert.equal(weapons.telemetry.arrowsActive, 0, 'bounced arrow falls out of the fixed pool');
});

test('an obstacle between body and muzzle catches the arrow at release', () => {
  const { weapons, position, wallZ } = setup('bow', .25);
  weapons.attack(position, 0);
  weapons.update(.24, .24, position);
  assert.equal(weapons.telemetry.impacts, 1);
  assert.equal(weapons.telemetry.lastImpact.point.z, wallZ);
  assert.equal(weapons.telemetry.arrowsFlying, 0);
});

test('sword blade moves across the actual front arc and reset restores loot', () => {
  const { weapons, position } = setup('sword');
  weapons.attack(position, 0);
  const tipXs = [];
  for (let i = 0; i < 12; i++) {
    weapons.update(.04, i * .04, position);
    const tip = weapons.telemetry.heldPose.swordTip;
    tipXs.push(tip.x);
    assert.ok(tip.z > .30, 'blade remains in front of the character');
  }
  assert.ok(Math.min(...tipXs) < -.7);
  assert.ok(Math.max(...tipXs) > .7);
  weapons.reset();
  assert.equal(weapons.equipped, null);
  assert.equal(weapons.telemetry.attackPhase, 'idle');
  assert.ok(weapons.items.every(item => !item.collected));
});
