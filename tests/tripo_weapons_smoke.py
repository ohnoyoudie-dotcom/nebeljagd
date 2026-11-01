"""Exercise the uploaded sword and two staves through editor and game controls.

NEBELJAGD_URL=http://127.0.0.1:5190 python3 tests/tripo_weapons_smoke.py
Runs against either the development server or the generated standalone files.
Uses a private browser context and an object-free copy of the project map; the
authored map and uploaded models are never changed. Output is in test-results/.
"""
from __future__ import annotations

import copy
import json
import math
import os
import subprocess
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5190').rstrip('/')
OUT = ROOT / 'test-results/tripo-weapons'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [], 'screenshots': []}
WEAPONS = [
    ('sword', 'kit-tripo-sword', 'rare', [30, -42]),
    ('iceStaff', 'kit-tripo-ice-staff', 'uncommon', [35, -42]),
    ('fireStaff', 'kit-tripo-fire-staff', 'legendary', [40, -42]),
]


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.route_web_socket('**', lambda socket: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text)
            if message.type == 'error' else None)


def editor_state(page):
    return page.evaluate('nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => { const s = nebeljagdTestState(); return {
      position:s.position, elapsed:s.elapsed, phase:s.phase, equippedWeapon:s.equippedWeapon,
      equippedItem:s.equippedItem, attackCooldown:s.attackCooldown, combat:s.combat,
      weaponDrops:s.weaponDrops, rendering:s.rendering,
      world:{source:s.world.source, objects:s.world.objects}
    }; }''')


def wait_sim(page, seconds):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('target => nebeljagdTestState().elapsed >= target', arg=before + seconds)


def distance(a, b):
    return math.sqrt(sum((a[key] - b[key]) ** 2 for key in ('x', 'y', 'z')))


def screenshot(page, name):
    path = OUT / f'{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def import_map(page, document, name):
    validation = subprocess.run(['node', '--input-type=module', '-e',
        "import {readFileSync} from 'node:fs'; import {validateWorldmap} from './src/map/model.js';"
        "console.log(JSON.stringify(validateWorldmap(JSON.parse(readFileSync(0,'utf8')))));"],
        input=json.dumps(document), text=True, cwd=ROOT, capture_output=True, check=True)
    result = json.loads(validation.stdout)
    assert result['valid'], {'fixture': name, 'errors': result['errors']}
    stage('Import ' + name)
    page.locator('#json-file-input').set_input_files({
        'name': name, 'mimeType': 'application/json', 'buffer': json.dumps(document).encode()})
    try:
        page.wait_for_function('value => nebeljagdMapTestState().map.name === value',
                              arg=document['name'], timeout=15000)
    except Exception as error:
        raise AssertionError({'fixture': name, 'toast': page.locator('#toast').inner_text()}) from error


def validate_grip(held, variant):
    assert held['variant'] == variant and held['imported'], held
    error = distance(held['grip'], held['hand'])
    assert error < .002, {'variant': variant, 'gripError': error, 'held': held}
    assert distance(held['tip'], held['grip']) > .4, held
    return error


try:
    fixture = copy.deepcopy(json.loads((ROOT / 'worldmap.json').read_text()))
    fixture['name'] = 'QA · Uploaded weapon models'
    fixture['objects'] = []
    fixture['barriers'] = []
    fixture['gameplay']['spawnPosition'] = [30, -42]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window, 'showSaveFilePicker', {value: undefined, configurable: true});")
        # Preserve the actual editor popup/document handshake while selecting
        # its supported inspection and software-rendering-friendly quality mode.
        for game_path in ['/game.html', '/nebeljagd.html']:
            context.route(URL + game_path + '?mapSource=editor', lambda route:
                route.fulfill(status=302, headers={'location': route.request.url + '&inspect=1&quality=low'}))
        editor = context.new_page()
        monitor(editor)
        stage('Open editor')
        editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('typeof nebeljagdMapTestState === "function"')
        import_map(editor, fixture, 'weapon-empty-fixture.json')
        editor.locator('#editor-tab-objects').click()
        placed = []
        for index, (kind, variant, rarity, position) in enumerate(WEAPONS):
            stage('Editor model ' + variant)
            editor.locator('#palette-kind').select_option(kind)
            editor.locator('#palette-variant').select_option(variant)
            editor.locator('#palette-rarity').select_option(rarity)
            expect(editor.locator('#palette-rarity')).to_be_visible()
            preview = editor.locator('#palette-preview-image svg image')
            expect(preview).to_have_attribute('href', __import__('re').compile(r'^data:image/webp;base64,.+'))
            preview_ok = preview.evaluate('''async image => {
              const picture = new Image(); picture.src = image.getAttribute('href');
              await picture.decode(); return picture.naturalWidth > 0 && picture.naturalHeight > 0;
            }''')
            assert preview_ok, variant
            editor.locator('#add-object-center').click()
            editor.wait_for_function('count => nebeljagdMapTestState().map.objects.length === count', arg=index + 1)
            for field, value in [('feature-name', f'QA {variant}'), ('feature-x', position[0]),
                                 ('feature-z', position[1]), ('object-rotation', index * 25),
                                 ('object-scale', 1 + index * .1)]:
                editor.locator('#' + field).fill(str(value))
            editor.locator('#properties-form button[type=submit]').click()
            saved = editor_state(editor)['map']['objects'][-1]
            assert saved['variant'] == variant and saved['kind'] == kind and saved['rarity'] == rarity, saved
            assert saved['position'] == position, saved
            assert math.isclose(saved['scale'], 1 + index * .1), saved
            assert math.isclose(saved['rotation'], math.radians(index * 25)), saved
            editor.locator('#undo').click()
            assert not math.isclose(editor_state(editor)['map']['objects'][-1]['position'][0], position[0]) or (
                editor_state(editor)['map']['objects'][-1]['name'] != saved['name'])
            editor.locator('#redo').click()
            assert editor_state(editor)['map']['objects'][-1] == saved
            placed.append(saved)
            passed('Editor preview, placement, transform, rarity and undo/redo', {'kind': kind, 'variant': variant})
        screenshot(editor, 'editor-three-models')
        with editor.expect_download() as download:
            editor.locator('#export-json').click()
        roundtrip_path = OUT / 'weapon-worldmap-roundtrip.json'
        download.value.save_as(roundtrip_path)
        exported = json.loads(roundtrip_path.read_text())
        assert exported == editor_state(editor)['map']
        empty = copy.deepcopy(fixture)
        empty['name'] = 'QA · Empty before roundtrip'
        import_map(editor, empty, 'weapon-empty-again.json')
        assert editor_state(editor)['map']['objects'] == []
        import_map(editor, exported, 'weapon-worldmap-roundtrip.json')
        assert editor_state(editor)['map']['objects'] == placed
        passed('Actual exported JSON reimports with all weapon variants and transforms intact')

        stage('Launch actual editor playtest')
        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        assert game_state(game)['world']['source'] == 'editor'
        assert game_state(game)['world']['objects'] == placed
        game.locator('#startBtn').click()
        game.wait_for_function('nebeljagdTestState().phase === "playing"')
        passed('Editor Spielen transfers the actual custom-weapon document to the rendered game')
        for kind, variant, rarity, position in WEAPONS:
            stage('Equip and attack with ' + variant)
            drop = next(item for item in game_state(game)['weaponDrops'] if item['type'] == kind)
            assert drop['variant'] == variant, drop
            game.evaluate('point => nebeljagdInspect({x:point[0],z:point[1],direction:0,health:100})', position)
            wait_sim(game, .15)
            if game_state(game)['equippedWeapon'] != kind:
                game.keyboard.press('e')
            game.wait_for_function('kind => nebeljagdTestState().equippedWeapon === kind', arg=kind)
            wait_sim(game, .12)
            state = game_state(game)
            assert state['equippedItem']['variant'] == variant and state['equippedItem']['rarity'] == rarity, state['equippedItem']
            grip_error = validate_grip(state['combat']['heldWeapon'], variant)
            screenshot(game, f'held-{kind}')
            before_shots = state['combat']['shotsFired']
            game.evaluate('''() => {
              window.weaponPoseSamples = []; window.collectWeaponPoses = true;
              function sample() {
                if (!window.collectWeaponPoses) return;
                window.weaponPoseSamples.push(structuredClone(nebeljagdTestState().combat));
                requestAnimationFrame(sample);
              }
              requestAnimationFrame(sample);
            }''')
            game.keyboard.press('f')
            game.wait_for_function('nebeljagdTestState().attackCooldown > 0')
            game.wait_for_function('nebeljagdTestState().attackCooldown === 0')
            samples = game.evaluate('() => { window.collectWeaponPoses = false; return window.weaponPoseSamples; }')
            phases = {sample['attackPhase'] for sample in samples}
            required_phases = {'windup', 'strike', 'follow-through'} if kind == 'sword' else {'channel', 'release', 'recover'}
            assert required_phases <= phases, {'variant': variant, 'phases': sorted(phases)}
            for sample in samples:
                validate_grip(sample['heldWeapon'], variant)
            tips = [sample['heldWeapon']['tip'] for sample in samples]
            assert max(distance(tips[0], tip) for tip in tips) > .03, {'variant': variant, 'tips': tips}
            final = game_state(game)['combat']
            if kind.endswith('Staff'):
                assert final['shotsFired'] == before_shots + 1, final
                assert final['lastSpellVariant'] == variant, final
                assert distance(final['lastSpellOrigin'], final['lastSpellTip']) < .00001, final
            else:
                assert final['shotsFired'] == before_shots, final
            passed('Pickup preserves model; hand grip and attack animate together', {
                'kind': kind, 'variant': variant, 'gripError': grip_error, 'phases': sorted(phases),
                'tipMovement': max(distance(tips[0], tip) for tip in tips),
                'spellOrigin': final.get('lastSpellOrigin') if kind.endswith('Staff') else None,
            })
        assert not REPORT['errors'], REPORT['errors']
        browser.close()
    REPORT['status'] = 'passed'
except Exception as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = repr(error)
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(REPORT, ensure_ascii=False, indent=2), flush=True)
