import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { createChests } from '../src/chests.js';

const root = new URL('../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, root));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function glb(path) {
  const bytes = read(path);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  return { bytes, doc: JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) };
}

test('Tripo chest preserves its source, embedded PBR maps and a separate metric rear hinge', () => {
  const report = JSON.parse(read('assets/imported/tripo-chest/inspection.json'));
  assert.equal(sha(read(report.source.path)), report.source.sha256);
  const { bytes, doc } = glb(report.runtime.path);
  assert.equal(sha(bytes), report.runtime.sha256);
  assert.ok(bytes.length < 4 * 1024 * 1024);
  assert.ok(report.runtime.triangles <= 16000);
  assert.deepEqual(report.runtime.externalUris, []);
  assert.ok(doc.images.length >= 3);
  const lid = doc.nodes.find(node => node.name === 'chest-lid');
  const body = doc.nodes.find(node => node.name === 'chest-body');
  assert.ok(lid && body);
  assert.ok(lid.children.length > 0, 'hinge has an actual separate lid mesh');
  assert.ok(Math.abs(lid.translation[1] - .57) < .001);
  assert.ok(Math.abs(lid.translation[2] + .515) < .001);
  assert.ok(!lid.children.includes(doc.nodes.indexOf(body)), 'the body cannot rotate with the lid');
  assert.ok(report.normalization.gltfDimensions[0] >= 1.7 && report.normalization.gltfDimensions[0] <= 1.74);
});

function prototype() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, .57, 1.13), new THREE.MeshStandardMaterial());
  body.name = 'chest-body'; group.add(body);
  const lid = new THREE.Group(); lid.name = 'chest-lid'; lid.position.set(0, .57, -.515);
  lid.add(new THREE.Mesh(new THREE.BoxGeometry(1.72, .4, 1.13), body.material)); group.add(lid);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(1.2), new THREE.MeshBasicMaterial());
  halo.name = 'chest-halo'; group.add(halo);
  return group;
}
const placement = { id: 'tripo-chest', kind: 'chest', variant: 'kit-tripo-chest', position: [2, 3], rotation: .7, scale: 1.2 };

test('Tripo instances share model resources but each opens its own lid and releases loot once', () => {
  const asset = prototype(), drops = [], scene = new THREE.Scene();
  const chest = createChests(scene, { placements: [placement, { ...placement, id: 'second', position: [8, 3] }],
    tripoPrototype: asset, onDrop: item => drops.push(item) });
  const [first, second] = chest.items;
  assert.equal(first.variant, 'kit-tripo-chest'); assert.equal(first.model, 'tripo');
  assert.equal(first.group.scale.x, 1.2); assert.equal(first.group.rotation.y, .7);
  assert.equal(first.group.getObjectByName('chest-body').geometry, second.group.getObjectByName('chest-body').geometry);
  assert.notEqual(first.lid, second.lid);
  assert.ok(chest.interact({ x: 2, y: 0, z: 4.5 }));
  chest.update(.15, .15, { x: 2, z: 4.5 });
  assert.ok(first.lid.rotation.x < 0); assert.ok(Math.abs(second.lid.rotation.x) < .0001);
  assert.ok(Math.abs(first.group.getObjectByName('chest-body').rotation.x) < .0001);
  assert.equal(drops.length, 0);
  chest.update(.5, .65, { x: 2, z: 4.5 });
  assert.ok(Math.abs(first.lid.rotation.x + 1.9) < .0001);
  assert.equal(drops.filter(item => item.kind === 'gold').length, 2);
  assert.equal(drops.length, 3);
  chest.update(1, 1.65, { x: 2, z: 4.5 }); assert.equal(drops.length, 3);
  chest.reset(); assert.equal(first.lid.rotation.x, 0); assert.equal(first.opened, false);
  chest.dispose(); assert.equal(scene.children.length, 0);
});

test('Tripo chests obey visibility and wall reachability, and never silently use the old mesh', () => {
  assert.throws(() => createChests(new THREE.Scene(), { placements: [placement] }), /geladen/);
  const asset = prototype();
  const chests = createChests(new THREE.Scene(), { placements: [placement], tripoPrototype: asset,
    isVisible: () => false });
  chests.update(0, 0, { x: 2, z: 4 });
  assert.equal(chests.items[0].group.visible, false);
  assert.equal(chests.interact({ x: 2, z: 4 }), null);
  chests.dispose();
  const blocked = createChests(new THREE.Scene(), { placements: [placement], tripoPrototype: prototype(),
    world: { traceProjectile: () => ({ kind: 'wall' }) } });
  assert.equal(blocked.interact({ x: 2, z: 4 }), null);
  blocked.dispose();
});
