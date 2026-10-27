"""Exercise the actual editor eraser with mouse/touch, history and persistence.

NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/object_eraser_smoke.py
No editor state is mutated through the inspection hook; fixtures use JSON import
and ordinary selection/focus controls. All gestures are browser input events.
"""
import copy
import hashlib
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5173').rstrip('/')
checks, errors = [], []
base = json.loads((ROOT / 'worldmap.json').read_text())
base['gameplay']['spawnPosition'] = [20, -20]

def obj(identifier, kind, variant, x, z, **extra):
    return {'id': identifier, 'name': identifier, 'kind': kind, 'variant': variant,
            'position': [x, z], 'rotation': 0, 'scale': 1, **extra}

base['objects'] = [
    obj('qa-grass-line', 'grass', 'tall', -9, 0, radius=2),
    obj('qa-tree-line', 'tree', 'oak', -3, 0),
    obj('qa-flower-line', 'flower', 'rei-white', 3, 0, radius=1.5),
    obj('qa-house-line', 'house', 'herbal', 9, 0, scale=.5),
    obj('qa-mound-line', 'mound', 'ridge', 0, 0),
    obj('qa-grass-wide', 'grass', 'tall', 0, 8, radius=9),
    obj('qa-house-away', 'house', 'inn', -10, 8),
    obj('qa-rock-away', 'rock', 'granite', 12, 9),
]
ORIGINAL_IDS = {item['id'] for item in base['objects']}
LINE_IDS = {item['id'] for item in base['objects'] if item['id'].endswith('-line')}
report = {'status': 'running', 'url': URL, 'checks': checks, 'errors': errors}


def passed(name, evidence=None):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def ids(page):
    return {item['id'] for item in state(page)['map']['objects']}


def client(page, point):
    return page.evaluate('''p => {const svg=document.querySelector('#map-stage>svg');
      const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y};}''', point)


def drag(page, a, b, steps=2):
    start, end = client(page, a), client(page, b)
    page.mouse.move(start['x'], start['y']); page.mouse.down()
    page.mouse.move(end['x'], end['y'], steps=steps); page.mouse.up()


def watch(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)


def prepare(page):
    # Keep the socket pending: closing it repeatedly would trigger Vite retries.
    page.route_web_socket('**', lambda ws: None)
    watch(page)
    response = page.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
    report['served_editor_sha256'] = hashlib.sha256(response.body()).hexdigest()
    page.wait_for_function('window.nebeljagdMapTestState')
    page.locator('#json-file-input').set_input_files({
        'name': 'eraser-fixture.json', 'mimeType': 'application/json', 'buffer': json.dumps(base).encode()})
    page.wait_for_function('window.nebeljagdMapTestState().map.objects.some(o=>o.id==="qa-flower-line")')
    page.locator('#feature-filter').select_option('object')
    page.locator('#feature-search').fill('qa-flower-line')
    page.locator('#feature-list .feature-row').first.click()
    page.locator('#focus-selection').click()
    page.locator('#eraser-radius').focus(); page.keyboard.press('Home')
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight')
    assert page.locator('#eraser-radius').input_value() == '1.5'
    page.locator('#object-eraser').click()
    assert state(page)['mode'] == 'erase'
    page.locator('#map-viewport').scroll_into_view_if_needed()
    return state(page)


