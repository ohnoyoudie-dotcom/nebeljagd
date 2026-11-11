"""Prepare the six uploaded stumps, logs and crates; never modify the inbox.

Run: blender -b -t 3 --python scripts/prepare-tripo-woodland.py
Reuses the project's measured, UV-preserving prop preparation pipeline.
"""
import importlib.util
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
helper_path = ROOT / 'scripts/prepare-tripo-props.py'
module_spec = importlib.util.spec_from_file_location('prop_preparation', helper_path)
props = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(props)
OUTPUT = ROOT / 'assets/imported/tripo-woodland'
SPECS = [
    {'id': 'stump-01', 'source': 'tree stump 3d model.glb', 'axis': 2, 'size': .8, 'triangles': 8000, 'label': 'Baumstumpf 1'},
    {'id': 'stump-02', 'source': 'tree stump 3d model (1).glb', 'axis': 2, 'size': 1.05, 'triangles': 8000, 'label': 'Baumstumpf 2'},
    {'id': 'log-01', 'source': 'wood log 3d model.glb', 'axis': 1, 'size': 3.2, 'triangles': 8000, 'label': 'Liegender Stamm 1'},
    {'id': 'log-02', 'source': 'wooden log 3d model.glb', 'axis': 1, 'size': 3.0, 'triangles': 8000, 'label': 'Liegender Stamm 2'},
    {'id': 'crate-01', 'source': 'wooden crate 3d model.glb', 'axis': 0, 'size': 1.15, 'triangles': 6000, 'label': 'Holzkiste 1'},
    {'id': 'crate-02', 'source': 'wooden crate 3d model (1).glb', 'axis': 0, 'size': 1.4, 'triangles': 6000, 'label': 'Holzkiste 2'},
]


def compact_model(spec):
    """Repack embedded textures; retain all geometry/accessor bytes exactly."""
    path = OUTPUT / f'runtime/{spec["id"]}.glb'
    report_path = OUTPUT / f'inspections/{spec["id"]}.json'
    report = json.loads(report_path.read_text())
    assert props.digest(ROOT / report['source']['path']) == report['source']['sha256']
    assert props.digest(path) == report['runtime']['sha256']
    raw = path.read_bytes()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + json_size])
    binary = raw[28 + json_size:]
    images = {image['bufferView']: image for image in document['images']}
    source_raw = (ROOT / report['source']['path']).read_bytes()
    source_json_size = struct.unpack_from('<I', source_raw, 12)[0]
    source_document = json.loads(source_raw[20:20 + source_json_size])
    source_binary = source_raw[28 + source_json_size:]
    source_images = {}
    for image in source_document['images']:
        view = source_document['bufferViews'][image['bufferView']]
        source_images[Path(image['name']).stem] = source_binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    texture_sizes = {}
    chunks, offset = [], 0
    for index, view in enumerate(document['bufferViews']):
        data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        if index in images:
            name = Path(images[index].get('name', f'image-{index}')).stem
            image = Image.open(io.BytesIO(source_images[name])).convert('RGB')
            # No alpha channels in these six opaque props. Keep normal-map RGB
            # channels independent (4:4:4 JPEG), retaining authored surface maps.
            limit = 384 if 'basecolor' in name else 256 if 'normal' in name else 128
            image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, format='JPEG', quality=85, subsampling=0, optimize=True)
            data = encoded.getvalue()
            texture_sizes[name] = list(image.size)
            images[index]['mimeType'] = 'image/jpeg'
            images[index]['name'] = Path(images[index].get('name', f'image-{index}')).stem + '.jpg'
        view['byteOffset'], view['byteLength'] = offset, len(data)
        padded = data + b'\0' * (-len(data) % 4)
        chunks.append(padded)
        offset += len(padded)
    document['buffers'][0]['byteLength'] = offset
    encoded = json.dumps(document, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    payload = b''.join(chunks)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(payload))
                     + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
                     + struct.pack('<II', len(payload), 0x004e4942) + payload)
    report['runtime'] = props.inspect(path)
    report['policy'].update(textureLimit=384, fileLimitBytes=1024 * 1024)
    report['textureEncoding'] = 'Original-source resampling: colour 384px, normals 256px, roughness/metalness 128px; JPEG quality 85, 4:4:4 channels; no external decoder'
    for image in report['textures']:
        image['runtimeSize'] = texture_sizes[Path(image['name']).stem]
        image['format'] = 'JPEG'
    report['validation']['fileBudgetPassed'] = path.stat().st_size < 1024 * 1024
    assert all(report['validation'].values())
    report_path.write_text(json.dumps(report, indent=2) + '\n')
    # The final comparison picture must show the compressed browser textures.
    props.bpy.ops.wm.read_factory_settings(use_empty=True)
    props.bpy.ops.import_scene.gltf(filepath=str(path))
    mesh = next(obj for obj in props.bpy.context.scene.objects if obj.type == 'MESH')
    props.bpy.context.view_layer.objects.active = mesh
    props.bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    props.render(mesh, spec['id'], 'runtime')


