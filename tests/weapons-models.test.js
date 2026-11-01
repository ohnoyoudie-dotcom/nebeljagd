import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createWeaponModelFactory, loadWeaponModels } from '../src/weapon-models.js';
import { TRIPO_WEAPON_DEFINITIONS } from '../src/map/tripo-weapon-definitions.js';

function fixture(kind = 'fireStaff') {
  const definition = { ...TRIPO_WEAPON_DEFINITIONS.find(entry => entry.kind === kind), tip: [.08, 1.17, -.03] };
  const template = new THREE.Group();
  const geometry = new THREE.BoxGeometry(.1, 1.5, .1);
  const materials = [new THREE.MeshStandardMaterial({ color: '#736fbc', transparent: true, opacity: .6, depthWrite: false }),
    new THREE.MeshStandardMaterial({ color: '#918b80' })];
  const mesh = new THREE.Mesh(geometry, materials); template.add(mesh);
  const factory = createWeaponModelFactory(new Map([[definition.variant, template]]), [definition]);
  return { definition, template, geometry, materials, factory };
}

function ready(kind = 'fireStaff') {
  const data = fixture(kind), scene = new THREE.Scene(), actor = new THREE.Group();
  scene.add(actor); actor.scale.setScalar(1.2); actor.rotation.y = .57; actor.position.set(4, .4, -2);
  const actualHand = new THREE.Vector3();
  const character = {
    setCombatState(pose) { if (pose) actualHand.copy(pose.rightHand).add(new THREE.Vector3(.035, -.02, .01)); },
    getHandPosition(side, target) { return target.copy(actualHand); },
  };
  const traces = [];
  const world = { heightAt: () => 0, traceProjectile(start, end) { traces.push({ start: { ...start }, end: { ...end } }); return null; } };
  const weapons = createWeapons(scene, actor, world, character, { weaponModels: data.factory,
    placements: [{ id: 'uploaded', kind, variant: data.definition.variant, rarity: 'rare', position: [4, -2] }] });
  weapons.interact(actor.position);
  const held = actor.children.find(child => child.userData.weaponModel?.variant === data.definition.variant);
  return { ...data, scene, actor, weapons, held, actualHand, traces };
}

test('model instances own geometry and array materials without altering their template', () => {
  const { factory, definition, template, geometry, materials } = fixture();
  const first = factory.create(definition.kind, definition.variant), second = factory.create(definition.kind, definition.variant);
  const a = first.children[0].children[0], b = second.children[0].children[0];
  assert.notEqual(a.geometry, geometry); assert.notEqual(a.geometry, b.geometry);
  assert.notEqual(a.material[0], materials[0]); assert.notEqual(a.material[0], b.material[0]);
  a.material[0].color.set('red');
  assert.equal(template.children[0].material[0].color.getHexString(), '736fbc');
  assert.equal(b.material[0].color.getHexString(), '736fbc');
  assert.equal(factory.create('sword', definition.variant), null, 'kind and variant must match');
});

test('imported sword stays on the actual hand through its swing and retains its variant', () => {
  const { definition, weapons, actualHand } = ready('sword');
  assert.equal(weapons.equippedItem.variant, definition.variant);
  weapons.attack(new THREE.Vector3(4, .4, -2), .57);
  const phases = new Set(), tips = [];
  for (let frame = 0; frame < 16; frame++) {
    weapons.update(.04, frame * .04);
    const telemetry = weapons.telemetry, pose = telemetry.heldWeapon;
    phases.add(telemetry.attackPhase); tips.push(pose.tip.x);
    assert.equal(pose.imported, true);
    assert.ok(new THREE.Vector3(pose.grip.x, pose.grip.y, pose.grip.z).distanceTo(actualHand) < 1e-9);
    assert.deepEqual(telemetry.heldPose.swordTip, pose.tip);
  }
  assert.ok(phases.has('windup') && phases.has('strike') && phases.has('follow-through'));
  assert.ok(Math.max(...tips) - Math.min(...tips) > 1, 'actual imported tip sweeps across the front arc');
});

