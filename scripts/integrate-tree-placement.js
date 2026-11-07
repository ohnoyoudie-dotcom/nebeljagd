import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// One-time guarded integration. User models and worldmap.json are never written.
const expected = {
  'src/map/objects.js': '2b742fea6f740cca50994d973d360aaefe8c744e',
  'src/map/retired-scenery.js': '8470a0be6cf66e2d92fca734ae467d85564ae522',
  'tests/scenery_authoring.test.js': 'a84bd0d4bc2b0bea211c4ae2ebb895f87d2597c4',
  'tests/landscape_brush.test.js': '1614a7f5dbbd701343d7199eb9dfa725f9972101',
  'tests/tripo_object_cleanup.test.js': '927ec45bc8e1d46e47af296be2b4bbee6476eb83',
};
for (const [path, sha] of Object.entries(expected)) {
  const bytes = readFileSync(path);
  const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== sha) throw new Error(`Reviewed source changed: ${path}; refusing automatic overwrite.`);
}
const staged = new Map();
function replace(path, before, after) {
  const text = staged.get(path) ?? readFileSync(path, 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Expected exactly one integration anchor in ${path}: ${before.slice(0, 90)}`);
  staged.set(path, text.replace(before, after));
}
const objects = 'src/map/objects.js';
for (const [id, label] of [['oak', 'Eiche'], ['birch', 'Birke'], ['pine', 'Kiefer'], ['rei-tree01', 'Rei-Laubbaum 1'], ['rei-tree02', 'Rei-Laubbaum 2']]) {
  replace(objects, `{ id: '${id}', label: '${label}' }`, `{ id: '${id}', label: '${label}', retired: true }`);
}
replace(objects, '/** Only approved Tripo models belong in the individual object palette.', '/** Approved Tripo models and the four existing GLB trees belong in the palette.');
replace(objects, 'const placementAssetIds = new Set([', "const placementAssetIds = new Set([\n  'tree:kit-pine-high', 'tree:kit-pine-young', 'tree:kit-oak-green', 'tree:kit-oak-autumn',");
replace(objects, 'defaultVariant: variants.some(variant => variant.id === definition.defaultVariant)', "defaultVariant: definition.kind === 'tree' ? 'kit-oak-green' : variants.some(variant => variant.id === definition.defaultVariant)");
const retired = 'src/map/retired-scenery.js';
replace(retired, "Object.freeze(['tree', 'mound', 'flower', 'ruin', 'shrine'])", "Object.freeze(['mound', 'flower', 'ruin', 'shrine'])");
replace(retired, "const retiredVariants = new Set(['fence:kit-wood'", "// Keep legacy tree shapes retired; explicitly placed GLB trees survive cleanup.\nconst retiredVariants = new Set(['tree:oak', 'tree:birch', 'tree:pine', 'tree:rei-tree01', 'tree:rei-tree02',\n  'fence:kit-wood'");
replace('src/map/landscape-panel.js', '<h3>Felsen verteilen</h3>', '<h3>Bäume und Felsen verteilen</h3>');
replace('src/map/editor.js', "button.textContent = 'Auf Tripo-Objekte bereinigen';", "button.textContent = 'Veraltete Objekte entfernen';");
replace('src/map/editor.js', 'alte Objektplatzierungen (Nicht-Tripo oder kleines Schloss)', 'veraltete Objektplatzierungen');
replace('src/map/editor.js', 'Aktuelle Tripo-Modelle einschließlich Schwert und Zauberstäben,', 'Freigeschaltete Bäume und aktuelle Tripo-Modelle einschließlich Schwert und Zauberstäben,');
const test = 'tests/scenery_authoring.test.js';
replace(test, "const retired = ['tree', 'mound'", "const retired = ['mound'");
replace(test, 'individual placement offers exactly the admitted Tripo models', 'individual placement offers exactly the admitted GLB trees and Tripo models');
replace(test, "const expected = ['house:kit-tripo-tavern'", "const expected = ['tree:kit-pine-high', 'tree:kit-pine-young', 'tree:kit-oak-green', 'tree:kit-oak-autumn',\n    'house:kit-tripo-tavern'");
replace(test, "definition => definition.kind), ['house', 'rock'", "definition => definition.kind), ['tree', 'house', 'rock'");
// Preserve the regression against genuinely retired tree shapes. The admitted
// GLB variants are separately exercised by tree_placement.test.js.
replace('tests/landscape_brush.test.js',
  "scatter: { density: .8, entries: [{ kind: 'tree', variant: 'kit-oak-autumn', weight: 1 }] } }),\n  /aktuell verfügbare/, 'saved tree-only scatter cannot revive a retired model');",
  "scatter: { density: .8, entries: [{ kind: 'tree', variant: 'oak', weight: 1 }] } }),\n  /aktuell verfügbare/, 'saved tree-only scatter cannot revive a retired procedural model');");
replace('tests/tripo_object_cleanup.test.js', 'preserves current Tripo models and drawn routes', 'preserves approved GLB trees, current Tripo models and drawn routes');
replace('tests/tripo_object_cleanup.test.js', 'assert.equal(result.map.objects.length, 15);',
  "assert.equal(result.map.objects.length, 19);\n  assert.deepEqual(result.map.objects.filter(object => object.kind === 'tree').map(object => object.variant),\n    ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn']);");
// Update exact palette expectations; legacy cleanup assertions remain intact.
const smoke = 'tests/tripo_palette_smoke.py';
replace(smoke, 'Exercise the Tripo-only Objects palette', 'Exercise the approved GLB-tree and Tripo Objects palette');
replace(smoke, "== {'house', 'rock', 'chest', 'wagon', 'barrel', 'well',\n                                             'sword', 'fireStaff', 'iceStaff'}", "== {'tree', 'house', 'rock', 'chest', 'wagon', 'barrel', 'well',\n                                             'sword', 'fireStaff', 'iceStaff', 'bow', 'poisonStaff', 'moonStaff'}");
replace(smoke, "            assert catalog[item['value']] and all(x['value'].startswith('kit-tripo-') and 'Tripo' in x['label']\n                                                 for x in catalog[item['value']]), catalog", "            if item['value'] == 'tree':\n                assert [x['value'] for x in catalog['tree']] == ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn']\n            else:\n                assert catalog[item['value']] and all(x['value'].startswith('kit-tripo-') and 'Tripo' in x['label']\n                                                     for x in catalog[item['value']]), catalog");
for (const [path, text] of staged) writeFileSync(path, text);
console.log(`Integrated explicit placement of four existing GLB trees in ${staged.size} reviewed files. No source models or project map changed.`);
