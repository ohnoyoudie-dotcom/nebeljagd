"""Exercise the three Tripo weapons through the delivered editor and game.

NEBELJAGD_URL=http://127.0.0.1:5208 python tests/tripo_weapon_editor_smoke.py
The URL may include /preview. Run after building the standalone files. Only the
browser draft changes; the source map stays untouched. Player repositioning uses
the existing inspect hook; placement, pickup, swapping, attacks and reset use UI.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import shutil
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5208').rstrip('/')
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', '/tmp/nebeljagd-tripo-weapon-qa'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = json.loads((ROOT / 'worldmap.json').read_text())
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
WEAPONS = [
    ('sword', 'kit-tripo-sword', 'rare', [36, -54]),
    ('fireStaff', 'kit-tripo-lava-staff', 'uncommon', [44, -54]),
    ('iceStaff', 'kit-tripo-crystal-staff', 'legendary', [52, -54]),
]
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [],
          'unexpectedRequests': [], 'screenshots': [], 'documents': [],
          'limits': 'Actual standalone HTML in Chromium/SwiftShader over local HTTP; no physical-device performance or public-host HTTP claim.'}


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text)
            if message.type == 'error' else None)


def record_document(path, local_name):
    # The standalone HTML exceeds Chromium's response-body inspector cache.
    # Hash the HTTP response as a stream and compare it with the delivered file.
    digest = hashlib.sha256()
    size = 0
    with urlopen(URL + '/' + path, timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    expected = ROOT / 'welt' / local_name
    assert digest.hexdigest() == hashlib.sha256(expected.read_bytes()).hexdigest()
    REPORT['documents'].append({'url': URL + '/' + path, 'sha256': digest.hexdigest(), 'bytes': size,
                                'matchesDeliveredFile': str(expected.relative_to(ROOT))})


def editor_state(page):
    return page.evaluate('window.nebeljagdMapTestState()')


def game_state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {phase:s.phase, elapsed:s.elapsed, position:s.position,
        equippedWeapon:s.equippedWeapon, equippedItem:s.equippedItem,
        weaponDrops:s.weaponDrops, combat:s.combat, practiceActors:s.practiceActors,
        rendering:s.rendering, character:s.character,
        world:{source:s.world.source, objects:s.world.objects, mapId:s.world.mapId}};
    }''')


def wait_sim(page, duration):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=before + duration)


def inspect(page, x, z, direction=math.pi):
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction, 'health': 100})
    wait_sim(page, .15)


def reset(page):
    if game_state(page)['phase'] == 'playing':
        page.keyboard.press('Escape')
    page.locator('#restartBtn').click()
    page.wait_for_function('nebeljagdTestState().phase==="playing"')
    wait_sim(page, .15)
    current = game_state(page)
    assert current['equippedItem'] is None
    assert current['combat']['heldModel'] is None or not current['combat']['heldModel']['visible']
    assert all(not d['collected'] for d in current['weaponDrops'])
    return current


def capture(page, name):
    file = OUT / (name + '.png')
    page.screenshot(path=str(file))
    REPORT['screenshots'].append(str(file))


def assert_equipped(page, obj):
    page.wait_for_function('kind=>nebeljagdTestState().equippedWeapon===kind', arg=obj['kind'])
    wait_sim(page, .12)
    current = game_state(page)
    held, item = current['combat']['heldModel'], current['equippedItem']
    assert item['variant'] == obj['variant'] and item['model'] == 'tripo', item
    assert item['rarity'] == obj['rarity'], item
    assert held['type'] == obj['kind'] and held['variant'] == obj['variant'], held
    assert held['model'] == 'tripo' and held['meshCount'] > 0 and held['visible'], held
    expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', obj['rarity'])
    assert next(d for d in current['weaponDrops'] if d['id'] == obj['id'])['collected']
    return {'item': item, 'held': held}


def attack_target(page, identifier, distance):
    along_x = identifier != 'practice-2'
    page.evaluate('''p=>{
      const a=nebeljagdTestState().practiceActors.find(a=>a.id===p.id);
      nebeljagdInspect({x:a.position.x-(p.alongX?p.distance:0),
        z:a.position.z-(p.alongX?0:p.distance),direction:p.alongX?Math.PI/2:0});
    }''', {'id': identifier, 'distance': distance, 'alongX': along_x})
    wait_sim(page, .12)
    before = game_state(page)['combat']['damageHits']
    page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n', arg=before)
    wait_sim(page, .12)
    after = game_state(page)
    assert after['combat']['lastDamage']['targetId'] == identifier, after['combat']
    actor = next(a for a in after['practiceActors'] if a['id'] == identifier)
    assert actor['health'] < actor['maxHealth'], actor
    return after, actor


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'), headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        context.on('page', monitor)
        context.add_init_script('''
          Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});
        ''')

        def resource(request):
            if request.url.startswith(('data:', 'blob:')):
                return
            if request.resource_type == 'document':
                if not request.url.startswith(URL + '/'):
                    REPORT['unexpectedRequests'].append(request.url)
            elif not urlsplit(request.url).path.endswith('/favicon.ico'):
                REPORT['unexpectedRequests'].append(request.url)

        context.on('request', resource)
        editor = context.new_page()
        response = editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        assert response.status == 200
        record_document('map-editor.html', 'map-editor.html')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_state(editor)['map'] == BASE
        objects = []
        for index, (kind, variant, rarity, position) in enumerate(WEAPONS):
            editor.locator('#editor-tab-objects').click()
            editor.locator('#editor-tool-objects-place').click()
            editor.locator('#palette-kind').select_option(kind)
            editor.locator('#palette-variant').select_option(variant)
            editor.locator('#palette-rarity').select_option(rarity)
            editor.locator('#add-object-center').click()
            for field, value in [('feature-x', position[0]), ('feature-z', position[1]),
                                 ('object-rotation', (index + 1) * 30), ('object-scale', 1.2)]:
                editor.locator('#' + field).fill(str(value))
            editor.locator('#properties-form button[type=submit]').click()
            obj = editor_state(editor)['map']['objects'][-1]
            assert obj['kind'] == kind and obj['variant'] == variant and obj['rarity'] == rarity
            objects.append(obj)
        edited = editor_state(editor)['map']
        assert edited['objects'][:-3] == BASE['objects']
        assert {k: v for k, v in edited.items() if k != 'objects'} == {k: v for k, v in BASE.items() if k != 'objects'}
        capture(editor, 'editor-three-weapons')
        passed('Three new Tripo weapons can be added without changing the existing map or objects', objects)

        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        game.wait_for_load_state('domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#errorScreen')).to_be_hidden()
        assert game.url.startswith(URL + '/nebeljagd.html?mapSource=editor'), game.url
        record_document('nebeljagd.html', 'nebeljagd.html')
        initial = game_state(game)
        assert initial['world']['source'] == 'editor' and initial['world']['objects'] == edited['objects']
        assert len(initial['weaponDrops']) == 3
        for obj in objects:
            drop = next(d for d in initial['weaponDrops'] if d['id'] == obj['id'])
            assert drop['model'] == 'tripo' and drop['variant'] == obj['variant'], drop
            assert drop['rarity'] == obj['rarity'] and not drop['collected'], drop
        passed('The real Spielen action transfers exact objects to the sibling game and loads all three GLB drops',
               {'url': game.url, 'drops': initial['weaponDrops'], 'character': initial['character']})
        # The unchanged first launch above proves the user-facing handoff. Load
        # its stored draft again with the existing explicit inspection mode for
        # deterministic player positioning during the gameplay assertions.
        game.goto(URL + '/nebeljagd.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        assert game_state(game)['world']['objects'] == edited['objects']
        game.locator('#startBtn').click()
        inspect(game, 44, -49)
        capture(game, 'three-ground-models')

        first = objects[0]
        inspect(game, *first['position'])
        equipped = assert_equipped(game, first)
        capture(game, 'held-sword')
        passed('The first Tripo sword auto-equips with its real held model and chosen rarity', equipped)
        for obj in objects[1:]:
            previous = game_state(game)['equippedWeapon']
            inspect(game, *obj['position'])
            assert game_state(game)['equippedWeapon'] == previous
            game.keyboard.press('e')
            equipped = assert_equipped(game, obj)
            capture(game, 'held-' + obj['kind'])
            passed('Manual swap preserves the Tripo variant and held model: ' + obj['kind'], equipped)

        for obj, target, distance in zip(objects, ['practice-2', 'practice-3', 'practice-1'], [1.3, 3, 3]):
            restored = reset(game)
            assert len(restored['weaponDrops']) == 3
            assert all(d['model'] == 'tripo' for d in restored['weaponDrops'])
            inspect(game, *obj['position'])
            equipped = assert_equipped(game, obj)
            after, actor = attack_target(game, target, distance)
            evidence = {'held': equipped['held'], 'hit': after['combat']['lastDamage'], 'target': actor}
            if obj['kind'] == 'fireStaff':
                assert actor['burnRemaining'] > 0, actor
                wait_sim(game, .7)
                burning = next(a for a in game_state(game)['practiceActors'] if a['id'] == target)
                assert burning['health'] < actor['health'] - 2, burning
                evidence['continuedBurn'] = burning
            if obj['kind'] == 'iceStaff':
                assert actor['slowRemaining'] > 0 and actor['speedMultiplier'] == .5, actor
                wait_sim(game, .6)
                slowed = next(a for a in game_state(game)['practiceActors'] if a['id'] == target)
                assert slowed['slowRemaining'] > 0 and slowed['speedMultiplier'] == .5, slowed
                evidence['continuedSlow'] = slowed
            passed('Restart retains the GLB and normal attacks work: ' + obj['kind'], evidence)

        assert not REPORT['errors'], REPORT['errors']
        assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
        browser.close()
    assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
    REPORT['sourceMapUnchanged'] = MAP_HASH
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    try:
        capture(game if 'game' in globals() else editor, 'failure')
    except Exception:
        pass
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
