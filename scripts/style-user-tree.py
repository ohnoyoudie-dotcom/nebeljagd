"""Prepare a separate woodland version of the user's repaired Blender tree.

Read-only inspection by default. Blender --execute never overwrites sources or
an existing output. Uses the established local Blender path (game-dev absent).
"""
from pathlib import Path
import hashlib
import json
import math
import shlex
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/imported/user-trees/runtime/tree1.glb'
OUTPUT = ROOT / 'assets/imported/user-trees/styled'
PIN = 'c8c125554459d89352f23a1d9377899b145617fd589abe36cdbf7d228820c92c'
COMMAND = 'blender -b -t 3 --python scripts/style-user-tree.py -- --execute --output /tmp/nebeljagd-rounded-tree'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    b = path.read_bytes()
    assert struct.unpack_from('<4sII', b) == (b'glTF', 2, len(b))
    d = json.loads(b[20:20 + struct.unpack_from('<I', b, 12)[0]])
    parts = [p for m in d['meshes'] for p in m['primitives']]
    return {'bytes': len(b), 'sha256': digest(path),
            'triangles': sum(d['accessors'][p['indices']]['count'] // 3 for p in parts),
            'bounds': [{'min': d['accessors'][p['attributes']['POSITION']]['min'],
                        'max': d['accessors'][p['attributes']['POSITION']]['max']} for p in parts],
            'materials': d['materials'], 'images': len(d.get('images', [])),
            'meshParts': [{'name': mesh['name'], 'triangles': d['accessors'][part['indices']]['count'] // 3,
                           'attributes': {key: d['accessors'][value]['count'] for key, value in part['attributes'].items()}}
                          for mesh in d['meshes'] for part in mesh['primitives']],
            'embedded': all(not p.get('uri') for key in ['images', 'buffers'] for p in d.get(key, []))}


def linear(hex_value):
    rgb = [int(hex_value[i:i + 2], 16) / 255 for i in [1, 3, 5]]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)


