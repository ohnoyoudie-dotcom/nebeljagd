import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createClassroomServer, saveTeacherPassword } from '../server/classroom.js';

const password = 'test-only-classroom-passphrase';
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nebeljagd-school-'));
  const publicDir = join(root, 'public'), dataDir = join(root, 'private');
  await mkdir(publicDir); await mkdir(dataDir);
  for (const name of ['index.html', 'teacher.html', 'map-editor.html', 'avatar-preview.html', 'lobby.html', 'nebeljagd.html']) await writeFile(join(publicDir, name), `<!doctype html><title>${name}</title>`);
  await writeFile(join(publicDir, 'release.json'), JSON.stringify({ buildId: 'test-build', builtAt: '2026-11-01T12:00:00.000Z' }));
  if (options.configured !== false) await saveTeacherPassword(dataDir, password);
  let clock = Date.parse('2026-11-01T12:00:00.000Z');
  const server = await createClassroomServer({ publicDir, dataDir, now: () => clock, ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const call = async (path, { method = 'GET', data, cookie, origin = url, headers = {} } = {}) => {
    const response = await fetch(url + path, { method, redirect: 'manual', headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...headers,
    }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    const text = await response.text();
    return { status: response.status, headers: response.headers, value: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text,
      cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = () => call('/api/teacher/login', { method: 'POST', data: { password } });
  return { root, publicDir, dataDir, server, url, call, login, advance: ms => clock += ms };
}

test('teacher and pupils have separate sessions; only teacher can issue/close codes and open editor', async t => {
  const f = await fixture(t);
  const anonymous = await f.call('/api/session');
  assert.equal(anonymous.value.role, null); assert.equal(anonymous.value.teacherConfigured, true);
  assert.equal(anonymous.value.build.id, 'test-build');
  assert.equal((await f.call('/map-editor.html')).status, 302);
  assert.equal((await f.call('/nebeljagd.html')).status, 302);
  assert.equal((await f.call('/game.html')).status, 302);
  assert.equal((await f.call('/nebeljagd.html?mode=lobby')).status, 302);
  assert.equal((await f.call('/api/rooms')).status, 403);
  assert.equal((await f.call('/api/teacher/login', { method: 'POST', data: { password: 'wrong' } })).status, 401);
  const teacher = await f.login(); assert.equal(teacher.status, 200);
  assert.match(teacher.headers.get('set-cookie'), /HttpOnly/); assert.match(teacher.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await f.call('/teacher.html', { cookie: teacher.cookie })).status, 200);
  assert.equal((await f.call('/map-editor.html', { cookie: teacher.cookie })).status, 200);
  assert.equal((await f.call('/nebeljagd.html?mapSource=editor', { cookie: teacher.cookie })).status, 200);
  const created = await f.call('/api/rooms', { method: 'POST', cookie: teacher.cookie, data: { name: 'Klasse 7 · Übung' } });
  assert.equal(created.status, 201); assert.match(created.value.room.code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal((await f.call('/api/student/join', { method: 'POST', data: { code: 'XXXXXXXX' } })).status, 401);
  const pupil = await f.call('/api/student/join', { method: 'POST', data: { code: created.value.room.code.toLowerCase() } });
  assert.equal(pupil.status, 200); assert.notEqual(pupil.cookie, teacher.cookie);
  const peer = await f.call('/api/student/join', { method: 'POST', data: { code: created.value.room.code } });
  assert.notEqual(peer.cookie, pupil.cookie, 'each browser gets its own session');
  assert.equal((await f.call('/api/session', { cookie: pupil.cookie })).value.room.name, 'Klasse 7 · Übung');
  assert.equal((await f.call('/lobby.html', { cookie: pupil.cookie })).status, 200);
  assert.equal((await f.call('/nebeljagd.html?mode=lobby', { cookie: pupil.cookie })).status, 200);
  assert.equal((await f.call('/map-editor.html', { cookie: pupil.cookie })).status, 403);
  assert.equal((await f.call('/api/rooms', { method: 'POST', cookie: pupil.cookie, data: {} })).status, 403);
  assert.equal((await f.call(`/api/rooms/${created.value.room.id}`, { method: 'DELETE', cookie: pupil.cookie })).status, 403);
  assert.equal((await f.call('/api/rooms', { cookie: teacher.cookie })).value.rooms.length, 1);
  assert.equal((await f.call(`/api/rooms/${created.value.room.id}`, { method: 'DELETE', cookie: teacher.cookie })).status, 200);
  assert.equal((await f.call('/api/session', { cookie: pupil.cookie })).value.role, null);
  assert.equal((await f.call('/api/session', { cookie: peer.cookie })).value.role, null);
  assert.equal((await f.call('/lobby.html', { cookie: pupil.cookie })).status, 302);
  assert.equal((await f.call('/nebeljagd.html', { cookie: pupil.cookie })).status, 302);
  assert.equal((await f.call('/nebeljagd.html?mode=lobby', { cookie: pupil.cookie })).status, 302);
  assert.equal((await f.call('/api/student/join', { method: 'POST', data: { code: created.value.room.code } })).status, 401);
  assert.equal((await f.call('/api/logout', { method: 'POST', data: {}, cookie: teacher.cookie })).status, 200);
  assert.equal((await f.call('/api/session', { cookie: teacher.cookie })).value.role, null);
});

test('codes expire, persist across restart, and login cookies do not survive restart', async t => {
  const f = await fixture(t, { roomLifetime: 1000 });
  const teacher = await f.login();
  const created = await f.call('/api/rooms', { method: 'POST', cookie: teacher.cookie, data: {} });
  const pupil = await f.call('/api/student/join', { method: 'POST', data: { code: created.value.room.code } });
  const saved = JSON.parse(await readFile(join(f.dataDir, 'rooms.json'), 'utf8'));
  assert.equal(saved[0].code, created.value.room.code);
  const restarted = await createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir, now: () => Date.parse('2026-11-01T12:00:00.500Z') });
  restarted.listen(0, '127.0.0.1'); await once(restarted, 'listening');
  t.after(async () => { restarted.closeAllConnections(); await new Promise(resolve => restarted.close(resolve)); });
  const url = `http://127.0.0.1:${restarted.address().port}`;
  const before = await fetch(url + '/api/session', { headers: { Cookie: teacher.cookie } }).then(response => response.json());
  assert.equal(before.role, null);
  const resumed = await fetch(url + '/api/student/join', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ code: created.value.room.code }) });
  assert.equal(resumed.status, 200);
  f.advance(1001);
  assert.equal((await f.call('/api/session', { cookie: pupil.cookie })).value.role, null);
  assert.equal((await f.call('/api/student/join', { method: 'POST', data: { code: created.value.room.code } })).status, 401);
});

