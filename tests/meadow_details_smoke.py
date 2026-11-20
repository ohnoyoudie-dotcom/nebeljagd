"""Sparse scenery on a lawn with no authored trees, using the built game/editor."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/meadow-details';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5441');ENTRY=os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')
m=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
m['objects']=[];m['regions'][0]['biome']='forest';m['gameplay']['spawnPosition']=[20,10]
report={'status':'running','errors':[],'checks':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1280,'height':900});p.set_default_timeout(240000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'VALIDATE' in e.text) else None)
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent||"null")')
  p.click('#editor-tool-paint-obstacles');assert 'Blumen, Pilze und kleine Steine' in p.locator('body').inner_text()
  p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',m)
  p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  p.click('#startBtn');p.evaluate('nebeljagdInspect({x:20,z:10})');p.wait_for_function('nebeljagdTestState().elapsed>.25');p.keyboard.press('Escape')
  stats=p.evaluate('nebeljagdTestState().world.stats.woodlandDetails');report['details']=stats
  assert stats['flowers']>30 and stats['mushrooms']>5 and 3<stats['stones']<stats['flowers']/4
  assert stats['flowers']+stats['mushrooms']+stats['stones']<300
  assert p.evaluate('nebeljagdTestState().world.objects.length')==0
  (OUT/'open-lawn.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  report['checks'].append('treeless grass contains sparse flowers, mushrooms and small stones without creating map objects')
  p.evaluate('nebeljagdInspect({x:10,z:-10})');p.wait_for_function('nebeljagdTestState().elapsed>.5');p.keyboard.press('Escape')
  (OUT/'second-group.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256']
  report['status']='passed';print('PASS',json.dumps(stats),flush=True)
 except BaseException as e:
  report['status']='failed';report['failure']=str(e);raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
