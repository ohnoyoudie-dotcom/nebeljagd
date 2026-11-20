"""Generated editor/game water check; software WebGL, not an iPad performance benchmark."""
import base64,hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/calm-water';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5442')
source=json.loads((ROOT/'worldmap.json').read_text())
report={'status':'running','errors':[],'checks':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1180,'height':820},has_touch=True);p.set_default_timeout(180000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'VALIDATE' in e.text) else None)
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  if p.locator('#editor-start-dialog').evaluate('(e)=>e.open'):p.click('#start-project-map')
  assert p.evaluate('nebeljagdMapTestState().map')==source
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
  assert source['landscape']['worldEdge']=='water'
  p.screenshot(path=str(OUT/'editor.png'));report['checks'].append('editor uses exact authored map with water edge')
  p.goto(BASE+'/magebrawl.html?inspect=1&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  p.click('#startBtn');p.screenshot(path=str(OUT/'arrival.png'))
  p.evaluate('nebeljagdInspect({x:70,z:786})');p.wait_for_function('nebeljagdTestState().elapsed>.2')
  p.wait_for_timeout(1600)
  state=p.evaluate('nebeljagdTestState()');edge=state['world']['stats']['worldEdge'];assert edge['mode']=='water' and edge['style']=='calm-stylized'
  assert edge['shoreProfile']=='sloped-shallow-gradient'
  assert edge['meshes']==3 and edge['reflectionPasses']==0 and edge['particles']==0 and edge['seaTriangles']==2
  assert state['world']['objects']==source['objects'];assert state['world']['landscape']==source['landscape']
  assert p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent).buildId')==report['build']['buildId']
  (OUT/'coast.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  before=p.evaluate('nebeljagdTestState().elapsed');p.wait_for_function('t=>nebeljagdTestState().elapsed>t+1',arg=before)
  (OUT/'coast-later.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  p.set_viewport_size({'width':820,'height':1180});p.wait_for_timeout(600);p.screenshot(path=str(OUT/'portrait.png'))
  report['checks'].append('generated game renders calm water at low quality in landscape and portrait without shader errors');report['edge']=edge
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256'];report['status']='passed';print('PASS calm water editor/game',flush=True)
 except BaseException as e:report['status']='failed';report['failure']=str(e);raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
