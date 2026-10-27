"""Extract the supplied Rei Geometry Nodes flowers, without executing source text.

Run: blender --background --disable-autoexec --python export_flowers.py -- SOURCE.blend OUTPUT_DIR [--render]
Output is a prototype library with original mesh shapes, normalized to 1 metre height.
The original Eevee Shader-to-RGB materials cannot run in glTF. Their existing RGB
and height ColorRamp palette is converted to linear vertex colors and a rough PBR
material; no replacement mesh or external texture is introduced.
"""
import bpy, bmesh, sys, json, hashlib, math
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source=Path(args[0]); out=Path(args[1]);out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False)
original_version=list(bpy.data.version)
prototypes=[('Flower.001','Rei_Flower_White'),('Flower.002','Rei_Flower_Red'),('Flower.003','Rei_Flower_Gold')]
material=bpy.data.materials.new('Rei_Flower_Palette_PBR');material.use_nodes=True
material.diffuse_color=(1,1,1,1);material.use_backface_culling=False
principled=material.node_tree.nodes.get('Principled BSDF');principled.inputs['Roughness'].default_value=.85
vertex=material.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='Color'
material.node_tree.links.new(vertex.outputs['Color'],principled.inputs['Base Color'])
def face_subset(original, indices, name):
 derived=original.copy();derived.name=name
 bm=bmesh.new();bm.from_mesh(derived);bm.faces.ensure_lookup_table()
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in indices],context='FACES')
 unused=[v for v in bm.verts if not v.link_faces]
 if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
 bm.to_mesh(derived);bm.free();derived.update();derived.calc_loop_triangles()
 return derived
variants=[]; objects=[]
for index,(name,targetname) in enumerate(prototypes):
 source_obj=bpy.data.objects[name]
 modifier=next(m for m in source_obj.modifiers if m.type=='NODES')
 modifier.node_group=modifier.node_group.copy()
 group=modifier.node_group
 output=next(n for n in group.nodes if n.bl_idname=='NodeGroupOutput' and n.is_active_output)
 output_geometry=next(s for s in output.inputs if s.type=='GEOMETRY')
 original_link=output_geometry.links[0]
 realized=group.nodes.new('GeometryNodeRealizeInstances')
 group.links.new(original_link.from_socket,realized.inputs['Geometry']);group.links.new(realized.outputs['Geometry'],output_geometry)
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
 evaluated=source_obj.evaluated_get(dg)
 mesh=bpy.data.meshes.new_from_object(evaluated,preserve_all_data_layers=True,depsgraph=dg)
 mesh.name=targetname+'_Mesh'
 source_materials=list(mesh.materials)
 bounds=[(min(v.co[i] for v in mesh.vertices),max(v.co[i] for v in mesh.vertices)) for i in range(3)]
 height=bounds[2][1]-bounds[2][0]
 colors=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
 palette=[];protected_faces=set()
 for polygon in mesh.polygons:
  source_material=source_materials[polygon.material_index] if polygon.material_index<len(source_materials) else None
  if source_material:
   if source_material.name=='Flower_stem':protected_faces.add(polygon.index)
   ramp=source_material.node_tree.nodes.get('ColorRamp.001') if source_material.name.startswith('Flower_petal') else None
   color_node=source_material.node_tree.nodes.get('RGB')
   base=tuple(color_node.outputs[0].default_value) if color_node else (.152926,.371238,.08022,1)
   palette.append(source_material.name)
  else:ramp=None;base=(.152926,.371238,.08022,1)
  for loop_index in polygon.loop_indices:
   v=mesh.vertices[mesh.loops[loop_index].vertex_index]
   t=(v.co.z-bounds[2][0])/height
   c=tuple(ramp.color_ramp.evaluate(t)) if ramp else base
   colors.data[loop_index].color=c
 for v in mesh.vertices:v.co.z-=bounds[2][0];v.co/=height
 mesh.materials.clear();mesh.materials.append(material)
 for p in mesh.polygons:p.material_index=0
 mesh.calc_loop_triangles()
 source_triangles=len(mesh.loop_triangles)
 obj=bpy.data.objects.new(targetname,mesh);bpy.context.scene.collection.objects.link(obj)
 if source_triangles>1400:
  stem=face_subset(mesh,protected_faces,targetname+'_ProtectedStem')
  head=face_subset(mesh,set(range(len(mesh.polygons)))-protected_faces,targetname+'_FlowerHead')
  obj.data=head;bpy.data.meshes.remove(mesh)
  decimate=obj.modifiers.new('Browser LOD original petals; intact stem','DECIMATE')
  decimate.ratio=(1380-len(stem.loop_triangles))/len(head.loop_triangles);decimate.use_collapse_triangulate=True
  bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
  simplified=bpy.data.meshes.new_from_object(obj.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
  simplified.name=targetname+'_RuntimeMesh'
  obj.modifiers.clear();obj.data=simplified;bpy.data.meshes.remove(head)
  stem_object=bpy.data.objects.new(targetname+'_Stem',stem);bpy.context.scene.collection.objects.link(stem_object)
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);stem_object.select_set(True)
  bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
  mesh=obj.data;mesh.calc_loop_triangles()
 obj.location=(index*.8-.8,0,0)
 obj['source_file']=source.name;obj['source_object']=name;obj['normalized_height_m']=1.0
 objects.append(obj)
 variants.append({'name':targetname,'source_object':name,'source_height_m':height,'normalized_height_m':1.0,'source_bounds_blender':bounds,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'source_realized_triangles':source_triangles,'normalization':'Realize GN, convert original palette, normalize height, preserve stem geometry, simplify flower head only if above1400triangles' ,'source_materials':sorted(set(palette)),'export_offset_x':obj.location.x})
