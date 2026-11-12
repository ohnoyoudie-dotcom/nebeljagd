import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';
import { createWeapons } from '../src/weapons.js';
import { createSpecialWeapons } from '../src/special-weapons.js';

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

for (const name of ['ice-crystal', 'feathered-arrow', 'crescent-moon', 'void-projectile', 'meteor-projectile']) test(`${name} preserves its upload and ships bounded, embedded PBR geometry`, () => {
  const packageName = name === 'meteor-projectile' ? 'tripo-meteor-projectile' : name === 'void-projectile' ? 'tripo-gravity-projectile'
    : name === 'crescent-moon' ? 'tripo-moon-projectile' : 'tripo-projectiles';
  const root = new URL(`../assets/imported/${packageName}/`, import.meta.url);
  const report = JSON.parse(readFileSync(new URL(`${name}-inspection.json`, root)));
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(readFileSync(new URL(`../${report.source}`, import.meta.url))), report.original.sha256);
  const bytes = readFileSync(new URL(`runtime/${name}.glb`, root));
  assert.equal(hash(bytes), report.runtime.sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < (name === 'meteor-projectile' ? 400 : name === 'void-projectile' ? 300 : 1536) * 1024);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.ok(doc.buffers.every(b => !b.uri));
  assert.equal(doc.images.length, 3);
  assert.ok(doc.images.every(image => image.bufferView !== undefined && !image.uri));
  const binStart = 20 + bytes.readUInt32LE(12) + 8;
  for (const image of doc.images) {
    const view = doc.bufferViews[image.bufferView], offset = binStart + (view.byteOffset ?? 0);
    const dimensions = imageSize(bytes.subarray(offset, offset + view.byteLength));
    assert.ok(dimensions.every(n => n > 0 && n <= (['meteor-projectile','void-projectile'].includes(name) ? 256 : 512)), 'actual embedded texture dimensions');
  }
  let triangles = 0;
  for (const mesh of doc.meshes) for (const part of mesh.primitives) {
    for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0']) assert.notEqual(part.attributes[attr], undefined);
    triangles += doc.accessors[part.indices ?? part.attributes.POSITION].count / 3;
  }
  assert.ok(triangles > 0 && triangles <= (name === 'void-projectile' ? 4000 : 6000));
  for (const mat of doc.materials) assert.ok(mat.normalTexture && mat.pbrMetallicRoughness.baseColorTexture && mat.pbrMetallicRoughness.metallicRoughnessTexture);
});

test('the imported crescent spins, pauses and returns without mutating or disposing its shared prototype', () => {
  const scene=new THREE.Scene(), prototype=new THREE.Group(), geometry=new THREE.TorusGeometry(.4,.1,6,12,Math.PI);
  const originalMaterial=new THREE.MeshStandardMaterial(), texture=new THREE.Texture();originalMaterial.map=texture;
  prototype.add(new THREE.Mesh(geometry,originalMaterial));prototype.userData.source='uploaded-moon';
  let visible=true,disposed=0;for(const resource of [geometry,originalMaterial,texture])resource.addEventListener('dispose',()=>disposed++);
  const special=createSpecialWeapons(scene,{heightAt:()=>0},null,'player',()=>{},()=>visible,{moonProjectilePrototype:prototype});
  const visual=scene.getObjectByName('Mondstab · Rückkehrende Sichel');
  assert.equal(special.telemetry.moonModel.source,'uploaded-moon');
  assert.equal(visual.children[0].children[0].geometry,geometry);
  assert.notEqual(visual.children[0].children[0].material,originalMaterial);
  assert.equal(visual.children[0].children[0].material.map,texture);
  const origin=new THREE.Vector3(0,1.4,0),player=new THREE.Vector3();special.launchMoon(origin,0,{});
  special.update(.2,player,.2);assert.ok(visual.rotation.y>0&&visual.visible);
  const position=visual.position.clone(),rotation=visual.rotation.y;special.update(0,player,10);
  assert.deepEqual(visual.position,position);assert.equal(visual.rotation.y,rotation);
  visible=false;special.update(.1,player,.3);assert.equal(visual.visible,false);
  for(let t=.3;t<2;t+=.05)special.update(.05,player,t);
  assert.equal(special.telemetry.moon,null);assert.equal(visual.visible,false);
  special.launchMoon(origin,0,{});special.reset();assert.equal(special.moonBusy,false);
  special.dispose();assert.equal(disposed,0);assert.equal(scene.children.length,0);
  geometry.dispose();originalMaterial.dispose();texture.dispose();
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
