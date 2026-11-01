import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuildInfo, embedBuildInfo, readBuildInfo, verifyBuildInfo } from '../scripts/build-info.js';

const sourceCommit = 'a'.repeat(40);
const map = Buffer.from('{"name":"Project map","objects":[]}\n');
const entries = [
  { name: 'worldmap.json', bytes: map },
  { name: 'map-editor.html', bytes: Buffer.from('<html><head></head><body>Editor</body></html>') },
  { name: 'nebeljagd.html', bytes: Buffer.from('<html><head></head><body>Game</body></html>') },
];
const make = (files = entries, overrides = {}) => createBuildInfo(files, {
  sourceCommit, builtAt: '2026-11-01T10:00:00.000Z', ...overrides,
});

test('matching build ID is independent of timestamp and artifact order', () => {
  const first = make();
  const later = make([...entries].reverse(), { builtAt: '2026-11-02T10:00:00.000Z' });
  assert.equal(first.buildId, later.buildId);
  assert.notEqual(first.builtAt, later.builtAt);
  assert.equal(verifyBuildInfo(first, map), first);
});

test('changing editor, game, project map or source changes the shared build ID', () => {
  for (const name of ['worldmap.json', 'map-editor.html', 'nebeljagd.html']) {
    const changed = entries.map(entry => entry.name === name ? { ...entry, bytes: Buffer.concat([entry.bytes, Buffer.from(' changed')]) } : entry);
    assert.notEqual(make(changed).buildId, make().buildId, name);
  }
  assert.notEqual(make(entries, { sourceCommit: 'b'.repeat(40) }).buildId, make().buildId);
});

test('metadata round trip preserves source and map fingerprint and rejects a different map', () => {
  const info = make();
  const html = embedBuildInfo('<!doctype html><html><head></head><body>Editor</body></html>', info);
  assert.deepEqual(readBuildInfo(html), info);
  assert.throws(() => verifyBuildInfo(readBuildInfo(html), Buffer.from('{}')), /does not match/);
  assert.throws(() => embedBuildInfo(html, info), /already embedded/);
  assert.throws(() => readBuildInfo('<html></html>'), /missing/);
});

test('build metadata needs a unique project map artifact', () => {
  assert.throws(() => make(entries.slice(1)), /worldmap.json/);
  assert.throws(() => make([...entries, entries[0]]), /Duplicate/);
});

test('source editor placeholder is populated once without creating a duplicate metadata tag', () => {
  const source = '<html><head></head><body><script id="editor-build-info" type="application/json">null</script></body></html>';
  const html = embedBuildInfo(source, make());
  assert.deepEqual(readBuildInfo(html), make());
  assert.equal(html.match(/id="editor-build-info"/g).length, 1);
  assert.throws(() => embedBuildInfo(html, make()), /already embedded/);
});