test('both imported staves launch from their authored tip with character transforms applied', () => {
  for (const kind of ['fireStaff', 'iceStaff']) {
    const { definition, weapons, held, actor, scene } = ready(kind);
    weapons.attack(actor.position, actor.rotation.y);
    weapons.update(.25, .25, actor.position);
    const expected = held.localToWorld(new THREE.Vector3().fromArray(definition.tip)); scene.worldToLocal(expected);
    const telemetry = weapons.telemetry;
    assert.ok(new THREE.Vector3(...Object.values(telemetry.lastSpellOrigin)).distanceTo(expected) < 1e-9);
    assert.deepEqual(telemetry.lastSpellOrigin, telemetry.lastSpellTip);
    assert.equal(telemetry.lastSpellVariant, definition.variant);
    assert.notEqual(telemetry.lastSpellOrigin.y, actor.position.y + 1.4, 'authored tip height is not replaced with a fixed plane');
    assert.equal(telemetry.shotsFired, 1);
    assert.deepEqual(telemetry.heldWeapon.grip, telemetry.heldWeapon.hand);
  }
});

test('concealment preserves imported transparency and switching back restores procedural weapons', () => {
  const { actor, weapons, held, template } = ready();
  const mesh = held.children[0].children[0].children[0];
  actor.userData.concealmentOpacity = .4; weapons.update(.01, .01);
  assert.equal(mesh.material[0].opacity, .6 * .4); assert.equal(mesh.material[0].depthWrite, false);
  actor.userData.concealmentOpacity = 1; weapons.update(.01, .02);
  assert.equal(mesh.material[0].opacity, .6); assert.equal(mesh.material[0].transparent, true);
  assert.equal(mesh.material[0].depthWrite, false); assert.equal(mesh.material[1].transparent, false);
  assert.equal(template.children[0].material[0].opacity, .6);
  weapons.addDrop({ kind: 'fireStaff', variant: 'ember', position: [4, -2] }, { pop: false });
  weapons.interact(actor.position);
  assert.equal(weapons.equippedItem.variant, 'ember');
  assert.equal(weapons.telemetry.heldWeapon.imported, false);
});

test('reset disposes a dynamic imported copy without disposing the shared template or retained loot', () => {
  const { definition, factory, geometry } = fixture();
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const weapons = createWeapons(scene, actor, { heightAt: () => 0 }, null, { placements: [], weaponModels: factory });
  const drop = weapons.addDrop({ kind: definition.kind, variant: definition.variant, position: [0, 0] }, { pop: false });
  const copy = drop.visual.children[0].children[0].geometry;
  let copyDisposed = 0, templateDisposed = 0;
  copy.addEventListener('dispose', () => copyDisposed++); geometry.addEventListener('dispose', () => templateDisposed++);
  weapons.reset();
  assert.equal(copyDisposed, 1); assert.equal(templateDisposed, 0); assert.equal(weapons.items.length, 0);
  assert.equal(factory.create(definition.kind, definition.variant).children[0].children[0].geometry.attributes.position.count, geometry.attributes.position.count);
});

test('loader fetches each requested variant once and skips legacy/unused models', async () => {
  const requested = TRIPO_WEAPON_DEFINITIONS.find(entry => entry.kind === 'sword');
  const calls = [], template = fixture().template;
  const models = await loadWeaponModels([
    { kind: 'sword', variant: requested.variant }, { kind: 'sword', variant: requested.variant },
    { kind: 'fireStaff', variant: 'ember' },
  ], { [requested.variant]: 'test:sword' }, { loader: { async loadAsync(url) { calls.push(url); return { scene: template }; } } });
  assert.deepEqual(calls, ['test:sword']); assert.equal(models.has('sword', requested.variant), true);
  assert.equal(models.has('iceStaff', 'kit-tripo-ice-staff'), false);
});
