import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { createSpellEffects } from '../src/spell-effects.js';

test('the lightning staff preserves its upload and has a bounded embedded model with measured grip and tip', () => {
  const path = 'assets/imported/tripo-lightning-staff/';
  const report = JSON.parse(readFileSync(path + 'inspections/lightning-staff.json'));
  const hash = b => createHash('sha256').update(b).digest('hex');
  assert.equal(hash(readFileSync(report.source.path)), report.source.sha256);
  const bytes = readFileSync(report.runtime.path);
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.ok(bytes.length <= 250000 && report.runtime.triangles <= 6000);
  assert.deepEqual(report.runtime.externalUris, []);
  assert.ok(report.normalization.gltfBounds[0][1] < 0 && report.normalization.gltfBounds[1][1] > 0);
  assert.ok(report.normalization.tipPoint[1] > .8);
  assert.ok(report.textures.every(t => Math.max(...t.after) <= 256));
});

function setup(targets = []) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const model = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.7, .1), new THREE.MeshStandardMaterial());
  body.position.y = .5; model.add(body); model.userData.weaponTipPoint = [0, 1.3, 0];
  const combat = createCombat(); targets.forEach(t => combat.addTarget(t));
  const segments = [], world = { worldRadius: 900, heightAt: () => 0,
    traceProjectile: (a, b) => { segments.push([a.clone(), b.clone()]); return null; } };
  const weapons = createWeapons(scene, actor, world, null, { combat,
    placements: [{ id: 'bolt', kind: 'lightningStaff', variant: 'kit-tripo-lightning-staff', position: [0, 0], rarity: 'common' }],
    tripoPrototypes: { 'kit-tripo-lightning-staff': model } });
  weapons.interact(actor.position); weapons.attack(actor.position, 0);
  return { weapons, combat, segments };
}

test('a fast lightning shot sweeps the first victim once, including coarse simulation frames', () => {
  const { weapons, combat } = setup([{ id: 'first', position: { x: 0, y: 0, z: 4 }, radius: .7, maxHealth: 100 },
    { id: 'second', position: { x: 0, y: 0, z: 8 }, radius: .7, maxHealth: 100 }]);
  for (let i = 0; i < 8; i++) weapons.update(.25, i * .25);
  assert.equal(weapons.telemetry.damageHits, 1);
  assert.equal(weapons.telemetry.lastDamage.damage, 23);
  assert.equal(weapons.telemetry.lastDamage.targetId, 'first');
  assert.equal(weapons.telemetry.effects.emitted.lightningStaff.impacts, 1);
  weapons.dispose(); combat.dispose?.();
});

test('the lightning projectile sweeps exactly its 24m range before retiring', () => {
  const { weapons, segments } = setup();
  for (let i = 0; i < 8; i++) weapons.update(.25, i * .25);
  const launch = weapons.telemetry.lastSpellLaunch.position;
  assert.ok(Math.abs(Math.max(...segments.map(([, b]) => b.z)) - launch.z - 24) < .0001);
  assert.equal(weapons.telemetry.effects.lightningProjectiles, 0); weapons.dispose();
});

test('lightning effects freeze, respect visibility, reuse buffers and expire on reset', () => {
  let visible = true;
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, { isVisible: () => visible });
  const p = effects.createProjectile(), origin = new THREE.Vector3(0, 1.5, 0);
  effects.channel('lightningStaff', origin, .4); effects.update(.05);
  scene.traverseVisible(part => {
    if (part.isMesh || part.isSprite) assert.ok(part.material?.isMaterial, 'casting must supply a renderable material');
  });
  effects.channel(null);
  effects.launch(p, 'lightningStaff', origin); effects.advance(p, origin, new THREE.Vector3(0, 1.5, 2), .1); effects.update(.1);
  assert.ok(p.lightning.group.visible && !p.fire.visible && !p.ice.visible);
  const trailColor = p.trail.material.uniforms.uMid.value;
  assert.ok(trailColor.b > trailColor.r && trailColor.b > trailColor.g, 'the lightning trail stays blue');
  const material = p.lightning.group.children[0].material, geometry = p.lightning.group.children[0].geometry;
  const age = material.uniforms.uAge.value; effects.update(0, 99);
  assert.equal(material.uniforms.uAge.value, age);
  visible = false; effects.update(.01); assert.equal(p.group.visible, false);
  visible = true; effects.impact('lightningStaff', origin); effects.end(p);
  for (let i = 0; i < 8; i++) effects.update(.1);
  assert.equal(effects.telemetry.activeBursts, 0);
  assert.equal(effects.telemetry.activeSmoke, 0);
  effects.launch(p, 'lightningStaff', origin); assert.equal(p.lightning.group.children[0].geometry, geometry);
  effects.reset(); assert.equal(effects.telemetry.lightningProjectiles, 0);
  effects.dispose(); assert.equal(scene.children.length, 0);
});
