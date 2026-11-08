import { validateWorldmap } from './model.js';

// This integration writes only the owner's canonical map on the work branch.
// The user supplies a scoped credential at runtime; no credential ships here.
export const MAP_REPOSITORY = 'ohnoyoudie-dotcom/nebeljagd';
const API = `https://api.github.com/repos/${MAP_REPOSITORY}`;
const CONTENTS = `${API}/contents/worldmap.json`;
const LIMIT = 5_000_000;
const SHA = /^[a-f0-9]{40}$/;

export class MapSyncError extends Error {
  constructor(code, message) { super(message); this.name = 'MapSyncError'; this.code = code; }
}
const failure = (code, message) => new MapSyncError(code, message);
export function mapDocument(map) {
  if (!validateWorldmap(map).valid) throw failure('invalid', 'Diese Karte ist ungültig und wurde nicht hochgeladen.');
  const text = JSON.stringify(map, null, 2) + '\n';
  if (new TextEncoder().encode(text).length > LIMIT) throw failure('invalid', 'Die Karte ist größer als 5 MB.');
  return text;
}
export async function documentHash(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
  return btoa(binary);
}
function decode(content) {
  if (typeof content !== 'string' || content.length > LIMIT * 1.5) throw failure('invalid', 'Die Onlinekarte ist zu groß oder unvollständig.');
  try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(content.replace(/\s/g, '')), c => c.charCodeAt(0))); }
  catch { throw failure('invalid', 'Die Onlinekarte konnte nicht gelesen werden.'); }
}
async function request(url, token, {method = 'GET', body, fetchImpl = fetch} = {}) {
  if (!token?.trim()) throw failure('auth', 'Bitte zuerst die GitHub-Verbindung einrichten.');
  let response;
  try {
    response = await fetchImpl(url, {method, cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(30000),
      headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.trim()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})});
  } catch { throw failure('network', 'GitHub ist gerade nicht erreichbar. Deine Karte bleibt im Browser erhalten.'); }
  if (!response.ok) {
    // Never reflect response bodies or transport messages containing credentials.
    await response.body?.cancel();
    if ([401, 403, 404].includes(response.status)) throw failure('auth', 'GitHub-Zugriff fehlt oder ist abgelaufen. Prüfe das Repository und „Contents: Read and write“.');
    if ([409, 422].includes(response.status)) throw failure('conflict', 'Die Onlinekarte wurde inzwischen geändert. Deine Karte wurde nicht überschrieben.');
    throw failure('network', 'GitHub konnte die Karte gerade nicht sichern. Bitte später erneut versuchen.');
  }
  try { return await response.json(); }
  catch { throw failure('network', 'GitHub hat die Speicherung nicht eindeutig bestätigt. Bitte den Stand erneut prüfen.'); }
}

export async function readGitHubMap({token, fetchImpl = fetch}) {
  let result = await request(`${CONTENTS}?ref=work`, token, {fetchImpl});
  if (!SHA.test(result.sha) || result.type !== 'file' || result.size > LIMIT) throw failure('invalid', 'Die Onlinekarte ist ungültig oder zu groß.');
  const sha = result.sha;
  if (result.encoding !== 'base64') result = await request(`${API}/git/blobs/${sha}`, token, {fetchImpl});
  if (result.sha !== sha || result.encoding !== 'base64') throw failure('invalid', 'GitHub hat keine vollständige Karte geliefert.');
  const text = decode(result.content);
  let map;
  try { map = JSON.parse(text); } catch { throw failure('invalid', 'Die Onlinekarte enthält kein gültiges JSON.'); }
  mapDocument(map);
  return {map, sha, text, hash: await documentHash(text)};
}

export async function writeGitHubMap({token, map, expectedSha, fetchImpl = fetch}) {
  const text = mapDocument(map);
  if (!SHA.test(expectedSha ?? '')) throw failure('conflict', 'Bitte zuerst den aktuellen Online-Stand laden.');
  let result;
  try {
    result = await request(CONTENTS, token, {method: 'PUT', fetchImpl, body: {
      message: 'map: save world from online editor', branch: 'work', sha: expectedSha, content: encode(text),
    }});
  } catch (error) {
    if (error.code !== 'network') throw error;
    // A lost PUT response may still have created the commit. Reconcile with a
    // read; never retry the write blindly or overwrite a concurrently saved map.
    try {
      const remote = await readGitHubMap({token, fetchImpl});
      if (remote.text === text) return {...remote, commit: null};
    } catch { /* Retain the original bounded failure. */ }
    throw error;
  }
  if (!SHA.test(result.content?.sha ?? '') || !SHA.test(result.commit?.sha ?? '')) throw failure('network', 'Die Speicherung wurde nicht eindeutig bestätigt. Bitte erneut prüfen.');
  return {map, text, sha: result.content.sha, commit: result.commit.sha, hash: await documentHash(text)};
}

export function planMapSync({local, project, remote, baseSha, unchangedSinceSave = false}) {
  const current = JSON.stringify(local), online = JSON.stringify(remote.map);
  if (current === online) return 'synced';
  if (current === JSON.stringify(project) || unchangedSinceSave) return 'remote';
  // Edits based on the known remote revision can be saved with compare-and-swap.
  if (remote.sha === baseSha || !baseSha && online === JSON.stringify(project)) return 'local';
  return 'conflict';
}
