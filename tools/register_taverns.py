#!/usr/bin/env python3
"""Register the two uploaded taverns in the shipped editors and game bundles.

Only known, unique anchors are changed. Source maps and embedded images are
left intact. Running the script a second time is a no-op.
"""
from __future__ import annotations
import argparse
import re
import subprocess
import tempfile
from pathlib import Path

FILES = (
    'welt/map-editor.html', 'welt/index.html', 'welt/nebeljagd.html',
    'Welt und Editor/map-editor.html', 'Welt und Editor/nebeljagd.html',
)
VARIANTS = (
    ('tavern-file', 'Taverne · Taverne.glb', 'Taverne.glb'),
    ('tavern-nebeljagd', 'Taverne Nebeljagd · taverne_nebeljagd.glb', 'taverne_nebeljagd.glb'),
)
MARKER = '<!-- nebeljagd-tavern-assets-v1 -->'


def once(text: str, old: str, new: str, description: str) -> str:
    count = text.count(old)
    if count != 1:
        raise ValueError(f'{description}: expected one anchor, found {count}')
    return text.replace(old, new, 1)


def register_variants(text: str) -> str:
    pattern = r'(\{kind:`house`,label:`Haus`,defaultVariant:`herbal`,defaultScale:1,footprintRadius:11,variants:\[)([^\]]*)(\]\})'
    matches = list(re.finditer(pattern, text))
    if len(matches) != 1:
        raise ValueError(f'House catalog: expected one definition, found {len(matches)}')
    match = matches[0]
    additions = ','.join('{id:`' + vid + '`,label:`' + label + '`}' for vid, label, _ in VARIANTS)
    return text[:match.start()] + match[1] + match[2] + ',' + additions + match[3] + text[match.end():]


def patch_editor(text: str, current: bool) -> str:
    if current:
        entries = []
        for vid, label, file in VARIANTS:
            entries.append('D(`house`,`' + vid + '`,`' + label + '`,[`../Blender/' + file + '`],`Originaldatei: ' + file + '. Das Originalmodell wird beim 3D-Test geladen.`,{format:`glb`,sourceLabel:`Blender · ' + file + '`})')
        text = once(text, 'xe=Object.freeze([', 'xe=Object.freeze([' + ','.join(entries) + ',', 'Editor asset metadata')
    return text


LOADER = r'''
// Two distinct uploaded taverns. Load each file only when placed on the map.
const nebTavernFiles = new Map([
  ["tavern-file", "../Blender/Taverne.glb"],
  ["tavern-nebeljagd", "../Blender/taverne_nebeljagd.glb"]
]);
const nebTavernWalls = new Map();
for (const [variant, url] of nebTavernFiles) {
  if (!(t.objects || []).some(object => object.kind === "house" && object.variant === variant)) continue;
  try {
    const imported = await c.loadAsync(url);
    imported.scene.updateWorldMatrix(true, true);
    let bounds = null;
    const meshBounds = [];
    imported.scene.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
      if (box.isEmpty()) return;
      meshBounds.push({name: mesh.name, box});
      if (bounds) bounds.union(box); else bounds = box.clone();
    });
    if (!bounds || bounds.isEmpty()) throw new Error("Das Modell hat keine sichtbare Geometrie.");
    const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(span) || span <= 0 || !Number.isFinite(height) || height <= 0) throw new Error("Ungültige Modellabmessungen.");
    // Both buildings fit a 24 m footprint at editor scale 1, preserving proportions.
    const normalized = __NORMALIZE__(imported.scene, height * 24 / span, mesh => mesh.material);
    if (!normalized.parts.length) throw new Error("Das Modell enthält keine Meshes.");
    S.set("house:" + variant, normalized.parts);
    const walls = [];
    for (const {name, box} of meshBounds) {
      if (!/wall|mauer|wand|pillar|column|pfosten/i.test(name || "")) continue;
      const factor = normalized.scale, offset = normalized.offset;
      const width = (box.max.x - box.min.x) * factor;
      const depth = (box.max.z - box.min.z) * factor;
      const minY = (box.min.y - offset.y) * factor;
      const maxY = (box.max.y - offset.y) * factor;
      // Never turn an entire merged building or an overhead lintel into a blocker.
      if (maxY - minY < .6 || minY > 1.4 || Math.min(width, depth) > 1.8 || Math.max(width, depth) > 24.5) continue;
      walls.push({minX:(box.min.x-offset.x)*factor, maxX:(box.max.x-offset.x)*factor,
        minZ:(box.min.z-offset.z)*factor, maxZ:(box.max.z-offset.z)*factor,
        minY, maxY, type:"house-wall"});
    }
    nebTavernWalls.set(variant, walls);
    __STATS__.loadedGLBs++;
    __STATS__.sources.push(url);
  } catch (error) {
    // An explicit loading error is safer than silently showing the wrong house.
    throw new Error("Gebäude " + url.split("/").pop() + " konnte nicht geladen werden. " +
      "Bitte den Editor über den lokalen Webserver öffnen und den Ordner Blender beibehalten. " +
      (error && error.message ? error.message : String(error)));
  }
}
'''


