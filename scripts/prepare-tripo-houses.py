"""Prepare the owner's textured house exports without modifying source GLBs.

Run: blender -b -t 4 --python scripts/prepare-tripo-houses.py -- --only house-02
Uses the existing local Blender pipeline; no provider job or replacement texture.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import struct
import subprocess
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-houses'
SPECS = {
    'house-02': {'source': 'medieval house interior 3d model 2.glb', 'label': 'Wohnhaus 2 · Tripo',
                 'width': 22.0, 'triangles': 100000, 'textureLimit': 2048},
}
spec = importlib.util.spec_from_file_location('prop_preparation', ROOT / 'scripts/prepare-tripo-props.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
inspect, digest, coordinates, bounds, gltf_bounds = helpers.inspect, helpers.digest, helpers.coordinates, helpers.bounds, helpers.gltf_bounds


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def render_views(mesh, asset_id, stage):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = False
    scene.render.resolution_x, scene.render.resolution_y = 1100, 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Neutral house preview')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.32, .34, .36, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    b = bounds(mesh)
    span = max(b[1][0] - b[0][0], b[1][1] - b[0][1])
    created = []
    for location, power, size in [((-.5, -1.5, 2.5), 110, 1.6), ((1.8, .8, 1.8), 70, 1.3)]:
        bpy.ops.object.light_add(type='AREA', location=tuple(value * span for value in location))
        light = bpy.context.object
        light.data.energy = power * span * span
        light.data.size = size * span
        light.rotation_euler = (Vector((0, 0, 0)) - light.location).to_track_quat('-Z', 'Y').to_euler()
        created.append(light)
    bpy.ops.object.camera_add(location=(0, 0, span * 2))
    camera = bpy.context.object
    camera.rotation_euler = (0, 0, 0)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * 1.22
    scene.camera = camera
    created.append(camera)
    scene.render.filepath = str(OUTPUT / f'previews/{asset_id}-{stage}-top.png')
    bpy.ops.render.render(write_still=True)
    camera.location = (span * 1.0, -span * 1.3, span * 1.65)
    camera.rotation_euler = (Vector((0, 0, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = span * 1.55
    scene.render.filepath = str(OUTPUT / f'previews/{asset_id}-{stage}-perspective.png')
    bpy.ops.render.render(write_still=True)
    for obj in created:
        bpy.data.objects.remove(obj, do_unlink=True)


def sections(mesh, heights):
    v = coordinates(mesh)
    mesh.data.calc_loop_triangles()
    faces = np.empty(len(mesh.data.loop_triangles) * 3, dtype=np.int32)
    mesh.data.loop_triangles.foreach_get('vertices', faces)
    triangles = v[faces.reshape((-1, 3))]
    result = {}
    for height in heights:
        selected = triangles[(triangles[:, :, 2].min(axis=1) < height) & (triangles[:, :, 2].max(axis=1) > height)]
        segments = []
        for triangle in selected:
            intersections = []
            for a, b in [(triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])]:
                if (a[2] - height) * (b[2] - height) < 0:
                    p = a + (b-a) * ((height-a[2])/(b[2]-a[2]))
                    intersections.append([round(float(p[0]), 4), round(float(-p[1]), 4)])
            if len(intersections) == 2:
                segments.append(intersections)
        result[str(height)] = segments
    return result


def render_section_plot(asset_id):
    # A diagnostic plot of the measured mesh intersections, not an art preview.
    subprocess.run(['python3', '-c', '''
import json, sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
data = json.load(open(sys.argv[1]))['sections']
fig, axes = plt.subplots(1, len(data), figsize=(15, 5), dpi=120)
for axis, (height, lines) in zip(axes, data.items()):
    axis.add_collection(LineCollection(lines, colors='#344735', linewidths=.35))
    axis.set_xlim(-12,12); axis.set_ylim(12,-12); axis.set_aspect('equal')
    axis.set_title(f'Runtime mesh: Y = {height} m')
    axis.set_xlabel('x / m'); axis.set_ylabel('z / m'); axis.grid(alpha=.2)
fig.tight_layout(); fig.savefig(sys.argv[2]); plt.close(fig)
''', str(OUTPUT/f'inspections/{asset_id}-sections.json'),
        str(OUTPUT/f'previews/{asset_id}-collision-sections.png')], check=True)


def level_walkable_floor(mesh):
    """Compress the low floor band monotonically in the runtime derivative.

    The joined reconstruction has floor patches separated by roughly 16 cm.
    A shared game-floor height otherwise puts the avatar's feet into the front
    room. Do not collapse layers onto one plane: that creates coplanar seams.
    The strictly increasing height mapping preserves layer order, UVs and all
    geometry outside [-0.35, 0.6]m. Blender Z is glTF Y at this pipeline stage.
    """
    mesh.data.update()
    original = coordinates(mesh)
    height = original[:, 2]
    selected = (height > -.35) & (height < .6)
    if not np.any(selected):
        raise ValueError('No measured low floor vertices found for leveling.')
    # Every segment has positive slope, so overlapping thin layers retain
    # their order rather than becoming coincident or turning inside-out.
    knots = np.array([-.35, -.2, .25, .6])
    targets = np.array([-.35, -.02, .025, .6])
    mapped = height.copy()
    mapped[selected] = np.interp(height[selected], knots, targets)
    slopes = np.ones(len(height))
    for index in range(3):
        in_band = (height >= knots[index]) & (height < knots[index + 1])
        slopes[in_band] = (targets[index + 1]-targets[index])/(knots[index + 1]-knots[index])
    normals = np.empty(len(mesh.data.loops)*3, dtype=np.float32)
    mesh.data.corner_normals.foreach_get('vector', normals)
    normals = normals.reshape((-1, 3))
    vertex_indices = np.empty(len(mesh.data.loops), dtype=np.int32)
    mesh.data.loops.foreach_get('vertex_index', vertex_indices)
    for index in np.flatnonzero(selected):
        mesh.data.vertices[int(index)].co.z = float(mapped[index])
    mesh.data.update()
    # Inverse-transpose of the local vertical stretch preserves the original
    # shading normals outside the edited band and corrects its floor normals.
    normals[:, 2] /= slopes[vertex_indices]
    lengths = np.linalg.norm(normals, axis=1)
    normals /= np.maximum(lengths, 1e-10)[:, None]
    mesh.data.normals_split_custom_set(normals.tolist())
    final = coordinates(mesh)
    untouched = ~selected
    if not np.array_equal(original[untouched], final[untouched]):
        raise ValueError('Floor leveling changed vertices outside the bounded height band.')
    return {'method': 'Strictly monotone piecewise vertical compression of native Y [-0.35, 0.6]; floor band [-0.2, 0.25] becomes [-0.02, 0.025]',
        'sourceHeights': knots.tolist(), 'runtimeHeights': targets.tolist(),
        'vertices': int(selected.sum()),
        'maximumVerticalAdjustment': float(np.abs(original[selected, 2]-final[selected, 2]).max()),
        'otherVerticesUnchanged': True, 'uvCoordinatesUnchanged': True}


def validate_exported_floor_and_openings(destination):
    """Use the actual reimported GLB, not just the collision proxy."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(destination))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected one exported house mesh.')
    mesh = meshes[0]
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    routes = [
        ('front entry', (0, 12), (0, 8)),
        ('rear kitchen exit', (6.72, -12), (6.72, -7)),
        ('bedroom', (-2.3, 2), (-2.3, -3)),
        ('kitchen', (2.3, 2), (2.3, -4)),
        ('living aisle', (-3.1, 8), (-3.1, 1.8)),
    ]
    checks = []
    for name, start, end in routes:
        for height in [.4, 1.2, 2.0]:
            a, b = Vector((start[0], -start[1], height)), Vector((end[0], -end[1], height))
            direction = b-a
            hit, point, _, _ = mesh.ray_cast(a, direction.normalized(), distance=direction.length)
            checks.append({'route': name, 'height': height, 'clear': not hit,
                'hit': [float(point.x), float(point.z), float(-point.y)] if hit else None})
    samples = []
    for x, z in [(0, 8), (0, 9.9), (0, 10.6), (6.72, -10.4), (6.72, -8),
                 (2.3, 0), (2.3, -4), (-2.3, 0), (-2.3, -3), (-3.1, 3), (0, 1.8)]:
        hit, point, normal, _ = mesh.ray_cast(Vector((x, -z, 2.5)), Vector((0, 0, -1)))
        samples.append({'x': x, 'z': z, 'hit': bool(hit),
            'nativeY': float(point.z) if hit else None, 'normalY': float(normal.z) if hit else None})
    result = {'source': str(destination.relative_to(OUTPUT)), 'sha256': digest(destination),
        'method': 'Reimported runtime GLB mesh ray casts below lintels at 0.4/1.2/2.0m; floor samples from Y=2.5m',
        'routeChecks': checks, 'floorSamples': samples,
        'allRouteHeightsClear': all(check['clear'] for check in checks),
        'walkableFloorLevel': all(sample['hit'] and abs(sample['nativeY']) <= .02501 for sample in samples)}
    save_json(OUTPUT/'floor-and-openings-validation.json', result)
    if not result['allRouteHeightsClear'] or not result['walkableFloorLevel']:
        raise ValueError('Exported mesh access or floor validation failed: '+json.dumps(result))
    return result


