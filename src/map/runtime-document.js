import { normalizeWorldmap } from './objects.js';
import { validateWorldmap } from './model.js';

export const PLAYTEST_KEY = 'nebeljagd.worldmap.playtest.v1';
export const IMPORT_KEY = 'nebeljagd.worldmap.import.v1';
export const MAX_MAP_BYTES = 5_000_000;

export function parseWorldDocument(contents) {
  if (typeof contents !== 'string' || contents.length > MAX_MAP_BYTES) throw new Error('Die Karte darf höchstens 5 MB groß sein.');
  let value;
  try { value = JSON.parse(contents); } catch { throw new Error('Die Datei enthält kein gültiges JSON.'); }
  const map = normalizeWorldmap(value);
  const result = validateWorldmap(map);
  if (!result.valid) throw new Error(result.errors.slice(0, 4).join(' '));
  return map;
}

/** An explicit editor launch can transfer its document even when storage is unavailable. */
function requestEditorDocument() {
  if (!window.opener) return Promise.resolve(null);
  return new Promise(resolve => {
    const origin = location.protocol === 'file:' ? 'null' : location.origin;
    const finish = map => { clearTimeout(timer); window.removeEventListener('message', receive); resolve(map); };
    const receive = event => {
      if (event.source !== window.opener || event.origin !== origin || event.data?.type !== 'nebeljagd-map') return;
      try { finish(parseWorldDocument(JSON.stringify(event.data.map))); } catch { finish(null); }
    };
    const timer = setTimeout(() => finish(null), 1800);
    window.addEventListener('message', receive);
    window.opener.postMessage({ type: 'nebeljagd-map-request' }, origin === 'null' ? '*' : origin);
  });
}

export async function loadRuntimeWorldmap(defaultMap) {
  const source = new URLSearchParams(location.search).get('mapSource');
  if (source === 'editor') {
    const direct = await requestEditorDocument();
    if (direct) return { map: direct, source: 'editor' };
    let saved;
    try { saved = localStorage.getItem(PLAYTEST_KEY); } catch { /* File browsers can disable storage. */ }
    if (!saved) throw new Error('Der Editor-Entwurf konnte nicht übertragen werden. Speichere dort JSON und lade die Datei im Spiel über „Eigene Karte laden“.');
    return { map: parseWorldDocument(saved), source: 'editor' };
  }
  if (source === 'import') {
    let saved;
    try { saved = sessionStorage.getItem(IMPORT_KEY); } catch { /* Handled below. */ }
    if (!saved) throw new Error('Der importierte Kartenstand fehlt. Öffne die Spielversion erneut und lade deine JSON-Datei.');
    return { map: parseWorldDocument(saved), source: 'import' };
  }
  const embedded = document.getElementById('worldmap-snapshot')?.textContent;
  if (embedded && embedded.trim() !== 'null') return { map: parseWorldDocument(embedded), source: 'embedded' };
  return { map: parseWorldDocument(JSON.stringify(defaultMap)), source: 'project' };
}

export async function importRuntimeWorldmap(file) {
  if (!file || file.size > MAX_MAP_BYTES) throw new Error('Bitte eine Karten-JSON mit höchstens 5 MB auswählen.');
  const map = parseWorldDocument(await file.text());
  try {
    sessionStorage.setItem(IMPORT_KEY, JSON.stringify(map));
  } catch {
    // A packaged game can preserve an imported document without browser storage.
    if (document.querySelector('script[src]')) throw new Error('Dieser Browser erlaubt keinen lokalen Speicher. Öffne die eigenständige nebeljagd.html und lade dort deine Karte.');
    const doc = document.documentElement.cloneNode(true);
    doc.querySelector('#worldmap-snapshot').textContent = JSON.stringify(map).replace(/</g, '\\u003c');
    const url = URL.createObjectURL(new Blob([`<!doctype html>\n${doc.outerHTML}`], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = 'nebeljagd-eigene-welt.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    return 'Die Spielversion mit deiner Karte wurde gespeichert. Öffne die heruntergeladene HTML-Datei im Browser.';
  }
  const target = new URL(location.href); target.searchParams.set('mapSource', 'import'); target.hash = '';
  location.assign(target.href);
  return 'Die Spielwelt wird aus deiner Karte geladen …';
}
