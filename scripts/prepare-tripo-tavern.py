"""Source-preserving local preparation. Run: blender -b -t 4 --python scripts/prepare-tripo-tavern.py

Blender 4.3.2. User-supplied Tripo source; no provider job or new texture generation.
"""
import bpy
import hashlib
import json
import math
import os
import statistics
import struct
import subprocess
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/inbox/medieval tavern interior 3d model.glb'
OUTPUT = ROOT / 'assets/imported/tripo-tavern'
TARGET_TRIANGLES = 100000
TARGET_WIDTH = 22.0


def inspect_glb(path):
    data = path.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for m in doc.get('meshes', []) for p in m['primitives'])
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'triangles': triangles, 'meshes': len(doc.get('meshes', [])), 'materials': len(doc.get('materials', [])), 'externalUris': [item['uri'] for group in ('buffers', 'images') for item in doc.get(group, []) if 'uri' in item], 'animations': len(doc.get('animations', []))}


def bounds(mesh):
    coordinates = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    return [[min(v[i] for v in coordinates) for i in range(3)], [max(v[i] for v in coordinates) for i in range(3)]]


def render_views(mesh, prefix='runtime'):
    scene = bpy.context.scene
    for obj in list(scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.5, .5, .5)
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    for position, power, size in [((0, -10, 32), 4000, 20), ((-20, 5, 16), 2000, 15), ((15, 10, 20), 2200, 20)]:
        bpy.ops.object.light_add(type='AREA', location=position)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(0, 0, 40))
    camera = bpy.context.object
    camera.rotation_euler = (0, 0, 0)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 26
    scene.camera = camera
    scene.render.filepath = str(OUTPUT / f'previews/{prefix}-top.png')
    bpy.ops.render.render(write_still=True)
    camera.location = (24, -30, 35)
    camera.rotation_euler = (Vector((0, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = 30
    scene.render.filepath = str(OUTPUT / f'previews/{prefix}-perspective.png')
    bpy.ops.render.render(write_still=True)


def render_sections_plot():
    # Matplotlib is installed in the workspace Python, not Blender's Python.
    code = '''
import json, sys, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from pathlib import Path
data=json.loads(Path('/tmp/nebeljagd-tripo-tavern-collision-sections.json').read_text())
fig,axes=plt.subplots(1,3,figsize=(16,5.8),layout='constrained')
for ax,(height,segments) in zip(axes,data['sections'].items()):
    ax.add_collection(LineCollection(segments,colors='#253f48',linewidths=.7))
    ax.set_xlim(-11.5,11.5); ax.set_ylim(9.5,-9.5); ax.set_aspect('equal')
    ax.set_xticks(range(-10,11,2)); ax.set_yticks(range(-8,9,2)); ax.grid(alpha=.25)
    ax.set_xlabel('X [m]'); ax.set_ylabel('Z [m] / front at bottom')
    ax.set_title(f'Horizontal mesh section: Y={height} m')
fig.suptitle('New Tripo tavern — metric collision-authoring evidence (not gameplay colliders)')
fig.savefig(Path(sys.argv[1])/'previews/collision-sections.png',dpi=140)
'''
    subprocess.run(['python', '-c', code, str(OUTPUT)], check=True, env={**os.environ, 'MPLCONFIGDIR': '/tmp/nebeljagd-matplotlib'})


def write_receipts(report):
    source, runtime = report['source'], report['runtime']
    provenance = {'asset': 'Nebeljagd roofless Tripo tavern', 'source': source, 'runtime': runtime, 'sourceOrigin': 'User supplied Tripo GLB through project branch work; integration explicitly requested by user', 'referenceImage': 'assets/concepts/inn/inn-reference.png', 'providerGeneration': {'provider': 'Tripo (source GLB generator field)', 'jobId': None, 'invokedByThisTask': False, 'commercialLicenseReceipt': None}, 'preparation': {'tool': 'Blender ' + bpy.app.version_string, 'script': 'scripts/prepare-tripo-tavern.py', 'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'command': 'blender -b -t 4 --python scripts/prepare-tripo-tavern.py', 'normalization': report['normalization'], 'textureSize': [2048, 2048], 'triangleBudget': TARGET_TRIANGLES, 'originalPreserved': report['sourcePreserved']}, 'sourceValidation': report['validation'], 'previewReview': 'Generated source and runtime renders; visual review is required after each regeneration. GPU/playability tests are owned by runtime integration.'}
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    roster = [{'path': str(path.relative_to(OUTPUT)), 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in sorted(OUTPUT.rglob('*')) if path.is_file() and path.name != 'runtime-manifest.json']
    manifest = {'name': 'nebeljagd-tripo-tavern', 'version': 1, 'kind': 'source-preserving-local-editor-test-package', 'source': {'path': source['path'], 'sha256': source['sha256']}, 'preparationScript': 'scripts/prepare-tripo-tavern.py', 'files': roster, 'validated': {'embeddedDependenciesOnly': not runtime['externalUris'], 'sourceUnchanged': report['sourcePreserved']}, 'pending': ['generated preview visual review', 'game/editor GPU import', 'movement/projectile/sight collisions', 'user artistic approval'], 'licenseStatus': 'User-provided project asset; separate commercial provider receipt not supplied.'}
    (OUTPUT / 'runtime-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def main():
    (OUTPUT / 'runtime').mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'previews').mkdir(exist_ok=True)
    original = inspect_glb(SOURCE)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected the inspected single-mesh source; re-inspect source changes.')
    mesh = meshes[0]
    mesh.name = 'nebeljagd-tripo-tavern'
    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)
    original_bounds = bounds(mesh)
    uniform_scale = TARGET_WIDTH / (original_bounds[1][0] - original_bounds[0][0])
    mesh.scale *= uniform_scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    floor_samples = []
    for x, y in [(0, 0), (1, 0), (0, -4), (1, -4), (0, 4)]:
        hit, point, normal, index = mesh.ray_cast(Vector((x, y, 15)), Vector((0, 0, -1)))
        if hit:
            floor_samples.append({'x': x, 'z': -y, 'height': point.z})
    floor_height = statistics.median(sample['height'] for sample in floor_samples)
    render_views(mesh, 'source')
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    for vertex in mesh.data.vertices:
        vertex.co.z -= floor_height
    before = len(mesh.data.polygons)
    modifier = mesh.modifiers.new('Browser triangle budget', 'DECIMATE')
    modifier.ratio = min(1.0, TARGET_TRIANGLES / original['triangles'])
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    image_changes = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or image.size[0] == 0:
            continue
        old_size = list(image.size)
        factor = min(1.0, 2048 / max(old_size))
        if factor < 1:
            image.scale(max(1, round(old_size[0] * factor)), max(1, round(old_size[1] * factor)))
        image_changes.append({'name': image.name, 'sourceSize': old_size, 'runtimeSize': list(image.size), 'sourceFormat': image.file_format})
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = mesh
    destination = OUTPUT / 'runtime/tavern.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True, export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
    runtime = inspect_glb(destination)
    normalized_bounds = bounds(mesh)
    # Actual mesh/plane intersections below lintels, not inferred gameplay colliders.
    vertices = np.array([list(mesh.matrix_world @ vertex.co) for vertex in mesh.data.vertices])
    mesh.data.calc_loop_triangles()
    faces = np.array([list(face.vertices) for face in mesh.data.loop_triangles])
    triangles = vertices[faces]
    sections = {'units': 'metres', 'axes': 'glTF X right, Z front; below-lintel horizontal intersections with actual runtime mesh', 'sections': {}}
    for height in [.6, 1.6, 2.5]:
        selected = triangles[(triangles[:, :, 2].min(axis=1) < height) & (triangles[:, :, 2].max(axis=1) > height)]
        segments = []
        for triangle in selected:
            intersections = []
            for a, b in [(triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])]:
                if (a[2] - height) * (b[2] - height) < 0:
                    point = a + (b - a) * ((height - a[2]) / (b[2] - a[2]))
                    intersections.append([round(float(point[0]), 4), round(float(-point[1]), 4)])
            if len(intersections) == 2:
                segments.append(intersections)
        sections['sections'][str(height)] = segments
    Path('/tmp/nebeljagd-tripo-tavern-collision-sections.json').write_text(json.dumps(sections) + '\n')
    report = {'source': original, 'runtime': runtime, 'tool': 'Blender ' + bpy.app.version_string, 'normalization': {'targetWidthMeters': TARGET_WIDTH, 'uniformScale': uniform_scale, 'rotationDegrees': [0, 0, 0], 'floorSamplesBeforeOffset': floor_samples, 'verticalOffsetMeters': -floor_height, 'axes': 'glTF Y up, +Z front, +X right; source front orientation retained', 'blenderBounds': normalized_bounds, 'gltfBounds': [[normalized_bounds[0][0], normalized_bounds[0][2], -normalized_bounds[1][1]], [normalized_bounds[1][0], normalized_bounds[1][2], -normalized_bounds[0][1]]]}, 'textures': image_changes, 'sourcePreserved': inspect_glb(SOURCE)['sha256'] == original['sha256'], 'license': {'status': 'user-provided-project-asset', 'source': 'User supplied Tripo GLB and explicitly requested this editor integration; no provider commercial-license receipt supplied.'}, 'validation': {'externalDependencies': runtime['externalUris'], 'trianglesWithin120k': runtime['triangles'] <= 120000, 'materialsPreserved': runtime['materials'] == original['materials'], 'gameplayCollisionValidated': False, 'gpuRuntimeValidated': False}, 'method': 'Uniform metric scale, median central-hall floor offset, Blender collapse decimation preserving UV layers, existing image downsampling; no remeshing, new generation, or alteration of original source.'}
    (OUTPUT / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    print('TAVERN_REPORT', json.dumps(report), flush=True)
    render_views(mesh)
    render_sections_plot()
    write_receipts(report)


if __name__ == '__main__':
    main()
