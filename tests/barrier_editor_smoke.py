"""Real mouse/touch journeys for editable wall and fence routes.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/barrier_editor_smoke.py
Set NEBELJAGD_STANDALONE=1 when serving the built welt/ directory to also
verify self-contained HTML roundtripping. The state hook is read-only.
"""
from __future__ import annotations
import copy
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
OUT = ROOT / 'test-results/barriers'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'standalone': STANDALONE,
          'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Chromium SwiftShader and native touch emulation; no physical iPad measurement.'}


def fixture():
    value = json.loads((ROOT / 'worldmap.json').read_text())
    value.update(name='Mauern und Zäune · Testinsel', bounds={'minX': -160, 'minZ': -160, 'maxX': 160, 'maxZ': 160})
    value['island']['points'] = [[-150, -150], [150, -150], [150, 150], [-150, 150]]
    value['regions'] = [{'id': 'qa-meadow', 'name': 'Wiese', 'biome': 'meadow', 'color': '#5a8844',
                         'points': copy.deepcopy(value['island']['points']), 'label': [0, 0]}]
    value['paths'] = []; value['rivers'] = []; value['places'] = []
    value['gameplay']['spawnPosition'] = [-10, -65]
    value['spawnAreas'] = [{'id': 'qa-start', 'name': 'Start', 'position': [-10, -65], 'radius': 8, 'capacity': 50}]
    value['zone']['center'] = [0, 0]
    value['objects'] = [
        {'id': 'qa-heart', 'name': 'Herz', 'kind': 'heart', 'variant': 'healing', 'position': [75, 70], 'rotation': 0, 'scale': 1},
        {'id': 'qa-bow', 'name': 'Bogen', 'kind': 'bow', 'variant': 'wood', 'position': [65, 70], 'rotation': 0, 'scale': 1, 'rarity': 'rare'},
    ]
    value.pop('landscape', None); value.pop('barriers', None)
    return value


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence}); print('PASS', name, flush=True)


def state(page): return page.evaluate('nebeljagdMapTestState()')
def routes(page): return state(page)['map'].get('barriers', [])


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
    page.set_default_timeout(45000)


def ready(page):
    monitor(page); page.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdMapTestState')


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'barriers.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def action(page, name):
    page.locator('#editor-tab-' + name).click(); expect(page.locator('#editor-pane-' + name)).to_be_visible()


def client(page, point):
    return page.evaluate('p=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};}', point)


def tap(page, point):
    p = client(page, point); page.mouse.click(p['x'], p['y'])


def begin(page, point):
    p = client(page, point); page.mouse.move(p['x'], p['y']); page.mouse.down()


def move(page, point, steps=5):
    p = client(page, point); page.mouse.move(p['x'], p['y'], steps=steps)


def drag(page, points):
    begin(page, points[0])
    for point in points[1:]: move(page, point)
    page.mouse.up()


def drawing(page, kind='wall', shape='straight'):
    action(page, 'objects')
    page.locator('#barrier-kind').select_option(kind); page.locator('#barrier-shape').select_option(shape)
    if state(page)['mode'] != 'barrierDraw': page.locator('#barrier-draw').click()
    assert state(page)['mode'] == 'barrierDraw'


