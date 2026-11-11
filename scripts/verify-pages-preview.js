import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';

// Run after the existing Pages build confirms its exact main commit. Verify
// the permanent entry, actual editor, game and authored map served by the CDN.
const expected = JSON.parse(await readFile(process.argv[2] ?? '.pages-site/preview/release.json', 'utf8'));
const base = (process.argv[3] ?? 'https://ohnoyoudie-dotcom.github.io/nebeljagd/preview/').replace(/\/?$/, '/');
assert.match(expected.buildId, /^[a-f0-9]{12}$/);
const files = ['editor.html', 'map-editor.html', 'magebrawl.html', 'worldmap.json'];
for (const name of files) assert.match(expected.files[name].sha256, /^[a-f0-9]{64}$/);

async function verify(name, check) {
  let failure;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      // Revalidate the permanent resource, without relying on a different URL.
      const response = await fetch(new URL(name, base), {
        headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(120000),
      });
      assert.equal(response.status, 200, `${name}: HTTP status`);
      await check(Buffer.from(await response.arrayBuffer()));
      console.log(`Live verified: ${name}, build ${expected.buildId}`);
      return;
    } catch (error) {
      failure = error;
      if (attempt < 29) await sleep(5000);
    }
  }
  throw failure;
}

await verify('release.json', bytes => {
  const actual = JSON.parse(bytes.toString('utf8'));
  assert.equal(actual.buildId, expected.buildId, 'Pages must serve this release');
  assert.equal(actual.sourceCommit, expected.sourceCommit, 'Pages source commit');
  for (const name of files) assert.deepEqual(actual.files[name], expected.files[name]);
});
for (const name of files) await verify(name, bytes => {
  assert.equal(bytes.length, expected.files[name].bytes, `${name}: byte length`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.files[name].sha256, `${name}: published bytes`);
});
