"""Real mouse/touch hold and release in generated HTML, using a small imported QA map."""
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174').rstrip('/')
OUT = ROOT / 'test-results/special-weapons'
OUT.mkdir(parents=True, exist_ok=True)
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['name'] = 'Waffensteuerung · QA'
# A bare test terrain keeps input checks independent of grass-rendering throughput.
fixture['regions'][0]['biome'] = 'desert'
fixture['objects'] = [dict(id=kind, name=kind, kind=kind, variant=variant, position=[i*5, -14], rotation=0, scale=1, rarity='common')
    for i, (kind, variant) in enumerate([('poisonStaff','kit-tripo-poison-staff'), ('moonStaff','kit-tripo-moon-staff'), ('bow','kit-tripo-ornate-bow')])]
report = {'status': 'running', 'checks': [], 'errors': []}

def passed(name):
    report['checks'].append(name)
    print('PASS', name, flush=True)

def state(page):
    return page.evaluate('nebeljagdTestState()')

def wait_sim(page, seconds):
    before = state(page)['elapsed']
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=before+seconds)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path),
        headless=True, args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        for touch in [False, True]:
            context = browser.new_context(viewport={'width':960, 'height':720}, has_touch=touch, is_mobile=touch)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1", '+json.dumps(json.dumps(fixture))+');')
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda e: (report['errors'].append(str(e)), print('BROWSER ERROR',str(e),flush=True)))
            print('START', 'touch' if touch else 'mouse', flush=True)
            page.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdProjectPoint && window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
            page.locator('#startBtn').click()
            page.evaluate('nebeljagdInspect({x:0,z:-14,direction:0})')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="poisonStaff"')
            # Holding does not fire, moving picks a visible ground target, release launches once.
            if touch:
                box = page.locator('#attackBtn').bounding_box()
                x,y = box['x']+box['width']/2, box['y']+box['height']/2
                cdp = context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
            else:
                point = page.evaluate('nebeljagdProjectPoint({x:0,z:-8})')
                page.mouse.move(point['x'],point['y']); page.mouse.down()
            page.wait_for_function('nebeljagdTestState().combat.special.aiming')
            wait_sim(page,.3)
            assert state(page)['combat']['shotsFired']==0
            before = state(page)['combat']['special']['target']
            if touch:
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x-55,'y':y-35,'id':1}]})
            else:
                point=page.evaluate('nebeljagdProjectPoint({x:2,z:-7})');page.mouse.move(point['x'],point['y'])
            page.wait_for_function('old=>Math.hypot(nebeljagdTestState().combat.special.target.x-old.x,nebeljagdTestState().combat.special.target.z-old.z)>.5',arg=before)
            page.screenshot(path=str(OUT/('touch-aim.png' if touch else 'mouse-aim.png')))
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.mouse.up()
            page.wait_for_function('nebeljagdTestState().combat.shotsFired===1 && !nebeljagdTestState().combat.special.aiming')
            page.wait_for_function('nebeljagdTestState().combat.special.clouds.length===1')
            page.screenshot(path=str(OUT/('touch-cloud.png' if touch else 'mouse-cloud.png')))
            cloud=state(page)['combat']['special']['clouds'][0]
            assert 0 < cloud['remaining'] <= 3
            wait_sim(page,3.1); assert not state(page)['combat']['special']['clouds']
            passed(('Touch' if touch else 'Mouse')+' hold, move target, release once, cloud expires after 3 seconds')
            # Cancellation must not create a projectile.
            if touch:
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
                page.wait_for_function('nebeljagdTestState().combat.special.aiming')
                cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]})
            else:
                page.keyboard.down('f');page.wait_for_function('nebeljagdTestState().combat.special.aiming');page.keyboard.press('Escape');page.keyboard.up('f')
            assert not state(page)['combat']['special']['aiming']
            assert state(page)['combat']['shotsFired']==1
            passed(('Touch cancel' if touch else 'Pause while aiming')+' cancels without a shot')
            # Actual attack button/key locks until the visible crescent returns.
            if state(page)['phase']!='playing': page.keyboard.press('Escape')
            page.evaluate('nebeljagdInspect({x:5,z:-14,direction:0})');page.keyboard.press('e')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="moonStaff"')
            if touch: page.locator('#attackBtn').tap()
            else: page.keyboard.press('f')
            page.wait_for_function('nebeljagdTestState().combat.special.moon!==null')
            page.wait_for_function('nebeljagdTestState().combat.special.moon?.mode==="returning"')
            assert state(page)['attackCooldown']>0
            page.keyboard.press('f'); assert state(page)['combat']['shotsFired']==2
            page.wait_for_function('nebeljagdTestState().combat.special.moon===null')
            passed(('Touch' if touch else 'Keyboard')+' crescent turns at range and blocks repeat attack until return')
            page.evaluate('nebeljagdInspect({x:10,z:-14,direction:0})');page.keyboard.press('e')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
            before = state(page)['combat']['shotsFired']
            if touch:
                box = page.locator('#attackBtn').bounding_box()
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}]})
            else: page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.bowDraw===1')
            wait_sim(page, .8)
            held = state(page)['combat']
            assert held['bowHolding'] and held['shotsFired']==before, held
            assert held['hands']['right']['x']>.3 and held['heldPose']['bow']['x']>.2, held['hands']
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.keyboard.up('f')
            page.wait_for_function('nebeljagdTestState().combat.arrowsFlying>0')
            assert state(page)['combat']['shotsFired']==before+1
            assert state(page)['combat']['arrowModel']['nominalLength']==1.05
            page.screenshot(path=str(OUT/('touch-arrow.png' if touch else 'mouse-arrow.png')))
            passed(('Touch' if touch else 'Keyboard')+' bow holds beside the torso and releases one enlarged 3D arrow only on release')
            context.close()
        assert not report['errors'], report['errors']
        report['status']='passed'
    except BaseException as error:
        report['status']='failed'; report['failure']=str(error)
        raise
    finally:
        browser.close(); (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
