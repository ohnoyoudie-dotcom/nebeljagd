"""Prepare original user-uploaded Tripo weapons for the browser, without editing them.

Run: blender -b -t 3 --python scripts/prepare-tripo-weapons.py
Single model: append -- --only sword (also lava-staff, crystal-staff).
Parallel single-model preparation: add --no-package, then run -- --package-only.
Requires Blender and the project's python3/Pillow for review sheets/thumbnails.
No provider invocation, remeshing, replacement textures, or licence claim.
"""
import argparse
import hashlib
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-weapons'
SPECS = [
    {'id': 'sword', 'source': 'fantasy sword 3d model.glb', 'length': 1.25,
     'triangles': 12000, 'gripHeight': .15, 'axisRange': [.40, .90],
     'label': 'Tripo-Schwert', 'thumbnail': 'sword-kit-tripo-sword.webp'},
    {'id': 'lava-staff', 'source': 'lava crystal staff 3d model.glb', 'length': 1.70,
     'triangles': 12000, 'gripHeight': .20, 'axisRange': [.10, .50],
     'label': 'Tripo-Lavastab', 'thumbnail': 'fireStaff-kit-tripo-lava-staff.webp'},
    {'id': 'crystal-staff', 'source': 'crystal staff 3d model.glb', 'length': 1.70,
     'triangles': 12000, 'gripHeight': .20, 'axisRange': [.10, .60],
     'label': 'Tripo-Kristallstab', 'thumbnail': 'iceStaff-kit-tripo-crystal-staff.webp'},
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    raw = path.read_bytes()
    if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2:
        raise ValueError(f'Not binary glTF 2: {path}')
    doc = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    accessors = doc['accessors']
    return {
        'path': str(path.relative_to(ROOT)), 'bytes': len(raw), 'sha256': digest(path),
        'triangles': sum(accessors[p['indices']]['count'] // 3 for p in primitives),
        'vertices': sum(accessors[p['attributes']['POSITION']]['count'] for p in primitives),
        'meshes': len(doc.get('meshes', [])), 'materials': len(doc.get('materials', [])),
        'embeddedImages': sum('bufferView' in i for i in doc.get('images', [])),
        'externalUris': [i['uri'] for group in ('buffers', 'images') for i in doc.get(group, []) if 'uri' in i],
        'animations': len(doc.get('animations', [])),
        'attributes': sorted(set(k for p in primitives for k in p['attributes'])),
        'materialChannels': [{'baseColorTexture': 'baseColorTexture' in m.get('pbrMetallicRoughness', {}),
                              'metallicRoughnessTexture': 'metallicRoughnessTexture' in m.get('pbrMetallicRoughness', {}),
                              'normalTexture': 'normalTexture' in m} for m in doc.get('materials', [])],
    }


def coordinates(mesh):
    raw = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
    mesh.data.vertices.foreach_get('co', raw)
    return raw.reshape((-1, 3))


def set_coordinates(mesh, values):
    mesh.data.vertices.foreach_set('co', np.asarray(values, dtype=np.float32).ravel())
    mesh.data.update()


def bounds(mesh):
    v = coordinates(mesh)
    return [v.min(axis=0).tolist(), v.max(axis=0).tolist()]


def gltf_point(point):
    return [float(point[0]), float(point[2]), float(-point[1])]


def gltf_bounds(b):
    return [[b[0][0], b[0][2], -b[1][1]], [b[1][0], b[1][2], -b[0][1]]]


def normalize(mesh, spec):
    """Undo provider presentation tilt and place the physical grip at the origin."""
    vertices = coordinates(mesh)
    original_bounds = bounds(mesh)
    # Original Tripo assets have +Y up in glTF, imported as Blender +Z up.
    # Fit centers of thin shaft/blade slices, excluding asymmetric heads/guards.
    centers = []
    for height in np.linspace(*spec['axisRange'], 16):
        band = vertices[np.abs(vertices[:, 2] - height) < .008]
        centers.append((band.min(axis=0) + band.max(axis=0)) * .5)
    centers = np.array(centers)
    slopes = [float(np.polyfit(centers[:, 2], centers[:, axis], 1)[0]) for axis in [0, 1]]
    longitudinal = Vector((slopes[0], slopes[1], 1)).normalized()
    rotation = longitudinal.rotation_difference(Vector((0, 0, 1)))
    matrix = np.array(rotation.to_matrix(), dtype=np.float64)
    grip_band = vertices[np.abs(vertices[:, 2] - spec['gripHeight']) < .008]
    grip = (grip_band.min(axis=0) + grip_band.max(axis=0)) * .5
    rotated = (vertices - grip) @ matrix.T
    scale = spec['length'] / (rotated[:, 2].max() - rotated[:, 2].min())
    set_coordinates(mesh, rotated * scale)
    return {'sourceBoundsBlender': original_bounds, 'sourceGripPointGltf': gltf_point(grip),
            'sourceLongitudinalAxisGltf': gltf_point(longitudinal),
            'normalizingRotationQuaternionBlenderWxyz': list(rotation),
            'uniformScale': scale,
            'axes': 'glTF +Y towards blade/crystal, +Z source front; physical grip centered at (0,0,0)',
            'gripPoint': [0, 0, 0], 'nominalLengthMetres': spec['length'],
            'normalizedSourceBoundsGltf': gltf_bounds(bounds(mesh))}


def render(mesh, spec, stage, frame_bounds):
    """Actual PBR render; source/runtime share camera, framing, and lighting."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Neutral weapon preview')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .20, .23, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    length = spec['length']
    center = Vector(tuple((frame_bounds[0][i] + frame_bounds[1][i]) * .5 for i in range(3)))
    created = []
    for pos, power in [((-1, -2, 3), 220), ((2, 1, 2), 160)]:
        bpy.ops.object.light_add(type='AREA', location=center + Vector(tuple(v * length for v in pos)))
        light = bpy.context.object
        light.data.energy = power * length * length
        light.data.size = length * 3
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
        created.append(light)
    bpy.ops.object.camera_add(location=center + Vector((length * .42, -length * 3, length * .12)))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = length * 1.18
    scene.camera = camera
    created.append(camera)
    scene.render.filepath = str(OUTPUT / f'previews/{spec["id"]}-{stage}.png')
    bpy.ops.render.render(write_still=True)
    for obj in created:
        bpy.data.objects.remove(obj, do_unlink=True)


def prepare(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'assets/inbox' / spec['source']
    original = inspect(source)
    if original['externalUris']:
        raise ValueError('Source must be self-contained.')
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected inspected single-mesh Tripo source.')
    mesh = meshes[0]
    mesh.name = 'nebeljagd-tripo-' + spec['id']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    normalization = normalize(mesh, spec)
    frame_bounds = bounds(mesh)
    print('NORMALIZED_WEAPON ' + json.dumps({'id': spec['id'], **normalization}), flush=True)
    render(mesh, spec, 'source', frame_bounds)
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    cleanup_distance = spec['length'] * .00004
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
    modifier = mesh.modifiers.new('Browser weapon budget', 'DECIMATE')
    modifier.ratio = min(1, spec['triangles'] / len(mesh.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    textures = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or not image.size[0]:
            continue
        old = list(image.size)
        limit = 768 if 'normal' in image.name.lower() else 1024
        ratio = min(1, limit / max(old))
        if ratio < 1:
            image.scale(max(1, round(old[0] * ratio)), max(1, round(old[1] * ratio)))
        textures.append({'name': image.name, 'sourceSize': old, 'runtimeSize': list(image.size), 'format': image.file_format})
    final_bounds = gltf_bounds(bounds(mesh))
    vertices = coordinates(mesh)
    tip = gltf_point(vertices[np.argmax(vertices[:, 2])])
    destination = OUTPUT / f'runtime/{spec["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                            export_yup=True, export_texcoords=True, export_normals=True,
                            export_materials='EXPORT', export_animations=False, export_cameras=False,
                            export_lights=False, export_image_format='AUTO')
    runtime = inspect(destination)
    normalization.update({'gltfBounds': final_bounds, 'tipPoint': tip,
                          'dimensions': [final_bounds[1][i] - final_bounds[0][i] for i in range(3)]})
    validation = {'sourceUnchanged': digest(source) == original['sha256'],
                  'embeddedDependenciesOnly': not runtime['externalUris'],
                  'triangleBudgetPassed': runtime['triangles'] <= spec['triangles'] + 10,
                  'fileBudgetPassed': runtime['bytes'] <= 1536 * 1024,
                  'textureBudgetPassed': all(max(i['runtimeSize']) <= 1024 for i in textures),
                  'preservedUVAndNormals': {'NORMAL', 'TEXCOORD_0'} <= set(runtime['attributes']),
                  'preservedMaterialChannels': runtime['materialChannels'] == original['materialChannels'],
                  'preservedEmbeddedImageCount': runtime['embeddedImages'] == original['embeddedImages']}
    report = {'id': spec['id'], 'label': spec['label'], 'source': original, 'runtime': runtime,
              'normalization': normalization,
              'cleanup': {'weldDistanceMetres': cleanup_distance, 'before': cleanup_before, 'after': cleanup_after},
              'textures': textures,
              'policy': {'triangleBudget': spec['triangles'], 'textureLimit': 1024, 'normalMapLimit': 768, 'fileLimitBytes': 1536 * 1024},
              'validation': validation}
    (OUTPUT / f'inspections/{spec["id"]}.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PREPARED_WEAPON ' + json.dumps(report), flush=True)
    if not all(validation.values()):
        raise ValueError('Weapon failed static validation: ' + json.dumps(validation))
    render(mesh, spec, 'runtime', frame_bounds)


def write_previews():
    # Use ordinary local Python/Pillow; Blender's embedded Python need not ship it.
    code = r'''
import sys,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(sys.argv[1]);out=Path(sys.argv[2]);specs=json.loads(sys.argv[3])
board=Image.new('RGB',(1280,3*700),(30,36,45));draw=ImageDraw.Draw(board)
try: font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22)
except OSError: font=ImageFont.load_default()
for row,spec in enumerate(specs):
 for col,stage in enumerate(['source','runtime']):
  image=Image.open(out/'previews'/f'{spec["id"]}-{stage}.png').convert('RGBA')
  board.paste(image,(col*640,row*700+48),image)
  label=spec['label']+' — '+('Originalgeometrie' if stage=='source' else '12.000 Dreiecke / 1024 + 768 px')
  draw.text((col*640+20,row*700+15),label,fill=(230,235,242),font=font)
 runtime=Image.open(out/'previews'/f'{spec["id"]}-runtime.png').convert('RGBA')
 # Match existing 256 x 192 catalogue canvases without distorting the render.
 thumbnail=Image.new('RGBA',(256,192),(0,0,0,0))
 thumbnail.paste(runtime.resize((192,192),Image.Resampling.LANCZOS),(32,0))
 thumbnail.save(root/'assets/catalog'/spec['thumbnail'],format='WEBP',quality=92,method=6)
board.save(out/'previews/comparison.png')
'''
    subprocess.run(['python3', '-c', code, str(ROOT), str(OUTPUT), json.dumps(SPECS)], check=True)
    html = '''<!doctype html><html lang="de"><meta charset="utf-8"><title>Tripo-Waffen: Geometrieprüfung</title>
<style>body{margin:24px;background:#1e242d;color:#eef;font:16px system-ui}img{display:block;max-width:100%;height:auto}p{max-width:80ch}</style>
<h1>Tripo-Waffen: Original und Browsermodell</h1><p>Echte Blender-PBR-Renderings unter identischer Kamera und Beleuchtung. Links: unveränderte Quellgeometrie nach gemeinsamer metrischer Ausrichtung. Rechts: vereinfachte Geometrie mit den auf 1024 Pixel (Farbe/Material) beziehungsweise 768 Pixel (Normal-Map) reduzierten Originaltexturen. Die Originaldateien bleiben unverändert.</p><img src="comparison.png" alt="Drei Waffen, je Originalgeometrie links und optimiertes Modell rechts"></html>'''
    (OUTPUT / 'previews/review.html').write_text(html)


def write_package():
    reports = [json.loads((OUTPUT / f'inspections/{spec["id"]}.json').read_text()) for spec in SPECS]
    write_previews()
    provenance = {'package': 'nebeljagd-tripo-weapons', 'version': 1,
                  'sourceOrigin': 'User supplied Tripo GLBs in project assets/inbox and explicitly requested editor/game integration.',
                  'provider': {'name': 'Tripo (original sources)', 'invokedByThisTask': False, 'jobId': None, 'commercialLicenseReceipt': None},
                  'preparation': {'tool': 'Blender ' + bpy.app.version_string,
                                  'script': 'scripts/prepare-tripo-weapons.py', 'scriptSha256': digest(Path(__file__)),
                                  'command': 'blender -b -t 3 --python scripts/prepare-tripo-weapons.py',
                                  'method': 'Rigid shaft-axis correction, uniform metric scale and physical grip origin; sub-millimetre duplicate/degenerate cleanup preserving loop UVs; collapse decimation; original Base Color/Metallic-Roughness textures downsampled to 1024 and lossless normal maps to 768. No source modification.'},
                  'assets': [{'id': r['id'], 'source': r['source'], 'runtime': r['runtime']} for r in reports],
                  'evidenceBoundary': 'Static validation and actual Blender PBR renders. Editor/game GPU import, equipment alignment, gameplay, and artistic approval are assessed separately.'}
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (OUTPUT / 'inspection.json').write_text(json.dumps({'assets': reports}, indent=2) + '\n')
    readme = '''# Tripo-Waffen für Nebeljagd

Die drei Original-GLBs in `assets/inbox/` bleiben unverändert. Dieses lokale,
quellenerhaltende Paket stellt getrennte Browser-Ableitungen bereit.

## Koordinatenvertrag

Die Längsachse zeigt in glTF nach **+Y** zur Klinge/zum Kristall. **+Z** bleibt
die Vorderseite der Quelltextur. Die Präsentationsneigung der Quellen wurde
starr korrigiert. Der Ursprung **(0,0,0)** liegt im sichtbaren Griffzentrum,
nicht an der Unterkante. Für schwebende Bodenobjekte bei Bedarf die in
`inspections/` dokumentierten Grenzen nutzen; gehaltene Waffen direkt am
Griff ausrichten. Alle Koordinaten sind Meter. Schwertlänge 1,25 m,
Stablängen jeweils 1,70 m. `tipPoint` dokumentiert den tatsächlichen obersten
Vertex, `gltfBounds` die Grenzen nach Vereinfachung.

## Prüfung und Reproduktion

`previews/` enthält echte Blender-Renderings der normalisierten Quellgeometrie
und des Browsermodells mit identischer Kamera/Beleuchtung. Keine Textur wurde
erfunden: Base Color, Metallic/Roughness, Normal Map und UVs bleiben erhalten;
Base Color/Metallic-Roughness werden auf 1024 Pixel, die verlustfrei gespeicherten
Normal-Maps auf 768 Pixel verkleinert. Kleine
Positionsduplikate/degenerierte Flächen werden vor der Vereinfachung bereinigt.

`blender -b -t 3 --python scripts/prepare-tripo-weapons.py`

Einzelmodell: `-- --only sword` (auch `lava-staff`, `crystal-staff`).
Paket/Thumbnails aus vorhandenen Prüfberichten neu schreiben: `-- --package-only`.
Blender 4.3.2 sowie lokales `python3` mit Pillow wurden verwendet.

## Provenienz

Vom Projektinhaber bereitgestellte Tripo-Modelle; Einbindung ausdrücklich
beauftragt. Kein kostenpflichtiger Anbieteraufruf und kein separat mitgelieferter
kommerzieller Lizenzbeleg. Dies ist kein kanonisches `game-dev`-CLI-Paket;
die zusätzliche CLI stand in der Arbeitsumgebung nicht zur Verfügung.
SHA-256-Werte, ursprüngliche und reduzierte Dreieckzahlen, Texturen und statische
Prüfungen sind in `inspections/`, `inspection.json`, `provenance.json` dokumentiert.
`runtime-manifest.json` enthält den geschlossenen Dateibestand dieses lokalen Pakets.
WebGL, Editor, Ausrüstung und künstlerische Freigabe werden separat geprüft.

| Modell | B × H × T (m) | Dreiecke | GLB (kB) | Unterkante Y | Spitze Y |
| --- | --- | ---: | ---: | ---: | ---: |
'''
    for report in reports:
        norm = report['normalization']
        dimensions = ' × '.join(f'{value:.3f}' for value in norm['dimensions'])
        readme += f'| {report["label"]} | {dimensions} | {report["runtime"]["triangles"]:,} | {report["runtime"]["bytes"] / 1000:.0f} | {norm["gltfBounds"][0][1]:.3f} | {norm["tipPoint"][1]:.3f} |\n'
    (OUTPUT / 'README.md').write_text(readme)
    files = [{'path': str(p.relative_to(OUTPUT)), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(OUTPUT.rglob('*')) if p.is_file() and p.name != 'runtime-manifest.json']
    manifest = {'name': 'nebeljagd-tripo-weapons', 'version': 1,
                'kind': 'source-preserving-local-editor-test-package', 'files': files,
                'sources': [{'path': r['source']['path'], 'sha256': r['source']['sha256']} for r in reports],
                'validation': {'sourceUnchanged': all(r['validation']['sourceUnchanged'] for r in reports),
                               'allStaticPoliciesPassed': all(all(r['validation'].values()) for r in reports),
                               'totalRuntimeBudgetPassed': sum(r['runtime']['bytes'] for r in reports) <= 4 * 1024 * 1024},
                'licenseStatus': 'User-provided project assets; separate commercial provider receipt not supplied.',
                'pending': ['Editor/game GPU import and held-weapon alignment review', 'User artistic approval']}
    if not all(manifest['validation'].values()):
        raise ValueError('Package policies failed.')
    (OUTPUT / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('WEAPON_PACKAGE_READY ' + json.dumps({'files': len(files), 'runtimeBytes': sum(r['runtime']['bytes'] for r in reports)}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--only', choices=[spec['id'] for spec in SPECS])
    parser.add_argument('--no-package', action='store_true')
    parser.add_argument('--package-only', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    for path in ['runtime', 'previews', 'inspections']:
        (OUTPUT / path).mkdir(parents=True, exist_ok=True)
    if not args.package_only:
        for spec in SPECS:
            if not args.only or args.only == spec['id']:
                prepare(spec)
    if not args.no_package:
        write_package()


if __name__ == '__main__':
    main()
