import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { distanceToSegment, pointInPolygon, validateWorldmap } from '../src/map/model.js';
import { getObjectDefinition, makeWorldObject, normalizeWorldmap } from '../src/map/objects.js';
import { renderWorldmapSvg } from '../src/map/render.js';
import { getMoundDefinition } from '../src/overgrown-mounds.js';

const map = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../worldmap.schema.json', import.meta.url), 'utf8'));
const mounds = map.objects.filter(item => item.kind === 'mound');
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineDistance = (p, line) => Math.min(...line.points.slice(1).map((b, i) => distanceToSegment(p, line.points[i], b)));
function coverRadius(item) {
  if (item.kind === 'mound') {
    const model = getMoundDefinition(item.variant);
    return Math.hypot(model.halfWidth, model.halfDepth) * item.scale;
  }
  if (item.kind === 'grass' || item.kind === 'flower') return item.radius * item.scale + .5;
  return ({ house: 11.5, tree: 1, rock: 1.6, bush: 1.5, ruin: 8, shrine: 2, chest: 1.4,
    bow: .9, sword: .9, fireStaff: .9, iceStaff: .9, heart: .9 }[item.kind] ?? 1) * item.scale;
}

test('authored mounds leave village routes, starter loot and all distributed starts clear', () => {
  assert.equal(mounds.length, 4);
  assert.equal(mounds.filter(item => item.variant === 'ridge').length, 2);
  assert.equal(mounds.filter(item => item.variant === 'knoll').length, 2);
  for (const item of mounds) {
    const radius = coverRadius(item);
    assert.ok(pointInPolygon(item.position, map.island.points));
    for (let i = 0; i < map.island.points.length; i++) {
      assert.ok(distanceToSegment(item.position, map.island.points[i], map.island.points[(i + 1) % map.island.points.length]) > radius + .8, `${item.id}: coast clearance`);
    }
    for (const line of [...map.paths, ...map.rivers]) {
      assert.ok(lineDistance(item.position, line) > line.width / 2 + radius + .8, `${item.id}: blocked ${line.id}`);
    }
    assert.ok(distance(item.position, map.gameplay.spawnPosition) > radius + 8, `${item.id}: initial clearing`);
    for (const start of map.spawnAreas) assert.ok(distance(item.position, start.position) > start.radius + radius + .8, `${item.id}: blocked ${start.id}`);
    for (const other of map.objects) if (other.id !== item.id) {
      assert.ok(distance(item.position, other.position) > radius + coverRadius(other) + .8, `${item.id}: intersects ${other.id}`);
    }
  }
  assert.equal(map.spawnAreas.reduce((sum, area) => sum + area.capacity, 0), 50);
});

test('mound variants, transforms and stable IDs survive JSON and vector export', () => {
  const definition = getObjectDefinition('mound');
  assert.deepEqual(definition.variants.map(item => item.id), ['ridge', 'knoll']);
  assert.ok(schema.$defs.worldObject.properties.kind.enum.includes('mound'));
  const rule = schema.$defs.worldObject.allOf.find(rule => rule.if?.properties?.kind?.const === 'mound');
  assert.deepEqual(rule.then.properties.variant.enum, ['ridge', 'knoll']);
  const candidate = structuredClone(map);
  candidate.objects = [
    makeWorldObject('mound', [41, -34], { id: 'edited-ridge', variant: 'ridge', rotation: Math.PI / 2, scale: 1.5 }),
    makeWorldObject('mound', [47, -58], { id: 'edited-knoll', variant: 'knoll', rotation: -Math.PI / 4, scale: .75 }),
  ];
  const restored = normalizeWorldmap(JSON.parse(JSON.stringify(candidate)));
  assert.deepEqual(restored.objects, candidate.objects);
  assert.equal(validateWorldmap(restored).valid, true);
  const svg = renderWorldmapSvg(restored);
  assert.match(svg, /data-object-kind="mound" data-object-variant="ridge" transform="translate\(41 -34\) rotate\(-90\) scale\(1\.5\)"/);
  assert.match(svg, /data-object-kind="mound" data-object-variant="knoll" transform="translate\(47 -58\) rotate\(45\) scale\(0\.75\)"/);
  for (const variant of ['ridge', 'knoll']) assert.ok(svg.includes(`href="#world-object-mound-${variant}"`));
  restored.objects[0].variant = 'walkable';
  assert.equal(validateWorldmap(restored).valid, false);
});
