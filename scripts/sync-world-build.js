import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

// This is the only build-to-delivery copy step. Never turn index into a game
// alias: it is the portal shared by pupils and teachers.
const names = ['index.html', 'teacher.html', 'lobby.html', 'nebeljagd.html',
  'map-editor.html', 'avatar-preview.html', 'worldmap.json', 'worldmap.svg',
  'worldmap.schema.json', 'nebeljagd-welt-und-editor.zip'];
const entries = await Promise.all(names.map(async name => ({name, bytes: await readFile(resolve('dist', name))})));
const files = Object.fromEntries(entries.map(({name,bytes}) => [name, {
  bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
}]));
const buildId = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,12);
let sourceBaseCommit = null;
try { sourceBaseCommit = execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(); } catch {}
await mkdir('welt', {recursive:true});
for (const {name,bytes} of entries) {
  const destination = join('welt', name), temporary = destination + '.new';
  await writeFile(temporary, bytes); await rename(temporary, destination);
}
const release = {buildId, builtAt:new Date().toISOString(), sourceBaseCommit, localBuild:true, files};
await writeFile('welt/release.json.new', JSON.stringify(release,null,2)+'\n');
await rename('welt/release.json.new','welt/release.json');
console.log(`Current portal and editor synchronized to welt/ (build ${buildId}).`);
