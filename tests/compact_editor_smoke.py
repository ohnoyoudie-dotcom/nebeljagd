"""Real journeys and viewport measurements for the compact single-tool editor.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/compact_editor_smoke.py
NEBELJAGD_URL=http://127.0.0.1:5206 NEBELJAGD_STANDALONE=1 python tests/compact_editor_smoke.py
Only ordinary UI controls mutate fixture maps. The existing test hook reads state.
"""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
OUT = ROOT / 'test-results/compact-editor'
OUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'url': URL, 'standalone': STANDALONE,
          'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Real Chromium with SwiftShader over local HTTP; mobile layout uses viewport emulation, not a physical device performance test.'}
baseline_file = OUT / 'baseline.json'
if baseline_file.exists(): REPORT['baseline'] = json.loads(baseline_file.read_text())
if STANDALONE:
    file = ROOT / 'welt/map-editor.html'
    REPORT['delivery'] = {'file': 'welt/map-editor.html', 'bytes': file.stat().st_size,
                          'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                          'unexpectedResourceRequests': []}


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def state(page): return page.evaluate('window.nebeljagdMapTestState()')


def fixture():
    value = copy.deepcopy(BASE)
    value.update(name='Kompakter Editor · Testinsel', bounds={'minX': -160, 'minZ': -160, 'maxX': 160, 'maxZ': 160})
    value['island']['points'] = [[-150, -150], [150, -150], [150, 150], [-150, 150]]
    value['regions'] = [{'id': 'qa-meadow', 'name': 'Wiese', 'biome': 'meadow', 'color': '#5a8844',
                         'points': copy.deepcopy(value['island']['points']), 'label': [0, 0]}]
    value['paths'] = []; value['rivers'] = []; value['places'] = []
    value['objects'] = []; value['barriers'] = []
    value['gameplay']['spawnPosition'] = [-120, -120]
    value['spawnAreas'] = [{'id': 'qa-start', 'name': 'Start', 'position': [-120, -120], 'radius': 8, 'capacity': 50}]
    value['zone']['center'] = [0, 0]
    value.pop('landscape', None)
    return value


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({
        'name': 'compact-editor.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def action(page, group, tool=None):
    page.locator('#editor-tab-' + group).click()
    expect(page.locator('#editor-pane-' + group)).to_be_visible()
    if tool is not None:
        button = page.locator(f'#editor-tool-{group}-{tool}')
        button.click()
        expect(page.locator('#' + button.get_attribute('aria-controls'))).to_be_visible()


def open_control(page, identifier):
    control = page.locator('#' + identifier)
    panel = control.locator('xpath=ancestor::*[@data-editor-tool-panel]')
    if panel.count():
        tool = panel.first.get_attribute('data-editor-tool-panel')
        group = panel.first.locator('xpath=ancestor::section[contains(@class,"editor-pane")]').get_attribute('id').removeprefix('editor-pane-')
        action(page, group, tool)
    for detail in control.locator('xpath=ancestor::details').all():
        if detail.get_attribute('open') is None:
            detail.locator(':scope > summary').click()
    control.scroll_into_view_if_needed()
    return control


def slider(page, identifier, value):
    control = open_control(page, identifier)
    control.evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));}', value)
    assert float(control.input_value()) == value


def client(page, point):
    return page.evaluate('p=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};}', point)


def drag(page, a, b):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    start, end = client(page, a), client(page, b)
    page.mouse.move(start['x'], start['y']); page.mouse.down()
    page.mouse.move(end['x'], end['y'], steps=12); page.mouse.up()


def tap(page, point):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    p = client(page, point); page.mouse.click(p['x'], p['y'])


def roundtrip_history(page, before, after):
    page.locator('#undo').click(); assert state(page)['map'] == before
    page.locator('#redo').click(); assert state(page)['map'] == after


