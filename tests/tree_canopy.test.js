import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleTreeAppearance, createTreeInstancePart } from '../src/tree-appearance.js';
import { TREE_CANOPY_STYLE, isTreeFoliage, canFadeTreeCanopy, treeCanopyBounds, createTreeCanopy, updateTreeCanopy, applyTreeCanopy, createTreeCanopyMaterial, writeTreeCanopyOpacity } from '../src/tree-canopy.js';

const bounds = () => new THREE.Box3(new THREE.Vector3(-1, 2, -2), new THREE.Vector3(5, 8, 2));
const placement = (x = 10, rotation = 0) => ({ x, y: 3, z: 20, rotation, scale: [2, 2, 2] });
const frames = (canopy, point, count) => { for (let i = 0; i < count; i++) updateTreeCanopy(canopy, point, 1 / 60); };

test('crown coverage uses actual foliage bounds, rotation and scale without mutating source geometry', () => {
  const leaf = new THREE.BoxGeometry(6, 6, 4); leaf.translate(2, 5, 0);
  const bark = new THREE.BoxGeometry(100, 20, 100);
  const measured = treeCanopyBounds([{ geometry: leaf, treePart: 'foliage' }, { geometry: bark, treePart: 'bark' }]);
  assert.deepEqual(measured, bounds());
  const state = createTreeCanopy(measured, placement(10, Math.PI / 2));
  assert.deepEqual(state.footprint.center, [10, 16]);
  assert.equal(state.footprint.radiusX, 6); assert.equal(state.footprint.radiusZ, 4);
  assert.equal(state.footprint.minY, 7); assert.equal(state.footprint.maxY, 19);
  assert.equal(treeCanopyBounds([{ geometry: bark, treePart: 'bark' }]), null);
  leaf.dispose(); bark.dispose();
});

test('only the local crown fades smoothly, stays stable while paused, and returns to opaque after leaving', () => {
  const first = createTreeCanopy(bounds(), placement()), second = createTreeCanopy(bounds(), placement(40));
  const player = { x: 14, y: 3, z: 20 };
  updateTreeCanopy(first, player, 1 / 60);
  assert.ok(first.opacity > TREE_CANOPY_STYLE.minimumOpacity && first.opacity < 1);
  assert.equal(first.targetOpacity, TREE_CANOPY_STYLE.minimumOpacity);
  assert.equal(first.underCanopy, true);
  const paused = first.opacity; updateTreeCanopy(first, player, 0); assert.equal(first.opacity, paused);
  frames(first, player, 120); frames(second, player, 120);
  assert.equal(first.opacity, TREE_CANOPY_STYLE.minimumOpacity);
  assert.equal(second.opacity, 1); assert.equal(second.underCanopy, false);
  assert.equal(first.barkOpacity, 1); assert.equal(second.barkOpacity, 1);
  frames(first, { x: 90, y: 3, z: 20 }, 150);
  assert.equal(first.opacity, 1); assert.equal(first.underCanopy, false);
  const above = createTreeCanopy(bounds(), placement());
  frames(above, { ...player, y: above.footprint.maxY }, 90); assert.equal(above.opacity, 1);
});

test('the crown edge has a gradual target instead of flickering between on and off', () => {
  const state = createTreeCanopy(bounds(), placement()), { center, radiusX } = state.footprint;
  updateTreeCanopy(state, { x: center[0] + radiusX * 1.06, y: 3, z: center[1] }, 0);
  const middle = state.targetOpacity;
  assert.ok(middle > .3 && middle < .8);
  updateTreeCanopy(state, { x: center[0] + radiusX * 1.06001, y: 3, z: center[1] }, 0);
  assert.ok(Math.abs(state.targetOpacity - middle) < .001);
});

test('a brief fast crossing reveals the player before the centre and restores smoothly after leaving', () => {
  // A two-metre crown is crossed in only .25s at 8m/s. Waiting for a settled
  // standing pose would miss the visibility regression this route exercises.
  const smallCrown = new THREE.Box3(new THREE.Vector3(-1, 2, -1), new THREE.Vector3(1, 4, 1));
  const centreOpacities = [];
  for (const fps of [30, 60, 120]) {
    const state = createTreeCanopy(smallCrown, { x: 0, y: 0, z: 0, rotation: 0, scale: [1, 1, 1] });
    updateTreeCanopy(state, { x: -1, y: 0, z: 0 }, 0);
    assert.ok(state.targetOpacity < .25, 'the crown edge must already request useful visibility');
    let atCentre = null, minimum = 1;
    for (let frame = 0; frame <= Math.round(.4 * fps); frame++) {
      const x = -1.6 + 8 * frame / fps;
      updateTreeCanopy(state, { x, y: 0, z: 0 }, 1 / fps);
      if (x >= 0 && atCentre === null) atCentre = state.opacity;
      minimum = Math.min(minimum, state.opacity);
    }
    assert.ok(atCentre < .18, `${fps} FPS: a brief traversal is still obscured at the centre (${atCentre})`);
    assert.ok(minimum < .10, `${fps} FPS: the canopy never became substantially transparent`);
    centreOpacities.push(atCentre);
    const afterCrossing = state.opacity;
    updateTreeCanopy(state, { x: 4, y: 0, z: 0 }, 1 / fps);
    assert.ok(state.opacity > afterCrossing && state.opacity < 1, 'leaving must fade back rather than pop');
    for (let frame = 0; frame < fps * 3; frame++) updateTreeCanopy(state, { x: 4, y: 0, z: 0 }, 1 / fps);
    assert.equal(state.opacity, 1);
  }
  assert.ok(Math.max(...centreOpacities) - Math.min(...centreOpacities) < .025, 'brief visibility is stable across frame rates');
});

