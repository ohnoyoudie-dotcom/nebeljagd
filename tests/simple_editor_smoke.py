"""Real editor journeys for the child-friendly painting workflow.

NEBELJAGD_URL=http://127.0.0.1:4178 NEBELJAGD_STANDALONE=1 python tests/simple_editor_smoke.py
Uses ordinary controls and mouse/native touch input. The inspection hook only
reads state; no test hook mutates the editor document.
"""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4178').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
BASE = json.loads((ROOT/'worldmap.json').read_text())
OUT = ROOT/'test-results/simple-editor'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status':'running','url':URL,'checks':[],'errors':[],'screenshots':[],
          'limits':'Chromium with CPU SwiftShader and emulated native touch; no physical iPad performance measurement.'}


def fixture():
    value = copy.deepcopy(BASE)
    value.update(name='Meine gemalte Testinsel', bounds={'minX':-160,'minZ':-160,'maxX':160,'maxZ':160})
    value['island']['points'] = [[-150,-150],[150,-150],[150,150],[-150,150]]
    value['regions'] = [{'id':'qa-meadow','name':'Wiese','biome':'meadow','color':'#5a8844',
                         'points':copy.deepcopy(value['island']['points']),'label':[0,0]}]
    value['paths'] = []; value['rivers'] = []; value['places'] = []
    value['gameplay']['spawnPosition'] = [-10,-65]
    value['spawnAreas'] = [{'id':'qa-start','name':'Start','position':[-10,-65],'radius':8,'capacity':50}]
    value['zone']['center'] = [0,0]
    value['objects'] = [
        {'id':'qa-grass','name':'Versteckgras','kind':'grass','variant':'tall','position':[50,30],'rotation':0,'scale':1,'radius':3},
        {'id':'qa-heart','name':'Herz','kind':'heart','variant':'healing','position':[50,30],'rotation':0,'scale':1},
        {'id':'qa-bow','name':'Bogen','kind':'bow','variant':'wood','position':[75,30],'rotation':0,'scale':1,'rarity':'rare'},
    ]
    value.pop('landscape',None)
    return value


def passed(name, evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence}); print('PASS',name,flush=True)


def state(page): return page.evaluate('nebeljagdMapTestState()')


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror',lambda error:REPORT['errors'].append(str(error)))
    page.on('console',lambda message:REPORT['errors'].append(message.text) if message.type=='error' else None)


def ready(page):
    monitor(page); page.set_default_timeout(45000)
    page.goto(URL+'/map-editor.html',wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdMapTestState')


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name':'testinsel.json','mimeType':'application/json','buffer':json.dumps(value).encode()})
    page.wait_for_function('n=>nebeljagdMapTestState().map.name===n',arg=value['name'])
    assert state(page)['map']==value


def action(page, name):
    page.locator(f'[data-editor-action="{name}"]').click()
    expect(page.locator('#editor-pane-'+name)).to_be_visible()


def open_control(page, identifier):
    control = page.locator('#'+identifier)
    for details in control.locator('xpath=ancestor::details').all():
        if details.get_attribute('open') is None: details.locator(':scope > summary').click()
    control.scroll_into_view_if_needed()
    return control


def slider(page, identifier, value):
    control = open_control(page, identifier)
    control.evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}',value)
    assert float(control.input_value())==value


def client(page, point):
    return page.evaluate('p=>{const svg=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};}',point)


def drag(page, start, end, steps=8):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    a,b=client(page,start),client(page,end)
    page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=steps);page.mouse.up()


def tap(page, point):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    p=client(page,point);page.mouse.click(p['x'],p['y'])


def capture(page, name):
    path=ROOT/f'docs/simple-editor-{name}.png';page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def set_eraser(page, target, radius):
    action(page,'erase');page.locator('#erase-target').select_option(target)
    slider(page,'surface-eraser-radius',radius)
    assert state(page)['mode']==('terrainErase' if target=='surface' else 'erase')


