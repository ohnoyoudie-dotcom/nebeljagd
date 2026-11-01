import { createHash } from 'node:crypto';

const marker = '<script id="editor-build-info" type="application/json">';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Identify one matching set of browser files before embedding its metadata. */
export function createBuildInfo(entries, { sourceCommit = null, builtAt = new Date().toISOString() } = {}) {
  const sorted = [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (new Set(sorted.map(entry => entry.name)).size !== sorted.length) {
    throw new Error('Duplicate build artifact name');
  }
  const map = sorted.find(entry => entry.name === 'worldmap.json');
  if (!map) throw new Error('The browser build needs worldmap.json');
  const content = sorted.map(({ name, bytes }) => [name, digest(bytes)]);
  // The timestamp and metadata are excluded to avoid a circular or time-based ID.
  const buildId = digest(JSON.stringify({ sourceCommit, content })).slice(0, 12);
  return { buildId, builtAt, sourceCommit, mapSha256: digest(map.bytes) };
}

export function embedBuildInfo(html, info) {
  if (!html.includes('<head>')) throw new Error('Build artifact has no HTML head');
  const json = JSON.stringify(info).replace(/</g, '\\u003c');
  if (html.includes(marker)) {
    if (readBuildInfo(html) !== null) throw new Error('Build metadata is already embedded');
    return html.replace(/<script id="editor-build-info" type="application\/json">\s*null\s*<\/script>/, () => `${marker}${json}</script>`);
  }
  return html.replace('<head>', `<head>\n    ${marker}${json}</script>`);
}

export function readBuildInfo(html) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('Browser build metadata is missing');
  const end = html.indexOf('</script>', start + marker.length);
  if (end < 0) throw new Error('Browser build metadata is incomplete');
  return JSON.parse(html.slice(start + marker.length, end));
}

export function verifyBuildInfo(info, mapBytes) {
  if (!info || !/^[a-f0-9]{12}$/.test(info.buildId) ||
      !Number.isFinite(Date.parse(info.builtAt)) ||
      !(info.sourceCommit === null || /^[a-f0-9]{40,64}$/.test(info.sourceCommit)) ||
      info.mapSha256 !== digest(mapBytes)) {
    throw new Error('Build metadata does not match the project map');
  }
  return info;
}