def main():
    props.OUTPUT = OUTPUT
    for path in ['runtime', 'previews', 'inspections']:
        (OUTPUT / path).mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        if '--reuse-geometry' not in sys.argv:
            props.prepare(spec)
        compact_model(spec)
    reports = [json.loads((OUTPUT / f'inspections/{s["id"]}.json').read_text()) for s in SPECS]
    provenance = {
        'name': 'nebeljagd-tripo-woodland', 'version': 1,
        'sourceOrigin': 'Six user-provided project uploads; editor/game integration explicitly requested.',
        'providerInvoked': False,
        'preparation': {'command': 'blender -b -t 3 --python scripts/prepare-tripo-woodland.py',
                        'blender': props.bpy.app.version_string,
                        'scripts': {str(p.relative_to(ROOT)): props.digest(p) for p in [Path(__file__), helper_path]},
                        'method': 'Uniform metric scaling, centering and grounding; UV-preserving cleanup and decimation; original embedded PBR textures resampled to colour 384px, normals 256px, roughness/metalness 128px; JPEG quality 85 with 4:4:4 channels. Source orientation retained, logs lie along Z.'},
        'assets': [{'id': r['id'], 'source': r['source'], 'runtime': r['runtime']} for r in reports],
    }
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (OUTPUT / 'inspection.json').write_text(json.dumps({'assets': reports}, indent=2) + '\n')
    readme = '''# Baumstümpfe, liegende Stämme und Holzkisten

Die sechs Originale in `assets/inbox/` bleiben unverändert. `runtime/` enthält
separate Browser-GLBs in Metern, mit +Y oben, horizontal zentriert und auf Y=0.
Die liegenden Stämme behalten ihre ursprüngliche Ausrichtung entlang Z.
Originale Materialien, UVs und eingebettete PBR-Texturen bleiben erhalten;
Farbtexturen werden auf 384 Pixel, Normalen auf 256 Pixel und Rauheit/Metall
auf 128 Pixel reduziert (JPEG, Qualität 85, volle Farbkanäle). Geometrie wird
auf 6–8k Dreiecke reduziert. So bleiben die eigenständigen
HTML-Dateien und das Offline-ZIP unter GitHubs Dateigrößengrenze.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-woodland.py`.
Die Aufbereitung verwendet `scripts/prepare-tripo-props.py` als gemeinsame Basis.
`inspections/` dokumentiert Maße, Budgets und SHA-256-Werte. `previews/` zeigt
Original und Browserkopie mit gleicher Kamera und Beleuchtung.
Die Editor-Vorschauen werden separat aus den tatsächlichen Spielmodellen erzeugt.

Vom Projektinhaber bereitgestellte Modelle, Einbau ausdrücklich beauftragt.
Kein Anbieteraufruf. Ein separater kommerzieller Lizenzbeleg liegt nicht bei.
Dies ist das bestehende lokale Projektformat, kein Game-Dev-CLI-Paket.

| Modell | Originaldatei | Maße B × H × T (m) | Dreiecke | GLB (kB) |
| --- | --- | --- | ---: | ---: |
'''
    for spec, report in zip(SPECS, reports):
        dimensions = ' × '.join(f'{v:.2f}' for v in report['normalization']['dimensions'])
        readme += f'| {spec["label"]} | {spec["source"]} | {dimensions} | {report["runtime"]["triangles"]} | {report["runtime"]["bytes"] / 1000:.0f} |\n'
    (OUTPUT / 'README.md').write_text(readme)
    files = [{'path': str(p.relative_to(OUTPUT)), 'bytes': p.stat().st_size, 'sha256': props.digest(p)}
             for p in sorted(OUTPUT.rglob('*')) if p.is_file() and p.name != 'runtime-manifest.json']
    manifest = {'name': provenance['name'], 'version': 1, 'files': files,
                'sources': [{'path': r['source']['path'], 'sha256': r['source']['sha256']} for r in reports],
                'validation': {'sourceUnchanged': all(r['validation']['sourceUnchanged'] for r in reports),
                               'allStaticPoliciesPassed': all(all(r['validation'].values()) for r in reports)},
                'licenseStatus': 'User-provided project assets; separate commercial provider receipt not supplied.'}
    (OUTPUT / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
