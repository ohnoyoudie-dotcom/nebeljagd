"""Real generated game: Inbox projectiles, artillery flight and see-over props.

Uses a temporary editor-playtest document; never writes the authored map.
"""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174/welt').rstrip('/')
OUT = ROOT / 'test-results/projectiles-sight'
OUT.mkdir(parents=True, exist_ok=True)
map_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['name'] = 'Projektile und freie Sicht · QA'
fixture['objects'] = []
props = [('well', 'kit-tripo-well', -30), ('wagon', 'kit-tripo-wagon', -15),
         ('barrel', 'kit-tripo-barrel', 0), ('crate', 'kit-wood', 15), ('chest', 'kit-tripo-chest', 30)]
weapons = [('fireStaff', 'kit-tripo-lava-staff', 0), ('iceStaff', 'kit-tripo-crystal-staff', 5),
           ('bow', 'kit-tripo-ornate-bow', 10), ('poisonStaff', 'kit-tripo-poison-staff', 15)]
for kind, variant, x in weapons + props + [('wall', 'kit-stone', 30)]:
    fixture['objects'].append(dict(id=kind, name=kind, kind=kind, variant=variant,
        position=[x, -14 if (kind, variant, x) in weapons else 38 if kind == 'wall' else 20],
        rotation=.45 if kind in ['crate', 'wagon'] else 0,
        scale=2 if kind in ['crate', 'wall'] else 1,
        **({'rarity': 'common'} if (kind, variant, x) in weapons else {})))
report = {'status': 'running', 'checks': [], 'errors': []}


def state(page):
    return page.evaluate('nebeljagdTestState()')


def passed(name):
    report['checks'].append(name)
    print('PASS', name, flush=True)