test('cross-origin requests, brute-force attempts and private paths are refused', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/teacher/login', { method: 'POST', data: { password }, origin: 'https://outside.example' })).status, 403);
  const teacher = await f.login();
  assert.equal((await f.call('/api/rooms', { method: 'POST', data: {}, cookie: teacher.cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await f.call('/api/rooms', { method: 'POST', cookie: teacher.cookie, data: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.call('/api/rooms', { method: 'POST', cookie: teacher.cookie, data: { name: 'x'.repeat(5000) } })).status, 413);
  const attempts = await Promise.all(Array.from({ length: 12 }, () => f.call('/api/teacher/login', { method: 'POST', data: { password: 'wrong' } })));
  assert.equal(attempts.filter(result => result.status === 401).length, 8);
  assert.equal(attempts.filter(result => result.status === 429).length, 4);
  assert.equal((await f.login()).status, 429);
  f.advance(60001); assert.equal((await f.login()).status, 200);
  for (const path of ['/.nebeljagd/teacher.json', '/server/classroom.js', '/package.json', '/assets/%2e%2e%2f..%2fprivate/teacher.json', '/assets/%5c..%5cprivate/teacher.json']) {
    assert.equal((await f.call(path)).status, 404, path);
  }
  await mkdir(join(f.publicDir, 'assets'));
  await symlink(join(f.dataDir, 'teacher.json'), join(f.publicDir, 'assets/leak.json'));
  assert.equal((await f.call('/assets/leak.json')).status, 404);
  const credential = JSON.parse(await readFile(join(f.dataDir, 'teacher.json'), 'utf8'));
  assert.equal(credential.algorithm, 'scrypt'); assert.equal(JSON.stringify(credential).includes(password), false);
  assert.equal((await f.call('/index.html')).headers.get('cache-control'), 'no-store');
});

test('an unconfigured server fails closed and setup never overwrites credentials implicitly', async t => {
  const f = await fixture(t, { configured: false });
  assert.equal((await f.call('/api/session')).value.teacherConfigured, false);
  assert.equal((await f.login()).status, 503);
  await saveTeacherPassword(f.dataDir, password);
  assert.equal((await f.login()).status, 200);
  await assert.rejects(saveTeacherPassword(f.dataDir, 'another-good-test-passphrase'), { code: 'EEXIST' });
  await assert.rejects(saveTeacherPassword(f.dataDir, 'short'), /12 bis 256/);
});

test('hosted first start hashes the secret once and preserves the configured teacher across redeploys', async t => {
  const initial = randomBytes(24).toString('base64url');
  const replacement = randomBytes(24).toString('base64url');
  const f = await fixture(t, { configured: false, initialTeacherPassword: initial });
  const before = await readFile(join(f.dataDir, 'teacher.json'), 'utf8');
  assert.equal(JSON.parse(before).algorithm, 'scrypt');
  assert.equal(before.includes(initial), false);
  const session = await f.call('/api/session');
  assert.equal(session.value.teacherConfigured, true);
  assert.equal(JSON.stringify(session.value).includes(initial), false);
  assert.equal((await f.call('/api/teacher/login', { method: 'POST', data: { password: initial } })).status, 200);
  await createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir, initialTeacherPassword: replacement });
  assert.equal(await readFile(join(f.dataDir, 'teacher.json'), 'utf8'), before);
  assert.equal((await f.call('/api/teacher/login', { method: 'POST', data: { password: replacement } })).status, 401);
  assert.equal((await f.call('/api/teacher/login', { method: 'POST', data: { password: initial } })).status, 200);
  // A stale or edited hosting value cannot invalidate an existing installation.
  await createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir, initialTeacherPassword: 'short' });
  assert.equal(await readFile(join(f.dataDir, 'teacher.json'), 'utf8'), before);
  assert.equal((await f.call('/.nebeljagd/teacher.json')).status, 404);
});

