"""Exercise the Tripo-only Objects palette, safe imports and explicit cleanup.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/tripo_palette_smoke.py
Set NEBELJAGD_STANDALONE=1 against the published welt/ server to verify the
same interactions in the self-contained delivered editor. Only fixture maps
change; the test hook is read-only and all edits use normal UI controls.
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
OUT = ROOT / 'test-results/tripo-palette'
OUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'url': URL, 'standalone': STANDALONE,
          'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Real Chromium/SwiftShader editor interactions over local HTTP; no new game runtime or physical-device performance claim.'}
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
    value.update(name='Tripo-Palette · Testinsel', bounds={'minX': -160, 'minZ': -160, 'maxX': 160, 'maxZ': 160})
    value['island']['points'] = [[-150, -150], [150, -150], [150, 150], [-150, 150]]
    value['regions'] = [{'id': 'qa-meadow', 'name': 'Wiese', 'biome': 'meadow', 'color': '#5a8844',
                         'points': copy.deepcopy(value['island']['points']), 'label': [0, 0]}]
    value['paths'] = []; value['rivers'] = []; value['places'] = []
    value['gameplay']['spawnPosition'] = [0, 0]
    value['spawnAreas'] = [{'id': 'qa-start', 'name': 'Start', 'position': [0, 0], 'radius': 8, 'capacity': 50}]
    value['zone']['center'] = [0, 0]
    value['barriers'] = [
        {'id': 'qa-existing-wall', 'name': 'Existing wall', 'kind': 'wall', 'variant': 'kit-stone',
         'points': [[-80, 135], [-30, 135]], 'scale': 1, 'height': 2, 'gaps': []},
        {'id': 'qa-existing-fence', 'name': 'Existing fence', 'kind': 'fence', 'variant': 'kit-cross-wood',
         'points': [[0, 135], [50, 135]], 'scale': 1, 'height': 1.5, 'gaps': [{'at': 20, 'width': 3}]},
        {'id': 'qa-retired-fence', 'name': 'Retired fence', 'kind': 'fence', 'variant': 'kit-wood',
         'points': [[70, 135], [110, 135]], 'scale': 1, 'gaps': []},
    ]
    value.pop('landscape', None)
    pairs = [('house', 'kit-tripo-castle'), ('heart', 'healing'), ('chest', 'wood'),
             ('bow', 'wood'), ('sword', 'steel'), ('fireStaff', 'ember'), ('iceStaff', 'frost'),
             ('bush', 'rei-bush'), ('grass', 'tall'), ('rock', 'granite'),
             ('wall', 'kit-stone'), ('fence', 'kit-wood')]
    value['objects'] = [{'id': f'qa-legacy-{kind}', 'name': f'Legacy {kind}', 'kind': kind,
                         'variant': variant, 'position': [-100 + i * 16, 105], 'rotation': 0, 'scale': 1,
                         **({'radius': 3} if kind == 'grass' else {}),
                         **({'rarity': 'common'} if kind in ['bow', 'sword', 'fireStaff', 'iceStaff'] else {})}
                        for i, (kind, variant) in enumerate(pairs)]
    value['objects'].extend([
        {'id': 'qa-retained-rock', 'name': 'Tripo rock', 'kind': 'rock', 'variant': 'kit-tripo-01',
         'position': [-110, 75], 'rotation': .3, 'scale': 1.2},
        {'id': 'qa-retained-chest', 'name': 'Tripo chest', 'kind': 'chest', 'variant': 'kit-tripo-chest',
         'position': [-90, 75], 'rotation': 0, 'scale': .8},
    ])
    return value


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({
        'name': 'tripo-palette.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def open_control(page, identifier):
    control = page.locator('#' + identifier)
    pane = control.locator('xpath=ancestor::section[contains(@class,"editor-pane")]')
    if pane.count():
        page.locator('#editor-tab-' + pane.get_attribute('id').removeprefix('editor-pane-')).click()
    panel = control.locator('xpath=ancestor::*[@data-editor-tool-panel]')
    if panel.count():
        group = pane.get_attribute('id').removeprefix('editor-pane-')
        page.locator('#editor-tool-' + group + '-' + panel.first.get_attribute('data-editor-tool-panel')).click()
    for detail in control.locator('xpath=ancestor::details').all():
        if detail.get_attribute('open') is None:
            detail.locator(':scope > summary').click()
    control.scroll_into_view_if_needed()
    return control


def client(page, point):
    return page.evaluate('p=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};}', point)


def drag(page, a, b):
    start, end = client(page, a), client(page, b)
    page.mouse.move(start['x'], start['y']); page.mouse.down()
    page.mouse.move(end['x'], end['y'], steps=12); page.mouse.up()


def tap(page, point):
    p = client(page, point); page.mouse.click(p['x'], p['y'])


def options(page, selector):
    return page.locator(selector + ' option').evaluate_all('(xs)=>xs.map(x=>({value:x.value,label:x.textContent.trim()}))')


def place(page, kind, variant=None, position=None):
    page.locator('#editor-tab-objects').click()
    page.locator('#editor-tool-objects-place').click()
    page.locator('#palette-kind').select_option(kind)
    if variant: page.locator('#palette-variant').select_option(variant)
    before = len(state(page)['map']['objects'])
    page.locator('#add-object-center').click()
    page.wait_for_function('n=>nebeljagdMapTestState().map.objects.length===n', arg=before+1)
    if position:
        page.locator('#feature-x').fill(str(position[0])); page.locator('#feature-z').fill(str(position[1]))
        page.locator('.apply-properties').click()
    return state(page)['map']['objects'][-1]


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        page = context.new_page(); page.set_default_timeout(60000)
        page.route_web_socket('**', lambda ws: None)
        page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
        if STANDALONE:
            page.on('request', lambda request: REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
                    if request.url.startswith(URL + '/') and request.resource_type != 'document'
                    and not urlsplit(request.url).path.endswith('/favicon.ico') else None)
        page.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdMapTestState')
        assert state(page)['map'] == BASE
        assert all(o['variant'].startswith('kit-tripo-') and o['variant'] != 'kit-tripo-castle'
                   for o in BASE['objects']), 'The delivered map must contain only retained Tripo objects'
        page.locator('#editor-tab-objects').click()
        kinds = options(page, '#palette-kind')
        assert {x['value'] for x in kinds} == {'house', 'rock', 'chest', 'wagon', 'barrel', 'well', 'sword', 'fireStaff', 'iceStaff'}, kinds
        catalog = {}
        for item in kinds:
            page.locator('#palette-kind').select_option(item['value'])
            catalog[item['value']] = options(page, '#palette-variant')
            assert catalog[item['value']] and all(x['value'].startswith('kit-tripo-') and 'Tripo' in x['label']
                                                 for x in catalog[item['value']]), catalog
        assert [x['value'] for x in catalog['house']] == ['kit-tripo-tavern', 'kit-tripo-house-02']
        assert [x['value'] for x in catalog['chest']] == ['kit-tripo-chest']
        assert [x['value'] for x in catalog['rock']] == ['kit-tripo-01', 'kit-tripo-02', 'kit-tripo-03']
        assert [x['value'] for x in catalog['sword']] == ['kit-tripo-sword']
        assert [x['value'] for x in catalog['fireStaff']] == ['kit-tripo-fire-staff']
        assert [x['value'] for x in catalog['iceStaff']] == ['kit-tripo-ice-staff']
        assert not any('Holztruhe' in x['label'] for x in kinds)
        passed('Objects offers only Tripo props, exactly two houses, three Tripo rocks and the Tripo treasure chest',
               {'kinds': kinds, 'variants': catalog})

        legacy = fixture(); import_map(page, legacy)
        assert state(page)['map'] == legacy
        open_control(page, 'feature-search').fill('qa-legacy-chest')
        page.locator('#feature-list .feature-row[data-id="qa-legacy-chest"]').click()
        assert page.locator('#object-variant').input_value() == 'wood'
        page.locator('.apply-properties').click()
        assert state(page)['map'] == legacy, 'A no-op edit must not replace a legacy chest with the new palette default'
        open_control(page, 'feature-search').fill('')
        passed('Legacy castle, loot, grass, shrubs and old barriers import unchanged; no-op editing keeps the old wood chest variant')

        expect(page.locator('#retired-scenery-banner')).to_be_visible()
        open_control(page, 'remove-retired-scenery').click()
        cleaned = copy.deepcopy(legacy)
        cleaned['objects'] = legacy['objects'][-2:]
        cleaned['barriers'] = legacy['barriers'][:2]
        assert state(page)['map'] == cleaned
        expect(page.locator('#retired-scenery-banner')).to_be_hidden()
        page.locator('#undo').click(); assert state(page)['map'] == legacy
        page.locator('#redo').click(); assert state(page)['map'] == cleaned
        page.locator('#undo').click(); assert state(page)['map'] == legacy
        passed('Explicit cleanup removes non-Tripo object placements and the retired castle/fence, preserves Tripo props and supported drawn routes, and has complete Undo/Redo',
               {'retainedObjects': [o['id'] for o in cleaned['objects']],
                'retainedRoutes': [b['id'] for b in cleaned['barriers']]})

        chest = place(page, 'chest', position=[-30, 0])
        assert chest['variant'] == 'kit-tripo-chest'
        page.locator('#duplicate-object').click()
        duplicate = state(page)['map']['objects'][-1]
        assert duplicate['kind'] == 'chest' and duplicate['variant'] == 'kit-tripo-chest' and duplicate['id'] != chest['id']
        for i, variant in enumerate(['kit-tripo-tavern', 'kit-tripo-house-02']):
            obj = place(page, 'house', variant, [30 + i * 42, 20])
            assert obj['variant'] == variant
        for i, variant in enumerate(['kit-tripo-01', 'kit-tripo-02', 'kit-tripo-03']):
            obj = place(page, 'rock', variant, [-70 + i * 15, 20])
            assert obj['variant'] == variant
        passed('Normal placement and duplication use the Tripo chest; both houses and all three Tripo rock variants can be placed')

        page.locator('#editor-tab-objects').click()
        styles = options(page, '#barrier-kind')
        assert {x['value'] for x in styles} == {'wall', 'wall-cut-stone', 'wall-tripo', 'fence-cross-wood'}, styles
        open_control(page, 'barrier-kind').select_option('wall-tripo')
        page.locator('#barrier-height').fill('2')
        expect(page.locator('#barrier-height-hint')).to_contain_text('Sicht')
        open_control(page, 'barrier-shape').select_option('straight')
        page.locator('#barrier-draw').click(); drag(page, [-70, -65], [70, -65])
        wall = state(page)['map']['barriers'][-1]
        assert wall['variant'] == 'kit-tripo-wall' and wall['height'] == 2
        page.locator('#barrier-gap').click(); tap(page, [0, -65])
        wall = state(page)['map']['barriers'][-1]
        assert len(wall['gaps']) == 1 and wall['gaps'][0]['width'] == 3
        page.locator('#barrier-kind').select_option('fence-cross-wood')
        page.locator('#barrier-height').fill('2')
        page.locator('#barrier-draw').click(); drag(page, [-70, -25], [70, -25])
        fence = state(page)['map']['barriers'][-1]
        assert fence['kind'] == 'fence' and fence['variant'] == 'kit-cross-wood' and fence['height'] == 2
        page.locator('#tool-select').click(); tap(page, [-40, -25])
        page.locator('#barrier-selection-preview').click()
        expect(page.locator('#barrier-preview')).to_have_attribute('data-preview-state', 'ready', timeout=120000)
        expect(page.locator('#barrier-preview canvas')).to_be_visible()
        assert int(page.locator('#barrier-preview').get_attribute('data-preview-objects')) > 1
        screenshot = OUT / 'barrier-preview.png'
        page.locator('#barrier-preview').screenshot(path=str(screenshot))
        REPORT['screenshots'].append(str(screenshot.relative_to(ROOT)))
        passed('Dedicated line tool still draws a 2 m Tripo wall with a passage and a 2 m wood fence, including the actual model preview',
               {'styles': styles, 'wall': wall, 'fence': fence})

        before = copy.deepcopy(state(page))
        open_control(page, 'grass-brush').click()
        drag(page, [-70, 55], [-40, 55])
        after = state(page)
        additions = after['map']['objects'][len(before['map']['objects']):]
        assert additions and all(o['kind'] == 'grass' and o['variant'] == 'tall' for o in additions), additions
        assert after['undoCount'] == before['undoCount'] + 1
        page.locator('#undo').click(); assert state(page)['map'] == before['map']
        page.locator('#redo').click(); assert state(page)['map'] == after['map']
        passed('High grass still paints through its dedicated brush and the entire stroke has one-step Undo/Redo', {'patches': len(additions)})

        expected = copy.deepcopy(state(page)['map'])
        assert expected['objects'][:len(legacy['objects'])] == legacy['objects']
        with page.expect_download() as download: page.locator('#export-json').click()
        saved = OUT / 'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == expected
        import_map(page, BASE); import_map(page, expected)
        assert state(page)['map'] == expected
        passed('JSON export/reimport preserves every existing object, newly placed Tripo object, painted grass and barrier height/passage')

        page.locator('#editor-tab-objects').click()
        open_control(page, 'palette-kind').select_option('house')
        page.locator('#palette-variant').select_option('kit-tripo-house-02')
        page.locator('#palette-kind').scroll_into_view_if_needed()
        screenshot = OUT / 'editor.png'; page.screenshot(path=str(screenshot))
        REPORT['screenshots'].append(str(screenshot.relative_to(ROOT)))
        assert not REPORT['errors'], REPORT['errors']
        if STANDALONE: assert not REPORT['delivery']['unexpectedResourceRequests'], REPORT['delivery']
        browser.close()
    assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
    REPORT['sourceMapUnchanged'] = MAP_HASH
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'; REPORT['failure'] = str(error)
    try:
        page.screenshot(path=str(OUT / 'failure.png'))
    except Exception:
        pass
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
