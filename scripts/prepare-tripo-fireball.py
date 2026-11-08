"""Read-only plan by default; --execute creates a separate browser copy and preview."""
from pathlib import Path
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/inbox/fiery flame 3d model.glb'
OUTPUT = ROOT / 'assets/imported/tripo-fireball'
PIN = '48be7b6326161097ac628d6d52cede7a3c1f202a3e7a3309741d4144ece02f65'
COMMAND = 'blender -b -t 3 --python scripts/prepare-tripo-fireball.py -- --execute'


def inspect(path):
    raw = path.read_bytes()
    assert struct.unpack_from('<4sII', raw) == (b'glTF', 2, len(raw))
    count, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20+count])
    primitives = [p for m in doc.get('meshes', []) for p in m['primitives']]
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'triangles': sum(doc['accessors'][p.get('indices', p['attributes']['POSITION'])]['count']//3 for p in primitives),
        'images': len(doc.get('images', [])),
        'attributes': sorted({a for p in primitives for a in p['attributes']}),
        'externalUris': [i['uri'] for key in ('buffers','images') for i in doc.get(key,[]) if 'uri' in i],
        'bounds': [{'min':doc['accessors'][p['attributes']['POSITION']].get('min'), 'max':doc['accessors'][p['attributes']['POSITION']].get('max')} for p in primitives]}


def render_preview(mesh):
    import bpy
    from mathutils import Vector
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=False
    scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new('Fireball review world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
    center=sum((mesh.matrix_world@Vector(c) for c in mesh.bound_box),Vector())/8
    for position,power in [((1,-2,3),350),((-2,1,2),200)]:
        bpy.ops.object.light_add(type='AREA',location=center+Vector(position));light=bpy.context.object
        light.data.energy=power;light.data.size=3
        light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=center+Vector((.35,-2,.8)));camera=bpy.context.object
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO';camera.data.ortho_scale=1.35;scene.camera=camera
    scene.render.filepath=str(OUTPUT/'preview.png');bpy.ops.render.render(write_still=True)


def execute():
    import bpy
    from mathutils import Vector
    original = inspect(SOURCE)
    assert original['sha256'] == PIN and not original['externalUris']
    if OUTPUT.exists():
        # Resume only a validated derivative whose first preview failed. Never
        # overwrite a model, receipt or previously completed review image.
        if (OUTPUT/'runtime/fireball.glb').is_file() and (OUTPUT/'inspection.json').is_file() and not (OUTPUT/'preview.png').exists():
            report=json.loads((OUTPUT/'inspection.json').read_text())
            assert all(report['validation'].values())
            assert inspect(OUTPUT/'runtime/fireball.glb')['sha256']==report['runtime']['sha256']
            bpy.ops.wm.read_factory_settings(use_empty=True)
            bpy.ops.import_scene.gltf(filepath=str(OUTPUT/'runtime/fireball.glb'))
            meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];assert len(meshes)==1
            render_preview(meshes[0]);print(json.dumps(report),flush=True);return
        raise SystemExit('Refusing to overwrite existing output: '+str(OUTPUT))
    (OUTPUT/'runtime').mkdir(parents=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [o for o in bpy.context.scene.objects if o.type=='MESH']
    assert len(meshes)==1
    mesh=meshes[0]; bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mesh.data.calc_loop_triangles()
    for attempt in range(3):
        triangles=len(mesh.data.loop_triangles)
        if triangles<=6000:break
        modifier=mesh.modifiers.new('Browser fireball budget','DECIMATE')
        modifier.ratio=min(1, (6000 if attempt==0 else 5900)/triangles)
        modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh.data.calc_loop_triangles()
    textures=[]
    for image in bpy.data.images:
        if image.source not in {'FILE','GENERATED'} or not image.size[0]:continue
        before=list(image.size);ratio=min(1,512/max(before))
        if ratio<1:image.scale(max(1,round(before[0]*ratio)),max(1,round(before[1]*ratio)))
        textures.append({'name':image.name,'originalSize':before,'runtimeSize':list(image.size)})
    destination=OUTPUT/'runtime/fireball.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,
        export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',
        export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO')
    runtime=inspect(destination)
    checks={'sourceUnchanged':inspect(SOURCE)['sha256']==PIN,
        'triangleBudget':runtime['triangles']<=6000,'fileBudget':runtime['bytes']<=1536*1024,
        'textureBudget':all(max(t['runtimeSize'])<=512 for t in textures),
        'uvAndNormals':{'NORMAL','TEXCOORD_0'}<=set(runtime['attributes']),
        'embeddedOnly':not runtime['externalUris'],'imageCountPreserved':runtime['images']==original['images']}
    report={'source':str(SOURCE.relative_to(ROOT)),'original':original,'runtime':runtime,'textures':textures,
        'validation':checks,'command':COMMAND,'sourceAxisPreserved':True,
        'runtimePlacement':'Centered and rotated from source +X toward game +Z by loader, nominal length 0.75m.',
        'providerInvoked':False,'canonicalGameDevPackage':False,
        'rights':'User-supplied asset requested for this project; no independent commercial-license certification.'}
    (OUTPUT/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
    assert all(checks.values()),checks
    render_preview(mesh)
    print(json.dumps(report),flush=True)


if __name__=='__main__':
    if '--execute' in sys.argv:execute()
    else:
        original=inspect(SOURCE);assert original['sha256']==PIN
        print(json.dumps({'command':COMMAND,'source':str(SOURCE),'destination':str(OUTPUT),
            'writes':['runtime/fireball.glb','inspection.json','preview.png'],
            'overwrite':False,'sourcePreserved':True,'inspection':original},indent=2))
