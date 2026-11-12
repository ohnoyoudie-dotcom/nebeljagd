import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertWorldmapSource } from '../scripts/check-worldmap-source.js';

const original = JSON.stringify({ objects: [{ id: 'existing' }] });
const edited = JSON.stringify({ objects: [{ id: 'existing' }, { id: 'my-stump' }] });
const release = { files: { 'worldmap.json': { sha256: createHash('sha256').update(original).digest('hex') } } };
test('building must not erase a map edited only inside welt', () => {
  assert.throws(() => assertWorldmapSource(original, edited, release), /nicht überschrieben/);
});
test('normal source changes can rebuild an untouched generated map', () => {
  assert.doesNotThrow(() => assertWorldmapSource(edited, original, release));
});
test('an authored map explicitly recovered to the source can be rebuilt', () => {
  assert.doesNotThrow(() => assertWorldmapSource(edited, edited, release));
  assert.doesNotThrow(() => assertWorldmapSource(edited, JSON.stringify(JSON.parse(edited), null, 2), release));
});
