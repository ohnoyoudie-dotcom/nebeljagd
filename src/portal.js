import './portal.css';

const $ = id => document.getElementById(id);
const isTeacherPage = document.body.dataset.page === 'teacher';
let available = false, teacherConfigured = false, refreshTimer;
const endpoint = path => new URL(`api${path}`, location.href);

async function api(path, options = {}) {
  const response = await fetch(endpoint(path), {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000), ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const type = response.headers.get('Content-Type') || '';
  if (!type.includes('application/json')) throw Object.assign(new Error('Die Code-Verwaltung ist hier nicht erreichbar.'), { unavailable: true });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'Das hat nicht geklappt. Bitte versuche es erneut.'), { status: response.status });
  return data;
}

function message(text, tone = 'error') {
  $('form-message').textContent = text;
  $('form-message').dataset.tone = tone;
  $('form-message').hidden = !text;
}
function busy(form, value) {
  for (const control of form.elements) control.disabled = value;
  form.setAttribute('aria-busy', String(value));
}
function offline() {
  available = false;
  $('connection-status').textContent = '';
  $('offline-access').hidden = false;
  if (!isTeacherPage) {
    $('student-panel').hidden = $('teacher-panel').hidden = true;
    document.querySelector('.entry-tabs').hidden = true;
  }
}
function expiry(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Gültig bis zum Schließen des Zugangs';
  return `Gültig bis ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(date)}`;
}
function formatCode(code) { return String(code).replace(/(.{4})(?=.)/g, '$1 '); }
async function copyCode(code, button) {
  try {
    await navigator.clipboard.writeText(code);
    button.textContent = 'Kopiert ✓';
    setTimeout(() => { if (button.isConnected) button.textContent = 'Kopieren'; }, 1800);
  } catch {
    message(`Bitte markiere und kopiere den Code: ${formatCode(code)}`, 'success');
  }
}
function openTeacherLogin() { location.replace(new URL('./index.html?role=teacher', location.href)); }

if (!isTeacherPage) {
  function selectTab(role) {
    for (const name of ['student', 'teacher']) {
      const selected = name === role;
      $(`${name}-panel`).hidden = !selected;
      $(`${name}-tab`).setAttribute('aria-selected', String(selected));
      $(`${name}-tab`).tabIndex = selected ? 0 : -1;
    }
    message('');
  }
  for (const role of ['student', 'teacher']) {
    $(`${role}-tab`).addEventListener('click', () => selectTab(role));
    $(`${role}-tab`).addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'student' : event.key === 'End' ? 'teacher' : role === 'student' ? 'teacher' : 'student';
      selectTab(next); $(`${next}-tab`).focus();
    });
  }
  if (new URLSearchParams(location.search).get('role') === 'teacher') selectTab('teacher');
  $('access-code').addEventListener('input', event => {
    const normalized = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    event.target.value = normalized;
  });
  $('student-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!available) return;
    const code = $('access-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 8) { message('Bitte gib den vollständigen Code mit 8 Zeichen ein.'); $('access-code').focus(); return; }
    busy(event.currentTarget, true); message('');
    try { await api('/student/join', { method: 'POST', body: JSON.stringify({ code }) }); location.assign(new URL('./lobby.html', location.href)); }
    catch (error) { message(error.message); busy($('student-form'), false); $('access-code').focus(); }
  });
  $('teacher-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!available || !teacherConfigured) return;
    const password = $('teacher-password').value;
    busy(event.currentTarget, true); message('');
    try { await api('/teacher/login', { method: 'POST', body: JSON.stringify({ password }) }); location.assign(new URL('./teacher.html', location.href)); }
    catch (error) { message(error.message); busy($('teacher-form'), false); $('teacher-password').focus(); }
    finally { $('teacher-password').value = ''; }
  });
}