def prepare(asset_id):
    policy = SPECS[asset_id]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'assets/inbox' / policy['source']
    original = inspect(source)
    if original['externalUris'] or original['embeddedImages'] < 3 or 'TEXCOORD_0' not in original['attributes']:
        raise ValueError('The house must contain embedded PBR textures and UVs; do not substitute an untextured export.')
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected the inspected single-mesh house.')
    mesh = meshes[0]
    mesh.name = f'nebeljagd-tripo-{asset_id}'
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    source_bounds = bounds(mesh)
    factor = policy['width'] / (source_bounds[1][0] - source_bounds[0][0])
    mesh.scale = (factor, factor, factor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    b = bounds(mesh)
    center = [(b[0][0]+b[1][0])/2, (b[0][1]+b[1][1])/2]
    for vertex in mesh.data.vertices:
        vertex.co.x -= center[0]
        vertex.co.y -= center[1]
    mesh.data.update()
    b = bounds(mesh)
    samples = []
    for x in np.linspace(b[0][0]*.8, b[1][0]*.8, 23):
        for y in np.linspace(b[0][1]*.8, b[1][1]*.8, 23):
            hit, point, normal, _ = mesh.ray_cast(Vector((float(x),float(y),b[1][2]+5)),Vector((0,0,-1)))
            if hit and normal.z > .7:
                samples.append({'x':float(x),'z':float(-y),'y':float(point.z)})
    if len(samples) < 100:
        raise ValueError('Insufficient floor sampling evidence; inspect the source geometry.')
    sample_heights = np.array([sample['y'] for sample in samples])
    # The lower floor cluster avoids tables and beds in this furnished house.
    lower, upper = np.quantile(sample_heights,[.1,.35])
    floor_height = float(np.median(sample_heights[(sample_heights>=lower)&(sample_heights<=upper)]))
    for vertex in mesh.data.vertices:
        vertex.co.z -= floor_height
    mesh.data.update()
    render_views(mesh,asset_id,'source')
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    modifier = mesh.modifiers.new('Browser geometry budget','DECIMATE')
    modifier.ratio = min(1, policy['triangles']/original['triangles'])
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    floor_leveling = level_walkable_floor(mesh)
    images = []
    for image in bpy.data.images:
        if image.source not in {'FILE','GENERATED'} or not image.size[0]:
            continue
        old = list(image.size)
        ratio = min(1,policy['textureLimit']/max(old))
        if ratio<1:
            image.scale(max(1,round(old[0]*ratio)),max(1,round(old[1]*ratio)))
        images.append({'name':image.name,'sourceSize':old,'runtimeSize':list(image.size),'format':image.file_format})
    destination = OUTPUT / f'runtime/{asset_id}.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',
        export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO')
    runtime = inspect(destination)
    final_bounds = gltf_bounds(bounds(mesh))
    validation = {'sourceUnchanged':digest(source)==original['sha256'],
        'embeddedDependenciesOnly':not runtime['externalUris'],
        'triangleBudgetPassed':runtime['triangles']<=policy['triangles']+10,
        'fileBudgetPassed':runtime['bytes']<=8*1024*1024,
        'preservedUVAndNormals':{'NORMAL','TEXCOORD_0'}<=set(runtime['attributes']),
        'embeddedPBRTextures':runtime['embeddedImages']==original['embeddedImages'],
        'preservedMaterialCount':runtime['materials']==original['materials']}
    if not all(validation.values()):
        raise ValueError('House static validation failed: '+json.dumps(validation))
    report = {'id':asset_id,'label':policy['label'],'source':original,'runtime':runtime,
        'normalization':{'targetWidthMetres':policy['width'],'uniformScale':factor,
            'sourceBlenderBounds':source_bounds,'centerOffsetBlender':center,'floorOffset':floor_height,
            'floorSamplingQuantiles':np.quantile(sample_heights,[0,.1,.25,.35,.5,.75,1]).tolist(),
            'runtimeFloorLeveling': floor_leveling,
            'gltfBounds':final_bounds,'axes':'glTF Y up, +Z front; source orientation retained; floor cluster at Y=0'},
        'textures':images,'policy':policy,'validation':validation}
    save_json(OUTPUT/f'inspections/{asset_id}.json',report)
    save_json(OUTPUT/f'inspections/{asset_id}-sections.json',{'axes':'glTF X/Z metres','sections':sections(mesh,[.5,1.2,2.5])})
    render_section_plot(asset_id)
    save_json(OUTPUT/f'inspections/{asset_id}-floor-samples.json',{'floorOffset':floor_height,'samples':samples})
    print('HOUSE_PREPARED '+json.dumps(report),flush=True)
    render_views(mesh,asset_id,'runtime')
    validate_exported_floor_and_openings(destination)


def write_package():
    reports=[json.loads(p.read_text()) for p in sorted((OUTPUT/'inspections').glob('house-??.json'))]
    provenance={'name':'nebeljagd-tripo-houses','version':1,
        'sourceOrigin':'User-supplied Tripo exports in project assets/inbox; editor/game integration explicitly requested.',
        'provider':{'name':'Tripo (source GLBs)','invokedByThisTask':False,'jobId':None,'commercialLicenseReceipt':None},
        'preparation':{'tool':'Blender '+bpy.app.version_string,'script':'scripts/prepare-tripo-houses.py',
            'scriptSha256':digest(Path(__file__)),'method':'Uniform scale, measured floor offset, UV-preserving decimation, bounded monotone floor-height compression and existing image downsampling; originals preserved.'},
        'assets':reports,
        'license':{'status':'user-provided-project-asset','commercialReceiptSupplied':False},
        'previewReview':'Source and runtime renders generated; visual and engine integration review recorded separately.'}
    save_json(OUTPUT/'provenance.json',provenance)
    roster=[{'path':str(p.relative_to(OUTPUT)),'bytes':p.stat().st_size,'sha256':digest(p)}
        for p in sorted(OUTPUT.rglob('*')) if p.is_file() and p.name!='runtime-manifest.json']
    save_json(OUTPUT/'runtime-manifest.json',{'name':'nebeljagd-tripo-houses','version':1,
        'kind':'source-preserving-local-project-package','files':roster,
        'sources':[r['source'] for r in reports],'validated':{'sourceUnchanged':all(r['validation']['sourceUnchanged'] for r in reports),
            'embeddedDependenciesOnly':all(r['validation']['embeddedDependenciesOnly'] for r in reports)},
        'licenseStatus':'User-provided project assets; separate commercial provider receipt not supplied.'})


def main():
    for directory in ['runtime','previews','inspections']:
        (OUTPUT/directory).mkdir(parents=True,exist_ok=True)
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',choices=list(SPECS))
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for asset_id in [args.only] if args.only else SPECS:
        prepare(asset_id)
    write_package()


if __name__=='__main__':
    main()
