import { access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClassroomServer } from '../server/classroom.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runFile = promisify(execFile);

async function exists(path) {
  try { await access(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function setupTeacher({ root, dataDir }) {
  return new Promise((resolveSetup, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/setup-classroom.js')], {
      cwd: root, stdio: 'inherit', env: { ...process.env, NEBELJAGD_DATA_DIR: dataDir },
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolveSetup() : reject(new Error('Die Passwort-Einrichtung wurde nicht abgeschlossen. Bitte Nebeljagd erneut starten.')));
  });
}

async function openBrowser(url) {
  if (process.platform === 'win32') await runFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { timeout: 10000 });
  else if (process.platform === 'darwin') await runFile('open', [url], { timeout: 10000 });
  else await runFile('xdg-open', [url], { timeout: 10000 });
}

/** Start the already-built classroom app; neither Vite nor npm is needed. */
export async function startSchool({
  root = projectRoot, env = process.env, setup = setupTeacher, open = openBrowser,
  log = console.log, warn = console.warn,
} = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Bitte Node.js ab 22.12 von https://nodejs.org/en/download installieren.');
  const port = Number(env.PORT || 5200), host = env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss zwischen 1 und 65535 liegen.');
  const publicDir = resolve(root, env.NEBELJAGD_PUBLIC_DIR || 'welt');
  const dataDir = resolve(root, env.NEBELJAGD_DATA_DIR || '.nebeljagd');
  const secureCookies = env.NEBELJAGD_SECURE_COOKIES === '1';
  for (const name of ['index.html', 'teacher.html', 'lobby.html', 'nebeljagd.html', 'map-editor.html']) {
    if (!await exists(join(publicDir, name))) throw new Error('Die fertigen Browserdateien fehlen. Bitte den aktuellen Projektordner einschließlich des vollständigen Ordners welt verwenden.');
  }
  const credentialPath = join(dataDir, 'teacher.json');
  if (!await exists(credentialPath)) {
    log('Beim ersten Start legst du einmal dein Lehrkraft-Passwort fest. Die Eingabe bleibt unsichtbar.');
    await setup({ root, dataDir });
    if (!await exists(credentialPath)) throw new Error('Es wurde noch kein Lehrkraft-Zugang eingerichtet. Bitte Nebeljagd erneut starten.');
  }
  const server = await createClassroomServer({ publicDir, dataDir, secureCookies });
  await new Promise((resolveListen, reject) => {
    const failed = error => {
      server.removeListener('listening', ready);
      reject(error.code === 'EADDRINUSE'
        ? new Error(`Port ${port} ist bereits belegt. Beende zuerst einen eventuell schon laufenden Nebeljagd-Server. Es wurde keine Browserseite geöffnet.`)
        : error);
    };
    const ready = () => { server.removeListener('error', failed); resolveListen(); };
    server.once('error', failed);
    server.once('listening', ready);
    server.listen(port, host);
  });
  const address = server.address();
  const localHost = address.address === '0.0.0.0' ? '127.0.0.1' : address.address === '::' ? '::1' : address.address;
  const url = `http://${localHost.includes(':') ? `[${localHost}]` : localHost}:${address.port}/`;
  log(`Nebeljagd läuft. Dieses Fenster offen lassen; Strg+C beendet den Server.`);
  if (secureCookies) {
    log('HTTPS-Modus ist aktiv. Öffne die eingerichtete HTTPS-Adresse deines Servers.');
  } else {
    log(`Deine Startseite: ${url}`);
    try { await open(url); }
    catch { warn('Der Browser konnte nicht automatisch geöffnet werden. Öffne die angezeigte Adresse im Browser; der Server läuft weiter.'); }
  }
  return { server, url };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { server } = await startSchool();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
  } catch (error) {
    console.error(`Nebeljagd konnte nicht gestartet werden: ${error.message}`);
    process.exitCode = 1;
  }
}
