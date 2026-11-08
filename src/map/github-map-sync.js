import { documentHash, mapDocument, planMapSync, readGitHubMap, writeGitHubMap } from './github-map-store.js';

const AUTH = 'nebeljagd.github-map-auth.v1';
const STATE = 'nebeljagd.github-map-state.v1';
const BACKUP = 'nebeljagd.worldmap.before-online.v1';
const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const remove = (storage, key) => { try { storage.removeItem(key); } catch {} };
const put = (storage, key, value) => { try { storage.setItem(key, value); return true; } catch { return false; } };

export function githubSyncAvailable(url) {
  return url.protocol === 'https:' && url.hostname === 'ohnoyoudie-dotcom.github.io' && url.pathname.startsWith('/nebeljagd/preview/')
    || ['localhost', '127.0.0.1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol) && url.searchParams.get('sync') === 'github';
}

export function createGitHubMapSync({getMap, project, applyRemote, canSave, download, notify, getProtectedDraft, onSaved}) {
  const storage = name => { try { return window[name]; } catch { return null; } };
  const localStorage = storage('localStorage'), sessionStorage = storage('sessionStorage');
  const banner = document.createElement('div');
  banner.className = 'online-map-status'; banner.dataset.githubSyncUi = '';
  banner.innerHTML = `<span id="online-map-status" role="status">Online-Speichern einmalig einrichten.</span><button class="text-button" id="github-connect">Mit GitHub verbinden</button><button class="text-button" id="github-load-remote" hidden>Onlinekarte übernehmen</button><select id="github-backup-choice" aria-label="Gesicherter Kartenstand" hidden></select><button class="text-button" id="github-map-backup" hidden>Vorherige Karte sichern</button><a id="github-publication-link" href="https://github.com/ohnoyoudie-dotcom/nebeljagd/actions/workflows/work-build-check.yml" target="_blank" rel="noopener noreferrer" hidden>Veröffentlichung ansehen</a>`;
  document.querySelector('.editor-header').after(banner);
  const dialog = document.createElement('dialog');
  dialog.id = 'github-map-dialog'; dialog.className = 'editor-start-dialog github-map-dialog'; dialog.dataset.githubSyncUi = '';
  dialog.setAttribute('aria-labelledby', 'github-map-title');
  dialog.innerHTML = `<form id="github-map-form"><h2 id="github-map-title">Karte online speichern</h2>
    <p>„Speichern“ sichert deine Karte direkt im Projekt. Editor, Spiel und Karte werden anschließend automatisch unter deinem gewohnten Link veröffentlicht.</p>
    <ol><li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Auf GitHub einen Fine-grained Token erstellen</a>.</li><li>Resource owner: <strong>ohnoyoudie-dotcom</strong>. Nur das Repository <strong>nebeljagd</strong> auswählen.</li><li>Unter Repository permissions nur <strong>Contents → Read and write</strong> hinzufügen. Den erzeugten Token hier einsetzen.</li></ol>
    <label for="github-map-token">GitHub-Token</label><input id="github-map-token" type="password" autocomplete="off" spellcheck="false" required>
    <label class="github-remember"><input id="github-map-remember" type="checkbox"> Verbindung auf diesem Gerät merken</label>
    <p class="small-note">Mit dieser Option bleibt der Token in diesem Browser gespeichert. Er wird ausschließlich an die GitHub-API gesendet. Ohne diese Option gilt die Verbindung für diesen Tab. Abgelaufene Tokens kannst du hier ersetzen.</p>
    <p id="github-map-error" role="alert" hidden></p>
    <div class="editor-start-actions"><button id="github-map-submit" type="submit" class="button primary">Verbinden</button><button id="github-map-close" type="button" class="button quiet">Schließen</button><button id="github-map-disconnect" type="button" class="text-button" hidden>Verbindung entfernen</button></div>
    </form>`;
  document.body.append(dialog);
  const $ = id => document.getElementById(id);
  let token = read(sessionStorage, AUTH) || read(localStorage, AUTH) || '';
  let metadata = {};
  try { metadata = JSON.parse(read(localStorage, STATE) || '{}') || {}; } catch {}
  let baseSha = metadata.baseSha, savedHash = metadata.savedHash, pendingHash = metadata.pendingHash;
  let busy = false, conflict = false, wantsSave = false, timer = null, lastSavedDocument = null;
  const persistState = () => put(localStorage, STATE, JSON.stringify({baseSha, savedHash, pendingHash}));
  const status = text => { $('online-map-status').textContent = text; };
  const setBusy = value => {
    busy = value;
    for (const id of ['export-json', 'github-map-submit', 'github-map-disconnect', 'github-load-remote', 'github-connect']) $(id).disabled = value;
  };
  function backups() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(BACKUP + '.')) keys.push(key);
      }
    } catch {}
    return keys.sort().reverse();
  }
  function archive(text) {
    const keys = backups(), previous = read(localStorage, BACKUP);
    const failed = () => {
      const error = new Error('Die lokale Sicherung ist voll. Bitte deine Karte zuerst als JSON sichern.');
      error.name = 'MapSyncError'; error.code = 'backup'; throw error;
    };
    if (previous && !keys.length && !put(localStorage, `${BACKUP}.${Date.now()-1}-previous`, previous)) failed();
    if (!keys.some(key => read(localStorage, key) === text) && !put(localStorage, `${BACKUP}.${Date.now()}-${crypto.randomUUID()}`, text)) failed();
    if (!put(localStorage, BACKUP, text)) failed();
    connectionLabel();
  }
  function connectionLabel() {
    $('github-connect').textContent = token ? 'GitHub-Verbindung' : 'Mit GitHub verbinden';
    $('github-map-disconnect').hidden = !token;
    $('github-map-backup').hidden = !read(localStorage, BACKUP);
    const keys = backups();
    $('github-backup-choice').replaceChildren();
    for (const key of keys) {
      const option = document.createElement('option'); option.value = key;
      option.textContent = new Date(Number(key.slice((BACKUP + '.').length).split('-')[0])).toLocaleString('de-DE');
      $('github-backup-choice').append(option);
    }
    $('github-backup-choice').hidden = keys.length < 2;
    $('export-json').title = 'Karte online speichern und automatisch veröffentlichen';
  }
  function fail(error) {
    const message = error?.name === 'MapSyncError' ? error.message : 'Online-Speichern ist gerade nicht möglich. Deine Karte bleibt im Browser erhalten.';
    status(message);
    $('github-map-error').textContent = message; $('github-map-error').hidden = false;
    if (error?.code === 'conflict') {
      conflict = true; $('github-load-remote').hidden = false;
    }
    notify(message, true);
  }
  async function rememberRemote(remote) {
    baseSha = remote.sha;
    savedHash = await documentHash(JSON.stringify(remote.map));
    lastSavedDocument = JSON.stringify(remote.map);
    pendingHash = remote.hash;
    conflict = false; $('github-load-remote').hidden = true;
    persistState();
  }
  function watchPublication() {
    clearTimeout(timer);
    if (!pendingHash || !token) return;
    const hash = pendingHash, deadline = Date.now() + 20 * 60 * 1000;
    $('github-publication-link').hidden = false;
    async function poll() {
      if (!token || pendingHash !== hash) return;
      try {
        const url = new URL('./release.json', location.href); url.searchParams.set('check', String(Date.now()));
        const response = await fetch(url, {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000)});
        if (response.ok) {
          const release = await response.json();
          if (token && release.files?.['worldmap.json']?.sha256 === hash && pendingHash === hash) {
            pendingHash = null; persistState();
            if (!busy && !conflict) status(JSON.stringify(getMap()) === lastSavedDocument
              ? 'Karte online gespeichert und veröffentlicht.' : 'Neue Änderungen im Browser · „Speichern“ veröffentlicht sie.');
            return;
          }
        }
      } catch { /* A release check never changes the map or retries a PUT. */ }
      if (!token || pendingHash !== hash) return;
      if (Date.now() < deadline && pendingHash === hash) timer = setTimeout(poll, 15000);
      else if (!busy && !conflict && pendingHash === hash) status('Karte auf GitHub gesichert · Veröffentlichung noch nicht bestätigt.');
    }
    void poll();
  }
  async function reconcile() {
    const before = JSON.stringify(getMap());
    const remote = await readGitHubMap({token});
    const local = getMap();
    const unchangedSinceSave = Boolean(savedHash) && await documentHash(JSON.stringify(local)) === savedHash;
    let plan = planMapSync({local, project, remote, baseSha, unchangedSinceSave});
    if (plan === 'remote' && (JSON.stringify(getMap()) !== before || !canSave())) plan = 'conflict';
    if (plan === 'remote') applyRemote(remote.map);
    if (plan === 'remote' || plan === 'synced') {
      await rememberRemote(remote); status('Onlinekarte geladen · Veröffentlichung wird geprüft.');
    } else if (plan === 'local') {
      baseSha = remote.sha; persistState();
      conflict = false; $('github-load-remote').hidden = true;
      status('Verbunden · „Speichern“ veröffentlicht deine Änderungen.');
    } else {
      conflict = true; $('github-load-remote').hidden = false;
      status('Online gibt es eine andere Karte. Dein eigener Stand bleibt geöffnet.');
    }
    return remote;
  }
  function showConnection(saveAfter = false) {
    wantsSave = saveAfter;
    $('github-map-submit').textContent = saveAfter ? 'Verbinden und speichern' : 'Verbinden';
    $('github-map-remember').checked = Boolean(read(localStorage, AUTH));
    $('github-map-token').value = '';
    $('github-map-error').hidden = true;
    dialog.showModal();
  }
  async function save() {
    if (busy || !canSave()) return;
    if (!token) return showConnection(true);
    if (conflict) return notify('Die Onlinekarte wurde geändert. Übernimm sie zuerst; deine eigene Karte wird dabei separat gesichert.', true);
    setBusy(true); status('Karte wird auf GitHub gesichert …');
    const snapshot = structuredClone(getMap());
    try {
      mapDocument(snapshot);
      const protectedDraft = getProtectedDraft?.();
      if (protectedDraft) archive(protectedDraft);
      const remote = await readGitHubMap({token});
      if (JSON.stringify(remote.map) === JSON.stringify(snapshot)) {
        await rememberRemote(remote);
      } else {
        if (remote.sha !== baseSha) {
          const error = new Error(); error.name = 'MapSyncError'; error.code = 'conflict';
          error.message = 'Die Onlinekarte wurde inzwischen geändert. Deine Karte bleibt erhalten; es wurde nichts überschrieben.';
          throw error;
        }
        await rememberRemote(await writeGitHubMap({token, map: snapshot, expectedSha: baseSha}));
      }
      onSaved?.();
      status(JSON.stringify(getMap()) === JSON.stringify(snapshot)
        ? 'Auf GitHub gesichert · Veröffentlichung läuft automatisch.'
        : 'Stand auf GitHub gesichert · weitere Änderungen noch im Browser.');
      notify('Karte auf GitHub gesichert. Die Veröffentlichung läuft automatisch.');
    } catch (error) { fail(error); }
    finally { setBusy(false); watchPublication(); }
  }
  $('github-map-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const credential = $('github-map-token').value.trim();
    if (!credential) return;
    const remember = $('github-map-remember').checked;
    $('github-map-token').value = '';
    remove(localStorage, AUTH); remove(sessionStorage, AUTH);
    setBusy(true); token = credential;
    try {
      await reconcile();
      remove(localStorage, AUTH); remove(sessionStorage, AUTH);
      const stored = put(remember ? localStorage : sessionStorage, AUTH, token);
      connectionLabel(); dialog.close();
      if (!stored) notify('Verbindung gilt nur für diese geöffnete Seite; der Browserspeicher ist nicht verfügbar.', true);
    } catch (error) { token = ''; connectionLabel(); fail(error); }
    finally { setBusy(false); }
    if (token && wantsSave && !conflict) { wantsSave = false; await save(); }
    else if (token) watchPublication();
  });
  $('github-connect').addEventListener('click', () => showConnection());
  $('github-map-close').addEventListener('click', () => dialog.close());
  $('github-map-disconnect').addEventListener('click', () => {
    token = ''; wantsSave = false; conflict = false; clearTimeout(timer);
    remove(localStorage, AUTH); remove(sessionStorage, AUTH);
    $('github-load-remote').hidden = true;
    dialog.close(); connectionLabel(); status('Verbindung entfernt. Deine Karte bleibt in diesem Browser gespeichert.');
  });
  $('github-map-backup').addEventListener('click', () => {
    const backup = read(localStorage, $('github-backup-choice').value || BACKUP);
    if (backup) download(backup, 'magebrawl-vor-online-abgleich.json', 'application/json');
  });
  $('github-load-remote').addEventListener('click', async () => {
    if (busy || !canSave()) return;
    setBusy(true);
    try {
      const remote = await readGitHubMap({token});
      if (!canSave()) return;
      // Keep earlier conflict backups individually accessible. A full storage
      // aborts adoption instead of discarding the local map or an older backup.
      const protectedDraft = getProtectedDraft?.();
      if (protectedDraft) archive(protectedDraft);
      archive(mapDocument(getMap()));
      applyRemote(remote.map); await rememberRemote(remote);
      onSaved?.();
      connectionLabel(); status('Onlinekarte übernommen. Dein vorheriger Stand bleibt unter „Vorherige Karte sichern“ erhalten.');
      notify('Onlinekarte geladen. Dein vorheriger Stand ist separat gesichert und auch über „Rückgängig“ erreichbar.');
    } catch (error) { fail(error); }
    finally { setBusy(false); watchPublication(); }
  });
  connectionLabel();
  if (token) {
    setBusy(true); status('Aktuell gespeicherte Onlinekarte wird geprüft …');
    void reconcile().catch(fail).finally(() => { setBusy(false); watchPublication(); });
  }
  return {save, changed() {
    if (token && !busy && !conflict) status(JSON.stringify(getMap()) === lastSavedDocument
      ? pendingHash ? 'Auf GitHub gesichert · Veröffentlichung läuft automatisch.' : 'Karte online gespeichert und veröffentlicht.'
      : 'Änderungen im Browser gesichert · „Speichern“ veröffentlicht sie.');
  }};
}
