"""Real controls exercise visual locomotion without modifying movement rules."""
import json
import math
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4173').rstrip('/')
errors = []

def wait_sim(page, seconds):
    start = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('end => nebeljagdTestState().elapsed >= end', arg=start + seconds)

def snapshot(page):
    return page.evaluate('''() => {const s=nebeljagdTestState(); return {
      position:s.position, direction:s.direction, moving:s.moving,
      locomotion:s.character.locomotion, rollRemaining:s.rollRemaining};}''')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1100, 'height': 740})
    page.set_default_timeout(90000)
    page.route_web_socket('**/*', lambda ws: None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(BASE + '/?inspect=1&quality=low', wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
    page.locator('#startBtn').click()
    page.evaluate('nebeljagdInspect({x:30,z:-42,direction:0,health:100})')
    before = snapshot(page)
    page.keyboard.down('s')
    wait_sim(page, .55)
    running = snapshot(page)
    assert running['position']['z'] - before['position']['z'] > 2.7
    assert running['locomotion']['walkWeight'] > .97
    assert running['locomotion']['playbackSpeed'] > .95
    page.keyboard.up('s')
    page.keyboard.down('d')
    wait_sim(page, .12)
    turning = snapshot(page)
    assert 0 < turning['locomotion']['yaw'] < math.pi / 2
    assert abs(turning['locomotion']['sideLean']) > .001
    wait_sim(page, .28)
    settled = snapshot(page)
    assert abs(settled['locomotion']['yaw'] - math.pi / 2) < .04
    page.keyboard.up('d')
    wait_sim(page, .1)
    fading = snapshot(page)
    assert 0 < fading['locomotion']['walkWeight'] < .7
    wait_sim(page, .6)
    stopped = snapshot(page)
    assert stopped['locomotion']['walkWeight'] == 0
    assert abs(stopped['locomotion']['sideLean']) < .001
    page.keyboard.press('Space')
    page.wait_for_function('nebeljagdTestState().rollRemaining > .1')
    rolled = snapshot(page)
    assert rolled['rollRemaining'] > 0
    assert not errors, errors
    browser.close()
report = {'status': 'passed', 'url': BASE, 'errors': errors,
    'checks': {'start': before, 'walk': running, 'turn': turning, 'turnSettled': settled,
        'stopBlend': fading, 'idle': stopped, 'existingRollPreserved': rolled}}
(ROOT / 'docs/polish-motion-check.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
