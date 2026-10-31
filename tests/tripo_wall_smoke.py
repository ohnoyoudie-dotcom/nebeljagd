"""Check the user's weathered Tripo wall in the editor and actual WebGL runtime.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/tripo_wall_smoke.py
Optional NEBELJAGD_EDITOR_URL targets the built standalone editor separately.
Only a browser fixture is edited; the authored worldmap and source GLB stay intact.
"""
from pathlib import Path
import copy
import hashlib
import json
import os
import shutil

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
EDITOR_URL = os.environ.get('NEBELJAGD_EDITOR_URL', URL).rstrip('/')
OUT = ROOT / 'test-results/tripo-wall'
OUT.mkdir(parents=True, exist_ok=True)
report = {'status': 'running', 'url': URL, 'editorUrl': EDITOR_URL, 'checks': [], 'errors': [],
          'limits': 'Chromium/SwiftShader visual and interaction checks; no physical iPad performance measurement.'}
source_digest = hashlib.sha256((ROOT / 'assets/inbox/stone wall 3d model.glb').read_bytes()).hexdigest()
map_digest = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()


def passed(label):
    report['checks'].append(label)
    print('PASS', label, flush=True)


def fixture():
    value = json.loads((ROOT / 'worldmap.json').read_text())
    value['bounds'] = {'minX': -100, 'minZ': -100, 'maxX': 100, 'maxZ': 100}
    value['island']['points'] = [[-90, -90], [90, -90], [90, 90], [-90, 90]]
    value['regions'] = [{'id': 'qa-meadow', 'name': 'Wiese', 'biome': 'meadow', 'color': '#5a8844',
                         'points': copy.deepcopy(value['island']['points']), 'label': [0, 0]}]
    for key in ['paths', 'rivers', 'places', 'objects', 'barriers']: value[key] = []
    value['spawnAreas'] = [{'id': 'qa-start', 'name': 'Start', 'position': [-10, -65], 'radius': 8, 'capacity': 50}]
    value['gameplay']['spawnPosition'] = [-10, -65]
    value['zone']['center'] = [0, 0]
    value.pop('landscape', None)
    return value


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.set_default_timeout(90000)
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('console', lambda message: report['errors'].append(message.text) if message.type == 'error' else None)


def state(page): return page.evaluate('nebeljagdMapTestState()')


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'tripo-wall.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def client(page, point):
    return page.evaluate('p=>{const q=new DOMPoint(...p).matrixTransform(document.querySelector("#map-stage>svg").getScreenCTM());return {x:q.x,y:q.y};}', point)