try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        page.set_default_timeout(90000)
        initial = prepare(page)
        geography = copy.deepcopy(initial['map']); geography.pop('objects')
        hover = client(page, [-3, 0]); page.mouse.move(hover['x'], hover['y'])
        expect(page.locator('[data-feature-id="qa-tree-line"]')).to_have_class('map-erase-target')
        start, end = client(page, [-12, 0]), client(page, [12, 0])
        page.mouse.move(start['x'], start['y']); page.mouse.down()
        page.mouse.move(end['x'], end['y'], steps=1)
        assert state(page)['eraser']['activeStroke']
        assert state(page)['eraser']['pendingObjects'] == len(LINE_IDS)
        for identifier in LINE_IDS:
            assert page.locator(f'[data-feature-type="object"][data-feature-id="{identifier}"]').count() == 0
        page.mouse.up()
        erased = state(page)
        assert ids(page) == ORIGINAL_IDS - LINE_IDS, ids(page)
        unchanged = copy.deepcopy(erased['map']); unchanged.pop('objects')
        assert unchanged == geography
        assert erased['undoCount'] == initial['undoCount'] + 1
        assert 'qa-grass-wide' in ids(page) and 'qa-house-away' in ids(page)
        passed('Fast mouse sweep removes touched object centers while preserving wide nearby objects and all geography',
               {'removed': sorted(LINE_IDS), 'remaining': sorted(ids(page))})
        page.locator('#undo').click(); assert state(page)['map']['objects'] == base['objects']
        page.locator('#redo').click(); assert state(page)['map']['objects'] == erased['map']['objects']
        page.locator('#undo').click()
        passed('One undo or redo restores the entire eraser gesture, including the original object ordering')

        page.locator('#eraser-filter').select_option('grass')
        drag(page, [-12, 0], [12, 0], steps=12)
        assert ids(page) == ORIGINAL_IDS - {'qa-grass-line'}
        assert {'qa-house-line', 'qa-tree-line', 'qa-flower-line', 'qa-mound-line'} <= ids(page)
        passed('Grass-only eraser leaves trees, houses, flowers and raised cover at the same painted locations intact')
        page.locator('#undo').click(); assert ids(page) == ORIGINAL_IDS
        page.locator('#eraser-filter').select_option('all')
        page.locator('#eraser-filter').focus()

        start, end = client(page, [-12, 0]), client(page, [12, 0])
        page.mouse.move(start['x'], start['y']); page.mouse.down(); page.mouse.move(end['x'], end['y'], steps=6)
        assert state(page)['eraser']['activeStroke'] and ids(page) != ORIGINAL_IDS
        page.keyboard.press('Escape'); page.mouse.up()
        assert ids(page) == ORIGINAL_IDS and state(page)['mode'] == 'select'
        passed('Escape rolls an unfinished eraser stroke back completely')

        page.locator('#object-eraser').click()
        original_view = state(page)['viewBox']
        page.keyboard.down('Space'); drag(page, [-4, 0], [4, 0]); page.keyboard.up('Space')
        assert ids(page) == ORIGINAL_IDS and state(page)['viewBox'] != original_view
        passed('Space-drag pans without erasing and preserves the active eraser mode')

        drag(page, [-12, 0], [12, 0], steps=2)
        retained = state(page)['map']
        with page.expect_download() as info: page.locator('#export-json').click()
        output = ROOT / 'test-results/object-eraser-map.json'; output.parent.mkdir(exist_ok=True)
        info.value.save_as(output)
        assert json.loads(output.read_text()) == retained
        page.locator('#json-file-input').set_input_files(str(output))
        assert state(page)['map'] == retained
        passed('Erased objects remain removed after JSON export and import')

        # Focus one surviving area and keep the new controls in view for review.
        page.locator('#feature-search').fill('qa-grass-wide')
        page.locator('#feature-list .feature-row').first.click(); page.locator('#focus-selection').click()
        page.locator('#object-eraser').scroll_into_view_if_needed()
        page.screenshot(path=str(ROOT / 'docs/screenshots/object-eraser-editor.png'))
        with page.expect_popup() as popup_info: page.locator('#playtest-world').click()
        popup = popup_info.value; watch(popup)
        popup.route_web_socket('**', lambda ws: None)
        popup.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0', timeout=120000)
        generated = popup.evaluate('''() => {const s=nebeljagdTestState();return {source:s.world.source,objects:s.world.objects};}''')
        assert generated['source'] == 'editor' and generated['objects'] == retained['objects']
        assert not LINE_IDS.intersection({item['id'] for item in generated['objects']})
        passed('In 3D testen receives the exact retained document and does not regenerate erased objects')
        popup.close(); page.close()

        touch = browser.new_context(viewport={'width': 1024, 'height': 768}, is_mobile=True, has_touch=True, device_scale_factor=1)
        page = touch.new_page(); page.set_default_timeout(90000); before_touch = prepare(page)
        session = touch.new_cdp_session(page)
        start, end = client(page, [-12, 0]), client(page, [12, 0])
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [start]})
        for step in range(1, 9):
            point = {key: start[key] + (end[key] - start[key]) * step / 8 for key in ['x', 'y']}
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [point]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        assert ids(page) == ORIGINAL_IDS - LINE_IDS
        assert state(page)['undoCount'] == before_touch['undoCount'] + 1
        page.locator('#undo').click(); assert ids(page) == ORIGINAL_IDS
        passed('Real touch drag erases all crossed centers and one undo restores them')

        start, end = client(page, [-12, 0]), client(page, [12, 0])
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [start]})
        session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [end]})
        assert state(page)['eraser']['activeStroke'] and ids(page) != ORIGINAL_IDS
        session.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
        assert ids(page) == ORIGINAL_IDS and not state(page)['eraser']['activeStroke']
        passed('A cancelled native touch gesture restores all pending removals')
        browser.close()
    assert not errors, errors
    report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'failed'; report['failure'] = str(error)
    raise
finally:
    (ROOT / 'docs/object-eraser-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
