"""Generated-game gravity controls and all visual phases; never edits the authored map."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4176').rstrip('/')
BASELINE = os.environ.get('NEBELJAGD_BASELINE') == '1'
OUT = ROOT / 'test-results/gravity-staff' / ('before' if BASELINE else 'after')
OUT.mkdir(parents=True, exist_ok=True)
map_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['name'] = 'Gravitationsfeld · QA'
fixture['regions'][0]['biome'] = 'desert'
fixture['objects'] = [dict(id='gravity', name='Gravitationsstab', kind='gravityStaff',
    variant='kit-tripo-gravity-staff', position=[0, -14], rotation=0, scale=1, rarity='common')]
report = {'status': 'running', 'checks': [], 'errors': [], 'baseline': BASELINE}
(OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

def passed(message):
    report['checks'].append(message)
    print('PASS', message, flush=True)

def state(page): return page.evaluate('nebeljagdTestState()')

def capture(page, name):
    data = page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]
    (OUT / (name + '.png')).write_bytes(base64.b64decode(data))
    (OUT / (name + '.json')).write_text(json.dumps(state(page), ensure_ascii=False, indent=2) + '\n')

def pause_at(page, age):
    page.evaluate('''age => {
      function frame() {
        if(nebeljagdTestState().combat.gravity.age >= age) document.querySelector('#pauseBtn').click();
        else requestAnimationFrame(frame);
      } requestAnimationFrame(frame);
    }''', age)
    page.wait_for_function('nebeljagdTestState().phase === "paused"')

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
    browser = p.chromium.launch(executable_path=executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        for touch in ([False] if BASELINE else [False, True]):
            mode = 'touch' if touch else 'mouse'
            print('START', mode, flush=True)
            options = dict(viewport={'width': 960, 'height': 720}, has_touch=touch, is_mobile=touch)
            if touch:
                options.update(device_scale_factor=2, user_agent='Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1')
            context = browser.new_context(**options)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(fixture)) + ');')
            page = context.new_page(); page.set_default_timeout(120000)
            page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            page.on('pageerror', lambda error: report['errors'].append(str(error)))
            page.on('console', lambda message: report['errors'].append(message.text) if message.type == 'error' else None)
            page.goto(BASE + '/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls > 0')
            report['build'] = page.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
            if touch:
                profile = state(page)['graphicsProfile']
                assert profile['iPad'] and profile['pixelRatio'] <= 1 and profile['quality'] == 'low', profile
            page.locator('#startBtn').click()
            page.wait_for_function('nebeljagdTestState().equippedWeapon === "gravityStaff"')
            target = next(actor for actor in state(page)['practiceActors'] if actor['id'] == 'practice-1')
            point = target['position']
            # Let the real camera settle after moving before projecting the mouse.
            page.evaluate('p => nebeljagdInspect({x:p.x-(p.touch?10:0),z:p.z-(p.touch?0:5),direction:p.touch?Math.PI/2:0})',
                {**point, 'touch': touch})
            page.evaluate('nebeljagdInspectCamera({zoom:1.05})')
            elapsed = state(page)['elapsed']
            page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=elapsed+.2)
            target = next(actor for actor in state(page)['practiceActors'] if actor['id'] == 'practice-1')
            point = target['position']
            pixel = page.evaluate('p=>nebeljagdProjectPoint(p)', point)
            before_health = target['health']
            expected_damage = state(page)['equippedItem']['damage']
            if touch:
                attack = page.locator('#attackBtn').bounding_box()
                ax, ay = attack['x'] + attack['width']/2, attack['y'] + attack['height']/2
                joy = page.locator('#joystick').bounding_box()
                jx, jy = joy['x'] + joy['width']/2, joy['y'] + joy['height']/2
                cdp = context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':ax,'y':ay,'id':1}]})
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[
                    {'x':ax,'y':ay,'id':1}, {'x':jx + joy['width']*.30,'y':jy,'id':2}]})
            else:
                page.mouse.move(pixel['x'], pixel['y']); page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.gravity.aiming')
            if not BASELINE:
                page.wait_for_function('nebeljagdTestState().combat.gravity.aimRange.heldSeconds >= 1.5')
                g = state(page)['combat']['gravity']
                assert abs(g['aimRange']['radius'] - 10*min(1, g['aimRange']['heldSeconds']/3)) < 1e-6, g
                assert state(page)['combat']['shotsFired'] == 0 and not g['active'], g
                page.wait_for_function('nebeljagdTestState().combat.gravity.aimRange.radius === 10')
                assert state(page)['combat']['gravity']['radius'] == 3.2
                passed(mode + ': holding grows the reach to 10m in 3s, without firing')
            capture(page, mode + '-aim')
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.keyboard.up('f')
            page.wait_for_function('nebeljagdTestState().combat.gravity.active')
            if not BASELINE:
                page.evaluate('''() => { function frame() {
                  const g=nebeljagdTestState().combat.gravity;
                  if(g.flight && g.flight.age/g.flight.duration >= .35) document.querySelector('#pauseBtn').click();
                  else requestAnimationFrame(frame);
                } requestAnimationFrame(frame); }''')
                page.wait_for_function('nebeljagdTestState().phase === "paused"')
                capture(page, mode + '-flight')
                g = state(page)['combat']['gravity']
                assert g['phase'] == 'flight' and not g['landed'] and not g['visuals']['fieldVisible'], g
                assert state(page)['combat']['effects']['visibleTrailSegments'] > 0
                page.wait_for_timeout(150); assert state(page)['combat']['gravity'] == g
                passed(mode + ': curved projectile and glowing trail precede the field and freeze on pause')
                page.keyboard.press('Escape')
            pause_at(page, .08); capture(page, mode + '-impact')
            g = state(page)['combat']['gravity']
            assert not g['exploded']
            if not BASELINE:
                assert g['phase'] == 'impact' and g['arrival']['visible'] and not g['visuals']['fieldVisible'], g
            page.wait_for_timeout(150)
            assert state(page)['combat']['gravity'] == g, 'pause freezes the field and every visual phase'
            page.keyboard.press('Escape')
            if not BASELINE:
                pause_at(page, .28); capture(page, mode + '-opening')
                assert state(page)['combat']['gravity']['visuals']['fieldVisible']
                page.keyboard.press('Escape')
            pause_at(page, .9); capture(page, mode + '-pull')
            if not BASELINE:
                g = state(page)['combat']['gravity']
                assert g['visuals']['phase'] == 'pull' and g['visuals']['fieldDraws'] <= 15, g
                assert not g['exploded']
                assert any(actor['gravityResponse'] > .1 for actor in state(page)['practiceActors']), 'the actual opponent reacts physically to the pull'
            page.keyboard.press('Escape')
            pause_at(page, 1.46); capture(page, mode + '-collapse')
            assert state(page)['combat']['gravity']['exploded']
            assert state(page)['combat']['shotsFired'] == 1
            page.keyboard.press('Escape')
            page.wait_for_function('!nebeljagdTestState().combat.gravity.active')
            if not touch:
                opponent = next(actor for actor in state(page)['practiceActors'] if actor['id'] == 'practice-1')
                assert opponent['health'] == before_health - expected_damage, opponent
                passed('The generated game applies exactly one equipped-tier collapse hit to the practice opponent')
            passed(mode + ': warning, spatial pull, one collapse, pause and cleanup work')
            if not BASELINE:
                page.wait_for_function('nebeljagdTestState().attackCooldown === 0')
                if touch:
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':ax,'y':ay,'id':1}]})
                else: page.keyboard.down('f')
                page.wait_for_function('nebeljagdTestState().combat.gravity.aiming')
                if touch:
                    cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]})
                else:
                    page.keyboard.press('Escape'); page.keyboard.up('f')
                page.wait_for_function('!nebeljagdTestState().combat.gravity.aiming')
                assert not state(page)['combat']['gravity']['aiming']
                assert state(page)['combat']['shotsFired'] == 1
                passed(mode + ': cancel discards the charge without another cast')
            context.close()
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == map_hash
        report.update(status='passed', mapSha256=map_hash, browser=browser.version)
    except BaseException as error:
        report.update(status='failed', failure=str(error))
        try:
            if 'page' in locals() and not page.is_closed() and page.evaluate('typeof window.nebeljagdTestState === "function"'):
                (OUT/'failure-state.json').write_text(json.dumps(state(page), ensure_ascii=False, indent=2))
        except Exception:
            pass  # Keep the original failure if navigation or the browser itself failed.
        raise
    finally:
        browser.close()
        (OUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
