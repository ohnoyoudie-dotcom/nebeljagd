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
    if (next.error) throw next.error;
    return {ok: !next.http || next.http < 400, status: next.http ?? 200, json: async () => {
      if (next.jsonError) throw next.jsonError;
      return next.body ?? next;
    }};
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

test('a superseded failed attempt can be replaced by a successful build of the same commit', async () => {
  const api = mockApi([site, {status: 'queued'}, {http: 404}, {commit, status: 'errored'}, {commit, status: 'cancelled'}, {commit, status: 'building'}, {commit, status: 'built'}]);
  const result = await requestPagesBuild({...settings, ...api});
  assert.equal(result.commit, commit);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
});

test('transient GET timeout and server failures are retried without resubmitting a build', async () => {
  const api = mockApi([site, {status: 'queued'}, {error: new DOMException('timed out', 'TimeoutError')}, {http: 502}, {commit, status: 'built'}]);
  const result = await requestPagesBuild({...settings, ...api});
  assert.equal(result.commit, commit);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(api.calls.filter(call => call.path.endsWith('/latest')).length, 3);
});

test('an interrupted GET response body is retried as a transport failure', async () => {
  const api = mockApi([site, {status: 'queued'}, {jsonError: new DOMException('body timed out', 'TimeoutError')}, {commit, status: 'built'}]);
  assert.equal((await requestPagesBuild({...settings, ...api})).commit, commit);
  assert.equal(api.calls.filter(call => call.path.endsWith('/latest')).length, 2);
});

test('transient configuration reads retry but permanent authorization failures stop immediately', async () => {
  const retry = mockApi([{http: 503}, site, {status: 'queued'}, {commit, status: 'built'}]);
  assert.equal((await requestPagesBuild({...settings, ...retry})).commit, commit);
  const forbidden = mockApi([site, {status: 'queued'}, {http: 403}]);
  await assert.rejects(requestPagesBuild({...settings, ...forbidden}), /HTTP 403/);
  assert.equal(forbidden.calls.length, 3);
});

test('an ambiguous POST timeout is not retried and can be confirmed by reading the exact commit', async () => {
  const api = mockApi([site, {error: new DOMException('timed out', 'TimeoutError')}, {commit, status: 'building'}, {commit, status: 'built'}]);
  assert.equal((await requestPagesBuild({...settings, ...api})).commit, commit);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 1);
});

test('only explicit POST throttling or unavailability is retried once', async () => {
  const api = mockApi([site, {http: 429}, {status: 'queued'}, {commit, status: 'built'}]);
  assert.equal((await requestPagesBuild({...settings, ...api})).commit, commit);
  assert.equal(api.calls.filter(call => call.method === 'POST').length, 2);
  const ambiguous = mockApi([site, {http: 502}, {commit, status: 'built'}]);
  assert.equal((await requestPagesBuild({...settings, ...ambiguous})).commit, commit);
  assert.equal(ambiguous.calls.filter(call => call.method === 'POST').length, 1);
});

test('a final errored attempt is reported only when the wall-clock deadline expires', async () => {
  let clock = 0;
  const api = mockApi([site, {status: 'queued'}, {commit, status: 'errored'}, {commit, status: 'errored'}]);
  await assert.rejects(requestPagesBuild({...settings, ...api,
    now: () => clock, wait: async milliseconds => { clock += milliseconds; },
    pollMilliseconds: 5, pollTimeoutMilliseconds: 10,
  }), /bounded polling window.*Last observed matching build status: errored.*Deployment remains unconfirmed/);
  assert.equal(clock, 10);
  assert.equal(api.calls.filter(call => call.path.endsWith('/latest')).length, 2);
});

test('repeated unavailable GETs finish as unknown with a bounded attempt count', async () => {
  const api = mockApi([site, {status: 'queued'}, {http: 503}, {http: 503}, {http: 503}]);
  await assert.rejects(requestPagesBuild({...settings, ...api, attempts: 1}), /No matching build was observed.*Deployment remains unconfirmed/);
  assert.equal(api.calls.length, 5);
});
