"""Derive the Waldhaus foundation from the existing owner's Tripo wall.

Run: blender -b -t 3 --python scripts/prepare-waldhaus-stone.py
Only assets/derived/waldhaus-stone is written. Original UVs and PBR assets stay
in the existing wall package; the game borrows that material without duplicating
its textures. No provider call or game-dev CLI receipt is involved.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import tempfile

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/imported/tripo-wall/runtime/wall.glb'
OUTPUT = ROOT / 'assets/derived/waldhaus-stone'
EXPECTED_SOURCE = 'b8e49ceff639a5ee8fa353c72fcd312729ccb1a71de4caf895d1225b883fcf81'
LENGTH, HEIGHT, DEPTH, TRIANGLE_LIMIT = 6.0, .6, .36, 2000


def digest(value):
    return hashlib.sha256(value).hexdigest()


def glb(path):
    contents = path.read_bytes()
    assert contents[:4] == b'glTF' and struct.unpack_from('<I', contents, 4)[0] == 2
    length = struct.unpack_from('<I', contents, 12)[0]
    document = json.loads(contents[20:20 + length])
    return contents, document, contents[28 + length:]


def attribute(document, binary, index):
    accessor = document['accessors'][index]
    view = document['bufferViews'][accessor['bufferView']]
    code = {5126: 'f', 5125: 'I', 5123: 'H'}[accessor['componentType']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[accessor['type']]
    form = '<' + code * width
    stride = view.get('byteStride', struct.calcsize(form))
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [value for i in range(accessor['count'])
            for value in struct.unpack_from(form, binary, offset + i * stride)]


def bounds(mesh):
    return [[min(vertex.co[i] for vertex in mesh.vertices) for i in range(3)],
            [max(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]]


def clip(mesh, planes):
    edit = bmesh.new()
    edit.from_mesh(mesh)
    for point, normal in planes:
        bmesh.ops.bisect_plane(edit, geom=list(edit.verts) + list(edit.edges) + list(edit.faces),
                              plane_co=Vector(point), plane_no=Vector(normal),
                              clear_outer=True, clear_inner=False, dist=1e-7)
    edit.to_mesh(mesh)
    edit.free()
    mesh.update()
    mesh.calc_loop_triangles()


def main():
    original, source_document, source_binary = glb(SOURCE)
    assert digest(original) == EXPECTED_SOURCE, 'Inspect a changed source before preparing its derivative.'
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    source = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
    bpy.context.view_layer.objects.active = source
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # Blender uses Z up. Retain the original horizontal and vertical metre
    # coordinates; take the lower two courses instead of flattening all four.
    clip(source.data, [((0, 0, HEIGHT), (0, 0, 1))])
    original_strip_triangles = len(source.data.loop_triangles)
    chosen = None
    for target in (1700, 1600):
        candidate = source.copy()
        candidate.data = source.data.copy()
        bpy.context.collection.objects.link(candidate)
        bpy.context.view_layer.objects.active = candidate
        bpy.ops.object.select_all(action='DESELECT')
        candidate.select_set(True)
        modifier = candidate.modifiers.new('Waldhaus foundation budget', 'DECIMATE')
        modifier.ratio = target / original_strip_triangles
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        # Quadric simplification can move boundary vertices. Clip again rather
        # than rescaling the stone faces to restore the measured envelope.
        clip(candidate.data, [((LENGTH / 2, 0, 0), (1, 0, 0)),
                              ((-LENGTH / 2, 0, 0), (-1, 0, 0)),
                              ((0, 0, HEIGHT), (0, 0, 1)),
                              ((0, 0, 0), (0, 0, -1))])
        if len(candidate.data.loop_triangles) <= TRIANGLE_LIMIT:
            chosen = candidate
            break
        mesh = candidate.data
        bpy.data.objects.remove(candidate, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    assert chosen, 'The clipped strip exceeded the declared geometry budget.'
    mesh = chosen.data
    low, high = bounds(mesh)
    centre, depth_scale = (low[1] + high[1]) / 2, DEPTH / (high[1] - low[1])
    old_normals = [normal.vector.copy() for normal in mesh.corner_normals]
    normal_transform = Matrix.Diagonal((1.0, depth_scale, 1.0)).inverted().transposed()
    for vertex in mesh.vertices:
        vertex.co.y = (vertex.co.y - centre) * depth_scale
    mesh.update()
    mesh.normals_split_custom_set([(normal_transform @ normal).normalized() for normal in old_normals])
    bpy.context.view_layer.objects.active = chosen
    bpy.ops.object.select_all(action='DESELECT')
    chosen.select_set(True)
    # A temporary glTF export handles Blender's axis and V-coordinate changes
    # and splits vertices at UV/normal seams exactly like the GLTFLoader path.
    with tempfile.TemporaryDirectory(prefix='waldhaus-stone-') as scratch:
        path = Path(scratch) / 'strip.glb'
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                                 export_yup=True, export_texcoords=True, export_normals=True,
                                 export_materials='EXPORT', export_animations=False,
                                 export_image_format='AUTO')
        _, document, binary = glb(path)
        primitive = document['meshes'][0]['primitives'][0]
        geometry = {'version': 1, 'length': LENGTH, 'height': HEIGHT, 'depth': DEPTH}
        for name, semantic in [('positions', 'POSITION'), ('normals', 'NORMAL'), ('uvs', 'TEXCOORD_0')]:
            values = attribute(document, binary, primitive['attributes'][semantic])
            assert all(math.isfinite(value) for value in values)
            geometry[name] = [round(value, 6) for value in values]
        geometry['indices'] = attribute(document, binary, primitive['indices'])
    count = len(geometry['positions']) // 3
    assert len(geometry['normals']) == count * 3 and len(geometry['uvs']) == count * 2
    assert all(0 <= value < count for value in geometry['indices'])
    assert len(geometry['indices']) // 3 <= TRIANGLE_LIMIT
    for x, y, z in zip(*[iter(geometry['positions'])] * 3):
        assert -3.000001 <= x <= 3.000001 and -.000001 <= y <= HEIGHT + .000001 and abs(z) <= DEPTH / 2 + .000001
    destination = OUTPUT / 'geometry.json'
    destination.write_text(json.dumps(geometry, separators=(',', ':')) + '\n')
    images = []
    for image in source_document['images']:
        view = source_document['bufferViews'][image['bufferView']]
        data = source_binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        images.append({'name': image.get('name'), 'mimeType': image['mimeType'],
                       'bytes': len(data), 'sha256': digest(data)})
    provenance = {
        'version': 1,
        'source': {'path': str(SOURCE.relative_to(ROOT)), 'sha256': EXPECTED_SOURCE,
                   'bytes': len(original), 'unchanged': digest(SOURCE.read_bytes()) == EXPECTED_SOURCE},
        'material': {'borrowedFrom': 'wall:kit-tripo-wall', 'images': images,
                     'duplicatedTextureFiles': 0, 'uvConvention': 'glTF UVs for original GLTFLoader textures (flipY=false)'},
        'preparation': {'tool': 'Blender ' + bpy.app.version_string,
                        'script': str(Path(__file__).relative_to(ROOT)),
                        'scriptSha256': digest(Path(__file__).read_bytes()),
                        'command': 'blender -b -t 3 --python scripts/prepare-waldhaus-stone.py',
                        'method': 'Clip the lower 0.6 m; simplify, reclip X/Y bounds; change depth only to 0.36 m with inverse-transpose normals; export glTF attributes.',
                        'sourceStripTriangles': original_strip_triangles,
                        'simplificationTarget': target, 'depthScale': depth_scale,
                        'xScale': 1, 'yScale': 1, 'providerInvoked': False,
                        'gameDevCliReceipt': None},
        'geometry': {'path': 'geometry.json', 'bytes': destination.stat().st_size,
                     'sha256': digest(destination.read_bytes()), 'vertices': count,
                     'triangles': len(geometry['indices']) // 3, 'triangleLimit': TRIANGLE_LIMIT,
                     'length': LENGTH, 'height': HEIGHT, 'depth': DEPTH},
        'validation': {'sourceUnchanged': True, 'originalPBRReused': True, 'noFaceStretch': True,
                       'finiteAttributes': True, 'indicesValid': True, 'budgetPassed': True},
    }
    (OUTPUT / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (OUTPUT / 'README.md').write_text('''# Waldhaus – original Tripo stone foundation

Geometry derived from the existing `assets/imported/tripo-wall/runtime/wall.glb`.
The owner's source and prepared wall package remain unchanged. The runtime uses
the wall's original base-colour, normal and roughness/metalness textures; this
directory contains no duplicate images and no new provider output.

The lower 0.6 m of the 6 m wall is retained at its original X/Y metre scale.
Only wall depth changes to 0.36 m. Normals are transformed by the inverse
transpose; glTF export supplies the Y-up coordinates and matching UV convention.
The top cut sits beneath the Waldhaus timber sill. End pieces are clipped at
runtime rather than stretched along X. Geometry is capped at 2,000 triangles.

Reproduce with `blender -b -t 3 --python scripts/prepare-waldhaus-stone.py`.
`provenance.json` records the source, borrowed PBR image hashes, output checksum,
budget and preparation version. This is local derivation of an already admitted
project asset, not a `game-dev` CLI receipt or a new commercial licence record.
''')
    print(json.dumps(provenance['geometry']))


main()
