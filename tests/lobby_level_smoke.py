"""Focused level regression against a disposable, genuinely authenticated lobby.

Run only after the final welt build, and with other WebGL smoke browsers closed.
No existing server/teacher configuration is read or modified. Temporary login
material is sent to the existing fixture through stdin and never reported.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import select
import shutil
import subprocess
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt')).resolve()
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', '/tmp/nebeljagd-lobby-level-qa'))
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Real disposable classroom HTTP backend and separate teacher/student cookie sessions; local Chromium/SwiftShader, not shared multiplayer.'}
STAGE = 'setup'


def stage(name):
    global STAGE
    STAGE = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def wait_sim(page, duration):
    start = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('target=>nebeljagdTestState().elapsed>=target', arg=start + duration)


def snapshot(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState(), bar=document.querySelector('#healthBar');
      const label=document.querySelector('#playerLevel'), b=bar.getBoundingClientRect(), l=label.getBoundingClientRect();
      return {mode:s.mode, phase:s.phase, level:s.level, health:s.health, maxHealth:s.maxHealth,
        defeats:s.defeats,lastDefeat:s.lastDefeat,worldSource:s.world.source,
        overhead:s.healthBars.find(b=>b.id==='player'),
        hud:{level:label.textContent,segments:Number(bar.dataset.segments),
          maximum:bar.getAttribute('aria-valuemax'),current:bar.getAttribute('aria-valuenow'),
          width:b.width,labelRight:l.right,barLeft:b.left,fill:document.querySelector('#healthFill').style.width,
          spacing:bar.style.getPropertyValue('--health-segment-step')}};
    }''')


def assert_health(page, level, maximum, width=None):
    page.wait_for_function('v=>{const s=nebeljagdTestState();return s.level===v.level&&s.health===v.maximum&&s.maxHealth===v.maximum&&document.querySelector("#playerLevel").textContent===String(v.level)&&document.querySelector("#healthBar").getAttribute("aria-valuemax")===String(v.maximum)}',
                          arg={'level': level, 'maximum': maximum})
    state = snapshot(page)
    assert state['mode'] == 'lobby' and state['worldSource'] == 'lobby'
    assert state['hud']['level'] == str(level)
    assert state['hud']['segments'] == math.ceil(maximum / 25)
    assert state['hud']['current'] == str(maximum) and state['hud']['fill'] == '100%'
    assert state['hud']['labelRight'] <= state['hud']['barLeft']
    overhead = state['overhead']
    assert overhead['level'] == level and overhead['health'] == maximum and overhead['maxHealth'] == maximum
    assert overhead['segmentCount'] == math.ceil(maximum / 25) and overhead['visible']
    assert overhead['levelBounds']['right'] < overhead['barBounds']['left']
    if width is not None:
        assert abs(state['hud']['width'] - width['hud']) < .01
        assert abs(overhead['barWidth'] - width['world']) < 1e-6
    return state


def capture(page, name):
    path = OUT / (name + '.png')
    page.screenshot(path=str(path), mask=[page.locator('#lobbySessionLabel')])
    REPORT['screenshots'].append(str(path))


def run(url, password):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or playwright.chromium.executable_path,
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            teacher = browser.new_context()
            student = browser.new_context(viewport={'width': 1100, 'height': 760})
            stage('Real teacher login and separate student admission')
            response = teacher.request.post(url + '/api/teacher/login', data={'password': password})
            assert response.ok, 'Temporary teacher authentication failed'
            response = teacher.request.post(url + '/api/rooms', data={'name': 'Disposable level regression'})
            assert response.status == 201, 'Temporary room creation failed'
            code = response.json()['room']['code']
            response = student.request.post(url + '/api/student/join', data={'code': code})
            assert response.ok, 'Temporary student admission failed'
            assert student.request.get(url + '/api/session').json()['role'] == 'student'
            teacher_cookie = next(c['value'] for c in teacher.cookies() if c['name'] == 'nebeljagd_session')
            student_cookie = next(c['value'] for c in student.cookies() if c['name'] == 'nebeljagd_session')
            assert teacher_cookie != student_cookie
            del code, teacher_cookie, student_cookie, response
            teacher.close()
            passed('A real temporary classroom admits a separate student session without mocked authentication')

            page = student.new_page()
            page.set_default_timeout(120000)
            page.on('pageerror', lambda error: REPORT['errors'].append({'kind': 'pageerror'}))
            page.on('console', lambda message: REPORT['errors'].append({'kind': 'console-error'}) if message.type == 'error' else None)
            stage('Initial level and full practice health')
            page.goto(url + '/magebrawl.html?mode=lobby&inspect=1&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            page.locator('#startBtn').click()
            first = assert_health(page, 1, 100)
            widths = {'hud': first['hud']['width'], 'world': first['overhead']['barWidth']}
            assert first['defeats'] == 0 and first['lastDefeat'] is None
            passed('The authenticated practice lobby starts at level 1 with 100/100 HP and four segments', first)

            stage('Actual sword pickup and opponent defeat')
            page.evaluate('''() => {
              const drop=nebeljagdTestState().weaponDrops.find(d=>d.type==='sword'&&d.rarity==='legendary'&&!d.collected);
              if(!drop)throw new Error('Legendary practice sword missing');
              nebeljagdInspect({x:drop.x,z:drop.z});
            }''')
            page.wait_for_function('nebeljagdTestState().equippedItem?.type==="sword"&&nebeljagdTestState().equippedItem?.rarity==="legendary"')
            assert page.evaluate('nebeljagdTestState().equippedItem.model') == 'tripo'
            target_id = 'practice-1'
            for _ in range(5):
                if page.evaluate('id=>!nebeljagdTestState().practiceActors.find(a=>a.id===id).alive', target_id):
                    break
                page.wait_for_function('nebeljagdTestState().attackCooldown===0')
                page.evaluate('''id=>{
                  const a=nebeljagdTestState().practiceActors.find(a=>a.id===id);
                  nebeljagdInspect({x:a.position.x-1.3,z:a.position.z,direction:Math.PI/2});
                }''', target_id)
                wait_sim(page, .08)
                hits = page.evaluate('nebeljagdTestState().combat.damageHits')
                page.keyboard.press('f')
                page.wait_for_function('before=>nebeljagdTestState().combat.damageHits>before', arg=hits)
                assert page.evaluate('nebeljagdTestState().combat.lastDamage.targetId') == target_id
            assert page.evaluate('id=>!nebeljagdTestState().practiceActors.find(a=>a.id===id).alive', target_id)
            second = assert_health(page, 2, 125, widths)
            assert second['defeats'] == 1 and second['lastDefeat']['targetId'] == target_id
            assert second['lastDefeat']['sourceId'] == 'player'
            wait_sim(page, .3)
            assert_health(page, 2, 125, widths)
            capture(page, 'practice-level-2')
            passed('A real opponent defeat gives level 2 and 125/125 HP; both fixed-width bars show five segments', second)

            stage('Practice retains full upgraded health after subsequent simulation')
            page.evaluate('nebeljagdInspect({health:1})')
            wait_sim(page, .1)
            full = assert_health(page, 2, 125, widths)
            passed('The practice simulation restores the upgraded maximum rather than clamping back to 100', full)

            stage('Actual practice reset')
            page.keyboard.press('Escape')
            page.locator('#restartBtn').click()
            reset = assert_health(page, 1, 100, widths)
            assert reset['defeats'] == 0 and reset['lastDefeat'] is None
            assert page.evaluate('nebeljagdTestState().practiceActors.every(a=>a.alive&&a.health===a.maxHealth)')
            passed('Reset restores level 1, 100/100 practice health, four segments and live opponents', reset)
            assert not REPORT['errors'], 'Unexpected browser or shader error'
        finally:
            browser.close()


def main():
    server = None
    password = secrets.token_urlsafe(32)
    original_map_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
    try:
        built = (PUBLIC / 'magebrawl.html').read_bytes()
        REPORT['delivery'] = {'file': str(PUBLIC / 'magebrawl.html'), 'bytes': len(built), 'sha256': hashlib.sha256(built).hexdigest(),
                              'buildId': json.loads((PUBLIC / 'release.json').read_text()).get('buildId')}
        del built
        with tempfile.TemporaryDirectory(prefix='nebeljagd-level-lobby-') as data_dir:
            server = subprocess.Popen(['node', str(ROOT / 'tests/classroom-browser-fixture.js')], cwd=ROOT,
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
            server.stdin.write(json.dumps({'password': password, 'dataDir': data_dir, 'publicDir': str(PUBLIC), 'port': 0}))
            server.stdin.close()
            readable, _, _ = select.select([server.stdout], [], [], 30)
            assert readable, 'Temporary server startup timed out'
            ready = json.loads(server.stdout.readline())
            assert ready.get('ready'), 'Temporary server did not become ready'
            run(ready['url'], password)
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill(); server.wait()
            server = None
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == original_map_hash
        assert hashlib.sha256((PUBLIC / 'magebrawl.html').read_bytes()).hexdigest() == REPORT['delivery']['sha256']
        REPORT['sourceMapUnchanged'] = original_map_hash
        REPORT['status'] = 'passed'
    except Exception as error:
        # Exceptions from authenticated requests may contain input data. Persist
        # only the error class and known stage, never exception text or responses.
        REPORT['status'] = 'failed'
        REPORT['failure'] = {'stage': STAGE, 'errorType': type(error).__name__}
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill(); server.wait()
        (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors'],
                          'failure': REPORT.get('failure')}, ensure_ascii=False), flush=True)
    return 0 if REPORT['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
