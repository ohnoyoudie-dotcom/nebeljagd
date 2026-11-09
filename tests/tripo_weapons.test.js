import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWeapons, TRIPO_WEAPON_VARIANTS } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { weaponStats, rarityVisual } from '../src/loot-tiers.js';

// In-memory stand-ins exercise the runtime contract without a DOM/image loader.
// Browser smoke tests use the actual embedded GLBs and their texture maps.
function makePrototypes() {
  return Object.fromEntries(Object.entries(TRIPO_WEAPON_VARIANTS).map(([variant, type]) => {
    const group = new THREE.Group(); group.name = variant;
    const geometry = new THREE.BoxGeometry(.14, type === 'sword' ? 1.25 : 1.7, .08);
    geometry.translate(0, type === 'sword' ? .4375 : .5, 0);
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: '#784b2c', map: texture, normalMap: texture,
      roughnessMap: texture, emissive: '#331c0a', emissiveIntensity: .15 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `${variant}-mesh`;
    group.add(mesh);
    return [variant, group];
  }));
}

const variants = Object.entries(TRIPO_WEAPON_VARIANTS);
function setup(placements, options = {}, character = null) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const tripoPrototypes = options.tripoPrototypes ?? makePrototypes();
  const world = { worldRadius: 900, heightAt: () => 0, traceProjectile: () => null };
  const weapons = createWeapons(scene, actor, world, character, { placements, tripoPrototypes, ...options });
  return { scene, actor, weapons, tripoPrototypes };
}
const placement = (kind, variant, extras = {}) => ({ id: `${variant}-pickup`, kind, variant, position: [0, 0], rarity: 'rare', ...extras });
function meshes(root) { const result = []; root.traverse(part => { if (part.isMesh) result.push(part); }); return result; }
const near = (actual, expected, message) => assert.ok(actual.distanceTo(expected) < 1e-6, message);

test('Tripo variants require their real preloaded model and never silently use a procedural weapon', () => {
  for (const [variant, kind] of variants) {
    const scene = new THREE.Scene(), actor = new THREE.Group();
    assert.throws(() => createWeapons(scene, actor, {}, null, { placements: [placement(kind, variant)] }), /muss vor dem Platzieren geladen/);
    assert.equal(scene.children.length, 0); assert.equal(actor.children.length, 0);
  }
  assert.throws(() => setup([placement('iceStaff', 'kit-tripo-sword')]), /passt nicht/);
  const { weapons } = setup([]);
  assert.equal(weapons.items.length, 0, 'loading prototypes must not create default placements');
});

test('placed Tripo pickups keep authored transforms and original PBR textures with independent rarity halos', () => {
  const placements = variants.map(([variant, kind], index) => placement(kind, variant, {
    position: [20 + index * 5, -7], rotation: .9, scale: 1.4, rarity: index ? 'legendary' : 'rare',
  }));
  const snapshot = JSON.stringify(placements), heightAt = () => 2.5;
  const { weapons, tripoPrototypes } = setup(placements, { heightAt });
  for (const item of weapons.items) {
    const original = meshes(tripoPrototypes[item.variant])[0], model = meshes(item.visual)[0];
    assert.equal(item.model, 'tripo'); assert.equal(item.visual.userData.variant, item.variant);
    assert.equal(model.geometry, original.geometry, 'geometry remains shared with immutable prototype');
    assert.notEqual(model.material, original.material);
    assert.equal(model.material.map, original.material.map);
    assert.equal(model.material.normalMap, original.material.normalMap);
    assert.equal(model.material.roughnessMap, original.material.roughnessMap);
    assert.ok(model.material.color.equals(original.material.color));
    assert.ok(model.material.emissive.equals(original.material.emissive));
    assert.equal(model.material.emissiveIntensity, original.material.emissiveIntensity);
    assert.equal(item.ringMaterial.color.getHexString(), new THREE.Color(rarityVisual(item.rarity).color).getHexString());
    assert.deepEqual(item.group.position.toArray(), [item.x, 2.5, item.z]);
    assert.equal(item.group.rotation.y, .9); assert.equal(item.group.scale.x, 1.4);
    assert.equal(item.visual.scale.x, (item.type === 'sword' ? .8 : item.type === 'bow' ? .88 : .82) * 1.2,
      'weapon presentation enlarges independently of the authored placement scale');
    item.group.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(item.visual).getCenter(new THREE.Vector3());
    near(center, new THREE.Vector3(item.x, 2.5 + .75 * 1.4, item.z), 'ground preview centers the weapon above its halo');
  }
  assert.equal(JSON.stringify(placements), snapshot);
});