def execute():
    import bpy
    import bmesh
    from mathutils import Vector
    output = Path(sys.argv[sys.argv.index('--output') + 1]).resolve() if '--output' in sys.argv else OUTPUT
    assert digest(SOURCE) == PIN
    if output.exists():
        raise SystemExit('Refusing to overwrite ' + str(output))
    output.mkdir(parents=True)
    authoring = ROOT / 'Blender/Tree Generator/Stylized Tree Generator - Blender/Tree1.blend'
    before = digest(authoring)
    authoring_info = {'path': str(authoring.relative_to(ROOT)), 'sha256': before}
    try:
        bpy.ops.wm.open_mainfile(filepath=str(authoring), load_ui=False, use_scripts=False)
        authoring_info.update(objects=len(bpy.data.objects), nodeGroups=len(bpy.data.node_groups))
    except RuntimeError:
        # The user's Blender 5.2 authoring file exceeds this runner's Blender
        # 4.3 reader. Style the already verified, repaired runtime export.
        authoring_info['reader'] = 'Blender 5.2 source preserved; Blender 4.3 styles the verified runtime GLB'
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    assert len(meshes) == 3
    height = 7.803692817687988
    palette = [linear('#405936'), linear('#718548'), linear('#9da867')]
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        leaf = 'Blätter' in obj.name
        # Preserve the grounded trunk and the authored 7.8 m height. A coherent
        # warp of wood and leaves shortens spindly lateral branches and gathers
        # the mid-height crown into a few fuller, asymmetric masses.
        for vertex in obj.data.vertices:
            x, y, z = vertex.co
            t = max(0, min(1, z / height))
            crown = max(0, min(1, (z - 1.3) / 2.4))
            radial = 1 - .14 * crown + .045 * math.sin(z * 1.5) * crown
            vertex.co.x = x * radial + .15 * math.sin(t * math.pi) * crown
            vertex.co.y = y * (radial * .96 + .04) - .10 * math.sin(t * math.pi * 2) * crown
            vertex.co.z = height * (t + .045 * math.sin(t * math.pi * 2))
        if leaf:
            # Replace each flat source card with a gently cupped, four-triangle
            # leaf. The original four UV corners and exact alpha mask survive;
            # the centre vertex makes its lighting curve with the leaf surface.
            source_mesh = obj.data
            uv_layer = source_mesh.uv_layers.active
            corners = {}
            for polygon in source_mesh.polygons:
                for li in polygon.loop_indices:
                    vi = source_mesh.loops[li].vertex_index
                    corners[vi] = tuple(uv_layer.data[li].uv)
            adjacency = {vertex.index: set() for vertex in source_mesh.vertices}
            for edge in source_mesh.edges:
                a, b = edge.vertices; adjacency[a].add(b); adjacency[b].add(a)
            unseen = set(adjacency); components = []
            while unseen:
                pending = [unseen.pop()]; component = []
                while pending:
                    vi = pending.pop(); component.append(vi)
                    for neighbour in adjacency[vi] & unseen:
                        unseen.remove(neighbour); pending.append(neighbour)
                assert len(component) == 4, 'Each authored leaf must remain an independent quad'
                components.append(component)
            vertices, faces, uvs = [], [], []
            for component in components:
                # UV angular order is stable across the diagonal used by glTF.
                ids = sorted(component, key=lambda vi: math.atan2(corners[vi][1] - .5, corners[vi][0] - .5))
                points = [source_mesh.vertices[vi].co.copy() for vi in ids]
                centre = sum(points, Vector()) / 4
                normal = (points[1] - points[0]).cross(points[2] - points[0]).normalized()
                outward = Vector((centre.x, centre.y, (centre.z - 3.9) * .6)).normalized()
                if normal.dot(outward) < 0:
                    ids.reverse(); points.reverse(); normal.negate()
                leaf_size = sum((points[(i + 1) % 4] - points[i]).length for i in range(4)) / 4
                lift = leaf_size * .075
                # Keep the original global top vertex and grounded silhouette.
                centre += normal * lift
                base = len(vertices); vertices.extend(points + [centre])
                uv_points = [corners[vi] for vi in ids]
                for i in range(4):
                    faces.append((base + i, base + (i + 1) % 4, base + 4))
                    uvs.append((uv_points[i], uv_points[(i + 1) % 4], (.5, .5)))
            mesh = bpy.data.meshes.new(source_mesh.name + ' · curved leaves')
            mesh.from_pydata(vertices, [], faces); mesh.update()
            for material in source_mesh.materials:
                mesh.materials.append(material)
            leaf_uv = mesh.uv_layers.new(name='UVMap')
            for polygon, coordinates in zip(mesh.polygons, uvs):
                polygon.use_smooth = True
                for li, uv in zip(polygon.loop_indices, coordinates):
                    leaf_uv.data[li].uv = uv
            obj.data = mesh
            bpy.data.meshes.remove(source_mesh)
            colors = obj.data.color_attributes.new(name='WoodlandCanopy', type='FLOAT_COLOR', domain='CORNER')
            obj.data.color_attributes.active_color = colors
            vertex_colors = []
            for vertex in obj.data.vertices:
                center = vertex.co
                tint = max(0, min(1, center.z / height * .7 + .18 + .08 * math.sin(center.x * 1.4 + center.y)))
                lower, upper, mix = (palette[0], palette[1], tint * 2) if tint < .5 else (palette[1], palette[2], (tint - .5) * 2)
                shade = .9 + .13 * (.5 + .5 * math.sin(center.x * 2.1 - center.y * 1.7))
                vertex_colors.append(tuple((a * (1 - mix) + b * mix) * shade for a, b in zip(lower, upper)) + (1,))
            for li, loop in enumerate(obj.data.loops):
                colors.data[li].color = vertex_colors[loop.vertex_index]
            for material in obj.data.materials:
                bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                bsdf.inputs['Roughness'].default_value = .96
                bsdf.inputs['Metallic'].default_value = 0
                # Explicit vertex-colour multiplication also preserves the
                # preview in Blender; glTF exports the active colour attribute.
                color_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
                color_node.layer_name = 'WoodlandCanopy'
                old = list(bsdf.inputs['Base Color'].links)
                if old:
                    multiply = material.node_tree.nodes.new('ShaderNodeMixRGB')
                    multiply.blend_type = 'MULTIPLY'; multiply.inputs[0].default_value = 1
                    material.node_tree.links.new(old[0].from_socket, multiply.inputs[1])
                    material.node_tree.links.new(color_node.outputs['Color'], multiply.inputs[2])
                    material.node_tree.links.new(multiply.outputs[0], bsdf.inputs['Base Color'])
        else:
            # The original eight-sided trunk has explicitly flat faces. Recover
            # its longitudinal quads before one subdivision pass, then preserve
            # the original vertical extent and use continuous vertex normals.
            if 'Stamm' in obj.name:
                z_min = min(v.co.z for v in obj.data.vertices); z_max = max(v.co.z for v in obj.data.vertices)
                bm = bmesh.new(); bm.from_mesh(obj.data)
                bmesh.ops.join_triangles(bm, faces=list(bm.faces), angle_face_threshold=math.radians(50),
                    angle_shape_threshold=math.radians(60), cmp_seam=False, cmp_sharp=False,
                    cmp_uvs=False, cmp_vcols=False, cmp_materials=True)
                bm.to_mesh(obj.data); bm.free()
                subdivision = obj.modifiers.new('Rounded trunk silhouette', 'SUBSURF')
                subdivision.levels = subdivision.render_levels = 1
                bpy.ops.object.modifier_apply(modifier=subdivision.name)
                # Keep the rounded lower trunk while collapsing redundant
                # samples along nearly straight upper branches.
                triangle_count = sum(len(p.vertices) - 2 for p in obj.data.polygons)
                if triangle_count > 9300:
                    reduction = obj.modifiers.new('Bounded rounded bark geometry', 'DECIMATE')
                    reduction.ratio = 9300 / triangle_count
                    reduction.use_collapse_triangulate = True
                    bpy.ops.object.modifier_apply(modifier=reduction.name)
                low = min(v.co.z for v in obj.data.vertices); high = max(v.co.z for v in obj.data.vertices)
                for vertex in obj.data.vertices:
                    vertex.co.z = z_min + (vertex.co.z - low) / (high - low) * (z_max - z_min)
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
            colors = obj.data.color_attributes.new(name='WoodlandBark', type='FLOAT_COLOR', domain='CORNER')
            obj.data.color_attributes.active_color = colors
            bark_dark, bark_light = linear('#4c3828'), linear('#997450')
            for polygon in obj.data.polygons:
                for li in polygon.loop_indices:
                    position = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    angle = math.atan2(position.y, position.x)
                    grain = .5 + .5 * math.sin(angle * 8 + position.z * .65 + .45 * math.sin(position.z * 2.3))
                    mottle = .5 + .5 * math.sin(position.z * 3.1 + position.x * 5.3 - position.y * 3.7)
                    warmth = .22 + .46 * grain + .14 * mottle
                    root_shade = .78 + .22 * min(1, max(0, position.z) / 1.4)
                    colors.data[li].color = tuple((a * (1 - warmth) + b * warmth) * root_shade
                        for a, b in zip(bark_dark, bark_light)) + (1,)
            for material in obj.data.materials:
                bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                color_node = material.node_tree.nodes.new('ShaderNodeVertexColor'); color_node.layer_name = 'WoodlandBark'
                material.node_tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])
                bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
                bsdf.inputs['Roughness'].default_value = .96
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    destination = output / 'tree1-woodland.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_animations=False, export_cameras=False, export_lights=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    result = inspect(destination)
    assert result['embedded'] and result['images'] == 1
    assert 9000 <= result['triangles'] <= 16000 and result['bytes'] < 1300000
    assert any(m.get('alphaMode') == 'MASK' and m.get('doubleSided') for m in result['materials'])
    assert digest(SOURCE) == PIN and digest(authoring) == before
    report = {'source': {'path': str(SOURCE.relative_to(ROOT)), 'sha256': PIN},
              'authoringSource': authoring_info, 'runtime': result,
              'command': 'blender -b -t 3 --python scripts/style-user-tree.py -- --execute --output ' + shlex.quote(str(output)),
              'sourcePreserved': True, 'providerInvoked': False, 'canonicalGameDevPackage': False,
              'changes': ['shorter lateral branches, coherent asymmetric crown', 'cupped leaf surfaces with smooth lighting and preserved original alpha mask',
                          'rounded trunk silhouette and smooth normals', 'baked warm/cool bark grain, mottling and darker roots'],
              'rights': 'User-supplied project tree; existing original Blender leaf mask retained.'}
    (output / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    # Review render of the exact prepared geometry; gameplay lighting is tested
    # separately in the generated browser build.
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 64
    scene.cycles.use_denoising = False; scene.render.resolution_x = 640; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Woodland tree review'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.13, .16, .11, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    for position, power in [((-5, -6, 12), 1600), ((5, 2, 8), 700)]:
        bpy.ops.object.light_add(type='AREA', location=position); light = bpy.context.object
        light.data.energy = power; light.data.size = 7; light.rotation_euler = (Vector((0, 0, 4)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(9, -14, 13)); camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 3.6)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 9.4; scene.camera = camera
    scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(output / 'preview.png')
    bpy.ops.render.render(write_still=True)
    (output / 'manifest.json').write_text(json.dumps({'files': [{'path': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)}
        for p in sorted(output.iterdir()) if p.is_file()]}, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    if '--execute' in sys.argv:
        execute()
    else:
        print(json.dumps({'command': COMMAND, 'source': str(SOURCE), 'output': str(OUTPUT),
                          'overwrite': False, 'inspection': inspect(SOURCE)}, indent=2))
