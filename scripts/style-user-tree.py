"""Prepare a separate woodland version of the user's repaired Blender tree.

Read-only inspection by default. Blender --execute never overwrites sources or
an existing output. Uses the established local Blender path (game-dev absent).
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/imported/user-trees/runtime/tree1.glb'
OUTPUT = ROOT / 'assets/imported/user-trees/styled'
PIN = 'c8c125554459d89352f23a1d9377899b145617fd589abe36cdbf7d228820c92c'
COMMAND = 'blender -b -t 3 --python scripts/style-user-tree.py -- --execute'


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
            'embedded': all(not p.get('uri') for key in ['images', 'buffers'] for p in d.get(key, []))}


def linear(hex_value):
    rgb = [int(hex_value[i:i + 2], 16) / 255 for i in [1, 3, 5]]
    return tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb)


def execute():
    import bpy
    from mathutils import Vector
    assert digest(SOURCE) == PIN
    if OUTPUT.exists():
        raise SystemExit('Refusing to overwrite ' + str(OUTPUT))
    OUTPUT.mkdir(parents=True)
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
            # Each source card is a separate quad. Preserve its UV mask, with
            # a coherent crown warp and continuous canopy colour shading.
            colors = obj.data.color_attributes.new(name='WoodlandCanopy', type='FLOAT_COLOR', domain='CORNER')
            obj.data.color_attributes.active_color = colors
            for polygon in obj.data.polygons:
                center = sum((obj.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
                tint = max(0, min(1, center.z / height * .7 + .18 + .08 * math.sin(center.x * 1.4 + center.y)))
                lower, upper, mix = (palette[0], palette[1], tint * 2) if tint < .5 else (palette[1], palette[2], (tint - .5) * 2)
                shade = .9 + .13 * (.5 + .5 * math.sin(center.x * 2.1 - center.y * 1.7))
                color = tuple((a * (1 - mix) + b * mix) * shade for a, b in zip(lower, upper)) + (1,)
                for li in polygon.loop_indices:
                    colors.data[li].color = color
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
            for material in obj.data.materials:
                bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                bsdf.inputs['Base Color'].default_value = linear('#70523b' if 'Stamm' in obj.name else '#58422f') + (1,)
                bsdf.inputs['Roughness'].default_value = .96
        obj.data.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    destination = OUTPUT / 'tree1-woodland.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_animations=False, export_cameras=False, export_lights=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False)
    result = inspect(destination)
    assert result['embedded'] and result['images'] == 1
    assert result['triangles'] == 6992 and result['bytes'] < 700000
    assert any(m.get('alphaMode') == 'MASK' and m.get('doubleSided') for m in result['materials'])
    assert digest(SOURCE) == PIN and digest(authoring) == before
    report = {'source': {'path': str(SOURCE.relative_to(ROOT)), 'sha256': PIN},
              'authoringSource': authoring_info, 'runtime': result, 'command': COMMAND,
              'sourcePreserved': True, 'providerInvoked': False, 'canonicalGameDevPackage': False,
              'changes': ['shorter lateral branches, coherent asymmetric crown', 'layered woodland leaf palette', 'matte walnut bark'],
              'rights': 'User-supplied project tree; existing original Blender leaf mask retained.'}
    (OUTPUT / 'inspection.json').write_text(json.dumps(report, indent=2) + '\n')
    # Review render of the exact prepared geometry; gameplay lighting is tested
    # separately in the generated browser build.
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 24
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
    scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = str(OUTPUT / 'preview.png')
    bpy.ops.render.render(write_still=True)
    (OUTPUT / 'manifest.json').write_text(json.dumps({'files': [{'path': p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)}
        for p in sorted(OUTPUT.iterdir()) if p.is_file()]}, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    if '--execute' in sys.argv:
        execute()
    else:
        print(json.dumps({'command': COMMAND, 'source': str(SOURCE), 'output': str(OUTPUT),
                          'overwrite': False, 'inspection': inspect(SOURCE)}, indent=2))