def tap(page, point):
    p = client(page, point); page.mouse.click(p['x'], p['y'])


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        page = context.new_page(); monitor(page)
        page.goto(EDITOR_URL + '/map-editor.html', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdMapTestState')
        initial = fixture(); import_map(page, initial)
        page.locator('#editor-tab-objects').click()
        page.locator('#barrier-kind').select_option('wall-tripo')
        page.locator('#barrier-draw').click()
        a, b = client(page, [-30, -20]), client(page, [30, -20])
        page.mouse.move(a['x'], a['y']); page.mouse.down()
        page.mouse.move(b['x'], b['y'], steps=8); page.mouse.up()
        wall = state(page)['map']['barriers'][0]
        assert wall['kind'] == 'wall' and wall['variant'] == 'kit-tripo-wall'
        assert wall['points'] == [[-30, -20], [30, -20]], wall
        page.locator('#barrier-gap').click(); tap(page, [0, -20])
        assert state(page)['map']['barriers'][0]['gaps'] == [{'at': 30, 'width': 3}]
        page.locator('#tool-select').click(); tap(page, [-15, -20])
        page.locator('#barrier-selection-preview').click()
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready')
        page.locator('#barrier-preview').screenshot(path=str(OUT / 'editor-preview.png'))
        original = copy.deepcopy(state(page)['map']['barriers'][0])
        for style, variant in [('wall', 'kit-stone'), ('wall-tripo', 'kit-tripo-wall')]:
            page.locator('#barrier-object-kind').select_option(style); page.locator('.apply-properties').click()
            changed = state(page)['map']['barriers'][0]
            assert changed['variant'] == variant
            for key in ['id', 'points', 'gaps', 'scale']: assert changed[key] == original[key], key
            expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready')
        page.locator('#undo').click(); assert state(page)['map']['barriers'][0]['variant'] == 'kit-stone'
        page.locator('#redo').click(); assert state(page)['map']['barriers'][0] == original
        passed('The Tripo wall draws, previews and switches with older styles while keeping its route and passage; Undo/Redo works')
        expected = copy.deepcopy(state(page)['map'])
        with page.expect_download() as download: page.locator('#export-json').click()
        saved = OUT / 'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == expected
        import_map(page, initial); import_map(page, expected)
        assert state(page)['map'] == expected and state(page)['map']['objects'] == []
        passed('JSON save and reimport retain the actual Tripo variant without baking generated pieces into objects')

        runtime = context.new_page(); monitor(runtime)
        runtime.route('**/tripo-wall-check.html', lambda route: route.fulfill(content_type='text/html',
            body='<!doctype html><title>Verwitterte Tripo-Steinmauer</title><body style="margin:0;background:#567146"></body>'))
        runtime.goto(URL + '/tripo-wall-check.html')
        result = runtime.evaluate('''async () => {
          const THREE=await import('/node_modules/.vite/deps/three.js');
          const {createWorldObjectRenderer}=await import('/src/world-object-renderer.js');
          const {createSightModel}=await import('/src/visibility-model.js');
          const {getEnvironmentKitDefinition}=await import('/src/map/environment-kit-definitions.js');
          const {generateBarrierObjects}=await import('/src/map/barriers.js');
          const {loadEnvironmentKit}=await import('/src/environment-kit.js');
          const map=await fetch('/worldmap.json').then(r=>r.json());map.objects=[];
          map.barriers=[{id:'weathered-wall',name:'Verwitterte Steinmauer',kind:'wall',variant:'kit-tripo-wall',scale:1,
            points:[[-12,0],[12,0],[12,-6]],gaps:[{at:12,width:3}]}];
          const before=JSON.stringify(map),scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
          const objects=await createWorldObjectRenderer(root,{map,heightAt:()=>0,quality:'high'});
          const solid={x:-6,y:0,z:0},gap={x:0,y:0,z:0},corner={x:12,y:0,z:-3};
          objects.resolveMovement(solid,.42);objects.resolveMovement(gap,.42);objects.resolveMovement(corner,.42);
          const sight=createSightModel({obstacles:objects.projectileObstacles,radius:50});
          const crossing=(x,z,dx,dz)=>{const start={x:x-dx,y:.8,z:z-dz},end={x:x+dx,y:.8,z:z+dz};
            const hit=objects.traceProjectile(start,end);sight.update({...start,y:0});
            return{hit:hit?.collider?.objectId??null,visible:sight.isVisible(end)};};
          const definition=getEnvironmentKitDefinition('wall','kit-tripo-wall');
          const models=await loadEnvironmentKit({objects:[{kind:'wall',variant:'kit-tripo-wall'}]});
          const model=models.get('wall:kit-tripo-wall'), bounds=new THREE.Box3();
          model.parts.forEach(part=>{part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox);});
          const materials=model.parts.flatMap(part=>Array.isArray(part.material)?part.material:[part.material]);
          const maps=materials.map(material=>({color:Boolean(material.map?.image),normal:Boolean(material.normalMap?.image),
            roughness:Boolean(material.roughnessMap?.image),width:material.map?.image?.width,height:material.map?.image?.height}));
          const pieces=generateBarrierObjects(map.barriers[0]);
          const straight=pieces.filter(item=>Math.abs(item.rotation)<1e-8);
          const intervals=straight.map(item=>[item.position[0]+bounds.min.x*item.longitudinalScale,
            item.position[0]+bounds.max.x*item.longitudinalScale]);
          const seams=intervals.slice(1).map((range,i)=>range[0]-intervals[i][1]);
          const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
          renderer.setSize(1440,1000);renderer.setClearColor('#637c4d');renderer.outputColorSpace=THREE.SRGBColorSpace;
          renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
          document.body.append(renderer.domElement);scene.add(new THREE.HemisphereLight('#eef4e7','#475842',1.6));
          const sun=new THREE.DirectionalLight('#fff0d0',2);sun.position.set(-10,30,20);scene.add(sun);
          const ground=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({color:'#637c4d',roughness:1}));
          ground.rotation.x=-Math.PI/2;ground.position.y=-.025;scene.add(ground);
          const camera=new THREE.OrthographicCamera(-15,15,15*1000/1440,-15*1000/1440,.1,200);
          camera.position.set(-7,14,23);camera.lookAt(0,0,-1.5);camera.updateMatrixWorld(true);
          objects.update(0,1,new THREE.Vector3(0,0,0));renderer.render(scene,camera);
          window.captureWallCloseup=()=>{
            camera.left=-6;camera.right=6;camera.top=6*1000/1440;camera.bottom=-6*1000/1440;
            camera.position.set(-8,5,10);camera.lookAt(-7,.5,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
          };
          return{sourceUnchanged:before===JSON.stringify(map),maps,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
            halfWidth:definition.footprint.halfWidth,seams,solidMoved:Math.hypot(solid.x+6,solid.z),gapMoved:Math.hypot(gap.x,gap.z),
            cornerMoved:Math.hypot(corner.x-12,corner.z+3),solidCrossing:crossing(-6,0,0,2),gapCrossing:crossing(0,0,0,2),
            cornerCrossing:crossing(12,-3,2,0),stats:objects.stats,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
        }''')
        assert result['sourceUnchanged'] and result['stats']['barrierCount'] == 1, result
        assert result['stats']['authoredObjectCount'] == 0 and result['calls'] > 0
        assert result['solidMoved'] > .4 and result['cornerMoved'] > .4 and result['gapMoved'] < 1e-7
        for name in ['solidCrossing', 'cornerCrossing']:
            assert result[name]['hit'] and not result[name]['visible'], result[name]
        assert result['gapCrossing']['hit'] is None and result['gapCrossing']['visible']
        assert all(item['color'] and item['normal'] and item['roughness'] for item in result['maps']), result['maps']
        assert all(abs(value) < .025 or abs(value-3) < .025 for value in result['seams']), result['seams']
        runtime.screenshot(path=str(OUT / 'runtime.png'))
        runtime.evaluate('captureWallCloseup()'); runtime.screenshot(path=str(OUT / 'closeup.png'))
        report['runtime'] = result
        passed('Actual embedded PBR renders on repeated wall modules, with matching end bounds, solid collisions and an open 3 m passage')
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'assets/inbox/stone wall 3d model.glb').read_bytes()).hexdigest() == source_digest
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == map_digest
        report['sourceSha256'] = source_digest
        report['status'] = 'passed'; browser.close()
except Exception as error:
    report['status'] = 'failed'; report['failure'] = str(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
