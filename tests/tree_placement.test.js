import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLACEMENT_OBJECT_CATALOG, isObjectAvailable, isObjectPlaceable, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { isRetiredScenery, removeRetiredScenery } from '../src/map/retired-scenery.js';
import { removeNonTripoObjects } from '../src/map/tripo-object-cleanup.js';
import { validateWorldmap } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { createScatterStroke } from '../src/map/landscape-brush.js';
import { createPlacementRotationState } from '../src/map/placement-rotation.js';

const variants = ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn'];
const legacy = ['oak', 'birch', 'pine', 'rei-tree01', 'rei-tree02'];
const source = readFileSync(new URL('../worldmap.json', import.meta.url));
const original = JSON.parse(source);
const hash = data => createHash('sha256').update(data).digest('hex');

test('exactly four existing GLB trees are selectable, with green oak as the palette default', () => {
  const definition = PLACEMENT_OBJECT_CATALOG.find(item => item.kind === 'tree');
  assert.ok(definition);
  assert.equal(definition.label, 'Baum');
  assert.equal(definition.defaultVariant, 'kit-oak-green');
  assert.deepEqual(definition.variants.map(item => item.id), variants);
  for (const variant of variants) {
    assert.equal(isObjectPlaceable('tree', variant), true);
    assert.equal(isObjectAvailable('tree', variant), true);
    assert.equal(isRetiredScenery({ kind: 'tree', variant }), false);
  }
  for (const variant of legacy) {
    assert.equal(isObjectPlaceable('tree', variant), false);
    assert.equal(isObjectAvailable('tree', variant), false);
    assert.equal(isRetiredScenery({ kind: 'tree', variant }), true);
  }
  assert.equal(isObjectPlaceable('tree', 'Tree Green 1'), false, 'empty uploads must not be advertised as real trees');
});

test('each enabled tree has actual GLB geometry, a different model and a finite trunk collider', () => {
  const fingerprints = new Set();
  for (const variant of variants) {
    const definition = getEnvironmentKitDefinition('tree', variant);
    const bytes = readFileSync(new URL(`../Blender/nebeljagd_umwelt_kit_v1/assets/${definition.asset}.glb`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const data = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
    const count = data.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + data.accessors[primitive.attributes.POSITION].count, 0);
    assert.ok(count > 100, `${variant}: actual trunk/crown geometry, not an empty generator or plane`);
    assert.ok(data.materials.length > 0);
    assert.ok(definition.targetHeight > 3);
    assert.ok(definition.circles.length > 0);
    for (const circle of definition.circles) {
      assert.ok(Number.isFinite(circle.radius) && circle.radius > 0 && circle.radius < 1);
      assert.ok(Number.isFinite(circle.maxY) && circle.maxY > 3);
    }
    fingerprints.add(hash(bytes));
  }
  assert.equal(fingerprints.size, 4);
});

test('placed trees and saved random yaw survive JSON, SVG and both explicit cleanup operations', () => {
  let next = 0;
  const rotation = createPlacementRotationState(() => (next++ + 1) / 5);
  const objects = variants.map((variant, i) => makeWorldObject('tree', [30, -42], {
    id: `tree-placement-check-${i}`, variant, rotation: rotation.nextRotation('tree'), scale: .8 + i * .1,
  }));
  const map = { ...structuredClone(original), objects };
  assert.equal(validateWorldmap(map).valid, true, JSON.stringify(validateWorldmap(map).errors));
  const copy = normalizeWorldmap(JSON.parse(JSON.stringify(map)));
  assert.deepEqual(copy, map);
  assert.equal(new Set(copy.objects.map(item => item.rotation)).size, 4);
  assert.equal(removeRetiredScenery(copy).totalRemoved, 0);
  assert.equal(removeNonTripoObjects(copy).totalRemoved, 0);
  const svg = renderWorldmapSvg(copy, { editor: true, showObjects: true });
  for (const object of objects) assert.ok(svg.includes(object.id));
  assert.deepEqual(copy, map, 'rendering and cleanup previews cannot change authored yaw');
  assert.equal(next, 4, 'randomness is sampled only once per newly placed tree');
  assert.equal(hash(readFileSync(new URL('../worldmap.json', import.meta.url))), hash(source));
});

test('a tree scatter stroke creates saved GLB instances and leaves its source document untouched', () => {
  const map = structuredClone(original);
  map.island.points = [[-100,-100], [100,-100], [100,100], [-100,100]];
  map.objects = []; map.paths = []; map.rivers = []; map.islets = []; map.waterAreas = []; map.barriers = [];
  map.spawnAreas = []; map.gameplay.spawnPosition = [80,80];
  map.regions = [{ id: 'tree-test-meadow', name: 'Wiese', biome: 'meadow', color: '#5a8844', points: map.island.points, label: [0,0] }];
  delete map.landscape;
  const before = structuredClone(map);
  const stroke = createScatterStroke(map, { radius: 18, seed: 51, scatter: {
    density: 1, minDistance: 5, entries: [{ kind: 'tree', variant: 'kit-oak-green', weight: 1 }],
  } });
  stroke.sample([-40,-40]);
  assert.ok(stroke.objects.length > 1);
  assert.ok(stroke.objects.every(item => item.kind === 'tree' && item.variant === 'kit-oak-green' && Number.isFinite(item.rotation)));
  assert.deepEqual(map, before);
  assert.equal(removeNonTripoObjects({ objects: stroke.objects }).totalRemoved, 0);
});
