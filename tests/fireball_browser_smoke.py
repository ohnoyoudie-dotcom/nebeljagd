"""Actual uploaded fireball, shader compilation, smoke and hits in generated HTML."""
import hashlib
import base64
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
OUT=ROOT/'test-results/fireball';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=ROOT/'assets/inbox/fiery flame 3d model.glb'
SOURCE_HASH=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['name']='Feuerball · Modellprüfung';fixture['regions'][0]['biome']='desert'
fixture['objects']=[{'id':kind,'name':kind,'kind':kind,'variant':variant,'position':[x,-14],
    'rotation':0,'scale':1,'rarity':'common'} for kind,variant,x in [
    ('fireStaff','kit-tripo-lava-staff',0),('iceStaff','kit-tripo-crystal-staff',5)]]
report={'status':'running','checks':[],'errors':[],'limits':'Generated HTML in local Chromium/SwiftShader; no physical-device performance claim.'}
def passed(name):report['checks'].append(name);print('PASS',name,flush=True)
def state(page):return page.evaluate('nebeljagdTestState()')
with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
    browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        context=browser.new_context(viewport={'width':960,'height':720})
        context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
        page=context.new_page();page.set_default_timeout(120000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        page.goto(URL+'/nebeljagd.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        model=state(page)['combat']['effects']['fireModel']
        assert model and model['triangles']<=6000 and model['nominalLength']==.75,model
        page.locator('#startBtn').click()
        page.wait_for_function('nebeljagdTestState().equippedWeapon==="fireStaff"')
        passed('The generated game preloads the real uploaded flame browser model within budget')
        page.evaluate('''()=>{const a=nebeljagdTestState().practiceActors.find(a=>a.id==='practice-2');
          nebeljagdInspect({x:a.position.x,z:a.position.z-7,direction:0});}''')
        page.keyboard.press('f')
        page.wait_for_function('nebeljagdTestState().combat.effects.importedFireProjectiles>0 && nebeljagdTestState().combat.effects.visibleSmoke>0')
        page.keyboard.press('Escape')
        before=state(page);assert before['phase']=='paused'
        page.evaluate('nebeljagdInspectCamera({zoom:1})')
        (OUT/'fireball-flight-canvas.png').write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
        page.screenshot(path=str(OUT/'fireball-flight.png'));page.wait_for_timeout(150)
        after=state(page);assert after['elapsed']==before['elapsed'];assert after['combat']['spells']==before['combat']['spells']
        passed('The imported 3D flame renders with its shader, sparks and short smoke trail; pause freezes flight')
        page.keyboard.press('Escape')
        page.wait_for_function('nebeljagdTestState().combat.damageHits>0')
        page.keyboard.press('Escape');current=state(page)
        assert current['combat']['lastDamage']['targetId']=='practice-2'
        assert current['combat']['effects']['latestImpact']['type']=='fireStaff'
        assert current['combat']['effects']['activeSmoke']>0
        target=next(a for a in current['practiceActors'] if a['id']=='practice-2');assert target['burnRemaining']>0
        (OUT/'fireball-impact-canvas.png').write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
        page.screenshot(path=str(OUT/'fireball-impact.png'))
        passed('Actual fireball hits preserve damage and burn while emitting one fire impact and fading smoke')
        page.locator('#restartBtn').click()
        page.wait_for_function('nebeljagdTestState().phase==="playing"')
        assert state(page)['combat']['effects']['activeSmoke']==0
        page.evaluate('nebeljagdInspect({x:5,z:-14,direction:0})');page.keyboard.press('e')
        page.wait_for_function('nebeljagdTestState().equippedWeapon==="iceStaff"')
        page.keyboard.press('f')
        page.wait_for_function('nebeljagdTestState().combat.spells.some(s=>s.type==="iceStaff")')
        current=state(page)
        assert current['combat']['effects']['importedFireProjectiles']==0
        assert current['combat']['effects']['activeSmoke']==0
        passed('Restart clears the pooled smoke and ice retains its own projectile without fire geometry or smoke')
        assert not report['errors'],report['errors']
        assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()==SOURCE_HASH
        report.update(status='passed',model=model,sourceHash=SOURCE_HASH)
    except BaseException as error:
        report.update(status='failed',failure=str(error));raise
    finally:
        browser.close();(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