# Exports only derived prototypes. Scatter plane, source library and Sun stay out.
bpy.ops.object.select_all(action='DESELECT')
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
destination=out/'flowers.glb'
bpy.ops.export_scene.gltf(filepath=str(destination),export_format='GLB',use_selection=True,
 export_animations=False,export_yup=True,export_apply=False,export_materials='EXPORT',export_all_vertex_colors=True,export_extras=True)
report={'source':str(source),'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_blender_version':original_version,'export_blender_version':list(bpy.app.version),'original_modified':False,'external_images':[],'variants':variants,'triangles_total':sum(v['triangles'] for v in variants),'material_conversion':'Original ShaderToRGB toon network replaced by original RGB/height-ColorRamp values in vertex colors plus rough Principled PBR; lighting-dependent toon ramps are not portable. Geometry is realized from the original nodes, not recreated.','output':str(destination),'output_bytes':destination.stat().st_size,'output_sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
(out/'flowers-export-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if '--render' in args:
 for obj in list(bpy.context.scene.objects):
  if obj not in objects:obj.hide_render=True
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.use_nodes=False
 for layer in scene.view_layers:
  if hasattr(layer,'cycles'):layer.cycles.use_denoising=False
 for obj in objects:obj.hide_render=False
 scene.render.resolution_x=1050;scene.render.resolution_y=700;scene.render.resolution_percentage=100
 scene.world.color=(.18,.18,.18)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025));ground=bpy.context.object
 gm=bpy.data.materials.new('preview_ground');gm.diffuse_color=(.115,.16,.105,1);ground.data.materials.append(gm)
 bpy.ops.object.light_add(type='AREA',location=(-3,-4,6));bpy.context.object.data.energy=650;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=5
 bpy.ops.object.light_add(type='AREA',location=(3,2,4));bpy.context.object.data.energy=400;bpy.context.object.data.size=4
 bpy.ops.object.camera_add(location=(2.4,-4.5,3.1));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,.50))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.4;scene.camera=cam
 scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 scene.render.filepath=str(out/'flowers-preview.png');bpy.ops.render.render(write_still=True)
