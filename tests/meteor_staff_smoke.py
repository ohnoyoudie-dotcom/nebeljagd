"""Generated editor/game: imported staff, real input, growing arc, blast and cleanup."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4176').rstrip('/')
OUT = ROOT / 'test-results/meteor-staff'
OUT.mkdir(parents=True, exist_ok=True)
map_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['objects'] = [dict(id='meteor', name='Meteorstab', kind='meteorStaff',
    variant='kit-tripo-meteor-staff', position=[0, -14], rotation=0, scale=1, rarity='common')]
rules = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {METEOR_RULES} from './src/meteor-spell.js';console.log(JSON.stringify(METEOR_RULES))"], cwd=ROOT))
report = dict(status='running', checks=[], errors=[])

def passed(message):
    report['checks'].append(message)
    print('PASS', message, flush=True)

def state(page): return page.evaluate('nebeljagdTestState()')

def arm_pause(page, condition):
    page.evaluate('''condition=>{
      const reached=new Function('s','return '+condition);
      function frame(){if(reached(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(frame);}
      requestAnimationFrame(frame);
      if(nebeljagdTestState().phase==='paused')document.querySelector('#resumeBtn').click();
    }''', condition)

def capture(page, name):
    (OUT / (name + '.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    if state(page)['combat']['meteor']['flight']:
        detail = page.evaluate('''()=>{
          const s=nebeljagdTestState(),zoom=s.camera.zoom;
          nebeljagdInspectCamera({zoom:1.25,focus:s.combat.meteor.flight.position});
          const image=nebeljagdCaptureFrame();nebeljagdInspectCamera({zoom});return image;
        }''')
        (OUT / (name + '-detail.png')).write_bytes(base64.b64decode(detail.split(',', 1)[1]))
    (OUT / (name + '.json')).write_text(json.dumps(state(page), indent=2) + '\n')

with sync_playwright() as p:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
    browser = p.chromium.launch(executable_path=executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport=dict(width=960, height=720))
        editor = context.new_page(); editor.set_default_timeout(120000)
        editor.goto(BASE + '/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        original = editor.evaluate('nebeljagdMapTestState().map')
        editor.locator('#editor-tab-objects').click(); editor.locator('#editor-tool-objects-place').click()
        editor.locator('#palette-kind').select_option('meteorStaff')
        editor.locator('#palette-variant').select_option('kit-tripo-meteor-staff')
        editor.locator('#add-object-center').click()
        edited = editor.evaluate('nebeljagdMapTestState().map')
        assert edited['objects'][-1]['variant'] == 'kit-tripo-meteor-staff'
        assert edited['objects'][:-1] == original['objects']
        glyph = editor.locator('#world-objects use[href="#world-object-meteorStaff"]')
        assert glyph.count() == 1 and glyph.evaluate('e=>e.getBBox().width') > 0
        editor.screenshot(path=str(OUT / 'editor.png'))
        editor.reload(wait_until='domcontentloaded'); editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor.evaluate('nebeljagdMapTestState().map.objects.at(-1).variant') == 'kit-tripo-meteor-staff'
        passed('Editor displays the meteor symbol, retains its draft and preserves every existing placement')
        context.close()
        for touch in [False, True]:
            mode = 'touch' if touch else 'mouse'
            options = dict(viewport=dict(width=960, height=720), has_touch=touch, is_mobile=touch)
            if touch:
                options.update(device_scale_factor=2, user_agent='Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1')
            context = browser.new_context(**options)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(fixture)) + ');')
            page = context.new_page(); page.set_default_timeout(120000)
            page.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            page.on('pageerror', lambda error: report['errors'].append(str(error)))
            page.on('console', lambda msg: report['errors'].append(msg.text) if msg.type == 'error' else None)
            page.goto(BASE + '/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            page.locator('#startBtn').click()
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="meteorStaff"')
            s = state(page)
            assert s['equippedItem']['variant'] == 'kit-tripo-meteor-staff' and s['combat']['heldModel']['model'] == 'tripo'
            # Initial world pickups roll a tier, even when their editor default
            # is common. Check the actual equipped damage, as other staff tests do.
            equipped_damage = s['equippedItem']['damage']
            if touch: assert s['graphicsProfile']['iPad'] and s['graphicsProfile']['pixelRatio'] <= 1
            target = next(a for a in s['practiceActors'] if a['id'] == 'practice-1')
            point = target['position']; health = target['health']
            page.evaluate('p=>nebeljagdInspect({x:p.x-(p.touch?20:0),z:p.z-(p.touch?0:5),direction:p.touch?Math.PI/2:0})', {**point, 'touch':touch})
            elapsed = state(page)['elapsed']; page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=elapsed + .3)
            capture(page, mode + '-held')
            if touch:
                attack = page.locator('#attackBtn').bounding_box(); ax = attack['x'] + attack['width']/2; ay = attack['y'] + attack['height']/2
                joy = page.locator('#joystick').bounding_box(); jx = joy['x'] + joy['width']/2; jy = joy['y'] + joy['height']/2
                cdp = context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent', dict(type='touchStart', touchPoints=[dict(x=ax, y=ay, id=1)]))
                cdp.send('Input.dispatchTouchEvent', dict(type='touchStart', touchPoints=[dict(x=ax, y=ay, id=1), dict(x=jx+joy['width']*.30, y=jy, id=2)]))
            else:
                pixel = page.evaluate('p=>nebeljagdProjectPoint(p)', point)
                page.mouse.move(pixel['x'], pixel['y']); page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.meteor.aimRange?.radius===20')
            assert state(page)['combat']['shotsFired'] == 0
            arm_pause(page, "s.combat.meteor.phase==='flight'&&s.combat.meteor.flight.progress>=.2")
            if touch: cdp.send('Input.dispatchTouchEvent', dict(type='touchEnd', touchPoints=[]))
            else: page.keyboard.up('f')
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            early = state(page)['combat']['meteor']; assert early['casts'] == 1 and early['flight']['position']['y'] > 4
            capture(page, mode + '-early')
            arm_pause(page, "s.combat.meteor.phase==='flight'&&s.combat.meteor.flight.progress>=.8")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            late = state(page)['combat']['meteor']
            assert late['flight']['diameter'] > early['flight']['diameter'] * 1.7
            assert late['flight']['diameter'] <= 1.75
            assert late['visuals']['bodyVisible'] and 0 < late['visuals']['puffs'] <= 96
            assert late['visuals']['model'] == 'uploaded' and late['visuals']['source'] == 'assets/inbox/Meteor Projektil.glb'
            assert late['visuals']['draws'] <= 3, late['visuals']
            frozen = state(page)['combat']['meteor']; page.wait_for_timeout(100)
            assert state(page)['combat']['meteor'] == frozen
            capture(page, mode + '-late')
            passed(mode + ': real input launches the uploaded staff’s growing high-arc meteor; smoke and simulation pause correctly')
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=.15")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            impact = state(page)['combat']['meteor']; assert impact['radius'] == 3.2 and impact['visuals']['shock']
            assert 0 < impact['visuals']['fire'] <= 18
            assert impact['visuals']['fragmentModel'] == 'uploaded'
            assert impact['visuals']['fragments'] > 0
            assert len(set(f['diameter'] for f in impact['fragmentStates'])) > 1
            capture(page, mode + '-impact')
            enemy = next(a for a in state(page)['practiceActors'] if a['id'] == 'practice-1')
            # A fragment also starts burn. Its remaining timer measures actual
            # combat ticks, independently of the visual frame's impact age.
            expected_damage = equipped_damage
            if enemy['burnRemaining'] > 0:
                expected_damage += equipped_damage * rules['fragmentDamageRatio']
                expected_damage += rules['burnDps'] * (rules['burnSeconds'] - enemy['burnRemaining'])
            assert abs(health-enemy['health'] - expected_damage) < .001, dict(enemy=enemy, expectedDamage=expected_damage, impact=impact)
            assert impact['casts'] == 1
            assert impact['blastHits'] >= 1
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=.6")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            capture(page, mode + '-fragments')
            page.locator('#resumeBtn').click()
            page.wait_for_function('!nebeljagdTestState().combat.meteor.active')
            assert state(page)['combat']['meteor']['visuals']['draws'] == 0
            passed(mode + ': compact fire explosion with uploaded mini meteors damages the real practice target and all effects expire')
            context.close()
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == map_hash
        report.update(status='passed', mapSha256=map_hash, browser=browser.version)
    except BaseException as error:
        report.update(status='failed', failure=str(error))
        if 'page' in locals() and not page.is_closed():
            try: (OUT / 'failure-state.json').write_text(json.dumps(state(page), indent=2))
            except Exception: pass
        raise
    finally:
        browser.close()
        (OUT / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
