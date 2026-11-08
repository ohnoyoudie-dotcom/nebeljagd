/** Read the current release at launch; an already-open editor may be old. */
export async function freshPlaytestUrl(editorHref, { development = false, fetchRelease = globalThis.fetch, now = Date.now } = {}) {
  const url = new URL(development ? './game.html' : './magebrawl.html', editorHref);
  url.searchParams.set('mapSource', 'editor');
  if (url.protocol === 'file:' || development) return url;
  // Also force a fresh request if offline or the release is temporarily unavailable.
  url.searchParams.set('v', String(now()));
  try {
    const response = await fetchRelease(new URL('./release.json', editorHref), {
      cache: 'no-store', signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return url;
    const release = await response.json();
    const hash = release?.files?.['magebrawl.html']?.sha256;
    if (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)) url.searchParams.set('v', hash);
  } catch { /* The game and local map remain usable without the release service. */ }
  return url;
}
