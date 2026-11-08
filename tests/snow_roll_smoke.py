"""Generated game: keyboard and touch rolls leave body tracks, walking leaves soles."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/natural-details';OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createLobbyMap} from './src/lobby-map.js';
const map=createLobbyMap();map.objects=[];map.paths=[];
for(const region of map.regions){region.biome='snow';region.color='#dce7e8';}
map.gameplay.spawnPosition=[0,0];console.log(JSON.stringify(map));
"""],cwd=ROOT))
source_hash=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
errors=[];report={}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  ctx=b.new_context(viewport={'width':1100,'height':780},has_touch=True)
  ctx.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
  p=ctx.new_page();p.set_default_timeout(180000)
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  p.goto(URL+'/nebeljagd.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
  p.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
  p.locator('#startBtn').click();p.evaluate('nebeljagdInspect({x:0,z:0,direction:Math.PI})')
  p.wait_for_function('nebeljagdTestState().character.snowWeight>.9')
  before=p.evaluate('nebeljagdTestState().snowFootprints.bySource.player')
  p.keyboard.press('Space')
  p.wait_for_function('nebeljagdTestState().snowFootprints.rollSegmentsCreated>0 && nebeljagdTestState().rollRemaining===0')
  roll=p.evaluate('nebeljagdTestState().snowFootprints')
  assert roll['bySource']['player']['footprintsCreated']==before['footprintsCreated']
  assert roll['activeRollSegments']>5
  p.keyboard.press('Escape')
  (OUT/'snow-roll.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  p.keyboard.press('Escape');p.keyboard.down('KeyD')
  p.wait_for_function('n=>nebeljagdTestState().snowFootprints.bySource.player.footprintsCreated>n+2',arg=roll['bySource']['player']['footprintsCreated'])
  p.keyboard.up('KeyD');walk=p.evaluate('nebeljagdTestState().snowFootprints')
  p.wait_for_function('nebeljagdTestState().rollCooldown===0')
  p.locator('.dash-button').tap()
  p.wait_for_function('n=>nebeljagdTestState().snowFootprints.rollSegmentsCreated>n+4 && nebeljagdTestState().rollRemaining===0',arg=roll['rollSegmentsCreated'])
  touch=p.evaluate('nebeljagdTestState().snowFootprints')
  assert touch['bySource']['player']['footprintsCreated']==walk['bySource']['player']['footprintsCreated']
  assert touch['count']<=touch['maximum']
  assert not errors,errors
  assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==source_hash
  report={'keyboardRoll':roll,'walking':walk,'touchRoll':touch,'errors':errors}
  print('PASS keyboard/touch rolls create continuous snow tracks without soles; walking resumes footprints',flush=True)
 finally:
  b.close();(OUT/'snow-roll-report.json').write_text(json.dumps(report,indent=2))
