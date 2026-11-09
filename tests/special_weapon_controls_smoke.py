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
        modes = [False] if os.environ.get('NEBELJAGD_MOUSE_ONLY') == '1' else ([True] if os.environ.get('NEBELJAGD_TOUCH_ONLY') == '1' else [False, True])
        for touch in modes:
            context = browser.new_context(viewport={'width':960, 'height':720}, has_touch=touch, is_mobile=touch)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1", '+json.dumps(json.dumps(fixture))+');')
            context.add_init_script("window.mouseMoves=0;window.addEventListener('pointermove',e=>{if(e.pointerType!=='touch')window.mouseMoves++;});")
            page = context.new_page(); page.set_default_timeout(120000)
            page.on('pageerror', lambda e: (report['errors'].append(str(e)), print('BROWSER ERROR',str(e),flush=True)))
            print('START', 'touch' if touch else 'mouse', flush=True)
            page.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdProjectPoint && window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
            if touch: page.locator('#startBtn').click()
            else:
                button=page.locator('#startBtn').bounding_box();start_x=button['x']+button['width']/2;start_y=button['y']+button['height']/2
                clicks=context.new_cdp_session(page)
                for event in ['mousePressed','mouseReleased']:
                    clicks.send('Input.dispatchMouseEvent',{'type':event,'x':start_x,'y':start_y,'button':'left','clickCount':1})
            page.evaluate('nebeljagdInspect({x:0,z:-14,direction:0})')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="poisonStaff"')
            if not touch:
                assert page.evaluate('window.mouseMoves')==0,'the first click supplied the cursor without a preceding move'
                page.keyboard.down('f');page.wait_for_function('nebeljagdTestState().combat.special.aiming');wait_sim(page,.2)
                target=state(page)['combat']['special']['target'];player_pos=state(page)['position']
                pixel=page.evaluate('nebeljagdProjectPoint(nebeljagdTestState().position)')
                if abs(start_x-pixel['x'])>1: assert (target['x']-player_pos['x'])*(start_x-pixel['x'])>0,target
                page.keyboard.press('Escape');page.keyboard.up('f');page.keyboard.press('Escape')
                passed('The first click establishes the mouse aim even without a single mousemove after loading')
            # Record the initial frames: F must use the existing mouse heading
            # before any subsequent mouse movement; charge starts at the player.
            page.evaluate("""() => {window.aimSamples=[];window.recordAim=true;
              function sample(){if(!window.recordAim)return;const s=nebeljagdTestState(),a=s.combat.special;
                if(a.aiming)window.aimSamples.push({range:a.aimRange.radius,target:a.target,player:s.position});
                requestAnimationFrame(sample);}requestAnimationFrame(sample);} """)
            if touch:
                box = page.locator('#attackBtn').bounding_box()
                x,y = box['x']+box['width']/2, box['y']+box['height']/2
                cdp = context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
            else:
                point = page.evaluate('nebeljagdProjectPoint({x:-10,y:nebeljagdTestState().position.y,z:-14})')
                page.mouse.move(point['x'],point['y']); page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.special.aiming')
            wait_sim(page,.3)
            assert state(page)['combat']['shotsFired']==0
            before = state(page)['combat']['special']['target']
            first=page.evaluate('window.aimSamples[0]')
            assert first['range']<1.1, first
            assert state(page)['combat']['special']['aimRange']['radius']<9
            if not touch:
                assert before['x']<-.5 and abs(before['z']+14)<.2, before
                passed('F starts along the existing mouse position without any new mouse movement or fixed forward snap')
            if touch:
                joy=page.locator('#joystick').bounding_box()
                cx,cy=joy['x']+joy['width']/2,joy['y']+joy['height']/2
                radius=joy['width']*.32
                player_before=state(page)['position']
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1},{'x':cx+radius*.25,'y':cy,'id':2}]})
                page.wait_for_function('nebeljagdTestState().combat.special.target.x>nebeljagdTestState().position.x+.5')
                near=state(page)['combat']['special']
                assert near['aimRange']['radius']<12
                assert abs(near['target']['x']-player_before['x']-near['aimRange']['radius'])<.2
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y,'id':1},{'x':cx+radius,'y':cy,'id':2}]})
                page.wait_for_function('Math.abs(nebeljagdTestState().combat.special.target.x-nebeljagdTestState().position.x-12)<.2')
                # Small motion of the holding finger must not reset the left-thumb target.
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x+3,'y':y+2,'id':1},{'x':cx+radius,'y':cy,'id':2}]})
                wait_sim(page,.3)
                assert abs(state(page)['combat']['special']['target']['x']-state(page)['position']['x']-12)<.2
                assert abs(state(page)['position']['x']-player_before['x'])<.05
                passed('Holding grows range to 12m; the left stick only redirects, and holding-finger jitter cannot reset the target')
            else:
                point=page.evaluate('nebeljagdProjectPoint({x:2,z:-7})');page.mouse.move(point['x'],point['y'])
            page.wait_for_function('old=>Math.hypot(nebeljagdTestState().combat.special.target.x-old.x,nebeljagdTestState().combat.special.target.z-old.z)>.5',arg=before)
            page.wait_for_function('nebeljagdTestState().combat.special.aimRange?.radius===12')
            samples=page.evaluate('window.recordAim=false;window.aimSamples')
            assert all(a['range']<=b['range']+1e-6 for a,b in zip(samples,samples[1:])),samples
            assert any(1<s['range']<5 for s in samples) and any(5<s['range']<10 for s in samples)
            (OUT/('touch-charge.json' if touch else 'mouse-charge.json')).write_text(json.dumps(samples,indent=2))
            page.screenshot(path=str(OUT/('touch-aim.png' if touch else 'mouse-aim.png')))
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.keyboard.up('f')
            page.wait_for_function('nebeljagdTestState().combat.shotsFired===1 && !nebeljagdTestState().combat.special.aiming')
            page.wait_for_function('nebeljagdTestState().combat.special.clouds.length===1')
            page.screenshot(path=str(OUT/('touch-cloud.png' if touch else 'mouse-cloud.png')))
            cloud=state(page)['combat']['special']['clouds'][0]
            assert 0 < cloud['remaining'] <= 3
            wait_sim(page,3.1); assert not state(page)['combat']['special']['clouds']
            passed(('Touch' if touch else 'Mouse')+' hold, move target, release once, cloud expires after 3 seconds')
            # Cancellation must not create a projectile.
            if touch:
                # While moving, aiming changes the target but preserves travel direction.
                left={'x':cx+radius*.3,'y':cy,'id':2}
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[left]})
                page.wait_for_function('nebeljagdTestState().moving')
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[left,{'x':x,'y':y,'id':1}]})
                page.wait_for_function('nebeljagdTestState().combat.special.aiming')
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':cx,'y':cy-radius*.5,'id':2},{'x':x,'y':y,'id':1}]})
                page.wait_for_function('nebeljagdTestState().combat.special.target.z<nebeljagdTestState().position.z-.5')
                movement_start=state(page)['position']
                wait_sim(page,.25)
                movement_end=state(page)['position']
                assert movement_end['x']>movement_start['x']+.05
                assert abs(movement_end['z']-movement_start['z'])<.05
                passed('Moving touch aim retains travel direction while the other thumb redirects the target')
                cdp.send('Input.dispatchTouchEvent', {'type':'touchCancel','touchPoints':[]})
            else:
                point=page.evaluate('nebeljagdProjectPoint({x:8,y:nebeljagdTestState().position.y,z:-14})')
                page.mouse.move(point['x'],point['y']);page.mouse.down()
                page.wait_for_function('nebeljagdTestState().combat.special.aiming')
                wait_sim(page,.2)
                target=state(page)['combat']['special']['target']
                assert .5<target['x']<6 and abs(target['z']+14)<.2,target
                passed('Mouse press begins a fresh short charge in the clicked direction')
                page.keyboard.press('Escape');page.mouse.up()
            assert not state(page)['combat']['special']['aiming']
            assert state(page)['combat']['shotsFired']==1
            passed(('Touch cancel' if touch else 'Pause while aiming')+' cancels without a shot')
            if os.environ.get('NEBELJAGD_AIM_ONLY') == '1':
                context.close(); continue
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
            page.wait_for_function('n=>nebeljagdTestState().combat.shotsFired===n+1',arg=before)
            wait_sim(page, 1.5)
            held = state(page)['combat']
            assert not held['bowHolding'] and held['shotsFired']==before+1, held
            assert held['bowAlignment']['error']<.025 and held['heldPose']['bow']['x']<-.22, held['hands']
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.keyboard.up('f')
            assert state(page)['combat']['shotsFired']==before+1
            assert state(page)['combat']['arrowModel']['nominalLength']==1.05
            page.screenshot(path=str(OUT/('touch-arrow.png' if touch else 'mouse-arrow.png')))
            passed(('Touch' if touch else 'Keyboard')+' bow fires immediately on press, never repeats while held or on release')
            context.close()
        assert not report['errors'], report['errors']
        report['status']='passed'
    except BaseException as error:
        report['status']='failed'; report['failure']=str(error)
        raise
    finally:
        browser.close(); (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