test('empty hosting secret keeps local setup, invalid first secret and damaged stored credentials fail closed', async t => {
  const f = await fixture(t, { configured: false, initialTeacherPassword: '' });
  assert.equal((await f.call('/api/session')).value.teacherConfigured, false);
  await assert.rejects(createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir,
    initialTeacherPassword: 'too-short' }), error => {
    assert.match(error.message, /12 bis 256/);
    assert.equal(error.message.includes('too-short'), false);
    return true;
  });
  assert.deepEqual(await readdir(f.dataDir), []);
  await writeFile(join(f.dataDir, 'teacher.json'), 'damaged credential');
  await assert.rejects(createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir,
    initialTeacherPassword: randomBytes(24).toString('hex') }), /Konfiguration ist ungültig/);
  assert.equal(await readFile(join(f.dataDir, 'teacher.json'), 'utf8'), 'damaged credential');
});

test('hosting requires an initial teacher secret once, then accepts its persistent credential without the secret', async t => {
  const f = await fixture(t, { configured: false });
  for (const initialTeacherPassword of [undefined, '']) {
    await assert.rejects(createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir,
      requireTeacherConfigured: true, initialTeacherPassword }), /NEBELJAGD_INITIAL_TEACHER_PASSWORD.*Hosting-Einstellungen/);
  }
  assert.deepEqual(await readdir(f.dataDir), []);
  await saveTeacherPassword(f.dataDir, randomBytes(24).toString('hex'));
  await createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir, requireTeacherConfigured: true });
  assert.equal((await f.call('/api/session')).value.teacherConfigured, true);
});

test('hosting refuses an incomplete browser build before returning a server, without changing local setup', async t => {
  const f = await fixture(t);
  for (const name of ['index.html', 'teacher.html', 'lobby.html', 'nebeljagd.html', 'map-editor.html', 'release.json']) {
    const path = join(f.publicDir, name), bytes = await readFile(path);
    await rm(path);
    await assert.rejects(createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir,
      requireTeacherConfigured: true }), error => {
      assert.match(error.message, /Browserstand ist unvollständig/);
      assert.equal(error.message.includes(name), true);
      return true;
    });
    await mkdir(path);
    await assert.rejects(createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir,
      requireTeacherConfigured: true }), /keine Datei/);
    await rm(path, { recursive: true });
    await writeFile(path, bytes);
  }
  await rm(join(f.publicDir, 'release.json'));
  await createClassroomServer({ publicDir: f.publicDir, dataDir: f.dataDir });
});

