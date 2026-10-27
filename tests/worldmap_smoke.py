"""Actual browser checks for the editable, offline Nebeljagd map workspace.

Run after npm run build with npm run preview listening on port 4173.
All mutations go through visible controls, pointer events or JSON file import.
The editor's read-only snapshot is used only to observe resulting map data.
"""
import json
import math
import os
from pathlib import Path
import xml.etree.ElementTree as ET

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173').rstrip('/')
checks, errors, screenshots = [], [], []


def state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def passed(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS:', name, flush=True)


def monitor(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)


def start(page, url=None):
    monitor(page)
    page.goto(url or f'{URL}/map-editor.html', wait_until='load')
    page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')
    expect(page.locator('#map-stage > svg')).to_be_visible()


def start_offline(page, html_path):
    # The managed Chromium image blocks file:// navigation. Loading the exact
    # standalone bytes into an empty-origin offline page exercises its scripts
    # without a server and also covers unavailable localStorage gracefully.
    monitor(page)
    page.set_content(html_path.read_text(), wait_until='load')
    page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')
    expect(page.locator('#map-stage > svg')).to_be_visible()


def select(page, kind, identifier):
    page.locator('#feature-filter').select_option(kind)
    page.locator(f'#feature-list .feature-row[data-type="{kind}"][data-id="{identifier}"]').click()
    expect(page.locator('#properties-form')).to_be_visible()


def screen(page, point):
    return page.evaluate('''p => {
        const svg = document.querySelector('#map-stage > svg');
        const point = new DOMPoint(p[0], p[1]).matrixTransform(svg.getScreenCTM());
        return {x: point.x, y: point.y};
    }''', point)


def drag_world(page, start_point, end_point):
    a, b = screen(page, start_point), screen(page, end_point)
    page.mouse.move(a['x'], a['y'])
    page.mouse.down()
    page.mouse.move(b['x'], b['y'], steps=9)
    page.mouse.up()


def import_json(page, data, name='worldmap.json'):
    content = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
    page.locator('#json-file-input').set_input_files({'name': name, 'mimeType': 'application/json', 'buffer': content})
    page.wait_for_timeout(180)


def download(page, control, name):
    with page.expect_download() as item:
        page.locator(control).click()
    target = OUT / name
    item.value.save_as(target)
    return target


def capture(page, name):
    destination = ROOT / 'docs' / 'screenshots' / name
    destination.parent.mkdir(exist_ok=True)
    page.screenshot(path=str(destination), full_page=True)
    screenshots.append(str(destination.relative_to(ROOT)))


def no_horizontal_overflow(page):
    return page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')


report = {'status': 'running', 'checks': checks, 'javascript_errors': errors, 'screenshots': screenshots}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        page = context.new_page()
        page.set_default_timeout(10000)
        start(page)
        original = state(page)['data']
        assert len(original['regions']) == 7
        assert sum(s['capacity'] for s in original['spawnAreas']) == original['gameplay']['targetPlayers'] == 50
        assert len(original['island']['points']) > 20 and len(original['places']) >= 15
        expect(page.locator('#players-fact')).to_have_text('50')
        assert no_horizontal_overflow(page)
        capture(page, 'worldmap-editor.png')
        passed('Large schematic base has seven biomes and distributed capacity for 50 players', {
            'regions': len(original['regions']), 'places': len(original['places']),
            'spawnAreas': len(original['spawnAreas']), 'bounds': original['bounds']})

        select(page, 'island', original['island']['id'])
        before = state(page)['data']['island']['points'][0]
        drag_world(page, before, [before[0] + 12, before[1] + 8])
        after = state(page)['data']['island']['points'][0]
        assert math.dist(after, before) > 10, (before, after)
        page.locator('#undo').click()
        assert state(page)['data']['island']['points'][0] == before
        page.locator('#redo').click()
        assert state(page)['data']['island']['points'][0] == after
        page.locator('#undo').click()
        passed('Coastline vertices can be dragged, undone and redone using actual controls', {'before': before, 'after': after})

        coast_before = state(page)['data']['island']['points']
        page.locator('#add-vertex').click()
        assert len(state(page)['data']['island']['points']) == len(coast_before) + 1
        page.locator('#delete-vertex').click()
        assert state(page)['data']['island']['points'] == coast_before

        before_invalid = state(page)['data']
        drag_world(page, before, [100, 450])
        assert state(page)['data'] == before_invalid
        expect(page.locator('#toast')).to_be_visible()
        passed('Self-intersecting coastline edit is rejected without corrupting the saved map', page.locator('#toast').inner_text())

        select(page, 'region', 'herzauen')
        page.locator('#feature-name').fill('Herzauen · Lernwiese')
        page.locator('#feature-color').fill('#91b87a')
        page.locator('#properties-form button[type="submit"]').click()
        region_before = next(r for r in state(page)['data']['regions'] if r['id'] == 'herzauen')
        assert region_before['name'] == 'Herzauen · Lernwiese' and region_before['color'] == '#91b87a'
        drag_world(page, [10, -145], [35, -130])
        region_after = next(r for r in state(page)['data']['regions'] if r['id'] == 'herzauen')
        assert math.dist(region_before['points'][0], region_after['points'][0]) > 10, (region_before, region_after)
        passed('Region can be renamed, recolored and moved as a whole', {
            'name': region_after['name'], 'color': region_after['color'],
            'vertexBefore': region_before['points'][0], 'vertexAfter': region_after['points'][0]})

        select(page, 'path', 'nordweg')
        path_before = next(r for r in state(page)['data']['paths'] if r['id'] == 'nordweg')
        drag_world(page, path_before['points'][0], [42, -50])
        page.locator('#feature-width').fill('12')
        page.locator('#properties-form button[type="submit"]').click()
        path_after = next(r for r in state(page)['data']['paths'] if r['id'] == 'nordweg')
        assert math.dist(path_before['points'][0], path_after['points'][0]) > 10
        assert path_after['width'] == 12
        select(page, 'river', 'goldbach')
        river_before = next(r for r in state(page)['data']['rivers'] if r['id'] == 'goldbach')
        drag_world(page, river_before['points'][0], [196, -342])
        river_after = next(r for r in state(page)['data']['rivers'] if r['id'] == 'goldbach')
        assert math.dist(river_before['points'][0], river_after['points'][0]) > 10
        passed('Path and river control points and path width remain independently editable', {
            'pathWidth': path_after['width'], 'riverStart': river_after['points'][0]})

        count = len(state(page)['data']['places'])
        page.locator('#add-place').click()
        assert len(state(page)['data']['places']) == count + 1
        new_id = state(page)['selection']['id']
        page.locator('#feature-name').fill('Mein Entdeckungsort')
        page.locator('#feature-x').fill('55')
        page.locator('#feature-z').fill('40')
        page.locator('#properties-form button[type="submit"]').click()
        place = next(r for r in state(page)['data']['places'] if r['id'] == new_id)
        assert place['name'] == 'Mein Entdeckungsort' and place['position'] == [55, 40]
        drag_world(page, place['position'], [75, 60])
        moved = next(r for r in state(page)['data']['places'] if r['id'] == new_id)
        assert math.dist(place['position'], moved['position']) > 15, (place, moved)
        saved_path = download(page, '#export-json', 'worldmap-roundtrip.json')
        exported = json.loads(saved_path.read_text())
        assert exported == state(page)['data']
        page.locator('#feature-name').fill('Vorübergehend anders')
        page.locator('#properties-form button[type="submit"]').click()
        import_json(page, exported)
        assert state(page)['data'] == exported
        passed('New place can be positioned and dragged; exported JSON imports with no data loss', {'newPlace': moved, 'bytes': saved_path.stat().st_size})

        before_bad = state(page)['data']
        import_json(page, b'{"schemaVersion":')
        assert state(page)['data'] == before_bad
        expect(page.locator('#toast')).to_be_visible()
        import_json(page, {**exported, 'regions': {'unexpected': True}})
        assert state(page)['data'] == before_bad
        import_json(page, exported)
        malicious = json.loads(json.dumps(exported))
        malicious['places'][0]['name'] = '</text><script>window.__map_xss=1</script>'
        import_json(page, malicious)
        assert state(page)['data']['places'][0]['name'] == malicious['places'][0]['name']
        assert page.evaluate('window.__map_xss === undefined')
        assert page.locator('#map-stage script').count() == 0
        svg_path = download(page, '#export-svg', 'worldmap-export.svg')
        svg_root = ET.fromstring(svg_path.read_text())
        svg_ns = {'s': 'http://www.w3.org/2000/svg'}
        groups = {node.attrib.get('id') for node in svg_root.findall('.//s:g', svg_ns)}
        assert {'island', 'regions', 'rivers', 'paths', 'places', 'spawn-areas', 'labels'}.issubset(groups), groups
        assert not svg_root.findall('.//s:script', svg_ns)
        assert malicious['places'][0]['name'] in ''.join(svg_root.itertext())
        passed('Malformed imports preserve data; hostile label is inert text in browser and valid SVG export', {'svgGroups': sorted(g for g in groups if g), 'scriptExecuted': False})
        import_json(page, exported)

        page.locator('#layer-grid').check()
        page.locator('#layer-labels').uncheck()
        page.locator('#layer-spawns').uncheck()
        layers = state(page)['layers']
        assert layers.get('grid', layers.get('showGrid')) is True, layers
        old_view = state(page)['view']
        page.locator('#zoom-in').click()
        assert state(page)['view']['width'] < old_view['width']
        zoomed_view = state(page)['view']
        page.locator('#tool-pan').click()
        viewport = page.locator('#map-viewport').bounding_box()
        page.mouse.move(viewport['x'] + viewport['width'] / 2, viewport['y'] + viewport['height'] / 2)
        page.mouse.down(); page.mouse.move(viewport['x'] + viewport['width'] / 2 + 55, viewport['y'] + viewport['height'] / 2 + 30, steps=6); page.mouse.up()
        assert state(page)['view']['x'] != zoomed_view['x']
        page.locator('#fit-map').click()
        page.locator('#tool-select').click()
        page.locator('#layer-labels').check(); page.locator('#layer-spawns').check(); page.locator('#layer-grid').uncheck()
        page.locator('#layer-zone').check()
        zone_radii = []
        for value in [0, 600, 1200]:
            page.locator('#zone-time').fill(str(value))
            zone_radii.append(state(page)['zone']['radius'])
        assert zone_radii[0] == 800 and 20 < zone_radii[1] < 800 and zone_radii[-1] == 20, zone_radii
        page.locator('#zone-time').fill('0'); page.locator('#layer-zone').uncheck()
        passed('Layers, zoom, panning and full 20-minute shrinking-zone preview respond to controls', {'zoneRadii': zone_radii, 'initialView': old_view})

        page.reload(wait_until='load')
        page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')
        expect(page.locator('#restore-banner')).to_be_visible()
        assert state(page)['data'] == original
        select(page, 'place', 'mooswinkel')
        page.locator('#feature-name').fill('Frischer Versuch vor der Entwurfswahl')
        page.locator('#properties-form button[type="submit"]').click()
        expect(page.locator('#restore-banner')).to_be_visible()
        page.locator('#restore-draft').click()
        assert state(page)['data'] == exported
        passed('Reload preserves an undecided draft even when the fresh source map is edited first', {'restoredPlaceCount': len(state(page)['data']['places'])})

        capture(page, 'worldmap-edited.png')
        page.close(); context.close()

        offline_context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True, offline=True)
        offline = offline_context.new_page()
        requests = []
        offline.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        start_offline(offline, ROOT / 'dist' / 'map-editor.html')
        assert not requests, requests
        assert state(offline)['data'] == original
        select(offline, 'place', 'mooswinkel')
        offline_name = 'Mooswinkel offline </script><script>window.__map_xss=1</script>'
        offline.locator('#feature-name').fill(offline_name)
        offline.locator('#properties-form button[type="submit"]').click()
        editor_path = download(offline, '#export-editor', 'worldmap-edited-editor.html')
        reopened = offline_context.new_page()
        start_offline(reopened, editor_path)
        assert next(p for p in state(reopened)['data']['places'] if p['id'] == 'mooswinkel')['name'] == offline_name
        assert reopened.evaluate('window.__map_xss === undefined')
        passed('Standalone bytes work with network offline; saved editor HTML retains edits and escapes script-like labels', {
            'httpRequests': requests, 'savedEditorBytes': editor_path.stat().st_size,
            'harness': 'Exact standalone HTML bytes loaded into empty-origin page because managed Chromium blocks file:// navigation',
            'storageAvailable': state(offline)['storageAvailable']})
        reopened.close(); offline.close(); offline_context.close()

        touch_context = browser.new_context(viewport={'width': 820, 'height': 1180}, device_scale_factor=1, is_mobile=True, has_touch=True)
        tablet = touch_context.new_page()
        start(tablet)
        assert no_horizontal_overflow(tablet)
        tablet.locator('#zoom-in').tap()
        assert state(tablet)['zoom'] > 1
        tablet.locator('#fit-map').tap()
        select(tablet, 'island', original['island']['id'])
        tablet.locator('#map-viewport').scroll_into_view_if_needed()
        touch_before = state(tablet)['data']['island']['points'][0]
        a = screen(tablet, touch_before)
        b = screen(tablet, [touch_before[0] + 30, touch_before[1] + 20])
        cdp = touch_context.new_cdp_session(tablet)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': a['x'], 'y': a['y']}]})
        for step in range(1, 7):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{
                'x': a['x'] + (b['x'] - a['x']) * step / 6,
                'y': a['y'] + (b['y'] - a['y']) * step / 6}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        touch_after = state(tablet)['data']['island']['points'][0]
        assert math.dist(touch_before, touch_after) > 20, (touch_before, touch_after)
        tablet.locator('#undo').tap()
        tablet.locator('#clear-selection').tap()
        capture(tablet, 'worldmap-tablet.png')
        tablet.set_viewport_size({'width': 390, 'height': 844})
        assert no_horizontal_overflow(tablet)
        expect(tablet.locator('#map-viewport')).to_be_visible()
        passed('Actual touchscreen coastline drag works; tablet and phone layouts fit the viewport', {
            'tablet': '820×1180', 'phone': '390×844', 'horizontalOverflow': False,
            'touchVertexBefore': touch_before, 'touchVertexAfter': touch_after})
        tablet.close(); touch_context.close(); browser.close()
        assert not errors, errors
        report['status'] = 'passed'
except BaseException as error:
    report['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    report['failure'] = str(error)
    raise
finally:
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    (OUT / 'worldmap-smoke.json').write_text(serialized)
    (ROOT / 'docs' / 'worldmap-smoke.json').write_text(serialized)