def capture(page, name, locator=None):
    path = OUT / (name + '.png')
    (locator or page).screenshot(path=str(path)); REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def open_control(page, identifier):
    control = page.locator('#' + identifier)
    for detail in control.locator('xpath=ancestor::details').all():
        if detail.get_attribute('open') is None: detail.locator(':scope > summary').click()
    control.scroll_into_view_if_needed(); return control


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        page = context.new_page(); ready(page)
        value = fixture(); import_map(page, value)
        drawing(page); before = state(page)
        drag(page, [[-75, -60], [65, -60]])
        first = routes(page)[0]
        assert first['kind'] == 'wall' and first['points'] == [[-75, -60], [65, -60]]
        assert first['gaps'] == [] and state(page)['map']['objects'] == value['objects']
        assert state(page)['undoCount'] == before['undoCount'] + 1
        expected = state(page)['map']
        page.locator('#undo').click(); assert state(page)['map'] == before['map']
        page.locator('#redo').click(); assert state(page)['map'] == expected
        passed('Mouse drag creates one editable wall route, preserves placed loot and supports one-step Undo/Redo')

        page.locator('#barrier-gap').click(); tap(page, [-35, -60]); tap(page, [25, -60])
        route = routes(page)[0]
        assert route['gaps'] == [{'at': 40, 'width': 3}, {'at': 100, 'width': 3}]
        assert route['points'] == first['points']
        solid = page.locator(f'#feature-barrier-{route["id"]} .barrier-solid').get_attribute('d')
        assert solid.count('M') == 3
        passed('Two deliberate openings cut the visible route and persist as independent gap records', route['gaps'])

        page.locator('#tool-select').click(); tap(page, [-55, -60])
        assert state(page)['selection']['type'] == 'barrier'
        old = copy.deepcopy(routes(page)[0])
        page.locator('#barrier-object-kind').select_option('fence'); page.locator('#barrier-object-scale').fill('1.2')
        page.locator('.apply-properties').click()
        swapped = routes(page)[0]
        assert swapped['kind'] == 'fence' and swapped['variant'] == 'kit-wood' and swapped['scale'] == 1.2
        assert swapped['points'] == old['points'] and swapped['gaps'] == old['gaps'] and swapped['id'] == old['id']
        assert state(page)['map']['objects'] == value['objects']
        passed('Changing a selected route from stone to wood preserves its exact route, ID and both passages')

        page.locator('#add-vertex').click()
        assert len(routes(page)[0]['points']) == 3
        selected = state(page)['selection']['vertex']; handle = routes(page)[0]['points'][selected]
        drag(page, [handle, [handle[0], handle[1] + 22]])
        bent = routes(page)[0]
        assert bent['points'][selected] != handle
        assert len(bent['gaps']) == 2
        page.locator('#delete-vertex').click(); assert len(routes(page)[0]['points']) == 2
        page.locator('#undo').click(); assert routes(page)[0] == bent
        passed('Existing form handles insert, move and remove corners on a route; Undo restores its complete geometry')

        page.locator('#barrier-selection-preview').click()
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready', timeout=90000)
        assert int(page.locator('#barrier-preview').get_attribute('data-preview-objects')) > 1
        expect(page.locator('#barrier-preview canvas')).to_be_visible()
        capture(page, 'actual-glb-preview', page.locator('#barrier-preview'))
        passed('The selected route renders actual instanced GLBs in the lazy 3D preview')

        drawing(page, 'wall', 'freehand'); before = state(page)
        drag(page, [[-70, 10], [-15, 10], [-15, 65], [50, 65]])
        free = routes(page)[-1]
        assert free['kind'] == 'wall' and 3 <= len(free['points']) <= 6
        assert free['points'][0] == [-70, 10] and free['points'][-1] == [50, 65]
        assert state(page)['undoCount'] == before['undoCount'] + 1
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready', timeout=90000)
        expect(page.locator('#barrier-preview-status')).to_contain_text('Mauer')
        capture(page, 'drawn-routes')
        passed('A mouse freehand stroke preserves deliberate bends while simplifying redundant samples', free['points'])

        before = state(page); begin(page, [-60, 95]); move(page, [25, 95])
        assert state(page)['barriers']['activeStroke']
        page.keyboard.press('Escape'); page.mouse.up()
        assert state(page)['map'] == before['map'] and state(page)['undoCount'] == before['undoCount']
        drawing(page, 'fence'); begin(page, [-60, 95]); move(page, [25, 95])
        page.locator('#map-viewport').dispatch_event('pointercancel', {'pointerId': 1})
        page.mouse.up(); assert state(page)['map'] == before['map']
        action(page, 'paint'); assert state(page)['mode'] == 'select'
        tap(page, [90, -90]); assert state(page)['map'] == before['map']
        passed('Escape and pointer cancellation discard in-progress routes; changing panes disables the wall tool')

        action(page, 'objects'); page.locator('#barrier-erase').click(); before = state(page)
        drag(page, [[0, -90], [0, 90]])
        assert not routes(page) and state(page)['map']['objects'] == value['objects']
        assert state(page)['undoCount'] == before['undoCount'] + 1
        page.locator('#undo').click(); assert state(page)['map'] == before['map']
        page.locator('#redo').click(); assert not routes(page)
        page.locator('#undo').click()
        passed('A swept line eraser removes every crossed route in one undo step and leaves loot untouched')

        page.locator('#tool-select').click(); expected = state(page)['map']
        with page.expect_download() as download: page.locator('#export-json').click()
        saved = OUT / 'worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == expected
        import_map(page, value); import_map(page, expected)
        assert len(routes(page)[0]['gaps']) == 2
        page.reload(wait_until='domcontentloaded'); page.wait_for_function('window.nebeljagdMapTestState')
        page.locator('#restore-draft').click(); assert state(page)['map'] == expected
        passed('Normal JSON download/import and local draft restoration preserve routes, bends, styles and multiple gaps')

        if STANDALONE:
            action(page, 'more'); open_control(page, 'export-editor')
            with page.expect_download() as download: page.locator('#export-editor').click()
            html = OUT / 'saved-editor.html'; download.value.save_as(html)
            offline_context = browser.new_context(offline=True, viewport={'width': 1440, 'height': 1000})
            offline = offline_context.new_page(); monitor(offline)
            offline.set_content(html.read_text(), wait_until='domcontentloaded'); offline.wait_for_function('window.nebeljagdMapTestState')
            assert state(offline)['map'] == expected
            assert offline.locator('#barrier-tools').count() == 1 and offline.locator('#barrier-properties').count() == 1
            duplicates = offline.evaluate('()=>{const s=new Set();return [...document.querySelectorAll("[id]")].map(e=>e.id).filter(id=>s.has(id)||!s.add(id));}')
            assert not duplicates, duplicates
            drawing(offline, 'fence'); drag(offline, [[-60, 110], [30, 110]])
            assert len(routes(offline)) == len(expected['barriers']) + 1
            offline_context.close()
            passed('Exported standalone HTML reopens offline with exact multi-gap routes, working drawing tools and unique controls')

        # Observe the real editor-to-game handshake without changing either document.
        context.add_init_script("window.__barrierTransfer=null;addEventListener('message',e=>{if(e.data?.type==='nebeljagd-map')window.__barrierTransfer=e.data.map;});")
        with page.expect_popup() as popup: page.locator('#playtest-world').click()
        game = popup.value; monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0', timeout=120000)
        game_state = game.evaluate('()=>{const s=nebeljagdTestState();return {source:s.world.source,objects:s.world.objects,stats:s.world.stats,transferred:window.__barrierTransfer};}')
        assert game_state['source'] == 'editor'
        assert game_state['transferred']['barriers'] == expected['barriers']
        assert game_state['objects'] == expected['objects']
        stats = game_state['stats']
        assert stats['barrierCount'] == len(expected['barriers'])
        assert stats['barrierSegmentCount'] > len(expected['barriers'])
        assert stats['authoredObjectCount'] == len(expected['objects'])
        assert stats['totalObjects'] == len(expected['objects']) + stats['barrierSegmentCount']
        capture(game, 'playtest-popup'); game.close()
        passed('Spielen transfers canonical routes into the real game and expands them into GLB segments without baking over the original objects',
               {key: stats[key] for key in ['barrierCount', 'barrierSegmentCount', 'authoredObjectCount', 'totalObjects']})

        touch_context = browser.new_context(viewport={'width': 1024, 'height': 900}, has_touch=True, is_mobile=True)
        touch = touch_context.new_page(); ready(touch); import_map(touch, value); drawing(touch, 'fence')
        session = touch_context.new_cdp_session(touch)
        a, b = client(touch, [-65, -35]), client(touch, [55, -35])
        before = state(touch)
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [a]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [b]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        assert routes(touch)[0]['points'] == [[-65, -35], [55, -35]]
        assert state(touch)['undoCount'] == before['undoCount'] + 1
        assert state(touch)['map']['objects'] == value['objects']
        expected_touch = state(touch)
        a, b = client(touch, [-65, 35]), client(touch, [55, 35])
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [a]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [b]})
        assert state(touch)['barriers']['activeStroke']
        session.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
        assert state(touch)['map'] == expected_touch['map'] and not state(touch)['barriers']['activeStroke']
        capture(touch, 'tablet-drawing')
        passed('Native tablet touch draws one route; touchCancel leaves map and undo history unchanged')
        touch_context.close(); context.close(); browser.close()
    assert not REPORT['errors'], REPORT['errors']
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'; REPORT['failure'] = str(error)
    raise
finally:
    (OUT / ('standalone-report.json' if STANDALONE else 'report.json')).write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
