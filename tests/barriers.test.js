import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARRIER_STYLES, makeBarrier, barrierLength, barrierSections, generateBarrierObjects, expandBarrierMap } from '../src/map/barriers.js';
import { getEnvironmentKitDefinition } from '../src/map/environment-kit-definitions.js';
import { validateWorldmap, pointInPolygon } from '../src/map/model.js';

const square = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
function mapWith(barriers = []) {
  return {
    schemaVersion: 1, id: 'barrier-test-map', name: 'Testkarte',
    coordinateSystem: { units: 'meters', north: '-z', horizontalAxes: ['x', 'z'], metersPerUnit: 1 },
    bounds: { minX: -150, minZ: -150, maxX: 150, maxZ: 150 },
    gameplay: { targetPlayers: 1, walkSpeedMetersPerSecond: 5 },
    island: { id: 'island', name: 'Insel', points: square },
    regions: [{ id: 'region', name: 'Wiese', biome: 'meadow', color: '#558844', points: square, label: [0, 0] }],
    paths: [], rivers: [], places: [], objects: [], barriers,
    spawnAreas: [{ id: 'spawn', name: 'Start', position: [10, 10], radius: 2, capacity: 1 }],
    zone: { center: [0, 0], initialRadius: 200, damagePerSecond: 1, phases: [{ id: 'phase', name: 'Nebel', holdSeconds: 120, shrinkSeconds: 120, radius: 20 }] },
  };
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const barrier = (kind = 'wall', options = {}) => makeBarrier(kind, [[-20, 0], [20, 0]], { id: 'line-a', ...options });

test('legacy documents retain compatibility and no lines are generated implicitly', () => {
  const project = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
  assert.equal(validateWorldmap(project).valid, true);
  assert.equal(expandBarrierMap(project), project);
  const map = mapWith();
  delete map.barriers;
  assert.equal(validateWorldmap(map).valid, true);
  assert.equal(expandBarrierMap(map), map);
});

test('authored line and gaps survive roundtrip and model change without generated placements', () => {
  const source = barrier('wall', { gaps: [{ at: 20, width: 3 }] });
  const map = mapWith([source]), snapshot = JSON.stringify(map);
  const runtime = expandBarrierMap(map);
  assert.equal(JSON.stringify(map), snapshot);
  assert.equal(map.objects.length, 0);
  assert.ok(runtime.objects.length > 0);
  assert.equal(expandBarrierMap(runtime), runtime);
  assert.ok(runtime.objects.every(item => item.barrierId === source.id));
  const restored = JSON.parse(snapshot);
  Object.assign(restored.barriers[0], { kind: 'fence', variant: 'kit-wood' });
  assert.equal(validateWorldmap(restored).valid, true);
  assert.deepEqual(restored.barriers[0].points, source.points);
  assert.deepEqual(restored.barriers[0].gaps, source.gaps);
  assert.deepEqual(barrierSections(restored.barriers[0]), barrierSections(source));
  assert.ok(expandBarrierMap(restored).objects.every(item => item.kind === 'fence'));
});

test('solid sections span endpoints and leave a completely open three metre passage', () => {
  const source = makeBarrier('wall', [[0, 0], [12, 0]], { id: 'wall-line', gaps: [{ at: 6, width: 3 }] });
  assert.deepEqual(barrierSections(source).map(({ a, b }) => [a, b]), [[[0, 0], [4.5, 0]], [[7.5, 0], [12, 0]]]);
  const pieces = generateBarrierObjects(source), kit = getEnvironmentKitDefinition(source.kind, source.variant);
  for (const piece of pieces) {
    const half = kit.footprint.halfWidth * piece.scale * piece.longitudinalScale;
    assert.ok(piece.position[0] + half <= 4.5 + 1e-8 || piece.position[0] - half >= 7.5 - 1e-8);
    assert.ok(piece.position[0] - half >= -1e-8 && piece.position[0] + half <= 12 + 1e-8);
    close(piece.scale, 1);
  }
});

test('diagonal pieces use the same x/z and rotation convention as the Three renderer', () => {
  const line = makeBarrier('fence', [[2, 3], [14, 19]], { id: 'diagonal', scale: 1.4 });
  close(barrierLength(line), 20);
  const kit = getEnvironmentKitDefinition('fence', 'kit-wood');
  const pieces = generateBarrierObjects(line), ends = [];
  for (const piece of pieces) {
    close(piece.rotation, -Math.atan2(16, 12));
    close(piece.scale, 1.4);
    const half = kit.footprint.halfWidth * piece.scale * piece.longitudinalScale;
    ends.push([-1, 1].map(sign => [piece.position[0] + sign * Math.cos(piece.rotation) * half, piece.position[1] - sign * Math.sin(piece.rotation) * half]));
  }
  ends[0][0].forEach((value, index) => close(value, line.points[0][index]));
  ends.at(-1)[1].forEach((value, index) => close(value, line.points[1][index]));
  for (let i = 1; i < ends.length; i++) ends[i][0].forEach((value, index) => close(value, ends[i - 1][1][index]));
});

test('gaps crossing a corner remove both adjacent portions and keep their physical width', () => {
  const source = makeBarrier('wall', [[0, 0], [10, 0], [10, 10]], { id: 'corner', gaps: [{ at: 10, width: 4 }] });
  assert.deepEqual(barrierSections(source).map(({ a, b }) => [a, b]), [[[0, 0], [8, 0]], [[10, 2], [10, 10]]]);
  close(barrierLength(source), 20);
  assert.equal(validateWorldmap(mapWith([source])).valid, true);
});

test('several unordered gaps remain stable through generation and do not mutate the authoring document', () => {
  const source = barrier('fence', { gaps: [{ at: 31, width: 3 }, { at: 7, width: 2 }] });
  const before = JSON.stringify(source);
  assert.equal(barrierSections(source).length, 3);
  assert.deepEqual(generateBarrierObjects(source), generateBarrierObjects(source));
  assert.equal(JSON.stringify(source), before);
  assert.equal(validateWorldmap(mapWith([source])).valid, true);
});

test('short remnants keep their endpoints and do not scale height or depth', () => {
  const source = makeBarrier('fence', [[0, 0], [.25, 0]], { id: 'short', scale: 2 });
  const [piece] = generateBarrierObjects(source);
  assert.equal(generateBarrierObjects(source).length, 1);
  close(piece.scale, 2);
  close(piece.position[0], .125);
  close(piece.longitudinalScale * piece.scale * getEnvironmentKitDefinition('fence', 'kit-wood').footprint.halfWidth * 2, .25);
});

test('malformed, overlapping or out of range lines and gaps fail validation', () => {
  const invalid = [
    line => { line.kind = 'script'; }, line => { line.variant = 'kit-wood'; },
    line => { line.scale = NaN; }, line => { line.scale = 4; }, line => { line.scale = .1; },
    line => { line.points = []; }, line => { line.points = [[0, 0], [Infinity, 1]]; },
    line => { line.points = [[0, 0], [0, 0]]; }, line => { line.points = [[0, 0], [.01, 0]]; },
    line => { line.points = [[0, 0], [151, 0]]; }, line => { line.gaps = null; },
    line => { line.gaps = [{ at: 10, width: -2 }]; }, line => { line.gaps = [{ at: 10, width: 0 }]; },
    line => { line.gaps = [{ at: 10, width: Infinity }]; }, line => { line.gaps = [{ at: 10, width: .5 }]; },
    line => { line.gaps = [{ at: 0, width: 2 }]; }, line => { line.gaps = [{ at: 40, width: 2 }]; },
    line => { line.gaps = [{ at: 10, width: 3 }, { at: 11, width: 3 }]; },
    line => { line.points = [[0, 0], [3, 0]]; line.gaps = [{ at: 1.5, width: 3 }]; },
    line => { line.id = 'x'.repeat(57); }, line => { line.name = '\u0001'; },
    line => { line.points = Array.from({ length: 129 }, (_, i) => [i, 0]); },
  ];
  for (const mutate of invalid) {
    const line = barrier(); mutate(line);
    assert.equal(validateWorldmap(mapWith([line])).valid, false, JSON.stringify(line));
  }
  for (const input of [null, {}, 'barriers', [null], Array(401).fill(barrier())]) {
    const map = mapWith(); map.barriers = input;
    assert.equal(validateWorldmap(map).valid, false);
  }
});

test('canonical and derived IDs cannot collide with objects, zones or another line', () => {
  const line = barrier();
  assert.equal(validateWorldmap(mapWith([line, structuredClone(line)])).valid, false);
  const zoneCollision = mapWith([barrier('wall', { id: 'phase' })]);
  assert.ok(validateWorldmap(zoneCollision).errors.some(error => /mehrfach/.test(error)));
  const derivedCollision = mapWith([line]);
  derivedCollision.objects.push({ id: `${line.id}-segment-0`, name: 'Herz', kind: 'heart', variant: 'healing', position: [0, 0], rotation: 0, scale: 1 });
  assert.ok(validateWorldmap(derivedCollision).errors.some(error => /erzeugte Objekt-ID/.test(error)));
});

test('a line cannot jump a narrow bay even when both endpoints and its midpoint are on land', () => {
  const map = mapWith([makeBarrier('wall', [[-50, 20], [50, 20]], { id: 'bay-line' })]);
  map.island.points = [[-100, -100], [100, -100], [100, 100], [40, 100], [40, 0], [30, 0], [30, 100], [-100, 100]];
  assert.equal(pointInPolygon([0, 20], map.island.points), true);
  assert.ok(validateWorldmap(map).errors.some(error => /vollständig auf der Insel/.test(error)));
});

test('runtime generation budgets include authored objects and all barrier pieces', () => {
  const map = mapWith(Array.from({ length: 70 }, (_, i) => makeBarrier('fence', [[-90, i], [90, i]], { id: `long-${i}`, scale: .25 })));
  assert.ok(validateWorldmap(map).errors.some(error => /12000/.test(error)));
  assert.throws(() => expandBarrierMap(map), /zu viele Objekte/);
  const giant = makeBarrier('wall', [[0, 0], [6000, 0]], { id: 'giant' });
  assert.throws(() => generateBarrierObjects(giant), /zu lang/);
});

test('the schema describes optional canonical lines and supported style pairs', () => {
  const schema = JSON.parse(readFileSync(new URL('../worldmap.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.required.includes('barriers'), false);
  assert.equal(schema.properties.barriers.items.$ref, '#/$defs/barrier');
  for (const style of BARRIER_STYLES) {
    assert.ok(schema.$defs.barrier.properties.kind.enum.includes(style.kind));
    assert.ok(schema.$defs.barrier.properties.variant.enum.includes(style.variant));
    assert.ok(getEnvironmentKitDefinition(style.kind, style.variant));
  }
});
