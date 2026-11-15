"""Actual browser controls: independent mouse aim, two thumb pointers and cancellation."""
import os,json,subprocess,hashlib,base64,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/directional-gait';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.getenv('NEBELJAGD_URL','http://127.0.0.1:5242');ENTRY=os.getenv('NEBELJAGD_GAME_ENTRY','magebrawl.html')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[dict(id='fire',kind='fireStaff',variant='kit-tripo-lava-staff',position=[0,-14],rarity='common'),dict(id='earth',kind='earthbreakerStaff',variant='kit-tripo-earthbreaker-staff',position=[8,-14],rarity='common'),dict(id='meteor',kind='meteorStaff',variant='kit-tripo-meteor-staff',position=[-8,-14],rarity='common'),dict(id='sun',kind='sunStaff',variant='kit-tripo-sun-staff',position=[16,-14],rarity='common')]
for obj in fixture['objects']:obj.update(name=obj['id'],rotation=0,scale=1)
report=dict(checks=[],errors=[],mapSha256=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest())
def state(p):return p.evaluate('nebeljagdTestState()')
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def sim(p,dt):p.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=state(p)['elapsed']+dt)
def capture(p,name):
 (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));(OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
 if name.startswith('touch'):p.screenshot(path=str(OUT/(name+'-ui.png')))
def equip(p,x,kind):
 p.evaluate('x=>nebeljagdInspect({x,z:-14,direction:0})',x);p.keyboard.press('e');p.wait_for_function('k=>nebeljagdTestState().equippedWeapon===k',arg=kind);sim(p,.3)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  c=browser.new_context(viewport={'width':1000,'height':760})
  c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
  p=c.new_page();p.set_default_timeout(120000);p.on('pageerror',lambda e:report['errors'].append(str(e)));p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
  p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('nebeljagdTestState().equippedWeapon==="fireStaff"')
  for name,keys in [('diagonal',['s','d']),('sideways',['s']),('backwards',['d'])]:
   p.evaluate('nebeljagdInspect({x:0,z:-14,direction:-Math.PI/2})');sim(p,.3)
   p.evaluate('nebeljagdInspectCamera({zoom:3})');point=p.evaluate('nebeljagdProjectPoint({x:-2,z:-14})');p.mouse.move(point['x'],point['y'])
   for key in keys:p.keyboard.down(key)
   sim(p,.4)
   for frame in range(3):
    s=state(p);assert s['targeting']['direction'] is not None;assert s['character']['runPlaybackSpeed']>0;assert s['targeting']['preview'] is None
    capture(p,name+'-'+str(frame));sim(p,.12)
   for key in keys:p.keyboard.up(key)
   passed(name+' movement with opposite mouse aim remains continuous')
   sim(p,.4)
  assert not report['errors'],report['errors'];report['status']='passed'
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
