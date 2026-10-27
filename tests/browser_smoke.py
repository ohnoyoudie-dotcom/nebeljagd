"""Functional checks with installed Python Playwright and system Chromium."""
import json
import math
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173')
OUT = Path('test-results')
OUT.mkdir(exist_ok=True)


def state(page):
    return page.evaluate('window.nebeljagdTestState()')


def start(page, url=URL):
    page.goto(url)
    page.wait_for_function('window.nebeljagdTestState && window.nebeljagdTestState().rendering.calls > 0')
    expect(page.locator('#startBtn')).to_be_enabled()
    page.locator('#startBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")


def travel(page, x, z, timeout=16):
    """Drive the actual keyboard controls toward a walkable waypoint."""
    held = set()
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            current = state(page)
            assert current['phase'] == 'playing', current
            dx, dz = x - current['position']['x'], z - current['position']['z']
            if math.hypot(dx, dz) < 0.65:
                return
            wanted = set()
            if abs(dx) > 0.25:
                wanted.add('d' if dx > 0 else 'a')
            if abs(dz) > 0.25:
                wanted.add('s' if dz > 0 else 'w')
            for key in held - wanted:
                page.keyboard.up(key)
            for key in wanted - held:
                page.keyboard.down(key)
            held = wanted
            page.wait_for_timeout(100)
        raise AssertionError(f'Could not reach {(x, z)}: {state(page)}')
    finally:
        for key in held:
            page.keyboard.up(key)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    class CheckLog(list):
        def append(self, item):
            super().append(item)
            print('PASS:', item, flush=True)
    errors, checks = [], CheckLog()
    def monitor(page):
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)

    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
    page.set_default_timeout(20000)
    monitor(page)
    start(page)
    assert state(page)['renderer'] == 'three-webgl2'
    checks.append('Production WebGL2 game starts and renders')
    for key, axis, sign in [('w', 'z', -1), ('s', 'z', 1), ('a', 'x', -1), ('d', 'x', 1),
                             ('ArrowUp', 'z', -1), ('ArrowDown', 'z', 1),
                             ('ArrowLeft', 'x', -1), ('ArrowRight', 'x', 1)]:
        before = state(page)['position'][axis]
        page.keyboard.down(key)
        page.wait_for_function("arg => (window.nebeljagdTestState().position[arg.axis] - arg.before) * arg.sign > .5",
                               arg={'axis': axis, 'before': before, 'sign': sign})
        page.keyboard.up(key)
        page.wait_for_function('!window.nebeljagdTestState().moving')
    checks.append('All WASD/arrow directions and release stop correctly')
    page.keyboard.press('Space')
    page.wait_for_function('window.nebeljagdTestState().rollCooldown > 0')
    checks.append('Roll moves the player and activates cooldown')
    page.keyboard.press('Escape')
    expect(page.locator('#pauseScreen')).to_be_visible()
    paused = state(page)['elapsed']
    page.wait_for_timeout(300)
    assert state(page)['elapsed'] == paused
    page.locator('#qualityMode').select_option('low')
    assert state(page)['quality'] == 'low'
    page.locator('#restartBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")
    assert state(page)['health'] == 72
    checks.append('Pause freezes simulation, quality changes, restart resets health')
    travel(page, -5, 5)
    page.wait_for_function('window.nebeljagdTestState().health === 97')
    expect(page.locator('#healthValue')).to_contain_text('97')
    travel(page, 0, 9)
    page.wait_for_function('window.nebeljagdTestState().health === 100')
    checks.append('Two hearts heal 72 → 97 → 100 and update life bar')
    travel(page, -8, 8)
    travel(page, -10.5, 12)
    page.wait_for_function('window.nebeljagdTestState().crystals === 1')
    checks.append('Crystal collected by proximity')
    travel(page, -8, 8)
    for waypoint in [(4, 7), (6, 5.5), (17, 5.5), (22, 3), (32, -8), (34, -9)]:
        travel(page, *waypoint)
    page.wait_for_function('window.nebeljagdTestState().zone.inDanger')
    page.wait_for_function('window.nebeljagdTestState().health < 95')
    page.screenshot(path=str(OUT / 'danger.png'))
    checks.append('Bridge can be crossed; leaving safe zone causes visible damage')
    page.wait_for_function("window.nebeljagdTestState().phase === 'dead'", timeout=30000)
    expect(page.locator('#deathScreen')).to_be_visible()
    page.locator('#retryBtn').click()
    page.wait_for_function("window.nebeljagdTestState().phase === 'playing'")
    assert state(page)['health'] == 72
    assert not any(item['collected'] for item in state(page)['pickups'])
    checks.append('Death and retry restore player, zone and pickups')
    page.screenshot(path=str(OUT / 'desktop.png'))
    desktop_stats = state(page)['rendering']
    page.close()

    context = browser.new_context(viewport={'width': 1024, 'height': 768}, is_mobile=True, has_touch=True)
    page = context.new_page()
    monitor(page)
    start(page)
    expect(page.locator('#joystick')).to_be_visible()
    bounds = page.locator('#joystick').bounding_box()
    before = state(page)['position']['x']
    session = context.new_cdp_session(page)
    session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{
        'x': bounds['x'] + bounds['width'] * .8, 'y': bounds['y'] + bounds['height'] * .5,
    }]})
    page.wait_for_function('before => window.nebeljagdTestState().position.x > before + .8', arg=before)
    session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    page.wait_for_function('!window.nebeljagdTestState().moving')
    page.locator('#dashBtn').tap()
    page.wait_for_function('window.nebeljagdTestState().rollCooldown > 0')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'tablet.png'))
    checks.append('Tablet-emulated touch joystick, release, roll and responsive layout')
    context.close()

    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    monitor(page)
    requests = []
    page.on('request', lambda request: requests.append(request.url) if request.url.startswith(('http:', 'https:')) else None)
    # Managed cloud Chromium blocks file:// by policy. Validate the same single file
    # over HTTP and ensure it makes no additional resource requests.
    standalone_url = URL.rstrip('/') + '/nebeljagd.html'
    start(page, standalone_url)
    assert requests == [standalone_url], requests
    assert state(page)['rendering']['triangles'] > 0
    checks.append('Standalone HTML runs with no additional resource requests')
    page.close()
    browser.close()
    assert not errors, errors
    result = {'status': 'passed', 'checks': checks, 'javascript_or_shader_errors': errors,
              'desktop_rendering': desktop_stats}
    (OUT / 'browser-smoke.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
