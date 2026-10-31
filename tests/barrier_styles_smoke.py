"""Exercise alternate barrier designs in the real editor and scenery renderer.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/barrier_styles_smoke.py
Set NEBELJAGD_EDITOR_URL to a built editor's base URL to check the exported HTML
while retaining NEBELJAGD_URL for direct runtime-module inspection.
Uses an imported fixture only; the project's authored worldmap is never edited.
"""
from pathlib import Path
import copy
import json
import os
import shutil

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
EDITOR_URL = os.environ.get('NEBELJAGD_EDITOR_URL', URL).rstrip('/')
OUT = ROOT / 'test-results/barrier-styles'
OUT.mkdir(parents=True, exist_ok=True)
report = {'status': 'running', 'url': URL, 'editorUrl': EDITOR_URL, 'checks': [], 'errors': [],
          'limits': 'Deterministic Chromium/SwiftShader render and editor interaction; no physical iPad performance measurement.'}


def passed(label):
    report['checks'].append(label)
    print('PASS', label, flush=True)


def fixture():
    value = json.loads((ROOT / 'worldmap.json').read_text())
    value['bounds'] = {'minX': -160, 'minZ': -160, 'maxX': 160, 'maxZ': 160}
    value['island']['points'] = [[-150, -150], [150, -150], [150, 150], [-150, 150]]
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
def routes(page): return state(page)['map'].get('barriers', [])


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'barrier-styles.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def client(page, point):
    return page.evaluate('p=>{const q=new DOMPoint(...p).matrixTransform(document.querySelector("#map-stage>svg").getScreenCTM());return {x:q.x,y:q.y};}', point)


def tap(page, point):
    p = client(page, point); page.mouse.click(p['x'], p['y'])


def drag(page, a, b):
    a, b = client(page, a), client(page, b)
    page.mouse.move(a['x'], a['y']); page.mouse.down()
    page.mouse.move(b['x'], b['y'], steps=8); page.mouse.up()


