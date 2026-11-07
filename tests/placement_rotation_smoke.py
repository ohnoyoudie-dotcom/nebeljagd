"""Exercise placement/undo/import and exported standalone HTML, not dev sources."""
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('NEBELJAGD_ROTATION_URL', 'http://127.0.0.1:4175').rstrip('/')
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', 'test-results/placement-rotation')).resolve()
OUT.mkdir(parents=True, exist_ok=True)


def ready(page):
    page.wait_for_function("typeof window.nebeljagdMapTestState === 'function'", timeout=90000)
    if page.locator('#editor-start-dialog[open]').count():
        page.locator('#start-project-map').click()


def state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def rotation_map(page):
    return {obj['id']: obj['rotation'] for obj in state(page)['map']['objects']}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=[
        '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'{BASE}/welt/map-editor.html', wait_until='domcontentloaded')
    ready(page)
    assert page.locator('#palette-random-rotation').count() == 1
    initial_rotations = rotation_map(page)
    initial_count = len(initial_rotations)
    page.locator('#editor-tab-objects').click()
    page.locator('#editor-tool-objects-place').click()
    page.locator('#palette-kind').select_option('rock')
    page.locator('#palette-variant').select_option('kit-tripo-01')
    checkbox = page.locator('#palette-random-rotation')
    assert not checkbox.is_checked(), 'Non-tree placement must not change by default.'

    page.locator('#add-object-center').click()
    current = state(page)
    assert len(current['map']['objects']) == initial_count + 1, 'Centre placement did not add an object.'
    assert current['map']['objects'][-1]['rotation'] == 0
    checkbox.check()
    page.locator('#add-object-center').click()
    first = state(page)['map']['objects'][-1]
    # Also use the on-map click path, not just the centre shortcut.
    page.locator('#place-object').click()
    point = page.evaluate('''([x, z]) => {
      const svg = document.querySelector('#map-stage svg');
      const p = new DOMPoint(x, z).matrixTransform(svg.getScreenCTM());
      return {x:p.x, y:p.y};
    }''', first['position'])
    page.mouse.click(point['x'], point['y'])
    second = state(page)['map']['objects'][-1]
    assert len(state(page)['map']['objects']) == initial_count + 3
    assert first['id'] != second['id']
    assert 0 <= first['rotation'] < math.tau and 0 <= second['rotation'] < math.tau
    assert first['rotation'] != second['rotation'], 'Separate placements need independent angles.'
    saved_rotations = rotation_map(page)
    assert all(saved_rotations[key] == angle for key, angle in initial_rotations.items())

    page.locator('#undo').click()
    assert second['id'] not in rotation_map(page)
    page.locator('#redo').click()
    assert rotation_map(page) == saved_rotations, 'Redo must not reroll angles.'
    checkbox.uncheck()
    page.locator('#palette-kind').select_option('house')
    assert not checkbox.is_checked(), 'Tree/rock preference must not leak into buildings.'
    page.locator('#palette-kind').select_option('rock')
    assert not checkbox.is_checked()
    assert rotation_map(page) == saved_rotations, 'Changing tools must not reroll the map.'

    # Select the last object by its ordinary editor list row and use the inspector.
    page.locator('#tool-select').click()
    page.locator('#feature-search').evaluate(
        '(el, value) => { el.value = value; el.dispatchEvent(new Event("input", {bubbles:true})); }',
        second['id'])
    page.locator(f'.feature-row[data-id="{second["id"]}"]').evaluate('(el) => el.click()')
    page.locator('#object-rotation').fill('42')
    page.locator('.apply-properties').click()
    manual = rotation_map(page)[second['id']]
    assert math.isclose(manual, math.radians(42), abs_tol=1e-10)
    page.locator('#duplicate-object').click()
    assert math.isclose(state(page)['map']['objects'][-1]['rotation'], manual, abs_tol=1e-10)
    expected = rotation_map(page)
    exported_map = state(page)['map']
    page.locator('#json-file-input').set_input_files({
        'name': 'rotation-roundtrip.json', 'mimeType': 'application/json',
        'buffer': json.dumps(exported_map).encode('utf8')})
    page.wait_for_function("window.nebeljagdMapTestState().startup.source === 'imported'")
    assert rotation_map(page) == expected, 'JSON round-trip must preserve exact angles.'
    assert not errors, errors
    page.locator('#editor-tab-objects').click()
    page.locator('#editor-tool-objects-place').click()
    page.screenshot(path=str(OUT / 'rotation-editor.png'), full_page=True)

    with page.expect_download() as download_info:
        page.locator('#export-editor').evaluate('(el) => el.click()')
    exported_html = OUT / 'map-editor-roundtrip.html'
    download_info.value.save_as(str(exported_html))
    offline = context.new_page()
    offline.on('pageerror', lambda error: errors.append(str(error)))
    offline.goto(exported_html.as_uri(), wait_until='domcontentloaded')
    ready(offline)
    assert offline.locator('#palette-random-rotation').count() == 1, 'Standalone export duplicated the control.'
    assert rotation_map(offline) == expected, 'Standalone reopen changed saved angles.'
    offline.locator('#editor-tab-objects').click()
    offline.locator('#editor-tool-objects-place').click()
    offline.locator('#palette-kind').select_option('rock')
    offline.locator('#palette-random-rotation').check()
    offline.locator('#add-object-center').click()
    assert len(rotation_map(offline)) == len(expected) + 1
    assert not errors, errors
    (OUT / 'result.json').write_text(json.dumps({
        'passed': True, 'initialObjects': initial_count,
        'checked': ['centre placement', 'map click', 'independent yaw', 'unchanged old objects',
                    'undo/redo', 'per-kind settings', 'manual rotation', 'duplicate',
                    'JSON import', 'standalone export/reopen', 'offline placement'],
    }, indent=2) + '\n')
    browser.close()
print('Placement rotation browser checks passed (generated editor and offline export).')
