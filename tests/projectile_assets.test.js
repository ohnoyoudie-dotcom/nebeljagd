import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';
import { createWeapons } from '../src/weapons.js';

function imageSize(bytes) {
  if (bytes.toString('ascii', 1, 4) === 'PNG') return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  let offset = 2;
  while (offset < bytes.length) {
    assert.equal(bytes[offset++], 0xff);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    offset += length;
  }
  throw new Error('Missing JPEG dimensions');
}

for (const name of ['ice-crystal', 'feathered-arrow']) test(`${name} preserves its upload and ships bounded, embedded PBR geometry`, () => {
  const root = new URL('../assets/imported/tripo-projectiles/', import.meta.url);
  const report = JSON.parse(readFileSync(new URL(`${name}-inspection.json`, root)));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(readFileSync(new URL(`../${report.source}`, import.meta.url))), report.original.sha256);
  const bytes = readFileSync(new URL(`runtime/${name}.glb`, root));
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 1536 * 1024);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(doc.buffers.every(b => !b.uri));
  assert.equal(doc.images.length, 3);
  assert.ok(doc.images.every(image => image.bufferView !== undefined && !image.uri));
  const binStart = 20 + bytes.readUInt32LE(12) + 8;
  for (const image of doc.images) {
    const view = doc.bufferViews[image.bufferView], offset = binStart + (view.byteOffset ?? 0);
    const dimensions = imageSize(bytes.subarray(offset, offset + view.byteLength));
    assert.ok(dimensions.every(n => n > 0 && n <= 512), 'actual embedded texture dimensions');
  }
  let triangles = 0;
  for (const mesh of doc.meshes) for (const part of mesh.primitives) {
    for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(part.attributes[attr], undefined);
    triangles += doc.accessors[part.indices ?? part.attributes.POSITION].count / 3;
  }
  assert.ok(triangles > 0 && triangles <= 6000);
  for (const mat of doc.materials) assert.ok(mat.normalTexture && mat.pbrMetallicRoughness.baseColorTexture && mat.pbrMetallicRoughness.metallicRoughnessTexture);
});

test('ice uses the uploaded mesh with independent materials; swaps, fog, reset and disposal preserve prototype ownership', () => {
  const geometry = new THREE.IcosahedronGeometry(.2), material = new THREE.MeshStandardMaterial();
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  let visible = true, disposed = 0;
  for (const resource of [geometry, material]) resource.addEventListener('dispose', () => disposed++);
  const effects = createSpellEffects(new THREE.Scene(), { iceProjectilePrototype: prototype, isVisible: () => visible });
  const visual = effects.createProjectile(), point = new THREE.Vector3(0, 1, 0);
  effects.launch(visual, 'iceStaff', point);
  assert.equal(effects.telemetry.importedIceProjectiles, 1);
  assert.equal(visual.crystal.visible, false); assert.equal(visual.coldCore.visible, false);
  assert.ok(visual.iceModel.visible);
  assert.notEqual(visual.iceModel.children[0].material, material);
  assert.equal(visual.iceModel.children[0].geometry, geometry);
  visible = false; effects.update(.1); assert.equal(visual.group.visible, false);
  effects.launch(visual, 'fireStaff', point); assert.equal(visual.iceModel.visible, false);
  effects.reset(); assert.equal(effects.telemetry.importedIceProjectiles, 0);
  effects.dispose(); assert.equal(disposed, 0);
  geometry.dispose(); material.dispose();
});

test('nocked and flying arrows share uploaded geometry but own their mutable materials', () => {
  const scene = new THREE.Scene(), character = new THREE.Group(); scene.add(character);
  const geometry = new THREE.ConeGeometry(.1, 1), material = new THREE.MeshStandardMaterial();
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  prototype.userData.source = 'uploaded-arrow';
  let disposed = 0;
  for (const resource of [geometry, material]) resource.addEventListener('dispose', () => disposed++);
  const weapons = createWeapons(scene, character, { heightAt: () => 0 }, null, { placements: [], projectilePrototypes: { arrow: prototype } });
  const arrows = [character.getObjectByName('Aufgelegter Pfeil'), ...scene.children.filter(p => p.name === 'Fliegender Pfeil')];
  assert.equal(arrows.length, 9);
  const copies = [];
  for (const arrow of arrows) {
    assert.equal(arrow.userData.projectileSource, 'uploaded-arrow');
    arrow.traverse(part => { if (part.geometry === geometry) copies.push(part.material); });
  }
  assert.equal(copies.length, 9); assert.equal(new Set(copies).size, 9);
  assert.ok(copies.every(m => m !== material));
  weapons.dispose(); assert.equal(disposed, 0);
  geometry.dispose(); material.dispose();
});
