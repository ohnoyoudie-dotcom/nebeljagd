"""Exercise the new tavern through real editor placement, export and playtest.

NEBELJAGD_URL=http://127.0.0.1:5192 python tests/tripo_tavern_smoke.py
For exact generated files served from welt/: add NEBELJAGD_STANDALONE=1
and use that static server's URL. Records file hashes and resource requests.
Uses system Chromium/SwiftShader. Inspection only relocates the player; map
changes go through editor controls and collision checks use keyboard movement.
"""
from __future__ import annotations

import json
import hashlib
import math
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5192').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
VARIANT = 'kit-tripo-tavern'
OUT = ROOT / 'test-results/tripo-tavern'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [], 'screenshots': []}
if STANDALONE:
    REPORT['delivery'] = {
        'mode': 'Actual standalone HTML files served by the local static HTTP server',
        'fileProtocolLimitation': 'This run validates HTTP-served standalone bytes; actual file:// behavior is outside this run.',
        'files': {name: {'sha256': hashlib.sha256((ROOT / 'welt' / name).read_bytes()).hexdigest(),
                         'bytes': (ROOT / 'welt' / name).stat().st_size}
                  for name in ['map-editor.html', 'index.html', 'nebeljagd.html']},
        'unexpectedResourceRequests': [],
    }
FIXTURE = json.loads((ROOT / 'worldmap.json').read_text())
FIXTURE['objects'] = []
FIXTURE['gameplay']['spawnPosition'] = [180, 162]


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)


