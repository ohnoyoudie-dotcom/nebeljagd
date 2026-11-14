import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCombat } from '../src/combat.js';
import { createWeapons } from '../src/weapons.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { validateWorldmap } from '../src/map/model.js';
import { getVariantAsset } from '../src/map/asset-catalog.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function setup(type, worldExtra = {}) {
  const scene = new THREE.Scene(), actor = new THREE.Group(); scene.add(actor);
  const defeats = [], combat = createCombat({ onDefeat: result => defeats.push(result) });
  const target = combat.addTarget({ id: 'victim', position: new THREE.Vector3(0, 0, 4), radius: .8, maxHealth: 300 });
  const prototype = new THREE.Group(), body = new THREE.BoxGeometry(.1, 1.7, .1); body.translate(0,.5,0);
  prototype.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial()));
  const variant = type === 'sunStaff' ? 'kit-tripo-sun-staff' : 'kit-tripo-soul-staff';
  const world = { heightAt: () => 0, isLand: () => true, isWater: () => false, traceProjectile: () => null, ...worldExtra };
  const weapons = createWeapons(scene, actor, world, null, { combat, placements: [{ id: 'staff', kind: type, variant, position: [0,0], rarity: 'common' }], tripoPrototypes: { [variant]: prototype } });
  weapons.tryAutoPickup(actor.position);
  let time = 0;
  const tick = seconds => { for (let left = seconds; left > 1e-8; ) { const dt = Math.min(.02, left); time += dt; combat.update(dt); weapons.update(dt, time, actor.position); left -= dt; } };
  return { scene, actor, combat, target, weapons, tick, defeats, dispose() { weapons.dispose(); body.dispose(); prototype.children[0].material.dispose(); } };
}

test('integrated sun weapon requires release, charges range, pulses eight times and resets every effect', t => {
  const s = setup('sunStaff'); t.after(() => s.dispose());
  s.weapons.attack(s.actor.position, 0); s.weapons.aimAt(s.actor.position, s.target.position); s.tick(3);
  assert.equal(s.weapons.telemetry.shotsFired, 0); assert.equal(s.target.health, 300);
  assert.equal(s.weapons.releaseAttack(s.actor.position), true); s.tick(.399); assert.equal(s.target.health, 300);
  s.tick(.001); assert.equal(s.target.health, 297);
  s.tick(2.4); assert.equal(s.target.health, 276); assert.equal(s.weapons.telemetry.sun.hits, 8);
  assert.ok(Math.abs(s.target.blindRemaining - 1.7) < .025); assert.ok(Math.abs(s.target.revealRemaining - 2.2) < .025);
  s.weapons.reset(); s.combat.reset(); assert.equal(s.weapons.telemetry.sun.active, false); assert.equal(s.target.blindRemaining, 0);
});

test('integrated soul projectile marks three real hits, pauses its countdown, executes once and clears on reset', t => {
  const s = setup('soulStaff'); t.after(() => s.dispose());
  for (let hit = 1; hit <= 3; hit++) {
    assert.ok(s.weapons.attack(s.actor.position, 0)); s.tick(1.22);
    assert.equal(s.weapons.telemetry.soul.marks[0].count, hit); assert.equal(s.target.health, 300);
    const rune=s.scene.getObjectByName('Seelenrichter · Dreiteiliger Totenkopf');
    assert.ok(rune.visible && rune.position.y>=3.5,'rune clears the health bar and practice label');
    assert.equal(rune.children.slice(0,3).filter(piece=>piece.visible).length,hit,'every confirmed hit is visible immediately');
    if(hit===3)assert.ok(rune.getObjectByName('Sensenmann').isGroup, 'the apparition is sculpted geometry');
  }
  const before = s.weapons.telemetry.soul; s.weapons.update(0, 100); assert.deepEqual(s.weapons.telemetry.soul, before);
  s.tick(1.5); assert.equal(s.target.health, 0); assert.equal(s.defeats.length, 1); assert.equal(s.defeats[0].sourceId, 'player');
  assert.equal(s.weapons.telemetry.soul.marks.length, 0); assert.equal(s.weapons.telemetry.soul.visibleRunes, 0);
  s.tick(3); assert.equal(s.defeats.length, 1);
  s.weapons.reset(); s.combat.reset(); assert.equal(s.target.health, 300); assert.equal(s.weapons.telemetry.spellsActive, 0);
});

test('a wall stops soul projectiles before the victim and props never receive execute marks', t => {
  const s = setup('soulStaff', { traceProjectile(a, b) {
    if (a.z < 2 && b.z >= 2) { const k = (2-a.z)/(b.z-a.z); return { t: k, point: {x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k,z:2}, normal:{x:0,y:0,z:-1} }; }
    return null;
  } }); t.after(() => s.dispose());
  for (let i=0;i<3;i++) { s.weapons.attack(s.actor.position,0); s.tick(1.22); }
  assert.equal(s.target.health,300); assert.equal(s.weapons.telemetry.soul.marks.length,0); assert.equal(s.weapons.telemetry.impacts,3);
  const props = setup('soulStaff'); t.after(() => props.dispose()); props.target.destructible = true;
  props.weapons.attack(props.actor.position,0); props.tick(1.22); assert.equal(props.weapons.telemetry.soul.marks.length,0);
});

for (const [slug, label] of [['sun','Sonnenstab'], ['soul','Seelenrichterstab']]) test(`${label}: preserved original, bounded runtime and editor roundtrip`, () => {
  const report=JSON.parse(readFileSync(`assets/imported/tripo-${slug}-staff/inspections/${slug}-staff.json`));
  for (const file of [report.source,report.runtime]) { const bytes=readFileSync(file.path);assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256); }
  assert.ok(report.runtime.triangles<=9000);assert.ok(report.runtime.bytes<600000);assert.deepEqual(report.runtime.externalUris,[]);
  assert.ok(report.normalization.gltfBounds[0][1]<0 && report.normalization.gltfBounds[1][1]>0);
  const kind=slug+'Staff',variant=`kit-tripo-${slug}-staff`,map=JSON.parse(readFileSync('worldmap.json'));
  const object=makeWorldObject(kind,[0,0],{ id: 'new-staff',variant });map.objects.push(object);
  const normalized=normalizeWorldmap(map);assert.equal(normalized.objects.at(-1).kind,kind);assert.equal(validateWorldmap(normalized).errors.length,0);
  assert.ok(getVariantAsset(kind,variant).sourcePaths.includes(report.source.path));assert.ok(renderWorldmapSvg(normalized).includes(`world-object-${kind}`));
});

test('sun and soul channel effects leave a valid material on every visible mesh', t => {
 for (const type of ['sunStaff', 'soulStaff']) {
  const s=setup(type); t.after(()=>s.dispose()); s.weapons.attack(s.actor.position,0); s.tick(.1);
  assert.equal(s.weapons.telemetry.effects.channelVisible,true);
  s.scene.traverseVisible(part=>{ if(part.isMesh || part.isSprite) assert.ok(part.material,`${type}: ${part.name} has a renderable material`); });
 }
});