def patch_game(text: str, current: bool) -> str:
    loop = 'for(let e of t.objects??[]){if([`heart`,`crystal`,`bow`,`sword`].includes(e.kind))continue;'
    queue, collider, chunk, normalizer, stats = ('me', '_e', 'pe', 'Op', 'T') if current else ('ue', 'me', 'le', 'Jf', 'w')
    for anchor in [f'function {normalizer}(e,t,n)', f'function {queue}(e,t,n=t.position', f'function {collider}(e,t,n,i=!1)', f'{stats}={{loaded:!0,loadedGLBs:5']:
        if anchor not in text:
            raise ValueError(f'Expected runtime function missing: {anchor}')
    loader = LOADER.replace('__NORMALIZE__', normalizer).replace('__STATS__', stats)
    text = once(text, loop, loader + loop, 'World object loop')
    old = f'if({chunk}(t,n).count++,e.kind===`house`'
    new = (f'if({chunk}(t,n).count++,e.kind===`house`&&nebTavernFiles.has(a)){{'
           f'{queue}(`house:${{a}}`,e);'
           f'{collider}(e,nebTavernWalls.get(a)||[],null,!1);'
           '}else if(e.kind===`house`')
    return once(text, old, new, 'Imported tavern placement')


def syntax_check(text: str, filename: str) -> None:
    scripts = re.findall(r'<script\b([^>]*)>([\s\S]*?)</script\s*>', text, re.I)
    with tempfile.TemporaryDirectory() as directory:
        checked = 0
        for index, (attributes, source) in enumerate(scripts):
            if not source.strip() or 'application/json' in attributes:
                continue
            target = Path(directory) / f'inline-{index}.mjs'
            target.write_text(source, encoding='utf-8')
            result = subprocess.run(['node', '--check', str(target)], capture_output=True, text=True)
            if result.returncode:
                raise ValueError(f'JavaScript syntax check failed in {filename}: {result.stderr}')
            checked += 1
        if not checked:
            raise ValueError(f'No executable scripts found in {filename}')


def patch(text: str, filename: str) -> str:
    if MARKER in text:
        syntax_check(text, filename)
        return text
    for variant, _, _ in VARIANTS:
        if variant in text:
            raise ValueError(f'Partial or different tavern integration already present: {filename}')
    text = register_variants(text)
    current = filename.startswith('welt/')
    text = patch_editor(text, current) if filename.endswith('map-editor.html') else patch_game(text, current)
    text = once(text, '</head>', MARKER + '\n</head>', 'HTML completion marker')
    syntax_check(text, filename)
    for variant, label, _ in VARIANTS:
        if text.count('{id:`' + variant + '`,label:`' + label + '`}') != 1:
            raise ValueError(f'Missing or duplicate catalog entry: {filename}: {variant}')
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    pending = []
    for filename in FILES:
        path = args.root / filename
        before = path.read_text(encoding='utf-8')
        after = patch(before, filename)
        if patch(after, filename) != after:
            raise ValueError('Patch is not idempotent')
        pending.append((path, before, after))
        print(('CHANGE ' if before != after else 'UNCHANGED ') + filename)
    # Validate every file before writing any of them.
    if args.write:
        for path, before, after in pending:
            if before != after:
                path.write_text(after, encoding='utf-8')
    print('PASS: 5 bundle syntax checks; distinct catalogs; idempotent patch.')


if __name__ == '__main__':
    main()