def editor_state(page):
    return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {
      const s = nebeljagdTestState();
      return { position:s.position, phase:s.phase, elapsed:s.elapsed, shelter:s.shelter,
        houses:s.houses, rendering:s.rendering,
        world:{source:s.world.source, objects:s.world.objects, stats:s.world.stats,
          importedAssets:s.world.importedAssets, groundHeight:s.world.groundHeight} };
    }''')


def capture(page, name):
    path = ROOT / f'docs/tripo-tavern-{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def wait_sim(page, seconds):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t => nebeljagdTestState().elapsed >= t', arg=before + seconds)


def inspect(page, x, z, direction=math.pi):
    page.evaluate('p => nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction, 'elapsed': 0, 'health': 100})
    # Visibility/chunk updates happen after relocation, once per animation frame.
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
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
        page.locator('#' + field).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()


def world_point(obj, x, z):
    c, s = math.cos(obj['rotation']), math.sin(obj['rotation'])
    return [obj['position'][0] + obj['scale'] * (c * x + s * z),
            obj['position'][1] + obj['scale'] * (-s * x + c * z)]


try:
    definition = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {getEnvironmentKitDefinition} from './src/map/environment-kit-definitions.js';"
        "console.log(JSON.stringify(getEnvironmentKitDefinition('house','kit-tripo-tavern')));"], cwd=ROOT))
    assert definition is not None, 'Tripo tavern definition not registered'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        if STANDALONE:
            def check_request(request):
                parsed, origin = urlsplit(request.url), urlsplit(URL)
                if parsed.scheme not in ('http', 'https'):
                    return
                same_origin = (parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc)
                if same_origin and ((request.is_navigation_request()
                    and parsed.path in ['/map-editor.html', '/index.html', '/nebeljagd.html'])
                    or parsed.path == '/favicon.ico'):
                    return
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
            context.on('request', check_request)
        # Exercise the download route used by Safari/iPads and browsers without
        # File System Access; native OS save dialogs are outside headless QA.
        context.add_init_script("Object.defineProperty(window, 'showSaveFilePicker', {value: undefined, configurable: true});")
        editor = context.new_page()
        editor.set_default_timeout(20000)
        monitor(editor)
        editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        editor.locator('#json-file-input').set_input_files({
            'name': 'empty-tavern-check.json', 'mimeType': 'application/json',
            'buffer': json.dumps(FIXTURE).encode()})
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length === 0')
        editor.locator('summary').filter(has_text='Objekte & Verteilung').click()
        editor.locator('#palette-kind').select_option('house')
        editor.locator('#palette-variant').select_option(VARIANT)
        expect(editor.locator('#palette-preview-title')).to_contain_text('Tripo')
        expect(editor.locator('#palette-preview-image svg image')).to_be_visible()
        preview = editor.evaluate('''async () => {
          const image = new Image();
          image.src = document.querySelector('#palette-preview-image svg image').getAttribute('href');
          await image.decode();
          return {width:image.naturalWidth, height:image.naturalHeight,
            embedded:image.src.startsWith('data:image/webp;base64,')};
        }''')
        assert preview['embedded'] and preview['width'] >= 128 and preview['height'] >= 96, preview
        editor.locator('#add-object-center').click()
        editor.wait_for_function('nebeljagdMapTestState().map.objects.length === 1')
        apply_object(editor, name='Neues Wirtshaus · QA', x=180, z=150, rotation=0, scale=1)
        obj = editor_state(editor)['map']['objects'][0]
        assert obj['variant'] == VARIANT and obj['position'] == [180, 150], obj
        passed('New Tripo tavern can be selected with its real embedded preview and placed through editor controls',
               {'preview': preview, 'object': obj})

        editor.locator('#duplicate-object').click()
        apply_object(editor, name='Gedrehtes Wirtshaus · QA', x=225, z=150, rotation=45, scale=1.25)
        editor.locator('#focus-selection').click()
        snapshot = editor_state(editor)['map']
        assert len(snapshot['objects']) == 2
        rotated = snapshot['objects'][1]
        assert abs(rotated['rotation'] - math.pi / 4) < 1e-10 and rotated['scale'] == 1.25
        capture(editor, 'editor')
        with editor.expect_download() as download:
            editor.locator('#export-json').click()
        saved = OUT / 'editor-export.json'
        download.value.save_as(saved)
        assert json.loads(saved.read_text()) == snapshot
        editor.locator('#json-file-input').set_input_files(str(saved))
        assert editor_state(editor)['map'] == snapshot
        passed('Position, rotation, scale and new variant survive JSON download export and reimport',
               {'saveMode': 'Browser without File System Access', 'objects': snapshot['objects']})

        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        game.set_default_timeout(120000)
        monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        assert game_state(game)['world']['objects'] == snapshot['objects']
        game.goto(game.url + '&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        expect(game.locator('#startBtn')).to_be_enabled()
        game.locator('#startBtn').click()
        inspect(game, 180, 160)
        runtime = game_state(game)
        assert runtime['world']['source'] == 'editor'
        assert runtime['world']['objects'] == snapshot['objects']
        kit = runtime['world']['stats']['environmentKit']
        assert kit['loadedModels'] == 1 and kit['placements'] == 2, kit
        assert kit['models'][0]['id'] == 'house:' + VARIANT and kit['models'][0]['roofRemoved'], kit
        assert runtime['world']['stats']['loadedGLBs'] == 6
        assert len(runtime['houses']) == 2 and all(not house['roofVisible'] for house in runtime['houses'])
        assert runtime['rendering']['triangles'] > 10000 and runtime['rendering']['textures'] > 0
        capture(game, 'exterior')
        passed('Editor playtest renders both taverns from one loaded GLB with preserved transforms and open roofs',
               {'kit': kit, 'houses': runtime['houses'], 'rendering': runtime['rendering']})

        # Front entry is normalized toward +Z; the wide hall starts behind it.
        front = max(w['maxZ'] for w in definition['walls'] if w['type'] == 'house-wall')
        inspect(game, 180, 150 + front + 1.7)
        walk(game, ['w'], .9)
        entered = game_state(game)
        assert entered['position']['z'] < 150 + front - .6, entered['position']
        assert entered['shelter'] == obj['name'], entered['shelter']
        assert entered['world']['groundHeight'] <= entered['position']['y'] + .02, {
            'problem': 'Terrain protrudes through the hall floor',
            'groundHeight': entered['world']['groundHeight'], 'position': entered['position']}
        capture(game, 'interior')
        passed('Actual keyboard walking enters the new tavern through the front doorway', entered['position'])

        # Compare door access with a solid, visible part of the same facade.
        front_walls = [w for w in definition['walls'] if w['type'] == 'house-wall'
                       and w['maxZ'] > front - 1 and w['maxZ'] - w['minZ'] < 2
                       and w['maxX'] - w['minX'] > 2]
        body = max(front_walls, key=lambda w: w['maxX'])
        x = (body['minX'] + body['maxX']) / 2
        inspect(game, 180 + x, 150 + body['maxZ'] + 1.6)
        walk(game, ['w'], .7)
        stopped = game_state(game)['position']
        assert body['maxZ'] + .3 <= stopped['z'] - 150 <= body['maxZ'] + .7, stopped
        inspect(game, 180 + x, 150 + body['maxZ'] + 1.6)
        walk(game, ['w'], .6, roll=True)
        rolled = game_state(game)['position']
        assert rolled['z'] - 150 >= body['maxZ'] + .3, rolled
        passed('The facade blocks both walking and a forward roll while the actual doorway stays passable',
               {'walk': stopped, 'roll': rolled})

        furniture = [w for w in definition['walls'] if w['type'] == 'furniture']
        assert furniture, 'No furniture collision bodies registered'
        table = next((w for w in furniture if w.get('name', '').lower().find('table') >= 0), furniture[0])
        x = (table['minX'] + table['maxX']) / 2
        inspect(game, 180 + x, 150 + table['maxZ'] + 1.3)
        walk(game, ['w'], .6)
        stopped = game_state(game)['position']
        assert table['maxZ'] + .3 <= stopped['z'] - 150 <= table['maxZ'] + .7, (table, stopped)
        passed('Large interior furniture remains solid during real movement', {'body': table, 'position': stopped})

        point = world_point(rotated, 0, 3)
        inspect(game, *point)
        current = game_state(game)
        house = next(h for h in current['houses'] if h['id'] == rotated['id'])
        assert abs(current['position']['y'] - (house['y'] + house['floorHeight'])) < .05, current['position']
        assert current['shelter'] == rotated['name'], current['shelter']
        assert current['world']['groundHeight'] <= current['position']['y'] + .02, {
            'problem': 'Terrain protrudes through the rotated house floor',
            'groundHeight': current['world']['groundHeight'], 'position': current['position']}
        capture(game, 'rotated')
        passed('The rotated and scaled editor copy retains its floor height and indoor detection',
               {'position': current['position'], 'house': house})
        if STANDALONE:
            assert not REPORT['delivery']['unexpectedResourceRequests'], REPORT['delivery']
            passed('Actual standalone editor and game files complete the handoff without external resource dependencies',
                   REPORT['delivery'])
        browser.close()
    assert not REPORT['errors'], REPORT['errors']
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    raise
finally:
    (ROOT / 'docs/tripo-tavern-check.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