def capture(page, name):
    (OUT / (name + '.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    (OUT / (name + '.json')).write_text(json.dumps(state(page), ensure_ascii=False, indent=2) + '\n')


def pause_when(page, expression):
    page.evaluate('''expression => { const predicate = new Function('s', 'return '+expression);
      function sample() { if(predicate(nebeljagdTestState())) document.querySelector('#pauseBtn').click();
        else requestAnimationFrame(sample); } requestAnimationFrame(sample); }''', expression)
    page.wait_for_function('nebeljagdTestState().phase === "paused"')


def move(page, x, z):
    before = state(page)['elapsed']
    page.evaluate('p => nebeljagdInspect({...p,direction:0})', {'x': x, 'z': z})
    page.wait_for_function('t => nebeljagdTestState().elapsed > t + .18', arg=before)


with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
    browser = p.chromium.launch(executable_path=executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport={'width': 1100, 'height': 850})
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(fixture)) + ');')
        page = context.new_page()
        page.set_default_timeout(120000)
        page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
        page.on('pageerror', lambda error: report['errors'].append(str(error)))
        page.on('console', lambda message: report['errors'].append(message.text) if message.type == 'error' else None)
        page.goto(BASE + '/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls > 0')
        current = state(page)['combat']
        assert current['effects']['iceModel']['source'].endswith('ice crystal 3d model.glb')
        assert current['arrowModel']['source'].endswith('feathered spear 3d model.glb')
        assert current['effects']['fireModel']['triangles'] <= 6000
        for model in [current['effects']['iceModel'], current['arrowModel']]:
            assert model['forwardAxis'] == '+Z' and 0 < model['triangles'] <= 6000
        page.locator('#startBtn').click()
        page.wait_for_function('nebeljagdTestState().equippedWeapon === "fireStaff"')
        passed('Generated game loads the uploaded fire, ice and feathered arrow models')

        for kind, _, x in props:
            move(page, x, 14)
            assert page.evaluate('p => nebeljagdInspectVisibility(p)', {'x': x, 'z': 26}), kind
            if kind == 'well':
                page.locator('#pauseBtn').click()
                capture(page, 'well-clear-sight')
            move(page, x, 20)
            position = state(page)['position']
            assert abs(position['x'] - x) + abs(position['z'] - 20) > .25, (kind, position)
        move(page, 30, 32)
        assert not page.evaluate('nebeljagdInspectVisibility({x:30,z:44})')
        passed('Well, rotated wagon, barrel, enlarged crate and chest allow sight but stop movement; tall walls still hide actors')

        for kind, x, field in [('iceStaff', 5, 'importedIceProjectiles'), ('bow', 10, 'importedArrowsFlying')]:
            move(page, x, -14)
            page.keyboard.press('e')
            page.wait_for_function('kind => nebeljagdTestState().equippedWeapon === kind', arg=kind)
            target = next(a for a in state(page)['practiceActors'] if a['id'] == 'practice-2')
            move(page, target['position']['x'], target['position']['z'] - 7)
            before_hits = state(page)['combat']['damageHits']
            page.keyboard.press('f')
            scope = 's.combat.effects' if kind == 'iceStaff' else 's.combat'
            pause_when(page, f'{scope}.{field} > 0')
            page.evaluate('nebeljagdInspectCamera({zoom:1.6})')
            capture(page, kind + '-flight')
            before = state(page)
            page.wait_for_timeout(100)
            assert state(page)['combat'] == before['combat'], 'pause freezes flight'
            page.keyboard.press('Escape')
            pause_when(page, f's.combat.damageHits > {before_hits}')
            current = state(page)
            assert current['combat']['lastDamage']['targetId'] == 'practice-2'
            if kind == 'iceStaff':
                assert next(a for a in current['practiceActors'] if a['id'] == 'practice-2')['slowRemaining'] > 0
            passed(f'{kind} renders its uploaded projectile, freezes on pause and hits the intended target')

        move(page, 15, -14)
        page.keyboard.press('e')
        page.wait_for_function('nebeljagdTestState().equippedWeapon === "poisonStaff"')
        move(page, 20, -35)
        page.evaluate('nebeljagdInspectCamera({zoom:1})')
        # Let the camera settle before projecting a real mouse target.
        page.wait_for_function('nebeljagdTestState().combat.attackPhase === "idle"')
        point = page.evaluate('nebeljagdProjectPoint({x:20,z:-46.5})')
        assert page.evaluate('p => document.elementFromPoint(p.x,p.y)?.id === "game"', point), point
        page.mouse.move(point['x'], point['y'])
        page.mouse.down()
        page.wait_for_function('nebeljagdTestState().combat.special.aiming')
        page.mouse.up()
        pause_when(page, 's.combat.special.poisonFlights.some(f => f.age/f.duration > .43 && f.age/f.duration < .8)')
        flight = state(page)['combat']['special']['poisonFlights'][0]
        t = flight['age'] / flight['duration']
        chord_y = flight['origin']['y'] * (1 - t) + flight['target']['y'] * t
        assert flight['position']['y'] - chord_y > 3.8, flight
        distance = math.dist(list(flight['origin'].values()), list(flight['target'].values()))
        assert flight['duration'] > distance / 14 * 1.6, flight
        capture(page, 'poison-artillery-apex')
        page.keyboard.press('Escape')
        pause_when(page, 's.combat.special.clouds.length > 0')
        cloud = state(page)['combat']['special']['clouds'][0]
        assert abs(cloud['position']['x'] - flight['target']['x']) < .01
        assert abs(cloud['position']['z'] - flight['target']['z']) < .01
        assert 2.8 < cloud['remaining'] <= 3
        page.keyboard.press('Escape')
        page.wait_for_function('!nebeljagdTestState().combat.special.clouds.length')
        passed('Real mouse release sends poison through a high, slow arc; it lands on target and its cloud expires after three seconds')
        page.locator('#pauseBtn').click()
        page.locator('#restartBtn').click()
        page.wait_for_function('nebeljagdTestState().phase === "playing"')
        current = state(page)['combat']
        assert current['arrowsActive'] == 0 and current['effects']['activeProjectiles'] == 0
        assert current['special']['poisonProjectiles'] == 0 and not current['special']['clouds']
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == map_hash
        passed('Restart clears projectiles; no shader/browser errors and the authored map is unchanged')
        report.update(status='passed', mapHash=map_hash, browser=browser.version)
    except BaseException as error:
        report.update(status='failed', failure=str(error))
        if 'page' in locals() and not page.is_closed():
            (OUT / 'failure-state.json').write_text(json.dumps(state(page), ensure_ascii=False, indent=2) + '\n')
        raise
    finally:
        browser.close()
        (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
