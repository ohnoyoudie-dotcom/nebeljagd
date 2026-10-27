"""Focused production-browser QA for the detailed village.

Run against a finished Vite preview: NEBELJAGD_URL=http://127.0.0.1:4173
python3 tests/village_smoke.py. The explicit ?inspect=1 local capture API places
the player at test locations; movement, interactions and damage use real inputs
and normal game simulation. Screenshots are the actual game camera.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173').rstrip('/')
QUALITY = os.environ.get('NEBELJAGD_QUALITY', 'low')
OUT = Path('test-results')
OUT.mkdir(exist_ok=True)
REPORT = OUT / 'village-smoke.json'
checks, errors, captures = [], [], []


def state(page):
    return page.evaluate('window.nebeljagdTestState()')


def passed(name, evidence=None):
    check = {'name': name}
    if evidence is not None:
        check['evidence'] = evidence
    checks.append(check)
    print('PASS:', name, flush=True)


def monitor(page):
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)


def start(page, path=''):
    monitor(page)
    page.goto(f'{URL}/{path}?inspect=1&quality={QUALITY}', wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdInspect && window.nebeljagdTestState().rendering.calls > 0')
    page.locator('#startBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")


def inspect(page, x, z, elapsed=0, health=100, direction=None):
    position = {'x': x, 'z': z, 'elapsed': elapsed, 'health': health}
    if direction is not None:
        position['direction'] = direction
    page.evaluate('position => window.nebeljagdInspect(position)', position)
    # Require a real simulation frame after placement, not a wall-clock delay.
    try:
        page.wait_for_function('elapsed => window.nebeljagdTestState().elapsed > elapsed + .04', arg=elapsed)
    except Exception:
        print('INSPECT DIAGNOSTIC:', json.dumps(state(page)), flush=True)
        raise


def wait_simulation(page, seconds):
    before = state(page)['elapsed']
    page.wait_for_function('target => window.nebeljagdTestState().elapsed >= target', arg=before + seconds)


def capture(page, filename):
    page.screenshot(path=str(OUT / filename))
    captures.append(filename)
    print('CAPTURE:', filename, flush=True)


def move(page, key, axis, sign, distance=.45):
    before = state(page)['position'][axis]
    try:
        page.keyboard.down(key)
        page.wait_for_function('a => (window.nebeljagdTestState().position[a.axis] - a.before) * a.sign > a.distance',
                               arg={'axis': axis, 'before': before, 'sign': sign, 'distance': distance})
    finally:
        page.keyboard.up(key)
    page.wait_for_function('!window.nebeljagdTestState().moving')


result = {'status': 'running', 'checks': checks, 'javascript_or_shader_errors': errors, 'screenshots': captures}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        page.set_default_timeout(90000)
        start(page)
        asset = state(page)['character']
        assert asset['skinned'] is True and asset['joints'] >= 16, asset
        assert {'Idle', 'Walk'}.issubset(asset['clips']), asset
        passed('WebGL2 production build loads original skinned GLB with Idle and Walk', asset)
        inspect(page, -8, 8)
        wait_simulation(page, .25)
        capture(page, 'village-desktop.png')

        for key, axis, sign in [('w', 'z', -1), ('s', 'z', 1), ('a', 'x', -1), ('d', 'x', 1),
                                ('ArrowUp', 'z', -1)]:
            inspect(page, -8, 8)
            move(page, key, axis, sign)
        passed('Actual WASD/arrow movement and key release')
        inspect(page, -8, 8)
        move(page, 'w', 'z', -1, .2)
        origin = state(page)['position']
        page.keyboard.press('Space')
        page.wait_for_function('window.nebeljagdTestState().rollCooldown > 0')
        page.wait_for_function('window.nebeljagdTestState().rollRemaining === 0')
        rolled = state(page)['position']
        assert abs(rolled['z'] - origin['z']) > 2.5, (origin, rolled)
        passed('Space executes a moving roll and activates cooldown')

        for weapon, x, z, label in [('bow', -4, 11, 'Bogen'), ('sword', -11, 6, 'Schwert')]:
            inspect(page, x, z)
            page.wait_for_function('weapon => window.nebeljagdTestState().nearWeapon === weapon', arg=weapon)
            expect(page.locator('#pickupPrompt')).to_be_visible()
            page.keyboard.press('e')
            page.wait_for_function('weapon => window.nebeljagdTestState().equippedWeapon === weapon', arg=weapon)
            expect(page.locator('#weaponName')).to_have_text(label)
            page.keyboard.press('f')
            page.wait_for_function('window.nebeljagdTestState().attackCooldown > 0')
            page.wait_for_function('window.nebeljagdTestState().attackCooldown === 0')
        passed('E picks up bow/sword, HUD updates and F triggers both attacks')

        inspect(page, -5, 5, health=50)
        page.wait_for_function('window.nebeljagdTestState().health === 75')
        inspect(page, 0, 9, health=75)
        page.wait_for_function('window.nebeljagdTestState().health === 100')
        expect(page.locator('#healthValue')).to_contain_text('100')
        before_crystals = state(page)['crystals']
        inspect(page, -10.5, 12)
        page.wait_for_function('before => window.nebeljagdTestState().crystals === before + 1', arg=before_crystals)
        passed('Hearts heal 50 → 75 → 100; crystal pickup remains functional')

        grass = state(page)['world']['grassPatches'][0]
        inspect(page, grass['x'], grass['z'])
        page.wait_for_function('window.nebeljagdTestState().hiddenInGrass && Math.abs(window.nebeljagdTestState().character.opacity - .45) < .015')
        hidden = state(page)
        assert hidden['hiddenFromOtherPlayers'] is True
        capture(page, 'village-grass.png')
        inspect(page, -8, 8)
        page.wait_for_function('!window.nebeljagdTestState().hiddenInGrass && window.nebeljagdTestState().character.opacity > .995')
        passed('Tall grass fades local character to 45%; gameplay concealment is independent and restores on exit')

        house_evidence = []
        for name, x, z, hw, hd in [(h['name'], h['x'], h['z'], h['halfWidth'], h['halfDepth']) for h in state(page)['houses']]:
            inspect(page, x, z + 2.0)
            page.wait_for_function('name => window.nebeljagdTestState().shelter === name', arg=name)
            current = state(page)
            house = next(h for h in current['houses'] if h['name'] == name)
            assert house['roofVisible'] is False, house
            assert current['position']['y'] >= .45, current['position']
            house_evidence.append({'name': name, 'floorY': current['position']['y'], 'roofVisible': False})
            if name == 'Mooswinkel':
                capture(page, 'village-interior.png')
        # Walk across each actual bedroom threshold from the living-room side.
        for x in [-17, -9]:
            inspect(page, x, -4.3)
            move(page, 'w', 'z', -1, 3.0)
            current = state(page)
            assert current['shelter'] == 'Mooswinkel' and current['position']['z'] < -7.0, current
            assert current['position']['y'] >= .45
        inspect(page, -13, 4.0)
        page.wait_for_function('window.nebeljagdTestState().shelter === null')
        assert all(h['roofVisible'] for h in state(page)['houses'])
        passed('All three houses reveal roofs and elevated floors; both Mooswinkel bedroom thresholds are walkable', house_evidence)

        inspect(page, -34, 0, health=100)
        page.wait_for_function('window.nebeljagdTestState().zone.inDanger && window.nebeljagdTestState().health < 98')
        capture(page, 'village-danger.png')
        inspect(page, -8, 8, health=83)
        page.wait_for_function('!window.nebeljagdTestState().zone.inDanger')
        safe_health = state(page)['health']
        wait_simulation(page, .25)
        assert state(page)['health'] == safe_health
        passed('Fog outside safe radius damages health; returning to safe area stops damage')

        inspect(page, 5.7, 5.5)
        move(page, 'd', 'x', 1, 5.0)
        assert abs(state(page)['position']['y'] - .28) < .03
        capture(page, 'village-bridge.png')
        move(page, 'd', 'x', 1, 6.0)
        assert state(page)['position']['x'] > 16
        inspect(page, -24.8, -6)
        move(page, 'd', 'x', 1, 2.5)
        assert state(page)['position']['x'] > -22.4
        capture(page, 'village-gate.png')
        inspect(page, -24.8, -10)
        try:
            page.keyboard.down('d')
            wait_simulation(page, .4)
        finally:
            page.keyboard.up('d')
        assert state(page)['position']['x'] <= -24.1
        passed('Bridge crosses at correct height; village gate is open while adjacent fence blocks movement')
        result['desktop_rendering'] = state(page)['rendering']
        page.close()

        context = browser.new_context(viewport={'width': 1024, 'height': 768}, is_mobile=True, has_touch=True, device_scale_factor=1)
        page = context.new_page(); page.set_default_timeout(90000); start(page)
        assert state(page)['quality'] == 'low'
        inspect(page, -8, 8)
        bounds = page.locator('#joystick').bounding_box()
        before = state(page)['position']['x']
        session = context.new_cdp_session(page)
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{
            'x': bounds['x'] + bounds['width'] * .82, 'y': bounds['y'] + bounds['height'] * .5,
        }]})
        page.wait_for_function('before => window.nebeljagdTestState().position.x > before + .7', arg=before)
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        page.wait_for_function('!window.nebeljagdTestState().moving')
        page.locator('#dashBtn').tap()
        page.wait_for_function('window.nebeljagdTestState().rollCooldown > 0')
        page.wait_for_function('window.nebeljagdTestState().rollRemaining === 0')
        inspect(page, -4, 11)
        expect(page.locator('#pickupBtn')).to_be_visible()
        page.locator('#pickupBtn').tap()
        page.wait_for_function("window.nebeljagdTestState().equippedWeapon === 'bow'")
        page.locator('#attackBtn').tap()
        page.wait_for_function('window.nebeljagdTestState().attackCooldown > 0')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        inventory = page.locator('.inventory').bounding_box(); roll = page.locator('#dashBtn').bounding_box()
        assert inventory['x'] + inventory['width'] < roll['x'] or inventory['y'] + inventory['height'] < roll['y']
        inspect(page, -8, 8)
        capture(page, 'village-tablet.png')
        passed('Tablet touch joystick, release, roll, pickup/attack buttons and responsive HUD')
        result['tablet_rendering'] = state(page)['rendering']
        context.close()

        page = browser.new_page(viewport={'width': 960, 'height': 640}); page.set_default_timeout(90000)
        requests = []
        page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
        start(page, 'nebeljagd.html')
        assert len(requests) == 1, requests
        assert state(page)['character']['skinned'] is True
        passed('Standalone HTML embeds the skinned GLB and makes no additional HTTP requests')
        page.close(); browser.close()
        assert not errors, errors
        result['status'] = 'passed'
except BaseException as error:
    result['status'] = 'interrupted' if isinstance(error, KeyboardInterrupt) else 'failed'
    result['failure'] = str(error)
    raise
finally:
    REPORT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