test('automatic pickup, manual swapping, inventory drops and reset preserve the selected Tripo variant', () => {
  const placements = variants.map(([variant, kind], index) => placement(kind, variant, {
    position: [index * 4, 0], rotation: .65, scale: 1.2,
  }));
  const hand = new THREE.Vector3(-.28, 1.32, .44);
  const character = { getHandPosition: (_side, result) => result.copy(hand), setCombatState() {} };
  const { weapons, actor } = setup(placements, {}, character);
  actor.scale.setScalar(1.2); actor.rotation.y = .7;
  const first = weapons.tryAutoPickup(actor.position);
  assert.equal(first.automatic, true); assert.equal(first.variant, 'kit-tripo-sword');
  for (const [index, [variant, kind]] of variants.entries()) {
    actor.position.set(index * 4, 0, 0);
    if (index) {
      assert.equal(weapons.tryAutoPickup(actor.position), null, 'auto-pickup never replaces an equipped weapon');
      assert.equal(weapons.interact(actor.position).variant, variant);
      const previous = weapons.items.find(item => item.id === placements[index - 1].id);
      assert.equal(previous.collected, false, 'the previous imported weapon becomes a ground pickup again');
      assert.equal(previous.group.visible, true);
      assert.equal(previous.variant, placements[index - 1].variant);
      assert.equal(previous.model, 'tripo');
      assert.deepEqual(previous.group.position.toArray(), [index * 4, 0, 0]);
      assert.equal(previous.group.rotation.y, .65); assert.equal(previous.group.scale.x, 1.2);
    }
    assert.equal(weapons.equippedItem.variant, variant); assert.equal(weapons.equippedItem.model, 'tripo');
    assert.equal(weapons.equippedItem.damage, weaponStats(kind, 'rare').damage);
    assert.equal(weapons.equippedItem.id, placements[index].id);
    assert.equal(weapons.telemetry.heldModel.variant, variant);
    assert.equal(weapons.telemetry.heldModel.meshCount, 1);
    const held = actor.children.find(group => group.userData.weaponType === kind && group.visible);
    assert.ok(Math.abs(held.scale.x / weapons.items[index].visual.scale.x - (kind === 'bow' ? 1.18 : .88)/1.2)<1e-10, 'held bow fits the arrow while other weapons retain their smaller hand scale');
    near(held.position, hand, 'model grip stays at the animated hand');
    actor.updateWorldMatrix(true, true);
    near(held.children[0].children[0].getWorldPosition(new THREE.Vector3()),
      actor.localToWorld(hand.clone()), 'grip alignment survives actor rotation and scale');
    const dropped = weapons.addDrop({ ...weapons.equippedItem, id: `redrop-${kind}`, position: [30 + index * 4, 2] }, { pop: false });
    assert.equal(dropped.variant, variant); assert.equal(dropped.model, 'tripo');
    assert.equal(dropped.group.scale.x, 1.2); assert.equal(dropped.group.rotation.y, .65);
  }
  weapons.reset();
  assert.equal(weapons.equippedItem, null); assert.equal(weapons.telemetry.heldModel, null);
  assert.equal(weapons.items.length, variants.length);
  assert.ok(weapons.items.every(item => !item.collected && item.group.visible));
  assert.deepEqual(weapons.items.map(item => [item.x, item.z]), placements.map(item => item.position));
  actor.position.set(0, 0, 0);
  assert.equal(weapons.tryAutoPickup(actor.position).variant, 'kit-tripo-sword');
});

