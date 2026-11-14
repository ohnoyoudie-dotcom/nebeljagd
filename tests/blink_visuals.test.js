import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBlinkVisuals } from '../src/blink-visuals.js';

test('blink snapshots the posed skin in world metres without changing the avatar or its source resources', () => {
  const scene = new THREE.Group(); scene.scale.setScalar(1.7);
  const actor = new THREE.Group(); scene.add(actor); actor.position.set(3, 0, 7); actor.rotation.y = .6;
  const geometry = new THREE.BoxGeometry(.5, 1.8, .3), count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4); for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const material = new THREE.MeshStandardMaterial({ color: '#654321', transparent: true, opacity: .4 });
  const skin = new THREE.SkinnedMesh(geometry, material), bone = new THREE.Bone(); skin.add(bone); actor.add(skin);
  actor.updateWorldMatrix(true, true); skin.bind(new THREE.Skeleton([bone])); bone.position.y = .3;
  // Teleport moves the whole rig before capturing. Attached skins must refresh
  // bindMatrixInverse too, otherwise the ghost is displaced by the jump twice.
  actor.position.z += 8;
  const original = geometry.attributes.position.array.slice(), before = material.toJSON();
  let sourceDisposed = false; geometry.addEventListener('dispose', () => { sourceDisposed = true; });
  material.addEventListener('dispose', () => { sourceDisposed = true; });
  const fx = createBlinkVisuals(scene, null, { avatarRoot: actor, avatarMeshes: [skin] });
  fx.trigger(new THREE.Vector3(0, 0, 0), actor.position.clone()); fx.update(.08);
  const root = scene.getObjectByName('Teleport · Lichtimpuls'), departure = root.getObjectByName('Start'), arrival = root.getObjectByName('Ankunft');
  const ghost = departure.children[0].children[0];
  const expected = skin.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(skin.matrixWorld);
  scene.worldToLocal(expected).sub(actor.position);
  const actual = new THREE.Vector3().fromBufferAttribute(ghost.geometry.attributes.position, 0);
  assert.ok(actual.distanceTo(expected) < 1e-6, 'afterimage uses the deformed pose, not the bind pose');
  assert.ok(Math.abs(actual.z) < 1, 'the teleport offset is not baked into the body twice');
  const arrivalSkin = arrival.children[0].children[0];
  assert.equal(arrivalSkin.geometry, skin.geometry, 'arrival lights the live skin rather than a frozen duplicate');
  actor.position.x += 2; actor.updateWorldMatrix(true, true); fx.update(.02);
  assert.ok(Math.abs(arrival.children[0].position.x - 2) < 1e-6, 'arrival light follows immediate movement');
  arrivalSkin.onBeforeRender(); assert.ok(arrivalSkin.matrixWorld.equals(skin.matrixWorld));
  assert.equal(departure.children[0].position.x, 0, 'departure stays at the departure point');
  assert.deepEqual(geometry.attributes.position.array, original); assert.deepEqual(material.toJSON(), before);
  fx.dispose(); fx.dispose(); assert.equal(sourceDisposed, false); assert.equal(root.parent, null);
  geometry.dispose(); material.dispose(); skin.skeleton.dispose();
});

test('blink light freezes with simulation time, obeys visibility and clears on expiry/reset', () => {
  const scene = new THREE.Scene(); const fx = createBlinkVisuals(scene, point => point.x > 0);
  const from = new THREE.Vector3(-2, 0, 0), to = new THREE.Vector3(2, 0, 0);
  fx.trigger(from, to); fx.update(.08);
  assert.deepEqual(fx.telemetry.pulses.map(p => p.visible), [false, true]);
  assert.ok(fx.telemetry.pulses[1].flash > .5);
  const frozen = fx.telemetry; fx.update(0); assert.deepEqual(fx.telemetry, frozen);
  fx.update(1); assert.equal(fx.telemetry.active, false);
  fx.trigger(from, to); fx.update(.08); fx.reset(); assert.equal(fx.telemetry.active, false);
  fx.trigger(from, to); fx.update(.08); assert.ok(fx.telemetry.active);
  fx.dispose(); fx.trigger(from, to); assert.equal(fx.telemetry.active, false);
});
