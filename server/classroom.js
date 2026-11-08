import { runtimeEnvironment } from './runtime-environment.js';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile, rename, realpath, stat, link, unlink } from 'node:fs/promises';
import { resolve, join, extname, relative, sep } from 'node:path';
import { randomBytes, randomInt, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const derive = promisify(scrypt);
const HOURS = 8 * 60 * 60 * 1000;
const COOKIE = 'nebeljagd_session';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon' };
const PUBLIC_FILES = new Set(['index.html', 'teacher.html', 'lobby.html', 'game.html', 'magebrawl.html', 'nebeljagd.html', 'map-editor.html', 'avatar-preview.html', 'worldmap.json', 'worldmap.schema.json', 'worldmap.svg', 'release.json', 'favicon.ico']);
const teacherPages = new Set(['/teacher.html', '/map-editor.html', '/avatar-preview.html']);

export async function passwordRecord(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) {
    throw new Error('Das Lehrkraft-Passwort muss 12 bis 256 Zeichen lang sein.');
  }
  const salt = randomBytes(32).toString('hex');
  const hash = await derive(password, salt, 64);
  return { version: 1, algorithm: 'scrypt', salt, hash: hash.toString('hex') };
}

export async function saveTeacherPassword(dataDir, password, { replace = false } = {}) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const record = await passwordRecord(password);
  const path = join(dataDir, 'teacher.json');
  if (!replace) await writeFile(path, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  else await atomicJson(path, record);
}

async function atomicJson(path, value) {
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await rename(temporary, path);
}

async function readCredential(dataDir) {
  try {
    const value = JSON.parse(await readFile(join(dataDir, 'teacher.json'), 'utf8'));
    if (value.version !== 1 || value.algorithm !== 'scrypt' || !/^[a-f0-9]{64}$/.test(value.salt) || !/^[a-f0-9]{128}$/.test(value.hash)) throw new Error('invalid');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error('Die Lehrkraft-Konfiguration ist ungültig. Bitte lokal neu einrichten.');
  }
}

/** Provision a hosted installation once, without requiring an interactive shell.
 * The hosting secret is never a reset mechanism: an existing credential wins.
 */
