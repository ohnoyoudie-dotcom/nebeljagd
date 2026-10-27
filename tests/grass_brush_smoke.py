"""Real editor mouse/touch brush gestures, undo, cancellation and JSON persistence.
Use NEBELJAGD_URL for a dev server or compiled preview (default 5173).
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5173').rstrip('/')
checks, errors = [], []
base = json.loads((ROOT / 'worldmap.json').read_text())
base['objects'] = []
base['gameplay']['spawnPosition'] = [0, 0]


def state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def client(page, point):
    return page.evaluate('''p => {const svg = document.querySelector('#map-stage>svg');
      const q = new DOMPoint(...p).matrixTransform(svg.getScreenCTM()); return {x:q.x,y:q.y};}''', point)


def drag(page, a, b, steps=12):
    start, end = client(page, a), client(page, b)
    page.mouse.move(start['x'], start['y']); page.mouse.down()
    page.mouse.move(end['x'], end['y'], steps=steps); page.mouse.up()


def prepare(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL + '/map-editor.html')
    page.wait_for_function('window.nebeljagdMapTestState')
    page.locator('#json-file-input').set_input_files({'name': 'brush-test.json', 'mimeType': 'application/json', 'buffer': json.dumps(base).encode()})
    page.wait_for_function('window.nebeljagdMapTestState().map.objects.length === 0')
    # Focus the map through normal editor controls without an inspection mutator.
    page.locator('#palette-kind').select_option('grass')
    page.locator('#add-object-center').click()
    page.locator('#focus-selection').click()
    page.locator('#delete-feature').click()
    page.locator('#brush-radius').focus(); page.keyboard.press('Home')
    page.keyboard.press('ArrowRight'); page.keyboard.press('ArrowRight')
    assert page.locator('#brush-radius').input_value() == '2'
    page.locator('#grass-brush').click()
    page.locator('#map-viewport').scroll_into_view_if_needed()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    prepare(page)
    before = state(page)
    drag(page, [-10, 0], [10, 0])
    after = state(page); painted = after['map']['objects']
    assert 8 <= len(painted) <= 12, len(painted)
    assert after['undoCount'] == before['undoCount'] + 1
    assert all(o['kind'] == 'grass' and o['variant'] == 'tall' and o['radius'] == 2 for o in painted)
    page.locator('#undo').click(); assert len(state(page)['map']['objects']) == 0
    page.locator('#redo').click(); assert state(page)['map']['objects'] == painted
    checks.append('Mouse brush interpolates editable tall-grass patches; one undo/redo restores the whole stroke')
    drag(page, [-10, 0], [10, 0], steps=2)
    assert state(page)['map']['objects'] == painted
    checks.append('Retracing the same stroke does not stack duplicate dense patches')
    a, b = client(page, [-10, 8]), client(page, [10, 8])
    page.mouse.move(a['x'], a['y']); page.mouse.down(); page.mouse.move(b['x'], b['y'], steps=8)
    assert state(page)['brush']['activeStroke'] and len(state(page)['map']['objects']) > len(painted)
    page.keyboard.press('Escape'); page.mouse.up()
    assert state(page)['map']['objects'] == painted and state(page)['mode'] == 'select'
    checks.append('Escape cancels an unfinished stroke without changing the saved map')
    page.locator('#grass-brush').click()
    original_view = state(page)['viewBox']
    page.keyboard.down('Space'); drag(page, [-4, 0], [4, 0]); page.keyboard.up('Space')
    assert state(page)['map']['objects'] == painted and state(page)['viewBox'] != original_view
    checks.append('Space-drag pans the map without painting')
    with page.expect_download() as info: page.locator('#export-json').click()
    path = ROOT / 'test-results/grass-brush-map.json'; path.parent.mkdir(exist_ok=True)
    info.value.save_as(path)
    saved = json.loads(path.read_text()); assert saved == state(page)['map']
    page.locator('#json-file-input').set_input_files(str(path))
    assert state(page)['map']['objects'] == painted
    checks.append('Painted grass survives JSON export and reimport as ordinary editable map objects')
    # Model cards use the actual available renderer variants, never remote images.
    page.locator('#palette-kind').select_option('tree')
    page.locator('#palette-variant').select_option('rei-tree01')
    expect(page.locator('#palette-preview-image svg')).to_be_visible()
    assert 'Rei' in page.locator('#palette-preview-source').inner_text()
    page.locator('#palette-variant').select_option('pine')
    assert 'Nebeljagd' in page.locator('#palette-preview-source').inner_text()
    checks.append('Asset model previews and source labels follow the selected existing variant')
    page.locator('#feature-list .feature-row').nth(len(painted) // 2).click()
    page.locator('#focus-selection').click()
    page.locator('#grass-brush').scroll_into_view_if_needed()
    page.screenshot(path=str(ROOT / 'docs/screenshots/grass-brush-editor.png'))
    exported_objects = state(page)['map']['objects']
    with page.expect_popup() as popup_info: page.locator('#playtest-world').click()
    popup = popup_info.value
    popup.route_web_socket('**', lambda ws: None)
    popup.on('pageerror', lambda e: errors.append(str(e)))
    popup.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0', timeout=120000)
    generated = popup.evaluate('''() => { const s=nebeljagdTestState(); return {source:s.world.source,objects:s.world.objects,
      grass:s.world.grassPatches,count:s.world.stats.grassPatchCount}; }''')
    assert generated['source'] == 'editor'
    assert generated['objects'] == exported_objects
    assert generated['count'] == len(painted)
    popup.locator('#startBtn').click()
    popup.wait_for_function('nebeljagdTestState().hiddenInGrass && nebeljagdTestState().concealment > .01', timeout=30000)
    for patch in painted:
        runtime = next(grass for grass in generated['grass'] if grass['id'] == patch['id'])
        assert abs(runtime['x'] - patch['position'][0]) < .001
        assert abs(runtime['z'] - patch['position'][1]) < .001
        assert runtime['height'] >= 2.4
    checks.append('In 3D testen generates the exact painted document; tall patches match saved positions and conceal the player')
    popup.close(); page.close()

    touch = browser.new_context(viewport={'width': 1024, 'height': 768}, is_mobile=True, has_touch=True, device_scale_factor=1)
    page = touch.new_page(); prepare(page)
    session = touch.new_cdp_session(page)
    start, end = client(page, [-10, 0]), client(page, [10, 0])
    session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': start['x'], 'y': start['y']}]})
    for step in range(1, 13):
        point = {key: start[key] + (end[key] - start[key]) * step / 12 for key in ['x', 'y']}
        session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [point]})
    session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    touch_painted = state(page)['map']['objects']; assert len(touch_painted) >= 8
    assert all(o['kind'] == 'grass' and o['variant'] == 'tall' for o in touch_painted)
    page.locator('#undo').click(); assert state(page)['map']['objects'] == []
    checks.append('Real touch drag paints a continuous stroke and one undo removes it')
    # Native pointercancel rolls back an interrupted gesture.
    start, end = client(page, [-10, 8]), client(page, [10, 8])
    session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': start['x'], 'y': start['y']}]})
    session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': end['x'], 'y': end['y']}]})
    session.send('Input.dispatchTouchEvent', {'type': 'touchCancel', 'touchPoints': []})
    assert state(page)['map']['objects'] == [] and not state(page)['brush']['activeStroke']
    checks.append('Cancelled touch gesture rolls back all pending grass patches')
    browser.close()

assert not errors, errors
report = {'status': 'passed', 'url': URL, 'checks': checks, 'errors': errors, 'mouseStrokePatches': len(painted), 'touchStrokePatches': len(touch_painted)}
(ROOT / 'docs/grass-brush-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
