"""Paint/export/reopen through the generated editor, then check the actual game."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5441')
OUT=ROOT/'test-results/terrain-obstacles';OUT.mkdir(parents=True,exist_ok=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[]
report={'status':'running','checks':[],'errors':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def point(page,p):return page.evaluate('p=>{const svg=document.querySelector("#map-stage svg");const q=svg.createSVGPoint();q.x=p[0];q.y=p[1];const s=q.matrixTransform(svg.getScreenCTM());return {x:s.x,y:s.y};}',p)
def draw(page,a,b):
 a=point(page,a);b=point(page,b);page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=12);page.mouse.up()
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=browser.new_context(viewport={'width':1440,'height':1000});p=c.new_page();p.set_default_timeout(240000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' and ('Shader' in m.text or 'VALIDATE' in m.text) else None)
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent||"null")');source=json.loads((ROOT/'worldmap.json').read_text())
  assert p.evaluate('nebeljagdMapTestState().map.objects')==source['objects'];passed('editor still contains the unchanged authored forest map')
  p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.v1",JSON.stringify(m))',fixture);p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  p.click('#editor-tool-paint-obstacles');p.locator('#obstacle-radius').fill('6');p.locator('#obstacle-radius').dispatch_event('input');p.click('#obstacle-draw');draw(p,[-22,0],[22,0]);
  assert len(p.evaluate('nebeljagdMapTestState().map.landscape.obstacles'))==1
  p.locator('#obstacle-radius').fill('3');p.locator('#obstacle-radius').dispatch_event('input');p.click('#obstacle-erase');draw(p,[0,-12],[0,12]);
  assert len(p.evaluate('nebeljagdMapTestState().map.landscape.obstacles'))==2
  assert p.locator('#terrain-obstacles').count()==1
  p.screenshot(path=str(OUT/'editor-passage.png'));passed('mouse paints a connected ridge and cuts a passage with the dedicated eraser')
  # Keyboard undo/redo uses the same history as all other editor changes.
  p.keyboard.press('Control+z');assert len(p.evaluate('nebeljagdMapTestState().map.landscape.obstacles'))==1
  p.keyboard.press('Control+Shift+z');assert len(p.evaluate('nebeljagdMapTestState().map.landscape.obstacles'))==2
  saved=p.evaluate('nebeljagdMapTestState().map');assert saved['objects']==fixture['objects'];assert saved['regions']==fixture['regions'];passed('undo and redo operate on the complete stroke without changing other content')
  p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');assert p.evaluate('nebeljagdMapTestState().map')==saved;passed('painted obstacles and cuts survive a real browser draft reload')
  p.click('#editor-tool-paint-obstacles');p.click('#obstacle-draw');a=point(p,[-15,20]);b=point(p,[15,20]);p.mouse.move(a['x'],a['y']);p.mouse.down();p.mouse.move(b['x'],b['y'],steps=4);p.keyboard.press('Escape');p.mouse.up();assert p.evaluate('nebeljagdMapTestState().map')==saved
  p.evaluate("window.showSaveFilePicker=undefined")
  with p.expect_download() as exported:p.locator('#download-json').evaluate('(button)=>button.click()')
  downloaded=json.loads(Path(exported.value.path()).read_text());assert downloaded==saved;passed('Escape cancels a stroke, and JSON export preserves the complete terrain document')
  touch=browser.new_context(viewport={'width':1024,'height':900},has_touch=True,is_mobile=True);touch.add_init_script('localStorage.setItem("nebeljagd.worldmap.v1",'+json.dumps(json.dumps(fixture))+');');t=touch.new_page();t.set_default_timeout(120000);t.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');t.wait_for_function('window.nebeljagdMapTestState');t.click('#editor-tool-paint-obstacles');t.click('#obstacle-draw');a=point(t,[-20,0]);b=point(t,[20,0]);cdp=touch.new_cdp_session(t);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':a['x'],'y':a['y'],'id':1}]})
  for i in range(1,7):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':a['x']+(b['x']-a['x'])*i/6,'y':a['y']+(b['y']-a['y'])*i/6,'id':1}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert len(t.evaluate('nebeljagdMapTestState().map.landscape.obstacles'))==1;touch.close();passed('tablet touch drag draws one connected terrain stroke')
  p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',saved)
  p.goto(BASE+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  assert p.evaluate('nebeljagdTestState().world.stats.terrainObstacles.strokes')==2
  p.click('#startBtn');p.evaluate('nebeljagdInspect({x:0,z:11,health:100})');p.wait_for_function('nebeljagdTestState().elapsed>.2')
  hit=p.evaluate('nebeljagdInspectTerrain({from:{x:12,y:3,z:-16},to:{x:12,y:3,z:16}})');assert hit['hit']['type']=='terrainRidge'
  clear=p.evaluate('nebeljagdInspectTerrain({from:{x:0,y:3,z:-16},to:{x:0,y:3,z:16},position:{x:0,y:0,z:0}})');assert clear['hit'] is None and abs(clear['resolved']['x'])<.01
  inside=p.evaluate('nebeljagdInspectTerrain({position:{x:12,y:0,z:0}})');assert abs(inside['resolved']['z'])>5
  passed('generated game blocks movement and shots at the ridge and keeps the erased passage clear')
  p.keyboard.press('Escape');(OUT/'forest-ridge.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));
  # Exercise the four materials in the actual renderer, using editor-authored data.
  p.close()
  for biome in ['snow','desert','swamp','dense-forest']:
   m=json.loads(json.dumps(saved));m['landscape']['obstacles'][0]['biome']='forest' if biome=='dense-forest' else biome
   if biome=='dense-forest':m['landscape']['obstacles'][0]['style']='forest'
   q=c.new_page();q.set_default_timeout(240000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and 'Shader' in e.text else None)
   q.goto(BASE+'/release.json');q.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',m)
   q.goto(BASE+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');q.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0');q.click('#startBtn');q.evaluate('nebeljagdInspect({x:0,z:11,health:100})');q.wait_for_function('nebeljagdTestState().elapsed>.2');q.keyboard.press('Escape');
   if biome=='dense-forest':
    assert q.evaluate('nebeljagdTestState().world.stats.terrainObstacles.forestTrees')>10
    assert q.evaluate('nebeljagdInspectTerrain({from:{x:12,y:3,z:-16},to:{x:12,y:3,z:16}}).hit') is not None
    assert q.evaluate('nebeljagdInspectTerrain({position:{x:0,y:0,z:0}}).resolved.x')==0
    report['woodlandDetails']=q.evaluate('nebeljagdTestState().world.stats.woodlandDetails')
   (OUT/(biome+'-ridge.png')).write_bytes(base64.b64decode(q.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));q.close()
  passed('four biome materials and dense forest render without shader errors; a cut through the forest stays passable')
  m=json.loads(json.dumps(fixture));m['objects']=[{'id':'staff','name':'Runenmauerstab','kind':'runeWallStaff','variant':'kit-tripo-rune-wall-staff','position':[0,-14],'rotation':0,'scale':1,'rarity':'common'},{'id':'tree','name':'Baum im Ziel','kind':'tree','variant':'kit-user-tree1','position':[0,-7],'rotation':0,'scale':.7}]
  q=c.new_page();q.set_default_timeout(240000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.goto(BASE+'/release.json');q.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',m);q.goto(BASE+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');q.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0');q.click('#startBtn');q.evaluate('nebeljagdInspect({x:0,z:-14,direction:0})');q.wait_for_function('nebeljagdTestState().equippedWeapon==="runeWallStaff"');q.wait_for_function('nebeljagdTestState().elapsed>.4');pixel=q.evaluate('nebeljagdProjectPoint({x:0,z:-7})');q.mouse.move(pixel['x'],pixel['y']);q.keyboard.down('f');q.wait_for_function('nebeljagdTestState().combat.runeWall.aimRange?.radius===14');assert q.evaluate('nebeljagdTestState().combat.runeWall.valid');assert len(q.evaluate('nebeljagdTestState().combat.runeWall.segments'))==2;q.keyboard.up('f');q.wait_for_function('nebeljagdTestState().combat.runeWall.solid && nebeljagdTestState().combat.runeWall.age>.35');q.keyboard.press('Escape');assert q.evaluate('nebeljagdTestState().combat.runeWall.barriers')==2;(OUT/'wall-around-tree.png').write_bytes(base64.b64decode(q.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));q.close();passed('real staff targets a tree and creates two visible solid wall sections')
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256'];report['status']='passed'
 except BaseException as e:
  report['failure']=str(e);report['status']='failed'
  try:p.screenshot(path=str(OUT/'failure.png'))
  except:pass
  raise
 finally:
  (OUT/'report.json').write_text(json.dumps(report,indent=2));browser.close()
