"""Actual-renderer regression: elevated vegetation and a local-player cliff aperture."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/os.environ.get('NEBELJAGD_REPORT_DIR','test-results/terrain-relief');OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5441');ENTRY=os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[{'id':'plateau-tree','name':'Baum auf Fels','kind':'tree','variant':'kit-user-tree1','position':[0,0],'rotation':0,'scale':.75}]
fixture.setdefault('landscape',{'version':1})['obstacles']=[{'id':'ridge-relief','points':[[-24,0],[24,0]],'height':8,'radius':5,'biome':'forest','erase':False}]
report={'status':'running','checks':[],'errors':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
def check(s):report['checks'].append(s);print('PASS',s,flush=True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(viewport={'width':1024,'height':768} if os.environ.get('NEBELJAGD_TOUCH') else {'width':1440,'height':1000},has_touch=bool(os.environ.get('NEBELJAGD_TOUCH')),is_mobile=bool(os.environ.get('NEBELJAGD_TOUCH')));p=c.new_page();p.set_default_timeout(240000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' and ('Shader' in m.text or 'VALIDATE' in m.text) else None)
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent||"null")')
  p.click('#editor-tool-paint-obstacles');assert 'Grundhöhe' in p.locator('body').inner_text()
  p.goto(BASE+'/release.json');p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.v1",JSON.stringify(m))',fixture);p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  assert p.evaluate('nebeljagdMapTestState().map.landscape.obstacles[0].height')==8
  check('editor reopens the saved baseline height without rewriting the map')
  p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',fixture)
  p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  p.click('#startBtn');p.evaluate('nebeljagdInspect({x:0,z:12})');p.wait_for_function('nebeljagdTestState().elapsed>.4');p.keyboard.press('Escape')
  (OUT/'relief-front.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  assets=p.evaluate('nebeljagdTestState().world.importedAssets.placements');tree=next(o for o in assets if o['id']=='plateau-tree')
  h=p.evaluate('nebeljagdInspectTerrain({position:{x:0,y:0,z:0}}).decorationHeight');assert abs(tree['y']-h)<.001
  heights=[p.evaluate('(x)=>nebeljagdInspectTerrain({position:{x,y:0,z:0}}).decorationHeight',x) for x in range(-21,22,3)]
  assert max(heights)-min(heights)>3
  assert any(o['id'].startswith('ridge-tree-') and o['y']>4 for o in assets)
  check('authored and generated trees stand on the varied plateau height')
  # Behind the high cliff: the ground-level player must remain readable.
  p.evaluate('nebeljagdInspect({x:0,z:-7})');p.wait_for_function('nebeljagdTestState().elapsed>1');p.keyboard.press('Escape')
  report['behind']=p.evaluate('({player:nebeljagdTestState().player,world:nebeljagdTestState().world.stats})')
  (OUT/'relief-behind.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  assert p.evaluate('nebeljagdInspectTerrain({from:{x:16,y:3,z:-15},to:{x:16,y:3,z:15}}).hit') is not None
  assert abs(p.evaluate('nebeljagdInspectTerrain({position:{x:16,y:0,z:0}}).resolved.z'))>4
  check('camera cutaway renders without shader errors and keeps movement/projectile blockers')
  p.evaluate('nebeljagdInspect({x:26,z:-7})');p.wait_for_function('nebeljagdTestState().elapsed>2');p.keyboard.press('Escape')
  (OUT/'relief-side.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256'];report['status']='passed'
 except BaseException as e:
  report['status']='failed';report['failure']=str(e)
  try:p.screenshot(path=str(OUT/'failure.png'))
  except:pass
  raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