def capture(page, name):
    path = OUT / f'{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def check_primary_fit(page, group, tool, ids):
    action(page, group, tool)
    measurement = page.evaluate('''ids => {
      const side=document.querySelector('.sidebar'), box=side.getBoundingClientRect();
      return {scrollTop:side.scrollTop,height:side.clientHeight,scrollHeight:side.scrollHeight,
        controls:ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {
          id,visible:!!e.getClientRects().length,top:r.top,bottom:r.bottom,
          fits:!!e.getClientRects().length&&r.top>=box.top-1&&r.bottom<=Math.min(box.bottom,innerHeight)+1
        };})};
    }''', ids)
    assert measurement['scrollTop'] == 0, (group, tool, measurement)
    assert all(item['fits'] for item in measurement['controls']), (group, tool, measurement)
    panels = page.locator(f'#editor-pane-{group} [data-editor-tool-panel]').evaluate_all(
        'xs=>xs.filter(e=>e.getClientRects().length).map(e=>e.dataset.editorToolPanel)')
    assert panels == [tool], panels
    return {'group': group, 'tool': tool, **measurement}


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        page = context.new_page(); page.set_default_timeout(30000)
        page.route_web_socket('**', lambda ws: None)
        page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
        if STANDALONE:
            def monitor_request(request):
                parsed=urlsplit(request.url)
                if parsed.scheme not in ['http', 'https']: return
                if parsed.netloc==urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path=='/favicon.ico'): return
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
            context.on('request', monitor_request)
        page.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdMapTestState')
        assert state(page)['map'] == BASE
        expect(page.locator('.inspector')).to_be_hidden()
        capture(page, 'island-overview')
        passed('The editor opens the actual redesigned island and preserves the authored Tripo house and barrier routes',
               {'coastVertices': len(BASE['island']['points']), 'regions': len(BASE['regions']),
                'objects': [o['id'] for o in BASE['objects']], 'barriers': [b['id'] for b in BASE.get('barriers', [])]})

        layout = []
        for width, height in [(1280, 800), (1024, 768)]:
            page.set_viewport_size({'width': width, 'height': height})
            checks = []
            for group, tool, ids in [
                ('paint', 'biomes', ['biome-radius', 'landscape-biome-brush']),
                ('paint', 'vegetation', ['brush-radius', 'grass-brush']),
                ('paint', 'terrain', ['terrain-type', 'landscape-terrain-brush']),
                ('objects', 'place', ['palette-kind', 'palette-variant', 'place-object']),
                ('objects', 'barriers', ['barrier-kind', 'barrier-height', 'barrier-draw', 'barrier-gap']),
                ('objects', 'scatter', ['scatter-variant-rock', 'landscape-scatter-brush']),
            ]:
                checks.append(check_primary_fit(page, group, tool, ids))
                if width==1280 and tool=='barriers': capture(page, 'walls-1280')
            for identifier in ['tool-select', 'tool-pan', 'undo', 'redo', 'export-json', 'playtest-world']:
                expect(page.locator('#' + identifier)).to_be_visible()
            action(page, 'objects', 'place'); capture(page, f'layout-{width}')
            layout.append({'width': width, 'height': height, 'tools': checks})
        passed('All primary paint, grass, ground, object, wall/fence and scatter actions fit without left-side scrolling at 1280×800 and 1024×768', layout)

        page.set_viewport_size({'width': 1280, 'height': 800})
        value = fixture(); import_map(page, value)
        action(page, 'paint', 'biomes'); slider(page, 'biome-radius', 10)
        page.locator('[data-biome-choice="snow"]').click()
        before=copy.deepcopy(state(page)['map']); drag(page, [-70, -60], [-20, -60]); painted=state(page)['map']
        assert len(painted['landscape']['biomes']) > 1 and painted['objects'] == []
        roundtrip_history(page, before, painted)
        action(page, 'paint', 'terrain'); page.locator('#terrain-type').select_option('sand')
        slider(page, 'terrain-radius', 6); page.locator('#landscape-terrain-brush').click()
        before=copy.deepcopy(state(page)['map']); drag(page, [25, -60], [70, -60]); ground=state(page)['map']
        assert ground['landscape']['biomes'] == before['landscape']['biomes']
        assert len(ground['landscape']['terrain']) > len(before['landscape']['terrain'])
        roundtrip_history(page, before, ground)
        action(page, 'erase'); page.locator('#erase-target').select_option('surface'); slider(page, 'surface-eraser-radius', 14)
        before=copy.deepcopy(state(page)['map']); drag(page, [-70, -60], [-20, -60]); erased=state(page)['map']
        assert erased['landscape']['biomes'] == []
        assert 0 < len(erased['landscape']['terrain']) < len(before['landscape']['terrain'])
        roundtrip_history(page, before, erased)
        passed('Landscape, ground-only painting and surface erasing retain their distinct effects and whole-stroke Undo/Redo')

        action(page, 'paint', 'vegetation'); slider(page, 'brush-radius', 4); page.locator('#grass-brush').click()
        before=copy.deepcopy(state(page)['map']); drag(page, [-70, 45], [-35, 45]); grassy=state(page)['map']
        assert grassy['objects'] and all(o['kind']=='grass' for o in grassy['objects'])
        roundtrip_history(page, before, grassy)
        action(page, 'erase'); page.locator('#erase-target').select_option('grass'); slider(page, 'surface-eraser-radius', 6)
        before=copy.deepcopy(state(page)['map']); tap(page, before['objects'][0]['position']); grass_erased=state(page)['map']
        assert len(grass_erased['objects']) < len(before['objects'])
        assert grass_erased.get('landscape') == before.get('landscape')
        roundtrip_history(page, before, grass_erased)
        passed('Dedicated high-grass painting and grass-only erasing still work with reversible strokes')

        action(page, 'paint', 'biomes'); page.locator('[data-biome-choice="snow"]').click()
        assert state(page)['mode']=='biome'
        action(page, 'paint', 'terrain'); assert state(page)['mode']=='select'
        action(page, 'objects', 'place'); assert state(page)['mode']=='select'
        before=copy.deepcopy(state(page)['map']); tap(page, [110, -95]); assert state(page)['map']==before
        page.locator('#clear-selection').click() if page.locator('#clear-selection').is_visible() else None
        page.locator('#palette-kind').select_option('house'); page.locator('#palette-variant').select_option('kit-tripo-house-02')
        page.locator('#place-object').click(); tap(page, [60, 45])
        placed=state(page)['map']['objects'][-1]
        assert placed['variant']=='kit-tripo-house-02'
        page.locator('#tool-select').click()
        expect(page.locator('.inspector')).to_be_visible()
        page.locator('#clear-selection').click(); expect(page.locator('.inspector')).to_be_hidden()
        passed('Subtool/task changes stop hidden brushes; a Tripo house can be placed and its inspector opened and closed')

        action(page, 'objects', 'barriers'); page.locator('#barrier-kind').select_option('wall-tripo')
        page.locator('#barrier-height').fill('2'); open_control(page, 'barrier-shape').select_option('straight')
        page.locator('#barrier-draw').click(); drag(page, [-80, 95], [80, 95])
        wall=state(page)['map']['barriers'][-1]
        assert wall['variant']=='kit-tripo-wall' and wall['height']==2
        page.locator('#barrier-gap').click(); tap(page, [0, 95])
        wall=state(page)['map']['barriers'][-1]; assert len(wall['gaps'])==1
        page.locator('#barrier-kind').select_option('fence-cross-wood'); page.locator('#barrier-height').fill('1.5')
        page.locator('#barrier-draw').click(); drag(page, [-80, 120], [80, 120])
        fence=state(page)['map']['barriers'][-1]
        assert fence['variant']=='kit-cross-wood' and fence['height']==1.5
        page.locator('#tool-select').click()
        passed('The compact wall/fence tool draws both model types, preserves wall height and creates a passage', {'wall': wall, 'fence': fence})

        expected=copy.deepcopy(state(page)['map'])
        with page.expect_download() as download: page.locator('#export-json').click()
        saved=OUT/'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text())==expected
        import_map(page, BASE); import_map(page, expected)
        assert state(page)['map']==expected
        passed('JSON save/load preserves all painted surfaces, grass, Tripo objects and drawn routes exactly')

        if STANDALONE:
            action(page, 'more', 'map')
            with page.expect_download() as download: open_control(page, 'export-editor').click()
            html_copy=OUT/'roundtrip-editor.html'; download.value.save_as(html_copy)
            reopened=context.new_page()
            reopened.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
            reopened.on('console', lambda message: REPORT['errors'].append(message.text) if message.type=='error' else None)
            reopened.route(URL+'/qa-editor-roundtrip.html', lambda route: route.fulfill(path=str(html_copy), content_type='text/html'))
            reopened.goto(URL+'/qa-editor-roundtrip.html', wait_until='domcontentloaded')
            reopened.wait_for_function('window.nebeljagdMapTestState')
            assert state(reopened)['map']==expected
            for selector in ['.editor-action-nav', '#palette-kind', '#tool-select', '#grass-brush', '#barrier-draw']:
                assert reopened.locator(selector).count()==1, selector
            for group, tool in [('paint','biomes'),('paint','vegetation'),('paint','terrain'),('objects','place'),('objects','barriers'),('objects','scatter'),('more','shape'),('more','wind'),('more','map')]:
                action(reopened, group, tool)
            passed('Exported standalone HTML reopens the exact map and rebuilds every compact tool panel without losing or duplicating original controls',
                   {'bytes':html_copy.stat().st_size,'sha256':hashlib.sha256(html_copy.read_bytes()).hexdigest()})
            reopened.close()

        import_map(page, BASE)
        page.set_viewport_size({'width': 390, 'height': 844})
        action(page, 'objects', 'place')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        for identifier in ['palette-kind', 'palette-variant', 'place-object']:
            expect(page.locator('#'+identifier)).to_be_visible()
        page.locator('#place-object').scroll_into_view_if_needed()
        assert page.locator('#place-object').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}')
        capture(page, 'layout-390')
        action(page, 'paint', 'biomes'); capture(page, 'mobile-paint')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        passed('The 390 px layout keeps tool selection and controls usable without horizontal page overflow')
        assert not REPORT['errors'], REPORT['errors']
        if STANDALONE: assert not REPORT['delivery']['unexpectedResourceRequests'], REPORT['delivery']
        browser.close()
    assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==MAP_HASH
    REPORT['sourceMapUnchanged']=MAP_HASH
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed'; REPORT['failure']=str(error)
    try: page.screenshot(path=str(OUT/'failure.png'))
    except Exception: pass
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors']},ensure_ascii=False),flush=True)
