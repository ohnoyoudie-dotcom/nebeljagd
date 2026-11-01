"""Current reference layout: editor round-trips and ordinary travel over both bridges.

NEBELJAGD_URL=http://127.0.0.1:5195 python tests/two_access_smoke.py
NEBELJAGD_URL=http://127.0.0.1:5208 NEBELJAGD_STANDALONE=1 python tests/two_access_smoke.py
The test hook reads state only. Fixture starts are loaded through the game's
normal JSON file import, and all travel/collision checks use keyboard input.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5195').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
EDITOR_ONLY = os.environ.get('NEBELJAGD_EDITOR_ONLY') == '1'
OUT = ROOT / 'test-results/reference-layout'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = json.loads((ROOT / 'worldmap.json').read_text())
SOURCE_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'url': URL, 'standalone': STANDALONE, 'editorOnly': EDITOR_ONLY,
          'sourceSha256': SOURCE_HASH, 'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Chromium with software WebGL; imported fixture starts and ordinary movement. Topological isolation is independently covered by the map graph tests; no device-performance claim.'}
if STANDALONE:
    REPORT['delivery'] = {'files': {}, 'unexpectedRequests': []}
    for name in ['map-editor.html', 'nebeljagd.html', 'worldmap.json']:
        data = (ROOT / 'welt' / name).read_bytes()
        REPORT['delivery']['files'][name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def editor_state(page): return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {const s=nebeljagdTestState();return {
      phase:s.phase,elapsed:s.elapsed,position:s.position,direction:s.direction,
      rollCooldown:s.rollCooldown,rollRemaining:s.rollRemaining,minimap:s.minimap,
      rendering:s.rendering,world:{mapName:s.world.mapName,source:s.world.source,
        groundHeight:s.world.groundHeight,isWater:s.world.isWater,stats:s.world.stats,
        objects:s.world.objects}};}''')


def monitor(page):
    page.set_default_timeout(120000)
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)


def action(page, group, tool=None):
    page.locator('#editor-tab-' + group).click()
    if tool: page.locator(f'#editor-tool-{group}-{tool}').click()


def open_control(page, identifier):
    item = page.locator('#' + identifier)
    pane = item.locator('xpath=ancestor::section[contains(@class,"editor-pane")]')
    if pane.count():
        group = pane.get_attribute('id').removeprefix('editor-pane-')
        panel = item.locator('xpath=ancestor::*[@data-editor-tool-panel]')
        action(page, group, panel.first.get_attribute('data-editor-tool-panel') if panel.count() else None)
    for details in item.locator('xpath=ancestor::details').all():
        if details.get_attribute('open') is None: details.locator(':scope > summary').click()
    item.scroll_into_view_if_needed()
    return item


def import_editor(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'two-access.json', 'mimeType': 'application/json',
                                                   'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def tap(page, point):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    target = page.evaluate('p=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};}', point)
    page.mouse.click(target['x'], target['y'])


def capture(page, name):
    previous_size = page.viewport_size
    if previous_size != {'width': 1280, 'height': 800}:
        page.set_viewport_size({'width': 1280, 'height': 800})
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    path = OUT / (name + '.png'); page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))
    if page.viewport_size != previous_size: page.set_viewport_size(previous_size)


def trace_walk(page, keys, seconds):
    """Record render-frame observations while only ordinary keyboard input moves the player."""
    try:
        for key in keys: page.keyboard.down(key)
        trace = page.evaluate("""async duration => {
          const samples=[]; const start=nebeljagdTestState().elapsed;
          do {
            const s=nebeljagdTestState();
            if(s.phase!=='playing') throw new Error('Travel stopped in phase '+s.phase);
            samples.push({elapsed:s.elapsed,position:s.position,isWater:s.world.isWater,
                          groundHeight:s.world.groundHeight,biome:s.world.biome});
            if(s.elapsed>=start+duration) break;
            await new Promise(requestAnimationFrame);
          } while(true);
          return samples;
        }""", seconds)
    finally:
        for key in keys: page.keyboard.up(key)
    assert len(trace) > 5, trace
    assert all(not sample['isWater'] and math.isfinite(sample['position']['y']) for sample in trace)
    steps = [(math.hypot(b['position']['x']-a['position']['x'], b['position']['z']-a['position']['z']),
              abs(b['position']['y']-a['position']['y'])) for a,b in zip(trace,trace[1:])]
    assert max(step[0] for step in steps) < .75, 'no teleport across the channel: ' + str(max(steps))
    steepest = max(zip(trace,trace[1:]), key=lambda pair:abs(pair[1]['position']['y']-pair[0]['position']['y']))
    assert max(step[1] for step in steps) < .6, 'no vertical step at the deck: ' + json.dumps(steepest)
    return trace


def load_game_start(page, point, label):
    value = copy.deepcopy(SOURCE)
    value['name'] = 'Zwei Brücken · ' + label
    value['gameplay']['spawnPosition'] = point
    with page.expect_navigation(wait_until='domcontentloaded'):
        page.locator('#worldMapFile').set_input_files({'name': 'two-access-' + label + '.json',
            'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
    expect(page.locator('#errorScreen')).to_be_hidden()
    expect(page.locator('#startBtn')).to_be_enabled()
    state = game_state(page)
    assert state['world']['mapName'] == value['name'] and state['world']['source'] == 'import', state
    page.locator('#startBtn').click()
    page.wait_for_function("nebeljagdTestState().phase==='playing'")
    state = game_state(page)
    assert math.hypot(state['position']['x']-point[0], state['position']['z']-point[1]) < .5, state
    return state


try:
    assert len(SOURCE['paths']) == 2 and all(path['kind'] == 'bridge' for path in SOURCE['paths'])
    assert len(SOURCE['rivers']) == 2
    assert {region['biome'] for region in SOURCE['regions']} == {'snow','meadow','forest','marsh','heath','dunes','volcanic'}
    assert len(SOURCE.get('waterAreas', [])) == 1
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 800}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        if STANDALONE:
            def resource(request):
                parsed = urlsplit(request.url)
                if parsed.scheme not in ['http', 'https']: return
                if parsed.netloc == urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path == '/favicon.ico'): return
                REPORT['delivery']['unexpectedRequests'].append(request.url)
            context.on('request', resource)
        editor = context.new_page(); monitor(editor)
        editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_state(editor)['map'] == SOURCE
        assert editor.locator('#map-stage [data-feature-type="path"]').count() == 2
        assert editor.locator('#map-stage [data-feature-type="river"]').count() == 2
        water = SOURCE['waterAreas'][0]
        expect(editor.locator(f'#map-stage [data-feature-type="waterArea"][data-feature-id="{water["id"]}"]')).to_be_visible()
        capture(editor, 'island-overview')
        passed('The exact source and editor show seven reshaped biomes, the organic lagoon, two channels and exactly two bridges',
               {'waterArea': water, 'bridges': SOURCE['paths'], 'channels': SOURCE['rivers'],
                'regions': [{'id': region['id'], 'biome': region['biome'], 'color': region['color']} for region in SOURCE['regions']]})

        action(editor, 'more', 'shape')
        editor.locator('#feature-filter').select_option('waterArea')
        editor.locator(f'#feature-list .feature-row[data-id="{water["id"]}"]').click()
        assert editor_state(editor)['selection']['type'] == 'waterArea'
        expect(editor.locator('#vertex-properties')).to_be_visible()
        editor.locator('#add-vertex').click()
        edited = editor_state(editor)['map']
        assert len(edited['waterAreas'][0]['points']) == len(water['points']) + 1
        editor.locator('#undo').click(); assert editor_state(editor)['map'] == SOURCE
        editor.locator('#redo').click(); assert editor_state(editor)['map'] == edited
        editor.locator('#undo').click(); assert editor_state(editor)['map'] == SOURCE
        passed('Water polygons are selectable and their vertices use the existing complete Undo/Redo history')

        # The coast is now an SVG path with holes. It must redraw while a
        # vertex is held, not only after the gesture commits.
        editor.locator('#feature-filter').select_option('all')
        editor.locator('#feature-list .feature-row[data-type="island"]').click()
        coast = editor.locator(f'#map-stage [data-feature-type="island"][data-feature-id="{SOURCE["island"]["id"]}"]')
        before_path = coast.get_attribute('d'); assert before_path
        handle = editor.locator('[data-map-handle="0"]').bounding_box()
        x, y = handle['x'] + handle['width']/2, handle['y'] + handle['height']/2
        # Use screen pixels: a small world-space shift is below the 3px
        # intentional drag threshold at the complete-island zoom.
        editor.mouse.move(x, y); editor.mouse.down()
        editor.mouse.move(x+15, y, steps=4)
        assert coast.get_attribute('d') != before_path, 'visible coast follows the held vertex'
        editor.mouse.up()
        assert editor_state(editor)['map']['island']['points'] != SOURCE['island']['points']
        editor.locator('#undo').click(); assert editor_state(editor)['map'] == SOURCE
        passed('Dragging an island vertex updates the visible shoreline immediately even when the island contains water holes')

        action(editor, 'objects', 'place')
        editor.locator('#palette-kind').select_option('chest')
        editor.locator('#place-object').click()
        before = editor_state(editor)
        tap(editor, [220, 0])
        assert editor_state(editor)['map'] == before['map']
        action(editor, 'paint', 'vegetation')
        editor.locator('#grass-brush').click()
        before = editor_state(editor)
        tap(editor, [220, 0])
        assert editor_state(editor)['map'] == before['map']
        passed('Ordinary object placement and the grass brush cannot create placements inside the lagoon')

        editor.locator('#tool-select').click()
        with editor.expect_download() as download: editor.locator('#export-json').click()
        saved = OUT / 'worldmap-roundtrip.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == SOURCE
        legacy = copy.deepcopy(SOURCE); legacy.pop('waterAreas')
        import_editor(editor, legacy); import_editor(editor, SOURCE)
        assert editor_state(editor)['map'] == SOURCE
        passed('JSON save/open preserves water polygons exactly, while older documents without waterAreas remain readable')

        if STANDALONE:
            with editor.expect_download() as download: open_control(editor, 'export-editor').click()
            saved_html = OUT / 'editor-roundtrip.html'; download.value.save_as(saved_html)
            reopened = context.new_page(); monitor(reopened)
            reopened.route(URL + '/qa-two-access.html', lambda route: route.fulfill(path=str(saved_html), content_type='text/html'))
            reopened.goto(URL + '/qa-two-access.html', wait_until='domcontentloaded')
            reopened.wait_for_function('window.nebeljagdMapTestState')
            assert editor_state(reopened)['map'] == SOURCE
            action(reopened, 'more', 'shape')
            assert reopened.locator('#add-waterArea').count() == 1
            reopened.locator('#feature-filter').select_option('waterArea')
            expect(reopened.locator(f'#feature-list .feature-row[data-id="{water["id"]}"]')).to_be_visible()
            reopened.close()
            passed('Exported standalone HTML reopens the exact lagoon geometry and retains the water-area controls')

        if not EDITOR_ONLY:
            game = context.new_page(); monitor(game)
            # Keep software rendering bounded during travel; captures use the
            # same full desktop size as the editor for visual review.
            game.set_viewport_size({'width': 960, 'height': 600})
            game.goto(URL + ('/nebeljagd.html' if STANDALONE else '/game.html') + '?quality=low', wait_until='domcontentloaded')
            game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
            expect(game.locator('#startBtn')).to_be_enabled()
            assert game_state(game)['world']['mapName'] == SOURCE['name']
            # The southern approach is centered on x+z=535: a 45-degree key
            # direction stays inside its 36/-44 deck axis through both end ramps.
            for label, point, keys, first_seconds, second_seconds, end_point in [
                ('Suedbruecke', [220, 315], ['w', 'd'], 6.0, 6.0, [262, 269]),
                ('Nordbruecke', [158, -327], ['s', 'd'], 6.8, 6.3, [209, -276]),
            ]:
                load_game_start(game, point, label)
                first = trace_walk(game, keys, first_seconds)
                game.locator('#mapMode-island').click()
                game.wait_for_function("nebeljagdTestState().minimap.mode==='island'")
                capture(game, 'bridge-' + label)
                if label == 'Nordbruecke':
                    # Ordinary sideways movement at the middle of the bridge must
                    # stop at its water-facing edge, never jump to the far bank.
                    side = trace_walk(game, ['w', 'd'], 1.5)
                    continued = trace_walk(game, ['w', 'd'], .5)
                    a, b = side[-1]['position'], continued[-1]['position']
                    assert math.hypot(a['x']-b['x'], a['z']-b['z']) < .3, (a,b)
                    displacement = math.hypot(a['x']-side[0]['position']['x'], a['z']-side[0]['position']['z'])
                    assert 2 < displacement < 6.5, displacement
                    passed('Normal movement toward the side of the northern bridge stops at the water-facing rail without teleporting',
                           {'approach': side, 'continued': continued})
                    trace_walk(game, ['s', 'a'], .8)
                second = trace_walk(game, keys, second_seconds)
                position = second[-1]['position']
                assert first[0]['biome'] == ('meadow' if label == 'Nordbruecke' else 'dunes'), first[0]
                assert second[-1]['biome'] == 'heath', second[-1]
                if label == 'Nordbruecke':
                    assert position['x'] > end_point[0] and position['z'] > end_point[1], position
                else:
                    assert position['x'] > end_point[0] and position['z'] < end_point[1]+5, position
                assert math.hypot(position['x']-point[0], position['z']-point[1]) > 55
                capture(game, 'bridge-' + label + '-exit')
                passed(label + ' is crossed completely using ordinary WASD controls with continuous entry, deck and exit heights',
                       {'from': first[0]['position'], 'to': position, 'entryAndDeck': first, 'deckAndExit': second})
        assert not REPORT['errors'], REPORT['errors']
        if STANDALONE: assert not REPORT['delivery']['unexpectedRequests'], REPORT['delivery']
        browser.close()
    assert SOURCE_HASH == hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'; REPORT['failure'] = str(error)
    try: editor.screenshot(path=str(OUT / 'failure.png'))
    except Exception: pass
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors']}), flush=True)
