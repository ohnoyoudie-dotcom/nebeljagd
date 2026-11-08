"""Real generated game: broken props, shared path edges and styled user trees.

Only a temporary editor-playtest document is written to browser storage.
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
OUT = ROOT / 'test-results/woodland-details'
OUT.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"], cwd=ROOT))
fixture['name'] = 'Wald und Bruchstücke · QA'
fixture['objects'] = []
fixture['paths'] = []
fixture['landscape'] = {'version':1,'terrain':[]}
fixture['landscape']['terrain'] = [dict(id=f'path-{i}',name='Prüfweg',type='cobble',color='#938460',variation=.12,position=[-5+i*.35,5+i*.8],radius=2.5,strength=1,hardness=.65,seed=1) for i in range(16)]
fixture['gameplay']['spawnPosition'] = [0,0]
for kind, variant, x, z in [('sword','kit-tripo-sword',0,0),('barrel','kit-tripo-barrel',0,5),('crate','kit-wood',6,5),
        ('tree','kit-user-tree1',-8,8),('tree','kit-user-tree1',7,13),('tree','kit-user-tree1',-7,20)]:
    fixture['objects'].append(dict(id=f'{kind}-{x}-{z}',name=kind,kind=kind,variant=variant,position=[x,z],rotation=x*.12,scale=1,
        **({'rarity':'common'} if kind=='sword' else {})))
validation = subprocess.run(['node','--input-type=module','-e',
    "import {validateWorldmap} from './src/map/model.js';let data='';for await(const chunk of process.stdin)data+=chunk;const result=validateWorldmap(JSON.parse(data));if(!result.valid)throw new Error(result.errors.join('; '));"],
    input=json.dumps(fixture),text=True,cwd=ROOT)
assert validation.returncode==0,'Invalid temporary QA document'
report = {'status':'running','checks':[],'errors':[]}

def browser_error(message):
    report['errors'].append(message);print('BROWSER ERROR',message,flush=True)

def state(p): return p.evaluate('nebeljagdTestState()')
def capture(p, name):
    (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
    (OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
def passed(name):
    report['checks'].append(name);print('PASS',name,flush=True)
def pause_when(p, expression):
    p.evaluate('''expression=>{const predicate=new Function('s','return '+expression);
      function sample(){if(predicate(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(sample);}
      requestAnimationFrame(sample);}''',expression)
    p.wait_for_function('nebeljagdTestState().phase==="paused"')

with sync_playwright() as pw:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path)
    b=pw.chromium.launch(executable_path=executable,headless=True,
        args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        ctx=b.new_context(viewport={'width':900,'height':700})
        ctx.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
        p=ctx.new_page();p.set_default_timeout(180000)
        p.route('**/favicon.ico',lambda route:route.fulfill(status=204))
        p.on('pageerror',lambda e:browser_error(str(e)))
        p.on('console',lambda m:browser_error(m.text) if m.type=='error' else None)
        p.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
        print('STAGE waiting for generated world',flush=True)
        p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
        print('STAGE starting round',flush=True)
        p.locator('#startBtn').click()
        print('STAGE sword pickup',flush=True)
        p.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
        p.evaluate('nebeljagdInspect({x:0,z:3.3,direction:0});nebeljagdInspectCamera({zoom:1.4})')
        p.wait_for_function('nebeljagdTestState().elapsed>.3')
        p.locator('#pauseBtn').click();capture(p,'woodland-path')
        current=state(p)
        assert current['world']['treeCount']==3
        assert current['world']['stats']['terrainArt']['borderStones']['count']>40
        assert current['world']['stats']['terrainArt']['borderStones']['placement']=='outer-contour-only'
        passed('Prepared trees and shared exterior path borders load in the generated game')
        p.keyboard.press('Escape')
        # Real sword swings, rather than a test-only destruction hook.
        for _ in range(4):
            if state(p)['world']['destructibles'][0]['destroyed']: break
            before=state(p)['combat']['damageHits']
            p.keyboard.press('KeyF')
            p.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n',arg=before)
            p.wait_for_function('nebeljagdTestState().attackCooldown===0')
        assert state(p)['world']['destructibles'][0]['destroyed']
        assert state(p)['world']['stats']['debris']['active']>=8
        pause_when(p,'s.world.stats.debris.settled===s.world.stats.debris.active && s.world.stats.debris.active>0')
        capture(p,'barrel-settled')
        frozen=state(p)['world']['stats']['debris'];p.wait_for_timeout(1200)
        assert state(p)['world']['stats']['debris']==frozen
        assert frozen['averageOpacity']==1
        passed('Sword breaks the barrel into original textured pieces; settled pieces remain and pause correctly')
        p.keyboard.press('Escape')
        pause_when(p,'s.world.stats.debris.averageOpacity<.6 && s.world.stats.debris.active>0')
        capture(p,'barrel-fading')
        p.keyboard.press('Escape')
        p.wait_for_function('nebeljagdTestState().world.stats.debris.active===0')
        assert state(p)['world']['destructibles'][0]['destroyed']
        passed('Debris gradually fades and expires while the destroyed barrel stays removed')
        assert not report['errors'],report['errors']
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==source_hash
        report['status']='passed'
    except Exception as e:
        report['status']='failed';report['failure']=str(e)
        if 'p' in locals():
            try: capture(p,'failure')
            except Exception: pass
        raise
    finally:
        b.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
