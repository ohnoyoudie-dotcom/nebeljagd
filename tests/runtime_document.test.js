import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWorldDocument, MAX_MAP_BYTES } from '../src/map/runtime-document.js';
const original = JSON.parse(readFileSync(new URL('../worldmap.json', import.meta.url)));

test('the runtime imports the exact edited document and old maps stay intentionally empty', () => {
  const edited = structuredClone(original);
  edited.objects[0].rotation = .7;
  edited.objects[0].scale = 1.3;
  assert.deepEqual(parseWorldDocument(JSON.stringify(edited)), edited);
  const legacy = structuredClone(original); delete legacy.objects;
  assert.deepEqual(parseWorldDocument(JSON.stringify(legacy)).objects, []);
});

test('invalid runtime imports fail before any browser storage or navigation', () => {
  const invalid = structuredClone(original); invalid.objects[0].position = [9999, 9999];
  assert.throws(() => parseWorldDocument(JSON.stringify(invalid)), /außerhalb/);
  assert.throws(() => parseWorldDocument('{oops'), /JSON/);
  assert.throws(() => parseWorldDocument(' '.repeat(MAX_MAP_BYTES + 1)), /5 MB/);
  assert.throws(() => parseWorldDocument('null'), /JSON-Objekt/);
});
