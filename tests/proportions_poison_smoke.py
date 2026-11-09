"""Inspect real generated models, poison flight/cloud, reset and shader compilation.

Use NEBELJAGD_BASELINE=1 before rebuilding to capture the previous presentation.
The temporary document never changes the authored project map.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174/welt').rstrip('/')
BASELINE = os.environ.get('NEBELJAGD_BASELINE') == '1'
OUT = ROOT / 'test-results/proportions-poison' / ('before' if BASELINE else 'after')
OUT.mkdir(parents=True, exist_ok=True)
map_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['name'] = 'Proportionen und Gift · QA'
fixture['objects'] = [dict(id=kind, name=kind, kind=kind, variant=variant, position=[x,z], rotation=0, scale=1, **({'rarity':'common'} if 'Staff' in kind or kind in ['sword','bow'] else {}))
    for kind,variant,x,z in [
        ('wagon','kit-tripo-wagon',-3.5,-18.5), ('barrel','kit-tripo-barrel',2,-18),
        ('well','kit-tripo-well',5,-13.5), ('rock','kit-tripo-01',-4,-13.5),
        ('chest','kit-tripo-chest',-2,-9), ('poisonStaff','kit-tripo-poison-staff',0,-14),
        ('sword','kit-tripo-sword',3,-9), ('bow','kit-tripo-ornate-bow',5,-9)]]
report = {'status':'running', 'checks':[], 'errors':[], 'baseline':BASELINE}
def state(page): return page.evaluate('nebeljagdTestState()')
def passed(name): report['checks'].append(name); print('PASS', name, flush=True)
def capture(page, name):
    (OUT / (name+'.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
    (OUT / (name+'.json')).write_text(json.dumps(state(page), ensure_ascii=False, indent=2)+'\n')
def pause_when(page, expression):
    page.evaluate('''expression => { const predicate = new Function('s', 'return '+expression);
      function sample() {if(predicate(nebeljagdTestState())) document.querySelector('#pauseBtn').click();
        else requestAnimationFrame(sample);} requestAnimationFrame(sample); }''', expression)
    page.wait_for_function('nebeljagdTestState().phase==="paused"')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True,
        args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport={'width':1200,'height':900})
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
        page = context.new_page(); page.set_default_timeout(120000)
        page.route('**/favicon.ico', lambda r:r.fulfill(status=204))
        page.on('pageerror', lambda e:report['errors'].append(str(e)))
        page.on('console', lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        page.locator('#startBtn').click()
        page.wait_for_function('nebeljagdTestState().equippedWeapon==="poisonStaff"')
        page.evaluate('nebeljagdInspectCamera({zoom:1.6})')
        page.locator('#pauseBtn').click(); capture(page,'proportions')
        if not BASELINE: assert state(page)['combat']['heldModel']['presentationScale']==.82*.88
        passed('Actual props and held imported staff render together at the gameplay camera')
        page.keyboard.press('Escape')
        point = page.evaluate('nebeljagdProjectPoint({x:0,z:-18.5})')
        page.mouse.move(point['x'],point['y']); page.mouse.down()
        page.wait_for_function('nebeljagdTestState().combat.special.aiming')
        release_time = state(page)['elapsed']
        page.mouse.up()
        pause_when(page, f's.combat.special.poisonProjectiles>0 && s.elapsed>{release_time+.12}')
        capture(page,'poison-flight')
        before = state(page)['combat']['special']; page.wait_for_timeout(100)
        assert state(page)['combat']['special']==before
        passed('Real mouse hold/release launches poison, and pause freezes its visuals and flight')
        page.keyboard.press('Escape')
        pause_when(page, 's.combat.special.clouds.some(c=>c.remaining<2.96)')
        capture(page,'poison-impact')
        page.keyboard.press('Escape')
        pause_when(page, 's.combat.special.clouds.some(c=>c.remaining<2.84)')
        capture(page,'poison-puff')
        page.keyboard.press('Escape')
        pause_when(page, 's.combat.special.clouds.some(c=>c.remaining<2.35)')
        capture(page,'poison-cloud')
        if not BASELINE:
            visual=state(page)['combat']['special']['visuals']
            assert visual['activeClouds']==1 and visual['cloudDraws']==1
            assert visual['volumeSteps']==16
        passed('Impact creates one continuous smoke volume inside the existing damage radius')
        page.keyboard.press('Escape')
        page.wait_for_function('!nebeljagdTestState().combat.special.clouds.length')
        passed('Cloud and associated visuals expire after the existing three-second lifetime')
        page.locator('#pauseBtn').click(); page.locator('#restartBtn').click()
        page.wait_for_function('nebeljagdTestState().phase==="playing"')
        assert not state(page)['combat']['special']['clouds']
        assert state(page)['combat']['special']['poisonProjectiles']==0
        passed('Restart removes active poison visuals')
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==map_hash
        report.update(status='passed', mapHash=map_hash, browser=browser.version)
    except BaseException as error:
        report.update(status='failed', failure=str(error)); raise
    finally:
        browser.close(); (OUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
