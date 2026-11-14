import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createSpellEffects } from '../src/spell-effects.js';

test('soul projectile preserves the uploaded GLB and archive and meets the runtime asset budget', () => {
  const root = 'assets/imported/tripo-soul-projectile/';
  const manifest = JSON.parse(readFileSync(root + 'runtime-manifest.json'));
  for (const file of manifest.sources) {
    assert.equal(createHash('sha256').update(readFileSync(file.path)).digest('hex'), file.sha256);
  }
  for (const file of manifest.files) {
    const bytes = readFileSync(root + file.path);
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const bytes = readFileSync(root + 'runtime/soul-projectile.glb');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.ok(bytes.length < 1.5 * 1024 * 1024);
  let triangles = 0;
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    assert.ok(primitive.attributes.NORMAL != null && primitive.attributes.TEXCOORD_0 != null);
    triangles += gltf.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
  }
  assert.ok(triangles > 0 && triangles <= 6000);
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView != null && !image.uri));
});

test('a rounded cloud replaces the hard soul model while preserving shared source assets', () => {
  const geometry = new THREE.ConeGeometry(.2, 1), texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const prototype = new THREE.Group(); prototype.add(new THREE.Mesh(geometry, material));
  prototype.userData.source = 'assets/inbox/Seelenrichterstab Projektil.glb';
  let sharedDisposed = 0;
  for (const resource of [geometry, texture, material]) resource.addEventListener('dispose', () => sharedDisposed++);
  const scene = new THREE.Scene(), effects = createSpellEffects(scene, { soulProjectilePrototype: prototype });
  const visual = effects.createProjectile(), second = effects.createProjectile();
  effects.launch(visual, 'soulStaff', new THREE.Vector3(), Math.PI / 2);
  assert.equal(visual.type, 'soulStaff'); assert.equal(visual.soul.visible, true);
  assert.equal(visual.fire.visible, false); assert.equal(visual.ice.visible, false);
  assert.ok(visual.halo.material.opacity <= .15, 'the dark projectile is not hidden by a bright halo');
  assert.equal(visual.soulShroud, undefined, 'no sharp ribbon geometry remains');
  const copy = visual.soulModel.children[0];
  assert.notEqual(copy.material, material); assert.notEqual(copy.material, second.soulModel.children[0].material);
  assert.ok(copy.material.transparent && copy.material.opacity < 1);
  assert.equal(material.opacity, 1, 'shared source material stays opaque');
  assert.equal(copy.geometry, geometry); assert.equal(copy.material.map, texture);
  effects.advance(visual, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), .1, .1);
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(visual.group.quaternion).x > .999);
  assert.equal(effects.telemetry.importedSoulProjectiles, 0);
  assert.equal(visual.soulModel.visible, false);
  assert.equal(effects.telemetry.soulCloudProjectiles, 1);
  assert.equal(visual.soulCloud.root.children.length, 1);
  assert.equal(effects.telemetry.activeSmoke, 0);
  assert.equal(visual.trail.visible, false);
  effects.end(visual); effects.launch(visual, 'fireStaff', new THREE.Vector3());
  assert.equal(visual.soul.visible, false); assert.equal(visual.halo.material.opacity, .32);
  effects.dispose(); effects.dispose();
  assert.equal(scene.children.length, 0); assert.equal(sharedDisposed, 0);
  geometry.dispose(); material.dispose(); texture.dispose();
});
