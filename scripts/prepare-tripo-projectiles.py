"""Inspect by default; --execute prepares separate, bounded browser projectiles.

Uses the project's existing Blender path when the optional game-dev CLI is absent.
No provider calls, source edits, or overwrites of an existing prepared package.
"""
from pathlib import Path
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-projectiles'
COMMAND = 'blender -b -t 3 --python scripts/prepare-tripo-projectiles.py -- --execute'
TRIANGLE_BUDGET = 6000
TEXTURE_BUDGET = 512
ASSETS = [
    ('ice-crystal', 'ice crystal 3d model.glb', 'bd13db83001f5dfaa286180cf31b073b26fcb4504b4be6e0c101c4603b4e8c42'),
    ('feathered-arrow', 'feathered spear 3d model.glb', 'eb66a058ef2d9aab9fed589ddc750e0af8978f6a331a1f627b37b06c3a4327eb'),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    count, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20 + count])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'triangles': sum(doc['accessors'][p.get('indices', p['attributes']['POSITION'])]['count'] // 3 for p in primitives),
        'images': len(doc.get('images', [])),
        'attributes': sorted({a for p in primitives for a in p['attributes']}),
        'externalUris': [i['uri'] for key in ('buffers', 'images') for i in doc.get(key, []) if 'uri' in i],
        'bounds': [{'min': doc['accessors'][p['attributes']['POSITION']].get('min'),
                    'max': doc['accessors'][p['attributes']['POSITION']].get('max')} for p in primitives]}


def preview(mesh, name):
    import bpy
    from mathutils import Vector
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('Projectile review')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.08, .1, .13, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    center = sum((mesh.matrix_world @ Vector(c) for c in mesh.bound_box), Vector()) / 8
    for position, power in [((1, -2, 3), 350), ((-2, 1, 2), 200)]:
        bpy.ops.object.light_add(type='AREA', location=center + Vector(position))
        light = bpy.context.object
        light.data.energy = power
        light.data.size = 3
        light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=center + Vector((0, -2, .25)))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.35
    scene.camera = camera
    scene.render.filepath = str(OUTPUT / f'{name}-preview.png')
    bpy.ops.render.render(write_still=True)


def execute():
    import bpy
    sources = []
    for name, filename, pin in ASSETS:
        source = ROOT / 'assets/inbox' / filename
        assert digest(source) == pin, f'Source mismatch: {filename}'
        sources.append({'path': str(source.relative_to(ROOT)), 'sha256': pin})
    if OUTPUT.exists():
        raise SystemExit(f'Refusing to overwrite existing output: {OUTPUT}')
    (OUTPUT / 'runtime').mkdir(parents=True)
    for name, filename, pin in ASSETS:
        source = ROOT / 'assets/inbox' / filename
        original = inspect(source)
        assert not original['externalUris']
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=str(source))
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        assert len(meshes) == 1
        mesh = meshes[0]
        bpy.context.view_layer.objects.active = mesh
        bpy.ops.object.select_all(action='DESELECT')
        mesh.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        mesh.data.calc_loop_triangles()
        for attempt in range(3):
            triangles = len(mesh.data.loop_triangles)
            if triangles <= TRIANGLE_BUDGET:
                break
            modifier = mesh.modifiers.new('Browser projectile budget', 'DECIMATE')
            modifier.ratio = min(1, (TRIANGLE_BUDGET if attempt == 0 else TRIANGLE_BUDGET - 100) / triangles)
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            mesh.data.calc_loop_triangles()
        textures = []
        for image in bpy.data.images:
            if image.source not in {'FILE', 'GENERATED'} or not image.size[0]:
                continue
            before = list(image.size)
            ratio = min(1, TEXTURE_BUDGET / max(before))
            if ratio < 1:
                image.scale(max(1, round(before[0] * ratio)), max(1, round(before[1] * ratio)))
            textures.append({'name': image.name, 'originalSize': before, 'runtimeSize': list(image.size)})
        destination = OUTPUT / 'runtime' / f'{name}.glb'
        bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
            export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
            export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
        runtime = inspect(destination)
        checks = {'sourceUnchanged': digest(source) == pin,
            'triangleBudget': 0 < runtime['triangles'] <= TRIANGLE_BUDGET, 'fileBudget': runtime['bytes'] <= 1536 * 1024,
            'textureBudget': all(max(t['runtimeSize']) <= TEXTURE_BUDGET for t in textures),
            'uvAndNormals': {'NORMAL', 'TEXCOORD_0'} <= set(runtime['attributes']),
            'embeddedOnly': not runtime['externalUris'], 'imageCountPreserved': runtime['images'] == original['images']}
        assert all(checks.values()), checks
        report = {'source': str(source.relative_to(ROOT)), 'original': original, 'runtime': runtime,
            'textures': textures, 'validation': checks, 'command': COMMAND,
            'sourceAxisPreserved': True, 'preview': 'Prepared derivative, front view with source +X to image right.',
            'providerInvoked': False, 'canonicalGameDevPackage': False,
            'rights': 'User-supplied asset requested for this project; no independent license certification.'}
        (OUTPUT / f'{name}-inspection.json').write_text(json.dumps(report, indent=2) + '\n')
        preview(mesh, name)
        print(json.dumps({'asset': name, 'runtime': runtime, 'validation': checks}), flush=True)
    files = [{'path': str(p.relative_to(OUTPUT)), 'bytes': p.stat().st_size, 'sha256': digest(p)}
             for p in sorted(OUTPUT.rglob('*')) if p.is_file()]
    (OUTPUT / 'runtime-manifest.json').write_text(json.dumps({'sources': sources, 'files': files}, indent=2) + '\n')


if __name__ == '__main__':
    if '--execute' in sys.argv:
        execute()
    else:
        print(json.dumps({'command': COMMAND, 'destination': str(OUTPUT), 'overwrite': False,
            'sources': [{'path': filename, 'inspection': inspect(ROOT / 'assets/inbox' / filename),
                         'expectedSha256': pin} for _, filename, pin in ASSETS]}, indent=2))
