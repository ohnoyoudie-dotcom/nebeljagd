"""Real editor-to-game smoke test for the user's small Tripo castle.

NEBELJAGD_URL=http://127.0.0.1:5192 python tests/tripo_castle_smoke.py
NEBELJAGD_STANDALONE=1 validates the generated welt/ files over local HTTP.
NEBELJAGD_SKIP_ROOM_ROUTES=1 skips only the six long room-to-room walks when
rechecking unchanged code in a delivery build after a full development run.
All map edits use editor controls. Only avatar relocation uses the inspect hook;
gate, facade and furniture checks use actual keyboard movement.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5192').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
SKIP_ROOM_ROUTES = os.environ.get('NEBELJAGD_SKIP_ROOM_ROUTES') == '1'
VARIANT = 'kit-tripo-castle'
OUT = ROOT / 'test-results/tripo-castle'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [], 'screenshots': []}
SOURCE_HASH = hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
FIXTURE = json.loads((ROOT/'worldmap.json').read_text())
FIXTURE['objects'] = []
FIXTURE['gameplay']['spawnPosition'] = [180, 178]
ORIGIN = [180, 150]
ROTATED_ORIGIN = [320, 150]
game = None
editor = None


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text)
            if message.type == 'error' else None)


def editor_state(page):
    return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {
      const s = nebeljagdTestState();
      return {position:s.position, phase:s.phase, elapsed:s.elapsed, shelter:s.shelter,
        houses:s.houses, rendering:s.rendering,
        world:{source:s.world.source, objects:s.world.objects, stats:s.world.stats,
          importedAssets:s.world.importedAssets, groundHeight:s.world.groundHeight}};
    }''')


def capture(page, name):
    path = ROOT / f'docs/tripo-castle-{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def wait_sim(page, seconds):
    elapsed = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t => nebeljagdTestState().elapsed >= t', arg=elapsed+seconds)


def inspect(page, x, z, direction=math.pi):
    page.evaluate('p => nebeljagdInspect(p)',
                  {'x': x, 'z': z, 'direction': direction, 'elapsed': 0, 'health': 100})
    page.evaluate('() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))')
    wait_sim(page, .12)


def walk(page, keys, seconds, roll=False):
    try:
        for key in keys:
            page.keyboard.down(key)
        if roll:
            page.keyboard.press('Space')
        wait_sim(page, seconds)
    finally:
        for key in keys:
            page.keyboard.up(key)
    wait_sim(page, .12)


def apply_object(page, *, name, x, z, rotation, scale):
    for field, value in [('feature-name', name), ('feature-x', x), ('feature-z', z),
                         ('object-rotation', rotation), ('object-scale', scale)]:
        page.locator('#'+field).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()


def world_point(obj, x, z):
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    return [obj['position'][0]+obj['scale']*(c*x+s*z),
            obj['position'][1]+obj['scale']*(-s*x+c*z)]


def local_position(obj, position):
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    x = (position['x']-obj['position'][0])/obj['scale']
    z = (position['z']-obj['position'][1])/obj['scale']
    return {'x': c*x-s*z, 'z': s*x+c*z, 'y': position['y']}


def assert_floor(state, obj):
    house = next(h for h in state['houses'] if h['id'] == obj['id'])
    assert abs(state['position']['y']-(house['y']+house['floorHeight'])) < .06, state
    assert state['world']['groundHeight'] <= state['position']['y']+.02, state
    return house


def check_gate(page, obj, case, speed):
    """Cases use local points and cardinal world-axis keys for unrotated castle."""
    start, end = case['from'], case['to']
    dx, dz = end[0]-start[0], end[1]-start[1]
    assert not (abs(dx) > .01 and abs(dz) > .01), 'Gate tests require cardinal routes.'
    key = ('d' if dx > 0 else 'a') if abs(dx) > .01 else ('s' if dz > 0 else 'w')
    inspect(page, *world_point(obj, *start), direction=math.atan2(dx, dz))
    distance = math.hypot(dx, dz)
    walk(page, [key], distance/speed)
    result = game_state(page)
    local = local_position(obj, result['position'])
    remaining = math.hypot(local['x']-end[0], local['z']-end[1])
    assert remaining < 1.0, {'gate': case, 'position': local, 'remaining': remaining}
    assert result['shelter'] == obj['name'], result['shelter']
    assert_floor(result, obj)
    return {'route': case, 'position': local, 'remaining': remaining}


try:
    definition = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {getEnvironmentKitDefinition} from './src/map/environment-kit-definitions.js';"
        "console.log(JSON.stringify(getEnvironmentKitDefinition('house','kit-tripo-castle')));"
    ], cwd=ROOT))
    assert definition is not None, 'Small Tripo castle is not registered.'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 960}, accept_downloads=True)
        if STANDALONE:
            REPORT['delivery'] = {
                'mode': 'Generated standalone HTML served over HTTP, not file://',
                'files': {name: {'sha256': hashlib.sha256((ROOT/'welt'/name).read_bytes()).hexdigest(),
                                 'bytes': (ROOT/'welt'/name).stat().st_size}
                          for name in ['map-editor.html', 'index.html', 'nebeljagd.html']},
                'unexpectedResourceRequests': []}

            def check_request(request):
                parsed, origin = urlsplit(request.url), urlsplit(URL)
                if parsed.scheme not in ('http', 'https'):
                    return
                if (parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc):
                    if ((request.is_navigation_request() and parsed.path in
                         ['/map-editor.html', '/index.html', '/nebeljagd.html'])
                            or parsed.path == '/favicon.ico'):
                        return
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)

            context.on('request', check_request)
        context.add_init_script(
            "Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        editor = context.new_page()
        editor.set_default_timeout(30000)
        monitor(editor)
        editor.goto(URL+'/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        editor.locator('#json-file-input').set_input_files({
            'name': 'empty-castle-check.json', 'mimeType': 'application/json',
            'buffer': json.dumps(FIXTURE).encode()})
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length === 0')
        editor.locator('#editor-tab-objects').click()
        editor.locator('#palette-kind').select_option('house')
        editor.locator('#palette-variant').select_option(VARIANT)
        expect(editor.locator('#palette-preview-title')).to_contain_text('Schloss')
        expect(editor.locator('#palette-preview-image svg image')).to_be_visible()
        preview = editor.evaluate('''async () => {
          const image=new Image();
          image.src=document.querySelector('#palette-preview-image svg image').getAttribute('href');
          await image.decode();
          return {width:image.naturalWidth,height:image.naturalHeight,
            embedded:image.src.startsWith('data:image/webp;base64,')};
        }''')
        assert preview['embedded'] and preview['width'] >= 128 and preview['height'] >= 96, preview
        editor.locator('#add-object-center').click()
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length === 1')
        apply_object(editor, name='Kleines Schloss · QA', x=ORIGIN[0], z=ORIGIN[1], rotation=0, scale=1)
        obj = editor_state(editor)['map']['objects'][0]
        assert obj['variant'] == VARIANT and obj['position'] == ORIGIN, obj
        passed('Small castle is selectable with its embedded real-model thumbnail and can be placed',
               {'preview': preview, 'object': obj})

        editor.locator('#duplicate-object').click()
        apply_object(editor, name='Gedrehtes Schloss · QA',
                     x=ROTATED_ORIGIN[0], z=ROTATED_ORIGIN[1], rotation=45, scale=1.25)
        editor.locator('#focus-selection').click()
        snapshot = editor_state(editor)['map']
        assert len(snapshot['objects']) == 2
        rotated = snapshot['objects'][1]
        assert abs(rotated['rotation']-math.pi/4) < 1e-10 and rotated['scale'] == 1.25
        capture(editor, 'editor')
        with editor.expect_download() as download:
            editor.locator('#export-json').click()
        saved = OUT/'editor-export.json'
        download.value.save_as(saved)
        assert json.loads(saved.read_text()) == snapshot
        editor.locator('#json-file-input').set_input_files(str(saved))
        assert editor_state(editor)['map'] == snapshot
        passed('Placement, variant, rotation and size survive JSON download and reimport',
               {'objects': snapshot['objects'], 'saveMode': 'download without File System Access'})

        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        game.set_default_timeout(120000)
        monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        assert game_state(game)['world']['objects'] == snapshot['objects']
        game.goto(game.url+'&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        expect(game.locator('#startBtn')).to_be_enabled()
        game.locator('#startBtn').click()
        front = max(w['maxZ'] for w in definition['walls'] if w['type'] == 'house-wall')
        inspect(game, ORIGIN[0], ORIGIN[1]+front+3)
        runtime = game_state(game)
        assert runtime['world']['source'] == 'editor'
        assert runtime['world']['objects'] == snapshot['objects']
        kit = runtime['world']['stats']['environmentKit']
        assert kit['loadedModels'] == 1 and kit['placements'] == 2, kit
        assert kit['models'][0]['id'] == 'house:'+VARIANT and kit['models'][0]['roofRemoved'], kit
        assert len(runtime['houses']) == 2 and all(not h['roofVisible'] for h in runtime['houses'])
        assert runtime['rendering']['triangles'] > 10000 and runtime['rendering']['textures'] > 0
        capture(game, 'exterior')
        passed('Editor playtest renders the textured roofless castle and its transformed copy',
               {'kit': kit, 'houses': runtime['houses'], 'rendering': runtime['rendering']})

        # Explicit measured routes may be supplied by the definition. The front
        # entrance fallback will be replaced if the source inspection differs.
        routes = definition.get('qaRoutes', {}).get('entrances', [
            {'name': 'front entry', 'from': [0, front+1.7], 'to': [0, front-3.3]}])
        gate_results = [check_gate(game, obj, route, FIXTURE['gameplay']['walkSpeedMetersPerSecond'])
                        for route in routes]
        capture(game, 'interior')
        passed('Measured exterior gateways pass real keyboard movement into the castle', gate_results)

        if SKIP_ROOM_ROUTES:
            REPORT['skippedChecks'] = ['Six room-to-room walks; see the full development-run report.']
        else:
            room_routes = definition.get('qaRoutes', {}).get('rooms', [])
            assert room_routes, 'No measured interior-room routes available.'
            room_results = [check_gate(game, obj, route, FIXTURE['gameplay']['walkSpeedMetersPerSecond'])
                            for route in room_routes]
            passed('All side rooms and connecting internal archways are reachable by keyboard movement',
                   room_results)

        # The chosen facade is intentionally beyond the obsolete 15 m broadphase.
        front_walls = [w for w in definition['walls'] if w['type'] == 'house-wall'
                       and w['minZ'] > 0 and w['maxZ']-w['minZ'] < 3
                       and w['maxX']-w['minX'] > 3
                       and abs((w['minX']+w['maxX'])/2) > 15]
        assert front_walls, 'No measured facade beyond 15 m available for regression check.'
        body = max(front_walls, key=lambda w: abs((w['minX']+w['maxX'])/2))
        x = (body['minX']+body['maxX'])/2
        results = {}
        for rolling in [False, True]:
            inspect(game, ORIGIN[0]+x, ORIGIN[1]+body['maxZ']+1.6)
            walk(game, ['w'], .7, roll=rolling)
            stopped = local_position(obj, game_state(game)['position'])
            assert body['maxZ']+.3 <= stopped['z'] <= body['maxZ']+.7, (body, stopped)
            results['roll' if rolling else 'walk'] = stopped
        passed('Facade more than 15 m from the centre blocks walking and a forward roll',
               {'body': body, 'positions': results})

        furniture = [w for w in definition['walls'] if w['type'] == 'furniture']
        assert furniture, 'No interior furniture collisions.'
        table = next((w for w in furniture if 'table' in w.get('name', '').lower()), furniture[0])
        x = (table['minX']+table['maxX'])/2
        inspect(game, ORIGIN[0]+x, ORIGIN[1]+table['maxZ']+1.6)
        walk(game, ['w'], .7)
        stopped = local_position(obj, game_state(game)['position'])
        assert table['maxZ']+.3 <= stopped['z'] <= table['maxZ']+.7, (table, stopped)
        passed('Large interior furniture blocks actual player movement', {'body': table, 'position': stopped})

        point = definition.get('qaRoutes', {}).get('openFloor', [0, 3])
        inspect(game, *world_point(rotated, *point))
        current = game_state(game)
        house = assert_floor(current, rotated)
        assert current['shelter'] == rotated['name'], current['shelter']
        capture(game, 'rotated')
        passed('Rotated and scaled castle preserves floor height, indoor detection and terrain exclusion',
               {'position': current['position'], 'house': house})
        if STANDALONE:
            assert not REPORT['delivery']['unexpectedResourceRequests'], REPORT['delivery']
            passed('Generated standalone editor/game complete the handoff without external dependencies',
                   REPORT['delivery'])
        browser.close()
    assert not REPORT['errors'], REPORT['errors']
    assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest() == SOURCE_HASH
    REPORT['sourceMapUnchanged'] = SOURCE_HASH
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    # The enclosing Playwright context may already be closed after an exception;
    # preserve any evidence still available without hiding the original failure.
    try:
        if game and not game.is_closed():
            REPORT['lastGameState'] = game_state(game)
            capture(game, 'failure')
    except BaseException:
        pass
    raise
finally:
    (ROOT/'docs/tripo-castle-check.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False),
          flush=True)
