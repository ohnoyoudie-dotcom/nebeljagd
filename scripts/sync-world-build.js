import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { readBuildInfo, verifyBuildInfo } from './build-info.js';

// This is the only build-to-delivery copy step. Never turn index into a game
// alias: it is the portal shared by pupils and teachers.
const names = ['index.html', 'teacher.html', 'lobby.html', 'magebrawl.html', 'nebeljagd.html',
  'map-editor.html', 'editor.html', 'avatar-preview.html', 'worldmap.json', 'worldmap.svg',
  'worldmap.schema.json', 'magebrawl-welt-und-editor.zip'];
const entries = await Promise.all(names.map(async name => ({name, bytes: await readFile(resolve('dist', name))})));
const files = Object.fromEntries(entries.map(({name,bytes}) => [name, {
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
}]));
const buildInfo = verifyBuildInfo(
  readBuildInfo(entries.find(entry => entry.name === 'map-editor.html').bytes.toString('utf8')),
  entries.find(entry => entry.name === 'worldmap.json').bytes,
);
await mkdir('welt', {recursive:true});
for (const {name,bytes} of entries) {
  const destination = join('welt', name), temporary = destination + '.new';
  await writeFile(temporary, bytes); await rename(temporary, destination);
}
const release = { ...buildInfo, sourceBaseCommit:buildInfo.sourceCommit, localBuild:true, files };
const manifest = JSON.stringify(release,null,2)+'\n';
await writeFile('dist/release.json', manifest);
await writeFile('welt/release.json.new', manifest);
await rename('welt/release.json.new','welt/release.json');
await rm('welt/nebeljagd-welt-und-editor.zip', {force: true});
console.log(`Current portal and editor synchronized to welt/ (build ${buildInfo.buildId}).`);
