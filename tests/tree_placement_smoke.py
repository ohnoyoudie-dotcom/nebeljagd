"""Test actual delivered editor, persistent tree transforms and the 3D playtest."""
import copy
import hashlib
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_TREE_URL', 'http://127.0.0.1:4175').rstrip('/')
OUT = ROOT / 'test-results/tree-placement'
OUT.mkdir(parents=True, exist_ok=True)
VARIANTS = ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn']
ORIGINAL_BYTES = (ROOT / 'worldmap.json').read_bytes()
ORIGINAL = json.loads(ORIGINAL_BYTES)
REPORT = {'status': 'running', 'checks': [], 'errors': []}


def state(page):
    return page.evaluate('nebeljagdMapTestState()')


def ready(page):
    page.wait_for_function("typeof window.nebeljagdMapTestState === 'function'", timeout=120000)
    if page.locator('#editor-start-dialog[open]').count():
        page.locator('#start-project-map').click()


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'tree-test.json', 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)


def tap(page, x, z):
    point = page.evaluate('p=>new DOMPoint(...p).matrixTransform(document.querySelector("#map-stage svg").getScreenCTM()).toJSON()', [x,z])
    page.mouse.click(point['x'], point['y'])


def fixture():
    value = copy.deepcopy(ORIGINAL)
    value['name'] = 'Baum-Platzierung · Prüfszene'
    value['bounds'] = {'minX': -100, 'maxX': 100, 'minZ': -100, 'maxZ': 100}
    value['island']['points'] = [[-95,-95],[95,-95],[95,95],[-95,95]]
    value['regions'] = [{'id':'tree-meadow','name':'Wiese','biome':'meadow','color':'#5a8844','points':copy.deepcopy(value['island']['points']),'label':[0,0]}]
    for key in ['objects','paths','rivers','islets','waterAreas','spawnAreas','places','barriers','bridges']:
        value[key] = []
    value['gameplay']['spawnPosition'] = [0,0]
    value['zone']['center'] = [0,0]
    value.pop('landscape', None)
    return value


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        page = context.new_page(); page.set_default_timeout(120000)
        page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        page.goto(BASE + '/welt/map-editor.html', wait_until='domcontentloaded'); ready(page)
        assert state(page)['map'] == ORIGINAL
        import_map(page, fixture())
        page.locator('#editor-tab-objects').click()
        page.locator('#editor-tool-objects-place').click()
        page.locator('#palette-kind').select_option('tree')
        assert page.locator('#palette-variant option').evaluate_all('(xs)=>xs.map(x=>x.value)') == VARIANTS
        assert page.locator('#palette-variant').input_value() == 'kit-oak-green'
        assert page.locator('#palette-random-rotation').is_checked()
        page.locator('#place-object').click()
        for i, variant in enumerate(VARIANTS):
            page.locator('#palette-variant').select_option(variant)
            page.evaluate('''async()=>{const image=new Image();image.src=document.querySelector('#palette-preview-image svg image').getAttribute('href');await image.decode();if(image.naturalWidth<64)throw Error('Missing tree preview');}''')
            tap(page, -24 + 16*i, -8)
            current = state(page)['map']['objects']
            assert len(current) == i + 1
            assert current[-1]['kind'] == 'tree' and current[-1]['variant'] == variant
            assert 0 <= current[-1]['rotation'] < 2*math.pi
        objects = state(page)['map']['objects']
        assert len({o['rotation'] for o in objects}) > 1
        REPORT['checks'].append('All four actual tree choices and embedded previews; on-map placement with stored random yaw')
        page.keyboard.press('Escape')
        page.locator('#undo').click(); assert len(state(page)['map']['objects']) == 3
        page.locator('#redo').click(); assert state(page)['map']['objects'] == objects
        page.locator('#palette-random-rotation').uncheck()
        page.locator('#add-object-center').click()
        assert state(page)['map']['objects'][-1]['rotation'] == 0
        page.locator('#object-rotation').fill('137')
        page.locator('#object-scale').fill('1.25')
        page.locator('.apply-properties').click()
        final = state(page)['map']['objects'][-1]
        assert abs(final['rotation'] - math.radians(137)) < 1e-10 and final['scale'] == 1.25
        assert page.locator('#retired-scenery-banner').is_hidden(), 'Approved GLB trees must survive cleanup'
        saved_map = state(page)['map']
        page.screenshot(path=str(OUT / 'trees-in-editor.png'))
        with page.expect_download() as download:
            page.locator('#export-json').click()
        saved_file = OUT / 'trees.json'; download.value.save_as(saved_file)
        assert json.loads(saved_file.read_text()) == saved_map
        import_map(page, saved_map)
        REPORT['checks'].append('Undo/redo, random rotation off, manual yaw/size, cleanup safety and JSON roundtrip')
        with page.expect_popup() as popup:
            page.locator('#playtest-world').click()
        game = popup.value; game.set_default_timeout(120000)
        game.set_viewport_size({'width':960, 'height':640})
        game.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        runtime = game.evaluate('()=>{const s=nebeljagdTestState();return {world:s.world,rendering:s.rendering};}')
        assert runtime['world']['source'] == 'editor'
        assert runtime['world']['objects'] == saved_map['objects']
        stats = runtime['world']['stats']['environmentKit']
        assert stats['placements'] == 5, stats
        assert {f'tree:{v}' for v in VARIANTS}.issubset({m['id'] for m in stats['models']})
        REPORT['checks'].append('Generated 3D game loads all five placed GLB tree instances with the exact saved transforms')
        REPORT['runtimeTreePlacements'] = stats['placements']
        REPORT['rendering'] = runtime['rendering']
        # Stop only already scheduled application frames for this diagnostic
        # capture. Keep native requestAnimationFrame available to Playwright.
        # Mandatory runtime checks above are never skipped on a capture timeout.
        game.evaluate('''() => {
          const start = document.getElementById('startBtn');
          if (start && !start.disabled) start.click();
          const last = window.requestAnimationFrame(() => {});
          for (let id = last; id >= Math.max(1, last - 64); id--) window.cancelAnimationFrame(id);
        }''')
        try:
            game.screenshot(path=str(OUT / 'trees-in-game.png'), timeout=20000)
            REPORT['gameScreenshot'] = 'captured'
        except PlaywrightTimeoutError:
            REPORT['gameScreenshot'] = 'not captured: headless software-renderer screenshot timeout; runtime assertions passed'
        game.close()
        # Exercise the exported editor's actual bytes without external assets.
        page.locator('#editor-tab-more').click()
        page.locator('#editor-tool-more-map').click()
        with page.expect_download() as download:
            page.locator('#export-editor').click()
        exported = OUT / 'saved-editor.html'; download.value.save_as(exported)
        offline = browser.new_context(viewport={'width':1440,'height':1000})
        unexpected = []
        def route(request):
            if request.request.is_navigation_request():
                request.fulfill(status=200, content_type='text/html', body=exported.read_bytes())
            else:
                unexpected.append(request.request.url); request.abort()
        offline.route('**/*', route)
        reopened = offline.new_page(); reopened.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        reopened.goto('http://tree-editor.test/saved-editor.html', wait_until='domcontentloaded'); ready(reopened)
        assert state(reopened)['map'] == saved_map
        assert reopened.locator('#palette-kind option[value="tree"]').count() == 1
        assert reopened.locator('#palette-random-rotation').count() == 1
        assert not unexpected, unexpected
        offline.close()
        REPORT['checks'].append('Exported standalone editor reopens with trees and unchanged orientations without external resources')
        assert not REPORT['errors'], REPORT['errors']
        browser.close()
    assert (ROOT / 'worldmap.json').read_bytes() == ORIGINAL_BYTES
    REPORT['mapSha256'] = hashlib.sha256(ORIGINAL_BYTES).hexdigest()
    REPORT['status'] = 'passed'
    print(json.dumps(REPORT, ensure_ascii=False), flush=True)
except Exception as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    raise
finally:
    (OUT / 'result.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