test('both imported staffs follow the palm socket through motion and cast from their actual moved tip', () => {
  for (const [variant, type] of variants.filter(([, type]) => type.endsWith('Staff'))) {
    const wrist = new THREE.Vector3(-.26, 1.22, .38);
    const palm = new THREE.Vector3(-.24, 1.215, .46);
    const character = { setCombatState() {},
      getHandPosition: (_side, target) => target.copy(wrist),
      getGripPosition: (side, target) => { assert.equal(side, 'right'); return target.copy(palm); } };
    const { scene, actor, weapons } = setup([placement(type, variant)], {}, character);
    weapons.interact(actor.position);
    actor.scale.setScalar(1.2); actor.rotation.y = .7; actor.position.set(4, 1, -3);
    const held = actor.children.find(group => group.userData.weaponType === type);
    for (let frame = 0; frame < 8; frame++) {
      palm.set(-.24 + frame * .002, 1.215 + Math.sin(frame) * .02, .46 + frame * .004);
      weapons.update(.04, frame * .04, actor.position);
      near(held.position, palm, 'staff follows the current palm, not the old wrist anchor');
      near(held.children[0].getWorldPosition(new THREE.Vector3()), actor.localToWorld(palm.clone()),
        'the imported grip origin remains attached after actor translation, rotation and scale');
      assert.ok(held.position.distanceTo(wrist) > .06);
      assert.equal(weapons.telemetry.heldGrip.error, 0);
    }
    weapons.attack(actor.position, actor.rotation.y);
    if (type === 'poisonStaff' || type === 'gravityStaff') weapons.releaseAttack(actor.position);
    else for (let frame = 0; frame < 3; frame++) weapons.update(.1, .4 + frame * .1, actor.position);
    const flash = weapons.telemetry.effects.bursts.find(burst => burst.kind === 'muzzle');
    assert.ok(flash, 'the moved staff still releases a visible cast effect');
    const tip = held.localToWorld(new THREE.Vector3(0, held.userData.weaponTipY, 0));
    scene.worldToLocal(tip);
    near(new THREE.Vector3(flash.position.x, flash.position.y, flash.position.z), tip,
      'muzzle effect follows the corrected physical staff tip');
    assert.equal(weapons.telemetry.shotsFired, 1);
    weapons.dispose();
  }
});

test('variant replacement and reset dispose only instance resources, preserving templates and other pickups', () => {
  const { weapons, actor, tripoPrototypes } = setup([
    placement('iceStaff', 'kit-tripo-crystal-staff'), placement('iceStaff', 'frost', { position: [4, 0] }),
  ]);
  const template = meshes(tripoPrototypes['kit-tripo-crystal-staff'])[0];
  let sharedGeometryDisposed = 0, sharedMaterialDisposed = 0, sharedTextureDisposed = 0;
  template.geometry.addEventListener('dispose', () => sharedGeometryDisposed++);
  template.material.addEventListener('dispose', () => sharedMaterialDisposed++);
  template.material.map.addEventListener('dispose', () => sharedTextureDisposed++);
  weapons.interact(actor.position);
  const held = actor.children.find(group => group.userData.weaponType === 'iceStaff');
  const heldMaterial = meshes(held)[0].material;
  let heldDisposed = 0; heldMaterial.addEventListener('dispose', () => heldDisposed++);
  const dropped = weapons.addDrop({ ...weapons.equippedItem, position: [8, 0] }, { pop: false });
  let dropDisposed = 0, baseDisposed = 0;
  meshes(dropped.visual)[0].material.addEventListener('dispose', () => dropDisposed++);
  meshes(weapons.items[0].visual)[0].material.addEventListener('dispose', () => baseDisposed++);
  actor.position.x = 4; weapons.interact(actor.position);
  assert.equal(heldDisposed, 1, 'replacing an imported held model releases its material');
  assert.equal(weapons.telemetry.heldModel.model, 'procedural');
  weapons.reset();
  assert.equal(dropDisposed, 1); assert.equal(baseDisposed, 0);
  actor.position.x = 0; weapons.interact(actor.position);
  assert.equal(weapons.telemetry.heldModel.model, 'tripo', 'disposed instance does not corrupt another clone');
  weapons.dispose(); weapons.dispose();
  assert.equal(baseDisposed, 1); assert.equal(dropDisposed, 1); assert.equal(heldDisposed, 1);
  assert.equal(sharedGeometryDisposed, 0); assert.equal(sharedMaterialDisposed, 0); assert.equal(sharedTextureDisposed, 0);
  assert.equal(actor.children.length, 0);
});

