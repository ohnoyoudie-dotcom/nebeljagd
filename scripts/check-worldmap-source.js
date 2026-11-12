import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function assertWorldmapSource(source, generated, release) {
  const expected = release?.files?.['worldmap.json']?.sha256;
  if (!expected) return;
  const actual = createHash('sha256').update(generated).digest('hex');
  if (actual === expected || JSON.stringify(JSON.parse(source)) === JSON.stringify(JSON.parse(generated))) return;
  throw new Error('welt/worldmap.json enthält Änderungen außerhalb des letzten Builds. Der Build wurde angehalten, damit diese Karte nicht überschrieben wird. Den gewünschten Kartenstand zuerst in die worldmap.json im Projektstamm übernehmen.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [source, generated, release] = await Promise.all([
      readFile('worldmap.json', 'utf8'), readFile('welt/worldmap.json', 'utf8'), readFile('welt/release.json', 'utf8'),
    ]);
    assertWorldmapSource(source, generated, JSON.parse(release));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
