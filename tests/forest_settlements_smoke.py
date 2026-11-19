"""Inspect the authored forest in the real editor and runtime; never write repository data."""
import os,json,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('FOREST_URL','http://127.0.0.1:5376')
DEV='5236' in BASE
OUT=ROOT/'test-results/forest-settlements';OUT.mkdir(parents=True,exist_ok=True)
source=json.loads((ROOT/'worldmap.json').read_text());layout=json.loads((ROOT/'docs/forest-settlements.json').read_text())
report={'status':'running','checks':[],'errors':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
def passed(name):report['checks'].append(name);print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':1440,'height':1000})
 def page():
  q=context.new_page();q.set_default_timeout(360000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' and ('Shader' in m.text or 'VALIDATE' in m.text) else None);return q
 try:
  editor=page();print('LOAD EDITOR',flush=True);editor.goto(BASE+'/map-editor.html',wait_until='domcontentloaded',timeout=360000)
  editor.wait_for_function('window.nebeljagdMapTestState');
  if editor.locator('#editor-start-dialog').evaluate('(e)=>e.open'):editor.click('#start-project-map')
  state=editor.evaluate('nebeljagdMapTestState()');assert len(state['map']['objects'])==len(source['objects']);assert len(state['map']['paths'])==len(source['paths'])
  assert {o['id'] for o in state['map']['objects']}=={o['id'] for o in source['objects']}
  report['build']=editor.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent||"null")')
  editor.screenshot(path=str(OUT/'editor-forest.png'));passed('generated editor opens the complete authored forest with all original objects preserved')
  house=next(o for o in source['objects'] if o['id'].startswith('forest-world-lindenwacht') and o['kind']=='house')
  editor.locator('#feature-object-'+house['id']).click(force=True)
  editor.wait_for_function('(id)=>nebeljagdMapTestState().selection?.id===id',arg=house['id'])
  passed('new houses remain individually selectable in the existing editor')
  editor.close()
  game=page();print('LOAD GAME',flush=True);game.goto(BASE+('/game.html' if DEV else '/magebrawl.html')+'?quality=low&inspect=1',wait_until='domcontentloaded',timeout=360000)
  game.wait_for_function('window.nebeljagdTestState && !document.querySelector("#startBtn").disabled',timeout=360000)
  state=game.evaluate('nebeljagdTestState()');assert len(state['world']['objects'])==len(source['objects']);assert len(state['houses'])==layout['houses']+1
  assert state['arrivalMap']['mode']=='rendered-world' and state['arrivalMap']['houses']==layout['houses']+1
  if not DEV:assert game.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent).buildId')==report['build']['buildId']
  game.click('#startBtn');game.wait_for_selector('#arrivalMap',state='visible');game.screenshot(path=str(OUT/'start-map-forest.png'));passed('actual forest and all settlements appear in the rendered start map')
  for name,x,z in [('town',-170,-80),('north-village',95,-435),('west-village',-405,40)]:
   game.evaluate('(p)=>nebeljagdInspect(p)',{'x':x,'z':z,'health':100,'elapsed':0})
   game.wait_for_function('nebeljagdTestState().elapsed > .35');s=game.evaluate('nebeljagdTestState()');assert abs(s['position']['x']-x)<1 and abs(s['position']['z']-z)<1
   assert not s['world']['isWater'];game.keyboard.press('Escape');hidden=game.add_style_tag(content='#pauseScreen{visibility:hidden!important}');game.screenshot(path=str(OUT/(name+'.png')));hidden.evaluate('(e)=>e.remove()');game.keyboard.press('Escape');passed(name+': square is accessible and the live scene renders')
  plot=layout['plots'][0];h=next(o for o in source['objects'] if o['id']==plot['id']);a=plot['approach'];t=plot['threshold'];dx=t[0]-a[0];dz=t[1]-a[1];length=(dx*dx+dz*dz)**.5
  inside={'x':t[0]+dx/length*2,'z':t[1]+dz/length*2,'elapsed':0,'health':100}
  game.evaluate('(p)=>nebeljagdInspect(p)',inside);game.wait_for_function('nebeljagdTestState().elapsed > .25');s=game.evaluate('nebeljagdTestState()')
  assert abs(s['position']['x']-inside['x'])<.5 and abs(s['position']['z']-inside['z'])<.5
  assert s['shelter'];passed('a newly placed house can be entered through its oriented doorway')
  report['rendering']=s['rendering'];assert not report['errors'],report['errors'];report['status']='passed'
 except Exception as e:report['status']='failed';report['failure']=str(e);raise
 finally:
  (OUT/'report.json').write_text(json.dumps(report,indent=2));browser.close()
