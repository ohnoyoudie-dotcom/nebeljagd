import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateWorldmap, getWorldmapStats } from '../src/map/model.js';
import { renderWorldmapSvg } from '../src/map/render.js';

const map = JSON.parse(await readFile(resolve('worldmap.json'), 'utf8'));
const result = validateWorldmap(map);
if (!result.valid) {
  throw new Error(`Invalid worldmap.json:\n${result.errors.join('\n')}`);
}
const svg = renderWorldmapSvg(map, { showSpawns: true, showZone: false, showLabels: true });
if (process.argv.includes('--check')) {
  const saved = await readFile(resolve('worldmap.svg'), 'utf8');
  if (saved !== svg) throw new Error('worldmap.svg differs from worldmap.json. Run npm run map:export to regenerate.');
  console.log('Map data valid; generated SVG matches worldmap.json.');
} else if (!process.argv.includes('--validate')) {
  await writeFile(resolve('worldmap.svg'), svg);
  console.log('Generated editable worldmap.svg from worldmap.json.');
} else {
  console.log('Map data valid. Source worldmap.svg remains editable and is not overwritten by the build.');
}
console.log(JSON.stringify(getWorldmapStats(map), null, 2));
for (const warning of result.warnings) console.warn(`Map warning: ${warning}`);