try:
    if STANDALONE:
        REPORT['delivery']={'mode':'Actual welt/ standalone HTML served by local HTTP','files':{},'unexpectedRequests':[]}
        for name in ['map-editor.html','nebeljagd.html','index.html']:
            payload=(ROOT/'welt'/name).read_bytes()
            REPORT['delivery']['files'][name]={'bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}
        with urlopen(URL+'/map-editor.html') as response:
            assert hashlib.sha256(response.read()).hexdigest()==REPORT['delivery']['files']['map-editor.html']['sha256']
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        if STANDALONE:
            def check_request(request):
                parsed=urlsplit(request.url)
                if parsed.scheme not in ['http','https']:return
                if parsed.netloc==urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path=='/favicon.ico'):return
                REPORT['delivery']['unexpectedRequests'].append(request.url)
            context.on('request',check_request)
        page=context.new_page();ready(page)
        assert state(page)['map']==BASE
        nav=page.locator('.editor-action-nav [data-editor-action]')
        assert nav.evaluate_all('(xs)=>xs.map(x=>x.dataset.editorAction)')==['paint','objects','erase','more']
        expect(page.locator('#editor-pane-paint')).to_be_visible()
        for name in ['objects','erase','more']:expect(page.locator('#editor-pane-'+name)).to_be_hidden()
        expect(page.locator('.inspector')).to_be_hidden()
        for identifier in ['tool-select','tool-pan','undo','redo']:expect(page.locator('#'+identifier)).to_be_visible()
        capture(page,'overview')
        passed('The untouched map opens in a four-action editor with an obvious painting palette, permanent undo controls and no empty inspector',{'objects':len(BASE['objects'])})

        value=fixture();import_map(page,value)
        action(page,'paint');page.locator('[data-biome-choice="snow"]').click()
        assert state(page)['mode']=='biome','Choosing a landscape must activate painting directly.'
        slider(page,'biome-radius',10)
        before=state(page);drag(page,[-70,-65],[-10,-65],steps=1);painted=state(page)
        assert painted['undoCount']==before['undoCount']+1
        assert len(painted['map']['landscape']['biomes'])>1
        assert len(painted['map']['landscape']['terrain'])==len(painted['map']['landscape']['biomes'])
        assert painted['map']['objects']==value['objects']
        page.locator('#undo').click();assert state(page)['map']==before['map']
        page.locator('#redo').click();assert state(page)['map']==painted['map']
        passed('A landscape card immediately paints matching ground and biome fields; one Undo/Redo restores the complete stroke')

        set_eraser(page,'surface',3)
        before=state(page);drag(page,[-70,-53],[-10,-53],steps=1);erased=state(page)
        assert not erased['map']['landscape']['biomes'] and not erased['map']['landscape']['terrain']
        assert erased['map']['objects']==value['objects'] and erased['map']['regions']==value['regions']
        assert erased['undoCount']==before['undoCount']+1
        page.locator('#undo').click();assert state(page)['map']==before['map']
        page.locator('#redo').click();assert state(page)['map']==erased['map']
        capture(page,'eraser')
        passed('The visible surface eraser removes both painted layers from their edges without hunting hidden centres, while preserving loot and base regions')

        set_eraser(page,'grass',3);before=state(page)['map'];tap(page,[50,30])
        assert [o['id'] for o in state(page)['map']['objects']]==['qa-heart','qa-bow']
        page.locator('#undo').click();assert state(page)['map']==before
        set_eraser(page,'objects',3);tap(page,[75,30])
        assert [o['id'] for o in state(page)['map']['objects']]==['qa-grass','qa-heart']
        page.locator('#undo').click();assert state(page)['map']==before
        passed('Grass-only and object erasing target the selected content and preserve exact data when undone')

        action(page,'paint');page.locator('[data-biome-choice="meadow"]').click();assert state(page)['mode']=='biome'
        action(page,'objects');assert state(page)['mode']=='select'
        before=state(page)['map'];tap(page,[80,-90]);assert state(page)['map']==before
        action(page,'paint');page.locator('[data-biome-choice="snow"]').click()
        action(page,'more');assert state(page)['mode']=='select'
        passed('Changing to Objects or More stops the previous paint tool, preventing accidental new brush strokes')

        action(page,'paint');open_control(page,'terrain-type').select_option('sand')
        slider(page,'terrain-radius',6);open_control(page,'landscape-terrain-brush').click()
        before=state(page)['map'];drag(page,[-65,70],[-20,70],steps=2);after=state(page)['map']
        assert len(after['landscape']['terrain'])>len(before['landscape']['terrain'])
        assert after['landscape']['biomes']==before['landscape']['biomes']
        assert after['objects']==before['objects']
        passed('Optional ground-only detail painting remains available under the painting area without creating a second biome layer')

        action(page,'paint');page.locator('[data-biome-choice="snow"]').click();slider(page,'biome-radius',10)
        drag(page,[-70,-65],[-10,-65],steps=2);expected=state(page)['map']
        with page.expect_download() as download:page.locator('#export-json').click()
        saved=OUT/'worldmap.json';download.value.save_as(saved);assert json.loads(saved.read_text())==expected
        page.reload(wait_until='domcontentloaded');page.wait_for_function('window.nebeljagdMapTestState')
        page.locator('#restore-draft').click();assert state(page)['map']==expected
        import_map(page,expected)
        passed('Painted and erased map data survive normal JSON saving, draft recovery and JSON import')

        if STANDALONE:
            action(page,'more');open_control(page,'export-editor')
            with page.expect_download() as download:page.locator('#export-editor').click()
            html=OUT/'saved-editor.html';download.value.save_as(html)
            offline_context=browser.new_context(offline=True,viewport={'width':1280,'height':900})
            offline=offline_context.new_page();monitor(offline);offline.set_default_timeout(45000)
            offline.set_content(html.read_text(),wait_until='domcontentloaded');offline.wait_for_function('window.nebeljagdMapTestState')
            assert state(offline)['map']==expected
            duplicates=offline.evaluate('()=>{const seen=new Set();return [...document.querySelectorAll("[id]")].map(e=>e.id).filter(id=>seen.has(id)||!seen.add(id));}')
            assert not duplicates,duplicates
            assert offline.locator('.editor-action-nav').count()==1
            action(offline,'paint');offline.locator('[data-biome-choice="meadow"]').click();assert state(offline)['mode']=='biome'
            offline.close();offline_context.close()
            passed('An exported standalone HTML editor reopens offline with its exact map, working tools and no duplicate controls')

        with page.expect_popup() as popup:page.locator('#playtest-world').click()
        game=popup.value;monitor(game);game.set_default_timeout(120000)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        actual=game.evaluate('()=>{const s=nebeljagdTestState();return{source:s.world.source,objects:s.world.objects,landscape:s.world.landscape,biome:s.world.biome};}')
        assert actual['source']=='editor' and actual['objects']==expected['objects'] and actual['landscape']==expected['landscape']
        passed('The edited landscape and retained objects transfer unchanged to the actual 3D game',{'biomeAtSpawn':actual['biome'],'terrain':len(actual['landscape']['terrain']),'biomes':len(actual['landscape']['biomes'])})
        game.close()

        layout=[]
        for width,height in [(1280,900),(1024,768),(768,1024),(390,844)]:
            page.set_viewport_size({'width':width,'height':height});action(page,'paint')
            measurements=page.evaluate('''()=>{
              const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
              return{viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,
                nav:[...document.querySelectorAll('.editor-action-nav button')].map(box),map:box(document.querySelector('#map-viewport')),
                undo:box(document.querySelector('#undo'))};}''')
            assert measurements['scrollWidth']<=width+2,measurements
            assert measurements['map']['width']>=110 and measurements['map']['height']>=140,measurements
            assert all(b['height']>=43 and b['width']>=43 for b in measurements['nav']),measurements
            assert all(b['bottom']<=height and b['right']<=width+1 for b in measurements['nav']),measurements
            assert measurements['undo']['bottom']<=height,measurements
            layout.append(measurements)
            if width in [768,390]:capture(page,str(width))
        passed('Primary tools remain reachable with at least 44px targets and no horizontal page overflow at desktop, tablet and phone sizes',layout)
        page.close();context.close()

        touch_context=browser.new_context(viewport={'width':1024,'height':768},is_mobile=True,has_touch=True,device_scale_factor=1)
        touch=touch_context.new_page();ready(touch);import_map(touch,fixture())
        action(touch,'paint');touch.locator('[data-biome-choice="snow"]').click();slider(touch,'biome-radius',10)
        before=state(touch);a,b=client(touch,[-70,-65]),client(touch,[-10,-65]);session=touch_context.new_cdp_session(touch)
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
        for i in range(1,7):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{key:a[key]+(b[key]-a[key])*i/6 for key in ['x','y']}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert state(touch)['undoCount']==before['undoCount']+1 and state(touch)['map']['landscape']['biomes']
        touch.locator('#undo').click();assert state(touch)['map']==before['map']
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[b]})
        assert state(touch)['map']!=before['map']
        session.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
        assert state(touch)['map']==before['map']
        passed('Native tablet touch paints a biome in one undo step and a cancelled gesture restores the entire pre-stroke map')
        touch_context.close();browser.close()
    assert not REPORT['errors'],REPORT['errors']
    if STANDALONE:assert not REPORT['delivery']['unexpectedRequests'],REPORT['delivery']['unexpectedRequests']
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error);raise
finally:
    (ROOT/'docs/simple-editor-check.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
