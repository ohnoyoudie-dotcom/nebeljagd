"""Exercise the real landscape editor, persistence, playtest and touch gestures.

Run after the compiled preview is ready:
  NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/landscape_editor_smoke.py

Fixtures enter through the ordinary JSON file input. Control values use input/
change events; painting, selection, undo and touch use normal browser input.
No inspection API mutates editor state.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
DEFAULT = json.loads((ROOT / 'worldmap.json').read_text())
FIXTURE = copy.deepcopy(DEFAULT)
FIXTURE['objects'] = [
    {'id':'qa-original-grass','name':'QA Originalgras','kind':'grass','variant':'tall','position':[-55,20],'rotation':.2,'scale':1,'radius':2},
    {'id':'qa-original-tree','name':'QA Originalbaum','kind':'tree','variant':'rei-tree01','position':[-58,36],'rotation':.4,'scale':1},
    {'id':'qa-original-house','name':'QA Originalhaus','kind':'house','variant':'herbal','position':[-24,42],'rotation':.3,'scale':.5},
]
FIXTURE.pop('landscape', None)
ORIGINAL = {item['id']: item for item in FIXTURE['objects']}
REPORT = {'status':'running','url':URL,'checks':[],'errors':[],
          'note':'Chromium/SwiftShader and emulated native touch; no physical iPad frame-rate claim.'}
OUT = ROOT / 'test-results/landscape-editor-map.json'


def state(page):
    return page.evaluate('nebeljagdMapTestState()')


def passed(name, evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence})
    print('PASS',name,flush=True)


def monitor(page):
    page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
    page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
    page.route_web_socket('**',lambda ws:None)


def control(page, identifier, value):
    locator=page.locator('#'+identifier)
    locator.evaluate('''(element,value)=>{
      element.value=String(value);
      element.dispatchEvent(new Event('input',{bubbles:true}));
      element.dispatchEvent(new Event('change',{bubbles:true}));
    }''', value)
    assert math.isclose(float(locator.input_value()),float(value),abs_tol=.001)


def select_feature(page, identifier):
    page.locator('#tool-select').click()
    page.locator('#feature-filter').select_option('all')
    page.locator('#feature-search').fill(identifier)
    page.locator('#feature-list .feature-row').first.click()
    assert state(page)['selection']['id']==identifier


def client(page, point):
    return page.evaluate('''p=>{const svg=document.querySelector('#map-stage>svg');
      const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};}''',point)


def drag(page, start, end, steps=8):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    a,b=client(page,start),client(page,end)
    page.mouse.move(a['x'],a['y']);page.mouse.down()
    page.mouse.move(b['x'],b['y'],steps=steps);page.mouse.up()


def tap(page, point):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    p=client(page,point);page.mouse.click(p['x'],p['y'])


def prepare(page, check_original=False):
    monitor(page);page.set_default_timeout(120000)
    response=page.goto(URL+'/map-editor.html',wait_until='domcontentloaded')
    REPORT['served_editor_sha256']=hashlib.sha256(response.body()).hexdigest()
    page.wait_for_function('window.nebeljagdMapTestState')
    if check_original:
        assert state(page)['map']==DEFAULT, 'Opening the extended editor changed the saved legacy map.'
        passed('Opening the new editor preserves the complete existing map and all 4020 object placements',{'objects':len(DEFAULT['objects'])})
    page.locator('#json-file-input').set_input_files({'name':'landscape-fixture.json','mimeType':'application/json','buffer':json.dumps(FIXTURE).encode()})
    page.wait_for_function('nebeljagdMapTestState().map.objects.some(o=>o.id==="qa-original-grass")')
    select_feature(page,'qa-original-grass');page.locator('#focus-selection').click()
    page.locator('#map-viewport').scroll_into_view_if_needed()


def current_object(page, identifier):
    return next(item for item in state(page)['map']['objects'] if item['id']==identifier)


try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1500,'height':1000},accept_downloads=True)
        page=context.new_page();prepare(page,True)
        assert page.locator('.landscape-section').count()==6
        assert page.locator('#vegetation-type option').count()==7
        assert page.locator('#terrain-type option').count()==9
        assert page.locator('#biome-preset option').count()==8
        passed('Six existing-editor sections expose seven vegetation types, nine soils and eight biome presets')

        page.locator('#vegetation-type').select_option('tall')
        control(page,'brush-radius',2);control(page,'vegetation-height',150)
        control(page,'vegetation-height-variation',50);control(page,'vegetation-density',60)
        page.locator('#vegetation-ground').check();control(page,'vegetation-ground-blend',80)
        page.locator('#grass-brush').click()
        before=state(page);drag(page,[-50,14],[-36,14],steps=1)
        after=state(page);painted=[o for o in after['map']['objects'] if o['id'] not in ORIGINAL]
        assert len(painted)>=4,after
        assert after['undoCount']==before['undoCount']+1
        assert all(o['vegetation']['height']==1.5 and o['vegetation']['density']==.6 and o['vegetation']['heightVariation']==.5 and o['vegetation']['groundColor'] for o in painted)
        page.locator('#undo').click();assert state(page)['map']['objects']==FIXTURE['objects']
        page.locator('#redo').click();assert state(page)['map']['objects']==after['map']['objects']
        passed('A fast real mouse stroke paints configured height/density/ground matching and is one undo/redo action',{'patches':len(painted),'settings':painted[0]['vegetation']})
        identifier=painted[0]['id'];select_feature(page,identifier)
        control(page,'object-vegetation-height',300);control(page,'object-vegetation-density',20)
        page.locator('#properties-form button[type=submit]').click()
        changed=current_object(page,identifier)
        assert changed['vegetation']['height']==3 and changed['vegetation']['density']==.2
        assert changed['position']==painted[0]['position'] and changed['radius']==2 and changed['scale']==1
        passed('Existing painted grass height and density can be changed without moving or enlarging its ground footprint')

        page.locator('#eraser-filter').select_option('grass');control(page,'eraser-radius',2)
        page.locator('#object-eraser').click();before_erase=state(page)['map']['objects']
        drag(page,[-50,14],[-36,14],steps=1)
        assert {o['id'] for o in state(page)['map']['objects']}==set(ORIGINAL)
        page.locator('#undo').click();assert state(page)['map']['objects']==before_erase
        passed('The vegetation eraser removes painted patches while keeping existing nearby scenery; undo restores them')

        page.locator('#grass-brush').click();before_cancel=state(page)['map']
        page.locator('#map-viewport').scroll_into_view_if_needed()
        a,b=client(page,[-50,8]),client(page,[-36,8])
        page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=4)
        assert state(page)['brush']['activeStroke'] and state(page)['map']!=before_cancel
        page.keyboard.press('Escape');page.mouse.up()
        assert state(page)['map']==before_cancel
        passed('Escape cancels a pending vegetation stroke and restores all prior settings and objects')

        page.locator('#terrain-type').select_option('sand');control(page,'terrain-radius',3)
        control(page,'terrain-hardness',15);control(page,'terrain-strength',85)
        page.locator('#landscape-terrain-brush').click();before=state(page)
        drag(page,[-49,25],[-38,25],steps=1)
        terrain=state(page)['map']['landscape']['terrain']
        assert len(terrain)>=4 and all(item['type']=='sand' and item['hardness']==.15 for item in terrain)
        assert state(page)['undoCount']==before['undoCount']+1
        assert page.locator('#map-stage #terrain-paint [data-feature-type=terrain]').count()==len(terrain)
        page.locator('#undo').click();assert not state(page)['map'].get('landscape',{}).get('terrain',[])
        page.locator('#redo').click();assert state(page)['map']['landscape']['terrain']==terrain
        select_feature(page,terrain[0]['id']);page.locator('#object-terrain-color').fill('#a48b50')
        page.locator('#properties-form button[type=submit]').click()
        assert state(page)['map']['landscape']['terrain'][0]['color']=='#a48b50'
        passed('Soil strokes have soft edges, one-step undo and editable saved colors in the same map')
        page.locator('#landscape-terrain-erase').click();before_erase=state(page)['map']
        drag(page,[-49,25],[-38,25],steps=1)
        assert not state(page)['map']['landscape']['terrain']
        assert state(page)['map']['objects']==before_erase['objects']
        page.locator('#undo').click();assert state(page)['map']==before_erase
        passed('Soil erasing affects painted ground only and is reversible')

        page.locator('#biome-preset').select_option('meadow');control(page,'biome-radius',4)
        control(page,'biome-strength',100);page.locator('#landscape-biome-brush').click()
        before=state(page);tap(page,[-43,35]);after=state(page)
        assert len(after['map']['landscape']['biomes'])>=1
        assert after['map']['landscape']['biomes'][-1]['presetId']=='meadow'
        assert len(after['map']['landscape']['terrain'])>len(before['map']['landscape']['terrain'])
        assert len(after['map']['objects'])>len(before['map']['objects'])
        assert after['undoCount']==before['undoCount']+1
        page.locator('#undo').click();assert state(page)['map']==before['map']
        page.locator('#redo').click();assert state(page)['map']==after['map']
        passed('Biome painting saves actual editable soil, plant objects and its preset record in one gesture')

        for kind in ['tree','bush','grass','rock','flower']:
            page.locator('#scatter-'+kind).set_checked(kind=='tree')
        page.locator('#scatter-variant-tree').select_option('rei-tree02')
        control(page,'scatter-radius',7);control(page,'scatter-density',80)
        control(page,'scatter-distance',4);control(page,'scatter-min',80);control(page,'scatter-max',120)
        page.locator('#landscape-scatter-brush').click();before=state(page);tap(page,[-66,22]);after=state(page)
        additions=after['map']['objects'][len(before['map']['objects']):]
        assert additions and all(o['kind']=='tree' and o['variant']=='rei-tree02' for o in additions)
        assert all(.8<=o['scale']<=1.2 and 0<=o['rotation']<=2*math.pi for o in additions)
        for i,a in enumerate(additions):
            for b in additions[i+1:]:assert math.dist(a['position'],b['position'])>=3.998
        assert after['undoCount']==before['undoCount']+1
        assert all(current_object(page,key)==value for key,value in ORIGINAL.items())
        passed('Natural scatter uses the chosen existing GLB, varied scale/rotation and minimum spacing while preserving original objects',{'trees':len(additions)})

        control(page,'wind-strength',65);control(page,'wind-speed',1.5)
        control(page,'wind-gust-strength',55);control(page,'wind-turbulence',35)
        page.locator('#wind-enabled').check();page.locator('#wind-compass').scroll_into_view_if_needed()
        box=page.locator('#wind-compass').bounding_box()
        page.mouse.move(box['x']+box['width']/2,box['y']+4);page.mouse.down()
        page.mouse.move(box['x']+box['width']-4,box['y']+box['height']/2,steps=5);page.mouse.up()
        saved_wind=state(page)['map']['landscape']['wind']
        assert saved_wind['strength']==.65 and saved_wind['speed']==1.5
        assert abs(saved_wind['direction']-math.pi/2)<.03
        control(page,'wind-zone-radius',5);control(page,'wind-zone-strength',0);control(page,'wind-zone-falloff',60)
        page.locator('#landscape-wind-zone').click();tap(page,[-47,21])
        zone=state(page)['map']['landscape']['windZones'][-1]
        assert zone['strength']==0 and zone['radius']==5 and zone['falloff']==.6
        assert page.locator(f'#feature-wind-{zone["id"]}').count()==1
        select_feature(page,zone['id']);control(page,'object-wind-radius',7)
        page.locator('#properties-form button[type=submit]').click()
        assert state(page)['map']['landscape']['windZones'][-1]['radius']==7
        passed('The draggable compass saves world wind direction; local sheltered zones retain their editable radius and falloff')

        page.locator('#landscape-preset-name').fill('QA Abendwiese')
        page.locator('#landscape-preset-save').click()
        preset=state(page)['map']['landscape']['presets'][-1]
        assert preset['name']=='QA Abendwiese' and preset['vegetation']['height']==1.5
        control(page,'vegetation-height',25)
        page.locator('#landscape-preset-load').click()
        assert state(page)['landscape']['vegetation']['height']==1.5
        passed('Named landscape settings are saved inside the map and restore vegetation, terrain, scatter and wind controls')
        page.locator('#biome-preset').select_option(preset['id'])
        page.locator('#landscape-biome-brush').click();before_custom=state(page)['map']
        tap(page,[-62,10])
        assert state(page)['map']['landscape']['biomes'][-1]['presetId']==preset['id']
        page.locator('#undo').click();assert state(page)['map']==before_custom
        passed('A saved custom landscape preset can be painted as an editable biome and undone')

        select_feature(page,'qa-original-grass')
        page.locator('#landscape-preview').scroll_into_view_if_needed()
        page.wait_for_function('nebeljagdMapTestState().landscape.preview.ready')
        preview=state(page)['landscape']['preview']
        frames=preview.get('frames',0)
        page.wait_for_function('n=>nebeljagdMapTestState().landscape.preview.frames>n+2',arg=frames)
        assert page.locator('#landscape-preview canvas').is_visible()
        page.screenshot(path=str(ROOT/'docs/screenshots/landscape-editor-preview.png'))
        preview=state(page)['landscape']['preview']
        assert preview['windRoot']=={'x':0,'z':0}
        assert math.hypot(preview['windTip']['x'],preview['windTip']['z'])>0
        passed('The editor renders an animated WebGL vegetation preview using the shared runtime',preview)
        page.locator('#landscape-section-terrain summary').scroll_into_view_if_needed()
        page.wait_for_function('!nebeljagdMapTestState().landscape.preview.visible && !nebeljagdMapTestState().landscape.preview.running')
        paused_frames=state(page)['landscape']['preview']['frames']
        page.wait_for_timeout(150)
        assert state(page)['landscape']['preview']['frames']==paused_frames
        passed('The live preview stops requesting/rendering frames while outside the visible editor area')

        expected=state(page)['map']
        geography=copy.deepcopy(expected);geography.pop('objects');geography.pop('landscape',None)
        original_geography=copy.deepcopy(FIXTURE);original_geography.pop('objects')
        assert geography==original_geography
        with page.expect_download() as info:page.locator('#export-json').click()
        OUT.parent.mkdir(exist_ok=True);info.value.save_as(OUT)
        assert json.loads(OUT.read_text())==expected
        page.reload(wait_until='domcontentloaded');page.wait_for_function('window.nebeljagdMapTestState')
        expect(page.locator('#restore-banner')).to_be_visible();page.locator('#restore-draft').click()
        assert state(page)['map']==expected
        page.locator('#json-file-input').set_input_files(str(OUT));assert state(page)['map']==expected
        passed('Every landscape field survives JSON download/import and a browser reload with draft restoration')
        if page.evaluate('!document.querySelector("script[src]")'):
            with page.expect_download() as info:page.locator('#export-editor').click()
            saved_html=OUT.with_name('landscape-saved-editor.html');info.value.save_as(saved_html)
            offline_context=browser.new_context(offline=True,viewport={'width':1280,'height':850})
            offline=offline_context.new_page();offline.set_default_timeout(120000);monitor(offline)
            requests=[];offline.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
            offline.set_content(saved_html.read_text(),wait_until='domcontentloaded')
            offline.wait_for_function('window.nebeljagdMapTestState')
            assert state(offline)['map']==expected
            assert offline.locator('.landscape-section').count()==6
            for identifier in ['vegetation-type','terrain-type','wind-enabled','landscape-preview','landscape-preset-select']:
                assert offline.locator('[id='+identifier+']').count()==1,identifier
            assert offline.locator('#vegetation-type option').count()==7
            assert offline.locator('#terrain-type option').count()==9
            assert offline.locator('#biome-preset option').count()==9
            assert offline.locator('#landscape-preset-select option').count()==1
            offline.locator('#landscape-preview').scroll_into_view_if_needed()
            offline.wait_for_function('nebeljagdMapTestState().landscape.preview.ready')
            assert not requests,requests
            passed('Saved standalone editor HTML reopens offline with exact landscape data, working WebGL preview and no duplicated controls or HTTP requests')
            offline.close();offline_context.close()
        with page.expect_popup() as info:page.locator('#playtest-world').click()
        game=info.value;monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0',timeout=120000)
        generated=game.evaluate('''()=>{const s=nebeljagdTestState();return{source:s.world.source,objects:s.world.objects,landscape:s.world.landscape,stats:s.world.stats};}''')
        assert generated['source']=='editor' and generated['objects']==expected['objects']
        assert generated['landscape']==expected['landscape']
        assert generated['stats']['loadedGLBs']==5
        passed('In 3D testen transfers the exact landscape settings and object document to the existing game',{'objects':len(generated['objects']),'terrain':len(expected['landscape']['terrain']),'stats':generated['stats']})
        game.close()

        kit_map=copy.deepcopy(expected)
        kit_map['objects'].append({'id':'qa-kit-preview','name':'QA GLB-Versteckgras','kind':'grass','variant':'kit-tall',
                                  'position':[-55,20],'rotation':.2,'scale':1,'radius':2})
        page.locator('#json-file-input').set_input_files({'name':'kit-preview.json','mimeType':'application/json','buffer':json.dumps(kit_map).encode()})
        select_feature(page,'qa-kit-preview')
        page.locator('#landscape-preview').scroll_into_view_if_needed()
        page.wait_for_function('''()=>{const p=nebeljagdMapTestState().landscape.preview;return p.ready&&!p.pending&&p.patch?.renderVariant==='kit-tall'&&p.calls>1;}''')
        kit_preview=state(page)['landscape']['preview']
        assert kit_preview['patch']['assetVariant']=='kit-tall' and kit_preview['patch']['instanceCount']>0
        assert kit_preview['patch']['modelTrianglesPerInstance']==1248
        assert kit_preview['loadedGLBs']==1, kit_preview
        frames=kit_preview['frames']
        page.wait_for_function('n=>nebeljagdMapTestState().landscape.preview.frames>n+2',arg=frames)
        control(page,'object-vegetation-height',200);control(page,'object-vegetation-density',40)
        page.locator('#landscape-preview').scroll_into_view_if_needed()
        page.wait_for_function('''()=>{const p=nebeljagdMapTestState().landscape.preview;return p.ready&&!p.pending&&p.patch?.renderVariant==='kit-tall'&&p.settings.height===2&&p.settings.density===.4;}''')
        changed_preview=state(page)['landscape']['preview']
        assert changed_preview['patch']['height']==3.9
        assert changed_preview['patch']['instanceCount']<kit_preview['patch']['instanceCount']
        assert current_object(page,'qa-kit-preview')==kit_map['objects'][-1], 'Preview slider changes committed before Apply.'
        page.screenshot(path=str(ROOT/'docs/screenshots/landscape-editor-kit-preview.png'))
        page.locator('#object-vegetation-type').select_option('meadow')
        page.locator('#landscape-preview').scroll_into_view_if_needed()
        page.wait_for_function('''()=>{const p=nebeljagdMapTestState().landscape.preview;return p.ready&&!p.pending&&p.settings.type==='meadow'&&p.patch?.renderVariant==='tall';}''')
        passed('Selected GLB hiding grass renders its actual animated kit clusters; uncommitted height/density changes preview correctly and choosing meadow switches renderer',
               {'original':kit_preview,'changed':changed_preview})
        page.close();context.close()

        touch=browser.new_context(viewport={'width':1024,'height':768},is_mobile=True,has_touch=True,device_scale_factor=1)
        page=touch.new_page();prepare(page)
        control(page,'brush-radius',2);page.locator('#grass-brush').click()
        page.locator('#map-viewport').scroll_into_view_if_needed();before=state(page)
        session=touch.new_cdp_session(page)
        a,b=client(page,[-50,14]),client(page,[-36,14])
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
        for i in range(1,9):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{key:a[key]+(b[key]-a[key])*i/8 for key in ['x','y']}]})
        session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        assert len(state(page)['map']['objects'])>len(FIXTURE['objects'])
        assert state(page)['undoCount']==before['undoCount']+1
        page.locator('#undo').click();assert state(page)['map']['objects']==FIXTURE['objects']
        passed('Native tablet-touch vegetation painting works and remains one undo action')
        page.locator('#landscape-terrain-brush').click();page.locator('#map-viewport').scroll_into_view_if_needed()
        before=state(page)['map'];a,b=client(page,[-50,14]),client(page,[-36,14])
        session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
        session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[b]})
        assert len(state(page)['map'].get('landscape',{}).get('terrain',[]))>0
        session.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
        assert state(page)['map']==before
        passed('A cancelled native touch terrain stroke restores the full pre-gesture document')
        browser.close()
    assert not REPORT['errors'],REPORT['errors']
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error)
    raise
finally:
    (ROOT/'docs/landscape-editor-check.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