async function initializeTeacherPassword(dataDir, initialTeacherPassword) {
  const existing = await readCredential(dataDir);
  if (existing) return existing;
  if (initialTeacherPassword === undefined || initialTeacherPassword === '') return null;
  const record = await passwordRecord(initialTeacherPassword);
  const temporary = join(dataDir, `teacher.${randomBytes(12).toString('hex')}.tmp`);
  await writeFile(temporary, JSON.stringify(record) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    // Publish a fully written file, atomically and without replacing a winner
    // from another process starting on the same persistent disk.
    await link(temporary, join(dataDir, 'teacher.json'));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await unlink(temporary);
  }
  return readCredential(dataDir);
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(JSON.stringify(value));
}
function httpError(status, message) { return Object.assign(new Error(message), { status }); }
async function body(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) throw httpError(415, 'Bitte JSON senden.');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 4096) { request.resume(); throw httpError(413, 'Die Anfrage ist zu groß.'); }
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch { throw httpError(400, 'Die Anfrage enthält kein gültiges JSON-Objekt.'); }
}
function cookieValue(request) {
  return (request.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
}
function tokenHash(token) { return createHash('sha256').update(token).digest('hex'); }

/** One shared classroom service. No pupil names, email addresses or passwords
 * are collected. Credentials/rooms persist locally; login sessions expire on
 * restart and are deliberately not written to disk.
 */
export async function createClassroomServer({ publicDir = resolve('welt'), dataDir = resolve('.nebeljagd'), now = Date.now, secureCookies = false, roomLifetime = HOURS, sessionLifetime = HOURS, initialTeacherPassword, requireTeacherConfigured = false } = {}) {
  publicDir = resolve(publicDir); dataDir = resolve(dataDir);
  if (requireTeacherConfigured) {
    for (const name of ['index.html', 'teacher.html', 'lobby.html', 'magebrawl.html', 'map-editor.html', 'release.json']) {
      let valid = false;
      try { valid = (await stat(join(publicDir, name))).isFile(); } catch {}
      if (!valid) throw new Error(`Der Browserstand ist unvollständig: ${name} fehlt oder ist keine Datei. Bitte den vollständigen Magebrawl-Build bereitstellen.`);
    }
  }
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  // Initialize hosting credentials once, or validate the existing local setup,
  // before accepting connections. The factory never reads process.env itself.
  const credential = await initializeTeacherPassword(dataDir, initialTeacherPassword);
  if (requireTeacherConfigured && !credential) {
    throw new Error('Der Lehrkraft-Zugang fehlt. Bitte MAGEBRAWL_INITIAL_TEACHER_PASSWORD in den Hosting-Einstellungen setzen und den Server neu starten.');
  }
  let rooms;
  try {
    const saved = JSON.parse(await readFile(join(dataDir, 'rooms.json'), 'utf8'));
    if (!Array.isArray(saved) || saved.some(room => typeof room.id !== 'string' || typeof room.code !== 'string' || typeof room.name !== 'string' || !Number.isFinite(Date.parse(room.expiresAt)) || typeof room.active !== 'boolean')) throw new Error('invalid');
    rooms = saved;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Die gespeicherten Räume sind ungültig. Bitte die Serverdaten prüfen.');
    rooms = [];
  }
  const sessions = new Map(), failures = new Map();
  let pendingWrite = Promise.resolve();
  const persistRooms = () => {
    const snapshot = structuredClone(rooms);
    pendingWrite = pendingWrite.then(() => atomicJson(join(dataDir, 'rooms.json'), snapshot));
    return pendingWrite;
  };
  const active = room => room?.active && Date.parse(room.expiresAt) > now();
  const roomView = room => ({ id: room.id, name: room.name, code: room.code, expiresAt: room.expiresAt, active: Boolean(active(room)) });
  function prune() {
    for (const [key, session] of sessions) if (session.expiresAt <= now()) sessions.delete(key);
    for (const [key, value] of failures) if (value.until <= now()) failures.delete(key);
  }
  function sessionFor(request) {
    prune();
    const token = cookieValue(request);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const key = tokenHash(token), session = sessions.get(key);
    if (!session) return null;
    if (session.role === 'student' && !active(rooms.find(room => room.id === session.roomId))) {
      sessions.delete(key); return null;
    }
    return session;
  }
  const cookie = (token, age = Math.floor(sessionLifetime / 1000)) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  function issue(response, role, roomId = null) {
    prune();
    if (sessions.size >= 5000) throw httpError(503, 'Der Server ist ausgelastet. Bitte später erneut versuchen.');
    const token = randomBytes(32).toString('base64url');
    sessions.set(tokenHash(token), { role, roomId, expiresAt: now() + sessionLifetime });
    response.setHeader('Set-Cookie', cookie(token));
    return { role, ...(roomId ? { room: roomView(rooms.find(room => room.id === roomId)) } : {}) };
  }
  function failureKey(request, kind) { return `${kind}:${request.socket.remoteAddress ?? 'unknown'}`; }
  function checkRate(request, kind) {
    prune();
    const record = failures.get(failureKey(request, kind));
    const max = kind === 'teacher' ? 8 : 20;
    if (record?.count >= max || failures.size >= 10000) throw httpError(429, 'Zu viele erfolglose Versuche. Bitte in einer Minute erneut versuchen.');
  }
  function failed(request, kind) {
    const key = failureKey(request, kind), record = failures.get(key) ?? { count: 0, until: now() + 60000 };
    record.count++; failures.set(key, record);
  }
  function requireTeacher(request) {
    const session = sessionFor(request);
    if (session?.role !== 'teacher') throw httpError(403, 'Dieser Bereich ist nur für Lehrkräfte.');
    return session;
  }
  async function buildInfo() {
    try {
      const release = JSON.parse(await readFile(join(publicDir, 'release.json'), 'utf8'));
      return { id: release.buildId ?? release.files?.['map-editor.html']?.sha256?.slice(0, 12) ?? release.sourceCommit ?? release.sourceBaseCommit ?? null, builtAt: release.builtAt ?? null };
    } catch { return { id: null, builtAt: null }; }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const method = request.method ?? 'GET';
      const rawPath = (request.url ?? '/').split('?')[0];
      let pathname;
      try { pathname = decodeURIComponent(rawPath); } catch { throw httpError(400, 'Ungültiger Pfad.'); }
      if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(part => part === '.' || part === '..' || part.startsWith('.'))) throw httpError(404, 'Nicht gefunden.');
      if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(method)) throw httpError(405, 'Methode nicht erlaubt.');
      if (method === 'POST' || method === 'DELETE') {
        const origin = request.headers.origin;
        if (request.headers['sec-fetch-site'] === 'cross-site') throw httpError(403, 'Diese Anfrage kommt von einer anderen Website.');
        if (origin) {
          const expected = `${secureCookies || request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
          if (origin !== expected) throw httpError(403, 'Diese Anfrage kommt von einer anderen Website.');
        }
      }
      if (pathname.startsWith('/api/')) {
        if (pathname === '/api/build' && method === 'GET') return json(response, 200, { build: await buildInfo() });
        if (pathname === '/api/session' && method === 'GET') {
          const session = sessionFor(request);
          return json(response, 200, { role: session?.role ?? null,
            ...(session?.roomId ? { room: roomView(rooms.find(room => room.id === session.roomId)) } : {}),
            build: await buildInfo(), teacherConfigured: Boolean(await readCredential(dataDir)) });
        }
        if (pathname === '/api/teacher/login' && method === 'POST') {
          checkRate(request, 'teacher');
          // Reserve the attempt before any await so simultaneous requests cannot
          // queue unlimited expensive password hashes before failures are counted.
          failed(request, 'teacher');
          const credential = await readCredential(dataDir);
          if (!credential) throw httpError(503, 'Der Lehrkraft-Zugang muss zuerst am Server eingerichtet werden.');
          const { password } = await body(request);
          if (typeof password !== 'string' || password.length > 256) throw httpError(401, 'Das Passwort stimmt nicht.');
          const hash = await derive(password, credential.salt, 64);
          if (!timingSafeEqual(hash, Buffer.from(credential.hash, 'hex'))) throw httpError(401, 'Das Passwort stimmt nicht.');
          failures.delete(failureKey(request, 'teacher'));
          return json(response, 200, issue(response, 'teacher'));
        }
        if (pathname === '/api/student/join' && method === 'POST') {
          checkRate(request, 'student');
          const { code } = await body(request);
          const normalized = typeof code === 'string' ? code.trim().replace(/[ -]/g, '').toUpperCase() : '';
          const room = /^[A-Z2-9]{8}$/.test(normalized) && rooms.find(room => room.code === normalized && active(room));
          if (!room) { failed(request, 'student'); throw httpError(401, 'Dieser Zugangscode ist ungültig, abgelaufen oder geschlossen.'); }
          failures.delete(failureKey(request, 'student'));
          return json(response, 200, issue(response, 'student', room.id));
        }
        if (pathname === '/api/logout' && method === 'POST') {
          await body(request);
          const token = cookieValue(request); if (token) sessions.delete(tokenHash(token));
          return json(response, 200, { role: null }, { 'Set-Cookie': cookie('', 0) });
        }
        if (pathname === '/api/rooms' && method === 'GET') {
          requireTeacher(request);
          return json(response, 200, { rooms: rooms.filter(room => active(room)).map(roomView) });
        }
        if (pathname === '/api/rooms' && method === 'POST') {
          requireTeacher(request); const value = await body(request);
          const name = typeof value.name === 'string' ? value.name.trim() : 'Übungsrunde';
          if (!name || name.length > 80) throw httpError(400, 'Bitte einen Namen mit höchstens 80 Zeichen eingeben.');
          rooms = rooms.filter(room => active(room));
          if (rooms.length >= 100) throw httpError(409, 'Es sind bereits 100 Räume geöffnet. Bitte zuerst einen Raum schließen.');
          let code;
          do { code = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''); } while (rooms.some(room => room.code === code));
          const room = { id: randomBytes(12).toString('hex'), name, code, expiresAt: new Date(now() + roomLifetime).toISOString(), active: true };
          rooms.push(room); await persistRooms();
          return json(response, 201, { room: roomView(room) });
        }
        const closing = pathname.match(/^\/api\/rooms\/([a-f0-9]{24})$/);
        if (closing && method === 'DELETE') {
          requireTeacher(request);
          const room = rooms.find(room => room.id === closing[1]);
          if (!room) throw httpError(404, 'Raum nicht gefunden.');
          room.active = false; await persistRooms();
          for (const [key, session] of sessions) if (session.roomId === room.id) sessions.delete(key);
          return json(response, 200, { room: roomView(room) });
        }
        throw httpError(404, 'Unbekannte Schnittstelle.');
      }
      if (!['GET', 'HEAD'].includes(method)) throw httpError(405, 'Methode nicht erlaubt.');
      if (pathname === '/') pathname = '/index.html';
      const session = sessionFor(request);
      if (teacherPages.has(pathname) && session?.role !== 'teacher') {
        if (session) throw httpError(403, 'Dieser Bereich ist nur für Lehrkräfte.');
        response.writeHead(302, { Location: './index.html?role=teacher' }); return response.end();
      }
      const gamePage = ['/game.html', '/magebrawl.html', '/nebeljagd.html', '/lobby.html'].includes(pathname);
      if (gamePage && !session) {
        response.writeHead(302, { Location: './index.html?reason=session' }); return response.end();
      }
      const name = pathname.slice(1);
      const isAsset = name.startsWith('assets/') && TYPES[extname(name)] && !name.endsWith('.html');
      if (!PUBLIC_FILES.has(name) && !isAsset) throw httpError(404, 'Nicht gefunden.');
      const candidate = resolve(publicDir, name), publicRoot = await realpath(publicDir);
      let actual;
      try { actual = await realpath(candidate); } catch { throw httpError(404, 'Nicht gefunden.'); }
      if (relative(publicRoot, actual).startsWith('..' + sep) || actual === publicRoot || !actual.startsWith(publicRoot + sep)) throw httpError(404, 'Nicht gefunden.');
      const file = await stat(actual);
      if (!file.isFile()) throw httpError(404, 'Nicht gefunden.');
      response.writeHead(200, { 'Content-Type': TYPES[extname(actual)] ?? 'application/octet-stream', 'Content-Length': file.size });
      if (method === 'HEAD') return response.end();
      const stream = createReadStream(actual);
      stream.on('error', () => response.destroy());
      response.on('close', () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (response.headersSent) return response.destroy();
      json(response, error.status ?? 500, { error: error.status ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.' });
    }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = runtimeEnvironment();
  const host = env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 5200);
  const publicDir = resolve(env.MAGEBRAWL_PUBLIC_DIR || 'welt');
  const dataDir = resolve(env.MAGEBRAWL_DATA_DIR || '.nebeljagd');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss zwischen 1 und 65535 liegen.');
  const server = await createClassroomServer({ publicDir, dataDir,
    secureCookies: env.MAGEBRAWL_SECURE_COOKIES === '1',
    initialTeacherPassword: env.MAGEBRAWL_INITIAL_TEACHER_PASSWORD,
    requireTeacherConfigured: env.MAGEBRAWL_REQUIRE_TEACHER === '1' });
  const teacherConfigured = Boolean(await readCredential(dataDir));
  server.listen(port, host, () => {
    console.log(`Magebrawl-Schulserver läuft auf ${host}:${port}.`);
    console.log(teacherConfigured ? 'Der Lehrkraft-Zugang ist eingerichtet.' : 'Lehrkraft-Zugang einmalig mit npm run school:setup einrichten.');
  });
}