test('HTTPS proxy origin with the original host accepts login and issues a Secure cookie', async t => {
  const f = await fixture(t, { secureCookies: true });
  // Simulate a TLS-terminating proxy: the local request is HTTP, but it keeps
  // the public Host and browser Origin. This is not a live HTTPS deployment.
  const host = 'nebeljagd.school.example';
  // Node's fetch overrides Host with its target URL; the lower-level HTTP
  // client preserves exactly the headers a reverse proxy forwards.
  const throughProxy = (path, { method = 'GET', origin = `https://${host}`, data, cookie } = {}) => new Promise((resolveResponse, reject) => {
    const request = httpRequest(f.url + path, { method, headers: {
      Host: host, Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolveResponse({ status: response.statusCode, cookie: response.headers['set-cookie']?.[0],
          value: response.headers['content-type']?.includes('application/json') ? JSON.parse(body) : body });
      });
    });
    request.on('error', reject);
    request.end(data ? JSON.stringify(data) : undefined);
  });
  const teacher = await throughProxy('/api/teacher/login', { method: 'POST', data: { password } });
  assert.equal(teacher.status, 200);
  assert.match(teacher.cookie, /; Secure(?:;|$)/);
  assert.match(teacher.cookie, /HttpOnly/);
  assert.equal((await throughProxy('/api/teacher/login', { method: 'POST', data: { password }, origin: `http://${host}` })).status, 403);
  const cookie = teacher.cookie.split(';')[0];
  assert.equal((await throughProxy('/api/session', { cookie })).value.role, 'teacher');
  assert.equal((await throughProxy('/map-editor.html', { cookie })).status, 200);
});

test('concurrent initial starts publish exactly one complete credential without leftover secrets', async t => {
  const f = await fixture(t, { configured: false });
  const first = randomBytes(24).toString('hex'), second = randomBytes(24).toString('hex');
  await Promise.all([first, second].map(initialTeacherPassword => createClassroomServer({
    publicDir: f.publicDir, dataDir: f.dataDir, initialTeacherPassword,
  })));
  assert.deepEqual(await readdir(f.dataDir), ['teacher.json']);
  const stored = await readFile(join(f.dataDir, 'teacher.json'), 'utf8');
  assert.equal(stored.includes(first) || stored.includes(second), false);
  const results = await Promise.all([first, second].map(password => f.call('/api/teacher/login', { method: 'POST', data: { password } })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
});

test('the server command consumes the hosting secret through its environment without logging it', async t => {
  const f = await fixture(t, { configured: false });
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const initial = randomBytes(24).toString('base64url');
  const child = spawn(process.execPath, ['server/classroom.js'], { env: {
    ...process.env, HOST: '127.0.0.1', PORT: String(port),
    NEBELJAGD_DATA_DIR: f.dataDir, NEBELJAGD_PUBLIC_DIR: f.publicDir,
    NEBELJAGD_SECURE_COOKIES: '0', NEBELJAGD_INITIAL_TEACHER_PASSWORD: initial,
    NEBELJAGD_REQUIRE_TEACHER: '1',
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close'); child.kill(); await closed;
    }
  });
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Hosting server did not become ready')); }, 10000);
    const cleanup = () => { clearTimeout(timer); child.stdout.removeListener('data', ready); child.removeListener('exit', failed); };
    const ready = () => { if (output.includes('Nebeljagd-Schulserver läuft')) { cleanup(); resolveReady(); } };
    const failed = () => { cleanup(); reject(new Error('Hosting server exited before readiness')); };
    child.stdout.on('data', ready); child.once('exit', failed); child.once('error', failed);
  });
  const url = `http://127.0.0.1:${port}`;
  const loggedIn = await fetch(url + '/api/teacher/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify({ password: initial }) });
  assert.equal(loggedIn.status, 200);
  assert.equal((await loggedIn.json()).role, 'teacher');
  assert.equal(output.includes(initial), false);
});
