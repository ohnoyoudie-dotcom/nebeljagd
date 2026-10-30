"""Prepare the user's closed Tripo chest with a separate, real rear-hinged lid.
Run: blender -b -t 3 --python scripts/prepare-tripo-chest.py
The original GLB is never modified; no provider or texture generation is used.
"""
import bpy
import bmesh
import hashlib
import json
import math
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/inbox/treasure chest 3d model.glb'
OUT = ROOT / 'assets/imported/tripo-chest'
WIDTH = 1.72
BUDGET = 14000
SEAM = .57
HINGE = (0, .515, SEAM)  # Blender: +Z up, rear +Y. glTF: (0, .57, -.515).


def inspect(path):
    blob = path.read_bytes()
    n = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20+n])
    return {'path': str(path.relative_to(ROOT)), 'bytes': len(blob),
        'sha256': hashlib.sha256(blob).hexdigest(),
        'triangles': sum(doc['accessors'][p['indices']]['count']//3 for m in doc.get('meshes', []) for p in m['primitives']),
        'meshes': len(doc.get('meshes', [])), 'materials': len(doc.get('materials', [])),
        'animations': len(doc.get('animations', [])),
        'externalUris': [v['uri'] for group in ('buffers', 'images') for v in doc.get(group, []) if 'uri' in v],
        'nodes': [n.get('name') for n in doc.get('nodes', [])]}


def split_half(source, name, keep_top):
    mesh = bpy.data.objects.new(name, source.data.copy())
    bpy.context.collection.objects.link(mesh)
    bm = bmesh.new(); bm.from_mesh(mesh.data)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
        dist=1e-6, plane_co=(0, 0, SEAM), plane_no=(0, 0, 1),
        clear_inner=keep_top, clear_outer=not keep_top)
    bm.to_mesh(mesh.data); bm.free(); mesh.data.update()
    return mesh


def seal_cut(mesh, material, cavity=None):
    mesh.data.materials.append(material)
    index=len(mesh.data.materials)-1
    bm=bmesh.new();bm.from_mesh(mesh.data)
    edges={edge for edge in bm.edges if edge.is_boundary and all(abs(v.co.z-SEAM)<1e-4 for v in edge.verts)}
    if not edges: raise ValueError('No cut boundary found for '+mesh.name)
    components=[]
    while edges:
        group=set();pending=[edges.pop()]
        while pending:
            edge=pending.pop();group.add(edge)
            for vertex in edge.verts:
                for other in vertex.link_edges:
                    if other in edges:edges.remove(other);pending.append(other)
        components.append(group)
    main=max(components,key=lambda group:sum(edge.calc_length() for edge in group))
    for group in components:
        if cavity and group is main:
            inner={}
            for edge in group:
                for v in edge.verts:
                    if v not in inner:
                        factor=min(cavity[0]/max(abs(v.co.x),1e-8),cavity[1]/max(abs(v.co.y),1e-8))
                        inner[v]=bm.verts.new((v.co.x*factor,v.co.y*factor,SEAM))
            for edge in group:
                a,b=edge.verts
                face=bm.faces.new((a,b,inner[b],inner[a]));face.material_index=index;face.smooth=False
                face.normal_update()
                if face.normal.z<0:face.normal_flip()
        else:
            result=bmesh.ops.holes_fill(bm,edges=list(group),sides=0)
            for face in result['faces']:
                face.material_index=index;face.smooth=False
                face.normal_update()
                if face.normal.z>0:face.normal_flip()
    bm.to_mesh(mesh.data);bm.free();mesh.data.update()


