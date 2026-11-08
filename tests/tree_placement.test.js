import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLACEMENT_OBJECT_CATALOG, isObjectAvailable, isObjectPlaceable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { isRetiredScenery, removeRetiredScenery } from '../src/map/retired-scenery.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { createScatterStroke } from '../src/map/landscape-brush.js';

const previousKitTrees = ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn'];
const oldProcedural = ['oak', 'birch', 'pine', 'rei-tree01', 'rei-tree02'];
const source = readFileSync(new URL('../worldmap.json', import.meta.url));
const original = JSON.parse(source);
const hash = data => createHash('sha256').update(data).digest('hex');

test('the four old GLB trees and invalid new export are not placeable', () => {
  assert.ok(!PLACEMENT_OBJECT_CATALOG.some(item => item.kind === 'tree'));
  assert.equal(isObjectPlaceable('tree'), false);
  for (const variant of previousKitTrees) {
    assert.equal(isObjectPlaceable('tree', variant), false);
    assert.equal(isObjectAvailable('tree', variant), true, 'saved map compatibility must remain');
    assert.equal(isRetiredScenery({ kind: 'tree', variant }), false, 'explicit cleanup preserves existing map trees');
  }
  for (const variant of oldProcedural) {
    assert.equal(isObjectPlaceable('tree', variant), false);
    assert.equal(isObjectAvailable('tree', variant), false);
    assert.equal(isRetiredScenery({ kind: 'tree', variant }), true);
  }
  assert.equal(isObjectPlaceable('tree', 'Tree green 1(2)'), false, 'a 4-vertex plane is not a tree');
  assert.equal(isObjectAvailable('tree', 'kit-user-tree1'), true, 'a saved converted tree remains readable');
});

test('original four GLBs remain intact for old saved maps, not new authoring', () => {
  const fingerprints = new Set();
  for (const variant of previousKitTrees) {
    const definition = getEnvironmentKitDefinition('tree', variant);
    const bytes = readFileSync(new URL(`../Blender/nebeljagd_umwelt_kit_v1/assets/${definition.asset}.glb`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const data = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
    const vertices = data.meshes.flatMap(mesh => mesh.primitives).reduce((total, primitive) =>
      total + data.accessors[primitive.attributes.POSITION].count, 0);
    assert.ok(vertices > 100);
    assert.ok(definition.circles.length > 0);
    fingerprints.add(hash(bytes));
  }
  assert.equal(fingerprints.size, 4);
});

test('old placed trees and their rotations survive JSON, SVG and both cleanup operations', () => {
  const objects = previousKitTrees.map((variant, i) => makeWorldObject('tree', [30 + i * 8, -42], {
    id: `old-kit-tree-${i}`, variant, rotation: .3 + i / 2, scale: .8 + i / 10,
  }));
  const map = { ...structuredClone(original), objects };
  assert.equal(validateWorldmap(map).valid, true, JSON.stringify(validateWorldmap(map).errors));
  const reopened = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(reopened, map);
  assert.equal(removeRetiredScenery(reopened).totalRemoved, 0);
  assert.equal(removeNonTripoObjects(reopened).totalRemoved, 0);
  assert.deepEqual(reopened.objects, objects);
  const svg = renderWorldmapSvg(reopened, { editor: true, showObjects: true });
  for (const object of objects) assert.ok(svg.includes(object.id));
  assert.deepEqual(reopened, map);
  assert.equal(hash(readFileSync(new URL('../worldmap.json', import.meta.url))), hash(source));
});

test('new scatter refuses all four unlisted trees but still accepts rocks', () => {
  const map = structuredClone(original);
  for (const variant of previousKitTrees) {
    assert.throws(() => createScatterStroke(map, {
      radius: 18, scatter: { density: .5, entries: [{ kind: 'tree', variant, weight: 1 }] },
    }), /aktuell verfügbare/, variant);
  }
  const rocks = createScatterStroke(map, {
    radius: 12, seed: 1,
    scatter: { density: .5, entries: [{ kind: 'rock', variant: 'kit-tripo-02', weight: 1 }] },
  });
  assert.ok(rocks);
});

test('the corrected FBX tree has real alpha-cutout leaves, UVs and no duplicated branches', () => {
  const file = new URL('../assets/imported/user-trees/runtime/tree1.glb', import.meta.url);
  if (!existsSync(file)) return; // The new authoring option appears only after GitHub receives this file.
  const bytes = readFileSync(file);
  assert.equal(hash(bytes), 'c8c125554459d89352f23a1d9377899b145617fd589abe36cdbf7d228820c92c');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const data = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.equal(data.meshes.length, 3);
  assert.equal(data.materials.length, 3);
  const positions = data.meshes.flatMap(mesh => mesh.primitives).map(primitive => data.accessors[primitive.attributes.POSITION].count);
  assert.equal(positions.reduce((total, n) => total + n, 0), 7256);
  const triangles = data.meshes.flatMap(mesh => mesh.primitives).reduce((total, primitive) => total + data.accessors[primitive.indices].count / 3, 0);
  assert.equal(triangles, 6992, '1194 alpha-masked leaf cards and no duplicate branch meshes');
  assert.equal(data.images?.length, 1, 'packed original Blender leaf silhouette is inside the GLB');
  assert.equal(data.images[0].mimeType, 'image/png');
  assert.equal(data.textures?.length, 1);
  const leaves = data.meshes.find(mesh => mesh.name.includes('Blätter'));
  assert.ok(leaves, 'dedicated leaf geometry');
  const leafPart = leaves.primitives[0];
  assert.equal(data.accessors[leafPart.attributes.POSITION].count, 4776);
  assert.equal(data.accessors[leafPart.attributes.TEXCOORD_0].count, 4776, 'every leaf card has reconstructed UV coordinates');
  assert.equal(data.accessors[leafPart.indices].count / 3, 2388);
  const material = data.materials[leafPart.material];
  assert.equal(material.alphaMode, 'MASK', 'transparent parts of leaf cards must not render');
  assert.equal(material.doubleSided, true, 'leaf cards must render from above and below');
  assert.ok(material.alphaCutoff > 0 && material.alphaCutoff < .6);
  assert.notEqual(material.pbrMetallicRoughness.baseColorTexture?.index, undefined);
  assert.ok(data.accessors.some(accessor => accessor.max?.[1] > 7.7), 'the mesh must contain its full tree canopy');
});
