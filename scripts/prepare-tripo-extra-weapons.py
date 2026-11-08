"""Reviewable local preparation of Giftstab, Mondstab and the uploaded bow.

Read-only plan: python3 scripts/prepare-tripo-extra-weapons.py --plan
After exact invocation authorization only:
  blender -b -t 3 --python scripts/prepare-tripo-extra-weapons.py -- --execute

This uses the established project Blender pipeline. It is NOT a canonical
game-dev package and makes no provider call or commercial-license claim.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import struct
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-extra-weapons'
BASE_SCRIPT = ROOT / 'scripts/prepare-tripo-weapons.py'
COMMAND = 'blender -b -t 3 --python scripts/prepare-tripo-extra-weapons.py -- --execute'
SPECS = [
    {'id': 'poison-staff', 'source': 'Poison staff 3d model.glb',
     'sha256': '54bf2419f40955b396c86f27385e2df648997f56696c04a28feb2fcbbc944326',
     'label': 'Giftstab · Tripo', 'length': 1.70, 'triangles': 12000,
     'gripHeight': .20, 'axisRange': [.10, .50]},
    {'id': 'moon-staff', 'source': 'Moon staff 3d model.glb',
     'sha256': '208c0124ee05518b8bf7f8b46f300ed203135b01a0b091ee3e0a6099c1c68ca1',
     'label': 'Mondstab · Tripo', 'length': 1.70, 'triangles': 12000,
     'gripHeight': .20, 'axisRange': [.10, .50]},
    {'id': 'ornate-bow', 'source': 'ornate bow 3d model.glb',
     'sha256': '61848a77f3b07e88abf42b405f258afa52dc07abf3d73863651d74b17ac0f864',
     'label': 'Verzierter Bogen · Tripo', 'length': 1.35, 'triangles': 12000,
     'normalizationMode': 'source-axis-preserving-bow-grip',
     # Measured from the pinned source's central-height body band, excluding
     # its separate string at source X~+.083. Do not fit a straight staff shaft
     # through the curved bow limbs or place its grip near the lower limb.
     'sourceGripPointGltf': [-.029708851128816605, .48931884765625, .0010700225830078125],
     'sourceStringMidpointGltf': [.08177568018436432, .48931884765625, .0008416073396801949],
     'sourceStringLowerGltf': [.08177568018436432, .014068603515625, .0008416073396801949],
     'sourceStringUpperGltf': [.08177568018436432, .96240234375, .0008416073396801949],
     # Maximum central free-string radial extent plus5% allowance, measured
     # from pinned source positions; not a guessed limb/string replacement.
     'sourceStringRadius': .010189794935286045 * 1.05,
     'drawDistanceMetres': .28},
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def preflight():
    """Read originals only; fail before creating any asset output."""
    if not OUTPUT.parent.resolve().is_relative_to(ROOT):
        raise ValueError('Output parent must remain inside the project.')
    sources = []
    for spec in SPECS:
        path = ROOT / 'assets/inbox' / spec['source']
        if not path.resolve().is_relative_to(ROOT / 'assets/inbox'):
            raise ValueError('Source must remain inside assets/inbox.')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != spec['sha256']:
            raise ValueError(f'Source checksum changed; inspect and obtain new invocation authorization: {path}')
        if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2 or struct.unpack_from('<I', raw, 8)[0] != len(raw):
            raise ValueError(f'Expected complete binary glTF 2: {path}')
        if raw[16:20] != b'JSON':
            raise ValueError(f'Expected GLB JSON chunk: {path}')
        doc = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
        if any('uri' in item for group in ('buffers', 'images') for item in doc.get(group, [])):
            raise ValueError(f'Original is not self-contained: {path}')
        primitives = [p for mesh in doc.get('meshes', []) for p in mesh.get('primitives', [])]
        if len(doc.get('meshes', [])) != 1 or not primitives:
            raise ValueError(f'Expected the inspected single-mesh original: {path}')
        sources.append({'path': str(path.relative_to(ROOT)), 'sha256': spec['sha256'],
                        'bytes': len(raw), 'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives)})
    return sources


def plan(sources):
    return {'kind': 'unexecuted-source-preserving-local-import-plan',
            'workingDirectory': str(ROOT), 'exactCommand': COMMAND,
            'sources': sources, 'destination': str(OUTPUT),
            'destinationAlreadyExists': OUTPUT.exists(),
            'collisionPolicy': 'Refuse any existing destination, including an empty or partial prior run. Never overwrite originals or existing weapons.',
            'outputs': ['runtime/poison-staff.glb', 'runtime/moon-staff.glb', 'runtime/ornate-bow.glb',
                        'inspections/*.json', 'previews/*-source.png', 'previews/*-runtime.png',
                        'previews/*.webp', 'previews/comparison.png', 'previews/review.html',
                        'inspection.json', 'provenance.json', 'README.md',
                        'execution-receipt.json', 'runtime-manifest.json'],
            'policy': {'nominalLengthMetres': {spec['id']: spec['length'] for spec in SPECS}, 'trianglesPerAsset': 12000,
                       'textureLimit': 1024, 'normalMapLimit': 768,
                       'fileLimitBytesPerAsset': 1536 * 1024},
            'normalizationContracts': {
                'staffs': 'Existing measured lower-shaft axis fit; physical grip at origin; glTF +Y toward tip.',
                'ornate-bow': 'Preserve original glTF axes and curved shape; translate measured middle body grip to origin, excluding string from grip measurement; uniform 1.35m tip-to-tip scale; +X points from grip toward string. Record measured string segment/radius and require positive string-interior vertex count in the exported GLB. No staff-axis fit, remesh, string deletion or replacement textures.'},
            'pipeline': 'Existing project Blender fallback via prepare-tripo-weapons.py; game-dev CLI unavailable. Not a canonical game-dev package or vendoring receipt.',
            'pending': ['Exact invocation authorization', 'Blender normalization and actual preview renders',
                        'Output static validation', 'Editor/game integration and GPU tests', 'Human visual approval']}


def snapshot(paths):
    return {str(path.relative_to(ROOT)): digest(path) for path in paths if path.is_file()}


def make_previews():
    # Deliberately writes only inside the new destination, never assets/catalog.
    code = r'''
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(sys.argv[1]);specs=json.loads(sys.argv[2])
board=Image.new('RGB',(1280,len(specs)*690),(30,36,45));draw=ImageDraw.Draw(board)
for row,spec in enumerate(specs):
 for col,stage in enumerate(['source','runtime']):
  image=Image.open(out/'previews'/f'{spec["id"]}-{stage}.png').convert('RGBA')
  board.paste(image,(col*640,row*690+40),image)
  draw.text((col*640+16,row*690+12),spec['label']+' / '+stage,fill=(235,240,245))
 runtime=Image.open(out/'previews'/f'{spec["id"]}-runtime.png').convert('RGBA')
 thumb=Image.new('RGBA',(256,192),(0,0,0,0))
 thumb.paste(runtime.resize((192,192),Image.Resampling.LANCZOS),(32,0))
 thumb.save(out/'previews'/f'{spec["id"]}.webp',format='WEBP',quality=92,method=6)
board.save(out/'previews/comparison.png')
'''
    subprocess.run(['python3', '-c', code, str(OUTPUT), json.dumps(SPECS)], check=True)
    (OUTPUT / 'previews/review.html').write_text(
        '<!doctype html><html lang="de"><meta charset="utf-8"><title>Zwei Stäbe und verzierter Bogen</title>'
        '<style>body{background:#1e242d;color:#eef;font:16px system-ui;padding:24px}img{max-width:100%}</style>'
        '<h1>Zwei Stäbe und verzierter Bogen: Original / Browsermodell</h1><p>Identische Kamera und Beleuchtung. '
        'Originale unverändert; GPU-Import und menschliche Sichtprüfung stehen separat aus.</p>'
        '<img src="comparison.png" alt="Drei Waffen, Original links und Browsermodell rechts"></html>')


def normalize_bow(base, mesh, spec):
    """Preserve the curved source; its grip is midway up the bow, not at20%."""
    vertices = base.coordinates(mesh)
    source_bounds = base.bounds(mesh)
    source_grip = spec['sourceGripPointGltf']
    # The GLB importer maps glTF (X,Y,Z) to Blender (X,-Z,Y).
    grip = base.np.array([source_grip[0], -source_grip[2], source_grip[1]])
    span = float(vertices[:, 2].max() - vertices[:, 2].min())
    if not span > 0:
        raise ValueError('Bow source has no vertical extent.')
    scale = spec['length'] / span
    base.set_coordinates(mesh, (vertices - grip) * scale)
    string_midpoint = [(spec['sourceStringMidpointGltf'][i] - source_grip[i]) * scale for i in range(3)]
    normalized_point = lambda point: [(point[i] - source_grip[i]) * scale for i in range(3)]
    bow_rig = {'stringLower': normalized_point(spec['sourceStringLowerGltf']),
               'stringUpper': normalized_point(spec['sourceStringUpperGltf']),
               'stringRadiusMetres': spec['sourceStringRadius'] * scale,
               'drawDistanceMetres': spec['drawDistanceMetres'],
               'drawAxis': '+X', 'stringRemainsInOriginalMesh': True,
               'evidence': 'Measured pinned source free-string component; output vertex mask is validated separately. GPU animation review pending.'}
    return {'sourceBoundsBlender': source_bounds,
            'sourceGripPointGltf': source_grip, 'sourceLongitudinalAxisGltf': [0, 1, 0],
            'normalizingRotationQuaternionBlenderWxyz': [1, 0, 0, 0], 'uniformScale': scale,
            'normalizationMode': spec['normalizationMode'],
            'axes': 'glTF +Y lower-to-upper limb; +X from grip toward original string; source front+Z preserved',
            'gripPoint': [0, 0, 0], 'nominalLengthMetres': spec['length'],
            'stringMidpoint': string_midpoint,
            'bowRig': bow_rig,
            'stringRemainsInOriginalMesh': True,
            'normalizedSourceBoundsGltf': base.gltf_bounds(base.bounds(mesh))}


def validate_exported_bow_rig(base, path, rig):
    """Read actual exported positions; do not claim GPU animation from a receipt."""
    raw = path.read_bytes()
    json_length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + json_length])
    binary_offset = 20 + json_length + 8
    lower = base.np.asarray(rig['stringLower'])
    upper = base.np.asarray(rig['stringUpper'])
    direction = upper - lower
    length_squared = float(direction @ direction)
    if length_squared <= 0:
        raise ValueError('Bow string segment is degenerate.')
    selected = interior = 0
    for mesh in doc.get('meshes', []):
        for primitive in mesh.get('primitives', []):
            accessor = doc['accessors'][primitive['attributes']['POSITION']]
            view = doc['bufferViews'][accessor['bufferView']]
            if accessor['componentType'] != 5126 or accessor['type'] != 'VEC3':
                raise ValueError('Bow positions must be exported as float32 VEC3.')
            offset = binary_offset + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
            vertices = base.np.ndarray((accessor['count'], 3), dtype='<f4', buffer=raw,
                                       offset=offset, strides=(view.get('byteStride', 12), 4))
            t = ((vertices - lower) @ direction) / length_squared
            projection = lower + t[:, None] * direction
            near = base.np.linalg.norm(vertices - projection, axis=1) <= rig['stringRadiusMetres']
            selected += int(base.np.count_nonzero(near & (t >= 0) & (t <= 1)))
            interior += int(base.np.count_nonzero(near & (t > .05) & (t < .95)))
    if selected <= 0 or interior <= 0:
        raise ValueError('Exported bow lost the measured string geometry needed by its runtime rig.')
    return {'selectedVertices': selected, 'interiorVertices': interior,
            'passed': True, 'scope': 'Static exported GLB positions only; held animation/GPU still pending.'}


def execute(sources):
    if OUTPUT.exists():
        raise FileExistsError(f'Destination already exists; refusing overwrite: {OUTPUT}')
    # Importing the existing helper is side-effect-free; its main guard is not run.
    module_spec = importlib.util.spec_from_file_location('nebeljagd_original_weapon_preparation', BASE_SCRIPT)
    base = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(base)
    protected = list((ROOT / 'assets/imported/tripo-weapons').rglob('*'))
    protected += [ROOT / 'assets/inbox' / item['source'] for item in base.SPECS]
    protected += [ROOT / 'assets/catalog' / item['thumbnail'] for item in base.SPECS]
    before = snapshot(protected)
    OUTPUT.mkdir(exist_ok=False)
    for folder in ('runtime', 'inspections', 'previews'):
        (OUTPUT / folder).mkdir()
    receipt = {'command': COMMAND, 'sources': sources, 'destination': str(OUTPUT), 'status': 'running',
               'providerInvoked': False, 'canonicalGameDevPackage': False}
    write_json(OUTPUT / 'execution-receipt.json', receipt)
    base.OUTPUT = OUTPUT
    original_normalize = base.normalize
    base.normalize = lambda mesh, spec: normalize_bow(base, mesh, spec) if spec.get('normalizationMode') == 'source-axis-preserving-bow-grip' else original_normalize(mesh, spec)
    try:
        reports = []
        for spec in SPECS:
            base.prepare(spec)
            report = json.loads((OUTPUT / f'inspections/{spec["id"]}.json').read_text())
            if spec['id'] == 'ornate-bow':
                rig_report = validate_exported_bow_rig(base, OUTPUT / 'runtime/ornate-bow.glb', report['normalization']['bowRig'])
                report['normalization']['bowRig']['staticVertexValidation'] = rig_report
                report['validation']['bowStringRigHasVertices'] = rig_report['passed']
                write_json(OUTPUT / 'inspections/ornate-bow.json', report)
            if report['source']['sha256'] != spec['sha256'] or report['runtime']['triangles'] > 12000:
                raise ValueError(f'Exact source/triangle policy failed: {spec["id"]}')
            if not all(report['validation'].values()):
                raise ValueError(f'Static validation failed: {spec["id"]}')
            if any(max(image['runtimeSize']) > (768 if 'normal' in image['name'].lower() else 1024) for image in report['textures']):
                raise ValueError(f'Texture channel budget failed: {spec["id"]}')
            reports.append(report)
        make_previews()
        if snapshot(protected) != before or preflight() != sources:
            raise ValueError('An original or pre-existing weapon asset changed.')
        write_json(OUTPUT / 'inspection.json', {'assets': reports})
        write_json(OUTPUT / 'provenance.json', {
            'package': 'nebeljagd-tripo-extra-weapons', 'version': 1,
            'kind': 'source-preserving-local-test-package', 'canonicalGameDevPackage': False,
            'pipeline': 'Established project Blender fallback; game-dev CLI unavailable.',
            'provider': {'name': 'Tripo original user uploads', 'invokedByThisTask': False,
                         'jobId': None, 'originalPrompt': None, 'commercialLicenseReceipt': None},
            'preparation': {'command': COMMAND, 'tool': 'Blender ' + base.bpy.app.version_string,
                            'scriptSha256': digest(Path(__file__)), 'reusedScriptSha256': digest(BASE_SCRIPT)},
            'assets': [{'id': report['id'], 'source': report['source'], 'runtime': report['runtime']} for report in reports],
            'licenseStatus': 'User-provided project files; no new license accepted and no commercial receipt inferred.',
            'evidenceBoundary': 'Static output inspection and Blender PBR previews only. GPU/gameplay and human review remain pending.'})
        (OUTPUT / 'README.md').write_text(
            '# Giftstab, Mondstab und verzierter Bogen – lokale Browser-Ableitungen\n\n'
            'Die gepinnten Originale in assets/inbox bleiben unverändert. '
            'Stäbe1,70m, Bogen1,35m Spitze zu Spitze; Griffursprung(0,0,0). '
            'Stäbe: glTF+Y zur Spitze. Bogen: ursprüngliche gekrümmte Form/Quellachsen bleiben erhalten; '
            '+Y vom unteren zum oberen Wurfarm,+X vom Griff zur Sehne. Sein gemessener mittlerer Griff '
            'wird separat zentriert, ohne Stab-Achsenfit. Die Originalsehne bleibt im Modell; '
            'Sehnenanimation und Pfeilausrichtung werden bei der Runtime-Integration separat geprüft. '
            'Je höchstens 12.000 Dreiecke und 1,5 MiB, Farb-/Materialtexturen 1024 px, Normal-Map 768 px.\n\n'
            'Etablierter Blender-Projektablauf; kein kanonisches game-dev-Paket und kein Vendoring-Beleg. '
            'Keine Anbieteraufrufe oder erfundenen Lizenzbelege. Originalprompts nicht mitgeliefert.\n\n'
            'Editor-/Spiel-Integration, gehaltene Ausrichtung, Gameplay, WebGL und menschliche Sichtprüfung stehen aus. '
            'Die Vorschaubilder und WebP-Dateien liegen nur hier im neuen Verzeichnis.\n')
        receipt['status'] = 'static-validation-and-previews-complete'
        receipt['existingWeaponAssetsUnchanged'] = True
        receipt['gpuImportPassed'] = None
        write_json(OUTPUT / 'execution-receipt.json', receipt)
        files = [{'path': str(path.relative_to(OUTPUT)), 'bytes': path.stat().st_size, 'sha256': digest(path)}
                 for path in sorted(OUTPUT.rglob('*')) if path.is_file() and path.name != 'runtime-manifest.json']
        write_json(OUTPUT / 'runtime-manifest.json', {
            'name': 'nebeljagd-tripo-extra-weapons', 'version': 1, 'kind': 'source-preserving-local-test-package',
            'canonicalGameDevPackage': False, 'files': files, 'sources': sources,
            'validation': {'sourcesUnchanged': True, 'existingWeaponAssetsUnchanged': True,
                           'allStaticPoliciesPassed': True},
            'pending': ['Editor/game admission and GPU import', 'Equipment/grip alignment', 'Gameplay policy', 'Human visual approval']})
        print(json.dumps(receipt, ensure_ascii=False), flush=True)
    except Exception as error:
        receipt.update(status='failed-partial-output-retained', error=str(error),
                       existingWeaponAssetsUnchanged=snapshot(protected) == before)
        write_json(OUTPUT / 'execution-receipt.json', receipt)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group()
    choice.add_argument('--plan', action='store_true', help='Print source-checked plan; write no asset outputs (default).')
    choice.add_argument('--execute', action='store_true', help='Execute only after the exact invocation was authorized.')
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    args = parser.parse_args(arguments)
    sources = preflight()
    if args.execute:
        execute(sources)
    else:
        print(json.dumps(plan(sources), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
