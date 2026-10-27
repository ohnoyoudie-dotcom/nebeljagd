import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderWorldmapSvg } from '../src/map/render.js';
import { packageWorldBundle } from './package-world-bundle.js';

const root = resolve('dist');
async function inlineEntry(source, destination) {
  let html = await readFile(resolve(root, source), 'utf8');
  const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
  const stylesheet = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
  if (!script || !stylesheet) throw new Error(`Expected one bundled script and stylesheet in dist/${source}`);
  const javascript = await readFile(resolve(root, script[1]), 'utf8');
  const css = await readFile(resolve(root, stylesheet[1]), 'utf8');
  // Fail rather than silently producing a file that needs a neighbouring chunk.
  if (/\b(?:from\s*|import\s*\()\s*["']\.\.?\//.test(javascript)) {
    throw new Error(`dist/${source} contains an external chunk import; cannot package it offline`);
  }
  html = html.replace(script[0], () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
  html = html.replace(stylesheet[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  await writeFile(resolve(root, destination), html);
}

await inlineEntry('index.html', 'nebeljagd.html');
await inlineEntry('map-editor.html', 'map-editor.html');
for (const file of ['worldmap.json', 'worldmap.schema.json']) {
  await copyFile(resolve(file), resolve(root, file));
}
const map = JSON.parse(await readFile(resolve('worldmap.json'), 'utf8'));
await writeFile(resolve(root, 'worldmap.svg'), renderWorldmapSvg(map, { showSpawns: true, showZone: false, showLabels: true }));
console.log('Standalone browser files: dist/nebeljagd.html and dist/map-editor.html');
console.log('Editable map data: dist/worldmap.json, dist/worldmap.svg, dist/worldmap.schema.json');
await packageWorldBundle(root);
