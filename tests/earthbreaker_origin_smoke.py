"""Generated game: moving cast starts at the caster when the earth wave erupts."""
import base64,hashlib,json,os,subprocess,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/earthbreaker-origin';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.getenv('NEBELJAGD_URL','http://127.0.0.1:5242');ENTRY=os.getenv('NEBELJAGD_GAME_ENTRY','magebrawl.html')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[dict(id='earth',name='earth',kind='earthbreakerStaff',variant='kit-tripo-earthbreaker-staff',position=[0,-14],rarity='common',rotation=0,scale=1)]
report=dict(checks=[],errors=[],mapSha256=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest())
def passed(message):report['checks'].append(message);print('PASS',message,flush=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  c=browser.new_context(viewport={'width':900,'height':700});c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
  p=c.new_page();p.set_default_timeout(120000);p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None);p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
  p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('nebeljagdTestState().equippedWeapon==="earthbreakerStaff"')
  p.evaluate('nebeljagdInspect({x:0,z:-14,direction:0})');p.wait_for_function('nebeljagdTestState().elapsed>.4');point=p.evaluate('nebeljagdProjectPoint({x:0,z:-8})');p.mouse.move(point['x'],point['y']);p.keyboard.down('f');p.keyboard.down('d')
  p.evaluate('''()=>{window.earthFrames=[];window.earthDone=false;window.earthCapture=null;
   function frame(){const s=nebeljagdTestState(),w=s.combat.earthbreaker;
    if(w.active){earthFrames.push({position:s.position,wave:w});
     if(w.age>=.48&&!earthCapture)earthCapture=nebeljagdCaptureFrame();
     if(w.age>=.9){window.earthDone=true;return;}}
    requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  }''');p.keyboard.up('f');p.wait_for_function('window.earthDone');p.keyboard.up('d')
  frames=p.evaluate('earthFrames');(OUT/'frames.json').write_text(json.dumps(frames,indent=2));png=p.evaluate('earthCapture');assert png;(OUT/'moving-eruption.png').write_bytes(base64.b64decode(png.split(',',1)[1]))
  warning=[f for f in frames if not f['wave']['launched']];launched=[f for f in frames if f['wave']['launched']];assert len(warning)>=2 and launched
  distance=lambda a,b:math.hypot(a['x']-b['x'],a['z']-b['z'])
  for f in warning+[launched[0]]:assert distance(f['position'],f['wave']['origin'])<1e-6
  assert distance(launched[0]['wave']['origin'],warning[0]['wave']['origin'])>.8
  passed('Moving windup and first eruption use the current avatar position')
  origin=launched[0]['wave']['origin'];direction=warning[0]['wave']['direction']
  for f in launched:assert f['wave']['origin']==origin and f['wave']['direction']==direction
  assert distance(launched[-1]['position'],origin)>.5
  first=launched[0]['wave']['nodes'][0];assert abs(distance(first,origin)-.65)<1e-6
  passed('Released wave keeps its origin and committed aim while the avatar keeps moving')
  p.wait_for_function('!nebeljagdTestState().combat.earthbreaker.active');assert p.evaluate('nebeljagdTestState().combat.earthbreaker.casts')==1
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256']
  passed('Cast finishes once without browser errors or map changes');report['status']='passed'
 except BaseException as e:
  report.update(status='failed',failure=str(e));raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
