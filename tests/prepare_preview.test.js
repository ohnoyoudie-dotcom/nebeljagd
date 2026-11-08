import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preparePreview, previewFiles } from '../scripts/prepare-preview.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'nebeljagd-preview-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const source = join(root, 'welt');
  await mkdir(source);
  const files = {};
  const map = JSON.stringify({name: 'Meine Projektkarte', objects: []});
  const info = {buildId: 'test-build', builtAt: '2026-11-01T10:00:00.000Z', sourceCommit: 'a'.repeat(40), mapSha256: createHash('sha256').update(map).digest('hex')};
  for (const name of previewFiles) {
    const bytes = Buffer.from(name === 'worldmap.json' ? map : name.endsWith('.html') ? `<script id="editor-build-info" type="application/json">${JSON.stringify(info)}</script>verified ${name}` : `verified ${name}`);
    await writeFile(join(source, name), bytes);
    files[name] = {bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
  const release = {buildId: 'test-build', builtAt: '2026-11-01T10:00:00.000Z', sourceBaseCommit: 'a'.repeat(40), localBuild: true, files};
  await writeFile(join(source, 'release.json'), JSON.stringify(release));
  return {root, source, release};
}

test('preview delivers one verified editor/map/game build and preserves other main files', async t => {
  const {root, source, release} = await fixture(t);
  const main = join(root, 'main'), destination = join(main, 'preview');
  await mkdir(destination, {recursive: true});
  await writeFile(join(main, 'index.html'), 'existing classroom portal');
  await writeFile(join(destination, 'authored-map.json'), 'unrelated existing map');
  await writeFile(join(destination, 'nebeljagd-welt-und-editor.zip'), 'old managed download');
  const result = await preparePreview(source, destination);
  assert.equal(await readFile(join(main, 'index.html'), 'utf8'), 'existing classroom portal');
  assert.equal(await readFile(join(destination, 'authored-map.json'), 'utf8'), 'unrelated existing map');
  assert.equal(await readFile(join(destination, 'index.html'), 'utf8'), await readFile(join(source, 'magebrawl.html'), 'utf8'));
  assert.equal(result.buildId, release.buildId);
  assert.equal(result.sourceCommit, release.sourceBaseCommit);
  assert.equal(result.projectMap.sha256, release.files['worldmap.json'].sha256);
  assert.equal(result.files['map-editor.html'].sha256, release.files['map-editor.html'].sha256);
  assert.equal(result.loginAvailable, false);
  assert.equal('localBuild' in result, false);
  await assert.rejects(readFile(join(destination, 'nebeljagd-welt-und-editor.zip')), {code: 'ENOENT'});
  assert.ok(result.files['magebrawl-welt-und-editor.zip']);
  assert.ok(result.files['nebeljagd.html'], 'old bookmarks receive the verified redirect');
});

test('tampered artifacts fail before touching the destination', async t => {
  const {root, source} = await fixture(t);
  const destination = join(root, 'preview');
  await mkdir(destination);
  await writeFile(join(destination, 'map-editor.html'), 'previous working editor');
  await writeFile(join(source, 'worldmap.json'), '{"name":"unverified map"}');
  await assert.rejects(preparePreview(source, destination), /does not match release.json: worldmap.json/);
  assert.equal(await readFile(join(destination, 'map-editor.html'), 'utf8'), 'previous working editor');
  await assert.rejects(readFile(join(destination, 'release.json')), {code: 'ENOENT'});
});

test('a missing verified artifact blocks a partial publication', async t => {
  const {root, source, release} = await fixture(t);
  delete release.files['editor.html'];
  await writeFile(join(source, 'release.json'), JSON.stringify(release));
  await assert.rejects(preparePreview(source, join(root, 'preview')), /missing a verified artifact: editor.html/);
});

test('matching file checksums cannot hide an editor built for another project map', async t => {
  const {root, source, release} = await fixture(t);
  const editor = (await readFile(join(source, 'map-editor.html'), 'utf8')).replace(release.files['worldmap.json'].sha256, 'b'.repeat(64));
  await writeFile(join(source, 'map-editor.html'), editor);
  release.files['map-editor.html'] = {bytes: Buffer.byteLength(editor), sha256: createHash('sha256').update(editor).digest('hex')};
  await writeFile(join(source, 'release.json'), JSON.stringify(release));
  await assert.rejects(preparePreview(source, join(root, 'preview')), /do not belong to the same build: map-editor.html/);
});

test('the same source release produces the same preview metadata', async t => {
  const {root, source} = await fixture(t);
  await preparePreview(source, join(root, 'one'));
  await preparePreview(source, join(root, 'two'));
  assert.equal(await readFile(join(root, 'one', 'release.json'), 'utf8'), await readFile(join(root, 'two', 'release.json'), 'utf8'));
  await assert.rejects(preparePreview(source, source), /must differ/);
});
