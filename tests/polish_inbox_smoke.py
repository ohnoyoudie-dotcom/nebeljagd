"""Generated editor/game: uploaded star/moon models and current scenery polish.

Uses one temporary editor document, real placement/export/pickup/attack/roll
inputs, and the existing camera/player inspector. Never changes gameplay timing,
random rarity rolls, asset data, or the authored worldmap.json.
"""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit
from urllib.request import urlopen

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5232').rstrip('/')
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', '/tmp/nebeljagd-polish-inbox-qa'))
OUT.mkdir(parents=True, exist_ok=True)
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'stage': 'prepare fixture', 'checks': [], 'errors': [],
          'unexpectedRequests': [], 'screenshots': [], 'documents': [],
          'limits': 'Actual generated files in Chromium/SwiftShader; no hardware performance claim. Rarity rolls remain random; deterministic all-tier comparison is a separate isolated render.'}


def fixture():
    value = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()));"], cwd=ROOT))
    value['name'] = 'Innenholz, Schneespuren und neue Stäbe · QA'
    value['paths'] = []; value['spawnAreas'] = []; value['objects'] = []
    value['gameplay']['spawnPosition'] = [0, -14]
    value['regions'] = [
        {'id': 'qa-meadow', 'name': 'Testwiese', 'biome': 'meadow', 'color': '#638b4c', 'label': [-20, 0],
         'points': [[-60, -60], [20, -60], [20, 60], [-60, 60]]},
        {'id': 'qa-snow', 'name': 'Testschnee', 'biome': 'snow', 'color': '#dce7e8', 'label': [40, 0],
         'points': [[20, -60], [60, -60], [60, 60], [20, 60]]},
    ]
    value['barriers'] = [{'id': 'qa-wall', 'name': 'Trefferschutz', 'kind': 'wall',
        'variant': 'kit-stone', 'points': [[2, -7], [2, 3]], 'height': 2, 'scale': 1, 'gaps': []}]
    for identifier, kind, variant, position in [
        ('qa-chest', 'chest', 'kit-tripo-chest', [0, 8]),
        ('qa-moon', 'moonStaff', 'kit-tripo-moon-staff', [-8, -16]),
        ('qa-tree', 'tree', 'kit-user-tree1', [-14, 14]),
        ('qa-tree-2', 'tree', 'kit-user-tree1', [-24, 24]),
    ]:
        value['objects'].append({'id': identifier, 'name': identifier, 'kind': kind, 'variant': variant,
            'position': position, 'rotation': .25 if kind == 'tree' else 0, 'scale': 1,
            **({'rarity': 'common'} if kind.endswith('Staff') else {})})
    # The production game intentionally rolls ground rarities each round. A
    # small display samples those real rolls; no particular rare tier is required.
    for index in range(12):
        value['objects'].append({'id': f'qa-glow-{index}', 'name': 'Beutestufen', 'kind': 'bow',
            'variant': 'kit-tripo-ornate-bow', 'rarity': 'common',
            'position': [-17 + index % 4 * 6, 27 + index // 4 * 6], 'rotation': 0, 'scale': 1})
    checked = subprocess.run(['node', '--input-type=module', '-e',
        "import {validateWorldmap} from './src/map/model.js';let s='';for await(const c of process.stdin)s+=c;const r=validateWorldmap(JSON.parse(s));if(!r.valid)throw new Error(r.errors.join('; '));"],
        input=json.dumps(value), text=True, cwd=ROOT)
    assert checked.returncode == 0
    return value


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def state(page):
    return page.evaluate('nebeljagdTestState()')


def wait_sim(page, seconds):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=before + seconds)


def resume(page):
    if state(page)['phase'] == 'paused':
        page.keyboard.press('Escape')
    page.wait_for_function('nebeljagdTestState().phase==="playing"')


def move(page, x, z, direction=0):
    resume(page)
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction})
    wait_sim(page, .18)


def pause_when(page, expression):
    page.evaluate('''expression=>{
      const predicate=new Function('s','return '+expression);
      const observe=()=>{if(predicate(nebeljagdTestState()))document.querySelector('#pauseBtn').click();
        else requestAnimationFrame(observe);};requestAnimationFrame(observe);
    }''', expression)
    page.wait_for_function('nebeljagdTestState().phase==="paused"')


def capture(page, name, zoom=None):
    if zoom is not None:
        page.evaluate('zoom=>nebeljagdInspectCamera({zoom})', zoom)
    path = OUT / (name + '.png')
    path.write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    REPORT['screenshots'].append(str(path))
    return str(path)


