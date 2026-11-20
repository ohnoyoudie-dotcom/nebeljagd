"""Real pointer/touch journeys for the direct-tool editor. Uses an isolated map.
NEBELJAGD_URL=http://127.0.0.1:5247 python tests/child_editor_smoke.py
Run again against generated files with URL :5442 and NEBELJAGD_STANDALONE=1.
"""
import copy,hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/child-editor';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5247');STANDALONE=os.environ.get('NEBELJAGD_STANDALONE')=='1'
source=json.loads((ROOT/'worldmap.json').read_text());fixture=copy.deepcopy(source)
fixture.update(id='child-editor-qa',name='Testinsel',bounds={'minX':-160,'minZ':-160,'maxX':160,'maxZ':160},islets=[],objects=[],paths=[],rivers=[],places=[],spawnAreas=[],barriers=[])
fixture['island']['points']=[[-150,-150],[150,-150],[150,150],[-150,150]];fixture['regions']=[{'id':'qa-forest','name':'Wiese','biome':'forest','color':'#5a8844','points':copy.deepcopy(fixture['island']['points']),'label':[0,0]}];fixture['gameplay']['spawnPosition']=[0,0]
report={'status':'running','errors':[],'checks':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
def state(p):return p.evaluate('nebeljagdMapTestState()')
def point(p,x,z):return p.evaluate('a=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...a).matrixTransform(s.getScreenCTM());return {x:q.x,y:q.y}}',[x,z])
def tap(p,x,z):q=point(p,x,z);p.mouse.click(q['x'],q['y'])
def drag(p,a,b):
 a=point(p,*a);b=point(p,*b);p.mouse.move(a['x'],a['y']);p.mouse.down();p.mouse.move(b['x'],b['y'],steps=8);p.mouse.up()
def passed(label):report['checks'].append(label);print('PASS',label,flush=True)
def load_fixture(p):p.locator('#json-file-input').set_input_files({'name':'testinsel.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()})
def ready(p):
 p.wait_for_function('window.nebeljagdMapTestState');
 if p.locator('#editor-start-dialog').evaluate('(e)=>e.open'):p.click('#start-project-map')
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1440,'height':900});p.set_default_timeout(45000);p.on('pageerror',lambda e:report['errors'].append(str(e)))
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');ready(p)
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
  assert state(p)['map']==source;assert p.locator('.simple-tools button:visible').count()==6
  assert state(p)['mode']=='biome';p.screenshot(path=str(OUT/'desktop-land.png'));load_fixture(p)
  p.click('#simple-tool-land');p.click('[data-biome-choice="snow"]');before=state(p)['map'];drag(p,[-70,-40],[-40,-25]);painted=state(p)['map'];assert painted!=before
  p.click('#undo');assert state(p)['map']==before;p.click('#redo');assert state(p)['map']==painted
  p.click('#simple-tool-paths');p.click('#simple-path-cobble');drag(p,[-60,10],[-20,10]);assert any(t['type']=='cobble' for t in state(p)['map']['landscape']['terrain'])
  p.click('#simple-tool-rocks');drag(p,[-70,60],[-40,60]);assert state(p)['map']['landscape']['obstacles'];passed('one-click tools paint landscapes, roads and obstacles; undo/redo restores exact edits')
  p.click('#simple-tool-objects');p.fill('#simple-object-search','seltene truhe');assert p.locator('.simple-asset').count()==1;p.click('.simple-asset');assert state(p)['mode']=='place';assert state(p)['view']['width']<=200
  tap(p,0,0);assert state(p)['map']['objects'][-1]['variant']=='kit-tripo-rare-chest'
  p.click('#simple-tool-move');drag(p,[0,0],[15,15]);obj=state(p)['map']['objects'][-1];assert obj['position']!=[0,0];expect(p.locator('.inspector')).to_be_visible()
  angle=obj['rotation'];p.click('#simple-selection-rotate');assert state(p)['map']['objects'][-1]['rotation']!=angle
  scale=state(p)['map']['objects'][-1]['scale'];p.click('#simple-selection-larger');assert state(p)['map']['objects'][-1]['scale']>scale
  p.click('#simple-selection-copy');assert len(state(p)['map']['objects'])==2;p.click('#simple-selection-delete');assert len(state(p)['map']['objects'])==1;p.click('#undo');assert len(state(p)['map']['objects'])==2
  tap(p,15,15);p.screenshot(path=str(OUT/'desktop-selection.png'));passed('picture search, automatic placement zoom, moving, rotate/resize, duplicate/delete and undo')
  p.click('#simple-tool-objects');p.fill('#simple-object-search','waldhaus');p.click('#simple-asset-house-waldhaus');p.locator('.object-palette > .simple-extra-toggle').click();p.select_option('#palette-house-rooms','2');tap(p,-35,-25);assert state(p)['map']['objects'][-1]['houseRooms']==2
  p.fill('#simple-object-search','zzzunbekannt');expect(p.locator('.simple-library-empty')).to_be_visible();p.click('#simple-reset-search');assert p.locator('.simple-asset').count()>50
  p.click('#simple-group-weapons');assert p.locator('.simple-asset').count()>10;p.screenshot(path=str(OUT/'desktop-library.png'));passed('house customization preserved; all model families searchable with a useful empty state')
  p.click('#simple-tool-move');p.click('#clear-selection') if p.locator('#clear-selection').is_visible() else None
  before=state(p)['map'];drag(p,[45,-35],[55,-25]);assert state(p)['map']==before;assert not state(p)['selection'];passed('dragging empty land pans without moving the island or biome shapes')
  p.click('#simple-tool-erase');p.select_option('#erase-target','objects');tap(p,15,15);assert len(state(p)['map']['objects'])<3;p.click('#undo')
  p.click('#simple-more > summary');p.click('#simple-more-barriers');expect(p.locator('#barrier-draw')).to_be_visible();p.click('#simple-tool-land');assert not p.locator('body').evaluate('(e)=>e.classList.contains("advanced-tools")');passed('eraser and advanced wall tools remain reachable; return to simple tools is immediate')
  # File download is the fallback on browsers without the native save picker.
  p.evaluate('window.showSaveFilePicker=undefined')
  with p.expect_download() as d:p.click('#export-json')
  path=OUT/'saved-map.json';d.value.save_as(path);saved=json.loads(path.read_text());assert saved==state(p)['map']
  p.locator('#json-file-input').set_input_files(str(path));assert state(p)['map']==saved;passed('save and reopen preserve every placed and painted element')
  if STANDALONE:
   with p.expect_popup() as popup:p.click('#playtest-world')
   game=popup.value;game.set_default_timeout(180000);game.on('pageerror',lambda e:report['errors'].append(str(e)));game.wait_for_function('window.nebeljagdTestState');game_state=game.evaluate('nebeljagdTestState()');assert game_state['world']['mapName']==saved['name'];assert game_state['world']['objects']==saved['objects'];game.close();passed('Spielen opens the current edited map in the generated game')
   p.click('#simple-more > summary');p.click('#simple-more-map')
   with p.expect_download() as d:p.click('#export-editor')
   exported=OUT/'reopened-editor.html';d.value.save_as(exported);q=b.new_page();q.on('pageerror',lambda e:report['errors'].append(str(e)));q.goto(exported.as_uri());ready(q);assert state(q)['map']==saved;assert q.locator('.simple-tools').count()==1;q.click('#simple-tool-objects');q.fill('#simple-object-search','sonnenstab');assert q.locator('.simple-asset').count()==1;q.close();passed('exported offline HTML reopens with intact controls, model library and authored data')
  # Actual touch events on a portrait tablet viewport.
  context=b.new_context(viewport={'width':820,'height':1180},has_touch=True,is_mobile=True);t=context.new_page();t.set_default_timeout(45000);t.on('pageerror',lambda e:report['errors'].append(str(e)));t.goto(BASE+'/map-editor.html');ready(t);load_fixture(t)
  t.tap('#simple-tool-objects');t.fill('#simple-object-search','Felsgruppe Wald');t.tap('.simple-asset');q=point(t,0,0);t.touchscreen.tap(q['x'],q['y']);assert len(state(t)['map']['objects'])==1
  t.tap('#simple-tool-move');q=point(t,0,0);r=point(t,15,8);cdp=context.new_cdp_session(t);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':q['x'],'y':q['y']}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':r['x'],'y':r['y']}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert state(t)['map']['objects'][0]['position']!=[0,0]
  assert t.evaluate('document.documentElement.scrollWidth<=innerWidth');t.screenshot(path=str(OUT/'ipad.png'));passed('portrait iPad viewport supports touch placement and dragging without horizontal page overflow')
  t.set_viewport_size({'width':390,'height':844});t.tap('#simple-tool-land');assert t.evaluate('document.documentElement.scrollWidth<=innerWidth');assert t.locator('#map-viewport').bounding_box()['height']>=250;t.screenshot(path=str(OUT/'phone.png'));context.close()
  assert not report['errors'],report['errors'];assert report['mapSha256']==hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest();report['status']='passed'
 except BaseException as e:report['status']='failed';report['failure']=str(e);p.screenshot(path=str(OUT/'failure.png'));raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
