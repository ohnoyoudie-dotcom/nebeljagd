import test from 'node:test';
import assert from 'node:assert/strict';
import { readLobbySession, requireLobbySession, watchLobbySession, leaveLobby } from '../src/lobby-access.js';

const reply = data => async () => ({ ok: true, json: async () => data });
const student = { role: 'student', room: { code: 'WALD42', expiresAt: '2030-01-01T00:00:00.000Z' } };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('practice access accepts server student sessions and teacher previews, rejects absent/revoked sessions', async () => {
  assert.deepEqual(await readLobbySession(reply(student)), student);
  assert.deepEqual(await readLobbySession(reply({ role: 'teacher' })), { role: 'teacher' });
  assert.equal(await readLobbySession(reply({ role: null })), null);
  assert.equal(await readLobbySession(reply({ role: 'student' })), null);
  assert.equal(await readLobbySession(async () => ({ ok: false })), null);
  let request;
  await readLobbySession(async (url, options) => { request = { url, options }; return { ok: true, json: async () => student }; });
  assert.equal(request.url, '/api/session');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.credentials, 'same-origin');
});

test('initial access denial redirects and prevents game startup even after a network failure', async () => {
  for (const fetchImpl of [reply({ role: null }), async () => { throw new Error('offline'); }]) {
    const redirects = [];
    await assert.rejects(requireLobbySession({ fetchImpl, location: { replace: url => redirects.push(url) } }), /melde dich/);
    assert.deepEqual(redirects, ['./index.html?reason=session-ended']);
  }
});

test('room revocation stops polling, pauses the game and redirects once', async () => {
  let current = student, tick, interval, checks = 0, stopped = 0, paused = 0;
  const redirects = [], listeners = new Map();
  const document = {
    hidden: false,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name),
  };
  watchLobbySession({
    fetchImpl: async () => { checks++; return { ok: true, json: async () => current }; },
    location: { replace: url => redirects.push(url) }, document,
    setIntervalImpl: (callback, milliseconds) => { tick = callback; interval = milliseconds; return 7; },
    clearIntervalImpl: timer => { assert.equal(timer, 7); stopped++; },
    onInvalid: () => paused++,
  });
  await flush();
  assert.equal(checks, 1);
  assert.equal(interval, 15000);
  assert.equal(paused, 0);
  current = { role: null };
  listeners.get('visibilitychange')();
  await flush();
  await tick();
  assert.equal(checks, 2);
  assert.equal(paused, 1);
  assert.equal(stopped, 1);
  assert.equal(listeners.size, 0);
  assert.deepEqual(redirects, ['./index.html?reason=session-ended']);
});

test('stopping session observation during an in-flight check prevents stale navigation', async () => {
  let respond;
  const redirects = [];
  const stop = watchLobbySession({
    fetchImpl: () => new Promise(resolve => { respond = resolve; }),
    location: { replace: url => redirects.push(url) }, document: null,
    setIntervalImpl: () => 1, clearIntervalImpl: () => {},
    onInvalid: () => assert.fail('stopped check must not pause'),
  });
  stop();
  respond({ ok: true, json: async () => ({ role: null }) });
  await flush();
  assert.deepEqual(redirects, []);
});

test('leaving ends a student session but returns teacher previews to the teacher area', async () => {
  const requests = [], navigations = [];
  const dependencies = { fetchImpl: async (...args) => requests.push(args), location: { assign: url => navigations.push(url) } };
  await leaveLobby(student, dependencies);
  await leaveLobby({ role: 'teacher' }, dependencies);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], '/api/logout');
  assert.equal(requests[0][1].method, 'POST');
  assert.equal(requests[0][1].headers['Content-Type'], 'application/json');
  assert.equal(requests[0][1].body, '{}');
  assert.deepEqual(navigations, ['./index.html', './teacher.html']);
});
