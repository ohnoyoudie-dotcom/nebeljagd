"""Nebeljagd Umwelt-Kit v1 – Demo in Blender laden und Projekt speichern.
Anleitung: ZIP vollständig entpacken. In Blender: Arbeitsbereich Scripting,
diese Datei im Text Editor öffnen, dann 'Skript ausführen' wählen.
Das Skript ersetzt die GEÖFFNETE Szene durch die Demo – vorher separat speichern.
"""
import bpy
from pathlib import Path
from mathutils import Vector

# Wenn die Skriptdatei separat geöffnet wurde, den vollständigen Ordnerpfad wählen.
BASE = Path(bpy.path.abspath('//'))
if not (BASE / 'nebeljagd_walddorf_demo.glb').is_file():
    try:
        BASE = Path(__file__).resolve().parent
    except NameError:
        pass
if not (BASE / 'nebeljagd_walddorf_demo.glb').is_file():
    raise FileNotFoundError(
        'Bitte die Dateien vollständig entpacken und Blender-Projekt in diesem Ordner speichern. '
        f'Gesucht: {BASE / "nebeljagd_walddorf_demo.glb"}'
    )

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(BASE / 'nebeljagd_walddorf_demo.glb'))

# Sanfte, warme Sonne für Vorschau.
ldat=bpy.data.lights.new(name='Nebeljagd | Warme Sonne', type='SUN')
ldat.energy=2.1
ldat.angle=0.27
lamp=bpy.data.objects.new('Sonnenlicht',ldat)
bpy.context.collection.objects.link(lamp)
lamp.rotation_euler=(0.55,-0.47,-0.35)

world=bpy.context.scene.world
if world is None:
    world=bpy.data.worlds.new('Nebeljagd Himmel')
    bpy.context.scene.world=world
world.use_nodes=True
bg=world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value=(0.60,0.71,0.78,1.0)
    bg.inputs['Strength'].default_value=0.45

cam_data=bpy.data.cameras.new('Nebeljagd Isometrische Kamera')
cam=bpy.data.objects.new('Spielkamera',cam_data)
bpy.context.collection.objects.link(cam)
cam.location=(19,-23,22)
target=Vector((0,0,0.7))
cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
cam_data.type='ORTHO';cam_data.ortho_scale=29
scene=bpy.context.scene;scene.camera=cam
scene.render.resolution_x=1600;scene.render.resolution_y=900;scene.render.resolution_percentage=100
try:
    scene.render.engine='BLENDER_EEVEE_NEXT'
except Exception:
    pass

bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'nebeljagd_walddorf_demo.blend'))
print('Nebeljagd-Umwelt erfolgreich importiert:', BASE/'nebeljagd_walddorf_demo.blend')
