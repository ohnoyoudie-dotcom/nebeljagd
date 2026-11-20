"""Check the actual rebuilt project map in generated editor and game files."""
import base64,hashlib,json,math,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/green-world';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5441');ENTRY=os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')
source=json.loads((ROOT/'worldmap.json').read_text());plan=json.loads((ROOT/'docs/green-world-layout.json').read_text())
report={'status':'running','errors':[],'checks':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
def check(s):report['checks'].append(s);print('PASS',s,flush=True)
def capture(p,name):(OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
def inspect(p,x,z):
 p.evaluate('v=>nebeljagdInspect(v)',{'x':x,'z':z,'health':100,'elapsed':0})
 p.wait_for_function('nebeljagdTestState().elapsed>.15')
 s=p.evaluate('nebeljagdTestState()');assert math.hypot(s['position']['x']-x,s['position']['z']-z)<.8,(x,z,s['position'])
 return s
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 c=b.new_context(viewport={'width':1280,'height':900});p=c.new_page();p.set_default_timeout(360000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'VALIDATE' in e.text) else None)
 try:
  print('LOAD generated editor',flush=True);p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  if p.locator('#editor-start-dialog').evaluate('(e)=>e.open'):p.click('#start-project-map')
  m=p.evaluate('nebeljagdMapTestState().map');assert m==source
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
  assert len(m['landscape']['obstacles'])==plan['obstacles'];p.screenshot(path=str(OUT/'editor-map.png'))
  house=next(o for o in source['objects'] if o['id'].startswith('green-world-lindenwacht') and o['kind']=='house')
  p.locator('#feature-object-'+house['id']).click(force=True);assert p.evaluate('nebeljagdMapTestState().selection.id')==house['id']
  p.click('#editor-tool-paint-obstacles');assert p.locator('#terrain-obstacles').count()==1
  check('generated editor loads the exact new map; houses remain selectable and ridge strokes editable')
  print('LOAD generated game',flush=True);p.goto(BASE+'/'+ENTRY+'?inspect=1&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  s=p.evaluate('nebeljagdTestState()');assert len(s['world']['objects'])==len(source['objects'])
  assert s['world']['stats']['terrainObstacles']['strokes']==plan['obstacles'];assert len(s['houses'])==plan['houses']+1
  assert s['arrivalMap']['mode']=='rendered-world';assert s['arrivalMap']['houses']==plan['houses']+1
  assert p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent).buildId')==report['build']['buildId']
  p.click('#startBtn');p.wait_for_selector('#arrivalMap',state='visible');p.screenshot(path=str(OUT/'arrival-map.png'))
  check('arrival landscape and gameplay contain matching houses and terrain obstacles')
  inspect(p,-170,-80);p.keyboard.down('w')
  try:p.wait_for_function('nebeljagdTestState().position.z< -84')
  finally:p.keyboard.up('w')
  assert abs(p.evaluate('nebeljagdTestState().position.x')+170)<.6;capture(p,'main-street')
  check('real keyboard movement along the wide main street remains unobstructed')
  block=next(x for x in plan['blocks'] if x['place']=='lindenwacht' and len(x['houses'])==2)
  a=block['bounds'];x=(a[0]+a[2])/2;z=(a[1]+a[3])/2
  inspect(p,x,z);capture(p,'town-alley');check('the alley between paired houses is traversable')
  plot=next(x for x in plan['plots'] if x['id']==house['id']);a=plot['approach'];t=plot['threshold'];dx=t[0]-a[0];dz=t[1]-a[1];length=math.hypot(dx,dz)
  s=inspect(p,t[0]+dx/length*2,t[1]+dz/length*2);assert s['shelter'];capture(p,'house-entrance');check('a new block house has a usable entrance and interior')
  for name,variant in [('normal-chest','kit-tripo-chest'),('rare-chest','kit-tripo-rare-chest')]:
   chest=next(o for o in source['objects'] if o['id'].startswith('green-world-') and o['variant']==variant)
   inspect(p,chest['position'][0],chest['position'][1]+3.6);capture(p,name)
  check('normal and rare chest sites have accessible standing space in the real scene')
  for style in ['forest','cliff']:
   ridge=next(r for r in source['landscape']['obstacles'] if r['style']==style);x,z=ridge['points'][1]
   blocked=p.evaluate('v=>nebeljagdInspectTerrain({position:{x:v[0],y:0,z:v[1]}})',[x,z]);assert math.hypot(blocked['resolved']['x']-x,blocked['resolved']['z']-z)>ridge['radius']*.7
   for offset in range(8,85,2):
    q=[x,z+offset];r=p.evaluate('v=>nebeljagdInspectTerrain({position:{x:v[0],y:0,z:v[1]}})',q)
    if math.hypot(r['resolved']['x']-q[0],r['resolved']['z']-q[1])<.1:break
   inspect(p,q[0],q[1]+3);capture(p,style+'-corridor')
  check('painted forest and cliff masses block movement and render with vegetation beside playable corridors')
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256']
  report['status']='passed'
 except BaseException as e:
  report['status']='failed';report['failure']=str(e)
  try:p.screenshot(path=str(OUT/'failure.png'))
  except:pass
  raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
