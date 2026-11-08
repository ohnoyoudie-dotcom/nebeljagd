import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWeapons } from '../src/weapons.js';
import { createCombat } from '../src/combat.js';
import { createCollisionIndex } from '../src/collision.js';
import { createSpecialWeapons } from '../src/special-weapons.js';
import { makeWorldObject, normalizeWorldmap, isObjectPlaceable } from '../src/map/objects.js';
import { getVariantAsset, getVariantPreviewSvg } from '../src/map/asset-catalog.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { RARITIES, weaponStats } from '../src/loot-tiers.js';

const variant = 'kit-tripo-star-staff';
const inspection = JSON.parse(readFileSync(new URL('../assets/imported/tripo-star-moon/inspections/star-staff.json', import.meta.url)));
function starPrototype() {
  const bounds = inspection.normalization.gltfBounds;
  const size = bounds[0].map((min, i) => bounds[1][i] - min);
  const center = bounds[0].map((min, i) => (bounds[1][i] + min) / 2);
  const geometry = new THREE.BoxGeometry(...size); geometry.translate(...center);
  const material = new THREE.MeshStandardMaterial();
  const model = new THREE.Group(); model.add(new THREE.Mesh(geometry, material));
  model.userData.weaponTipPoint = [...inspection.normalization.tipPoint];
  model.userData.weaponSource = inspection.source.path;
  return { model, dispose() { geometry.dispose(); material.dispose(); } };
}

test('the star staff is an independent placeable model through every rarity, schema, JSON and SVG export', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/editor-project-worldmap.json', import.meta.url)));
  const before = JSON.stringify(baseline);
  assert.ok(isObjectPlaceable('starStaff', variant));
  const asset = getVariantAsset('starStaff', variant);
  assert.equal(asset.renderer, 'src/tripo-weapons.js');
  assert.deepEqual(asset.sourcePaths, ['assets/imported/tripo-star-moon/runtime/star-staff.glb', inspection.source.path]);
  assert.match(getVariantPreviewSvg('starStaff', variant), /data:image\/webp;base64,/);
  for (const rarity of Object.keys(RARITIES)) {
    const map = structuredClone(baseline);
    map.objects = [makeWorldObject('starStaff', [30, -42], { id: 'new-star', rarity })];
    const restored = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
    assert.deepEqual(restored, map); assert.deepEqual(validateWorldmap(restored).errors, []);
    const svg = renderWorldmapSvg(restored);
    assert.match(svg, /id="world-object-starStaff"/); assert.match(svg, /href="#world-object-starStaff"/);
  }
  const schema = JSON.parse(readFileSync(new URL('../worldmap.schema.json', import.meta.url))).$defs.worldObject;
  assert.ok(schema.properties.kind.enum.includes('starStaff'));
  assert.ok(schema.allOf.find(r => r.if.properties?.kind?.const === 'starStaff').then.properties.variant.enum.includes(variant));
  assert.equal(JSON.stringify(baseline), before);
});

test('a real-sized star staff fires a distinct straight bolt, damages once, and respects near cover', () => {
  for (const blocked of [false, true]) for (const delta of [1 / 60, .1, .25]) {
    const scene = new THREE.Scene(), actor = new THREE.Group(); actor.scale.setScalar(1.2); scene.add(actor);
    const proto = starPrototype(), combat = createCombat();
    const target = combat.addTarget({ id: 'enemy', position: { x: 0, y: 0, z: 4 }, radius: .52, height: 2.25, maxHealth: 140 });
    const boxes = blocked ? [{ minX: -2, maxX: 2, minY: 0, maxY: 2.5, minZ: 1.9, maxZ: 2.1, type: 'wall' }] : [];
    const index = createCollisionIndex([], boxes);
    const weapons = createWeapons(scene, actor, { heightAt: () => 0, traceProjectile: (a, b, r) => index.traceSegment(a, b, r) }, null,
      { combat, tripoPrototypes: { [variant]: proto.model }, placements: [{ id: 'star', kind: 'starStaff', variant, rarity: 'rare', position: [0, 0] }] });
    weapons.interact(actor.position);
    assert.equal(weapons.telemetry.heldModel.model, 'tripo');
    assert.equal(weapons.telemetry.heldModel.source, inspection.source.path);
    weapons.attack(actor.position, 0);
    for (let t = delta; t < 1.3; t += delta) weapons.update(delta, t, actor.position);
    const state = weapons.telemetry;
    assert.equal(state.shotsFired, 1); assert.equal(state.special.moon, null);
    assert.equal(state.effects.emitted.starStaff.launches, 1);
    assert.equal(state.effects.starProjectileStyle, 'gold-star-blue-trail');
    assert.equal(state.effects.emitted.starStaff.impacts, 1);
    assert.equal(state.damageHits, blocked ? 0 : 1);
    assert.equal(target.health, 140 - (blocked ? 0 : weaponStats('starStaff', 'rare').damage));
    if (blocked) assert.equal(state.lastImpact.type, 'wall');
    assert.equal(state.spellsActive, 0);
    weapons.reset(); assert.equal(weapons.telemetry.effects.starProjectiles, 0);
    weapons.dispose(); proto.dispose();
  }
});

test('the uploaded moon clone returns and resets without mutating or disposing the source model', () => {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(1, 1.2, .15), material = new THREE.MeshStandardMaterial({ color: '#cad1df' });
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  prototype.userData = { source: 'assets/inbox/crescent moon prop 3d model.glb', triangles: 12, silhouettePlane: 'XY' };
  let disposedSource = false; geometry.addEventListener('dispose', () => { disposedSource = true; });
  const special = createSpecialWeapons(scene, { heightAt: () => 0, traceProjectile: () => null }, null, 'player', () => {}, () => true,
    { moonProjectilePrototype: prototype });
  const player = new THREE.Vector3();
  const visual = scene.getObjectByName('Mondstab · Rückkehrende Sichel');
  assert.equal(visual.children[0].children[0].geometry, geometry);
  assert.equal(visual.children[0].rotation.x, -Math.PI / 2);
  assert.equal(visual.rotation.x, 0);
  special.launchMoon(new THREE.Vector3(0, 1.4, 0), 0, { type: 'moonStaff', damage: 22 });
  assert.equal(special.telemetry.moonModel.imported, true);
  assert.equal(special.telemetry.moonModel.source, prototype.userData.source);
  assert.equal(special.telemetry.moonVisible, true);
  special.update(.1, player, .1);
  assert.ok(visual.rotation.y > 0, 'the horizontal crescent rotates about world Y');
  assert.equal(prototype.rotation.x, 0, 'orienting the clone preserves the source');
  for (let t = 1 / 60; t < 2; t += 1 / 60) special.update(1 / 60, player, t);
  assert.equal(special.telemetry.moon, null); assert.equal(special.telemetry.moonVisible, false);
  special.launchMoon(new THREE.Vector3(0, 1.4, 0), 0, { type: 'moonStaff', damage: 22 }); special.reset();
  assert.equal(special.telemetry.moon, null);
  special.dispose(); assert.equal(disposedSource, false);
  assert.equal(material.color.getHexString(), 'cad1df');
  geometry.dispose(); material.dispose();
});
