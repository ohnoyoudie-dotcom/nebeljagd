from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
import threading,json,traceback,math,copy
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'grass-test-v2';OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',8765),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results={};errors=[]
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding'])
  context=browser.new_context(viewport={'width':1100,'height':750},accept_downloads=True)
  editor=context.new_page();editor.on('pageerror',lambda e:errors.append('editor: '+str(e)))
  editor.goto('http://127.0.0.1:8765/grass-build/map-editor.html');editor.wait_for_function('!!window.nebeljagdMapTestState')
  original=editor.evaluate('nebeljagdMapTestState().map');original_count=len(original['objects'])
  editor.select_option('#rei-type','rei-grass')
  state=editor.evaluate('nebeljagdMapTestState()');results['newSettings']=state['map']['groundCover']
  editor.locator('#rei-height').evaluate('(e)=>{e.value="0.9";e.dispatchEvent(new Event("change",{bubbles:true}));}')
  assert editor.evaluate('nebeljagdMapTestState().map.groundCover.height')==.9
  editor.click('#undo');assert editor.evaluate('nebeljagdMapTestState().map.groundCover.height')==.85
  editor.click('#redo');assert editor.evaluate('nebeljagdMapTestState().map.groundCover.height')==.9
  assert len(editor.evaluate('nebeljagdMapTestState().map.objects'))==original_count
  small=copy.deepcopy(state['map']);square=[[-60,-60],[60,-60],[60,60],[-60,60]]
  small.update(id='rei-grass-render-test',name='Dichte Rei-Wiese · Prüffläche',bounds={'minX':-70,'minZ':-70,'maxX':70,'maxZ':70},objects=[],places=[],rivers=[])
  small['island']['points']=square
  small['regions']=[{'id':'meadow-test','name':'Testwiese','biome':'meadow','color':'#80a66a','points':square,'label':[0,0]}]
  small['paths']=[{'id':'test-path','name':'Grasfreier Weg','kind':'trail','width':4,'points':[[-45,8],[45,8]]}]
  small['spawnAreas']=[{'id':'test-spawn','name':'Teststart','position':[0,0],'radius':8,'capacity':50}]
  small['gameplay']['spawnPosition']=[0,0]
  small['groundCover'].update(version=2,height=.85,density=9.6,color='#659a36',groundBlend=.35)
  small['objects']=[{'id':'test-chest','name':'Testtruhe','kind':'chest','variant':'wood','position':[0,4],'rotation':0,'scale':1},{'id':'test-chest-rot','name':'Gedrehte Truhe','kind':'chest','variant':'wood','position':[8,0],'rotation':.8,'scale':1.4},{'id':'test-rock','name':'Fels','kind':'rock','variant':'granite','position':[-6,-5],'rotation':.3,'scale':1},{'id':'test-crate','name':'Holzkiste','kind':'crate','variant':'kit-wood','position':[6,-6],'rotation':.3,'scale':1.2}]
  path=OUT/'Testwiese.json';path.write_text(json.dumps(small));editor.set_input_files('#json-file-input',str(path));editor.wait_for_function('nebeljagdMapTestState().map.id==="rei-grass-render-test"')
  with editor.expect_download() as dl:editor.click('#export-json')
  dl.value.save_as(str(OUT/'roundtrip.json'))
  saved=json.loads((OUT/'roundtrip.json').read_text());assert saved['groundCover']['density']==9.6 and len(saved['objects'])==4
  results['editor']={'undoRedo':True,'jsonRoundTrip':True,'objectsPreserved':True,'tavernVariants':editor.locator('#palette-variant').count()}
  editor.evaluate('()=>{const original=window.open;window.open=(url,...args)=>original.call(window,url+"&inspect=1",...args)}')
  with editor.expect_popup() as pp:editor.click('#playtest-world')
  game=pp.value;game.set_viewport_size({'width':850,'height':600});game.bring_to_front()
  game.on('pageerror',lambda e:errors.append('game: '+str(e)))
  game.on('console',lambda m:errors.append(m.text[:5000]) if m.type=='error' and 'favicon' not in m.text else None)
  game.wait_for_function('!!window.nebeljagdMovementProbe',timeout=90000)
  game.locator('#startBtn').click(force=True)
  game.wait_for_function('nebeljagdGrassGroundState().pendingChunks===0',timeout=60000)
  physics=game.evaluate('nebeljagdPhysicsState()');results['physics']=physics
  assert physics['chestBodies']==2 and physics['crateBodies']==1,physics
  hits=[]
  for fr,to in [([0,1],[0,6]),([0,7],[0,1]),([-3,4],[3,4]),([3,4],[-3,4])]:
   hits.append(game.evaluate('(x)=>nebeljagdMovementProbe(x)',{'from':fr,'to':to,'actors':False}))
  assert hits[0]['z']<=3.01 and hits[1]['z']>=4.99 and hits[2]['x']<=-1.28 and hits[3]['x']>=1.28,hits
  results['chestFourSidesAndDash']=hits
  for name,cx,cz,angle,extent in [('rotatedScaledChest',8,0,.8,.87*1.4),('rotatedCrate',6,-6,.3,.56*1.2)]:
   c=math.cos(angle);s=math.sin(angle)
   hit=game.evaluate('(x)=>nebeljagdMovementProbe(x)',{'from':[cx-3*c,cz+3*s],'to':[cx+3*c,cz-3*s],'actors':False})
   local_x=(hit['x']-cx)*c-(hit['z']-cz)*s
   assert local_x<-(extent+.40),(name,hit,local_x)
   results[name]=hit
  actor=physics['liveActors'][0];ax,az=actor['x'],actor['z']
  hit=game.evaluate('(x)=>nebeljagdMovementProbe(x)',{'from':[ax-3,az],'to':[ax+3,az]});assert hit['x']<ax-.8,hit
  results['actorDashBlocked']=hit
  reverse=game.evaluate('(x)=>nebeljagdActorProbe(x)',{'id':actor['id'],'from':[-3,0],'to':[3,0]});assert reverse['x']<-.9,reverse
  results['actorBlockedByPlayer']=reverse
  game.evaluate('nebeljagdInspect({x:0,z:2.65})');game.keyboard.press('KeyE')
  game.wait_for_function('nebeljagdTestState().chests.some(c=>c.id==="test-chest"&&c.opened)',timeout=15000)
  results['chestOpens']=True
  game.evaluate('nebeljagdInspect({x:1,z:0})')
  first=game.evaluate('nebeljagdGrassGroundState().windTime')
  game.wait_for_function('(v)=>nebeljagdGrassGroundState().windTime>v+.3',arg=first,timeout=20000)
  results['windTimeAdvances']=True;results['grass']=game.evaluate('nebeljagdGrassGroundState()');results['vision']=game.evaluate('nebeljagdTestState().vision')
  assert results['grass']['visibleInstances']>10000
  assert results['vision']['appearance']=='soft-transparent-charcoal'
  game.screenshot(path=str(OUT/'meadow.png'),timeout=60000)
  game.wait_for_timeout(900);game.screenshot(path=str(OUT/'meadow-wind.png'),timeout=60000)
  results['render']=game.evaluate('nebeljagdTestState().rendering')
  if errors:raise AssertionError(errors)
  results['passed']=True;browser.close()
except Exception:
 results['passed']=False;results['traceback']=traceback.format_exc();print(results['traceback']);raise
finally:
 (OUT/'results.json').write_text(json.dumps({'results':results,'errors':errors},indent=2));server.shutdown()
