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
            target = next(a for a in state(page)['practiceActors'] if a['id'] == 'practice-2')
            center = dict(target['position'])
            page.evaluate('p=>nebeljagdInspect({x:p.x-(p.touch?20:5),z:p.z,direction:Math.PI/2})', {**center, 'touch': touch})
            elapsed = state(page)['elapsed']
            page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=elapsed+.2)
            if touch:
                attack = page.locator('#attackBtn').bounding_box()
                ax, ay = attack['x']+attack['width']/2, attack['y']+attack['height']/2
                joy = page.locator('#joystick').bounding_box()
                jx, jy = joy['x']+joy['width']/2, joy['y']+joy['height']/2
                cdp = context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':ax,'y':ay,'id':1}]})
                cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[
                    {'x':ax,'y':ay,'id':1}, {'x':jx+joy['width']*.3,'y':jy,'id':2}]})
            else:
                pixel = page.evaluate('p=>nebeljagdProjectPoint(p)', center)
                page.mouse.move(pixel['x'], pixel['y']); page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.storm.aimRange?.radius===20')
            charged = state(page)['combat']['storm']
            assert charged['aimRange']['heldSeconds'] >= 3 and charged['radius'] == 4.8
            assert state(page)['combat']['shotsFired'] == 0 and not charged['active']
            capture(page, mode+'-aim')
            passed(mode+': hold grows the plain target reach to 20m in 3s without firing')
            pause_when(page, 'nebeljagdTestState().combat.storm.age>=.3')
            if touch: cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            else: page.keyboard.up('f')
            if touch:
                page.evaluate('()=>{const p=nebeljagdTestState().combat.storm.center;nebeljagdInspect({x:p.x-5,z:p.z-4});}')
            page.wait_for_function('window.__lightningError || nebeljagdTestState().phase==="paused"')
            assert not page.evaluate('window.__lightningError'), report['errors']
            capture(page, mode+'-cloud-forming')
            pause_when(page, 'nebeljagdTestState().combat.storm.hits>0 && nebeljagdTestState().combat.storm.visuals.bolts>0')
            page.keyboard.press('Escape')
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            current = state(page); cloud = current['combat']['storm']
            assert cloud['visuals']['style'] == 'compact-storm-eye' and cloud['visuals']['visible']
            assert 2.2 <= cloud['visuals']['cloudRadius'] <= 2.5 < cloud['radius']*.55
            assert cloud['visuals']['bolts'] >= 6, cloud
            assert cloud['visuals']['cloudShape'] == 'reference-thunderhead'
            assert cloud['visuals']['artwork'] == 'thunder-reference-v1'
            assert cloud['visuals']['boltStyle'] == 'hierarchical-thunderbolts'
            assert cloud['visuals']['draws'] <= 8 and cloud['visuals']['impacts'] > 0
            assert current['combat']['shotsFired'] == 1 and current['combat']['effects']['lightningProjectiles'] == 0
            victim = next(a for a in current['practiceActors'] if a['id'] == 'practice-2')
            assert victim['stunRemaining'] > .2 and victim['speedMultiplier'] == 0 and not victim['canAct'], victim
            assert abs(victim['maxHealth']-victim['health']-expected/5) < .001
            capture(page, mode+'-storm-wide')
            page.evaluate('p=>nebeljagdInspectCamera({zoom:1.7,focus:p})', cloud['center'])
            capture(page, mode+'-storm')
            page.wait_for_timeout(200); assert state(page)['combat']['storm'] == cloud
            passed(mode+': compact cloud, area and lightning render; the real victim is stunned; pause freezes the field')
            # Inspect a follow-up discharge as well as the first peak.
            # Simulation frames can be 100ms, so wait for an actual bright
            # burst rather than accidentally pausing inside its dark gap.
            if touch:
                pause_when(page, 'nebeljagdTestState().elapsed>='+str(current['elapsed']+.12))
            else:
                pause_when(page, '(()=>{const s=nebeljagdTestState().combat.storm;return s.age>=.78 && s.age<1 && s.visuals.bolts>0;})()')
            page.keyboard.press('Escape'); page.wait_for_function('nebeljagdTestState().phase==="paused"')
            frozen = next(a for a in state(page)['practiceActors'] if a['id']=='practice-2')
            assert abs(frozen['travelled']-victim['travelled']) < .00001, frozen
            passed(mode+': stun physically stops patrol movement')
            if not touch:
                follow = state(page)['combat']['storm']
                assert follow['pulses'] == 1 and follow['visuals']['bolts'] > 0, follow
                assert follow['visuals']['visible'] and follow['visuals']['impacts'] > 0, follow
                page.evaluate('p=>nebeljagdInspectCamera({zoom:1.7,focus:p})', cloud['center'])
                capture(page, 'mouse-storm-follow-through')
                pause_when(page, 'nebeljagdTestState().combat.storm.age>=1.05')
                page.keyboard.press('Escape')
                page.wait_for_function('nebeljagdTestState().phase==="paused"')
                between = state(page)['combat']['storm']
                assert between['active'] and between['visuals']['visible'], between
                assert between['pulses'] == 1 and between['visuals']['bolts'] == 0, between
                still_victim = next(a for a in state(page)['practiceActors'] if a['id']=='practice-2')
                assert abs(still_victim['health']-victim['health']) < .001
                page.evaluate('p=>nebeljagdInspectCamera({zoom:1.7,focus:p})', cloud['center'])
                capture(page, 'mouse-storm-between-strikes')
                passed('mouse: follow-up discharge stays visible, then clears before the next damage wave')
            page.keyboard.press('Escape')
            page.wait_for_function('!nebeljagdTestState().combat.storm.active')
            finished = state(page)
            victim = next(a for a in finished['practiceActors'] if a['id']=='practice-2')
            assert finished['combat']['storm']['pulses'] == 5
            assert abs(victim['maxHealth']-victim['health']-expected) < .001, victim
            assert victim['stunRemaining'] == 0 and victim['speedMultiplier'] == 1
            assert finished['combat']['storm']['visuals']['bolts'] == 0
            page.keyboard.press('Escape'); capture(page, mode+'-clear')
            page.locator('#restartBtn').click(); page.wait_for_function('nebeljagdTestState().phase==="playing"')
            assert not state(page)['combat']['storm']['active']
            passed(mode+': five strikes share the equipped damage; stun expires and the entire field clears'); context.close()
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
