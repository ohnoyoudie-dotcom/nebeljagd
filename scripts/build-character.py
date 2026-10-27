"""Original Nebeljagd ranger. Blender 4.3+, no external assets.

Run: blender --background --python scripts/build-character.py
All coordinates are metres, Z up, facing -Y; glTF exports Y up, facing +Z.
"""
import bpy
import math
import random
import json
import struct
import hashlib
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'characters'
OUT.mkdir(parents=True, exist_ok=True)
random.seed(271027)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
V, F, C, M, W = [], [], [], [], []

PALETTE = {
    'cloth': (0.105, 0.235, 0.211, 1), 'light': (0.18, 0.34, 0.285, 1),
    'dark': (0.067, 0.125, 0.119, 1), 'leather': (0.235, 0.13, 0.069, 1),
    'edge': (0.36, 0.223, 0.112, 1), 'pants': (0.13, 0.16, 0.15, 1),
    'skin': (0.62, 0.40, 0.26, 1), 'skinlight': (0.74, 0.51, 0.33, 1),
    'hair': (0.155, 0.094, 0.055, 1), 'gold': (0.67, 0.47, 0.19, 1),
    'linen': (0.46, 0.43, 0.32, 1), 'gem': (0.12, 0.67, 0.52, 1),
}

def part(vertices, faces, color, weights, mat=0, smooth=True):
    offset = len(V)
    V.extend(vertices)
    if isinstance(weights, str):
        W.extend([{weights: 1.0} for _ in vertices])
    else:
        W.extend(weights)
    for face in faces:
        F.append(tuple(index + offset for index in face))
        tint = 1.0 if smooth else 0.97 + random.random() * 0.06
        base = PALETTE[color] if isinstance(color, str) else color
        C.append(tuple(component * tint for component in base[:3]) + (1,))
        M.append((mat, smooth))

def ellipsoid(center, radii, color, bone, segments=16, rings=10, mat=0):
    vertices, faces = [], []
    for r in range(rings + 1):
        phi = math.pi * r / rings
        for n in range(segments):
            theta = 2 * math.pi * n / segments
            vertices.append((center[0] + radii[0] * math.sin(phi) * math.cos(theta),
                             center[1] + radii[1] * math.sin(phi) * math.sin(theta),
                             center[2] + radii[2] * math.cos(phi)))
    for r in range(rings):
        for n in range(segments):
            a = r * segments + n
            b = r * segments + (n + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    part(vertices, faces, color, bone, mat)

def rings(levels, color, bone, segments=16, mat=0):
    """Levels = (z, half-width, half-depth, y-shift)."""
    vertices, weights, faces = [], [], []
    for z, x_radius, y_radius, cy in levels:
        for n in range(segments):
            a = n * math.tau / segments
            # Fabric folds remain subtle from a close camera.
            fold = 1 + .026 * math.sin(n * 2.7 + z * 13)
            vertices.append((math.cos(a) * x_radius * fold, cy + math.sin(a) * y_radius * fold, z))
            weights.append(bone(z) if callable(bone) else {bone: 1})
    for row in range(len(levels) - 1):
        for n in range(segments):
            a = row * segments + n
            b = row * segments + (n + 1) % segments
            faces.append((a, b, b + segments, a + segments))
    faces.extend([tuple(reversed(range(segments))), tuple((len(levels)-1)*segments+n for n in range(segments))])
    part(vertices, faces, color, weights, mat)

def segment(start, end, radii, color, bone, sides=12, mat=0):
    start, end = Vector(start), Vector(end)
    axis = (end-start).normalized()
    tangent = axis.cross(Vector((0, 1, 0))).normalized()
    bitangent = axis.cross(tangent).normalized()
    vertices, faces = [], []
    for t, radius in radii:
        point = start.lerp(end, t)
        for i in range(sides):
            angle = i * math.tau / sides
            vertex = point + radius * (tangent*math.cos(angle)+bitangent*math.sin(angle))
            vertices.append(tuple(vertex))
    for row in range(len(radii)-1):
        for i in range(sides):
            a = row*sides+i
            b = row*sides+(i+1)%sides
            faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))), tuple((len(radii)-1)*sides+i for i in range(sides))])
    part(vertices,faces,color,bone,mat)

