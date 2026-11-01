"""Prepare the user's three weapons; preserve originals and their PBR appearance.

Run: blender -b -t 3 --python scripts/prepare-tripo-weapons.py
Optional: ... -- --only sword (also ice-staff or fire-staff).
The model origin is the leather grip, and the grip's long axis is +Y in glTF.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
import bmesh
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/imported/tripo-weapons'
SPECS = [
    dict(id='sword', kind='sword', variant='kit-tripo-sword', label='Fantasieschwert · Tripo', source='fantasy sword 3d model.glb', length=1.25, triangles=12000),
    dict(id='ice-staff', kind='iceStaff', variant='kit-tripo-ice-staff', label='Kristallstab · Tripo', source='crystal staff 3d model.glb', length=1.5, triangles=14000),
    dict(id='fire-staff', kind='fireStaff', variant='kit-tripo-fire-staff', label='Lavakristallstab · Tripo', source='lava crystal staff 3d model.glb', length=1.5, triangles=14000),
]

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def inspect(path):
    data = path.read_bytes()
    if data[:4] != b'glTF' or struct.unpack_from('<I', data, 4)[0] != 2:
        raise ValueError('Expected binary glTF 2: ' + str(path))
    doc = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    prims = [p for m in doc['meshes'] for p in m['primitives']]
    return dict(path=str(path.relative_to(ROOT)), bytes=len(data), sha256=digest(path),
                triangles=sum(doc['accessors'][p['indices']]['count'] // 3 for p in prims),
                vertices=sum(doc['accessors'][p['attributes']['POSITION']]['count'] for p in prims),
                meshes=len(doc['meshes']), materials=len(doc.get('materials', [])),
                embeddedImages=len([i for i in doc.get('images', []) if 'bufferView' in i]),
                externalUris=[i['uri'] for k in ('buffers', 'images') for i in doc.get(k, []) if 'uri' in i],
                attributes=sorted(set(k for p in prims for k in p['attributes'])),
                animations=len(doc.get('animations', [])))

def coordinates(mesh):
    points = np.empty(len(mesh.data.vertices) * 3, dtype=np.float32)
    mesh.data.vertices.foreach_get('co', points)
    return points.reshape((-1, 3))

def set_coordinates(mesh, points):
    mesh.data.vertices.foreach_set('co', np.asarray(points, dtype=np.float32).reshape(-1))
    mesh.data.update()

def gltf(v):
    return [float(v[0]), float(v[2]), float(-v[1])]

def bounds(mesh):
    v = coordinates(mesh)
    lo, hi = v.min(axis=0), v.max(axis=0)
    return [gltf([lo[0], hi[1], lo[2]]), gltf([hi[0], lo[1], hi[2]])]

def render(mesh, name, stage, length):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('Neutral weapon preview')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.34, .36, .38, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    scene.world = world
    v = coordinates(mesh)
    target = Vector((v[:, 0].mean(), v[:, 1].mean(), (v[:, 2].min() + v[:, 2].max()) / 2))
    created = []
    for pos, power in [((.8, -1.2, 1.8), 110), ((-1, .7, 1), 70)]:
        bpy.ops.object.light_add(type='AREA', location=tuple(target[i] + pos[i] * length for i in range(3)))
        o = bpy.context.object; o.data.energy = power * length * length; o.data.size = 2 * length
        o.rotation_euler = (target - o.location).to_track_quat('-Z', 'Y').to_euler()
        created.append(o)
    bpy.ops.object.camera_add(location=target + Vector((length, -length * 2, length * .42)))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = length * 1.18
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera; created.append(camera)
    # The small marker verifies that the pivot lies inside the leather handle.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=length * .012, location=(0, 0, 0))
    marker = bpy.context.object; marker.name = 'preview-grip-marker-not-exported'
    mat = bpy.data.materials.new('Grip marker'); mat.diffuse_color = (.02, 1, .2, 1)
    marker.data.materials.append(mat); created.append(marker)
    scene.render.filepath = str(OUT / f'previews/{name}-{stage}.png')
    bpy.ops.render.render(write_still=True)
    for obj in created:
        bpy.data.objects.remove(obj, do_unlink=True)


def prepare(spec):
    print('PREPARING', spec['id'], flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'assets/inbox' / spec['source']
    original = inspect(source)
    if original['externalUris']:
        raise ValueError('Original has external dependencies: ' + str(source))
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected the inspected single mesh')
    mesh = meshes[0]; mesh.name = 'nebeljagd-tripo-' + spec['id']
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    v = coordinates(mesh)
    source_bounds = [v.min(axis=0).tolist(), v.max(axis=0).tolist()]
    bottom, top = float(v[:, 2].min()), float(v[:, 2].max())
    # Source inspection shows leather handles at 7-23% of the original height.
    # Fit only those vertices, retaining the intentionally curved shafts/blades.
    leather = v[(v[:, 2] >= bottom + (top-bottom) * .07) & (v[:, 2] <= bottom + (top-bottom) * .23)]
    _, vectors = np.linalg.eigh(np.cov(leather.T))
    axis = vectors[:, -1]
    if axis[2] < 0: axis = -axis
    rotation = Vector(axis.tolist()).rotation_difference(Vector((0, 0, 1)))
    mesh.rotation_mode = 'QUATERNION'; mesh.rotation_quaternion = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    v = coordinates(mesh)
    scale = spec['length'] / float(v[:, 2].max() - v[:, 2].min())
    v *= scale
    # Median handle centre is stable against ornamental surface detail.
    leather_after = np.array([rotation @ Vector(p.tolist()) for p in leather[::max(1, len(leather)//20000)]]) * scale
    grip_z = float(np.median(leather_after[:, 2]))
    centre_band = leather_after[np.abs(leather_after[:, 2]-grip_z) <= spec['length'] * .025]
    pivot = np.array([float(np.median(centre_band[:, 0])), float(np.median(centre_band[:, 1])), grip_z])
    v -= pivot
    set_coordinates(mesh, v)
    render(mesh, spec['id'], 'source', spec['length'])
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    editable = bmesh.new(); editable.from_mesh(mesh.data)
    before = dict(vertices=len(editable.verts), faces=len(editable.faces))
    weld = spec['length'] * .00004
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=weld)
    bmesh.ops.dissolve_degenerate(editable, edges=list(editable.edges), dist=weld * .1)
    after = dict(vertices=len(editable.verts), faces=len(editable.faces))
    editable.to_mesh(mesh.data); editable.free(); mesh.data.update(); mesh.data.calc_loop_triangles()
    modifier = mesh.modifiers.new('Browser triangle budget', 'DECIMATE')
    modifier.ratio = min(1, (spec['triangles'] - 8) / len(mesh.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    textures = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or not image.size[0]: continue
        old = list(image.size); ratio = min(1, 1024 / max(old))
        if ratio < 1: image.scale(max(1, round(old[0]*ratio)), max(1, round(old[1]*ratio)))
        textures.append(dict(name=image.name, sourceSize=old, runtimeSize=list(image.size)))
    points = coordinates(mesh)
    tip_band = points[points[:, 2] >= points[:, 2].max()-spec['length']*.004]
    tip = gltf(np.median(tip_band, axis=0))
    dest = OUT / f'runtime/{spec["id"]}.glb'
    bpy.ops.export_scene.gltf(filepath=str(dest), export_format='GLB', use_selection=True,
                            export_yup=True, export_texcoords=True, export_normals=True,
                            export_materials='EXPORT', export_animations=False,
                            export_cameras=False, export_lights=False, export_image_format='AUTO')
    runtime = inspect(dest)
    validation = dict(sourceUnchanged=digest(source)==original['sha256'], embeddedDependenciesOnly=not runtime['externalUris'],
                      triangleBudgetPassed=runtime['triangles']<=spec['triangles'], fileBudgetPassed=runtime['bytes']<=5*1024*1024,
                      preservedUVAndNormals={'NORMAL','TEXCOORD_0'}<=set(runtime['attributes']),
                      preservedMaterialCount=runtime['materials']==original['materials'],
                      textureBudgetPassed=all(max(t['runtimeSize'])<=1024 for t in textures))
    report = dict(id=spec['id'], kind=spec['kind'], variant=spec['variant'], label=spec['label'],
                  source=original, runtime=runtime, length=spec['length'], grip=[0,0,0], tip=tip,
                  normalization=dict(blenderSourceBounds=source_bounds, handleAxisBlender=axis.tolist(),
                                     rotationQuaternionWXYZ=list(rotation), uniformScale=scale, gripOffsetBlender=pivot.tolist(),
                                     gltfBounds=bounds(mesh), axes='metres, glTF +Y along leather handle; origin at leather grip; source curvature retained'),
                  cleanup=dict(weldDistanceMetres=weld,before=before,after=after), textures=textures,
                  policy=dict(triangleBudget=spec['triangles'],textureLimit=1024,fileLimitBytes=5*1024*1024), validation=validation)
    if not all(validation.values()): raise ValueError('Weapon policy failed: '+json.dumps(validation))
    (OUT / f'inspections/{spec["id"]}.json').write_text(json.dumps(report, indent=2)+'\n')
    render(mesh, spec['id'], 'runtime', spec['length'])
    print('PREPARED_WEAPON '+json.dumps(report), flush=True)


def write_package():
    reports = [json.loads((OUT/f'inspections/{s["id"]}.json').read_text()) for s in SPECS if (OUT/f'inspections/{s["id"]}.json').exists()]
    (OUT/'inspection.json').write_text(json.dumps(dict(assets=reports),indent=2)+'\n')
    provenance = dict(package='nebeljagd-tripo-weapons',version=1,
                      sourceOrigin='User-created/supplied models pushed to project assets/inbox; user explicitly requested game/editor integration.',
                      provider=dict(name='Tripo (original files)',invokedByThisTask=False,jobId=None,commercialLicenseReceipt=None),
                      preparation=dict(tool='Blender '+bpy.app.version_string,script='scripts/prepare-tripo-weapons.py',scriptSha256=digest(Path(__file__)),
                                       command='blender -b -t 3 --python scripts/prepare-tripo-weapons.py',
                                       method='Fit leather handle axis and rotate to glTF +Y; uniform metric scale; grip-centred origin; microscopic duplicate cleanup, decimation, original embedded PBR maps downsampled to 1024. Original bytes unchanged.'),
                      assets=[dict(id=r['id'],source=r['source'],runtime=r['runtime']) for r in reports],
                      evidenceBoundary='Static GLB inspection and Blender rendered previews; game/editor import, animation and artistic review are separate.')
    (OUT/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    (OUT/'README.md').write_text('''# Neue Waffen für Nebeljagd

Originale: `assets/inbox/`; unverändert erhalten. Abgeleitete Browsermodelle
stehen in `runtime/`. Alle Modelle verwenden Meter, +Y entlang des Griffs,
und den Ursprung in der Mitte des sichtbaren Ledergriffs. Die gekrümmten
Schäfte bleiben erhalten. Die echten Spitzensockets stehen in `inspection.json`
und `src/map/tripo-weapon-definitions.js`.

Die Originale haben jeweils etwa 1,9 Millionen Dreiecke. Browserfassungen
verwenden 12.000 / 14.000 Dreiecke und behalten originale UVs/PBR-Texturen,
auf maximal 1024² verkleinert. Keine neuen Modelle oder Texturen erzeugt.
Die grünen Punkte in den Blender-Vorschauen markieren nur den Griffursprung;
sie werden nicht ins Laufzeitmodell exportiert.

Reproduktion: `blender -b -t 3 --python scripts/prepare-tripo-weapons.py`.
Einzelmodell: `-- --only sword`, `ice-staff` oder `fire-staff` anhängen.
`inspections/`, `provenance.json` und `runtime-manifest.json` enthalten Messungen,
Hashes, Verarbeitung und Herkunft. Vom Nutzer bereitgestellte Projektmodelle;
kein Anbieteraufruf und kein separater kommerzieller Lizenzbeleg geliefert.
Dies ist das vorhandene Blender-Paketformat des Projekts; die game-dev-CLI
ist hier nicht installiert. WebGL, Editor und Halteanimationen separat prüfen.
''')
    definitions = '/** Grip-centred user weapons. Measured sockets in assets/imported/tripo-weapons/inspection.json. */\nexport const TRIPO_WEAPON_DEFINITIONS = '+json.dumps([
        dict(kind=r['kind'],variant=r['variant'],label=r['label'],runtimePath=r['runtime']['path'],sourcePath=r['source']['path'],length=r['length'],grip=r['grip'],tip=r['tip']) for r in reports],ensure_ascii=False,indent=2)+';\n'
    if len(reports)==len(SPECS): (ROOT/'src/map/tripo-weapon-definitions.js').write_text(definitions)
    files = [dict(path=str(p.relative_to(OUT)),bytes=p.stat().st_size,sha256=digest(p)) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='runtime-manifest.json']
    manifest = dict(name='nebeljagd-tripo-weapons',version=1,kind='source-preserving-local-editor-test-package',files=files,
                    sources=[dict(path=r['source']['path'],sha256=r['source']['sha256']) for r in reports],
                    validation=dict(sourceUnchanged=all(r['validation']['sourceUnchanged'] for r in reports),allStaticPoliciesPassed=all(all(r['validation'].values()) for r in reports)),
                    licenseStatus='User-provided project assets; separate commercial provider receipt not supplied.',
                    pending=['Game/editor runtime rendering and animation checks','User artistic approval'])
    (OUT/'runtime-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--only',choices=[s['id'] for s in SPECS])
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for name in ['runtime','previews','inspections']: (OUT/name).mkdir(parents=True,exist_ok=True)
    for spec in SPECS:
        if not args.only or args.only==spec['id']: prepare(spec)
    write_package()

if __name__=='__main__': main()