test('fading writes only the affected leaf instance into both owned LODs and does not repeatedly upload unchanged attributes', () => {
  const source = { geometry: new THREE.PlaneGeometry(), lowGeometry: new THREE.PlaneGeometry(), treePart: 'foliage' };
  const appearance = sampleTreeAppearance({ id: 'unchanged-biome-tree', position: [0, 0] });
  const part = createTreeInstancePart(source, [appearance, appearance]);
  const states = [{ opacity: .15 }, { opacity: 1 }];
  assert.equal(writeTreeCanopyOpacity(part, states), true);
  for (const geometry of [part.geometry, part.lowGeometry]) {
    const alpha = geometry.getAttribute('aTreeCanopyOpacity');
    assert.ok(Math.abs(alpha.getX(0) - .15) < 1e-7); assert.equal(alpha.getX(1), 1);
    assert.equal(alpha.usage, THREE.DynamicDrawUsage);
  }
  const version = part.geometry.getAttribute('aTreeCanopyOpacity').version;
  assert.equal(writeTreeCanopyOpacity(part, states), false);
  assert.equal(part.geometry.getAttribute('aTreeCanopyOpacity').version, version);
  assert.equal(source.geometry.getAttribute('aTreeCanopyOpacity'), undefined);
  const bark = createTreeInstancePart({ ...source, treePart: 'bark' }, [appearance]);
  assert.equal(bark.geometry.getAttribute('aTreeCanopyOpacity'), undefined);
  for (const geometry of [source.geometry, source.lowGeometry, part.geometry, part.lowGeometry, bark.geometry, bark.lowGeometry]) geometry.dispose();
});

test('the real transparent pass preserves wind and original alpha cutouts, with complementary opaque selection and no depth write', () => {
  const map = new THREE.Texture(), source = new THREE.MeshStandardMaterial({ map, alphaTest: .35, side: THREE.DoubleSide, vertexColors: true });
  source.alphaToCoverage = true;
  source.onBeforeCompile = shader => { shader.uniforms.wind = { value: 2 }; };
  source.customProgramCacheKey = () => 'original-wind-biome';
  const fade = createTreeCanopyMaterial(source);
  applyTreeCanopy(source);
  assert.equal(source.transparent, false); assert.equal(source.depthWrite, true); assert.equal(source.alphaToCoverage, true);
  assert.equal(fade.transparent, true); assert.equal(fade.depthWrite, false); assert.equal(fade.depthTest, true);
  assert.equal(fade.alphaToCoverage, false); assert.equal(fade.forceSinglePass, true);
  assert.equal(fade.alphaTest, .35); assert.equal(fade.map, map); assert.equal(fade.vertexColors, true);
  const shaders = [source, fade].map(material => {
    const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <alphatest_fragment>', uniforms: {} };
    material.onBeforeCompile(shader); assert.equal(shader.uniforms.wind.value, 2); return shader;
  });
  assert.ok(shaders[0].fragmentShader.includes('if (vTreeCanopyOpacity < .999) discard;'));
  assert.ok(shaders[1].fragmentShader.includes('if (vTreeCanopyOpacity >= .999) discard;'));
  assert.ok(shaders[1].fragmentShader.indexOf('diffuseColor.a *=') > shaders[1].fragmentShader.indexOf('#include <alphatest_fragment>'));
  assert.ok(fade.customProgramCacheKey().includes('original-wind-biome|tree-canopy-v1:fade'));
  source.dispose(); fade.dispose(); map.dispose();
});

test('the imported inner crown can fade without receiving leaf tint or snow frost; true trunk parts stay opaque', () => {
  const source = { geometry: new THREE.BoxGeometry(), treePart: 'bark', canopyCore: true };
  const snow = sampleTreeAppearance({ id: 'snow-crown', position: [0, 0] }, { biomeAt: () => 'snow' });
  const core = createTreeInstancePart(source, [snow]);
  assert.equal(isTreeFoliage(core), false);
  assert.equal(canFadeTreeCanopy(core), true);
  assert.equal(canFadeTreeCanopy({ treePart: 'bark' }), false);
  assert.ok(core.geometry.getAttribute('aTreeCanopyOpacity'));
  const tint = core.geometry.getAttribute('aTreeColor');
  assert.ok(Math.abs(tint.getX(0) - snow.barkLinear[0]) < 1e-7);
  assert.equal(core.geometry.getAttribute('aTreeData').getX(0), 0);
  assert.equal(treeCanopyBounds([core]), null, 'only real leaf bounds define the crown footprint');
  source.geometry.dispose(); core.geometry.dispose();
});
