"""Source-preserving local preparation of the uploaded star staff and moon.

The optional game-dev CLI is unavailable. This uses the project's established
Blender helpers and records that it is not a canonical game-dev package.
Read-only plan: python3 scripts/prepare-tripo-star-moon.py --plan
Preparation: blender -b -t 3 --python scripts/prepare-tripo-star-moon.py -- --only star-staff
             blender -b -t 3 --python scripts/prepare-tripo-star-moon.py -- --only moon-crescent
Finalize only after both preparations: python3 scripts/prepare-tripo-star-moon.py --finalize
Originals and existing model outputs are never overwritten.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-star-moon'
BASE_SCRIPT = ROOT / 'scripts/prepare-tripo-weapons.py'
SPECS = [
    {'id': 'star-staff', 'source': 'arcane star staff 3d model.glb',
     'sha256': '145a934ab4dfcb477f24c3981fafc1ea12619b56d3c4f024bdfe26191790bf1e',
     'label': 'Sternstab · Tripo', 'length': 1.70, 'triangles': 12000,
     'gripHeight': .20, 'axisRange': [.10, .50], 'textureLimit': 768, 'normalLimit': 512},
    {'id': 'moon-crescent', 'source': 'crescent moon prop 3d model.glb',
     'sha256': '45d3e2ddcb987144a1faa1cf7aeea24c9f9eb94c708576feb7d9e0ddfaa79551',
     'label': 'Verzierte Mondsichel · Tripo', 'length': 1.20, 'triangles': 6000,
     'textureLimit': 512, 'normalLimit': 512},
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def inspect(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw)), path
    count, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20 + count])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(raw), 'sha256': digest(path),
            'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives),
            'vertices': sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in primitives),
            'meshes': len(doc.get('meshes', [])), 'materials': len(doc.get('materials', [])),
            'embeddedImages': sum('bufferView' in image for image in doc.get('images', [])),
            'externalUris': [item['uri'] for group in ('buffers', 'images') for item in doc.get(group, []) if 'uri' in item],
            'requiredExtensions': doc.get('extensionsRequired', []),
            'attributes': sorted({a for p in primitives for a in p['attributes']}),
            'materialChannels': [{'baseColorTexture': 'baseColorTexture' in m.get('pbrMetallicRoughness', {}),
                                  'metallicRoughnessTexture': 'metallicRoughnessTexture' in m.get('pbrMetallicRoughness', {}),
                                  'normalTexture': 'normalTexture' in m} for m in doc.get('materials', [])],
            'bounds': [{'min': doc['accessors'][p['attributes']['POSITION']].get('min'),
                        'max': doc['accessors'][p['attributes']['POSITION']].get('max')} for p in primitives]}


def sources():
    records = []
    for spec in SPECS:
        source = ROOT / 'assets/inbox' / spec['source']
        record = inspect(source)
        assert record['sha256'] == spec['sha256'], 'Source changed: ' + spec['source']
        assert not record['externalUris'] and record['meshes'] == 1
        records.append(record)
    return records


def prepare(spec):
    module = importlib.util.spec_from_file_location('existing_weapon_preparation', BASE_SCRIPT)
    base = importlib.util.module_from_spec(module); module.loader.exec_module(base)
    bpy, np = base.bpy, base.np
    source = ROOT / 'assets/inbox' / spec['source']
    original = inspect(source)
    assert original['sha256'] == spec['sha256'] and not original['externalUris']
    for folder in ('runtime', 'inspections', 'previews'):
        (OUTPUT / folder).mkdir(parents=True, exist_ok=True)
    destinations = [OUTPUT / f'runtime/{spec["id"]}.glb', OUTPUT / f'inspections/{spec["id"]}.json',
                    OUTPUT / f'previews/{spec["id"]}-source.png', OUTPUT / f'previews/{spec["id"]}-runtime.png']
    assert not any(path.exists() for path in destinations), 'Refusing to overwrite this prepared model'
    command = f'blender -b -t 3 --python scripts/prepare-tripo-star-moon.py -- --only {spec["id"]}'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    assert len(meshes) == 1
    mesh = meshes[0]; mesh.name = 'nebeljagd-tripo-' + spec['id']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if spec['id'] == 'star-staff':
        normalization = base.normalize(mesh, spec)
    else:
        vertices = base.coordinates(mesh)
        original_bounds = base.bounds(mesh)
        center = (vertices.min(axis=0) + vertices.max(axis=0)) * .5
        scale = spec['length'] / (vertices[:, 2].max() - vertices[:, 2].min())
        base.set_coordinates(mesh, (vertices - center) * scale)
        normalization = {'sourceBoundsBlender': original_bounds, 'sourceCenterGltf': base.gltf_point(center),
            'uniformScale': float(scale), 'normalizationMode': 'centered-source-axes-preserved',
            'axes': 'glTF XY silhouette plane, front +Z; centered origin; apply -PI/2 around X to lay horizontal',
            'silhouettePlane': 'XY', 'frontAxis': '+Z', 'centerPoint': [0, 0, 0],
            'nominalLengthMetres': spec['length'], 'normalizedSourceBoundsGltf': base.gltf_bounds(base.bounds(mesh))}
    base.OUTPUT = OUTPUT
    frame_bounds = base.bounds(mesh)
    print('NORMALIZED_ASSET ' + json.dumps({'id': spec['id'], **normalization}), flush=True)
    base.render(mesh, spec, 'source', frame_bounds)
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
    editable = base.bmesh.new(); editable.from_mesh(mesh.data)
    cleanup_before = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    weld = spec['length'] * .00004
    base.bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=weld)
    base.bmesh.ops.dissolve_degenerate(editable, edges=list(editable.edges), dist=weld * .1)
    cleanup_after = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    editable.to_mesh(mesh.data); editable.free(); mesh.data.update(); mesh.data.calc_loop_triangles()
    for attempt in range(3):
        triangles = len(mesh.data.loop_triangles)
        if triangles <= spec['triangles']:
            break
        modifier = mesh.modifiers.new('Bounded browser geometry', 'DECIMATE')
        modifier.ratio = min(1, (spec['triangles'] - attempt * 50) / triangles)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh.data.calc_loop_triangles()
    textures = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or not image.size[0]:
            continue
        old = list(image.size)
        limit = spec['normalLimit'] if 'normal' in image.name.lower() else spec['textureLimit']
        ratio = min(1, limit / max(old))
        if ratio < 1:
            image.scale(max(1, round(old[0] * ratio)), max(1, round(old[1] * ratio)))
        textures.append({'name': image.name, 'sourceSize': old, 'runtimeSize': list(image.size), 'limit': limit})
    vertices = base.coordinates(mesh)
    final_bounds = base.gltf_bounds(base.bounds(mesh))
    normalization.update({'gltfBounds': final_bounds, 'tipPoint': base.gltf_point(vertices[np.argmax(vertices[:, 2])]),
                          'dimensions': [final_bounds[1][i] - final_bounds[0][i] for i in range(3)]})
    destination = OUTPUT / f'runtime/{spec["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
    runtime = inspect(destination)
    checks = {'sourceUnchanged': digest(source) == spec['sha256'],
        'triangleBudgetPassed': 0 < runtime['triangles'] <= spec['triangles'],
        'fileBudgetPassed': runtime['bytes'] <= (1100 if spec['id'] == 'star-staff' else 700) * 1024,
        'preservedUVAndNormals': {'NORMAL', 'TEXCOORD_0'} <= set(runtime['attributes']),
        'preservedMaterialChannels': runtime['materialChannels'] == original['materialChannels'],
        'preservedEmbeddedImages': runtime['embeddedImages'] == original['embeddedImages'],
        'embeddedOnly': not runtime['externalUris'], 'noDecoderDependencies': not runtime['requiredExtensions'],
        'textureBudgetPassed': all(max(t['runtimeSize']) <= t['limit'] for t in textures)}
    report = {'id': spec['id'], 'label': spec['label'], 'source': original, 'runtime': runtime,
              'normalization': normalization, 'textures': textures,
              'cleanup': {'weldDistanceMetres': weld, 'before': cleanup_before, 'after': cleanup_after},
              'policy': spec, 'validation': checks, 'command': command, 'blenderVersion': bpy.app.version_string}
    write_json(OUTPUT / f'inspections/{spec["id"]}.json', report)
    assert all(checks.values()), checks
    base.render(mesh, spec, 'runtime', frame_bounds)
    print('PREPARED_ASSET ' + json.dumps({'id': spec['id'], 'runtime': runtime, 'normalization': normalization, 'validation': checks}), flush=True)


def bake_moon_normals():
    """Preserve the original sculpt's smooth metal and engraving at 6000 tris.

    This prepares a verified candidate outside the package before replacing
    only this task's unfinished moon derivative. Never touches either source.
    """
    module = importlib.util.spec_from_file_location('existing_weapon_preparation', BASE_SCRIPT)
    base = importlib.util.module_from_spec(module); module.loader.exec_module(base)
    bpy = base.bpy
    spec = next(s for s in SPECS if s['id'] == 'moon-crescent')
    report_path = OUTPUT / 'inspections/moon-crescent.json'
    report = json.loads(report_path.read_text())
    destination = OUTPUT / 'runtime/moon-crescent.glb'
    assert digest(destination) == report['runtime']['sha256'], 'Refusing a different moon derivative'
    assert not report.get('normalBake'), 'Moon sculpt normals already prepared'
    source = ROOT / 'assets/inbox' / spec['source']
    assert digest(source) == spec['sha256']
    scratch = ROOT / 'test-results/tripo-star-moon-normal-bake'
    (scratch / 'previews').mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    high = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    bpy.context.view_layer.objects.active = high; high.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vertices = base.coordinates(high)
    center = (vertices.min(axis=0) + vertices.max(axis=0)) * .5
    scale = spec['length'] / (vertices[:, 2].max() - vertices[:, 2].min())
    base.set_coordinates(high, (vertices - center) * scale)
    high.name = 'Unmodified source sculpt normal donor'
    bpy.ops.import_scene.gltf(filepath=str(destination))
    low = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o != high)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 1
    image = bpy.data.images.new('crescent-moon-preserved-sculpt-normal', width=512, height=512, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    material = low.data.materials[0]
    node = material.node_tree.nodes.new('ShaderNodeTexImage'); node.image = image
    material.node_tree.nodes.active = node
    high.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, use_clear=True,
                        cage_extrusion=.03, max_ray_distance=.10, normal_space='TANGENT', margin=4)
    for normal in material.node_tree.nodes:
        if normal.type == 'NORMAL_MAP':
            material.node_tree.links.new(node.outputs['Color'], normal.inputs['Color'])
    image.file_format = 'PNG'; image.pack(); high.hide_render = True
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
    candidate = scratch / 'moon-crescent.glb'
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format='GLB', use_selection=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
    runtime = inspect(candidate)
    assert 0 < runtime['triangles'] <= spec['triangles'] and runtime['bytes'] <= 700 * 1024
    assert runtime['embeddedImages'] == report['source']['embeddedImages'] == 3
    assert runtime['materialChannels'] == report['source']['materialChannels']
    assert not runtime['externalUris'] and not runtime['requiredExtensions']
    assert {'NORMAL', 'TEXCOORD_0'} <= set(runtime['attributes'])
    assert digest(source) == spec['sha256']
    base.OUTPUT = scratch; base.render(low, spec, 'runtime', base.bounds(low))
    shutil.copyfile(candidate, destination)
    shutil.copyfile(scratch / 'previews/moon-crescent-runtime.png', OUTPUT / 'previews/moon-crescent-runtime.png')
    runtime['path'] = str(destination.relative_to(ROOT)); report['runtime'] = runtime
    report['policy'] = spec
    for texture in report['textures']:
        if 'normal' in texture['name'].lower():
            texture.update(runtimeSize=[512, 512], limit=512,
                           method='Tangent-normal bake from original source sculpt and its original normal map')
    report['normalBake'] = {'sourceSha256': spec['sha256'], 'normalSpace': 'TANGENT', 'resolution': [512, 512],
                           'cageExtrusionMetres': .03, 'maxRayDistanceMetres': .10, 'paddingPixels': 4,
                           'method': 'Cycles selected original sculpt to active simplified mesh; source materials retained',
                           'command': 'blender -b -t 3 --python scripts/prepare-tripo-star-moon.py -- --bake-moon'}
    write_json(report_path, report)
    print('MOON_SCULPT_NORMALS_READY ' + json.dumps({'runtime': runtime, 'normalBake': report['normalBake']}), flush=True)


def finalize():
    from PIL import Image, ImageDraw
    original_sources = sources()
    reports = [json.loads((OUTPUT / f'inspections/{s["id"]}.json').read_text()) for s in SPECS]
    assert all(all(report['validation'].values()) for report in reports)
    assert not (OUTPUT / 'runtime-manifest.json').exists(), 'Refusing to overwrite a finalized package'
    board = Image.new('RGB', (1280, 1400), (30, 36, 45)); draw = ImageDraw.Draw(board)
    for row, spec in enumerate(SPECS):
        for col, stage in enumerate(('source', 'runtime')):
            image = Image.open(OUTPUT / f'previews/{spec["id"]}-{stage}.png').convert('RGBA')
            board.paste(image, (col * 640, row * 700 + 48), image)
            draw.text((col * 640 + 18, row * 700 + 15), spec['label'] + ' / ' + stage, fill=(235, 240, 245))
        image = Image.open(OUTPUT / f'previews/{spec["id"]}-runtime.png').convert('RGBA')
        thumb = Image.new('RGBA', (256, 192), (0, 0, 0, 0))
        thumb.paste(image.resize((192, 192), Image.Resampling.LANCZOS), (32, 0))
        thumb.save(OUTPUT / f'previews/{spec["id"]}.webp', format='WEBP', quality=92, method=6)
    board.save(OUTPUT / 'previews/comparison.png')
    write_json(OUTPUT / 'inspection.json', {'assets': reports})
    provenance = {'package': 'nebeljagd-tripo-star-moon', 'version': 1,
        'canonicalGameDevPackage': False, 'pipeline': 'Existing local Blender pipeline; optional game-dev CLI unavailable.',
        'sourceOrigin': 'User supplied Tripo originals and explicitly requested this project integration.',
        'provider': {'name': 'Tripo (original user files)', 'invokedByThisTask': False,
                     'jobId': None, 'originalPrompt': None, 'commercialLicenseReceipt': None},
        'preparation': {'script': str(Path(__file__).relative_to(ROOT)), 'scriptSha256': digest(Path(__file__)),
                        'helper': str(BASE_SCRIPT.relative_to(ROOT)), 'helperSha256': digest(BASE_SCRIPT)},
        'licenseStatus': 'User-provided project assets; no new license accepted or independent commercial rights certification.',
        'evidenceBoundary': 'Source/output hashes, static inspection and actual Blender PBR renders. Game/WebGL and artistic approval assessed separately.'}
    write_json(OUTPUT / 'provenance.json', provenance)
    (OUTPUT / 'README.md').write_text('# Sternstab und verzierte Mondsichel\n\n'
        'Getrennte Browser-Ableitungen der vom Benutzer bereitgestellten Tripo-Modelle. '
        'Originale in assets/inbox bleiben bytegleich erhalten. Kein Anbieteraufruf.\n\n'
        'Sternstab: physischer Griff bei (0,0,0), glTF +Y zur Spitze, Länge 1,70 m. '
        'Die genaue Spitze und Grenzen stehen in inspections/star-staff.json.\n\n'
        'Mondsichel: Mittelpunkt bei (0,0,0), ursprüngliche glTF XY-Silhouette, Vorderseite +Z, '
        'Höhe 1,20 m. Für die horizontale Rückkehrflugbahn um -PI/2 auf X drehen und um die lokale Z-Achse rotieren.\n\n'
        'Originale UVs und drei Texturkanäle bleiben erhalten. Sternstab maximal 12000 Dreiecke, '
        '768 px Farbe/Material und 512 px Normal; Sichel maximal 6000 Dreiecke, '
        '512 px Farbe/Material und Normal. Die Sichel-Normalmap wird vom unveränderten Originalskulpt '
        'auf die vereinfachte Geometrie gebacken, damit glattes Metall und Gravuren erhalten bleiben. '
        'previews/ zeigt Originalgeometrie und Ableitung '
        'mit identischer Kamera und Beleuchtung.\n\n'
        'Reproduktion: siehe scripts/prepare-tripo-star-moon.py. Bestehende Modelloutputs werden abgelehnt. '
        'Kein kanonisches game-dev-Paket: die optionale CLI ist nicht installiert. '
        'Die Einbindung verwendet den bestehenden Projektworkflow.\n')
    files = [{'path': str(p.relative_to(OUTPUT)), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(OUTPUT.rglob('*')) if p.is_file()]
    manifest = {'name': 'nebeljagd-tripo-star-moon', 'version': 1, 'kind': 'source-preserving-local-project-package',
                'canonicalGameDevPackage': False, 'sources': [{'path': s['path'], 'sha256': s['sha256']} for s in original_sources],
                'files': files, 'validation': {'sourceUnchanged': True, 'staticPoliciesPassed': True,
                    'combinedRuntimeBudgetPassed': sum(r['runtime']['bytes'] for r in reports) <= 1800 * 1024},
                'licenseStatus': provenance['licenseStatus']}
    assert all(manifest['validation'].values())
    write_json(OUTPUT / 'runtime-manifest.json', manifest)
    for entry in manifest['files']:
        path = OUTPUT / entry['path']; assert path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256']
    print(json.dumps({'status': 'verified', 'package': str(OUTPUT), 'runtimeBytes': sum(r['runtime']['bytes'] for r in reports),
                      'manifestSha256': digest(OUTPUT / 'runtime-manifest.json'), 'files': len(files)}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--plan', action='store_true')
    parser.add_argument('--only', choices=[s['id'] for s in SPECS]); parser.add_argument('--finalize', action='store_true')
    parser.add_argument('--bake-moon', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if args.only:
        prepare(next(s for s in SPECS if s['id'] == args.only))
        if args.only == 'moon-crescent':
            bake_moon_normals()
    elif args.bake_moon:
        bake_moon_normals()
    elif args.finalize:
        finalize()
    else:
        print(json.dumps({'sources': sources(), 'destination': str(OUTPUT), 'specifications': SPECS,
                          'providerInvoked': False, 'sourceWrites': False, 'canonicalGameDevPackage': False}, indent=2))
