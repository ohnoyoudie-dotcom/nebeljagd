"""Place all six uploaded woodland props in the generated editor and play them.

Only a temporary browser document is edited; the authored worldmap is hashed.
NEBELJAGD_URL points at the generated build (default: local welt/).
"""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import traceback
from playwright.sync_api import sync_playwright

def show_failure(exception_type, exception, trace):
    # Make failures visible in the public Actions annotations as well as logs.
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        message = ''.join(traceback.format_exception(exception_type, exception, trace))
        message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Woodland browser verification::' + message, flush=True)
    sys.__excepthook__(exception_type, exception, trace)


sys.excepthook = show_failure
ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4175/welt').rstrip('/')
DELIVERY_ONLY = os.environ.get('NEBELJAGD_DELIVERY_ONLY') == '1'
OUT = ROOT / 'test-results/tripo-woodland'
OUT.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
definitions = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {TRIPO_WOODLAND_DEFINITIONS} from './src/map/tripo-woodland-definitions.js';console.log(JSON.stringify(TRIPO_WOODLAND_DEFINITIONS))"], cwd=ROOT))
fixture['objects'] = []
fixture['paths'] = []
fixture['gameplay']['spawnPosition'] = [0, 0]
report = {'status': 'running', 'deliveryOnly': DELIVERY_ONLY, 'checks': [], 'errors': []}
report['files'] = {name: hashlib.sha256((ROOT / 'welt' / name).read_bytes()).hexdigest()
                   for name in ['map-editor.html', 'magebrawl.html', 'worldmap.json']
                   if (ROOT / 'welt' / name).exists()}
for name in ['map-editor.html', 'magebrawl.html', 'magebrawl-welt-und-editor.zip']:
    size = (ROOT / 'welt' / name).stat().st_size
    assert size < 100 * 1024 * 1024, f'{name}: {size} bytes exceeds GitHub file limit'


def passed(message):
    report['checks'].append(message)
    print('PASS', message, flush=True)


def monitor(page):
    page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
    page.on('pageerror', lambda error: report['errors'].append(str(error)))
    page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
    page.set_default_timeout(180000)


def import_map(page, document):
    page.locator('#json-file-input').set_input_files({'name': 'woodland-qa.json',
        'mimeType': 'application/json', 'buffer': json.dumps(document).encode()})


def editor_map(page):
    return page.evaluate('nebeljagdMapTestState().map')


def add(page, kind, variant, x, z, rotation=0, scale=1):
    count = len(editor_map(page)['objects'])
    page.locator('#palette-kind').select_option(kind)
    page.locator('#palette-variant').select_option(variant)
    page.locator('#add-object-center').click()
    for key, value in [('feature-x', x), ('feature-z', z), ('object-rotation', rotation), ('object-scale', scale)]:
        page.locator('#' + key).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()
    result = editor_map(page)['objects']
    assert len(result) == count + 1
    assert result[-1]['position'] == [x, z]
    assert abs(result[-1]['rotation'] - math.radians(rotation)) < .00001
    assert result[-1]['scale'] == scale
    return result[-1]


def game_state(page):
    return page.evaluate('nebeljagdTestState()')


def wait_sim(page, seconds):
    before = game_state(page)['elapsed']
    page.wait_for_function('time => nebeljagdTestState().elapsed >= time', arg=before + seconds)


