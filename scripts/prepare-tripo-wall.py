"""Source-preserving preparation of the owner's weathered Tripo stone wall.
Run: blender -b -t 3 --python scripts/prepare-tripo-wall.py
No provider invocation. Runtime models and evidence are written in tripo-wall/.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets/imported/tripo-wall'
SOURCE = ROOT / 'assets/inbox/stone wall 3d model.glb'
SPEC = {'length': 6.0, 'triangleBudget': 12000, 'textureLimit': 2048, 'normalTextureLimit': 1536, 'fileLimitBytes': 4 * 1024 * 1024}
spec = importlib.util.spec_from_file_location('existing_prop_preparation', ROOT / 'scripts/prepare-tripo-props.py')
helpers = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helpers)
helpers.OUTPUT = OUTPUT
inspect, digest, bounds, coordinates, gltf_bounds = helpers.inspect, helpers.digest, helpers.bounds, helpers.coordinates, helpers.gltf_bounds


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def main():
    for name in ['runtime', 'previews']:
        (OUTPUT / name).mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    original = inspect(SOURCE)
    if original['externalUris']:
        raise ValueError('External source dependencies require inspection before import.')
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
    if len(meshes) != 1:
        raise ValueError('Expected the inspected one-mesh wall source.')
    mesh = meshes[0]
    mesh.name = 'nebeljagd-tripo-weathered-stone-wall'
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    source_bounds = bounds(mesh)
    factor = SPEC['length'] / (source_bounds[1][0] - source_bounds[0][0])
    mesh.scale = (factor, factor, factor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    scaled = bounds(mesh)
    offset = [(scaled[0][0]+scaled[1][0])/2, (scaled[0][1]+scaled[1][1])/2, scaled[0][2]]
    for vertex in mesh.data.vertices:
        vertex.co -= Vector(offset)
    helpers.render(mesh, 'wall', 'source')
    bpy.context.view_layer.objects.active = mesh
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True)
    editable = bmesh.new()
    editable.from_mesh(mesh.data)
    before = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    weld = SPEC['length'] * .00005
    bmesh.ops.remove_doubles(editable, verts=list(editable.verts), dist=weld)
    bmesh.ops.dissolve_degenerate(editable, edges=list(editable.edges), dist=weld * .1)
    cleaned = {'vertices': len(editable.verts), 'faces': len(editable.faces)}
    editable.to_mesh(mesh.data)
    editable.free()
    mesh.data.update()
    mesh.data.calc_loop_triangles()
    modifier = mesh.modifiers.new('Repeated wall browser budget', 'DECIMATE')
    modifier.ratio = min(1, SPEC['triangleBudget'] / len(mesh.data.loop_triangles))
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    images = []
    for image in bpy.data.images:
        if image.source not in {'FILE', 'GENERATED'} or not image.size[0]:
            continue
        old = list(image.size)
        limit = SPEC['normalTextureLimit'] if 'normal' in image.name.lower() else SPEC['textureLimit']
        ratio = min(1, limit / max(old))
        if ratio < 1:
            image.scale(max(1, round(old[0] * ratio)), max(1, round(old[1] * ratio)))
        images.append({'name': image.name, 'sourceSize': old, 'runtimeSize': list(image.size), 'format': image.file_format})
    simplified = bounds(mesh)
    recenter = [(simplified[0][0]+simplified[1][0])/2, (simplified[0][1]+simplified[1][1])/2, simplified[0][2]]
    for vertex in mesh.data.vertices:
        vertex.co -= Vector(recenter)
    # Small simplification drift is restored uniformly, never stretching wall
    # thickness or height separately. Repeat direction remains local X.
    b = bounds(mesh)
    final_scale = SPEC['length'] / (b[1][0]-b[0][0])
    for vertex in mesh.data.vertices:
        vertex.co *= final_scale
    final_bounds = gltf_bounds(bounds(mesh))
    destination = OUTPUT / 'runtime/wall.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
        export_yup=True, export_texcoords=True, export_normals=True, export_materials='EXPORT',
        export_animations=False, export_cameras=False, export_lights=False, export_image_format='AUTO')
    runtime = inspect(destination)
    validation = {
        'sourceUnchanged': digest(SOURCE) == original['sha256'],
        'embeddedDependenciesOnly': not runtime['externalUris'],
        'triangleBudgetPassed': runtime['triangles'] <= SPEC['triangleBudget'],
        'fileBudgetPassed': runtime['bytes'] <= SPEC['fileLimitBytes'],
        'preservedUVAndNormals': {'NORMAL','TEXCOORD_0'} <= set(runtime['attributes']),
        'preservedMaterialCount': runtime['materials'] == original['materials'],
        'embeddedPBRTextures': runtime['embeddedImages'] == 3,
        'textureBudgetPassed': all(max(image['runtimeSize']) <= SPEC['textureLimit'] for image in images),
    }
    report = {'id':'wall','label':'Steinmauer · Verwittert (Tripo)', 'source':original,'runtime':runtime,
        'normalization':{'uniformScale':factor,'finalUniformScale':final_scale,'blenderSourceBounds':source_bounds,
            'centerGroundOffsetBlender':offset,'simplifiedCenterGroundOffsetBlender':recenter,
            'gltfBounds':final_bounds,'dimensions':[final_bounds[1][i]-final_bounds[0][i] for i in range(3)],
            'axes':'glTF +Y up; local X repeat direction; X/Z centered; bottom Y=0; original proportions retained'},
        'cleanup':{'weldDistanceMetres':weld,'before':before,'after':cleaned},'textures':images,
        'policy':SPEC,'validation':validation}
    save_json(OUTPUT/'inspection.json',report)
    if not all(validation.values()):
        raise ValueError('Static validation failed: '+json.dumps(validation))
    helpers.render(mesh, 'wall', 'runtime')
    dims=report['normalization']['dimensions']
    lo,hi=final_bounds
    definition = {'id':'wall:kit-tripo-wall','kind':'wall','variant':'kit-tripo-wall','file':'wall.glb','asset':'tripo-wall',
        'label':'Steinmauer · Verwittert (Tripo)','height':hi[1],'nativeBounds':{'min':lo,'max':hi},'targetHeight':hi[1]-lo[1],
        'normalization':{'scale':1,'offset':[0,0,0]},'footprint':{'halfWidth':max(abs(lo[0]),abs(hi[0])),'halfDepth':max(abs(lo[2]),abs(hi[2]))},
        'walls':[{'minX':lo[0],'maxX':hi[0],'minZ':lo[2],'maxZ':hi[2],'minY':0,'maxY':hi[1],'type':'wall'}],
        'circles':[],'solid':True,'textured':True}
    (ROOT/'src/map/tripo-wall-definition.js').write_text('/** Measured prepared Tripo wall, metres, local X repeat axis.\n * Original and validation: assets/imported/tripo-wall/inspection.json. */\nexport const TRIPO_WALL_DEFINITION = '+json.dumps(definition,ensure_ascii=False,indent=2)+';\n')
    provenance={'package':'nebeljagd-tripo-wall','version':1,
        'sourceOrigin':'Project owner supplied the Tripo GLB in assets/inbox and explicitly requested game/editor integration.',
        'provider':{'name':'Tripo','invokedByThisTask':False,'jobId':None,'commercialLicenseReceipt':None},
        'preparation':{'tool':'Blender '+bpy.app.version_string,'script':'scripts/prepare-tripo-wall.py','scriptSha256':digest(Path(__file__)),
            'helperScript':'scripts/prepare-tripo-props.py','helperScriptSha256':digest(ROOT/'scripts/prepare-tripo-props.py'),
            'command':'blender -b -t 3 --python scripts/prepare-tripo-wall.py',
            'method':'Uniform metric scale to 6m length, centering/grounding, microscopic duplicate cleanup, collapse simplification retaining UV/PBR, 2K embedded color/roughness textures and 1536px normals. No original modification.'},
        'assets':[{'id':'wall','source':original,'runtime':runtime}],
        'evidenceBoundary':'Static binary validation and actual Blender renders; GPU import/collisions and artistic review are separate.'}
    save_json(OUTPUT/'provenance.json',provenance)
    (OUTPUT/'README.md').write_text(f'''# Verwitterte Tripo-Steinmauer\n\nOriginal: `assets/inbox/stone wall 3d model.glb` bleibt unverändert.\nSpielmodell: `runtime/wall.glb`, lokale X-Achse als Wiederholrichtung, +Y oben,\nauf Y=0 geerdet und horizontal zentriert. Originale Proportionen und PBR-Texturen\nbleiben erhalten; Farbe/Rauheit maximal 2048², Normalen 1536², Geometrie {runtime['triangles']} Dreiecke.\nMaße B × H × T: {dims[0]:.3f} × {dims[1]:.3f} × {dims[2]:.3f} Meter.\nDateigröße: {runtime['bytes']} Bytes.\n\nReproduktion: `blender -b -t 3 --python scripts/prepare-tripo-wall.py`.\n`inspection.json` dokumentiert Quell- und Zieldatei, Messwerte, SHA-256 und Budgetprüfungen.\n`previews/` enthält echte Blender-Renderings bei gleicher Kamera/Beleuchtung.\n\nVom Projektinhaber bereitgestellter Tripo-Export, Einbindung ausdrücklich beauftragt.\nKein kostenpflichtiger Anbieteraufruf; separater kommerzieller Lizenzbeleg nicht mitgeliefert.\nDieses lokale Projektpaket ist kein `game-dev`-CLI-Beleg (CLI nicht vorhanden).\nGPU-Import, Kollisionsverhalten und menschliche Freigabe werden separat geprüft.\n''')
    files=[{'path':str(p.relative_to(OUTPUT)),'bytes':p.stat().st_size,'sha256':digest(p)} for p in sorted(OUTPUT.rglob('*')) if p.is_file() and p.name!='runtime-manifest.json']
    save_json(OUTPUT/'runtime-manifest.json',{'name':'nebeljagd-tripo-wall','version':1,'kind':'source-preserving-local-editor-test-package',
        'files':files,'sources':[{'path':original['path'],'sha256':original['sha256']}],
        'validation':{'sourceUnchanged':validation['sourceUnchanged'],'allStaticPoliciesPassed':all(validation.values())},
        'licenseStatus':'User-provided project asset; separate commercial provider receipt not supplied.',
        'pending':['Editor/game GPU import and collision review','User artistic approval']})
    print('PREPARED_WALL '+json.dumps({'runtime':runtime,'dimensions':dims,'validation':validation}),flush=True)


if __name__ == '__main__':
    main()
