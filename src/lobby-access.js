/** The practice world always uses the server session, never a browser-stored code. */
export async function readLobbySession(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/api/session', {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const session = await response.json();
  return session?.role === 'teacher' || (session?.role === 'student' && session.room) ? session : null;
}

export async function requireLobbySession({ fetchImpl = globalThis.fetch, location = globalThis.location } = {}) {
  const session = await readLobbySession(fetchImpl).catch(() => null);
  if (session) return session;
  location.replace('./index.html?reason=session-ended');
  throw new Error('Bitte melde dich für die Übungswiese an.');
}

/** Recheck on a bounded interval and on return to the tab; close only once. */
export function watchLobbySession({
  fetchImpl = globalThis.fetch, location = globalThis.location, document = globalThis.document,
  setIntervalImpl = globalThis.setInterval, clearIntervalImpl = globalThis.clearInterval,
  onInvalid = () => {}, intervalMs = 15000,
} = {}) {
  let stopped = false, checking = false;
  async function check() {
    if (stopped || checking) return;
    checking = true;
    const session = await readLobbySession(fetchImpl).catch(() => null);
    checking = false;
    if (stopped || session) return;
    stop();
    onInvalid();
    location.replace('./index.html?reason=session-ended');
  }
  const onVisibility = () => { if (!document.hidden) void check(); };
  const timer = setIntervalImpl(check, intervalMs);
  document?.addEventListener('visibilitychange', onVisibility);
  function stop() {
    stopped = true;
    clearIntervalImpl(timer);
    document?.removeEventListener('visibilitychange', onVisibility);
  }
  void check();
  return stop;
}

export async function leaveLobby(session, { fetchImpl = globalThis.fetch, location = globalThis.location } = {}) {
  if (session.role === 'teacher') return location.assign('./teacher.html');
  try { await fetchImpl('/api/logout', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) }); }
  catch { /* The start page remains reachable when the connection is lost. */ }
  location.assign('./index.html');
}
