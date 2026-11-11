"""Actual editor placement, uploaded staff and lightning shader on mouse/touch."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4176').rstrip('/')
OUT = ROOT / 'test-results/lightning-staff'; OUT.mkdir(parents=True, exist_ok=True)
original = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['regions'][0]['biome'] = 'desert'
fixture['objects'] = [dict(id='lightning', name='Blitzstab', kind='lightningStaff',
    variant='kit-tripo-lightning-staff', position=[0, -14], rotation=0, scale=1, rarity='common')]
report = dict(status='running', checks=[], errors=[])
def passed(message):
    print('PASS', message, flush=True); report['checks'].append(message)
def state(page): return page.evaluate('nebeljagdTestState()')
def monitor(page):
    page.set_default_timeout(180000)
    page.add_init_script("window.addEventListener('error',e=>window.__lightningError=e.error?.stack||e.message)")
    page.route('**/favicon.ico', lambda r: r.fulfill(status=204))
    page.on('pageerror', lambda e: report['errors'].append(e.stack or str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
def capture(page, name):
    (OUT / (name + '.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    (OUT / (name + '.json')).write_text(json.dumps(state(page), ensure_ascii=False, indent=2))
def pause_when(page, expression):
    page.evaluate('''expression => {function check(){
      if(Function('return '+expression)())document.querySelector('#pauseBtn').click();
      else requestAnimationFrame(check);
    }requestAnimationFrame(check);}''', expression)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or pw.chromium.executable_path,
        headless=True, args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport=dict(width=1100, height=800))
        editor = context.new_page(); monitor(editor)
        print('START generated editor', flush=True)
        editor.goto(URL + '/map-editor.html', wait_until='domcontentloaded')
        print('STAGE editor loaded', flush=True)
        editor.wait_for_function('window.nebeljagdMapTestState')
        print('STAGE editor ready', flush=True)
        before = editor.evaluate('nebeljagdMapTestState().map')
        editor.locator('[data-editor-action="objects"]').click()
        print('STAGE object palette', flush=True)
        editor.locator('#palette-kind').select_option('lightningStaff')
        editor.locator('#palette-variant').select_option('kit-tripo-lightning-staff')
        editor.locator('#palette-rarity').select_option('common'); editor.locator('#add-object-center').click()
        after = editor.evaluate('nebeljagdMapTestState().map')
        assert after['objects'][:-1] == before['objects']
        assert after['objects'][-1]['kind'] == 'lightningStaff' and after['objects'][-1]['rarity'] == 'common'
        editor.screenshot(path=str(OUT / 'editor.png'))
        passed('Generated editor places the new staff and preserves existing objects'); context.close()
        for touch in [False, True]:
            mode = 'touch' if touch else 'mouse'; print('START', mode, flush=True)
            options = dict(viewport=dict(width=960, height=720), has_touch=touch, is_mobile=touch)
            if touch: options['user_agent'] = 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1'
            context = browser.new_context(**options)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(fixture)) + ');')
            page = context.new_page(); monitor(page)
            page.goto(URL + '/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
            print('STAGE', mode, 'game loaded', flush=True)
            page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            report['build'] = page.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
            page.locator('#startBtn').click()
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="lightningStaff"')
            held = state(page)['combat']['heldModel']
            assert held['model'] == 'tripo' and held['source'] == 'assets/inbox/fantasy thunder staff 3d model.glb', held
            if touch: assert state(page)['graphicsProfile']['iPad']
            expected = state(page)['equippedItem']['damage']
            page.evaluate('''()=>{const a=nebeljagdTestState().practiceActors.find(a=>a.id==='practice-2');
              nebeljagdInspect({x:a.position.x,z:a.position.z-9,direction:0});}''')
            pause_when(page, 'nebeljagdTestState().combat.effects.lightningProjectiles>0')
            if touch: page.locator('#attackBtn').tap()
            else: page.keyboard.press('f')
            print('STAGE', mode, 'fired', flush=True)
            page.wait_for_function('window.__lightningError || nebeljagdTestState().phase==="paused"')
            assert not page.evaluate('window.__lightningError'), report['errors']
            before = state(page); capture(page, mode + '-flight')
            assert before['combat']['effects']['lightningStyle'] == 'forked-arc-ribbons'
            page.wait_for_timeout(200); assert state(page)['combat']['spells'] == before['combat']['spells']
            passed(mode + ': uploaded staff and branching projectile render; pause freezes flight')
            pause_when(page, '(nebeljagdTestState().combat.effects.emitted.lightningStaff?.impacts||0)>0')
            page.keyboard.press('Escape'); page.wait_for_function('nebeljagdTestState().phase==="paused"')
            current = state(page); capture(page, mode + '-impact')
            assert current['combat']['damageHits'] == 1 and current['combat']['lastDamage']['damage'] == expected, current['combat']['lastDamage']
            assert current['combat']['lastDamage']['targetId'] == 'practice-2'
            assert current['combat']['effects']['activeSmoke'] == 0
            assert current['combat']['effects']['emitted']['lightningStaff']['impacts'] == 1
            passed(mode + ': electric hit applies equipped damage exactly once')
            pause_when(page, 'nebeljagdTestState().elapsed>=' + str(current['elapsed'] + .12))
            page.keyboard.press('Escape'); page.wait_for_function('nebeljagdTestState().phase==="paused"')
            page.evaluate('nebeljagdInspectCamera({zoom:2.2,focus:nebeljagdTestState().combat.effects.latestImpact.point})')
            capture(page, mode + '-pulse')
            assert state(page)['combat']['effects']['activeBursts'] > 0
            page.keyboard.press('Escape')
            page.wait_for_function('nebeljagdTestState().combat.effects.activeBursts===0 && nebeljagdTestState().combat.effects.activeParticles===0')
            page.keyboard.press('Escape'); capture(page, mode + '-clear')
            page.locator('#restartBtn').click(); page.wait_for_function('nebeljagdTestState().phase==="playing"')
            assert state(page)['combat']['effects']['lightningProjectiles'] == 0
            passed(mode + ': impact fades and restart clears the pooled effect'); context.close()
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == original
        report.update(status='passed', mapSha256=original, browser=browser.version)
    except BaseException as error:
        report.update(status='failed', failure=str(error))
        try:
            report['lastState'] = state(page)
            capture(page, 'failure')
        except Exception:
            pass
        raise
    finally:
        browser.close(); (OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