def capture(page, name):
    (OUT / (name + '.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))


with sync_playwright() as pw:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path)
    browser = pw.chromium.launch(executable_path=executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport={'width': 960, 'height': 640}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true})")
        editor = context.new_page()
        monitor(editor)
        editor.goto(BASE + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_map(editor) == json.loads((ROOT / 'worldmap.json').read_text())
        import_map(editor, fixture)
        editor.locator('[data-editor-action="objects"]').click()
        placed = []
        for i, definition in enumerate(definitions):
            print('STAGE placing', definition['id'], flush=True)
            obj = add(editor, definition['kind'], definition['variant'], -7 + (i % 3) * 7, 5 + (i // 3) * 9,
                      rotation=45 if i == 2 else 0, scale=1.2 if i == 1 else 1)
            placed.append(obj)
            preview = editor.evaluate('''async () => {
                const node=document.querySelector('#palette-preview-image svg image');
                const image=new Image();image.src=node.getAttribute('href');await image.decode();
                return [image.naturalWidth,image.naturalHeight];
            }''')
            assert preview == [256, 192]
            assert editor.locator(f'[data-feature-id="{obj["id"]}"] use').get_attribute('href') == '#world-object-' + obj['variant']
        add(editor, 'stump', 'kit-tripo-stump-01', -7, 23, rotation=90, scale=.8)
        add(editor, 'sword', 'kit-tripo-sword', 0, 0)
        snapshot = editor_map(editor)
        with editor.expect_download() as event:
            editor.locator('#export-json').click()
        event.value.save_as(OUT / 'editor-export.json')
        assert json.loads((OUT / 'editor-export.json').read_text()) == snapshot
        import_map(editor, snapshot)
        assert editor_map(editor) == snapshot
        editor.screenshot(path=str(OUT / 'editor.png'))
        passed('All six real thumbnails, placement, rotation, scale, measured map symbols and JSON export/reimport')

        with editor.expect_popup() as event:
            editor.locator('#playtest-world').click()
        game = event.value
        monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        game.goto(game.url + '&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        game.locator('#startBtn').click()
        game.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
        state = game_state(game)
        assert state['world']['source'] == 'editor'
        assert state['world']['objects'] == snapshot['objects']
        kit = state['world']['stats']['environmentKit']
        assert kit['loadedModels'] == 6
        assert {m['id'] for m in kit['models']} == {d['id'] for d in definitions}
        assert all(m['parts'] > 0 for m in kit['models'])
        assert state['rendering']['textures'] >= 18
        report['models'] = kit
        passed('Generated game loads all six textured variants, sharing the repeated stump model')

        for definition, obj in zip(definitions, placed):
            c, s, scale = math.cos(obj['rotation']), math.sin(obj['rotation']), obj['scale']
            front = definition['circles'][0]['radius'] if definition['circles'] else definition['walls'][0]['maxZ']
            distance = front * scale + 1.8
            x, z = obj['position'][0] + s * distance, obj['position'][1] + c * distance
            game.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': obj['rotation'] + math.pi, 'health': 100})
            keys = ['w', 'a'] if obj['rotation'] else ['w']
            if not DELIVERY_ONLY:
                for key in keys:
                    game.keyboard.down(key)
                wait_sim(game, .75)
                for key in keys:
                    game.keyboard.up(key)
                position = game_state(game)['position']
                local_z = (s * (position['x'] - obj['position'][0]) + c * (position['z'] - obj['position'][1])) / scale
                assert front + .2 / scale <= local_z <= front + .85 / scale, (definition['id'], front, local_z)
            game.evaluate('nebeljagdInspectCamera({zoom:1.65})')
            game.locator('#pauseBtn').click()
            capture(game, definition['file'].replace('.glb', ''))
            game.keyboard.press('Escape')
            passed(definition['label'] + (': visible with avatar in final delivery' if DELIVERY_ONLY else ': visible with avatar, walking blocked at rotated/scaled model'))
            if obj['kind'] == 'crate' and not DELIVERY_ONLY:
                for _ in range(5):
                    if next(d for d in game_state(game)['world']['destructibles'] if d['id'] == obj['id'])['destroyed']:
                        break
                    game.wait_for_function('nebeljagdTestState().attackCooldown===0')
                    game.keyboard.press('f')
                    wait_sim(game, .7)
                assert next(d for d in game_state(game)['world']['destructibles'] if d['id'] == obj['id'])['destroyed']
                passed(definition['label'] + ': normal sword attacks destroy the crate')
        if game_state(game)['phase'] == 'playing':
            game.locator('#pauseBtn').click()
        game.locator('#restartBtn').click()
        assert all(not d['destroyed'] for d in game_state(game)['world']['destructibles'])
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == source_hash
        passed('Restart restores crates; original project map unchanged; no browser errors')
        report['status'] = 'passed'
    except Exception as error:
        report['status'] = 'failed'
        report['failure'] = str(error)
        if 'editor' in locals():
            editor.screenshot(path=str(OUT / 'editor-failure.png'))
        if 'game' in locals():
            try:
                capture(game, 'failure')
                (OUT / 'failure-state.json').write_text(json.dumps(game_state(game), indent=2))
            except Exception:
                pass
        raise
    finally:
        browser.close()
        (OUT / 'report.json').write_text(json.dumps(report, indent=2))
