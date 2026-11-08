"""Uploaded crescent in the real generated game: render, hit, pause and return."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/moon-projectile';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174/welt').rstrip('/')
original=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['name']='Hochgeladene Mondsichel · QA';fixture['paths']=[]
fixture['objects']=[dict(id='moon-staff',name='Mondstab',kind='moonStaff',variant='kit-tripo-moon-staff',position=[0,-14],rotation=0,scale=1,rarity='common')]
for kind,variant,x,scale in [('wall','kit-stone',-18,1),('barrel','kit-tripo-barrel',-30,2)]:
    fixture['objects'].append(dict(id='impact-'+kind,name=kind,kind=kind,variant=variant,position=[x,-5],rotation=0,scale=scale))
report={'status':'running','errors':[],'checks':[]}
def state(p):return p.evaluate('nebeljagdTestState()')
def capture(p,name):
    (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
    (OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
def pause_when(p,expression):
    p.evaluate('''expression=>{const predicate=new Function('s','return '+expression);function sample(){
      if(predicate(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(sample);}
      requestAnimationFrame(sample);}''',expression)
    p.wait_for_function('nebeljagdTestState().phase==="paused"')
with sync_playwright() as pw:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path)
    browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        ctx=browser.new_context(viewport={'width':1000,'height':760})
        ctx.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
        p=ctx.new_page();p.set_default_timeout(120000)
        p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
        p.on('pageerror',lambda e:report['errors'].append(str(e)))
        p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
        p.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
        p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        p.locator('#startBtn').click();p.wait_for_function('nebeljagdTestState().equippedWeapon==="moonStaff"')
        before=state(p);model=before['combat']['special']['moonModel']
        assert model['source']=='assets/inbox/crescent moon prop 3d model.glb'
        assert model['runtime']=='assets/imported/tripo-star-moon/runtime/moon-crescent.glb'
        assert model['triangles']==6000 and model['nominalLength']==1.2
        target=next(t for t in before['practiceActors'] if t['id']=='practice-2')
        p.evaluate('t=>{nebeljagdInspect({x:t.x,z:t.z-7,direction:0});nebeljagdInspectCamera({zoom:1.6})}',target['position'])
        p.keyboard.press('f')
        pause_when(p,'s.combat.special.moon?.mode==="outbound" && s.combat.special.moon.distance>3')
        capture(p,'crescent-flight');frozen=state(p)['combat']['special']
        p.wait_for_timeout(250);assert state(p)['combat']['special']==frozen
        p.keyboard.press('Escape');p.keyboard.press('f')
        pause_when(p,'s.combat.special.moon?.mode==="returning"')
        capture(p,'crescent-return');assert state(p)['combat']['shotsFired']==1
        p.keyboard.press('Escape');p.wait_for_function('nebeljagdTestState().combat.special.moon===null')
        after=state(p);victim=next(t for t in after['practiceActors'] if t['id']==target['id'])
        assert after['combat']['damageHits']==2
        assert abs(victim['health']-(target['health']-2*before['equippedItem']['damage']))<.01
        assert after['combat']['special']['moonImpacts']['bursts']==0,'piercing a character is not an obstacle ricochet'
        for kind,x in [('wall',-18),('barrel',-30)]:
            p.evaluate('x=>nebeljagdInspect({x,z:-9,direction:0})',x)
            p.wait_for_function('nebeljagdTestState().attackCooldown===0')
            count=state(p)['combat']['special']['moonImpacts']['bursts']
            p.keyboard.press('f')
            pause_when(p,f's.combat.special.moonImpacts.bursts>{count} && s.combat.special.moonImpacts.visible>0')
            impact=state(p)['combat']['special']['moonImpacts']
            assert state(p)['combat']['special']['moon']['mode']=='returning'
            assert impact['active']==10 and impact['visible']>0
            assert abs(impact['lastImpact']['position']['x']-x)<.8
            assert impact['lastImpact']['normal']['z']<-.9
            contact_time=state(p)['elapsed']
            p.keyboard.press('Escape')
            pause_when(p,f's.elapsed>{contact_time+.07} && s.combat.special.moonImpacts.active>0')
            impact=state(p)['combat']['special']['moonImpacts']
            capture(p,'crescent-'+kind+'-sparks')
            p.wait_for_timeout(250);assert state(p)['combat']['special']['moonImpacts']==impact
            p.keyboard.press('Escape')
            p.wait_for_function('!nebeljagdTestState().combat.special.moon && nebeljagdTestState().combat.special.moonImpacts.active===0')
            assert state(p)['combat']['special']['moonImpacts']['bursts']==count+1
            print('PASS one visible, paused and naturally expiring spark burst at '+kind,flush=True)
        p.locator('#pauseBtn').click();p.locator('#restartBtn').click()
        assert state(p)['combat']['special']['moon'] is None
        assert state(p)['combat']['special']['moonImpacts']['bursts']==0
        assert not report['errors'],report['errors']
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==original
        report.update(status='passed',model=model,checks=['Uploaded PBR crescent renders in flight and return','Pause freezes flight; a second cast remains locked','Outbound and returning crescent each damage the target once','Wall and solid prop contacts each emit one visible spark burst; pause and expiry verified','Restart clears the projectile and sparks; original map preserved'])
        for check in report['checks']:print('PASS',check,flush=True)
    except Exception as error:
        report.update(status='failed',failure=str(error))
        if 'p' in locals():
            try:capture(p,'failure')
            except Exception:pass
        raise
    finally:
        browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
