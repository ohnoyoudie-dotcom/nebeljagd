"""Actual generated-world checks for reference grass, stone paths and raised cover.
Run against the compiled build: NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/reference_world_smoke.py
The inspection helper only positions the local avatar; movement, rolls and shots
use normal keyboard input and the generated world collision/vision systems.
"""
from pathlib import Path
import hashlib
import json
import math
import os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
checks, errors, screenshots = [], [], []
report = {'status': 'running', 'url': URL + '/nebeljagd.html', 'checks': checks,
          'errors': errors, 'screenshots': screenshots}


def state(page):
    return page.evaluate('''() => {const s=nebeljagdTestState();
      delete s.world.trees; delete s.world.projectileObstacles; return s;}''')


def wait_sim(page, seconds):
    start = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t => nebeljagdTestState().elapsed >= t', arg=start + seconds)


def inspect(page, x, z, direction=0):
    page.evaluate('p => nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction, 'health': 100})
    wait_sim(page, .15)


def walk(page, key, duration):
    try:
        page.keyboard.down(key)
        wait_sim(page, duration)
    finally:
        page.keyboard.up(key)
    wait_sim(page, .08)


def passed(name, evidence):
    checks.append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def capture(page, label):
    path = ROOT / 'docs/screenshots' / f'reference-world-{label}.png'
    page.screenshot(path=str(path)); screenshots.append(str(path.relative_to(ROOT)))


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1200, 'height': 800}, device_scale_factor=1)
        page.set_default_timeout(120000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        response = page.goto(URL + '/nebeljagd.html?inspect=1&quality=low', wait_until='domcontentloaded')
        report['served_html_sha256'] = hashlib.sha256(response.body()).hexdigest()
        page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
        expect(page.locator('#errorScreen')).to_be_hidden()
        page.locator('#startBtn').click(); wait_sim(page, .15)
        initial = state(page)
        mounds = [o for o in initial['world']['objects'] if o['kind'] == 'mound']
        assert len(mounds) == 4, mounds
        assert {o['variant'] for o in mounds} == {'ridge', 'knoll'}
        assert initial['world']['stats']['moundCount'] == 4
        passed('The actual map renders both editable raised obstacle variants with the existing world', {
            'mounds': mounds, 'stats': initial['world']['stats']})
        capture(page, 'spawn-path')

        # The new near-start knoll is deliberately clear of the existing road and loot.
        inspect(page, 34, -39)
        page.wait_for_function("nebeljagdTestState().equippedWeapon === 'bow'")
        inspect(page, 35, -34, math.pi / 2)
        walk(page, 'd', .9)
        stopped = state(page)
        assert 36 < stopped['position']['x'] < 38.1, stopped['position']
        inspect(page, 35, -34, math.pi / 2)
        page.keyboard.press('Space'); wait_sim(page, .65)
        rolled = state(page)
        assert 36 < rolled['position']['x'] < 38.1, rolled['position']
        passed('Walking and the space roll cannot climb or tunnel through the raised knoll', {
            'walkStop': stopped['position'], 'rollStop': rolled['position']})

        inspect(page, 35, -34, math.pi / 2)
        before = state(page)['combat']['impacts']
        page.keyboard.press('f')
        page.wait_for_function('n => nebeljagdTestState().combat.impacts > n', arg=before)
        impact = state(page)['combat']['lastImpact']
        assert impact['type'] == 'mound', impact
        behind_visible = page.evaluate('nebeljagdInspectVisibility({x:44,z:-34})')
        assert behind_visible is False
        passed('The visible cliff blocks actual arrows and line of sight behind it', {'impact': impact, 'behindVisible': behind_visible})
        capture(page, 'mound-cover')

        inspect(page, 35, -29, math.pi / 2)
        walk(page, 'd', 1.8)
        around = state(page)['position']
        assert around['x'] > 44, around
        passed('The surrounding open ground remains traversable around the raised obstacle', around)

        # Imported maps may place an object over a former start. The solid outer
        # footprint must expel the player, not trap it between collider strips.
        inspect(page, 41, -34, 0)
        expelled = state(page)['position']
        assert math.hypot(expelled['x'] - 41, expelled['z'] + 34) > 1.5, expelled
        wait_sim(page, .3)
        stable = state(page)['position']
        assert math.hypot(stable['x'] - expelled['x'], stable['z'] - expelled['z']) < .02
        passed('A position inside a raised object resolves to its outer edge without internal seam traps', stable)

        inspect(page, 10, -30)
        page.wait_for_function('nebeljagdTestState().hiddenInGrass')
        grass = state(page)
        patch = next(g for g in grass['world']['grassPatches'] if g['id'] == 'obj-grass-start')
        assert grass['hiddenFromOtherPlayers'] is True
        assert patch['maxBladeHeight'] >= 2.4
        passed('Restored tall cover uses the actual generated grass patch and still conceals the local avatar', {
            'patch': patch, 'rendering': grass['world']['stats']['grassRendering'], 'localOpacity': grass['character']['opacity']})
        capture(page, 'dense-grass')
        inspect(page, 31, -13)
        capture(page, 'ridge-and-path')
        browser.close()
    assert not errors, errors
    report['status'] = 'passed'
except Exception as error:
    report['status'] = 'failed'
    report['failure'] = str(error)
    raise
finally:
    (ROOT / 'docs/reference-world-check.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'checks': len(checks), 'errors': errors}, ensure_ascii=False))
