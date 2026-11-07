// One-shot integration used by the work-only build. The verified source commit
// removes this helper and restores the original workflow before publication.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const path = 'src/map/editor.js';
let source = readFileSync(path, 'utf8');
const bytes = Buffer.from(source);
const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if (blob !== '379994cc319a1f62f9cf36e5583c85fe7299e101') {
  throw new Error('Editor changed since review; refusing to overwrite newer work.');
}
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Expected one integration anchor: ${before}`);
  source = source.replace(before, after);
}
replaceOnce("import './editor.css';", "import { createPlacementRotationControl } from './placement-rotation.js';\nimport './editor.css';");
replaceOnce('preparePalette();\nlandscapePanel =', 'preparePalette();\nconst placementRotationControl = createPlacementRotationControl(document);\nlandscapePanel =');
replaceOnce("const added = makeWorldObject(kind, position, {variant: $('palette-variant').value, rarity: $('palette-rarity').value});",
  "const added = makeWorldObject(kind, position, {\n    variant: $('palette-variant').value, rarity: $('palette-rarity').value,\n    rotation: placementRotationControl.nextRotation(kind),\n  });");
replaceOnce("palette: {kind: $('palette-kind').value, variant: $('palette-variant').value, rarity: $('palette-rarity').value}",
  "palette: {kind: $('palette-kind').value, variant: $('palette-variant').value, rarity: $('palette-rarity').value, randomRotation: placementRotationControl.isEnabled($('palette-kind').value)}");
writeFileSync(path, source);
const workflow = execFileSync('git', ['show', '3ed9a71872cccc6584a6b90c6796e70d7a6b652f:.github/workflows/work-build-check.yml']);
writeFileSync('.github/workflows/work-build-check.yml', workflow);
console.log('Integrated rotation at the single placement entry point; restored original workflow.');
