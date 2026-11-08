import * as THREE from 'three';

export const TREE_APPEARANCE_STYLE = 'biome-tree-v1';
const leafPalettes = Object.freeze({
  meadow: ['#557744', '#91a45c'], forest: ['#365b3e', '#748b4c'],
  snow: ['#58786e', '#91a79b'], dunes: ['#58442e', '#a88649'],
  marsh: ['#415c4c', '#72805a'], heath: ['#56663c', '#918750'],
  volcanic: ['#404d40', '#71694a'],
});
const barkPalette = ['#49372d', '#69503b', '#956c47', '#7c6b59'].map(value => new THREE.Color(value));
const leafColors = Object.fromEntries(Object.entries(leafPalettes).map(([biome, colors]) =>
  [biome, colors.map(value => new THREE.Color(value))]));

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  result ^= result >>> 16; result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15; result = Math.imul(result, 0x846ca68b);
  return (result ^ result >>> 16) >>> 0;
}
const random = (seed, salt) => hash(`${seed}:${salt}`) / 4294967296;
function canonicalBiome(value) {
  const alias = { sand: 'dunes', desert: 'dunes', swamp: 'marsh', grass: 'meadow', woodland: 'forest' }[value];
  return leafColors[alias ?? value] ? alias ?? value : 'meadow';
}

/** Resolve once per authored tree. ID-based variation survives moving/reloading;
 * only the leaf climate changes when the tree moves between painted biomes. */
export function sampleTreeAppearance(object, { biomeWeightsAt, biomeAt } = {}) {
  const [x, z] = object.position ?? [0, 0];
  const seed = hash(object.id || `${object.variant ?? 'tree'}:${x.toFixed(3)},${z.toFixed(3)}`);
  const sampled = biomeWeightsAt?.(x, z);
  const weights = new Map();
  for (const entry of Array.isArray(sampled) ? sampled : []) {
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) continue;
    const biome = canonicalBiome(entry.biome);
    weights.set(biome, (weights.get(biome) ?? 0) + entry.weight);
  }
  if (!weights.size) weights.set(canonicalBiome(biomeAt?.(x, z)), 1);
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0);
  const biomeWeights = [...weights].map(([biome, value]) => ({ biome, weight: value / total }))
    .sort((a, b) => b.weight - a.weight || (a.biome < b.biome ? -1 : 1));
  const barkChoice = random(seed, 'bark-hue') * (barkPalette.length - 1);
  const barkIndex = Math.min(barkPalette.length - 2, Math.floor(barkChoice));
  const bark = barkPalette[barkIndex].clone().lerp(barkPalette[barkIndex + 1], barkChoice - barkIndex)
    .multiplyScalar(.88 + random(seed, 'bark-light') * .23);
  const leaf = new THREE.Color(0, 0, 0), choice = random(seed, 'leaf-hue');
  const brightness = .87 + random(seed, 'leaf-light') * .25;
  for (const { biome, weight } of biomeWeights) {
    const [dark, light] = leafColors[biome];
    leaf.add(dark.clone().lerp(light, choice).multiplyScalar(weight * brightness));
  }
  const frost = (weights.get('snow') ?? 0) / total * (.72 + random(seed, 'frost') * .18);
  const appearance = { style: TREE_APPEARANCE_STYLE, seed, biome: biomeWeights[0].biome,
    biomeWeights, barkColor: `#${bark.getHexString()}`, leafColor: `#${leaf.getHexString()}`,
    barkLinear: bark.toArray(), leafLinear: leaf.toArray(), frost, phase: random(seed, 'patch') * Math.PI * 2 };
  appearance.signature = hash(JSON.stringify(appearance)).toString(16).padStart(8, '0');
  return appearance;
}

/** Add colour/frost to an existing tree material after its wind hook. Alpha,
 * texture sampling, normals, lighting, and later vision hooks remain intact. */
export function applyTreeAppearance(material, { foliage = false } = {}) {
  if (material.userData.treeAppearance) return material;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  const priorKey = previousKey?.call(material) ?? '';
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    shader.vertexShader = `attribute vec3 aTreeColor; attribute vec2 aTreeData;
      varying vec3 vTreeColor, vTreePosition; varying vec2 vTreeData; varying float vTreeUp;
      ${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
        vTreeColor = aTreeColor; vTreeData = aTreeData;
        vTreePosition = position; vTreeUp = abs(normal.y);`);
    shader.fragmentShader = `varying vec3 vTreeColor, vTreePosition;
      varying vec2 vTreeData; varying float vTreeUp;
      ${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
        // Retain the original wood grain/leaf shading through its luminance.
        float treeDetail = clamp(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722)) / ${foliage ? '.145' : '.100'}, .32, 1.85);
        diffuseColor.rgb = mix(diffuseColor.rgb, vTreeColor * treeDetail, ${foliage ? '.96' : '.91'});
        ${foliage ? `
          float treePatch = .5 + .5 * sin(vTreePosition.x * 3.7 + vTreeData.y)
            * sin(vTreePosition.y * 3.1 - vTreePosition.z * 2.9 + vTreeData.y * .7);
          float treeFrost = vTreeData.x * smoothstep(.20, .70, treePatch)
            * (.24 + .76 * smoothstep(.05, .80, vTreeUp))
            * smoothstep(.5, 2.6, vTreePosition.y);
          vec3 treeSnow = vec3(.73, .83, .88) * (.72 + .28 * min(treeDetail, 1.3));
          diffuseColor.rgb = mix(diffuseColor.rgb, treeSnow, clamp(treeFrost, 0.0, .90));
        ` : ''}`);
  };
  material.customProgramCacheKey = () => `${priorKey}|${TREE_APPEARANCE_STYLE}:${foliage ? 'leaves' : 'bark'}`;
  material.userData.treeAppearance = { style: TREE_APPEARANCE_STYLE, foliage };
  material.needsUpdate = true;
  return material;
}

/** Each chunk owns its small instance attributes and both LOD geometries.
 * Source geometries/materials stay shared and untouched. No per-frame work. */
export function createTreeInstancePart(part, appearances, ownedGeometries = new Set()) {
  const foliage = part.treePart === 'foliage' || part.foliage || part.kitFoliage;
  const colors = new Float32Array(appearances.length * 3), data = new Float32Array(appearances.length * 2);
  appearances.forEach((appearance, index) => {
    colors.set(foliage ? appearance.leafLinear : appearance.barkLinear, index * 3);
    data[index * 2] = foliage ? appearance.frost : 0; data[index * 2 + 1] = appearance.phase;
  });
  const clone = source => {
    const geometry = source.clone();
    geometry.setAttribute('aTreeColor', new THREE.InstancedBufferAttribute(colors.slice(), 3));
    geometry.setAttribute('aTreeData', new THREE.InstancedBufferAttribute(data.slice(), 2));
    ownedGeometries.add(geometry); return geometry;
  };
  const geometry = clone(part.geometry);
  const lowGeometry = part.lowGeometry ? part.lowGeometry === part.geometry ? geometry : clone(part.lowGeometry) : undefined;
  return { ...part, geometry, lowGeometry, treePart: foliage ? 'foliage' : 'bark' };
}
