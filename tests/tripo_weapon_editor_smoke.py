"""Exercise all six Tripo weapons through the delivered editor and game.

NEBELJAGD_URL=http://127.0.0.1:5208 python tests/tripo_weapon_editor_smoke.py
The URL may include /preview. Run after building the standalone files. Only the
browser draft changes; the source map stays untouched. Player repositioning uses
the existing inspect hook; placement, pickup, swapping, attacks and reset use UI.
"""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import shutil
import traceback
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
    ('poisonStaff', 'kit-tripo-poison-staff', 'rare', [60, -54]),
    ('moonStaff', 'kit-tripo-moon-staff', 'common', [68, -54]),
    ('bow', 'kit-tripo-ornate-bow', 'uncommon', [76, -54]),
]
# Count existing star drops too; the six legacy fixtures remain covered here.
WEAPON_KINDS = {entry[0] for entry in WEAPONS} | {'starStaff'}
EXPECTED_DROPS = sum(obj['kind'] in WEAPON_KINDS for obj in BASE['objects']) + len(WEAPONS)
REPORT = {'status': 'running', 'stage': 'launch browser', 'url': URL, 'checks': [], 'errors': [],
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


def browser_budget():
    """Safe runner diagnostics; no process arguments, environment or secrets."""
    result = {}
    for name in ('memory.max', 'memory.current', 'memory.events'):
        path = Path('/sys/fs/cgroup') / name
        if path.is_file():
            result[name] = path.read_text().strip()
    path = Path('/proc/meminfo')
    if path.is_file():
        result['hostMemory'] = [line for line in path.read_text().splitlines()
                                if line.startswith(('MemTotal:', 'MemAvailable:'))]
    return result


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
    expected_hash = hashlib.sha256(expected.read_bytes()).hexdigest()
    assert digest.hexdigest() == expected_hash, {
        'document': path, 'servedSha256': digest.hexdigest(), 'deliveredSha256': expected_hash}
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
    assert item['rarity'] == next(d['rarity'] for d in current['weaponDrops'] if d['id'] == obj['id']), item
    assert held['type'] == obj['kind'] and held['variant'] == obj['variant'], held
    assert held['model'] == 'tripo' and held['meshCount'] > 0 and held['visible'], held
    expect(page.locator('#weaponStatus')).to_have_attribute('data-rarity', item['rarity'])
    if obj['variant'] == 'kit-tripo-ornate-bow':
        expect(page.locator('#weaponName')).to_have_text('Verzierter Bogen')
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
    if game_state(page)['equippedWeapon'] == 'poisonStaff':
        page.keyboard.down('f')
        point = page.evaluate('id=>nebeljagdProjectPoint(nebeljagdTestState().practiceActors.find(a=>a.id===id).position)', identifier)
        page.mouse.move(point['x'], point['y'])
        page.keyboard.up('f')
    else:
        page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n', arg=before)
    wait_sim(page, .12)
    after = game_state(page)
    assert after['combat']['lastDamage']['targetId'] == identifier, after['combat']
    actor = next(a for a in after['practiceActors'] if a['id'] == identifier)
    assert actor['health'] < actor['maxHealth'], actor
    return after, actor


try:
    REPORT['budgetBefore'] = browser_budget()
    with sync_playwright() as p:
        # CI uses the browser from its pinned Playwright installation. A moving
        # runner-image Chromium must not silently override that tested toolchain.
        executable = os.environ.get('CHROMIUM_EXECUTABLE')
        if not executable and os.environ.get('NEBELJAGD_BUNDLED_CHROMIUM') != '1':
            executable = shutil.which('chromium')
        browser = p.chromium.launch(channel='chromium', executable_path=executable, headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        REPORT['browser'] = {'channel': 'chromium', 'version': browser.version,
                             'playwright': importlib.metadata.version('playwright'),
                             'executable': executable or p.chromium.executable_path}
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
        REPORT['stage'] = 'open generated editor and verify its project map'
        editor = context.new_page()
        response = editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        assert response.status == 200
        record_document('map-editor.html', 'map-editor.html')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_state(editor)['map'] == BASE
        objects = []
        for index, (kind, variant, rarity, position) in enumerate(WEAPONS):
            REPORT['stage'] = 'place ' + variant
            editor.locator('#editor-tab-objects').click()
            editor.locator('#editor-tool-objects-place').click()
            editor.locator('#palette-kind').select_option(kind)
            editor.locator('#palette-variant').select_option(variant)
            editor.locator('#palette-rarity').select_option('common')
            editor.locator('#add-object-center').click()
            for field, value in [('feature-x', position[0]), ('feature-z', position[1]),
                                 ('object-rotation', (index + 1) * 30), ('object-scale', 1.2)]:
                editor.locator('#' + field).fill(str(value))
            editor.locator('#properties-form button[type=submit]').click()
            obj = editor_state(editor)['map']['objects'][-1]
            assert obj['kind'] == kind and obj['variant'] == variant and obj['rarity'] == 'common'
            objects.append(obj)
        edited = editor_state(editor)['map']
        assert edited['objects'][:-len(WEAPONS)] == BASE['objects']
        assert {k: v for k, v in edited.items() if k != 'objects'} == {k: v for k, v in BASE.items() if k != 'objects'}
        capture(editor, 'editor-six-weapons')
        passed('All six Tripo weapon models can be placed without changing the authored map or existing objects', objects)

        REPORT['stage'] = 'open Spielen popup and verify exact map/model handoff'
        REPORT['editorHeap'] = editor.evaluate('''() => performance.memory ? {
            used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,
            limit:performance.memory.jsHeapSizeLimit} : null''')
        REPORT['budgetBeforePopup'] = browser_budget()
        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        game.wait_for_load_state('domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#errorScreen')).to_be_hidden()
        assert game.url.startswith(URL + '/magebrawl.html?mapSource=editor'), game.url
        record_document('magebrawl.html', 'magebrawl.html')
        initial = game_state(game)
        assert initial['world']['source'] == 'editor' and initial['world']['objects'] == edited['objects']
        assert len(initial['weaponDrops']) == EXPECTED_DROPS
        for obj in objects:
            drop = next(d for d in initial['weaponDrops'] if d['id'] == obj['id'])
            assert drop['model'] == 'tripo' and drop['variant'] == obj['variant'], drop
            assert drop['rarity'] in ['common', 'uncommon', 'rare', 'epic', 'legendary'] and not drop['collected'], drop
        passed('The real Spielen action transfers exact objects to the sibling game and loads the requested GLB drops',
               {'url': game.url, 'drops': initial['weaponDrops'], 'character': initial['character']})
        # The unchanged first launch above proves the user-facing handoff. Load
        # its stored draft again with the existing explicit inspection mode for
        # deterministic player positioning during the gameplay assertions.
        game.goto(URL + '/magebrawl.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        assert game_state(game)['world']['objects'] == edited['objects']
        game.locator('#startBtn').click()
        inspect(game, 44, -49)
        capture(game, 'six-ground-models')

        first = objects[0]
        REPORT['stage'] = 'auto-pickup ' + first['variant']
        inspect(game, *first['position'])
        equipped = assert_equipped(game, first)
        capture(game, 'held-sword')
        passed('The first Tripo sword auto-equips with its real held model and rolled rarity', equipped)
        for obj in objects[1:]:
            REPORT['stage'] = 'swap to ' + obj['variant']
            previous = game_state(game)['equippedWeapon']
            inspect(game, *obj['position'])
            assert game_state(game)['equippedWeapon'] == previous
            game.keyboard.press('e')
            equipped = assert_equipped(game, obj)
            capture(game, 'held-' + obj['kind'])
            passed('Manual swap preserves the Tripo variant and held model: ' + obj['kind'], equipped)

        targets = ['practice-2', 'practice-3', 'practice-1', 'practice-3', 'practice-1', 'practice-2']
        for obj, target, distance in zip(objects, targets, [1.3, 3, 3, 3, 3, 3]):
            REPORT['stage'] = 'reset, pickup and attack with ' + obj['variant']
            restored = reset(game)
            assert len(restored['weaponDrops']) == EXPECTED_DROPS
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
            if obj['kind'] == 'poisonStaff':
                assert actor['poisonRemaining'] > 0, actor
                wait_sim(game, .7)
                poisoned = next(a for a in game_state(game)['practiceActors'] if a['id'] == target)
                assert poisoned['health'] < actor['health'] - 1, poisoned
                evidence['continuedPoison'] = poisoned
            if obj['kind'] == 'moonStaff':
                assert not actor['burnRemaining'] and not actor['poisonRemaining'] and not actor['slowRemaining'], actor
            if obj['kind'] == 'bow':
                assert equipped['held']['stringVertices'] > 0, equipped
            if obj['kind'] in {'poisonStaff', 'moonStaff', 'bow'}:
                grip = after['combat']['heldGrip']
                assert grip and grip['error'] < .025, grip
                evidence['grip'] = grip
            passed('Restart retains the GLB and normal attacks work: ' + obj['kind'], evidence)

        assert not REPORT['errors'], REPORT['errors']
        assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
        browser.close()
    assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
    REPORT['sourceMapUnchanged'] = MAP_HASH
    REPORT['status'] = 'passed'
    REPORT['stage'] = 'complete'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    REPORT['exceptionType'] = type(error).__name__
    REPORT['traceback'] = traceback.format_exc()
    try:
        capture(game if 'game' in globals() else editor, 'failure')
    except Exception:
        pass
    raise
finally:
    REPORT['budgetAfter'] = browser_budget()
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        diagnostic = {key: REPORT.get(key) for key in
                      ('status', 'stage', 'exceptionType', 'failure', 'traceback', 'errors', 'unexpectedRequests',
                       'browser', 'editorHeap', 'budgetBefore', 'budgetBeforePopup', 'budgetAfter')}
        diagnostic['passedChecks'] = [check['name'] for check in REPORT['checks']]
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write('### Uploaded weapon browser check\n\n```json\n' +
                          json.dumps(diagnostic, ensure_ascii=False, indent=2) + '\n```\n')
        if REPORT['status'] == 'failed':
            # Public repository annotations remain readable where raw logs and
            # job summaries require a web login. Preserve the actual failure.
            message = json.dumps(diagnostic, ensure_ascii=False)
            message = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
            print('::error title=Uploaded weapon browser check::' + message, flush=True)
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']),
                     'errors': REPORT['errors'], 'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
