import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleTreeAppearance, applyTreeAppearance, createTreeInstancePart } from '../src/tree-appearance.js';

const tree = (id = 'tree-a', position = [4, 8]) => ({ id, kind: 'tree', variant: 'kit-user-tree1', position, scale: 1 });
const inBiome = biome => ({ biomeWeightsAt: () => [{ biome, weight: 1 }] });

test('tree variation is stable across reload/order and preserves bark when a tree moves', () => {
  const object = tree(), original = structuredClone(object);
  const first = sampleTreeAppearance(object, inBiome('forest'));
  for (let i = 0; i < 8; i++) sampleTreeAppearance(tree(`unrelated-${i}`), inBiome('snow'));
  assert.deepEqual(sampleTreeAppearance(JSON.parse(JSON.stringify(object)), inBiome('forest')), first);
  const moved = sampleTreeAppearance(tree(object.id, [140, -70]), inBiome('dunes'));
  assert.equal(moved.seed, first.seed);
  assert.equal(moved.barkColor, first.barkColor);
  assert.notEqual(moved.leafColor, first.leafColor);
  assert.notEqual(moved.signature, first.signature);
  assert.deepEqual(object, original, 'render appearance never rewrites authored objects');
  const fallback = { ...object, id: '' };
  assert.deepEqual(sampleTreeAppearance(fallback), sampleTreeAppearance(structuredClone(fallback)));
  assert.notEqual(sampleTreeAppearance({ ...fallback, position: [5, 8] }).seed, sampleTreeAppearance(fallback).seed);
});

test('biome colours and frost blend continuously and invalid weight entries cannot poison the result', () => {
  const object = tree(), forest = sampleTreeAppearance(object, inBiome('forest')), snow = sampleTreeAppearance(object, inBiome('snow'));
  const blend = sampleTreeAppearance(object, { biomeWeightsAt: () => [
    { biome: 'forest', weight: 3 }, { biome: 'snow', weight: 1 }, { biome: 'dunes', weight: NaN }, { biome: 'marsh', weight: -1 },
  ] });
  blend.leafLinear.forEach((value, index) => assert.ok(Math.abs(value - forest.leafLinear[index] * .75 - snow.leafLinear[index] * .25) < 1e-10));
  assert.ok(Math.abs(blend.frost - snow.frost * .25) < 1e-10);
  assert.equal(blend.barkColor, forest.barkColor);
  assert.equal(blend.biome, 'forest');
  const epsilon = sampleTreeAppearance(object, { biomeWeightsAt: () => [{ biome: 'forest', weight: 3.0001 }, { biome: 'snow', weight: .9999 }] });
  assert.ok(Math.abs(epsilon.frost - blend.frost) < .0001);
  assert.equal(sampleTreeAppearance(object, { biomeWeightsAt: () => [], biomeAt: () => 'desert' }).biome, 'dunes');
});

test('biome palettes visibly distinguish green, dry brown and frost while each tree has its own bark and leaves', () => {
  for (const biome of ['meadow', 'forest', 'snow', 'dunes', 'marsh']) {
    const samples = ['qa-tree-a', 'qa-tree-b', 'qa-tree-c'].map(id => sampleTreeAppearance(tree(id), inBiome(biome)));
    assert.equal(new Set(samples.map(value => value.signature)).size, 3);
    assert.ok(new Set(samples.map(value => value.barkColor)).size >= 2);
    assert.ok(new Set(samples.map(value => value.leafColor)).size >= 2);
    for (const value of samples) {
      const [r, g, b] = value.leafLinear;
      assert.ok([...value.barkLinear, ...value.leafLinear].every(channel => Number.isFinite(channel) && channel > 0 && channel < 1));
      if (biome === 'dunes') assert.ok(r > g && g > b, 'dry foliage loses its dominant green');
      if (['meadow', 'forest', 'marsh'].includes(biome)) assert.ok(g > r && g > b, 'living foliage remains green');
      if (biome === 'snow') assert.ok(value.frost >= .72 && value.frost <= .9);
      else assert.equal(value.frost, 0);
    }
  }
});

test('each instance batch and LOD owns its attributes without mutating the shared GLB or losing UVs/normals', () => {
  const geometry = new THREE.PlaneGeometry(2, 2), lowGeometry = new THREE.PlaneGeometry(1, 1);
  const sourcePositions = geometry.attributes.position.array.slice();
  const material = new THREE.MeshStandardMaterial({ alphaTest: .35, side: THREE.DoubleSide });
  const source = { geometry, lowGeometry, material, treePart: 'foliage' }, owned = new Set();
  const a = sampleTreeAppearance(tree('first'), inBiome('forest')), b = sampleTreeAppearance(tree('second'), inBiome('snow'));
  const first = createTreeInstancePart(source, [a, b], owned), second = createTreeInstancePart(source, [b], owned);
  assert.equal(owned.size, 4);
  assert.equal(geometry.getAttribute('aTreeColor'), undefined);
  assert.deepEqual(geometry.attributes.position.array, sourcePositions);
  for (const lod of [first.geometry, first.lowGeometry]) {
    assert.ok(lod.getAttribute('uv') && lod.getAttribute('normal'));
    assert.equal(lod.getAttribute('aTreeData').getX(0), 0);
    assert.ok(Math.abs(lod.getAttribute('aTreeData').getX(1) - b.frost) < 1e-7);
    assert.equal(lod.getAttribute('aTreeColor').count, 2);
  }
  first.geometry.getAttribute('aTreeColor').setX(0, .99);
  assert.notEqual(second.geometry.getAttribute('aTreeColor').getX(0), .99);
  assert.notEqual(first.lowGeometry.getAttribute('aTreeColor').getX(0), .99);
  assert.equal(first.material, material);
  const bark = createTreeInstancePart({ ...source, treePart: 'bark' }, [b], owned);
  assert.equal(bark.geometry.getAttribute('aTreeData').getX(0), 0, 'frost stays on foliage');
  for (const resource of [...owned, geometry, lowGeometry, material]) resource.dispose();
});

test('appearance hooks preserve texture alpha and preceding wind hooks and apply only once', () => {
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map, alphaTest: .35, side: THREE.DoubleSide, vertexColors: true });
  material.alphaToCoverage = true;
  let windCalls = 0;
  material.onBeforeCompile = shader => { windCalls++; shader.uniforms.wind = { value: 1 }; };
  material.customProgramCacheKey = () => 'existing-wind';
  applyTreeAppearance(material, { foliage: true });
  const hook = material.onBeforeCompile;
  applyTreeAppearance(material, { foliage: true });
  assert.equal(material.onBeforeCompile, hook);
  const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <alphatest_fragment>', uniforms: {} };
  material.onBeforeCompile(shader);
  assert.equal(windCalls, 1);
  assert.equal(shader.uniforms.wind.value, 1);
  assert.ok(shader.fragmentShader.includes('#include <map_fragment>') && shader.fragmentShader.includes('#include <alphatest_fragment>'));
  assert.equal(material.alphaTest, .35); assert.equal(material.alphaToCoverage, true);
  assert.equal(material.map, map); assert.equal(material.side, THREE.DoubleSide);
  assert.ok(material.customProgramCacheKey().startsWith('existing-wind|'));
  material.dispose(); map.dispose();
});
