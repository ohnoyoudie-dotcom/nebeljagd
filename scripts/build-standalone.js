import { packInlineModels } from './pack-inline-models.js';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderWorldmapSvg } from '../src/map/render.js';
import { packageWorldBundle } from './package-world-bundle.js';
import { createBuildInfo, embedBuildInfo } from './build-info.js';
import { legacyGameEntry } from './legacy-game-entry.js';

const root = resolve('dist');
async function inlineEntry(source, destination) {
  let html = await readFile(resolve(root, source), 'utf8');
  const script = html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
  const stylesheet = html.match(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/);
  if (!script || !stylesheet) throw new Error(`Expected one bundled script and stylesheet in dist/${source}`);
  const packed = packInlineModels(await readFile(resolve(root, script[1]), 'utf8'));
  const javascript = packed.javascript;
  if(packed.models) console.log(`Lossless GLB storage ${destination}: ${packed.models} models, ${packed.originalBytes-packed.packedBytes} compressed bytes saved`);
  const css = await readFile(resolve(root, stylesheet[1]), 'utf8');
  // Fail rather than silently producing a file that needs a neighbouring chunk.
  if (/\b(?:from\s*|import\s*\()\s*["']\.\.?\//.test(javascript)) {
    throw new Error(`dist/${source} contains an external chunk import; cannot package it offline`);
  }
  html = html.replace(script[0], () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
  html = html.replace(stylesheet[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  await writeFile(resolve(root, destination), html);
}

await inlineEntry('index.html', 'index.html');
await inlineEntry('teacher.html', 'teacher.html');
await inlineEntry('lobby.html', 'lobby.html');
await inlineEntry('game.html', 'magebrawl.html');
await writeFile(resolve(root, 'nebeljagd.html'), legacyGameEntry());
await inlineEntry('map-editor.html', 'map-editor.html');
await inlineEntry('avatar-preview.html', 'avatar-preview.html');
for (const file of ['worldmap.json', 'worldmap.schema.json']) {
  await copyFile(resolve(file), resolve(root, file));
}
const map = JSON.parse(await readFile(resolve('worldmap.json'), 'utf8'));
await writeFile(resolve(root, 'worldmap.svg'), renderWorldmapSvg(map, { showSpawns: false, showZone: false, showLabels: false }));
const htmlNames = ['index.html', 'teacher.html', 'lobby.html', 'magebrawl.html', 'nebeljagd.html',
  'map-editor.html', 'avatar-preview.html', 'editor.html'];
const versionedNames = [...htmlNames, 'worldmap.json', 'worldmap.schema.json', 'worldmap.svg'];
const versioned = await Promise.all(versionedNames.map(async name => ({
  name, bytes: await readFile(resolve(root, name)),
})));
let sourceCommit = null;
try { sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
const buildInfo = createBuildInfo(versioned, { sourceCommit });
for (const { name, bytes } of versioned) {
  if (htmlNames.includes(name)) {
    await writeFile(resolve(root, name), embedBuildInfo(bytes.toString('utf8'), buildInfo));
  }
}
console.log('Standalone browser files: dist/magebrawl.html and dist/map-editor.html');
console.log(`Online editor entry: dist/editor.html (build ${buildInfo.buildId})`);
console.log('Character review: dist/avatar-preview.html');
console.log('Editable map data: dist/worldmap.json, dist/worldmap.svg, dist/worldmap.schema.json');
await packageWorldBundle(root);
