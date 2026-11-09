"""All six ranged weapons across low/high barriers in the generated game."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/projectile-barriers'
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4174/welt').rstrip('/')
original = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
weapons = [('bow', 'kit-tripo-ornate-bow'), ('fireStaff', 'kit-tripo-lava-staff'),
           ('iceStaff', 'kit-tripo-crystal-staff'), ('starStaff', 'kit-tripo-star-staff'),
           ('moonStaff', 'kit-tripo-moon-staff'), ('poisonStaff', 'kit-tripo-poison-staff')]
fixture['name'] = 'Freie Schussbahn über niedrige Hindernisse · QA'
fixture['objects'] = [dict(id=kind, name=kind, kind=kind, variant=variant, position=[i*5, -14],
    rotation=0, scale=1, rarity='common') for i, (kind, variant) in enumerate(weapons)]
lanes = [('low-wall', -30, 'wall', 1.99), ('low-fence', -10, 'fence', 1.99),
         ('high-wall', 10, 'wall', 2), ('high-fence', 30, 'fence', 2)]
fixture['barriers'] = []
for name, x, kind, height in lanes:
    if name == 'low-fence':
        fixture['barriers'].append(dict(id=name, name=name, kind=kind, variant='kit-wood',
            points=[[x-4, -36], [x+4, -34]], gaps=[], scale=1.6, height=height))
    else:
        fixture['objects'].append(dict(id=name, name=name, kind=kind,
            variant='kit-stone' if kind == 'wall' else 'kit-wood', position=[x, -35],
            rotation=.25 if kind == 'fence' else 0, scale=1.6, height=height))
report = {'status': 'running', 'errors': [], 'checks': []}

with sync_playwright() as pw:
    executable = os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path)
    browser = pw.chromium.launch(executable_path=executable, headless=True,
        args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    try:
        context = browser.new_context(viewport={'width': 1000, 'height': 760})
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(fixture)) + ');')
        p = context.new_page(); p.set_default_timeout(120000)
        p.route('**/favicon.ico', lambda r: r.fulfill(status=204))
        p.on('pageerror', lambda e: report['errors'].append(str(e)))
        p.on('console', lambda m: report['errors'].append(m.text) if m.type == 'error' else None)
        p.goto(BASE + '/magebrawl.html?inspect=1&mapSource=editor&quality=low', wait_until='domcontentloaded')
        p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        p.locator('#startBtn').click()
        for i, (weapon, _) in enumerate(weapons):
            selected = os.environ.get('NEBELJAGD_QA_WEAPONS', '').split(',')
            if selected != [''] and weapon not in selected:
                continue
            print('Testing', weapon, flush=True)
            p.evaluate('x=>nebeljagdInspect({x,z:-14,direction:0})', i*5)
            p.wait_for_function('kind=>{const s=nebeljagdTestState();return s.equippedWeapon===kind || s.nearWeapon===kind}', arg=weapon)
            if p.evaluate('nebeljagdTestState().equippedWeapon') != weapon:
                p.keyboard.press('e')
            p.wait_for_function('kind=>nebeljagdTestState().equippedWeapon===kind', arg=weapon)
            for name, x, kind, height in lanes:
                selected_lanes = os.environ.get('NEBELJAGD_QA_BARRIERS', '').split(',')
                if selected_lanes != [''] and name not in selected_lanes:
                    continue
                low = height < 2
                p.evaluate('x=>nebeljagdInspect({x,z:-35,direction:0})', x)
                pos = p.evaluate('nebeljagdTestState().position')
                assert abs(pos['x']-x)+abs(pos['z']+35) > .3, (name, 'movement must still stop')
                z = -35.9 if weapon == 'poisonStaff' and not low else -39
                p.evaluate('p=>nebeljagdInspect({...p,direction:0})', dict(x=x, z=z))
                p.wait_for_function('nebeljagdTestState().attackCooldown===0')
                p.wait_for_function('()=>{const s=nebeljagdTestState(),o=s.vision.origin,p=s.position;return Math.abs(o.x-p.x)<.01 && Math.abs(o.z-p.z)<.01}')
                assert p.evaluate('p=>nebeljagdInspectVisibility(p)', dict(x=x, z=-31)) == low, name
                if weapon == 'poisonStaff':
                    point=p.evaluate('x=>nebeljagdProjectPoint({x,z:-29})',x)
                    p.mouse.move(point['x'],point['y'])
                    p.keyboard.down('f')
                    p.wait_for_function('nebeljagdTestState().combat.special.aimRange?.radius===12')
                p.evaluate('''() => {
                  const before=nebeljagdTestState();
                  const check=window.projectileBarrierCheck={maxZ:-Infinity,done:false,
                    beforeImpacts:before.combat.impacts,beforeSparks:before.combat.special.moonImpacts.bursts,
                    beforeShots:before.combat.shotsFired,start:before.elapsed};
                  function sample(){const s=nebeljagdTestState(),c=s.combat;
                    const points=[...c.spells.map(p=>p.position),...c.arrows.filter(p=>p.mode==='flying').map(p=>p.position),
                      ...c.special.poisonFlights.map(p=>p.position),...c.special.clouds.map(p=>p.position)];
                    if(c.special.moon?.mode==='outbound')points.push(c.special.moon.position);
                    for(const p of points)check.maxZ=Math.max(check.maxZ,p.z);
                    if(s.elapsed>check.start+1.8){check.done=true;check.after=c;}
                    else requestAnimationFrame(sample);
                  } requestAnimationFrame(sample);
                }''')
                if weapon == 'poisonStaff': p.keyboard.up('f')
                else: p.keyboard.press('f')
                p.wait_for_function('window.projectileBarrierCheck.done')
                result = p.evaluate('projectileBarrierCheck')
                assert result['after']['shotsFired'] == result['beforeShots'] + 1, (weapon, name, 'one shot')
                if low:
                    assert result['maxZ'] is not None and result['maxZ'] > -34, (weapon, name, result)
                    assert result['after']['impacts'] == result['beforeImpacts'], (weapon, name)
                    assert result['after']['special']['moonImpacts']['bursts'] == result['beforeSparks'], (weapon, name)
                elif weapon == 'moonStaff':
                    assert result['after']['special']['moonImpacts']['bursts'] == result['beforeSparks'] + 1, name
                elif weapon == 'poisonStaff':
                    cloud = result['after']['special']['clouds'][0]
                    assert cloud['position']['z'] < -35, (name, cloud)
                else:
                    assert result['after']['impacts'] == result['beforeImpacts'] + 1, (weapon, name, result)
                    assert result['after']['lastImpact']['point']['z'] < -35, (weapon, name)
                report['checks'].append(dict(weapon=weapon, barrier=name, maxZ=result['maxZ']))
                print('PASS', weapon, name, flush=True)
        assert not report['errors'], report['errors']
        assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == original
        report.update(status='passed', mapHash=original)
    except BaseException as error:
        report.update(status='failed', failure=str(error))
        if 'p' in locals() and not p.is_closed():
            (OUT/'failure-state.json').write_text(json.dumps(p.evaluate('nebeljagdTestState()'), indent=2))
        raise
    finally:
        browser.close()
        (OUT/'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