def monitor(page):
    page.set_default_timeout(150000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)


def record_document(name):
    digest = hashlib.sha256(); size = 0
    with urlopen(URL + '/' + name, timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk); size += len(chunk)
    assert digest.hexdigest() == hashlib.sha256((RELEASE / name).read_bytes()).hexdigest()
    REPORT['documents'].append({'name': name, 'bytes': size, 'sha256': digest.hexdigest()})


try:
    testmap = fixture()
    record_document('map-editor.html'); record_document('nebeljagd.html')
    release = json.loads((RELEASE / 'release.json').read_text())
    REPORT['buildId'] = release['buildId']; REPORT['sourceCommit'] = release['sourceCommit']
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 900}, has_touch=True, accept_downloads=True)
            context.on('page', monitor)
            context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
            context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            context.on('request', lambda request: REPORT['unexpectedRequests'].append(request.url)
                if request.url.startswith(('http:', 'https:')) and request.resource_type != 'document'
                and not urlsplit(request.url).path.endswith('/favicon.ico') else None)
            REPORT['stage'] = 'place and export Sternstab in actual editor'
            editor = context.new_page()
            editor.goto(URL + '/map-editor.html?start=project', wait_until='domcontentloaded')
            editor.wait_for_function('window.nebeljagdMapTestState')
            assert editor.evaluate('nebeljagdMapTestState().map') == json.loads((ROOT / 'worldmap.json').read_text())
            editor.locator('#json-file-input').set_input_files({'name': 'polish-fixture.json', 'mimeType': 'application/json', 'buffer': json.dumps(testmap).encode()})
            editor.wait_for_function('name=>nebeljagdMapTestState().map.name===name', arg=testmap['name'])
            imported = editor.evaluate('nebeljagdMapTestState().map')
            editor.locator('#editor-tab-objects').click(); editor.locator('#editor-tool-objects-place').click()
            expect(editor.locator('#palette-kind option[value="starStaff"]')).to_have_text('Sternstab')
            editor.locator('#palette-kind').select_option('starStaff')
            editor.locator('#palette-variant').select_option('kit-tripo-star-staff')
            editor.locator('#add-object-center').click()
            editor.locator('#feature-x').fill('-14'); editor.locator('#feature-z').fill('-16')
            editor.locator('#properties-form button[type="submit"]').click()
            edited = editor.evaluate('nebeljagdMapTestState().map')
            star = edited['objects'][-1]
            assert star['kind'] == 'starStaff' and star['variant'] == 'kit-tripo-star-staff' and star['position'] == [-14, -16]
            assert edited['objects'][:-1] == imported['objects']
            with editor.expect_download() as downloaded:
                editor.locator('#download-json').click()
            exported = OUT / 'editor-star-roundtrip.json'; downloaded.value.save_as(exported)
            assert json.loads(exported.read_text()) == edited
            editor.locator('#json-file-input').set_input_files(str(exported))
            editor.wait_for_function('id=>nebeljagdMapTestState().map.objects.some(o=>o.id===id&&o.kind==="starStaff")', arg=star['id'])
            assert editor.evaluate('nebeljagdMapTestState().map') == edited
            editor.screenshot(path=str(OUT / 'editor-sternstab.png'))
            REPORT['screenshots'].append(str(OUT / 'editor-sternstab.png'))
            passed('Sternstab is in the real palette; placement, JSON export and reload preserve its model and all prior objects', star)

            REPORT['stage'] = 'real Spielen handoff'
            with editor.expect_popup() as popup:
                editor.locator('#playtest-world').click()
            game = popup.value
            game.wait_for_url('**/nebeljagd.html?mapSource=editor*', wait_until='commit')
            assert 'mapSource=editor' in game.url, game.url
            # Same real popup/document handoff, with the existing opt-in inspection
            # query before the first large scene initializes; no gameplay override.
            game.goto(URL + '/nebeljagd.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded')
            game.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            initial = state(game)
            assert initial['world']['source'] == 'editor' and initial['world']['objects'] == edited['objects']
            moon_model = initial['combat']['special']['moonModel']
            assert moon_model['imported'] and moon_model['source'].endswith('crescent moon prop 3d model.glb')
            assert 0 < moon_model['triangles'] <= 6000
            assert initial['world']['treeCount'] == 2
            editor.close()
            game.bring_to_front(); game.locator('#startBtn').click()
            passed('Spielen transfers the exact edited map and loads both the uploaded moon projectile and styled trees',
                {'moonModel': moon_model, 'treeCount': initial['world']['treeCount']})

            REPORT['stage'] = 'dark chest and stronger loot aura'
            move(game, 0, 10, math.pi)
            game.wait_for_function('nebeljagdTestState().nearChest==="qa-chest"')
            game.keyboard.press('e')
            game.wait_for_function('nebeljagdTestState().chests.find(c=>c.id==="qa-chest").lidRotation < -1.89')
            game.locator('#pauseBtn').click()
            chest = next(c for c in state(game)['chests'] if c['id'] == 'qa-chest')
            assert chest['opened'] and chest['texturedInteriorSurfaces'] == 2
            capture(game, 'chest-dark-interior', 2)
            passed('Real E interaction opens the textured chest; darker inner panels are captured in the generated game', chest)
            move(game, -8, 30)
            game.locator('#pauseBtn').click()
            drops = [d for d in state(game)['weaponDrops'] if d['id'].startswith('qa-glow-')]
            assert len(drops) == 12
            colors = {'common': '#f1eee3', 'uncommon': '#66d780', 'rare': '#5aa5ff', 'epic': '#bd78f5', 'legendary': '#ffad44'}
            for drop in drops:
                aura = drop['aura']
                assert aura['style'] == 'layered-rarity-aura' and aura['rarity'] == drop['rarity'], drop
                assert aura['color'].lower() == colors[drop['rarity']], aura
                assert aura['visible'] and aura['depthTested'] and 0 < aura['drawCalls'] <= 2, aura
                assert aura['intensity'] >= .8 and aura['particleCount'] >= 3, aura
            capture(game, 'rarity-ground-default', 1)
            capture(game, 'rarity-ground-detail', 1.6)
            passed('Real randomly rolled loot uses the stronger tier-colored, depth-tested aura without changing its rarity', drops)

            REPORT['stage'] = 'styled trees and rounded snow roll'
            move(game, -14, 8)
            game.locator('#pauseBtn').click()
            capture(game, 'tree-rounded-crown-bark', 1.3)
            tree = next(t for t in state(game)['world']['trees'] if t.get('asset') == 'tree1.glb')
            passed('The current derived tree loads at its authored position with the new crown and bark appearance', tree)
            move(game, 38, -12, math.pi)
            game.wait_for_function('nebeljagdTestState().character.snowWeight>.9')
            snow_before = state(game)['snowFootprints']
            player_before = snow_before['bySource'].get('player', {'footprintsCreated': 0})['footprintsCreated']
            game.keyboard.press('Space')
            game.wait_for_function('n=>nebeljagdTestState().snowFootprints.rollSegmentsCreated>n&&nebeljagdTestState().rollRemaining===0', arg=snow_before['rollSegmentsCreated'])
            game.locator('#pauseBtn').click()
            snow = state(game)['snowFootprints']
            assert snow['activeRollSegments'] > 5 and snow['bySource']['player']['footprintsCreated'] == player_before
            assert snow['rollTrackWidthMeters'] == 1 and snow['rollEndStyle'] == 'rounded-powder-caps'
            assert snow['rollCapLengthMeters'] > .4 and snow['singleInstancedDraw'] and snow['continuousRollDistance']
            capture(game, 'snow-roll-default', 1)
            capture(game, 'snow-roll-rounded-detail', 2)
            frozen = state(game)['snowFootprints']; game.wait_for_timeout(100)
            assert state(game)['snowFootprints'] == frozen
            resume(game); game.keyboard.down('d')
            game.wait_for_function('n=>nebeljagdTestState().snowFootprints.bySource.player.footprintsCreated>n', arg=player_before)
            game.keyboard.up('d')
            passed('A real roll leaves a wider continuous furrow with rounded end caps, no soles, and correct pause/walking behavior', snow)

            REPORT['stage'] = 'actual star staff pickup, shot and wall collision'
            move(game, -14, -16)
            if state(game)['equippedWeapon'] != 'starStaff':
                game.keyboard.press('e')
            game.wait_for_function('nebeljagdTestState().equippedWeapon==="starStaff"')
            equipped = state(game)
            assert equipped['equippedItem']['variant'] == 'kit-tripo-star-staff'
            assert equipped['combat']['heldModel']['model'] == 'tripo' and equipped['combat']['heldModel']['meshCount'] > 0
            assert equipped['combat']['heldModel']['source'].endswith('arcane star staff 3d model.glb')
            target = next(a for a in equipped['practiceActors'] if a['id'] == 'practice-1')
            move(game, target['position']['x'] - 5, target['position']['z'], math.pi / 2)
            before = state(game)['combat']['damageHits']
            game.keyboard.press('f')
            pause_when(game, 's.combat.effects.starProjectiles>0')
            flight = state(game)['combat']
            assert flight['effects']['visibleStarProjectiles'] > 0 and flight['effects']['starProjectileStyle'] == 'gold-star-blue-trail'
            capture(game, 'star-staff-shot', 1.8)
            resume(game)
            game.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n', arg=before)
            hit = state(game)['combat']
            assert hit['damageHits'] == before + 1 and hit['lastDamage']['targetId'] == 'practice-1'
            assert hit['effects']['latestImpact']['type'] == 'starStaff'
            game.wait_for_function('nebeljagdTestState().attackCooldown===0')
            target = next(a for a in state(game)['practiceActors'] if a['id'] == 'practice-2')
            move(game, -1, target['position']['z'], math.pi / 2)
            before = state(game)
            game.keyboard.press('f')
            game.wait_for_function('n=>nebeljagdTestState().combat.shotsFired>n', arg=before['combat']['shotsFired'])
            game.wait_for_function('nebeljagdTestState().attackCooldown===0&&nebeljagdTestState().combat.effects.starProjectiles===0')
            after = state(game)
            assert after['combat']['damageHits'] == before['combat']['damageHits']
            assert next(a for a in after['practiceActors'] if a['id'] == 'practice-2')['health'] == target['health']
            passed('The uploaded Sternstab is picked up and fires its own star bolt; it hits one opponent and is blocked by a wall',
                {'held': equipped['combat']['heldModel'], 'projectile': flight['effects'], 'hit': hit['lastDamage']})

            REPORT['stage'] = 'uploaded moon mesh flight and return lock'
            move(game, -8, -16)
            game.keyboard.press('e')
            game.wait_for_function('nebeljagdTestState().equippedWeapon==="moonStaff"')
            move(game, -28, -26, math.pi / 2)
            game.keyboard.press('f')
            pause_when(game, 's.combat.special.moon?.distance>2&&s.combat.special.moon.mode==="outbound"')
            moon = state(game)['combat']['special']
            assert moon['moonModel']['imported'] and moon['moonVisible']
            capture(game, 'moon-uploaded-projectile', 1.8)
            frozen = state(game)['combat']['special']; game.wait_for_timeout(100)
            assert state(game)['combat']['special'] == frozen
            resume(game)
            game.wait_for_function('nebeljagdTestState().combat.special.moon?.mode==="returning"')
            shots = state(game)['combat']['shotsFired']
            assert state(game)['attackCooldown'] > 0
            game.keyboard.press('f')
            assert state(game)['combat']['shotsFired'] == shots
            game.wait_for_function('nebeljagdTestState().combat.special.moon===null')
            game.wait_for_function('nebeljagdTestState().attackCooldown===0')
            game.keyboard.press('f')
            game.wait_for_function('n=>nebeljagdTestState().combat.shotsFired>n&&nebeljagdTestState().combat.special.moon!==null', arg=shots)
            passed('The actual uploaded silver crescent flies, pauses, returns, locks repeat attacks and can be launched again', moon)

            REPORT['stage'] = 'restart and final errors'
            game.keyboard.press('Escape'); game.locator('#restartBtn').click()
            game.wait_for_function('nebeljagdTestState().phase==="playing"')
            restarted = state(game)
            assert restarted['equippedItem'] is None and restarted['combat']['effects']['starProjectiles'] == 0
            assert restarted['combat']['special']['moon'] is None and not restarted['combat']['special']['moonVisible']
            assert restarted['snowFootprints']['activeRollSegments'] == 0
            assert not next(c for c in restarted['chests'] if c['id'] == 'qa-chest')['opened']
            assert restarted['world']['objects'] == edited['objects']
            assert not REPORT['errors'], REPORT['errors']
            assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
            assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
            passed('Restart clears both new weapon effects and tracks; authored map is unchanged and no shader/browser/network errors occurred')
            REPORT.update(status='passed', mapSha256=MAP_HASH, browser=browser.version)
        except BaseException:
            for candidate in [locals().get('game'), locals().get('editor')]:
                if candidate and not candidate.is_closed():
                    try:
                        candidate.screenshot(path=str(OUT / 'failure.png'))
                        if candidate == locals().get('game'):
                            (OUT / 'failure-state.json').write_text(json.dumps(state(candidate), indent=2))
                        break
                    except Exception:
                        pass
            raise
        finally:
            browser.close()
except BaseException as error:
    REPORT.update(status='failed', failure=str(error))
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
