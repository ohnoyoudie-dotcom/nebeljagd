"""Check editable barrier heights, physical collisions and the real LOS shader.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/wall_height_smoke.py
Optional NEBELJAGD_EDITOR_URL targets the standalone built editor separately.
Only browser fixtures are edited; the repository's map remains byte-identical.
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
OUT = ROOT / 'test-results/wall-height'
OUT.mkdir(parents=True, exist_ok=True)
report = {'status': 'running', 'url': URL, 'editorUrl': EDITOR_URL, 'checks': [], 'errors': [],
          'limits': 'Actual Chromium/SwiftShader editor and game renderer; no physical iPad performance measurement.'}
original_map_digest = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()


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
    value['objects'] = [{'id': 'qa-single-wall', 'name': 'Einzelmauer', 'kind': 'wall', 'variant': 'kit-tripo-wall',
                         'position': [-40, 40], 'rotation': 0, 'scale': 1.25}]
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
def route(page): return state(page)['map']['barriers'][0]


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'wall-height.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
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
        page.locator('#barrier-height').fill('1.99')
        expect(page.locator('#barrier-height-hint')).to_contain_text('frei')
        page.locator('#barrier-draw').click()
        a, b = client(page, [-30, -20]), client(page, [30, -20])
        page.mouse.move(a['x'], a['y']); page.mouse.down()
        page.mouse.move(b['x'], b['y'], steps=8); page.mouse.up()
        assert route(page)['height'] == 1.99
        page.locator('#barrier-gap').click(); tap(page, [0, -20])
        page.locator('#tool-select').click(); tap(page, [-15, -20])
        before = copy.deepcopy(route(page))
        page.locator('#barrier-object-height').fill('2')
        expect(page.locator('#barrier-object-height-hint')).to_contain_text('Sicht')
        page.locator('.apply-properties').click()
        assert route(page)['height'] == 2
        for key in ['points', 'gaps', 'scale']: assert route(page)[key] == before[key]
        page.locator('#barrier-selection-preview').click()
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready')
        page.locator('#barrier-preview').screenshot(path=str(OUT / 'height-2-preview.png'))
        page.locator('#barrier-object-height').fill('3')
        page.locator('#barrier-object-scale').fill('1.7')
        page.locator('.apply-properties').click()
        assert route(page)['height'] == 3 and route(page)['scale'] == 1.7
        page.locator('#barrier-object-kind').select_option('wall')
        page.locator('.apply-properties').click()
        assert route(page)['height'] == 3 and route(page)['points'] == before['points'] and route(page)['gaps'] == before['gaps']
        page.locator('#undo').click(); assert route(page)['variant'] == 'kit-tripo-wall'
        page.locator('#redo').click(); assert route(page)['variant'] == 'kit-stone'
        page.locator('#barrier-object-height').fill('')
        page.locator('.apply-properties').click(); assert 'height' not in route(page)
        page.locator('#undo').click(); assert route(page)['height'] == 3
        passed('Draw and selected-line height controls accept 1.99/2/3 m, preserve route/gaps, survive model changes and support blank model height plus Undo/Redo')

        page.locator('#tool-select').click(); tap(page, [-40, 40])
        expect(page.locator('#object-height')).to_be_visible()
        assert page.locator('#object-height').input_value() == ''
        page.locator('.apply-properties').click()
        assert 'height' not in state(page)['map']['objects'][0], 'No-op edit must not migrate a legacy wall'
        page.locator('#object-height').fill('3')
        page.locator('#object-scale').fill('1.5')
        page.locator('.apply-properties').click()
        single = state(page)['map']['objects'][0]
        assert single['height'] == 3 and single['scale'] == 1.5
        assert single['position'] == [-40, 40]
        page.locator('#object-height').fill('')
        page.locator('.apply-properties').click(); assert 'height' not in state(page)['map']['objects'][0]
        page.locator('#undo').click(); assert state(page)['map']['objects'][0]['height'] == 3
        expected = copy.deepcopy(state(page)['map'])
        with page.expect_download() as download: page.locator('#export-json').click()
        saved = OUT / 'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == expected
        import_map(page, initial); import_map(page, expected)
        assert state(page)['map'] == expected
        passed('Individual wall height is independently editable, remains optional for old maps, and roundtrips with drawn heights through JSON')

        runtime = context.new_page(); monitor(runtime)
        runtime.route('**/wall-height-check.html', lambda route: route.fulfill(content_type='text/html',
            body='<!doctype html><title>Mauerhöhe und Sichtschutz</title><body style="margin:0;background:#567146;font:18px system-ui"></body>'))
        runtime.goto(URL + '/wall-height-check.html')
        result = runtime.evaluate('''async () => {
          const THREE=await import('/node_modules/.vite/deps/three.js');
          const {createWorldObjectRenderer}=await import('/src/world-object-renderer.js');
          const {createSightModel}=await import('/src/visibility-model.js');
          const {createVision}=await import('/src/vision.js');
          const {createBarrierPreview}=await import('/src/map/barrier-preview.js');
          const {getEnvironmentKitDefinition}=await import('/src/map/environment-kit-definitions.js');
          const map=await fetch('/worldmap.json').then(r=>r.json());map.objects=[];map.barriers=[];
          const cases=[
            ['draw-low',false,1.99,1,0,0],['draw-exact',false,2,1,0,0],['draw-high',false,3,.7,0,.55],
            ['draw-elevated-exact',false,2,1.6,20,1.1],['draw-elevated-low',false,1.99,1.4,20,-.4],
            ['draw-negative-exact',false,2,.6,-5,-.9],['single-low',true,1.99,1.5,-5,0],
            ['single-exact',true,2,2,20,.4],['single-high',true,3,.6,0,-.7],
            ['legacy-small',true,null,1,0,.2],['legacy-large',true,null,2,0,.5],
            ['fence-low',true,1.99,1,0,.6],['fence-exact',true,2,.75,0,-.3],
          ].map(([id,single,height,scale,base,rotation],i)=>({id,single,height,scale,base,rotation,x:i*30,
            kind:id.startsWith('fence')?'fence':'wall',variant:id.startsWith('fence')?'kit-cross-wood':'kit-tripo-wall'}));
          const at=(item,x,z,y=item.base)=>({x:item.x+Math.cos(item.rotation)*x+Math.sin(item.rotation)*z,y,
            z:-Math.sin(item.rotation)*x+Math.cos(item.rotation)*z});
          for(const item of cases){
            const value={id:item.id,name:item.id,kind:item.kind,variant:item.variant,scale:item.scale,
              ...(item.height===null?{}:{height:item.height})};
            if(item.single)map.objects.push({...value,position:[item.x,0],rotation:item.rotation});
            else map.barriers.push({...value,points:[[-6,0],[6,0]].map(([x,z])=>{const p=at(item,x,z);return[p.x,p.z];}),gaps:[{at:6,width:3}]});
          }
          const before=JSON.stringify(map),root=new THREE.Group();
          const groundAt=x=>cases[Math.max(0,Math.min(cases.length-1,Math.round(x/30)))].base;
          const objects=await createWorldObjectRenderer(root,{map,heightAt:groundAt,groundHeightAt:groundAt,quality:'low'});
          root.updateMatrixWorld(true);
          const bounds=cases.map(()=>new THREE.Box3());
          root.traverse(mesh=>{
            if(!mesh.isInstancedMesh||! /^(wall|fence):/.test(mesh.name))return;
            mesh.geometry.computeBoundingBox();
            for(let i=0;i<mesh.count;i++){
              const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);
              const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix),center=box.getCenter(new THREE.Vector3());
              const index=Math.max(0,Math.min(cases.length-1,Math.round(center.x/30)));bounds[index].union(box);
            }
          });
          const checks=cases.map((item,index)=>{
            const definition=getEnvironmentKitDefinition(item.kind,item.variant),height=item.height??definition.height*item.scale;
            const localX=item.single?0:-4,solid=at(item,localX,0),unchanged={...solid};objects.resolveMovement(solid,.42);
            const start=at(item,localX,-3),end=at(item,localX,3),sight=createSightModel({obstacles:objects.projectileObstacles,radius:15});
            sight.update(start);
            const lowHit=objects.traceProjectile({...start,y:item.base+.7},{...end,y:item.base+.7});
            const overHit=objects.traceProjectile({...start,y:item.base+height+.2},{...end,y:item.base+height+.2});
            const bodies=objects.projectileObstacles.filter(body=>body.objectId===item.id||body.objectId?.startsWith(item.id+'-segment-'));
            let gap=null;if(!item.single){const p=at(item,0,0),saved={...p};objects.resolveMovement(p,.42);
              const a=at(item,0,-3),b=at(item,0,3);sight.update(a);
              gap={moved:Math.hypot(p.x-saved.x,p.z-saved.z),visible:sight.isVisible(b),hit:Boolean(objects.traceProjectile({...a,y:item.base+.7},{...b,y:item.base+.7}))};
              sight.update(start);}
            return{id:item.id,height,base:item.base,visible:sight.isVisible(end),moved:Math.hypot(solid.x-unchanged.x,solid.z-unchanged.z),
              lowHit:Boolean(lowHit),overHit:Boolean(overHit),gap,renderedHeight:bounds[index].max.y-bounds[index].min.y,
              colliderHeights:bodies.map(body=>body.maxY-body.minY),bodyCount:bodies.length};
          });
          const sourceUnchanged=before===JSON.stringify(map);
          objects.dispose();
          // Capture the real preview's bounds, rather than testing its scale
          // formula again. Height edits must leave width/depth unchanged.
          const previewHost=document.createElement('div');previewHost.style.cssText='width:400px;height:240px';
          document.body.append(previewHost);
          const preview=createBarrierPreview(previewHost),previewBounds=[];
          const originalSetFromObject=THREE.Box3.prototype.setFromObject;
          let actualPreviewBounds;
          THREE.Box3.prototype.setFromObject=function(object,...args){
            const result=originalSetFromObject.call(this,object,...args);
            if(object.isGroup&&object.children.some(child=>child.isInstancedMesh))actualPreviewBounds=this.getSize(new THREE.Vector3());
            return result;
          };
          try{
            for(const [kind,variant] of [['wall','kit-tripo-wall'],['wall','kit-stone'],['fence','kit-cross-wood']]){
              const sizes=[];
              for(const height of [1.99,3]){
                const shown=await preview.show({id:'preview-height',name:'Preview',kind,variant,height,scale:1.4,
                  points:[[10,20],[22,26]],gaps:[]});
                if(!shown||!actualPreviewBounds)throw new Error('Preview did not render');
                sizes.push({height,x:actualPreviewBounds.x,y:actualPreviewBounds.y,z:actualPreviewBounds.z});
              }
              previewBounds.push({kind,variant,sizes});
            }
          }finally{THREE.Box3.prototype.setFromObject=originalSetFromObject;preview.dispose();previewHost.remove();}
          // The actual game LOS shader, with matching low/high stone walls in
          // one view. Sun shadow maps are disabled so only sight shading differs.
          map.objects=[];map.barriers=[
            {id:'visual-low',name:'1.99 m',kind:'wall',variant:'kit-tripo-wall',scale:1,height:1.99,points:[[-11,0],[-1,0]],gaps:[]},
            {id:'visual-high',name:'2 m',kind:'wall',variant:'kit-tripo-wall',scale:1,height:2,points:[[1,0],[11,0]],gaps:[]},
          ];
          const scene=new THREE.Scene(),visualRoot=new THREE.Group();scene.add(visualRoot);
          const visual=await createWorldObjectRenderer(visualRoot,{map,heightAt:()=>0,quality:'high'});
          const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1440,1000);
          renderer.setClearColor('#536d45');renderer.outputColorSpace=THREE.SRGBColorSpace;
          renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
          document.body.append(renderer.domElement);
          scene.add(new THREE.HemisphereLight('#eef4e7','#475842',1.7));
          const sun=new THREE.DirectionalLight('#fff0d0',2);sun.position.set(-10,30,20);scene.add(sun);
          const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#6c8853',roughness:1}));
          ground.rotation.x=-Math.PI/2;ground.position.y=-.02;scene.add(ground);
          const camera=new THREE.OrthographicCamera(-16,16,16*1000/1440,-16*1000/1440,.1,200);
          camera.position.set(0,25,24);camera.lookAt(0,0,-2);camera.updateMatrixWorld(true);
          const viewer={x:0,y:0,z:8},vision=createVision(scene,{projectileObstacles:visual.projectileObstacles,
            spawn:viewer,heightAt:()=>0,concealmentAt:()=>0},{radius:80,samples:2048});
          visual.update(0,1,new THREE.Vector3(0,0,0));vision.update(viewer,1);renderer.render(scene,camera);
          function pixel(point){
            const projected=new THREE.Vector3(...point).project(camera),x=Math.round((projected.x+1)*720),y=Math.round((projected.y+1)*500);
            const gl=renderer.getContext(),rgba=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
            return Array.from(rgba);
          }
          const lowPixel=pixel([-6,-.02,-5]),highPixel=pixel([6,-.02,-5]);
          const visibleLow=vision.isVisible({x:-6,y:0,z:-5}),visibleHigh=vision.isVisible({x:6,y:0,z:-5});
          [['1,99 m · Sicht darüber frei',-6],['2,00 m · Sicht blockiert',6]].forEach(([text,x])=>{
            const p=new THREE.Vector3(x,3,1).project(camera),label=document.createElement('span');label.textContent=text;
            label.style.cssText=`position:absolute;left:${(p.x+1)*720}px;top:${(1-p.y)*500}px;transform:translate(-50%,-50%);padding:8px 12px;border-radius:8px;background:#122919dd;color:#f6efd8;font:18px system-ui;white-space:nowrap`;
            document.body.append(label);
          });
          return{checks,previewBounds,sourceUnchanged,
            visual:{lowPixel,highPixel,visibleLow,visibleHigh,sight:vision.inspect(),calls:renderer.info.render.calls}};
        }''')
        assert result['sourceUnchanged']
        for item in result['checks']:
            assert item['moved'] > .4 and item['bodyCount'] > 0, item
            assert item['visible'] == (item['height'] < 2), item
            assert item['lowHit'] and not item['overHit'], item
            assert abs(item['renderedHeight']-item['height']) < .005, item
            assert all(abs(height-item['height']) < 1e-6 for height in item['colliderHeights']), item
            if item['gap']:
                assert item['gap']['moved'] < 1e-7 and item['gap']['visible'] and not item['gap']['hit'], item
        visual = result['visual']
        for preview in result['previewBounds']:
            low, high = preview['sizes']
            assert abs(low['y'] - low['height']) < .005 and abs(high['y'] - high['height']) < .005, preview
            assert abs(low['x'] - high['x']) < .0001 and abs(low['z'] - high['z']) < .0001, preview
        assert visual['visibleLow'] and not visual['visibleHigh'], visual
        assert sum(visual['highPixel'][:3]) < sum(visual['lowPixel'][:3]) * .87, visual
        runtime.screenshot(path=str(OUT / 'sight-height-comparison.png'))
        report['runtime'] = result
        passed('Actual model and collision heights match 1.99/2/3 m across rotated, scaled, individual and elevated walls; low walls permit sight but block walking and low shots')
        passed('The actual 3D preview matches 1.99/3 m wall and fence heights without changing their width/depth')
        passed('The real game LOS shader leaves ground beyond 1.99 m walls bright and casts a sight shadow beyond exactly 2 m walls')
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == original_map_digest
        report['status'] = 'passed'; browser.close()
except Exception as error:
    report['status'] = 'failed'; report['failure'] = str(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
