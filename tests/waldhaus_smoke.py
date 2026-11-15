"""Place/save/reopen the empty Waldhaus shell, then traverse its real runtime.

NEBELJAGD_URL=http://127.0.0.1:5360 python3 tests/waldhaus_smoke.py
Only isolated browser fixture documents change; the authored map is read-only.
Run against the finished generated build. Physical iPad performance is not tested.
"""
from __future__ import annotations

import base64
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5360').rstrip('/')
EDITOR_URL = os.environ.get('NEBELJAGD_EDITOR_URL', URL).rstrip('/')
OUT = ROOT / 'test-results/waldhaus-shell'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'editorUrl': EDITOR_URL,
          'checks': [], 'errors': [], 'failedRequests': [], 'screenshots': [],
          'limits': 'Chromium/SwiftShader with real keyboard input; no physical iPad or file:// measurement.'}
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
INPUT = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js';"
    "import {normalizeWorldmap} from './src/map/objects.js';"
    "import {WALDHAUS_DEFINITION} from './src/map/waldhaus-definition.js';"
    "const m=createLobbyMap();m.objects=[];m.barriers=[];m.gameplay.spawnPosition=[0,18];"
    "console.log(JSON.stringify({map:normalizeWorldmap(m),definition:WALDHAUS_DEFINITION}));"], cwd=ROOT))
FIXTURE, DEFINITION = INPUT['map'], INPUT['definition']


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append({'text':message.text,'location':message.location})
            if message.type == 'error' else None)


