"""Prepare user-supplied Tripo props without changing original uploads.

Run: blender -b -t 3 --python scripts/prepare-tripo-props.py
Optional: ... -- --only wagon  (also barrel, well, rock-01, rock-02, rock-03)
No paid provider, remeshing, or replacement textures are used.
"""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-props'
SPECS = [
    {'id': 'wagon', 'source': 'wooden wagon 3d model.glb', 'axis': 1, 'size': 2.9, 'triangles': 14000, 'label': 'Holzkarren'},
    {'id': 'barrel', 'source': 'wooden barrel 3d model.glb', 'axis': 2, 'size': .95, 'triangles': 8000, 'label': 'Holzfass'},
    {'id': 'well', 'source': 'medieval well 3d model.glb', 'axis': 2, 'size': 2.4, 'triangles': 14000, 'label': 'Steinbrunnen'},
    {'id': 'rock-01', 'source': 'rock 3d model.glb', 'axis': 0, 'size': 2.0, 'triangles': 4000, 'label': 'Flacher Felsen'},
    {'id': 'rock-02', 'source': 'rock boulder 3d model.glb', 'axis': 1, 'size': 2.2, 'triangles': 5000, 'label': 'Findling'},
    {'id': 'rock-03', 'source': 'rock formation 3d model.glb', 'axis': 1, 'size': 2.6, 'triangles': 7000, 'label': 'Hoher Felsen'},
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    raw = path.read_bytes()
    if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2:
        raise ValueError(f'Not a binary glTF 2 file: {path}')
    document = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    primitives = [p for m in document.get('meshes', []) for p in m['primitives']]
    accessors = document['accessors']
    return {
        'path': str(path.relative_to(ROOT)), 'bytes': len(raw), 'sha256': digest(path),
        'triangles': sum(accessors[p['indices']]['count'] // 3 for p in primitives),
        'vertices': sum(accessors[p['attributes']['POSITION']]['count'] for p in primitives),
        'meshes': len(document.get('meshes', [])), 'materials': len(document.get('materials', [])),
        'embeddedImages': len([i for i in document.get('images', []) if 'bufferView' in i]),
        'externalUris': [i['uri'] for group in ('buffers', 'images') for i in document.get(group, []) if 'uri' in i],
        'animations': len(document.get('animations', [])),
        'attributes': sorted(set(k for p in primitives for k in p['attributes'])),
    }


def coordinates(mesh):
    raw = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
    mesh.data.vertices.foreach_get('co', raw)
    return raw.reshape((-1, 3))


def bounds(mesh):
    v = coordinates(mesh)
    return [v.min(axis=0).tolist(), v.max(axis=0).tolist()]


def gltf_bounds(b):
    return [[b[0][0], b[0][2], -b[1][1]], [b[1][0], b[1][2], -b[0][1]]]


def render(mesh, name, stage):
    """Comparable true Blender renders of the source and prepared derivative."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Neutral preview world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.26, .28, .30, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    size = max(np.array(bounds(mesh)[1]) - np.array(bounds(mesh)[0]))
    target = Vector((0, 0, (bounds(mesh)[1][2] + bounds(mesh)[0][2]) * .45))
    created = []
    bpy.ops.mesh.primitive_plane_add(size=size * 200, location=(0, 0, -.012))
    ground = bpy.context.object
    ground.name = 'preview-ground-not-exported'
    mat = bpy.data.materials.new('preview-neutral-ground')
    mat.diffuse_color = (.32, .34, .36, 1)
    mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.32, .34, .36, 1)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .95
    ground.data.materials.append(mat)
    created.append(ground)
    for p, power, light_size in [((-.6, -1.5, 2.5), 110, 1.6), ((1.8, .8, 1.8), 70, 1.3)]:
        bpy.ops.object.light_add(type='AREA', location=tuple(x * size for x in p))
        obj = bpy.context.object
        obj.data.energy = power * size * size
        obj.data.size = light_size * size
        obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()
        created.append(obj)
    bpy.ops.object.camera_add(location=(size * 1.25, -size * 1.8, size * 1.4))
    camera = bpy.context.object
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = size * 1.55
    camera.data.lens = 50
    scene.camera = camera
    created.append(camera)
    scene.render.filepath = str(OUTPUT / f'previews/{name}-{stage}.png')
    bpy.ops.render.render(write_still=True)
    for obj in created:
        bpy.data.objects.remove(obj, do_unlink=True)


def prepare(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'assets/inbox' / spec['source']
    original = inspect(source)
    if original['externalUris']:
        raise ValueError('Source must be self-contained; inspect external dependencies first.')
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected the inspected single-mesh source.')
    mesh = meshes[0]
    mesh.name = 'nebeljagd-tripo-' + spec['id']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    original_bounds = bounds(mesh)
    scale = spec['size'] / (original_bounds[1][spec['axis']] - original_bounds[0][spec['axis']])
    mesh.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    scaled = bounds(mesh)
    offset = [(scaled[0][0] + scaled[1][0]) / 2, (scaled[0][1] + scaled[1][1]) / 2, scaled[0][2]]
    for vertex in mesh.data.vertices:
        vertex.co -= Vector(offset)
    normalized_source = bounds(mesh)
    render(mesh, spec['id'], 'source')
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    # Tripo meshes contain coincident vertices / microscopic degenerate faces
    # which prevent collapse from reaching a useful browser budget. Weld only
    # sub-millimetre positional duplicates; loop UVs and material slots survive.
    cleanup_distance = max(spec['size'] * .0001, .00005)
    editable = bmesh.new()
    editable.from_mesh(mesh.data)
    cleanup_before = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=cleanup_distance)
    bmesh.ops.dissolve_degenerate(editable, edges=list(editable.edges), dist=cleanup_distance * .1)
    cleanup_after = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    editable.to_mesh(mesh.data)
    editable.free()
    mesh.data.update()
    mesh.data.calc_loop_triangles()
    modifier = mesh.modifiers.new('Browser triangle budget', 'DECIMATE')
    modifier.ratio = min(1, spec['triangles'] / len(mesh.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    images = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or not image.size[0]:
            continue
        old = list(image.size)
        ratio = min(1, 1024 / max(old))
        if ratio < 1:
            image.scale(max(1, round(old[0] * ratio)), max(1, round(old[1] * ratio)))
        images.append({'name': image.name, 'sourceSize': old, 'runtimeSize': list(image.size), 'format': image.file_format})
    # Ground the simplified shape too: collapsing triangles can move the bottom.
    simplified = bounds(mesh)
    recenter = [(simplified[0][0] + simplified[1][0]) / 2, (simplified[0][1] + simplified[1][1]) / 2, simplified[0][2]]
    for vertex in mesh.data.vertices:
        vertex.co -= Vector(recenter)
    final_bounds = gltf_bounds(bounds(mesh))
    destination = OUTPUT / f'runtime/{spec["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                              export_yup=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_animations=False, export_cameras=False,
                              export_lights=False, export_image_format='AUTO')
    runtime = inspect(destination)
    vertices = coordinates(mesh)
    bands = []
    for low, high in [(0, .15), (.15, .55), (.55, .95), (.95, 1.5), (1.5, 3.0)]:
        band = vertices[(vertices[:, 2] >= low) & (vertices[:, 2] <= high)]
        if len(band):
            bands.append({'heightRange': [low, high], 'vertices': len(band), 'gltfBounds': gltf_bounds([band.min(axis=0).tolist(), band.max(axis=0).tolist()])})
    report = {'id': spec['id'], 'label': spec['label'], 'source': original, 'runtime': runtime,
              'normalization': {'uniformScale': scale, 'blenderSourceBounds': original_bounds,
                                'scaledSourceBounds': normalized_source, 'centerGroundOffsetBlender': offset,
                                'simplifiedCenterGroundOffsetBlender': recenter, 'gltfBounds': final_bounds,
                                'dimensions': [final_bounds[1][i] - final_bounds[0][i] for i in range(3)],
                                'axes': 'glTF +Y up, +Z front; original orientation retained; X/Z centered; bottom Y=0'},
              'heightBands': bands, 'cleanup': {'weldDistanceMetres': cleanup_distance, 'before': cleanup_before, 'after': cleanup_after}, 'textures': images, 'policy': {'triangleBudget': spec['triangles'], 'textureLimit': 1024, 'fileLimitBytes': 4 * 1024 * 1024},
              'validation': {'sourceUnchanged': digest(source) == original['sha256'],
                             'embeddedDependenciesOnly': not runtime['externalUris'],
                             'triangleBudgetPassed': runtime['triangles'] <= spec['triangles'] + 10,
                             'fileBudgetPassed': runtime['bytes'] <= 4 * 1024 * 1024,
                             'preservedUVAndNormals': {'NORMAL', 'TEXCOORD_0'} <= set(runtime['attributes']),
                             'preservedMaterialCount': runtime['materials'] == original['materials']}}
    if not all(report['validation'].values()):
        raise ValueError('Prepared prop failed static validation: ' + json.dumps(report['validation']))
    (OUTPUT / f'inspections/{spec["id"]}.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PREPARED_PROP ' + json.dumps(report), flush=True)
    render(mesh, spec['id'], 'runtime')


def write_package():
    reports = [json.loads(p.read_text()) for p in sorted((OUTPUT / 'inspections').glob('*.json'))]
    provenance = {'package': 'nebeljagd-tripo-props', 'version': 1,
                  'sourceOrigin': 'User supplied Tripo GLBs in project assets/inbox and explicitly requested editor/game integration.',
                  'provider': {'name': 'Tripo (original sources)', 'invokedByThisTask': False, 'jobId': None, 'commercialLicenseReceipt': None},
                  'preparation': {'tool': 'Blender ' + bpy.app.version_string, 'script': 'scripts/prepare-tripo-props.py',
                                  'scriptSha256': digest(Path(__file__)), 'command': 'blender -b -t 3 --python scripts/prepare-tripo-props.py',
                                  'method': 'Uniform metric scale, horizontal centering and ground offset, sub-millimetre duplicate-vertex/degenerate-face cleanup retaining loop UVs, collapse decimation preserving original UVs/materials, downsample embedded textures to 1024. No original modification.'},
                  'assets': [{'id': r['id'], 'source': r['source'], 'runtime': r['runtime']} for r in reports],
                  'evidenceBoundary': 'Static validation plus actual Blender render. Project GPU import/collisions and artistic approval are checked separately.'}
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (OUTPUT / 'inspection.json').write_text(json.dumps({'assets': reports}, indent=2) + '\n')
    readme = '''# Tripo-Gegenstände für Nebeljagd

Originale: `assets/inbox/`. Die hochgeladenen GLBs bleiben unverändert.
Ableitungen: `runtime/`, normale glTF-Meterkoordinaten (+Y oben, +Z vorne),
horizontal zentriert und auf Y=0 geerdet. Ursprungsausrichtung bleibt erhalten.

`inspections/` enthält gemessene Maße, Höhenbänder, Dreieckzahlen, Texturgrößen,
SHA-256-Werte und statische Prüfungen je Modell. `previews/` enthält echte
Blender-Renderings vor und nach der Optimierung unter gleicher Kamera/Beleuchtung.
Es werden keine Texturen oder neuen Modelle erzeugt. Die UVs und PBR-Texturen
der Originale werden beibehalten; Texturen sind auf maximal 1024² reduziert.
Submillimetergroße Positionsduplikate und degenerierte Flächen werden vor der
Vereinfachung bereinigt; die UVs je Flächenecke bleiben erhalten.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-props.py`.
Einzelmodell: nach dem Skriptpfad `-- --only wagon` (oder barrel, well,
rock-01, rock-02, rock-03) ergänzen.

Provenienz: vom Projektinhaber bereitgestellte Tripo-Modelle, Einbindung ausdrücklich
beauftragt. Kein kostenpflichtiger Anbieteraufruf; kein separater kommerzieller
Lizenzbeleg mitgeliefert. Dieses lokale Paket ist kein `game-dev`-CLI-Beleg
(CLI in der Arbeitsumgebung nicht vorhanden). WebGL, Kollisionen und Editor
werden unabhängig von den hier dokumentierten Blender-/Dateiprüfungen getestet.
'''
    readme += '\n| Modell | Maße B × H × T (m) | Dreiecke | GLB (kB) |\n| --- | --- | ---: | ---: |\n'
    for report in reports:
        dimensions = ' × '.join(f'{v:.2f}' for v in report['normalization']['dimensions'])
        readme += f'| {report["label"]} | {dimensions} | {report["runtime"]["triangles"]:,} | {report["runtime"]["bytes"] / 1000:.0f} |\n'
    (OUTPUT / 'README.md').write_text(readme)
    files = [{'path': str(p.relative_to(OUTPUT)), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(OUTPUT.rglob('*')) if p.is_file() and p.name != 'runtime-manifest.json']
    manifest = {'name': 'nebeljagd-tripo-props', 'version': 1, 'kind': 'source-preserving-local-editor-test-package',
                'files': files, 'sources': [{'path': r['source']['path'], 'sha256': r['source']['sha256']} for r in reports],
                'validation': {'sourceUnchanged': all(r['validation']['sourceUnchanged'] for r in reports),
                               'allStaticPoliciesPassed': all(all(r['validation'].values()) for r in reports)},
                'licenseStatus': 'User-provided project assets; separate commercial provider receipt not supplied.',
                'pending': ['Editor/game GPU import and collision review', 'User artistic approval']}
    (OUTPUT / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', choices=[s['id'] for s in SPECS])
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for path in ['runtime', 'previews', 'inspections']:
        (OUTPUT / path).mkdir(parents=True, exist_ok=True)
    for spec in SPECS:
        if not args.only or args.only == spec['id']:
            prepare(spec)
    write_package()


if __name__ == '__main__':
    main()
