import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyCharacterSnowClip, createCharacterConcealment } from '../src/character-concealment.js';
import { createCharacterGlow } from '../src/character-glow.js';

function fixture({ textured = false } = {}) {
  const group = new THREE.Group(), geometry = new THREE.BoxGeometry(.4, 1.8, .3);
  const material = new THREE.MeshStandardMaterial({ map: textured ? new THREE.DataTexture(new Uint8Array([80,40,20,255]),1,1) : null, color: '#805c39', emissive: '#020306', opacity: .9 });
  const bone = new THREE.Bone(), skeleton = new THREE.Skeleton([bone]);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bone); mesh.bind(skeleton); mesh.castShadow = true; group.add(mesh);
  const materials = new Map([[material, { opacity: .9, transparent: false, depthWrite: true }]]);
  const height = { value: .12 }, strength = { value: 1 };
  applyCharacterSnowClip(material, height, strength);
  const effect = createCharacterConcealment({ meshes: [mesh], materials, snowClipHeight: height, snowClipStrength: strength });
  return { group, mesh, geometry, material, skeleton, effect, height, strength };
}
function settle(effect, concealed, options = {}) {
  for (let index = 0; index < 90; index++) effect.update(1 / 60, { concealed, ...options });
  return effect.inspect();
}

test('concealment smoothly softens only the local presentation and restores original material state exactly', () => {
  const { material, mesh, effect } = fixture();
  const color = material.color.clone(), emissive = material.emissive.clone();
  const first = effect.update(1 / 60, { concealed: true });
  assert.ok(first.blend > 0 && first.blend < 1);
  assert.ok(first.bodyOpacity > .58 && first.bodyOpacity < 1);
  const hidden = settle(effect, true);
  assert.equal(hidden.blend, 1); assert.ok(Math.abs(hidden.bodyOpacity - .58) < 1e-10);
  assert.equal(hidden.fillOpacity, .45); assert.equal(hidden.outlineOpacity, .42);
  assert.equal(hidden.color, '#cbd8d0'); assert.equal(hidden.localOnly, true);
  assert.equal(material.transparent, true); assert.equal(material.depthWrite, false);
  assert.equal(mesh.castShadow, false);
  assert.ok(material.color.equals(color) && material.emissive.equals(emissive), 'source colours are never overwritten');
  effect.update(1 / 60, { concealed: false });
  assert.ok(effect.inspect().blend > 0 && effect.inspect().blend < 1, 'exit also fades');
  const restored = settle(effect, false);
  assert.equal(restored.blend, 0); assert.equal(restored.bodyOpacity, 1);
  assert.equal(material.opacity, .9); assert.equal(material.transparent, false); assert.equal(material.depthWrite, true);
  assert.equal(mesh.castShadow, true); assert.equal(restored.materialsRestored, true);
  assert.equal(restored.outlineOpacity, 0); assert.equal(restored.fillOpacity, 0);
  assert.ok(Math.abs(restored.baselineOpacity - .045) < 1e-10);
  effect.dispose();
});

test('local overlay shares skin, geometry and pose, clips snow, and never owns source resources', () => {
  const { group, mesh, geometry, skeleton, material, effect, height, strength } = fixture();
  const overlay = group.children.find(child => child.userData.localSilhouette);
  const layers = group.children.filter(child => child.userData.localSilhouette);
  assert.deepEqual(layers.map(layer => layer.userData.concealmentLayer), ['mask', 'outline', 'fill']);
  assert.deepEqual(layers.map(layer => layer.visible), [false, false, true]);
  assert.ok(layers[0].renderOrder < layers[1].renderOrder && layers[1].renderOrder < layers[2].renderOrder);
  assert.equal(effect.maskMaterial.colorWrite, false); assert.equal(effect.maskMaterial.stencilWriteMask, 1);
  assert.equal(effect.outlineMaterial.stencilWrite, true); assert.equal(effect.outlineMaterial.stencilWriteMask, 0);
  assert.equal(effect.outlineMaterial.stencilFunc, THREE.NotEqualStencilFunc);
  assert.ok(layers.every(layer => layer.userData.ignoreVision));
  assert.equal(overlay.skeleton, skeleton); assert.equal(overlay.geometry, geometry);
  assert.equal(overlay.material.depthTest, false); assert.equal(overlay.material.depthWrite, false);
  assert.equal(overlay.castShadow, false);
  mesh.position.set(3, 2, 1); group.updateMatrixWorld(true); overlay.onBeforeRender();
  assert.deepEqual(overlay.matrixWorld.elements, mesh.matrixWorld.elements);
  for (const item of [material, effect.material]) {
    const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
    item.onBeforeCompile(shader);
    assert.equal(shader.uniforms.uCharacterSnowClipHeight, height);
    assert.equal(shader.uniforms.uCharacterSnowClipStrength, strength);
    assert.ok(shader.fragmentShader.includes('vCharacterSnowWorld.y < uCharacterSnowClipHeight + snowEdge'));
    assert.ok(shader.vertexShader.includes('#include <skinning_vertex>'));
  }
  let sourceDisposals = 0, overlayDisposals = 0;
  for (const source of [geometry, material]) source.addEventListener('dispose', () => sourceDisposals++);
  effect.material.addEventListener('dispose', () => overlayDisposals++);
  settle(effect, true);
  assert.ok(layers.every(layer => layer.visible));
  effect.dispose();
  assert.equal(sourceDisposals, 0); assert.equal(overlayDisposals, 1);
  assert.equal(effect.inspect().materialsRestored, true);
  assert.equal(group.children.length, 1); assert.equal(group.children[0], mesh);
});

test('level-up emissive remains independent and reset clears hidden style without losing danger visibility', () => {
  const { material, effect } = fixture();
  const glow = createCharacterGlow([material]);
  settle(effect, true); glow.set(.8);
  const emissive = material.emissive.clone(), intensity = material.emissiveIntensity;
  settle(effect, false, { inDanger: true });
  assert.ok(material.emissive.equals(emissive)); assert.equal(material.emissiveIntensity, intensity);
  assert.ok(effect.inspect().baselineOpacity > .139);
  settle(effect, true, { snowClipped: true });
  const state = effect.reset();
  assert.equal(state.active, false); assert.equal(state.blend, 0); assert.equal(state.materialsRestored, true);
  glow.reset(); assert.equal(glow.inspect().restored, true);
  effect.dispose();
});

test('read-through fill retains the real colour map without owning or bleaching the source',()=>{
 const {group,material,effect}=fixture({textured:true});
 const fill=group.children.find(p=>p.userData.concealmentLayer==='fill');
 assert.ok(fill.material.color.equals(material.color));
 assert.ok(material.map?.isTexture);
 assert.equal(fill.material.map,material.map);
 let textureDisposed=0;material.map.addEventListener('dispose',()=>textureDisposed++);
 assert.notEqual(fill.material,material);
 let disposed=0;fill.material.addEventListener('dispose',()=>disposed++);
 effect.dispose();assert.equal(disposed,1);assert.equal(textureDisposed,0);
});