def draw(page, style, a, b):
    page.locator('#editor-tab-objects').click()
    page.locator('#barrier-kind').select_option(style)
    if state(page)['mode'] != 'barrierDraw': page.locator('#barrier-draw').click()
    drag(page, a, b)


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
        options = page.locator('#barrier-kind option').evaluate_all('(items)=>items.map(x=>x.value)')
        assert set(options) == {'wall', 'fence', 'wall-cut-stone', 'fence-cross-wood', 'wall-tripo'}, options
        draw(page, 'wall-cut-stone', [-70, -50], [60, -50])
        wall = copy.deepcopy(routes(page)[0])
        assert wall['kind'] == 'wall' and wall['variant'] == 'kit-cut-stone', wall
        assert wall['points'] == [[-70, -50], [60, -50]], wall
        page.locator('#barrier-gap').click(); tap(page, [-20, -50])
        assert routes(page)[0]['gaps'] == [{'at': 50, 'width': 3}]
        page.locator('#tool-select').click(); tap(page, [-50, -50])
        page.locator('#barrier-selection-preview').click()
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready')
        page.locator('#barrier-preview').screenshot(path=str(OUT / 'cut-stone-preview.png'))
        passed('The new dressed stone wall draws an editable route, accepts a passage and renders in the 3D preview')

        original = copy.deepcopy(routes(page)[0])
        for style, kind, variant in [('wall', 'wall', 'kit-stone'), ('fence-cross-wood', 'fence', 'kit-cross-wood')]:
            page.locator('#barrier-object-kind').select_option(style)
            page.locator('.apply-properties').click()
            changed = routes(page)[0]
            assert changed['kind'] == kind and changed['variant'] == variant, changed
            for key in ['id', 'points', 'gaps', 'scale']: assert changed[key] == original[key], (key, changed)
            expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready')
        fence = copy.deepcopy(routes(page)[0])
        page.locator('#barrier-preview').screenshot(path=str(OUT / 'cross-wood-preview.png'))
        page.locator('#undo').click()
        assert routes(page)[0]['variant'] == 'kit-stone'
        page.locator('#redo').click(); assert routes(page)[0] == fence
        passed('Switching old/new styles retains the exact route, passage, ID and scale; Undo/Redo restores the selected design')

        draw(page, 'fence-cross-wood', [-70, 40], [50, 40])
        assert len(routes(page)) == 2 and routes(page)[1]['variant'] == 'kit-cross-wood'
        expected = copy.deepcopy(state(page)['map'])
        with page.expect_download() as download: page.locator('#export-json').click()
        saved = OUT / 'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == expected
        import_map(page, initial); import_map(page, expected)
        assert state(page)['map'] == expected
        assert state(page)['map']['objects'] == initial['objects']
        passed('The new cross-braced fence draws directly; JSON download and reimport preserve styles without baking or touching objects')

        runtime = context.new_page(); monitor(runtime)
        runtime.route('**/barrier-styles-runtime.html', lambda route: route.fulfill(content_type='text/html',
            body='<!doctype html><title>Four barrier designs</title><body style="margin:0;background:#dbe4d5;font:16px system-ui"></body>'))
        runtime.goto(URL + '/barrier-styles-runtime.html')
        result = runtime.evaluate('''async () => {
          const THREE=await import('/node_modules/.vite/deps/three.js');
          const {createWorldObjectRenderer}=await import('/src/world-object-renderer.js');
          const {createSightModel}=await import('/src/visibility-model.js');
          const {getEnvironmentKitDefinition}=await import('/src/map/environment-kit-definitions.js');
          const styles=[['wall','kit-stone','Steinmauer · bisher'],['wall','kit-cut-stone','Steinmauer · Pfeiler & Abdeckung'],
            ['fence','kit-wood','Holzzaun · bisher'],['fence','kit-cross-wood','Holzzaun · Kreuzstreben']];
          const map=await fetch('/worldmap.json').then(r=>r.json());map.objects=[];
          map.barriers=styles.map(([kind,variant,label],i)=>({id:`style-${i}`,name:label,kind,variant,scale:1,
            points:[[-9,-12+i*8],[9,-12+i*8]],gaps:[{at:9,width:3}]}));
          const before=JSON.stringify(map),scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
          const objects=await createWorldObjectRenderer(root,{map,heightAt:()=>0,quality:'low'});
          const checks=styles.map(([kind,variant],i)=>{
            const z=-12+i*8,solid={x:-5,y:0,z},gap={x:0,y:0,z};
            objects.resolveMovement(solid,.42);objects.resolveMovement(gap,.42);
            const sight=createSightModel({obstacles:objects.projectileObstacles,radius:50});
            const crossing=x=>{const start={x,y:.8,z:z-2},end={x,y:.8,z:z+2};
              const hit=objects.traceProjectile(start,end);sight.update({...start,y:0});
              return{hit:hit?.collider?.objectId??null,visible:sight.isVisible(end)};};
            const definition=getEnvironmentKitDefinition(kind,variant);
            return{kind,variant,solidMoved:Math.hypot(solid.x+5,solid.z-z),gapMoved:Math.hypot(gap.x,gap.z-z),
              solidCrossing:crossing(-5),gapCrossing:crossing(0),height:definition.height};
          });
          const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
          renderer.setSize(1440,1000);renderer.setClearColor('#dbe4d5');renderer.outputColorSpace=THREE.SRGBColorSpace;
          renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
          document.body.append(renderer.domElement);
          scene.add(new THREE.HemisphereLight('#eef4e7','#475842',2));
          const sun=new THREE.DirectionalLight('#fff0d0',2.2);sun.position.set(-10,30,20);scene.add(sun);
          const ground=new THREE.Mesh(new THREE.PlaneGeometry(70,70),new THREE.MeshStandardMaterial({color:'#74925e',roughness:1}));
          ground.rotation.x=-Math.PI/2;ground.position.y=-.03;scene.add(ground);
          const camera=new THREE.OrthographicCamera(-20,20,20*1000/1440,-20*1000/1440,.1,200);
          camera.position.set(0,45,35);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
          objects.update(0,1,new THREE.Vector3(0,0,0));renderer.render(scene,camera);
          styles.forEach((style,i)=>{
            const p=new THREE.Vector3(-10,2.5,-12+i*8).project(camera),label=document.createElement('span');
            label.textContent=style[2];label.style.cssText=`position:absolute;left:${(p.x+1)*720}px;top:${(1-p.y)*500}px;background:#192e21dd;color:#fff9e8;padding:6px 10px;border-radius:5px;font-size:16px;transform:translateY(-50%);pointer-events:none`;
            document.body.append(label);
          });
          return{checks,sourceUnchanged:before===JSON.stringify(map),stats:objects.stats,
            calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
        }''')
        assert result['sourceUnchanged'] and result['stats']['barrierCount'] == 4, result
        assert result['stats']['authoredObjectCount'] == 0 and result['calls'] > 0, result
        for check in result['checks']:
            assert check['solidMoved'] > .4 and check['gapMoved'] < 1e-7, check
            assert check['solidCrossing']['hit'] and not check['solidCrossing']['visible'], check
            assert check['gapCrossing']['hit'] is None and check['gapCrossing']['visible'], check
        runtime.screenshot(path=str(OUT / 'four-designs.png'))
        report['runtime'] = result
        passed('All four real runtime designs render, block movement/projectiles/sight at solids and leave authored passages fully open')
        assert not report['errors'], report['errors']
        report['status'] = 'passed'
        browser.close()
except Exception as error:
    report['status'] = 'failed'; report['failure'] = str(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