function renderRooms(rooms) {
  const active = rooms.filter(room => room.active !== false && new Date(room.expiresAt).getTime() > Date.now());
  $('room-list').replaceChildren(); $('room-count').textContent = String(active.length); $('rooms-empty').hidden = active.length > 0;
  for (const room of active) {
    const item = document.createElement('li'); item.className = 'room-item';
    const content = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = room.name || 'Übungswiese';
    const code = document.createElement('code'); code.textContent = formatCode(room.code);
    const time = document.createElement('span'); time.className = 'room-expiry'; time.textContent = expiry(room.expiresAt);
    content.append(title, code, time);
    const actions = document.createElement('div'); actions.className = 'room-actions';
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'room-action'; copy.textContent = 'Kopieren'; copy.setAttribute('aria-label', `Code für ${room.name || 'Übungswiese'} kopieren`); copy.addEventListener('click', () => copyCode(room.code, copy));
    const close = document.createElement('button'); close.type = 'button'; close.className = 'room-action close'; close.textContent = 'Schließen'; close.setAttribute('aria-label', `Zugang ${room.name || room.code} schließen`);
    close.addEventListener('click', async () => {
      close.disabled = true; message('');
      try {
        await api(`/rooms/${encodeURIComponent(room.id)}`, { method: 'DELETE' });
        if ($('created-code').dataset.roomId === room.id) $('created-room').hidden = true;
        await refreshRooms(); message('Der Zugang ist geschlossen.', 'success');
      } catch (error) { message(error.message); close.disabled = false; }
    });
    actions.append(copy, close); item.append(content, actions); $('room-list').append(item);
  }
}
async function refreshRooms() {
  try { const result = await api('/rooms'); renderRooms(result.rooms || []); }
  catch (error) {
    if (error.status === 401 || error.status === 403) { clearInterval(refreshTimer); openTeacherLogin(); return; }
    throw error;
  }
}
if (isTeacherPage) {
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try { await api('/logout', { method: 'POST', body: '{}' }); location.assign(new URL('./index.html', location.href)); }
    catch (error) { message(error.message); $('logout').disabled = false; }
  });
  $('room-form').addEventListener('submit', async event => {
    event.preventDefault(); busy(event.currentTarget, true); message('');
    try {
      const result = await api('/rooms', { method: 'POST', body: JSON.stringify({ name: $('room-name').value.trim() || undefined }) });
      const room = result.room;
      $('created-code').textContent = formatCode(room.code); $('created-code').dataset.roomId = room.id;
      $('created-expiry').textContent = expiry(room.expiresAt); $('created-room').hidden = false;
      $('copy-created-code').onclick = () => copyCode(room.code, $('copy-created-code'));
      await refreshRooms();
    } catch (error) { message(error.message); }
    finally { busy($('room-form'), false); }
  });
}

async function initialize() {
  if (location.protocol === 'file:') { offline(); return; }
  let session;
  try { session = await api('/session'); }
  catch (error) { offline(); return; }
  available = true; teacherConfigured = session.teacherConfigured;
  if (isTeacherPage) {
    if (session.role !== 'teacher') { openTeacherLogin(); return; }
    $('connection-status').textContent = ''; $('teacher-content').hidden = false; $('logout').hidden = false;
    if (session.build?.id) {
      const editor = new URL('./map-editor.html', location.href); editor.searchParams.set('v', session.build.id); $('latest-editor').href = editor.href;
      const label = session.build.builtAt ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(session.build.builtAt)) : String(session.build.id).slice(0, 10);
      $('build-label').textContent = `Editorstand · ${label}`;
    }
    try { await refreshRooms(); }
    catch (error) { message(error.message); }
    refreshTimer = setInterval(() => { if (!document.hidden) refreshRooms().catch(error => message(error.message)); }, 30000);
    return;
  }
  if (session.role) { location.replace(new URL(session.role === 'teacher' ? './teacher.html' : './lobby.html', location.href)); return; }
  $('connection-status').textContent = '';
  $('student-form').querySelector('button').disabled = false;
  $('teacher-form').querySelector('button').disabled = !teacherConfigured;
  $('teacher-setup').hidden = teacherConfigured;
}
initialize().catch(error => message(error.message));
