import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Public single-player delivery. The classroom portal remains at its own entry;
// a Pages deployment must never replace it with an offline game alias.
export const previewFiles = Object.freeze([
  'editor.html', 'map-editor.html', 'magebrawl.html', 'nebeljagd.html', 'avatar-preview.html',
  'worldmap.json', 'worldmap.svg', 'worldmap.schema.json',
  'magebrawl-welt-und-editor.zip',
]);

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Prepare a matched preview from an already built and verified welt directory. */
export async function preparePreview(sourceDirectory = 'welt', destinationDirectory = 'preview') {
  const source = resolve(sourceDirectory), destination = resolve(destinationDirectory);
  if (source === destination) throw new Error('Source and preview directories must differ.');
  const sourceRelease = JSON.parse(await readFile(join(source, 'release.json'), 'utf8'));
  if (!sourceRelease.buildId || !sourceRelease.builtAt || !sourceRelease.files) {
    throw new Error('The source release must contain buildId, builtAt and file checksums.');
  }

  // Verify the complete set before changing a destination. Never combine a new
  // map/editor with an older game or publish an artifact from an unverified run.
  const entries = await Promise.all(previewFiles.map(async name => {
    const metadata = sourceRelease.files[name];
    if (!metadata || !/^[a-f0-9]{64}$/.test(metadata.sha256)) {
      throw new Error(`Source release is missing a verified artifact: ${name}`);
    }
    const bytes = await readFile(join(source, name));
    if (metadata.bytes !== bytes.length || metadata.sha256 !== digest(bytes)) {
      throw new Error(`Source artifact does not match release.json: ${name}`);
    }
    return { name, bytes };
  }));
  const map = JSON.parse(entries.find(entry => entry.name === 'worldmap.json').bytes.toString('utf8'));
  if (typeof map.name !== 'string' || !map.name) throw new Error('Project map needs a name.');
  const sourceCommit = sourceRelease.sourceCommit ?? sourceRelease.sourceBaseCommit ?? null;
  const mapSha256 = sourceRelease.files['worldmap.json'].sha256;
  for (const name of ['map-editor.html', 'magebrawl.html']) {
    const html = entries.find(entry => entry.name === name).bytes.toString('utf8');
    const match = html.match(/<script\b(?=[^>]*\bid=["']editor-build-info["'])[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) throw new Error(`Build metadata is missing from ${name}`);
    let info;
    try { info = JSON.parse(match[1]); } catch { throw new Error(`Build metadata is invalid in ${name}`); }
    if (info.buildId !== sourceRelease.buildId || info.builtAt !== sourceRelease.builtAt ||
        info.sourceCommit !== sourceCommit || info.mapSha256 !== mapSha256) {
      throw new Error(`Editor, game and project map do not belong to the same build: ${name}`);
    }
  }
  entries.push({ name: 'index.html', bytes: entries.find(entry => entry.name === 'magebrawl.html').bytes });
  const files = Object.fromEntries(entries.map(({name, bytes}) => [name, {
    bytes: bytes.length, sha256: digest(bytes),
  }]));
  const { localBuild, ...metadata } = sourceRelease;
  const release = {
    ...metadata,
    name: 'Magebrawl – aktuelle Spielwelt und Editor',
    type: 'static-game-editor-preview',
    sourceBranch: 'work',
    sourceCommit,
    loginAvailable: false,
    projectMap: { name: map.name, sha256: files['worldmap.json'].sha256 },
    files,
  };

  // Write only managed preview files. Existing main paths, including its portal,
  // and any unrelated files inside preview are deliberately left alone.
  await mkdir(destination, {recursive: true});
  await Promise.all(entries.map(({name, bytes}) => writeFile(join(destination, name), bytes)));
  await writeFile(join(destination, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  // This was the previous managed download; all unrelated files stay intact.
  await rm(join(destination, 'nebeljagd-welt-und-editor.zip'), {force: true});
  return release;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const release = await preparePreview(process.argv[2], process.argv[3]);
  console.log(`Matched preview prepared (build ${release.buildId}, ${release.projectMap.name}).`);
}
