"""Verify the cleared project in the generated editor and game, preserving assets."""
import base64,hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/empty-world';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5442')
source=json.loads((ROOT/'worldmap.json').read_text());backup=json.loads((ROOT/'docs/map-backups/worldmap-2026-11-20-before-clear.json').read_text())
report={'status':'running','errors':[],'checks':[],'mapSha256':hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()}
assert len(backup['objects'])==1095
assert {r['biome'] for r in source['regions']}=={'snow','forest','dunes'}
assert source['bounds']['maxX']>backup['bounds']['maxX']
assert source['landscape']['worldEdge']=='floating'
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1280,'height':900});p.set_default_timeout(240000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'VALIDATE' in e.text) else None)
 try:
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  if p.locator('#editor-start-dialog').evaluate('(e)=>e.open'):p.click('#start-project-map')
  assert p.evaluate('nebeljagdMapTestState().map')==source
  report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)')
  for k in ['objects','paths','barriers','rivers','places','spawnAreas']:assert source[k]==[]
  for k in ['terrain','biomes','obstacles','windZones']:assert source['landscape'][k]==[]
  kinds=p.locator('#palette-kind').evaluate('(e)=>[...e.options].map(o=>o.value)')
  assert 'house' in kinds and 'chest' in kinds and 'tree' in kinds
  p.screenshot(path=str(OUT/'empty-editor.png'));report['checks'].append('editor opens the empty three-biome project with the placement catalogue intact');print('PASS empty editor and intact catalogue',flush=True)
  p.goto(BASE+'/magebrawl.html?inspect=1&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
  p.click('#startBtn');p.evaluate('nebeljagdInspect({x:30,z:-42})');p.wait_for_function('nebeljagdTestState().elapsed>.2')
  s=p.evaluate('nebeljagdTestState()');assert s['world']['stats']['worldEdge']['mode']=='floating';assert s['world']['objects']==[] and s['world']['trees']==[] and s['houses']==[]
  assert s['chests']==[] and s['weaponDrops']==[] and s['practiceActors']==[]
  assert s['world']['stats']['terrainObstacles']['strokes']==0
  assert all(s['world']['stats']['woodlandDetails'][k]==0 for k in ['flowers','mushrooms','stones'])
  assert p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent).buildId')==report['build']['buildId']
  (OUT/'empty-game.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  p.evaluate('nebeljagdInspect({x:70,z:780})');p.wait_for_timeout(1800)
  (OUT/'floating-edge.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  report['checks'].append('game contains no scenery, loot, automatic decorations or practice enemies');print('PASS empty game without automatic objects',flush=True)
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256'];report['status']='passed'
 except BaseException as e:report['status']='failed';report['failure']=str(e);raise
 finally:(OUT/'report.json').write_text(json.dumps(report,indent=2));b.close()
