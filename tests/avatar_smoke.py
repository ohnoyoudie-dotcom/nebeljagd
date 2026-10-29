"""Focused live-WebGL avatar integration check, using the actual game controls.

NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/avatar_smoke.py
Run with the new exported GLB and the source Vite server or a current build.
The inspection hook only relocates the local player to existing starter items.
"""
import json
import hashlib
import base64
import math
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [], 'screenshots': [],
          'sourceGlbSha256': hashlib.sha256((ROOT/'assets/characters/adventurer.glb').read_bytes()).hexdigest(),
          'limits': 'Chromium WebGL2 via SwiftShader; this is functional/render validation, not an iPad GPU performance benchmark.'}


def state(page):
    return page.evaluate('''()=>{const s=nebeljagdTestState();return {
      phase:s.phase,elapsed:s.elapsed,position:s.position,direction:s.direction,
      character:s.character,rollRemaining:s.rollRemaining,rollCooldown:s.rollCooldown,
      equippedWeapon:s.equippedWeapon,combat:s.combat,rendering:s.rendering,camera:s.camera};}''')


def wait_sim(page, seconds):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=before+seconds)


def passed(name, evidence):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def capture(page, name, canvas_only=False):
    path = ROOT / f'docs/avatar-check-{name}.png'
    if canvas_only:
        # Pause overlay deliberately covers the avatar; capture the unchanged
        # WebGL scene through the existing read-only inspect hook instead.
        pixels = page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]
        path.write_bytes(base64.b64decode(pixels))
    else:
        page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


try:
    with sync_playwright() as playwright:
        executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium')
        browser = playwright.chromium.launch(executable_path=executable, headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 850})
        page.set_default_timeout(90000)
        page.route_web_socket('**', lambda ws: None)
        page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
        page.goto(URL+'/?inspect=1&quality=low', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        page.locator('#startBtn').click()
        page.evaluate('nebeljagdInspect({x:30,z:-42,health:100,direction:0})')
        wait_sim(page, .15)
        idle = state(page)
        assert idle['character']['clips'] == ['Idle_Nebeljagd', 'Run_Nebeljagd', 'Roll_Nebeljagd'] or set(idle['character']['clips']) == {'Idle_Nebeljagd', 'Run_Nebeljagd', 'Roll_Nebeljagd'}
        assert idle['character']['joints'] >= 20
        assert 12000 <= idle['character']['triangles'] <= 25000
        assert idle['character']['activeAnimation'] == 'Idle_Nebeljagd'
        capture(page, 'idle-game-camera')
        passed('The actual game imports the new humanoid and idle clip with its normal camera', idle)

        page.keyboard.down('s')
        wait_sim(page, .5)
        running = state(page)
        page.keyboard.up('s')
        assert running['position']['z'] - idle['position']['z'] > 2
        assert running['character']['locomotion']['walkWeight'] > .95
        assert running['character']['activeAnimation'] == 'Run_Nebeljagd'
        wait_sim(page, .7)
        assert state(page)['character']['activeAnimation'] == 'Idle_Nebeljagd'
        passed('Real WASD movement blends into the new run and returns to idle', running['character'])

        page.evaluate('nebeljagdInspect({x:30,z:-42,health:100,direction:0})')
        page.keyboard.press('Space')
        page.wait_for_function('nebeljagdTestState().character.rollProgress>.3 && nebeljagdTestState().rollRemaining>0')
        rolling = state(page)
        assert rolling['character']['activeAnimation'] == 'Roll_Nebeljagd'
        assert rolling['character']['rollClipTime'] > 0
        assert max(abs(x) for x in rolling['character']['presentationRotation']) < 1e-5
        assert rolling['character']['modelScale'] == [1, 1, 1]
        assert abs(rolling['position']['x']-30) < .05 and rolling['position']['z'] > -42
        page.keyboard.press('Escape')
        paused = state(page)
        page.wait_for_timeout(200)
        assert state(page)['character']['rollClipTime'] == paused['character']['rollClipTime']
        capture(page, 'roll-game-camera', canvas_only=True)
        page.keyboard.press('Escape')
        page.wait_for_function('nebeljagdTestState().rollRemaining===0')
        wait_sim(page, .15)
        ended = state(page)
        assert ended['character']['activeAnimation'] == 'Idle_Nebeljagd'
        assert ended['character']['rollWeight'] == 0
        passed('Space plays the tucked GLB roll once without a second runtime spin; pause freezes it', {'rolling': rolling, 'ended': ended['character']})

        page.evaluate('nebeljagdInspect({x:34,z:-39,health:100,direction:0})')
        page.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
        wait_sim(page, .3)
        bow = state(page)
        grip = bow['combat']['heldPose']['bow']
        assert all(math.isfinite(value) for value in grip.values())
        assert .4 < grip['y'] < 2 and abs(grip['x']) < 1.2 and -.5 < grip['z'] < 1.5
        shots = bow['combat']['shotsFired']
        page.keyboard.press('f')
        page.wait_for_function('n=>nebeljagdTestState().combat.shotsFired>n', arg=shots)
        capture(page, 'bow-game-camera')
        passed('The replacement rig still holds and fires the existing bow', state(page)['combat'])

        page.wait_for_function('nebeljagdTestState().rollCooldown===0')
        page.evaluate('nebeljagdInspect({x:30,z:-42,health:100,direction:0})')
        page.keyboard.down('d')
        wait_sim(page, .04)
        page.keyboard.press('Space')
        page.keyboard.up('d')
        page.keyboard.down('w')
        page.wait_for_function('nebeljagdTestState().character.rollProgress>.35 && nebeljagdTestState().rollRemaining>0')
        turned_roll = state(page)
        page.keyboard.up('w')
        assert abs(turned_roll['character']['locomotion']['yaw']-math.pi/2) < .01
        assert turned_roll['position']['x'] > 31 and abs(turned_roll['position']['z']+42) < .06
        assert max(abs(x) for x in turned_roll['character']['presentationRotation']) < 1e-5
        passed('A sudden right turn followed by roll locks the body to the actual roll direction', turned_roll)
        assert not REPORT['errors'], REPORT['errors']
        browser.close()
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    raise
finally:
    (ROOT/'docs/avatar-check-gameplay.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors']}), flush=True)