test('held imported material arrays conceal independently and restore their original transparency', () => {
  const tripoPrototypes = makePrototypes(), template = meshes(tripoPrototypes['kit-tripo-crystal-staff'])[0];
  const second = template.material.clone(); second.transparent = true; second.opacity = .8; second.depthWrite = false;
  template.material = [template.material, second];
  const { weapons, actor } = setup([placement('iceStaff', 'kit-tripo-crystal-staff')], { tripoPrototypes });
  weapons.interact(actor.position);
  const held = actor.children.find(group => group.userData.weaponType === 'iceStaff');
  const materials = meshes(held)[0].material;
  actor.userData.concealmentOpacity = .3; weapons.update(.1, .1);
  assert.equal(materials[0].opacity, .3); assert.equal(materials[1].opacity, .24);
  assert.equal(template.material[0].opacity, 1); assert.equal(second.opacity, .8);
  actor.userData.concealmentOpacity = 1; weapons.update(.1, .2);
  assert.equal(materials[0].transparent, false); assert.equal(materials[0].depthWrite, true);
  assert.equal(materials[1].transparent, true); assert.equal(materials[1].opacity, .8); assert.equal(materials[1].depthWrite, false);
});

test('Tripo sword and staffs retain real melee, ranged damage, burn and slow behavior', () => {
  for (const [variant, kind] of variants) {
    const combat = createCombat();
    const target = combat.addTarget({ id: 'target', position: { x: 0, y: 0, z: kind === 'sword' ? 1.6 : 4 }, radius: .65, maxHealth: 500 });
    const { weapons, actor } = setup([placement(kind, variant, { rarity: 'legendary' })], { combat });
    weapons.interact(actor.position); weapons.attack(actor.position, 0);
    if (kind === 'bow') weapons.releaseAttack(actor.position);
    if (kind === 'poisonStaff') { weapons.aimAt(actor.position, target.position); weapons.update(1.2, 0, actor.position); weapons.releaseAttack(actor.position); }
    if (kind === 'gravityStaff') { weapons.aimAt(actor.position, target.position); weapons.releaseAttack(actor.position); }
    const tips = [];
    for (let i = 0; i < (kind === 'poisonStaff' ? 110 : kind === 'gravityStaff' ? 50 : 24); i++) { weapons.update(.04, i * .04); tips.push(weapons.telemetry.heldPose.swordTip.x); }
    const expected = weaponStats(kind, 'legendary');
    assert.ok(Math.abs(target.health - (500 - expected.damage)) < 1e-6, `${variant} deals the tier damage, spread over the cloud lifetime for poison`);
    if (kind === 'poisonStaff') assert.ok(weapons.telemetry.damageHits > 1);
    else assert.equal(weapons.telemetry.damageHits, 1);
    assert.equal(weapons.equippedItem.variant, variant);
    if (kind === 'sword') assert.ok(Math.max(...tips) - Math.min(...tips) > 1.4, 'imported blade follows the attack arc');
    if (kind === 'fireStaff') {
      assert.equal(target.burnRemaining, 3); combat.update(3);
      assert.equal(target.health, 500 - expected.damage - 3 * expected.burn.damagePerSecond);
    }
    if (kind === 'iceStaff') { assert.equal(target.speedMultiplier, .5); combat.update(3); assert.equal(target.speedMultiplier, 1); }
  }
});
