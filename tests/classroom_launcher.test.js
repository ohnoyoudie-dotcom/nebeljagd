import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startSchool } from '../scripts/start-school.js';
import { saveTeacherPassword } from '../server/classroom.js';

async function close(server) {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
async function fixture(t, { configured = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nebeljagd launcher '));
  const dataDir = join(root, '.nebeljagd'), publicDir = join(root, 'welt');
  await mkdir(publicDir);
  for (const name of ['index.html', 'teacher.html', 'lobby.html', 'magebrawl.html', 'map-editor.html']) {
    await writeFile(join(publicDir, name), '<!doctype html><title>Starter</title>');
  }
  if (configured) await saveTeacherPassword(dataDir, randomBytes(24).toString('hex'));
  const reserve = createServer();
  reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = reserve.address().port;
  await close(reserve);
  const logs = [], warnings = [], servers = [];
  t.after(async () => {
    for (const server of servers) await close(server);
    await rm(root, { recursive: true, force: true });
  });
  const options = { root, env: { HOST: '127.0.0.1', PORT: String(port) }, log: message => logs.push(message), warn: message => warnings.push(message) };
  return { root, dataDir, publicDir, port, logs, warnings, servers, options };
}

test('double-click launcher serves an existing build before opening the browser and preserves the teacher password', async t => {
  const f = await fixture(t);
  const before = await readFile(join(f.dataDir, 'teacher.json'), 'utf8');
  let opened = false;
  const result = await startSchool({ ...f.options,
    setup: () => assert.fail('existing credential must never be reset'),
    open: async url => {
      const response = await fetch(url);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Starter/);
      const session = await fetch(new URL('api/session', url)).then(response => response.json());
      assert.equal(session.teacherConfigured, true);
      opened = true;
    },
  });
  f.servers.push(result.server);
  assert.equal(opened, true);
  assert.equal(await readFile(join(f.dataDir, 'teacher.json'), 'utf8'), before);
  assert.ok(f.logs.some(message => message.includes(result.url)));
});

test('first launch uses the password setup and checks it completed before serving', async t => {
  const f = await fixture(t, { configured: false });
  let setups = 0;
  await assert.rejects(startSchool({ ...f.options, setup: async () => {}, open: () => assert.fail('no unconfigured access') }), /kein Lehrkraft/);
  const result = await startSchool({ ...f.options,
    setup: async ({ root, dataDir }) => {
      setups++;
      assert.equal(root, f.root); assert.equal(dataDir, f.dataDir);
      await saveTeacherPassword(dataDir, randomBytes(24).toString('hex'));
    },
    open: async () => {},
  });
  f.servers.push(result.server);
  assert.equal(setups, 1);
  assert.equal((await fetch(result.url + 'api/session').then(response => response.json())).teacherConfigured, true);
});

test('an occupied port never opens an unrelated service', async t => {
  const f = await fixture(t);
  const other = createServer((request, response) => response.end('unrelated service'));
  other.listen(f.port, '127.0.0.1'); await once(other, 'listening');
  f.servers.push(other);
  await assert.rejects(startSchool({ ...f.options, open: () => assert.fail('must not open another service') }), /bereits belegt/);
  assert.equal(await fetch(`http://127.0.0.1:${f.port}/`).then(response => response.text()), 'unrelated service');
});

test('browser opening failure leaves the school server reachable and explains the manual link', async t => {
  const f = await fixture(t);
  const result = await startSchool({ ...f.options, open: async () => { throw new Error('no desktop browser'); } });
  f.servers.push(result.server);
  assert.equal((await fetch(result.url)).status, 200);
  assert.equal(f.warnings.length, 1);
  assert.match(f.warnings[0], /Server läuft weiter/);
  assert.ok(f.logs.some(message => message.includes(result.url)));
});
