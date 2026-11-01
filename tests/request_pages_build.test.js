import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPagesBuild } from '../scripts/request-pages-build.js';

const commit = 'a'.repeat(40);
const site = {build_type: 'legacy', source: {branch: 'main', path: '/'}};
function mockApi(responses) {
  const calls = [];
  return {calls, fetchImpl: async (url, options) => {
    calls.push({path: new URL(url).pathname, method: options.method});
    const next = responses.shift();
    assert.ok(next, 'Unexpected GitHub request');
    return {ok: !next.http || next.http < 400, status: next.http ?? 200, json: async () => next.body ?? next};
  }};
}
const settings = {repository: 'example/nebeljagd', commit, token: 'workflow-test-token', pollMilliseconds: 0, wait: async () => {}};

test('requests a branch Pages build and waits for the exact published commit', async () => {
  const api = mockApi([site, {status: 'queued'}, {commit: 'b'.repeat(40), status: 'built'}, {commit, status: 'building'}, {commit, status: 'built'}]);
  const result = await requestPagesBuild({...settings, ...api});
  assert.equal(result.commit, commit);
  assert.equal(api.calls[1].method, 'POST');
  assert.ok(api.calls[1].path.endsWith('/pages/builds'));
  assert.equal(api.calls.length, 5);
});

test('workflow Pages configuration is reported without changing its settings', async () => {
  const api = mockApi([{build_type: 'workflow'}]);
  await assert.rejects(requestPagesBuild({...settings, ...api}), /use its deployment workflow instead/);
  assert.deepEqual(api.calls.map(call => call.method), ['GET']);
});

test('a Pages source outside main root cannot publish a mismatched site', async () => {
  const api = mockApi([{...site, source: {branch: 'main', path: '/docs'}}]);
  await assert.rejects(requestPagesBuild({...settings, ...api}), /must publish main from the repository root/);
  assert.equal(api.calls.length, 1);
});

test('another successful commit is not accepted as this release', async () => {
  const api = mockApi([site, {status: 'queued'}, {commit: 'b'.repeat(40), status: 'built'}]);
  await assert.rejects(requestPagesBuild({...settings, ...api, attempts: 1}), /different or older successful build/);
});

test('a transient missing build can settle, but a failed expected commit stops', async () => {
  const api = mockApi([site, {status: 'queued'}, {http: 404}, {commit, status: 'errored'}]);
  await assert.rejects(requestPagesBuild({...settings, ...api}), /failed to build the expected commit/);
});