def editor_state(page):
    return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {position:s.position,phase:s.phase,elapsed:s.elapsed,shelter:s.shelter,
        houses:s.houses,rendering:s.rendering,world:{source:s.world.source,
        objects:s.world.objects,stats:s.world.stats,groundHeight:s.world.groundHeight}};
    }''')


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'waldhaus-qa.json',
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


def apply_object(page, name, position, rotation=0, scale=1):
    for field, value in [('feature-name', name), ('feature-x', position[0]), ('feature-z', position[1]),
                         ('object-rotation', rotation), ('object-scale', scale)]:
        page.locator('#' + field).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()


def world_point(obj, point):
    x, z = point
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    return [obj['position'][0] + obj['scale'] * (c*x+s*z),
            obj['position'][1] + obj['scale'] * (-s*x+c*z)]


def local_position(obj, position):
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    x = (position['x']-obj['position'][0])/obj['scale']
    z = (position['z']-obj['position'][1])/obj['scale']
    return {'x': c*x-s*z, 'z': s*x+c*z, 'y': position['y']}


def wait_sim(page, seconds):
    elapsed = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=elapsed+seconds)


def inspect(page, point, direction=math.pi):
    page.evaluate('p=>nebeljagdInspect(p)',
        {'x': point[0], 'z': point[1], 'direction': direction, 'elapsed': 0, 'health': 100})
    wait_sim(page, .12)


def move(page, key, seconds):
    try:
        page.keyboard.down(key)
        wait_sim(page, seconds)
    finally:
        page.keyboard.up(key)
    wait_sim(page, .12)


def key_toward(start, end):
    dx, dz = end[0]-start[0], end[1]-start[1]
    assert min(abs(dx), abs(dz)) < .001, 'Use cardinal routes and quarter-turn rotations.'
    return ('d' if dx > 0 else 'a') if abs(dx) > abs(dz) else ('s' if dz > 0 else 'w')


def assert_floor(current, obj):
    house = next(h for h in current['houses'] if h['id'] == obj['id'])
    assert abs(current['position']['y']-house['y']-house['floorHeight']) < .06, current
    assert current['world']['groundHeight'] <= current['position']['y']+.02, current
    return house


def walk_route(page, obj, route):
    start, end = world_point(obj, route['from']), world_point(obj, route['to'])
    direction = math.atan2(end[0]-start[0], end[1]-start[1])
    inspect(page, start, direction)
    seconds = math.dist(start, end)/FIXTURE['gameplay']['walkSpeedMetersPerSecond']
    move(page, key_toward(start, end), seconds)
    current = game_state(page)
    local = local_position(obj, current['position'])
    remaining = math.hypot(local['x']-route['to'][0], local['z']-route['to'][1])
    assert remaining < .85, {'object': obj, 'route': route, 'position': local, 'remaining': remaining}
    assert current['shelter'] == obj['name'], current
    assert_floor(current, obj)
    print('PASS passage', obj['name'], route['name'], flush=True)
    return {'name': route['name'], 'remaining': remaining, 'position': local}


def capture(page, name, canvas=False, focus=None):
    path = OUT / (name + '.png')
    if canvas:
        value = page.evaluate('p=>{if(p) nebeljagdInspectCamera({zoom:1,focus:p}); return nebeljagdCaptureFrame();}', focus)
        path.write_bytes(base64.b64decode(value.split(',', 1)[1]))
    else:
        page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1360, 'height': 900}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        context.on('page', monitor)
        context.on('response', lambda response: REPORT['failedRequests'].append({'url':response.url,'status':response.status}) if response.status>=400 else None)
        manifest_response=context.request.get(EDITOR_URL+'/release.json')
        assert manifest_response.status==200, 'Run only after the full build has written release.json.'
        manifest=manifest_response.json()
        editor = context.new_page()
        editor.goto(EDITOR_URL+'/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        REPORT['buildId']=editor_state(editor)['startup']['buildId']
        assert REPORT['buildId']==manifest['buildId']
        import_map(editor, FIXTURE)
        open_control(editor, 'palette-kind').select_option('house')
        variants = editor.locator('#palette-variant option').evaluate_all('(xs)=>xs.map(x=>({value:x.value,label:x.textContent}))')
        assert any(item['value'] == 'waldhaus' and 'Waldhaus' in item['label'] for item in variants), variants
        editor.locator('#palette-variant').select_option('waldhaus')
        expect(editor.locator('#palette-preview-image svg')).to_be_visible()
        editor.locator('#add-object-center').click()
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length===1')
        apply_object(editor, 'Waldhaus · QA', [0, 0])
        editor.locator('#duplicate-object').click()
        apply_object(editor, 'Waldhaus gedreht · QA', [25, 0], rotation=90, scale=1.25)
        snapshot = editor_state(editor)['map']
        obj, rotated = snapshot['objects']
        assert obj['variant'] == rotated['variant'] == 'waldhaus'
        assert obj['position'] == [0, 0] and rotated['position'] == [25, 0]
        assert abs(rotated['rotation']-math.pi/2) < 1e-10 and rotated['scale'] == 1.25
        editor.locator('#focus-selection').click(); capture(editor, 'editor')
        with editor.expect_download() as download: editor.locator('#export-json').click()
        saved = OUT/'roundtrip-worldmap.json'; download.value.save_as(saved)
        assert json.loads(saved.read_text()) == snapshot
        import_map(editor, FIXTURE); import_map(editor, snapshot)
        editor.goto(EDITOR_URL+'/map-editor.html?open=draft', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_state(editor)['map'] == snapshot
        passed('Waldhaus is selectable and placeable; two placements preserve rotation/scale through JSON and saved browser draft', snapshot['objects'])

        with editor.expect_popup() as popup: editor.locator('#playtest-world').click()
        game = popup.value
        game.set_viewport_size({'width': 720, 'height': 504})
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        game.goto(game.url+'&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#startBtn')).to_be_enabled(); game.locator('#startBtn').click()
        inspect(game, world_point(obj, DEFINITION['qaRoutes']['openFloor']))
        current = game_state(game)
        assert current['world']['source'] == 'editor' and current['world']['objects'] == snapshot['objects']
        assert len(current['houses']) == 2 and all(h['interiorVisible'] for h in current['houses'])
        for house,placement in zip(current['houses'], [obj,rotated]):
            assert abs(house['halfWidth']-8*placement['scale'])<1e-8 and abs(house['halfDepth']-6*placement['scale'])<1e-8, house
        assert current['rendering']['triangles'] > 10000 and current['rendering']['calls'] > 0, current['rendering']
        assert current['shelter'] == obj['name']; assert_floor(current, obj)
        capture(game, 'interior', canvas=True)
        passed('Editor playtest instantiates two spacious 16 by 12 metre Waldhaus shells with correct floors and shelter',
               {'houses': current['houses'], 'rendering': current['rendering']})

        cleared = DEFINITION['qaRoutes']['clearedFurniture']
        assert len(cleared)>=2, 'Keep actual movement coverage through the former furnishing areas.'
        routes = DEFINITION['qaRoutes']['entrances']+DEFINITION['qaRoutes']['rooms']+cleared
        results = {}
        for placement in [obj, rotated]:
            results[placement['name']] = [walk_route(game, placement, route) for route in routes]
        passed('Real keyboard movement crosses both exterior doors, all room passages and former furnishing areas at normal and rotated/scaled placement', results)

        facade = next(w for w in DEFINITION['walls'] if w['name'] == 'south facade east')
        partition = next(w for w in DEFINITION['walls'] if w['name'] == 'side room partition')
        stops = []
        for placement in [obj, rotated]:
            for body in [facade, partition]:
                x=(body['minX']+body['maxX'])/2
                start = world_point(placement, [x, body['maxZ']+1.6])
                end = world_point(placement, [x, body['minZ']-1])
                inspect(game, start)
                move(game, key_toward(start, end), .8*placement['scale'])
                stopped = local_position(placement, game_state(game)['position'])
                radius = .42/placement['scale']
                assert abs(stopped['z']-body['maxZ']-radius) < .1, (placement, body, stopped)
                stops.append({'object': placement['name'], 'obstacle': body['name'], 'position': stopped})
                print('PASS solid wall', placement['name'], body['name'], flush=True)
        passed('Actual movement stops at the exterior facade and interior room partition at both scales/rotations', stops)
        game.set_viewport_size({'width':1200,'height':900})
        for placement,name in [(obj,'shell-review'),(rotated,'rotated-shell-review')]:
            inspect(game, world_point(placement, DEFINITION['qaRoutes']['openFloor']))
            capture(game,name,canvas=True,focus={'x':placement['position'][0],'z':placement['position'][1]})
        assert not REPORT['errors'], REPORT['errors']
        assert not REPORT['failedRequests'], REPORT['failedRequests']
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