def block(center, scale, color, bone, bevel=.015, mat=0, rotation=0):
    """Beveled solid, baked into the one skinned body mesh."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj=bpy.context.object
    obj.scale=scale
    obj.rotation_euler[1]=rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod=obj.modifiers.new('Soft hand-worked edges','BEVEL')
    mod.width=bevel; mod.segments=2
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    matrix=obj.matrix_world
    vertices=[tuple(matrix@v.co) for v in obj.data.vertices]
    faces=[tuple(p.vertices) for p in obj.data.polygons]
    part(vertices,faces,color,bone,mat,smooth=False)
    bpy.data.objects.remove(obj,do_unlink=True)

def torso_weights(z):
    if z < 1.12: return {'Pelvis':1}
    t=min(1,max(0,(z-1.12)/.35))
    return {'Spine':1-t,'Chest':t}

# Tailored tunic, layered shoulders, fitted belt and overlapping coat panels.
rings([(1.00,.235,.155,0),(1.10,.245,.17,0),(1.22,.23,.15,0),
       (1.39,.29,.17,0),(1.51,.325,.155,0),(1.56,.255,.13,0)],'cloth',torso_weights)
rings([(.83,.31,.175,0),(.89,.30,.18,0),(1.06,.24,.16,0)],'dark','Pelvis')
for side in (-1,1):
    # The split front hem follows its thigh rather than slicing through it.
    vertices=[(side*.018,-.174,1.07),(side*.235,-.145,1.07),
              (side*.32,-.19,.78),(side*.045,-.225,.75)]
    part(vertices,[(0,1,2,3)],'light',f'Thigh.{"L" if side>0 else "R"}')
    segment((side*.25,-.151,1.08),(side*.315,-.192,.80),[(0,.009),(1,.009)],'gold','Pelvis',6,1)
rings([(1.045,.254,.179,0),(1.105,.251,.178,0)],'leather','Pelvis',20)
block((0,-.187,1.075),(.105,.032,.07),'gold','Pelvis',.008,1)
block((0,-.208,1.075),(.065,.012,.035),'dark','Pelvis',.004)
for side in (-1,1):
    block((side*.24,-.07,1.04),(.125,.14,.16),'leather','Pelvis',.022)
    block((side*.24,-.148,1.055),(.09,.016,.075),'edge','Pelvis',.008)
    ellipsoid((side*.24,-.162,1.055),(.012,.007,.012),'gold','Pelvis',8,5,1)

# Legs are long enough for adult proportions. Knee caps and boot folds give readable articulation.
for side, suffix in ((1,'L'),(-1,'R')):
    thigh=f'Thigh.{suffix}'; shin=f'Shin.{suffix}'; foot=f'Foot.{suffix}'
    segment((side*.145,0,1.02),(side*.15,-.005,.57),[(0,.128),(.22,.125),(.80,.092),(1,.085)],'pants',thigh)
    ellipsoid((side*.15,-.02,.575),(.09,.089,.095),'pants',shin,12,8)
    segment((side*.15,0,.60),(side*.15,.005,.17),[(0,.091),(.2,.09),(.7,.075),(1,.075)],'leather',shin)
    segment((side*.15,0,.48),(side*.15,0,.525),[(0,.10),(1,.10)],'edge',shin)
    segment((side*.15,-.012,.24),(side*.15,-.012,.28),[(0,.084),(1,.084)],'edge',shin)
    block((side*.15,-.063,.12),(.185,.33,.18),'leather',foot,.040)
    block((side*.15,-.076,.043),(.198,.343,.065),'dark',foot,.018)
    block((side*.15,-.165,.15),(.175,.11,.08),'edge',foot,.025)
    for level in range(3):
        block((side*.15,-.088,.31+level*.052),(.10,.014,.009),'linen',shin,.003)

# Sleeves / bracers / gloves; arms bend at an actual armature elbow.
for side,suffix in ((1,'L'),(-1,'R')):
    upper=f'UpperArm.{suffix}'; lower=f'Forearm.{suffix}'; hand=f'Hand.{suffix}'
    ellipsoid((side*.302,0,1.49),(.139,.15,.145),'light',upper)
    ellipsoid((side*.312,.008,1.545),(.146,.153,.071),'leather',upper,16,8)
    for offset in (-.075,.075):
        ellipsoid((side*.35,offset,1.595),(.014,.014,.010),'gold',upper,8,5,1)
    segment((side*.32,0,1.49),(side*.40,0,1.23),[(0,.119),(.32,.126),(.75,.097),(1,.091)],'cloth',upper)
    ellipsoid((side*.40,0,1.23),(.093,.095,.092),'cloth',lower,12,8)
    segment((side*.40,0,1.235),(side*.435,-.005,1.015),[(0,.088),(.2,.094),(.8,.073),(1,.069)],'leather',lower)
    segment((side*.405,-.003,1.20),(side*.409,-.003,1.177),[(0,.098),(1,.098)],'edge',lower)
    segment((side*.43,-.003,1.065),(side*.434,-.003,1.04),[(0,.081),(1,.081)],'gold',lower,12,1)
    ellipsoid((side*.443,-.01,.98),(.076,.077,.105),'leather',hand,12,8)
    for z in (1.10,1.15):
        ellipsoid((side*.41,-.089,z),(.015,.008,.015),'gold',lower,8,5,1)

# Collar and scarf, fitting a small anatomically proportioned head.
segment((0,0,1.55),(0,0,1.68),[(0,.095),(1,.088)],'skin','Neck')
rings([(1.51,.215,.15,.02),(1.58,.185,.14,.015),(1.65,.13,.10,.005)],'dark','Chest',20)
rings([(1.57,.173,.145,0),(1.61,.16,.13,0)],'linen','Neck',20)
# Shaped jaw, cheekbones and cranial vault; not a spherical mascot head.
rings([(1.66,.079,.075,-.013),(1.69,.106,.084,-.022),(1.75,.129,.106,-.012),
       (1.82,.134,.115,0),(1.90,.127,.106,.005),(1.97,.085,.08,.01),
       (1.99,.025,.025,.012)],'skin','Head',20)
for side in (-1,1):
    ellipsoid((side*.129,0,1.79),(.029,.028,.048),'skin','Head',10,7)
    # Narrow eyes, eyebrow and a subtle cheek plane.
    block((side*.051,-.109,1.818),(.044,.009,.010),'dark','Head',.003)
    block((side*.052,-.105,1.843),(.053,.012,.012),'hair','Head',.003,rotation=side*.12)
    ellipsoid((side*.071,-.100,1.775),(.040,.012,.023),'skin','Head',10,6)
ellipsoid((0,-.117,1.79),(.020,.034,.035),'skin','Head',10,7)
block((0,-.095,1.711),(.05,.013,.008),'leather','Head',.003)
# A leather hood follows the skull and has an open face, several seams and a pointed nape.
hood_vertices,hood_faces=[],[]
for row in range(10):
    t=row/9
    z=1.62+t*.43
    radius=math.sin(t*math.pi*.83)*.158+.063*(1-t)
    for i in range(17):
        angle=math.radians(-115)+i/16*math.radians(230)
        hood_vertices.append((math.sin(angle)*radius,math.cos(angle)*radius+.042,z))
for row in range(9):
    for i in range(16):
        a=row*17+i
        hood_faces.append((a,a+1,a+18,a+17))
part(hood_vertices,hood_faces,'cloth','Head')
for side in (-1,1):
    segment((side*.11,-.08,1.68),(side*.135,-.07,1.91),[(0,.012),(1,.009)],'edge','Head',8)
ellipsoid((0,.055,2.015),(.07,.07,.036),'cloth','Head',12,7)
# Hair visible above the forehead, deliberately asymmetrical locks.
for i in range(5):
    x=-.09+i*.043
    z=1.94+(i%2)*.009
    vertices=[(x-.024,-.061,z+.025),(x+.026,-.061,z+.025),
              (x+.035,-.107,z),(x-.005,-.119,z-.051),(x-.027,-.105,z-.006)]
    part(vertices,[(0,1,2),(0,2,3,4)],'hair','Head',smooth=False)

# Diagonal chest strap, seam stitches, shoulder insignia and travel pack.
segment((-.22,-.157,1.49),(.17,-.173,1.12),[(0,.024),(1,.024)],'edge','Spine',8)
block((-.03,-.19,1.305),(.055,.02,.085),'gold','Spine',.006,1,rotation=-.72)
ellipsoid((.18,-.163,1.46),(.039,.02,.039),'gold','Chest',12,8,1)
ellipsoid((.18,-.188,1.46),(.022,.012,.025),'gem','Chest',10,8,2)
block((0,.198,1.36),(.34,.15,.38),'leather','Chest',.045)
block((0,.282,1.37),(.27,.025,.18),'edge','Chest',.020)
for x in (-.108,.108):
    block((x,.300,1.38),(.025,.013,.23),'dark','Chest',.005)
    block((x,.310,1.38),(.045,.012,.045),'gold','Chest',.005,1)
segment((-.21,.211,1.58),(.21,.211,1.58),[(0,.073),(1,.073)],'linen','Chest',12)
for x in (-.12,.12):
    segment((x,.219,1.50),(x,.219,1.66),[(0,.080),(1,.080)],'leather','Chest',10)
# Short split cloak, shaped and weighted between chest and pelvis.
verts,faces,weights=[],[],[]
for row in range(7):
    t=row/6
    for col in range(9):
        u=col/8
        x=(u-.5)*(.49+t*.15)
        y=.145+t*.125+.025*math.sin(u*math.tau*2)
        z=1.52-t*.77+.025*math.sin(u*math.tau*2)
        verts.append((x,y,z))
        weights.append({'Chest':1-t,'Pelvis':t})
for row in range(6):
    for col in range(8):
        a=row*9+col;faces.append((a,a+1,a+10,a+9))
part(verts,faces,'dark',weights)

# Bake the authoring geometry into one skinned mesh and three material primitives.
mesh=bpy.data.meshes.new('Ranger tailored skin geometry')
mesh.from_pydata(V,[],F);mesh.update()
body=bpy.data.objects.new('Ranger_Body',mesh)
bpy.context.collection.objects.link(body)
color_attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
for poly, color, (material_index,smooth) in zip(mesh.polygons,C,M):
    poly.material_index=material_index;poly.use_smooth=smooth
    for loop_index in poly.loop_indices:color_attr.data[loop_index].color=color
for index,(name,metal,rough,emission) in enumerate((('Woven cloth and worn leather',0,.79,0),('Aged brass fittings',.65,.44,0),('Warden seal',.1,.34,.25))):
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    principled=mat.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Base Color'].default_value=(1,1,1,1)
    principled.inputs['Metallic'].default_value=metal
    principled.inputs['Roughness'].default_value=rough
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Color'
    mat.node_tree.links.new(attr.outputs['Color'],principled.inputs['Base Color'])
    if emission:
        mat.node_tree.links.new(attr.outputs['Color'],principled.inputs['Emission Color'])
        principled.inputs['Emission Strength'].default_value=emission
    mat.surface_render_method='DITHERED'
    mat.use_backface_culling=False
    mesh.materials.append(mat)

rig_data=bpy.data.armatures.new('Ranger humanoid skeleton')
rig=bpy.data.objects.new('Ranger_Rig',rig_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
    item=rig_data.edit_bones.new(name);item.head=head;item.tail=tail
    if parent:item.parent=rig_data.edit_bones[parent]
    return item
bone('Root',(0,0,0),(0,0,.2))
bone('Pelvis',(0,0,1.00),(0,0,1.15),'Root')
bone('Spine',(0,0,1.15),(0,0,1.41),'Pelvis')
bone('Chest',(0,0,1.41),(0,0,1.58),'Spine')
bone('Neck',(0,0,1.58),(0,0,1.70),'Chest')
bone('Head',(0,0,1.70),(0,0,1.99),'Neck')
for side,suffix in ((1,'L'),(-1,'R')):
    bone(f'Thigh.{suffix}',(side*.145,0,1.02),(side*.15,0,.57),'Pelvis')
    bone(f'Shin.{suffix}',(side*.15,0,.57),(side*.15,0,.17),f'Thigh.{suffix}')
    bone(f'Foot.{suffix}',(side*.15,0,.17),(side*.15,-.20,.12),f'Shin.{suffix}')
    bone(f'UpperArm.{suffix}',(side*.30,0,1.49),(side*.40,0,1.23),'Chest')
    bone(f'Forearm.{suffix}',(side*.40,0,1.23),(side*.435,0,1.015),f'UpperArm.{suffix}')
    bone(f'Hand.{suffix}',(side*.435,0,1.015),(side*.44,0,.94),f'Forearm.{suffix}')
bpy.ops.object.mode_set(mode='OBJECT')
for name in rig_data.bones.keys():body.vertex_groups.new(name=name)
for index,weights in enumerate(W):
    total=sum(weights.values())
    for name,weight in weights.items():
        if weight>0:body.vertex_groups[name].add([index],weight/total,'REPLACE')
modifier=body.modifiers.new('Ranger skeletal deformation','ARMATURE');modifier.object=rig
body.parent=rig
rig.animation_data_create()

def action(name, frames, sampler):
    animation=bpy.data.actions.new(name)
    rig.animation_data.action=animation
    for frame in frames:
        for pose in rig.pose.bones:
            pose.rotation_mode='XYZ';pose.rotation_euler=(0,0,0);pose.location=(0,0,0)
        sampler((frame-1)/(frames[-1]-1))
        for pose in rig.pose.bones:
            pose.keyframe_insert(data_path='rotation_euler',frame=frame,group=pose.name)
            if pose.name in ('Root','Pelvis'):pose.keyframe_insert(data_path='location',frame=frame,group=pose.name)
    for curve in animation.fcurves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,animation)
    strip.action_frame_start=frames[0];strip.action_frame_end=frames[-1]
    return animation

def idle(t):
    p=math.sin(t*math.tau)
    rig.pose.bones['Chest'].rotation_euler.x=.018*p
    rig.pose.bones['Head'].rotation_euler.z=.021*math.sin(t*math.tau+.7)
    rig.pose.bones['Pelvis'].location.y=.007*p
    for side,suffix in ((1,'L'),(-1,'R')):
        rig.pose.bones[f'UpperArm.{suffix}'].rotation_euler.y=side*.025*p
        rig.pose.bones[f'Forearm.{suffix}'].rotation_euler.x=.035+.017*p
def walk(t):
    p=math.sin(t*math.tau)
    # A grounded stance: compensate the shorter vertical projection of a stride.
    rig.pose.bones['Root'].location.y=-.075*abs(p)
    rig.pose.bones['Pelvis'].rotation_euler.y=.055*p
    rig.pose.bones['Chest'].rotation_euler.x=.055
    rig.pose.bones['Chest'].rotation_euler.y=-.035*p
    for side,suffix in ((1,'L'),(-1,'R')):
        q=p*side
        rig.pose.bones[f'Thigh.{suffix}'].rotation_euler.x=.62*q
        rig.pose.bones[f'Shin.{suffix}'].rotation_euler.x=max(0,-q)*.84
        rig.pose.bones[f'Foot.{suffix}'].rotation_euler.x=-.18*q
        rig.pose.bones[f'UpperArm.{suffix}'].rotation_euler.x=-.48*q
        rig.pose.bones[f'Forearm.{suffix}'].rotation_euler.x=.20+max(0,q)*.28
    rig.pose.bones['Head'].rotation_euler.y=-.025*p
action('Idle',list(range(1,50,4))+[49],idle)
action('Walk',list(range(1,18,2))+[17],walk)
rig.animation_data.action=None
for track in rig.animation_data.nla_tracks:track.mute=False
bpy.context.scene.render.fps=24
bpy.context.scene.frame_set(1)
# Keep source with a simple studio setup; only rig/body are exported.
bpy.ops.object.camera_add(location=(3,-5,3.3))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,1.08))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO';camera.data.ortho_scale=2.8
bpy.context.scene.camera=camera
for location,power,size in (((-3,-4,5),500,4),((3,1,4),400,3)):
    bpy.ops.object.light_add(type='AREA',location=location)
    light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene;scene.world.color=(.08,.10,.10)
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=False
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ranger.blend'))
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'ranger.glb'),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_skins=True,
    export_yup=True,export_apply=False,export_materials='EXPORT',export_all_vertex_colors=True)
mesh.calc_loop_triangles()
report={'asset':'Nebeljagd original ranger','generator':'scripts/build-character.py','blender':bpy.app.version_string,
        'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'materials':len(mesh.materials),
        'bones':len(rig_data.bones),'clips':['Idle','Walk'],'height_metres':round(max(v[2] for v in V),3),
        'source':'Original local Blender geometry; no third-party models, textures or motion capture.'}
binary=(OUT/'ranger.glb').read_bytes()
magic,version,byte_length=struct.unpack_from('<4sII',binary)
assert magic==b'glTF' and version==2 and byte_length==len(binary)
json_size,json_kind=struct.unpack_from('<II',binary,12)
assert json_kind==0x4e4f534a
document=json.loads(binary[20:20+json_size])
assert len(document['skins'])==1 and len(document['skins'][0]['joints'])==18
assert {clip['name'] for clip in document['animations']}=={'Idle','Walk'}
for primitive in document['meshes'][0]['primitives']:
    assert {'POSITION','NORMAL','COLOR_0','JOINTS_0','WEIGHTS_0'}.issubset(primitive['attributes'])
report['runtime_inspection']={'format':'glTF 2.0 binary','bytes':len(binary),
    'sha256':hashlib.sha256(binary).hexdigest(),'skins':len(document['skins']),
    'joints':len(document['skins'][0]['joints']),'primitives':len(document['meshes'][0]['primitives']),
    'exported_vertices':sum(document['accessors'][p['attributes']['POSITION']]['count'] for p in document['meshes'][0]['primitives']),
    'animations':[clip['name'] for clip in document['animations']],
    'vertex_attributes':['POSITION','NORMAL','COLOR_0','JOINTS_0','WEIGHTS_0']}
(OUT/'inspection.json').write_text(json.dumps(report,indent=2))
print('NEBELJAGD_CHARACTER '+json.dumps(report))
if '--render' in sys.argv:
    scene.render.filepath=str(OUT/'ranger-preview.png')
    bpy.ops.render.render(write_still=True)