def add_box(name, size, location, material, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object; obj.name = name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if parent:
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
    return obj


def merge_named(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join(); objects[0].name = name
    return objects[0]


def render_views(root, lid):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = False
    scene.render.resolution_x = 900; scene.render.resolution_y = 750; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world.color = (.5, .5, .5)
    scene.view_settings.view_transform = 'Standard'
    for location, energy, size in [((0,-3,5),500,4),((-3,2,4),350,3),((3,2,3),200,3)]:
        bpy.ops.object.light_add(type='AREA', location=location)
        light = bpy.context.object; light.data.energy = energy; light.data.size = size
        light.rotation_euler = (Vector((0,0,.6))-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(3,-4,3))
    camera = bpy.context.object; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 3.2
    camera.rotation_euler = (Vector((0,0,.8))-camera.location).to_track_quat('-Z','Y').to_euler(); scene.camera = camera
    for name, angle in [('runtime-closed',0), ('runtime-open',-1.9)]:
        lid.rotation_euler.x = angle
        scene.render.filepath = str(OUT / f'previews/{name}.png')
        bpy.ops.render.render(write_still=True)
    lid.rotation_euler.x = 0


def main():
    (OUT / 'runtime').mkdir(parents=True, exist_ok=True); (OUT / 'previews').mkdir(exist_ok=True)
    original = inspect(SOURCE)
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1: raise ValueError('Source topology changed; inspect again before preparation.')
    mesh = meshes[0]; bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    coords = [vertex.co for vertex in mesh.data.vertices]
    low = [min(v[i] for v in coords) for i in range(3)]; high = [max(v[i] for v in coords) for i in range(3)]
    scale = WIDTH/(high[0]-low[0]); center = [(low[i]+high[i])/2 for i in range(3)]
    for vertex in mesh.data.vertices:
        v=vertex.co; vertex.co=Vector(((v.x-center[0])*scale,(v.y-center[1])*scale,(v.z-low[2])*scale))
    # Coincident vertices exported at UV/material seams prevent aggressive
    # collapse. Weld only exact/submillimetre duplicates; UVs remain on loops.
    bm=bmesh.new();bm.from_mesh(mesh.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.000001)
    bm.to_mesh(mesh.data);bm.free();mesh.data.update()
    modifier=mesh.modifiers.new('Browser budget','DECIMATE'); modifier.ratio=BUDGET/original['triangles'];modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    textures=[]
    for image in bpy.data.images:
        if image.size[0]==0 or image.source not in {'FILE','GENERATED'}: continue
        old=list(image.size); factor=min(1,1024/max(old))
        if factor<1:image.scale(round(old[0]*factor),round(old[1]*factor))
        textures.append({'name':image.name,'before':old,'after':list(image.size)})
    body=split_half(mesh,'chest-body',False); lidmesh=split_half(mesh,'chest-lid-shell',True)
    bpy.data.objects.remove(mesh,do_unlink=True)
    # The provider mesh is a closed shell. Its newly exposed inside must be
    # explicitly lined: no solid cap across the treasure cavity.
    wood=bpy.data.materials.new('Dark walnut interior');wood.diffuse_color=(.105,.052,.024,1);wood.use_nodes=True
    bsdf=wood.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=wood.diffuse_color;bsdf.inputs['Roughness'].default_value=.86
    seal_cut(body, wood, cavity=(.65,.32))
    seal_cut(lidmesh, wood)
    liner=[add_box('Interior floor',(1.4,.76,.06),(0,0,.13),wood)]
    for x in [-.675,.675]: liner.append(add_box('Interior side',(.05,.76,.42),(x,0,.36),wood))
    for y in [-.345,.345]: liner.append(add_box('Interior front/back',(1.4,.05,.42),(0,y,.36),wood))
    # Overlap the analytic liner/rim edge by a narrow wooden lip. This
    # avoids a razor-black contact seam at the newly created cavity opening.
    for y in [-.32,.32]:liner.append(add_box('Inner rim lip',(1.34,.045,.025),(0,y,SEAM),wood))
    for x in [-.65,.65]:liner.append(add_box('Inner rim lip',(.045,.64,.025),(x,0,SEAM),wood))
    body=merge_named([body,*liner],'chest-body')
    # A flat wooden underside seals the actual arched outer lid at the measured
    # seam; its rim stays inside the imported decorative iron silhouette.
    # The boundary cap follows the imported lid silhouette exactly.
    lidmesh.name='chest-lid-shell'
    root=bpy.data.objects.new('nebeljagd-tripo-chest',None);bpy.context.collection.objects.link(root)
    lid=bpy.data.objects.new('chest-lid',None);bpy.context.collection.objects.link(lid);lid.location=HINGE;lid.parent=root
    body.parent=root
    lidmesh.parent=lid
    for v in lidmesh.data.vertices:v.co-=Vector(HINGE)
    bpy.ops.object.select_all(action='DESELECT');root.select_set(True);body.select_set(True);lid.select_set(True);lidmesh.select_set(True)
    bpy.context.view_layer.objects.active=root
    destination=OUT/'runtime/chest.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_texcoords=True,export_normals=True,export_animations=False,export_cameras=False,export_lights=False,export_image_format='AUTO')
    runtime=inspect(destination)
    report={'asset':'Nebeljagd Tripo chest','source':original,'runtime':runtime,'tool':'Blender '+bpy.app.version_string,
      'normalization':{'widthMeters':WIDTH,'uniformScale':scale,'gltfDimensions':[WIDTH,(high[2]-low[2])*scale,(high[1]-low[1])*scale], 'axes':'glTF +Y up, +Z front; bottom at 0', 'gltfHinge':[0,SEAM,-HINGE[1]],'openAngleRadians':-1.9},
      'textures':textures,'sourcePreserved':inspect(SOURCE)['sha256']==original['sha256'],
      'preparation':'Positional weld at 0.01mm and UV-preserving collapse reduction, 1024px original PBR maps, measured horizontal lid seam at 0.57m, separate rear hinge, dark wooden cavity liner and sealed lid underside.',
      'validation':{'embeddedOnly':not runtime['externalUris'],'trianglesWithin16000':runtime['triangles']<=16000,'animatedHingePresent':'chest-lid' in runtime['nodes'],'gpuRuntimeValidated':False},
      'license':{'status':'user-provided-project-asset','commercialReceipt':None,'authorization':'User requested integration of their uploaded Tripo items; no external provider job requested.'}}
    (OUT/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
    render_views(root,lid)
    (OUT/'README.md').write_text('''# Tripo-Truhe\n\nOriginal: `assets/inbox/treasure chest 3d model.glb` (unverändert).\nBrowser-Modell: `runtime/chest.glb`, 1,72 m breit. Der separate Knoten\n`chest-lid` dreht um das rückseitige Scharnier; die Öffnungsanimation und\nGold-/Waffenbeute werden vom vorhandenen Truhensystem gesteuert.\n\nDie geschlossene Originalhülle wurde am sichtbaren Deckelspalt geteilt.\nInnenwände, Innenboden und Deckelunterseite aus dunklem Holz ergänzen die\nbeim Öffnen neu sichtbaren Flächen. Die originalen PBR-Texturen bleiben erhalten.\n\nReproduktion: `blender -b -t 3 --python scripts/prepare-tripo-chest.py`.\n`inspection.json` enthält Maße und echte GLB-Zählwerte; `provenance.json`\nzeichnet Herkunft und Verarbeitung auf. `runtime-manifest.json` sichert alle\nPaketdateien mit SHA-256. Die Blender-Vorschauen zeigen geschlossen/offen.\nBrowserverhalten und GPU-Import werden separat bei der Integration geprüft.\n\nVom Nutzer bereitgestelltes Tripo-Modell. Kein kostenpflichtiger Dienst wurde\naufgerufen; ein separater kommerzieller Lizenzbeleg liegt diesem Paket nicht bei.\n''')
    provenance={'source':original,'runtime':runtime,'sourceOrigin':'User uploaded Tripo export in project assets/inbox; integration explicitly requested.',
      'providerJobId':None,'providerInvoked':False,'script':'scripts/prepare-tripo-chest.py','scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'command':'blender -b -t 3 --python scripts/prepare-tripo-chest.py','tool':report['tool'],'transform':report['normalization'],'method':report['preparation'],'sourcePreserved':report['sourcePreserved'],'license':report['license']}
    (OUT/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    files=[{'path':str(p.relative_to(OUT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='runtime-manifest.json']
    (OUT/'runtime-manifest.json').write_text(json.dumps({'name':'nebeljagd-tripo-chest','version':1,'kind':'source-preserving-local-editor-test-package','source':{'path':original['path'],'sha256':original['sha256']},'files':files,'validated':report['validation'],'licenseStatus':report['license'],'pending':['GPU import and gameplay QA','User artistic review']},indent=2)+'\n')
    print('CHEST_REPORT',json.dumps(report),flush=True)

if __name__=='__main__':main()
