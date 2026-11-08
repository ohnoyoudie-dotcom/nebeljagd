"""Generated editor: way brushes, undo/export, touch and real game render."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174')
OUT=ROOT/'test-results/natural-ground';OUT.mkdir(parents=True,exist_ok=True)
original=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[]
fixture['regions']=[dict(id='floor-'+str(i),name=kind,biome=kind,color=color,label=[-45+i*30,0],points=[[-60+i*30,-60],[-30+i*30,-60],[-30+i*30,60],[-60+i*30,60]]) for i,(kind,color) in enumerate([('forest','#517b48'),('meadow','#72a154'),('dunes','#cbb17c'),('snow','#dce7e8')])]
checks=[];errors=[]
def check(name):checks.append(name);print('PASS',name,flush=True)
def state(p):return p.evaluate('nebeljagdMapTestState()')
def point(p,x,z):return p.evaluate('p=>{const q=new DOMPoint(...p).matrixTransform(document.querySelector("#map-stage>svg").getScreenCTM());return {x:q.x,y:q.y}}',[x,z])
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  ctx=b.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,has_touch=True)
  ctx.add_init_script('window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;')
  p=ctx.new_page();p.set_default_timeout(120000)
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.goto(URL+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  p.locator('#json-file-input').set_input_files({'name':'natural-ground.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
  p.wait_for_function('nebeljagdMapTestState().map.regions.length===4')
  p.locator('[data-editor-tool="terrain"]').click()
  for i,preset in enumerate(['earth','forest','sand','desert','snow','gravel','marsh','cobble']):
   p.locator('#path-preset').select_option(preset);p.locator('#landscape-path-brush').click()
   before=state(p);p.locator('#map-viewport').scroll_into_view_if_needed()
   a=point(p,-20,-38+i*9);c=point(p,20,-38+i*9)
   p.mouse.move(a['x'],a['y']);p.mouse.down();p.mouse.move(c['x'],c['y'],steps=14);p.mouse.up()
   after=state(p);assert after['undoCount']==before['undoCount']+1
   assert len(after['map']['landscape']['terrain'])>len(before['map'].get('landscape',{}).get('terrain',[]))
   assert after['map']['objects']==[]
  expected=state(p)['map'];p.locator('#undo').click();assert state(p)['map']!=expected
  p.locator('#redo').click();assert state(p)['map']==expected
  check('All eight way brushes draw continuous strokes with one-step undo/redo and no vegetation')
  with p.expect_download() as dl:p.locator('#export-json').click()
  dl.value.save_as(OUT/'map.json');assert json.loads((OUT/'map.json').read_text())==expected
  p.locator('#json-file-input').set_input_files(str(OUT/'map.json'));assert state(p)['map']==expected
  check('Painted way materials, width and soft edges survive JSON export and import')
  p.locator('[data-editor-tool="terrain"]').click();p.locator('#landscape-path-brush').click();p.locator('#map-viewport').scroll_into_view_if_needed()
  a=point(p,-20,40);c=point(p,20,40);session=ctx.new_cdp_session(p)
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[a]})
  session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[c]})
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  assert state(p)['map']!=expected
  p.locator('#undo').click();assert state(p)['map']==expected
  check('Native touch paints a way and undo restores the previous map')
  p.screenshot(path=str(OUT/'editor.png'))
  with p.expect_popup() as popup:p.locator('#playtest-world').click()
  game=popup.value;game.set_default_timeout(180000)
  game.wait_for_load_state('domcontentloaded')
  game.goto(game.url + ('&' if '?' in game.url else '?') + 'inspect=1&quality=low',wait_until='domcontentloaded')
  game.on('pageerror',lambda e:errors.append(str(e)))
  game.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
  game.locator('#startBtn').click()
  game.wait_for_function('nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0')
  s=game.evaluate('nebeljagdTestState().world.stats')
  assert not s['meadowGround']['enabled'];assert s['terrainPaint']['stamps']==len(expected['landscape']['terrain'])
  assert s['terrainPaint']['extraDrawCalls']==0
  assert s['terrainPaint']['textureBytes']<=s['terrainPaint']['textureBudgetBytes']
  if game.evaluate('typeof nebeljagdInspect')=='function':
   game.evaluate('nebeljagdInspect({x:0,z:-10})');game.evaluate('nebeljagdInspectCamera({zoom:1})')
  game.keyboard.press('Escape')
  if game.evaluate('typeof nebeljagdCaptureFrame')=='function':
   (OUT/'ground.png').write_bytes(base64.b64decode(game.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  game.screenshot(path=str(OUT/'game.png'))
  check('Editor playtest renders the saved ways with no automatic grass and within the terrain texture budget')
  assert not errors,errors
  assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==original
 finally:
  b.close();(OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},indent=2))
