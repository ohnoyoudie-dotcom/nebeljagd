import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARRIER_STYLES, makeBarrier, generateBarrierObjects } from '../src/map/barriers.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { getBarrierHeight, getBarrierHeightScale, isHeightAdjustable, BARRIER_SIGHT_HEIGHT } from '../src/map/barrier-height.js';
import { makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { validateWorldmap } from '../src/map/model.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const base = read('tests/fixtures/editor-project-worldmap.json');
const schema = read('worldmap.schema.json');
const points = [[-20, 0], [0, 0], [0, 20]], gaps = [{ at: 10, width: 3 }];
const mapWith = (objects = [], barriers = []) => ({ ...structuredClone(base), objects, barriers });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const horizontalPieces = pieces => pieces.map(({ height, ...piece }) => piece);

test('wall height in metres is independent of footprint scale, while omitted height retains each model size', () => {
  assert.equal(BARRIER_SIGHT_HEIGHT, 2);
  for (const style of BARRIER_STYLES) for (const scale of [.5, 1, 2]) {
    const natural = makeBarrier(style.id, points, { scale });
    const kit = getEnvironmentKitDefinition(style.kind, style.variant);
    const nativeHeight = kit.targetHeight ?? kit.height;
    close(getBarrierHeight(natural), nativeHeight * scale);
    close(getBarrierHeightScale(natural), 1);
    for (const height of [.25, 1.99, 2, 3, 8]) {
      const raised = { ...natural, height };
      close(getBarrierHeight(raised), height);
      close(nativeHeight * scale * getBarrierHeightScale(raised), height);
    }
  }
  assert.equal(isHeightAdjustable({ kind: 'house' }), false);
  assert.equal(getBarrierHeight({ kind: 'house', height: 3 }), null);
  assert.equal(getBarrierHeightScale({ kind: 'house', height: 3 }), 1);
});

test('height survives authored line and individual object roundtrip without changing horizontal layout or openings', () => {
  for (const style of BARRIER_STYLES) {
    const route = makeBarrier(style.id, points, { id: 'height-route', scale: 1.5, gaps, height: 2 });
    const object = makeWorldObject(style.kind, [30, -42], { id: 'height-object', variant: style.variant, height: 1.99, scale: 2 });
    assert.equal(route.height, 2);
    assert.equal(object.height, 1.99);
    const map = mapWith([object], [route]);
    const original = structuredClone(map);
    assert.deepEqual(validateWorldmap(map).errors, []);
    assert.deepEqual(normalizeWorldmap(JSON.parse(JSON.stringify(map))), map);
    const normal = { ...route }; delete normal.height;
    const pieces = generateBarrierObjects(route);
    assert.ok(pieces.length > 0 && pieces.every(piece => piece.height === 2));
    assert.deepEqual(horizontalPieces(pieces), generateBarrierObjects(normal), 'height cannot alter points, gaps, rotations, segment lengths or width scale');
    assert.deepEqual(map, original, 'validation/expansion must not rewrite saved map data');
    const replacement = { ...route, variant: style.kind === 'wall' ? 'kit-tripo-wall' : 'kit-cross-wood' };
    assert.equal(getBarrierHeight(replacement), 2, 'switching the visual model keeps the requested physical height');
  }
});

test('legacy maps and freshly created unconfigured barriers do not acquire height overrides', () => {
  for (const style of BARRIER_STYLES) {
    const object = makeWorldObject(style.kind, [30, -42], { id: 'legacy-object', variant: style.variant, scale: 1.3 });
    const route = makeBarrier(style.id, points, { id: 'legacy-route', gaps, scale: 1.3 });
    assert.equal(Object.hasOwn(object, 'height'), false);
    assert.equal(Object.hasOwn(route, 'height'), false);
    assert.ok(generateBarrierObjects(route).every(piece => !Object.hasOwn(piece, 'height')));
    const map = mapWith([object], [route]), before = JSON.stringify(map);
    assert.deepEqual(normalizeWorldmap(map), map);
    assert.equal(JSON.stringify(map), before);
  }
});

test('import validation rejects invalid heights and height overrides on unrelated scenery', () => {
  for (const height of [null, NaN, Infinity, -Infinity, -.5, 0, .249, 8.001, '2', true, {}, []]) {
    const route = { ...makeBarrier('wall', points, { id: 'invalid-route' }), height };
    const object = { ...makeWorldObject('wall', [30, -42], { id: 'invalid-object' }), height };
    assert.equal(validateWorldmap(mapWith([], [route])).valid, false, `route height ${String(height)}`);
    assert.equal(validateWorldmap(mapWith([object])).valid, false, `individual wall height ${String(height)}`);
  }
  for (const kind of ['house', 'tree', 'crate', 'bow', 'grass']) {
    const object = { ...makeWorldObject(kind, [30, -42], { id: 'invalid-kind' }), height: 2 };
    assert.equal(validateWorldmap(mapWith([object])).valid, false, `${kind} must not silently consume a wall-height override`);
  }
});

test('published JSON schema makes height an optional bounded metre value for map objects and barrier routes', () => {
  for (const name of ['worldObject', 'barrier']) {
    const definition = schema.$defs[name];
    assert.equal(definition.required.includes('height'), false, 'legacy documents remain valid');
    assert.equal(definition.properties.height.type, 'number');
    assert.equal(definition.properties.height.minimum, .25);
    assert.equal(definition.properties.height.maximum, 8);
  }
});
