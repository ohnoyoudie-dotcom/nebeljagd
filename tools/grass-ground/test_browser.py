from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
import json,threading,traceback,copy
ROOT=Path(__file__).resolve().parents[2];REPORT=ROOT/'grass-test';REPORT.mkdir(exist_ok=True)
server=ThreadingHTTPServer(('127.0.0.1',8765),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results={};errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'])
  context=browser.new_context(viewport={'width':1440,'height':900},accept_downloads=True)
  editor=context.new_page();editor.on('pageerror',lambda e:errors.append('editor: '+str(e)))
  editor.goto('http://127.0.0.1:8765/grass-build/map-editor.html');editor.wait_for_function('!!window.nebeljagdMapTestState')
  initial=editor.evaluate('nebeljagdMapTestState()');count=len(initial['map']['objects'])
  editor.select_option('#rei-type','rei-grass')
  editor.locator('#rei-height').evaluate('(e)=>{e.value="0.8";e.dispatchEvent(new Event("change",{bubbles:true}));}')
  active=editor.evaluate('nebeljagdMapTestState()')
  assert active['map']['groundCover']['type']=='rei-grass'
  assert active['map']['groundCover']['height']==.8
  assert len(active['map']['objects'])==count
  editor.click('#undo');assert editor.evaluate('nebeljagdMapTestState().map.groundCover.height')==.65
  editor.click('#redo');assert editor.evaluate('nebeljagdMapTestState().map.groundCover.height')==.8
  results['editor']={'unchangedObjectCount':count,'undoRedo':True,'overlayRegions':editor.locator('[data-rei-ground-overlay]').count(),'settings':active['map']['groundCover']}
  with editor.expect_download() as dl:editor.click('#export-json')
  dl.value.save_as(str(REPORT/'worldmap-grass.json'))
  editor.select_option('#rei-type','existing');editor.set_input_files('#json-file-input',str(REPORT/'worldmap-grass.json'))
  editor.wait_for_function('nebeljagdMapTestState().map.groundCover.type==="rei-grass"')
  results['editor']['jsonRoundtrip']=True
  editor.locator('.sidebar').evaluate('e=>e.scrollTop=250');editor.screenshot(path=str(REPORT/'editor-grass.png'))
  # Full-map editor tests above. GPU CI uses a smaller test map, not a weaker shader.
  small=copy.deepcopy(active['map']);square=[[-60,-60],[60,-60],[60,60],[-60,60]]
  small.update(id='rei-grass-render-test',name='Rei-Gras · Testwiese',bounds={'minX':-70,'minZ':-70,'maxX':70,'maxZ':70},objects=[],places=[],rivers=[])
  small['island']['points']=square
  small['regions']=[{'id':'meadow-test','name':'Testwiese','biome':'meadow','color':'#80a66a','points':square,'label':[0,0]}]
  small['paths']=[{'id':'test-path','name':'Grasfreier Weg','kind':'trail','width':4,'points':[[-45,8],[45,8]]}]
  small['spawnAreas']=[{'id':'test-spawn','name':'Teststart','position':[0,0],'radius':8,'capacity':50}]
  small['gameplay']['spawnPosition']=[0,0]
  (REPORT/'testwiese.json').write_text(json.dumps(small))
  editor.set_input_files('#json-file-input',str(REPORT/'testwiese.json'))
  editor.wait_for_function('nebeljagdMapTestState().map.id==="rei-grass-render-test"')
  # Launch through the actual editor handoff; lower resolution only for software GPU.
  with editor.expect_popup() as pop:editor.click('#playtest-world')
  game=pop.value;game.set_viewport_size({'width':720,'height':480});game.bring_to_front()
  game.on('pageerror',lambda e:errors.append('game: '+str(e)))
  game.on('console',lambda m:errors.append('console: '+m.text[:6000]) if m.type=='error' and 'favicon' not in m.text else None)
  game.wait_for_function('!!window.nebeljagdTestState',timeout=90000)
  game.wait_for_timeout(1000)
  state=game.evaluate('nebeljagdTestState()')
  results['game']={'testMap':True,'groundCover':state['world']['stats'].get('groundCover'),'phase':state['phase'],'rendering':state['rendering']}
  assert results['game']['groundCover']['enabled']
  assert results['game']['groundCover']['visibleInstances']>0
  assert results['game']['groundCover']['settings']['height']==.8
  # Enter normal gameplay using the user-facing start button.
  game.locator('#startBtn').click(force=True)
  first=game.evaluate('nebeljagdGrassGroundState().windTime')
  game.wait_for_function('(first)=>nebeljagdGrassGroundState().windTime>first',arg=first,timeout=20000)
  results['game']['windTimeAdvances']=True
  results['game']['windTimes']=[first,game.evaluate('nebeljagdGrassGroundState().windTime')]
  game.screenshot(path=str(REPORT/'grass-meadow.png'),timeout=60000)
  game.wait_for_timeout(600)
  game.screenshot(path=str(REPORT/'grass-meadow-wind.png'),timeout=60000)
  results['meadow']=game.evaluate('nebeljagdGrassGroundState()')
  if errors:raise AssertionError('Browser errors: '+repr(errors))
  results['passed']=True;browser.close()
except Exception:
 results['passed']=False;results['traceback']=traceback.format_exc();raise
finally:
 (REPORT/'results.json').write_text(json.dumps({'results':results,'errors':errors},indent=2));server.shutdown()
