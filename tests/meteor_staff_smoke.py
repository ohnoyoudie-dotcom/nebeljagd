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
limits = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {METEOR_RULES} from './src/meteor-spell.js';import {METEOR_VISUAL_BUDGET} from './src/meteor-visuals.js';import {METEOR_FIRE_SLICES} from './src/meteor-ground-fire.js';console.log(JSON.stringify({rules:METEOR_RULES,visuals:METEOR_VISUAL_BUDGET,fireSlices:METEOR_FIRE_SLICES}))"], cwd=ROOT))
rules = limits['rules']
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

def capture(page, name, ground_detail=False, fragment_detail=False):
    (OUT / (name + '.png')).write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    if state(page)['combat']['meteor']['flight'] or ground_detail:
        detail = page.evaluate('''groundDetail=>{
          const s=nebeljagdTestState(),zoom=s.camera.zoom;
          nebeljagdInspectCamera({zoom:groundDetail?2.5:1.25,focus:groundDetail?s.combat.meteor.center:s.combat.meteor.flight.position});
          const image=nebeljagdCaptureFrame();nebeljagdInspectCamera({zoom});return image;
        }''', ground_detail)
        (OUT / (name + '-detail.png')).write_bytes(base64.b64decode(detail.split(',', 1)[1]))
    if fragment_detail:
        wide = page.evaluate('''()=>{
          const s=nebeljagdTestState(),zoom=s.camera.zoom;
          nebeljagdInspectCamera({zoom:1.3,focus:s.combat.meteor.center});
          const image=nebeljagdCaptureFrame();nebeljagdInspectCamera({zoom});return image;
        }''')
        (OUT / (name + '-field.png')).write_bytes(base64.b64decode(wide.split(',', 1)[1]))
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
            arm_pause(page, "s.combat.meteor.phase==='flight'&&s.combat.meteor.flight.progress>=.5")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            capture(page, mode + '-mid-flight')
            arm_pause(page, "s.combat.meteor.phase==='flight'&&s.combat.meteor.flight.progress>=.8")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            late = state(page)['combat']['meteor']
            assert late['flight']['diameter'] > early['flight']['diameter'] * 1.7
            assert late['flight']['diameter'] <= 1.75
            assert late['visuals']['bodyVisible'] and 0 < late['visuals']['puffs'] <= limits['visuals']['puffs']
            assert late['visuals']['model'] == 'uploaded' and late['visuals']['source'] == 'assets/inbox/Meteor Projektil.glb'
            assert late['visuals']['draws'] <= 4, late['visuals']
            assert late['visuals']['heat']['visible'] and late['visuals']['heat']['samples'] > 0
            trail = late['visuals']['trail']
            assert trail['samples'] > 20 and 0 < trail['maxGap'] <= trail['maxSpacing'] + 1e-8
            assert trail['maxSpacing'] <= .18
            frozen = state(page)['combat']['meteor']; page.wait_for_timeout(100)
            assert state(page)['combat']['meteor'] == frozen
            capture(page, mode + '-late')
            passed(mode + ': real input launches the uploaded staff’s growing high-arc meteor; continuous smoke, heat haze and simulation pause correctly')
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=.15")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            impact = state(page)['combat']['meteor']; assert impact['radius'] == 3.2 and impact['visuals']['shock']
            assert 0 < impact['visuals']['fire'] <= limits['visuals']['fire']
            assert impact['visuals']['fragmentModel'] == 'uploaded'
            assert impact['visuals']['fragments'] > 0
            assert len(impact['fragmentStates']) == rules['fragments'] == 8
            assert len(set(f['diameter'] for f in impact['fragmentStates'])) > 1
            capture(page, mode + '-impact')
            enemy = next(a for a in state(page)['practiceActors'] if a['id'] == 'practice-1')
            # Both the new ground fire and a shard can ignite the target.
            # The first sample is before refresh; direct damage stays exact,
            # and only one burn stream can run during these initial frames.
            expected_direct = equipped_damage
            if enemy['id'] in impact['fragmentHitIds']:
                expected_direct += equipped_damage * rules['fragmentDamageRatio']
            assert expected_direct <= health-enemy['health'] <= expected_direct + rules['burnDps'] * .3, dict(enemy=enemy, impact=impact)
            assert enemy['burnRemaining'] > 0
            assert impact['groundFire']['active'] and impact['visuals']['groundFire']['visible']
            assert impact['casts'] == 1
            assert impact['blastHits'] >= 1
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=.6")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            airborne = state(page)['combat']['meteor']
            assert airborne['visuals']['fragments'] > 0
            assert 0 < airborne['visuals']['fragmentFire']['flames'] <= 88
            assert any(f['active'] and f['phase'] == 'airborne' for f in airborne['fragmentStates'])
            capture(page, mode + '-fragments', fragment_detail=True)
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=2")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            burning = state(page)['combat']['meteor']
            burned_enemy = next(a for a in state(page)['practiceActors'] if a['id'] == 'practice-1')
            assert burning['fragments'] > 0 and burning['groundFire']['active']
            assert burning['visuals']['fragments'] > 0
            assert any(f['active'] and f['phase'] == 'rolling' for f in burning['fragmentStates'])
            ground_fire = burning['visuals']['groundFire']
            assert ground_fire['visible'] and ground_fire['mode'] == 'volume'
            assert ground_fire['slices'] == limits['fireSlices'] <= 32
            assert ground_fire['draws'] == 2
            assert burned_enemy['burnRemaining'] > 2.5 and burned_enemy['health'] < enemy['health'] - 2
            capture(page, mode + '-burning-ground', ground_detail=True, fragment_detail=True)
            frozen = state(page)['combat']['meteor']; page.wait_for_timeout(100)
            assert state(page)['combat']['meteor'] == frozen
            arm_pause(page, "s.combat.meteor.phase==='impact'&&s.combat.meteor.age>=2.35")
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            rolled = state(page)['combat']['meteor']
            assert rolled['visuals']['fragments'] > 0
            assert rolled['visuals']['fragmentFire']['flames'] > 0
            # Translation and orientation must both advance on the ground:
            # spinning airborne shards or a fixed glowing sprite do not pass.
            def rolled_on_ground(a, b):
                if not (a['active'] and b['active'] and a['phase'] == 'rolling' and b['phase'] in ['rolling', 'resting']):
                    return False
                displacement = sum((b['position'][k]-a['position'][k])**2 for k in ['x', 'z'])
                rotation = sum((b['orientation'][k]-a['orientation'][k])**2 for k in ['x', 'y', 'z', 'w'])
                return displacement > .02**2 and rotation > 1e-5
            assert any(rolled_on_ground(a, b) for a, b in zip(burning['fragmentStates'], rolled['fragmentStates'])), dict(before=burning, after=rolled)
            capture(page, mode + '-burning-ground-later', ground_detail=True, fragment_detail=True)
            page.locator('#resumeBtn').click()
            page.wait_for_function('!nebeljagdTestState().combat.meteor.active')
            assert state(page)['combat']['meteor']['visuals']['draws'] == 0
            assert not state(page)['combat']['meteor']['visuals']['heat']['visible']
            assert state(page)['combat']['meteor']['visuals']['groundFire']['slices'] == 0
            passed(mode + ': mini meteors visibly fly, bounce and roll through the burning ground; damage caps, pause and cleanup work')
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
