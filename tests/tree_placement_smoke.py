"""Check published editor no longer offers old trees while already saved trees still load."""
import copy
import hashlib
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_TREE_URL', 'http://127.0.0.1:4175').rstrip('/')
OUT = ROOT / 'test-results/tree-placement'
OUT.mkdir(parents=True, exist_ok=True)
PREVIOUS = ['kit-pine-high', 'kit-pine-young', 'kit-oak-green', 'kit-oak-autumn']
USER_TREE_PRESENT = (ROOT / 'assets/imported/user-trees/runtime/tree1.glb').is_file()
ORIGINAL_BYTES = (ROOT / 'worldmap.json').read_bytes()
ORIGINAL = json.loads(ORIGINAL_BYTES)
REPORT = {'status': 'running', 'checks': [], 'errors': []}


def state(page):
    return page.evaluate('nebeljagdMapTestState()')


def ready(page):
    page.wait_for_function("typeof window.nebeljagdMapTestState === 'function'", timeout=120000)
    if page.locator('#editor-start-dialog[open]').count():
        page.locator('#start-project-map').click()


def fixture():
    value = copy.deepcopy(ORIGINAL)
    value['name'] = 'Gespeicherte Baumkarte · Kompatibilität'
    value['bounds'] = {'minX': -100, 'maxX': 100, 'minZ': -100, 'maxZ': 100}
    value['island']['points'] = [[-95,-95],[95,-95],[95,95],[-95,95]]
    value['regions'] = [{'id':'old-tree-meadow','name':'Wiese','biome':'meadow','color':'#5a8844',
                         'points':copy.deepcopy(value['island']['points']),'label':[0,0]}]
    for key in ['objects','paths','rivers','islets','waterAreas','spawnAreas','places','barriers','bridges']:
        value[key] = []
    value['gameplay']['spawnPosition'] = [0,0]
    value['zone']['center'] = [0,0]
    value.pop('landscape', None)
    value['objects'] = [
        {'id': 'existing-tree-'+str(i), 'name': 'Alter Baum', 'kind': 'tree',
         'variant': v, 'position': [-40+i*24, -8],
         'rotation': .4+i*.5, 'scale': 1} for i, v in enumerate(PREVIOUS)
    ]
    return value


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context = browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
    context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
    page = context.new_page(); page.set_default_timeout(120000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    try:
        page.goto(BASE + '/welt/map-editor.html', wait_until='domcontentloaded')
        ready(page)
        assert state(page)['map'] == ORIGINAL
        page.locator('#editor-tab-objects').click()
        page.locator('#editor-tool-objects-place').click()
        if USER_TREE_PRESENT:
            assert page.locator('#palette-kind option[value="tree"]').count() == 1
            page.locator('#palette-kind').select_option('tree')
            assert page.locator('#palette-variant option').evaluate_all('(xs)=>xs.map(x=>x.value)') == ['kit-user-tree1']
            assert page.locator('#scatter-tree').count() == 1
        else:
            assert page.locator('#palette-kind option[value="tree"]').count() == 0
            assert page.locator('#scatter-tree').count() == 0
        assert page.locator('#palette-kind option[value="rock"]').count() == 1
        REPORT['checks'].append('The four former trees are absent from single and scatter placement')

        saved_map = fixture()
        page.locator('#json-file-input').set_input_files({
            'name': 'old-tree-map.json', 'mimeType': 'application/json',
            'buffer': json.dumps(saved_map).encode('utf8')})
        page.wait_for_function("() => nebeljagdMapTestState().map.name === 'Gespeicherte Baumkarte · Kompatibilität'")
        assert state(page)['map'] == saved_map
        assert page.locator('#retired-scenery-banner').is_hidden()
        with page.expect_download() as dl:
            page.locator('#export-json').click()
        path = OUT / 'saved-old-trees.json'
        dl.value.save_as(path)
        assert json.loads(path.read_text()) == saved_map
        REPORT['checks'].append('Existing GLB tree objects and transforms survive import, cleanup status and JSON export')

        page.reload(wait_until='domcontentloaded')
        ready(page)
        assert state(page)['map'] == saved_map
        assert state(page)['startup']['source'] == 'draft'
        assert page.locator('#editor-start-dialog[open]').count() == 0
        assert page.locator('#palette-kind option[value="tree"]').count() == (1 if USER_TREE_PRESENT else 0)
        REPORT['checks'].append('Direct reload automatically resumes exact saved map without reviving old placement menu')

        with page.expect_popup() as popup:
            page.locator('#playtest-world').click()
        game = popup.value; game.set_default_timeout(120000)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        runtime = game.evaluate('''() => {const s=nebeljagdTestState();
          return {world:s.world, rendering:s.rendering};}''')
        assert runtime['world']['source'] == 'editor'
        assert runtime['world']['objects'] == saved_map['objects']
        stats = runtime['world']['stats']['environmentKit']
        assert stats['placements'] == len(PREVIOUS), stats
        assert {('tree:'+v) for v in PREVIOUS}.issubset({m['id'] for m in stats['models']})
        game.close()
        REPORT['checks'].append('Saved original four tree meshes still load in actual 3D game')

        page.locator('#editor-tab-more').click()
        page.locator('#editor-tool-more-map').click()
        with page.expect_download() as dl:
            page.locator('#export-editor').click()
        exported = OUT / 'saved-editor.html'
        dl.value.save_as(exported)
        offline = browser.new_context(viewport={'width':1440,'height':1000})
        reopened = offline.new_page()
        reopened.goto(exported.as_uri(), wait_until='domcontentloaded')
        ready(reopened)
        assert state(reopened)['map'] == saved_map
        assert reopened.locator('#palette-kind option[value="tree"]').count() == (1 if USER_TREE_PRESENT else 0)
        offline.close()
        REPORT['checks'].append('Offline editor preserves old saved map but not retired placement choices')
        assert not REPORT['errors'], REPORT['errors']
        REPORT['status'] = 'passed'
        assert (ROOT / 'worldmap.json').read_bytes() == ORIGINAL_BYTES
        REPORT['mapSha256'] = hashlib.sha256(ORIGINAL_BYTES).hexdigest()
        print(json.dumps(REPORT, ensure_ascii=False), flush=True)
    finally:
        (OUT / 'result.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
        browser.close()
