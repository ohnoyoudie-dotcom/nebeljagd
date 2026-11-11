"""Prepare the user's original lightning staff for the offline game.

Run from the repo root:
    blender -b -t 3 --python scripts/prepare-lightning-staff.py
Never edits the original Tripo GLB or other imported packages.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/inbox/fantasy thunder staff 3d model.glb'
OUTPUT = ROOT / 'assets/imported/tripo-lightning-staff'
DESTINATION = OUTPUT / 'runtime/lightning-staff.glb'
HELPER = ROOT / 'scripts/prepare-tripo-weapons.py'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    raw = path.read_bytes()
    if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2:
        raise ValueError('Not a GLB 2.0 asset: ' + str(path))
    size = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    return {
        'path': str(path.relative_to(ROOT)), 'bytes': len(raw), 'sha256': sha(path),
        'triangles': sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives),
        'materials': len(doc.get('materials', [])),
        'externalUris': [r['uri'] for kind in ('buffers', 'images') for r in doc.get(kind, []) if 'uri' in r],
        'requiredExtensions': doc.get('extensionsRequired', []),
        'attributes': sorted({a for p in primitives for a in p['attributes']}),
    }


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def run():
    if not SOURCE.exists():
        raise FileNotFoundError('User Tripo upload missing: ' + str(SOURCE))
    if DESTINATION.exists():
        raise FileExistsError('Refusing to overwrite prepared lightning staff')
    import bpy
    import bmesh
    spec = importlib.util.spec_from_file_location('existing_weapon_helpers', HELPER)
    base = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(base)
    original = inspect(SOURCE)
    if original['externalUris']:
        raise ValueError('Original must have embedded resources')
    (OUTPUT / 'runtime').mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected a single source weapon mesh, got ' + str(len(meshes)))
    weapon = meshes[0]
    weapon.name = 'nebeljagd-lightning-staff'
    bpy.ops.object.select_all(action='DESELECT')
    weapon.select_set(True)
    bpy.context.view_layer.objects.active = weapon
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    policy = {'id': 'lightning-staff', 'length': 1.70, 'gripHeight': .2,
              'axisRange': [.10, .50], 'triangles': 6000}
    normalization = base.normalize(weapon, policy)
    editable = bmesh.new()
    editable.from_mesh(weapon.data)
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=.00008)
    bmesh.ops.dissolve_degenerate(editable, edges=list(editable.edges), dist=.000008)
    editable.to_mesh(weapon.data)
    editable.free()
    weapon.data.update()
    for attempt in range(4):
        weapon.data.calc_loop_triangles()
        triangles = len(weapon.data.loop_triangles)
        if triangles <= policy['triangles']:
            break
        modifier = weapon.modifiers.new('Browser triangle budget', 'DECIMATE')
        modifier.ratio = min(1, (policy['triangles'] - attempt * 90) / triangles)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    textures = []
    for item in bpy.data.images:
        if item.source not in {'FILE', 'GENERATED'} or not item.size[0]:
            continue
        size_before = list(item.size)
        limit = 128 if 'normal' in item.name.lower() or 'rm' in item.name.lower() else 256
        ratio = min(1, limit / max(size_before))
        if ratio < 1:
            item.scale(max(1, round(size_before[0] * ratio)),
                       max(1, round(size_before[1] * ratio)))
        textures.append({'name': item.name, 'before': size_before, 'after': list(item.size)})
    coordinates = base.coordinates(weapon)
    normalization['tipPoint'] = base.gltf_point(coordinates[base.np.argmax(coordinates[:, 2])])
    normalization['gltfBounds'] = base.gltf_bounds(base.bounds(weapon))
    bpy.ops.export_scene.gltf(filepath=str(DESTINATION), export_format='GLB',
        use_selection=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_animations=False, export_cameras=False,
        export_lights=False, export_image_format='AUTO')
    runtime = inspect(DESTINATION)
    if runtime['triangles'] > 6000 or runtime['bytes'] > 250_000 or runtime['externalUris'] or runtime['requiredExtensions']:
        DESTINATION.unlink(missing_ok=True)
        raise ValueError('Optimized staff violates offline browser budget: ' + str(runtime))
    # A real PBR render of the prepared geometry is also the editor thumbnail source.
    (OUTPUT / 'previews').mkdir(exist_ok=True)
    base.OUTPUT = OUTPUT
    base.render(weapon, policy, 'runtime', base.bounds(weapon))
    if sha(SOURCE) != original['sha256']:
        raise ValueError('Original was changed during preparation')
    (OUTPUT / 'inspections').mkdir(exist_ok=True)
    write_json(OUTPUT / 'inspections/lightning-staff.json', {
        'source': original, 'runtime': runtime, 'normalization': normalization,
        'textures': textures, 'preparation': 'local Blender; original preserved',
        'policy': policy})
    write_json(OUTPUT / 'provenance.json', {
        'original': original['path'], 'sourceSha256': original['sha256'],
        'method': 'Blender texture reduction and decimation using existing Tripo weapon helpers',
        'toolInvoked': 'Blender', 'providerInvoked': False,
        'rights': 'User-provided asset; no independent license certification'})
    roster = []
    for path in sorted(OUTPUT.rglob('*')):
        if path.is_file() and path.name != 'runtime-manifest.json':
            roster.append({'path': str(path.relative_to(OUTPUT)), 'bytes': path.stat().st_size, 'sha256': sha(path)})
    write_json(OUTPUT / 'runtime-manifest.json', {'source': original, 'files': roster})
    print('LIGHTNING_STAFF_READY ' + json.dumps({
        'runtimeBytes': runtime['bytes'], 'triangles': runtime['triangles'],
        'sourceUnchanged': True}), flush=True)


if __name__ == '__main__':
    run()
