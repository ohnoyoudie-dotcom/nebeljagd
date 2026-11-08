"""Test the built classroom portal with real, separate teacher/pupil sessions.

Run `npm run build`, then `python3 tests/classroom_smoke.py`.
Starts its own loopback server on 5204 (CLASSROOM_TEST_PORT can override),
serves welt/, and removes its temporary credentials/rooms on exit. No existing
teacher configuration is read or modified. Screenshots/report: test-results/classroom/.
Requires Python Playwright and Chromium (CHROMIUM_PATH can override).
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import secrets
import select
import shutil
import subprocess
import tempfile
import time
from urllib.parse import parse_qs, urljoin, urlparse

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/classroom'
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'screenshots': []}
WEAPONS = [('sword', 'kit-tripo-sword'), ('iceStaff', 'kit-tripo-crystal-staff'),
           ('fireStaff', 'kit-tripo-lava-staff')]


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.set_default_timeout(120000)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('response', lambda response: REPORT['errors'].append(
        f'HTTP {response.status} {urlparse(response.url).path}')
        if response.status >= 500 else None)


def screenshot(page, name, mask=None, full_page=False):
    path = OUT / f'{name}.png'
    page.screenshot(path=str(path), mask=mask or [], full_page=full_page)
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def session(context, url):
    response = context.request.get(url + '/api/session')
    assert response.ok
    return response.json()


def wait_sim(page, duration):
    elapsed = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('target => nebeljagdTestState().elapsed >= target', arg=elapsed + duration)


def run(url, password):
    release = json.loads((ROOT / 'welt/release.json').read_text())
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or playwright.chromium.executable_path, headless=True,
            args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        teacher_context = browser.new_context(viewport={'width': 1400, 'height': 900})
        pupil_context = browser.new_context(viewport={'width': 960, 'height': 640})
        mobile_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        teacher = teacher_context.new_page()
        pupil = pupil_context.new_page()
        mobile = mobile_context.new_page()
        for page in (teacher, pupil, mobile):
            monitor(page)

        stage('Anonymous guards and responsive landing')
        for path in ['/teacher.html', '/map-editor.html', '/lobby.html', '/magebrawl.html', '/magebrawl.html?mode=lobby']:
            response = pupil_context.request.get(url + path, max_redirects=0)
            assert response.status == 302, (path, response.status)
            assert 'index.html' in response.headers['location']
        pupil.goto(url + '/', wait_until='domcontentloaded')
        expect(pupil.locator('#access-code')).to_be_enabled()
        assert session(pupil_context, url)['role'] is None
        screenshot(pupil, 'landing-desktop')
        mobile.goto(url + '/', wait_until='domcontentloaded')
        expect(mobile.locator('#access-code')).to_be_enabled()
        expect(mobile.locator('#teacher-tab')).to_be_visible()
        assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile page overflows horizontally'
        screenshot(mobile, 'landing-mobile', full_page=True)
        passed('Anonymous editor/lobby routes require login; landing works at 390 px and desktop')
        mobile_context.close()

        stage('Invalid code and teacher password')
        pupil.locator('#access-code').fill('AAAAAAAA')
        pupil.locator('#student-form button[type=submit]').click()
        expect(pupil.locator('#form-message')).to_be_visible()
        expect(pupil.locator('#form-message')).to_contain_text(re.compile('Code|Zugang'))
        assert session(pupil_context, url)['role'] is None
        teacher.goto(url + '/', wait_until='domcontentloaded')
        teacher.locator('#teacher-tab').click()
        expect(teacher.locator('#teacher-password')).to_be_enabled()
        teacher.locator('#teacher-password').fill('invalid-test-password')
        teacher.locator('#teacher-form button[type=submit]').click()
        expect(teacher.locator('#form-message')).to_contain_text('Passwort')
        assert session(teacher_context, url)['role'] is None
        passed('Unknown pupil code and incorrect teacher password are rejected')

        stage('Teacher creates a shared access code')
        teacher.locator('#teacher-password').fill(password)
        teacher.locator('#teacher-form button[type=submit]').click()
        teacher.wait_for_url('**/teacher.html')
        expect(teacher.locator('#teacher-content')).to_be_visible()
        assert session(teacher_context, url)['role'] == 'teacher'
        # The name is optional: the shortest teacher path must work too.
        teacher.locator('#room-name').fill('')
        teacher.locator('#room-form button[type=submit]').click()
        expect(teacher.locator('#created-room')).to_be_visible()
        code = re.sub(r'\s', '', teacher.locator('#created-code').inner_text())
        assert re.fullmatch('[A-HJ-NP-Z2-9]{8}', code)
        expect(teacher.locator('#room-list .room-item')).to_have_count(1)
        screenshot(teacher, 'teacher-dashboard', mask=[teacher.locator('#created-code'), teacher.locator('#room-list code')])
        passed('Teacher login creates an eight-character classroom code without an optional room name')

        stage('Latest generated editor and all three uploaded weapon models')
        href = teacher.locator('#latest-editor').get_attribute('href')
        editor_url = urljoin(teacher.url, href)
        assert urlparse(editor_url).path == '/map-editor.html', editor_url
        assert parse_qs(urlparse(editor_url).query)['v'] == [release['buildId']]
        assert session(teacher_context, url)['build']['id'] == release['buildId']
        response = teacher_context.request.head(editor_url)
        assert response.ok and response.headers.get('cache-control') == 'no-store'
        editor = teacher_context.new_page()
        monitor(editor)
        editor.goto(editor_url, wait_until='domcontentloaded')
        editor.wait_for_function('typeof nebeljagdMapTestState === "function"')
        editor.locator('#editor-tab-objects').click()
        for kind, variant in WEAPONS:
            editor.locator('#palette-kind').select_option(kind)
            editor.locator('#palette-variant').select_option(variant)
            expect(editor.locator('#palette-variant')).to_have_value(variant)
            expect(editor.locator('#palette-preview-image svg image')).to_have_attribute('href', re.compile(r'^data:image/webp;base64,'))
        screenshot(editor, 'latest-editor-uploaded-weapon')
        editor.close()
        passed('Teacher link opens the current uncached built editor with sword and two staff models', {'buildId': release['buildId']})

        stage('Pupil enters the practice lobby from a separate browser context')
        # Keep the real lobby redirect/auth flow, adding only the documented
        # software-rendering quality/capture switches to the final game URL.
        pupil_context.route(url + '/magebrawl.html?mode=lobby', lambda route: route.fulfill(
            status=302, headers={'location': url + '/magebrawl.html?mode=lobby&quality=low&inspect=1'}))
        pupil.locator('#access-code').fill(code.lower())
        pupil.locator('#student-form button[type=submit]').click()
        pupil.wait_for_url(re.compile(r'/magebrawl\.html\?mode=lobby'))
        pupil.wait_for_function('typeof nebeljagdTestState === "function"')
        pupil_session = session(pupil_context, url)
        assert pupil_session['role'] == 'student'
        assert pupil_session['room']['code'] == code
        teacher_cookie = next(c for c in teacher_context.cookies() if c['name'] == 'nebeljagd_session')
        pupil_cookie = next(c for c in pupil_context.cookies() if c['name'] == 'nebeljagd_session')
        assert teacher_cookie['value'] != pupil_cookie['value']
        assert pupil_cookie['httpOnly'] and pupil_cookie['sameSite'] == 'Strict'
        for path in ['/teacher.html', '/map-editor.html', '/api/rooms']:
            response = pupil_context.request.get(url + path, max_redirects=0)
            assert response.status == 403, (path, response.status)
        forbidden = pupil_context.request.post(url + '/api/rooms', data={'name': 'Forbidden'})
        assert forbidden.status == 403
        passed('Code joins a separate pupil session; pupil cannot open teacher/editor or create codes')

        stage('Green practice world, objects and working imported staff')
        pupil.bring_to_front()
        expect(pupil.locator('#startBtn')).to_contain_text('Übungswiese')
        pupil.locator('#startBtn').click()
        pupil.wait_for_function('nebeljagdTestState().phase === "playing"')
        state = pupil.evaluate('nebeljagdTestState()')
        assert state['mode'] == 'lobby' and state['world']['source'] == 'lobby'
        assert state['world']['mapId'] == 'nebeljagd-practice-lobby'
        assert state['world']['biome'] == 'meadow' and not state['world']['isWater']
        assert state['health'] == state['maxHealth']
        assert not state['zone']['inDanger'] and not state['zone']['shrinking']
        assert state['zone']['phase'] == 'practice'
        objects = state['world']['objects']
        for kind, variant in WEAPONS:
            assert any(item['kind'] == kind and item['variant'] == variant for item in objects)
            assert any(item['type'] == kind and item['variant'] == variant and item['visible']
                       for item in state['weaponDrops'])
        kinds = {item['kind'] for item in objects}
        assert {'chest', 'heart', 'barrel', 'wagon', 'well', 'rock'} <= kinds
        assert len(objects) >= 25
        # Walk with the actual game controls from the spawn to the nearby staff.
        stage('Walk to the staff, pick it up and cast with keyboard controls')
        pupil.keyboard.down('w')
        try:
            pupil.wait_for_function('nebeljagdTestState().nearWeapon === "iceStaff"', polling=50, timeout=30000)
        finally:
            pupil.keyboard.up('w')
        pupil.keyboard.press('e')
        pupil.wait_for_function('nebeljagdTestState().equippedItem?.variant === "kit-tripo-crystal-staff"', timeout=15000)
        wait_sim(pupil, .15)
        held = pupil.evaluate('nebeljagdTestState().combat.heldModel')
        assert held['model'] == 'tripo' and held['visible'] and held['variant'] == 'kit-tripo-crystal-staff'
        shots = pupil.evaluate('nebeljagdTestState().combat.shotsFired')
        pupil.keyboard.press('f')
        try:
            # Software WebGL can take several seconds per frame; the spell
            # needs .25 simulation seconds (not wall time) before release.
            pupil.wait_for_function('shots => nebeljagdTestState().combat.shotsFired > shots', arg=shots, timeout=45000)
        except Exception:
            REPORT['castDiagnostic'] = pupil.evaluate('''() => {const s=nebeljagdTestState(); return {
              phase:s.phase, elapsed:s.elapsed, position:s.position, equippedItem:s.equippedItem,
              attackCooldown:s.attackCooldown, combat:s.combat, rendering:s.rendering};}''')
            screenshot(pupil, 'cast-failure', mask=[pupil.locator('#lobbySessionLabel')])
            raise
        wait_sim(pupil, .4)
        screenshot(pupil, 'practice-meadow-equipped-staff', mask=[pupil.locator('#lobbySessionLabel')])
        # The long-running exercise remains safe after the normal game deadline.
        pupil.evaluate('nebeljagdInspect({elapsed: 3600, health: 100})')
        wait_sim(pupil, .3)
        safe = pupil.evaluate('nebeljagdTestState()')
        assert safe['phase'] == 'playing' and safe['health'] == 100
        assert not safe['zone']['inDanger'] and not safe['zone']['shrinking']
        passed('Practice meadow contains all three weapons and props; keyboard pickup/casting works without zone pressure', {'objects': len(objects), 'kinds': sorted(kinds)})

        stage('Pupil leaves and rejoins the active classroom')
        pupil.locator('#leaveLobbyBtn').click()
        pupil.wait_for_url('**/index.html')
        assert session(pupil_context, url)['role'] is None
        expect(pupil.locator('#access-code')).to_be_enabled()
        pupil.locator('#access-code').fill(code)
        pupil.locator('#student-form button[type=submit]').click()
        pupil.wait_for_url(re.compile(r'/magebrawl\.html\?mode=lobby'))
        pupil.wait_for_function('typeof nebeljagdTestState === "function"')
        assert session(pupil_context, url)['role'] == 'student'
        pupil.locator('#startBtn').click()
        pupil.wait_for_function('nebeljagdTestState().phase === "playing"')
        passed('Pupil leave button logs out and the still-active code allows a fresh login')

        stage('Restoring a cached game page resumes the session watcher')
        with pupil.expect_response(lambda response: urlparse(response.url).path == '/api/session'):
            pupil.evaluate('''() => {
              window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true}));
              window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
            }''')

        stage('Closing access revokes a running pupil session')
        start = time.monotonic()
        teacher.locator('#room-list .room-action.close').click()
        expect(teacher.locator('#room-list .room-item')).to_have_count(0)
        pupil.wait_for_url('**/index.html?reason=session-ended', timeout=30000)
        expect(pupil.locator('#access-code')).to_be_enabled()
        revoked_after = round(time.monotonic() - start, 2)
        assert session(pupil_context, url)['role'] is None
        pupil.locator('#access-code').fill(code)
        pupil.locator('#student-form button[type=submit]').click()
        expect(pupil.locator('#form-message')).to_be_visible()
        assert session(pupil_context, url)['role'] is None
        passed('Restored page keeps checking access; closing the room revokes the pupil and the old code', {'revokedAfterSeconds': revoked_after})
        teacher.locator('#logout').click()
        teacher.wait_for_url('**/index.html')
        assert session(teacher_context, url)['role'] is None
        passed('Teacher logout clears the server session')
        assert not REPORT['errors'], REPORT['errors']
        browser.close()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = None
    password = secrets.token_urlsafe(36)
    try:
        for name in ['index.html', 'teacher.html', 'lobby.html', 'map-editor.html', 'magebrawl.html', 'release.json']:
            assert (ROOT / 'welt' / name).is_file(), f'Run npm run build: welt/{name} is missing'
        with tempfile.TemporaryDirectory(prefix='nebeljagd-classroom-test-') as data_dir:
            server = subprocess.Popen(['node', 'tests/classroom-browser-fixture.js'], cwd=ROOT,
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            server.stdin.write(json.dumps({'password': password, 'dataDir': data_dir,
                                          'publicDir': str(ROOT / 'welt'),
                                          'port': int(os.environ.get('CLASSROOM_TEST_PORT', '5204'))}))
            server.stdin.close()
            ready, _, _ = select.select([server.stdout], [], [], 20)
            assert ready, 'Disposable classroom server did not become ready'
            line = server.stdout.readline()
            assert line, 'Disposable classroom server exited before readiness (check test port availability)'
            fixture = json.loads(line)
            assert fixture['ready']
            REPORT['url'] = fixture['url']
            try:
                run(fixture['url'], password)
            finally:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
                server = None
        REPORT['status'] = 'passed'
    except Exception as error:
        REPORT['status'] = 'failed'
        # Browser exceptions can embed input text; never persist the credential.
        REPORT['failure'] = str(error).replace(password, '[redacted test credential]')
        print('FAIL', REPORT['stage'] if 'stage' in REPORT else 'Setup', flush=True)
        print(REPORT['failure'], flush=True)
    finally:
        if server is not None:
            server.terminate()
            server.wait(timeout=10)
        (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    return 0 if REPORT['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
