import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { legacyGameEntry } from '../scripts/legacy-game-entry.js';
import { runtimeEnvironment } from '../server/runtime-environment.js';

test('old game bookmarks preserve playtest, classroom, version and anchor on web and disk', () => {
  const script = legacyGameEntry().match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const base of ['https://example.test/preview/', 'file:///tmp/Magebrawl/']) {
    const current = new URL('nebeljagd.html?mapSource=editor&mode=lobby&v=test-build#play', base);
    let destination; const anchor = {};
    vm.runInNewContext(script, {URL, document: {getElementById: () => anchor}, location: {
      href: current.href, search: current.search, hash: current.hash, replace: value => { destination = value; },
    }});
    assert.equal(destination, new URL('magebrawl.html?mapSource=editor&mode=lobby&v=test-build#play', base).href);
    assert.equal(anchor.href, destination);
  }
});

test('existing server settings still work and explicit Magebrawl settings take priority', () => {
  const legacy = { NEBELJAGD_DATA_DIR: '/old/private', NEBELJAGD_SECURE_COOKIES: '1', PORT: '5201' };
  const env = runtimeEnvironment(legacy);
  assert.equal(env.MAGEBRAWL_DATA_DIR, legacy.NEBELJAGD_DATA_DIR);
  assert.equal(env.MAGEBRAWL_SECURE_COOKIES, '1'); assert.equal(env.PORT, '5201');
  assert.equal(legacy.MAGEBRAWL_DATA_DIR, undefined, 'does not modify the process environment');
  assert.equal(runtimeEnvironment({...legacy, MAGEBRAWL_DATA_DIR:'/new/private'}).MAGEBRAWL_DATA_DIR, '/new/private');
});
