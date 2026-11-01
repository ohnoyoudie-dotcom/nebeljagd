"""Exercise the admitted Tripo house through the real editor and game.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/tripo_houses_smoke.py
NEBELJAGD_EDITOR_URL may target the built standalone editor/game separately.
Only fixture maps change. Tests cover catalog cleanup, JSON, real keyboard
passages and collisions, floor placement, PBR import and transformed houses.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
EDITOR_URL = os.environ.get('NEBELJAGD_EDITOR_URL', URL).rstrip('/')
VARIANT = 'kit-tripo-house-02'
OUT = ROOT / 'test-results/tripo-houses'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'editorUrl': EDITOR_URL,
          'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Actual Chromium/SwiftShader browser flow; no physical iPad performance measurement.'}
if EDITOR_URL != URL:
    REPORT['delivery'] = {
        'mode': 'Published standalone HTML files served over local HTTP',
        'files': {name: {'sha256': hashlib.sha256((ROOT / 'welt' / name).read_bytes()).hexdigest(),
                         'bytes': (ROOT / 'welt' / name).stat().st_size}
                  for name in ['map-editor.html', 'index.html', 'nebeljagd.html']},
        'unexpectedResourceRequests': [],
        'fileProtocolLimitation': 'This run exercises HTTP-served standalone files, not file:// navigation.',
    }
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
FIXTURE = copy.deepcopy(BASE)
FIXTURE['objects'] = []
FIXTURE['barriers'] = []
FIXTURE['gameplay']['spawnPosition'] = [180, 170]
ORIGIN = [180, 150]
ROTATED_ORIGIN = [240, 150]


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text)
            if message.type == 'error' else None)
    page.set_default_timeout(120000)
    if 'delivery' in REPORT:
        def resource(request):
            if request.url.startswith(EDITOR_URL + '/') and request.resource_type != 'document' \
                    and not urlsplit(request.url).path.endswith('/favicon.ico'):
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
        page.on('request', resource)


def state(page): return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {position:s.position,phase:s.phase,elapsed:s.elapsed,shelter:s.shelter,
        houses:s.houses,rendering:s.rendering,world:{source:s.world.source,
        objects:s.world.objects,stats:s.world.stats,groundHeight:s.world.groundHeight}};
    }''')


def capture(page, name):
    path = OUT / (name + '.png')
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'house-qa.json',
        'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)



def open_control(page, identifier):
    control = page.locator('#' + identifier)
    pane = control.locator('xpath=ancestor::section[contains(@class,"editor-pane")]')
    if pane.count():
        group = pane.get_attribute('id').removeprefix('editor-pane-')
        page.locator('#editor-tab-' + group).click()
        panel = control.locator('xpath=ancestor::*[@data-editor-tool-panel]')
        if panel.count():
            page.locator('#editor-tool-' + group + '-' + panel.first.get_attribute('data-editor-tool-panel')).click()
    for details in control.locator('xpath=ancestor::details').all():
        if details.get_attribute('open') is None:
            details.locator(':scope > summary').click()
    control.scroll_into_view_if_needed()
    return control


def object_(identifier, kind, variant, point, **extra):
    return {'id': identifier, 'name': identifier, 'kind': kind, 'variant': variant,
            'position': point, 'rotation': 0, 'scale': 1, **extra}


def wait_sim(page, seconds):
    elapsed = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=elapsed + seconds)


def inspect(page, x, z, direction=math.pi):
    page.evaluate('p=>nebeljagdInspect(p)',
                  {'x': x, 'z': z, 'direction': direction, 'elapsed': 0, 'health': 100})
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    wait_sim(page, .12)


def walk(page, keys, seconds, roll=False):
    try:
        for key in keys: page.keyboard.down(key)
        if roll: page.keyboard.press('Space')
        wait_sim(page, seconds)
    finally:
        for key in keys: page.keyboard.up(key)
    wait_sim(page, .12)


def apply_object(page, name, position, rotation=0, scale=1):
    for field, value in [('feature-name', name), ('feature-x', position[0]), ('feature-z', position[1]),
                         ('object-rotation', rotation), ('object-scale', scale)]:
        page.locator('#' + field).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()


def world_point(obj, point):
    x, z = point
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    return [obj['position'][0] + obj['scale'] * (c*x + s*z),
            obj['position'][1] + obj['scale'] * (-s*x + c*z)]


def local_position(obj, point):
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    x = (point['x'] - obj['position'][0]) / obj['scale']
    z = (point['z'] - obj['position'][1]) / obj['scale']
    return {'x': c*x - s*z, 'z': s*x + c*z, 'y': point['y']}


def assert_floor(current, obj):
    house = next(h for h in current['houses'] if h['id'] == obj['id'])
    assert abs(current['position']['y'] - house['y'] - house['floorHeight']) < .06, current
    assert current['world']['groundHeight'] <= current['position']['y'] + .02, current
    return house


def walk_route(game, obj, route):
    start, end = route['from'], route['to']
    dx, dz = end[0]-start[0], end[1]-start[1]
    assert not (abs(dx) > .01 and abs(dz) > .01), route
    key = ('d' if dx > 0 else 'a') if abs(dx) > .01 else ('s' if dz > 0 else 'w')
    inspect(game, *world_point(obj, start), direction=math.atan2(dx, dz))
    walk(game, [key], math.hypot(dx, dz) / FIXTURE['gameplay']['walkSpeedMetersPerSecond'])
    current = game_state(game)
    local = local_position(obj, current['position'])
    remaining = math.hypot(local['x']-end[0], local['z']-end[1])
    assert remaining < 1, {'route': route, 'position': local, 'remaining': remaining}
    assert current['shelter'] == obj['name'], current['shelter']
    assert_floor(current, obj)
    print('PASS passage', route['name'], flush=True)
    return {'route': route, 'position': local, 'remaining': remaining}


try:
    definition = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import{getEnvironmentKitDefinition}from'./src/map/environment-kit-definitions.js';"
        "console.log(JSON.stringify(getEnvironmentKitDefinition('house','kit-tripo-house-02')));"], cwd=ROOT))
    assert definition is not None, 'House Model 2 is not registered.'
    assert not any(o['kind'] in ['ruin', 'shrine'] or
                   (o['kind'], o['variant']) in [('house', 'kit-tripo-castle'), ('fence', 'kit-wood'), ('crate', 'kit-wood')]
                   for o in BASE['objects'])
    assert not any(b['kind'] == 'fence' and b['variant'] == 'kit-wood' for b in BASE.get('barriers', []))
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        editor = context.new_page(); monitor(editor)
        editor.goto(EDITOR_URL + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert state(editor)['map'] == BASE
        editor.locator('#editor-tab-objects').click()
        kinds = editor.locator('#palette-kind option').evaluate_all('(xs)=>xs.map(x=>x.value)')
        assert set(kinds) == {'house', 'rock', 'chest', 'wagon', 'barrel', 'well'}, kinds
        open_control(editor, 'palette-kind').select_option('house')
        variants = editor.locator('#palette-variant option').evaluate_all('(xs)=>xs.map(x=>x.value)')
        assert VARIANT in variants and 'kit-tripo-tavern' in variants
        assert 'kit-tripo-castle' not in variants, variants
        styles = editor.locator('#barrier-kind option').evaluate_all('(xs)=>xs.map(x=>x.value)')
        assert 'fence' not in styles and 'fence-cross-wood' in styles, styles
        passed('New houses and Tripo props remain available in Objects; legacy props are absent and the supported fence stays available through its line tool')

        legacy = copy.deepcopy(FIXTURE)
        legacy['objects'] = [
            object_('qa-retired-castle', 'house', 'kit-tripo-castle', [180, 150]),
            object_('qa-retired-shrine', 'shrine', 'magic', [150, 150]),
            object_('qa-retired-ruin', 'ruin', 'stone', [155, 150]),
            object_('qa-retired-arch', 'ruin', 'kit-arch', [160, 150]),
            object_('qa-retired-crate', 'crate', 'kit-wood', [165, 150]),
            object_('qa-retired-fence', 'fence', 'kit-wood', [170, 150]),
            object_('qa-retained-tavern', 'house', 'kit-tripo-tavern', [230, 150]),
            object_('qa-retained-loot', 'chest', 'kit-tripo-chest', [150, 170]),
        ]
        legacy['barriers'] = [
            {'id': 'qa-old-fence', 'name': 'Old fence', 'kind': 'fence', 'variant': 'kit-wood',
             'points': [[160, 170], [170, 170]], 'scale': 1, 'height': 2, 'gaps': []},
            {'id': 'qa-new-fence', 'name': 'New fence', 'kind': 'fence', 'variant': 'kit-cross-wood',
             'points': [[180, 170], [190, 170]], 'scale': 1, 'height': 2, 'gaps': []},
        ]
        import_map(editor, legacy)
        expect(editor.locator('#retired-buildings-banner')).to_be_visible()
        expect(editor.locator('#retired-scenery-banner')).to_be_visible()
        open_control(editor, 'remove-retired-buildings').click()
        open_control(editor, 'remove-retired-scenery').click()
        cleaned = state(editor)['map']
        assert cleaned['objects'] == legacy['objects'][6:]
        assert cleaned['barriers'] == legacy['barriers'][1:]
        editor.locator('#undo').click(); editor.locator('#undo').click()
        assert state(editor)['map'] == legacy
        editor.locator('#redo').click(); editor.locator('#redo').click()
        assert state(editor)['map'] == cleaned
        passed('Legacy cleanup removes exact retired objects and fence routes, preserves new props/height data, and is fully undoable')

        import_map(editor, FIXTURE)
        open_control(editor, 'palette-kind').select_option('house')
        editor.locator('#palette-variant').select_option(VARIANT)
        expect(editor.locator('#palette-preview-image svg image')).to_be_visible()
        preview = editor.evaluate('''async()=>{
          const image=new Image();image.src=document.querySelector('#palette-preview-image svg image').getAttribute('href');
          await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,
            embedded:image.src.startsWith('data:image/webp;base64,')};}''')
        assert preview['embedded'] and preview['width'] >= 128 and preview['height'] >= 96
        editor.locator('#add-object-center').click()
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length===1')
        apply_object(editor, 'Wohnhaus 2 · QA', ORIGIN)
        obj = state(editor)['map']['objects'][0]
        assert obj['variant'] == VARIANT and obj['position'] == ORIGIN
        editor.locator('#duplicate-object').click()
        apply_object(editor, 'Wohnhaus 2 gedreht · QA', ROTATED_ORIGIN, rotation=45, scale=1.25)
        snapshot = state(editor)['map']; rotated = snapshot['objects'][1]
        assert abs(rotated['rotation'] - math.pi/4) < 1e-10 and rotated['scale'] == 1.25
        editor.locator('#focus-selection').click(); capture(editor, 'editor')
        with editor.expect_download() as dl: editor.locator('#export-json').click()
        saved = OUT / 'roundtrip-worldmap.json'; dl.value.save_as(saved)
        assert json.loads(saved.read_text()) == snapshot
        import_map(editor, FIXTURE); import_map(editor, snapshot)
        passed('House 2 has an embedded real-model preview; placement, rotation and scale survive downloaded JSON and reimport',
               {'preview': preview, 'objects': snapshot['objects']})

        with editor.expect_popup() as popup: editor.locator('#playtest-world').click()
        game = popup.value; monitor(game)
        # Software WebGL is intentionally bounded; rendering more pixels does
        # not add coverage to the real keyboard/collision checks below.
        game.set_viewport_size({'width': 1000, 'height': 700})
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        game.goto(game.url + '&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#startBtn')).to_be_enabled(); game.locator('#startBtn').click()
        entrance = definition['qaRoutes']['entrances'][0]
        inspect(game, *world_point(obj, entrance['from']))
        current = game_state(game); kit = current['world']['stats']['environmentKit']
        assert current['world']['source'] == 'editor' and current['world']['objects'] == snapshot['objects']
        assert kit['loadedModels'] == 1 and kit['placements'] == 2, kit
        assert kit['models'][0]['id'] == 'house:' + VARIANT and kit['models'][0]['roofRemoved']
        assert len(current['houses']) == 2 and all(not h['roofVisible'] for h in current['houses'])
        assert current['rendering']['triangles'] > 10000 and current['rendering']['textures'] > 0
        capture(game, 'exterior')
        passed('The actual editor playtest renders two roofless textured houses from one model, with correct object transforms',
               {'kit': kit, 'houses': current['houses'], 'rendering': current['rendering']})

        routes = definition['qaRoutes']['entrances'] + definition['qaRoutes']['rooms']
        assert definition['qaRoutes']['rooms'], 'No measured interior access routes.'
        results = [walk_route(game, obj, route) for route in routes]
        capture(game, 'interior')
        passed('Actual keyboard movement traverses the measured entrance and internal room passages at the correct floor height', results)

        facade = next(w for w in definition['walls'] if w['type'] == 'house-wall' and not w.get('projectileOnly')
                      and w['minZ'] > 0 and w['maxZ']-w['minZ'] < 2 and w['maxX']-w['minX'] > 2)
        x = (facade['minX']+facade['maxX'])/2
        stops = {}
        for rolling in [False, True]:
            inspect(game, *world_point(obj, [x, facade['maxZ']+1.6]))
            walk(game, ['w'], .7, roll=rolling)
            stopped = local_position(obj, game_state(game)['position'])
            assert facade['maxZ']+.3 <= stopped['z'] <= facade['maxZ']+.7, (facade, stopped)
            stops['roll' if rolling else 'walk'] = stopped
        furniture = [w for w in definition['walls'] if w['type'] == 'furniture']
        assert furniture, 'No furniture collision bodies.'
        table = next((w for w in furniture if 'table' in w.get('name', '').lower()), furniture[0])
        x = (table['minX']+table['maxX'])/2
        inspect(game, *world_point(obj, [x, table['maxZ']+1.3]))
        walk(game, ['w'], .6)
        stopped = local_position(obj, game_state(game)['position'])
        assert table['maxZ']+.3 <= stopped['z'] <= table['maxZ']+.7, (table, stopped)
        passed('Solid facades stop walking and rolls; large visible furniture stops actual movement',
               {'facade': facade, 'stops': stops, 'furniture': table, 'furnitureStop': stopped})

        inspect(game, *world_point(rotated, definition['qaRoutes']['openFloor']))
        current = game_state(game); house = assert_floor(current, rotated)
        assert current['shelter'] == rotated['name']
        capture(game, 'rotated')
        passed('Rotated/scaled house preserves indoor detection, floor height and grass/terrain exclusion',
               {'position': current['position'], 'house': house})

        # Inspect material bindings directly in the same real WebGL engine.
        material_page = context.new_page(); monitor(material_page)
        material_page.route('**/house-material-check.html', lambda route: route.fulfill(
            content_type='text/html', body='<!doctype html><title>House material check</title>'))
        material_page.goto(URL + '/house-material-check.html')
        materials = material_page.evaluate('''async()=>{
          const {loadEnvironmentKit}=await import('/src/environment-kit.js');
          const models=await loadEnvironmentKit({objects:[{kind:'house',variant:'kit-tripo-house-02'}]});
          const model=models.get('house:kit-tripo-house-02');
          return model.parts.flatMap(p=>Array.isArray(p.material)?p.material:[p.material]).map(m=>({
            color:Boolean(m.map?.image),normal:Boolean(m.normalMap?.image),roughness:Boolean(m.roughnessMap?.image),
            colorSize:[m.map?.image?.width,m.map?.image?.height]}));
        }''')
        assert materials and all(m['color'] and m['normal'] and m['roughness'] for m in materials), materials
        passed('Actual GLTF import decodes embedded color, normal and roughness textures', materials)
        assert not REPORT['errors'], REPORT['errors']
        if 'delivery' in REPORT:
            assert not REPORT['delivery']['unexpectedResourceRequests'], REPORT['delivery']
        browser.close()
    assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
    REPORT['sourceMapUnchanged'] = MAP_HASH
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'; REPORT['failure'] = str(error)
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
