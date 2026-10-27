"""Verify restored archived grass against actual world visuals in both qualities."""
import json,os,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];errors=[];shots=[];captures=[]
base=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
game=os.environ.get('NEBELJAGD_GAME_PATH','/nebeljagd.html')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for quality in ['low','high']:
  page=b.new_page(viewport={'width':1200,'height':800});page.set_default_timeout(120000)
  page.route_web_socket('**/*', lambda ws: None)
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
  response=page.goto(base+game+'?inspect=1&quality='+quality,wait_until='domcontentloaded')
  served_hash=hashlib.sha256(response.body()).hexdigest()
  page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls > 0')
  page.locator('#startBtn').click()
  page.evaluate('nebeljagdInspect({x:10,z:-30,health:100,direction:Math.PI})')
  page.wait_for_function('nebeljagdTestState().hiddenInGrass && nebeljagdTestState().character.opacity < .5')
  before=page.evaluate('nebeljagdTestState().elapsed')
  page.wait_for_function('t=>nebeljagdTestState().elapsed>t+.8',arg=before)
  state=page.evaluate('''()=>{const s=nebeljagdTestState();return {quality:s.quality,hiddenInGrass:s.hiddenInGrass,hiddenFromOtherPlayers:s.hiddenFromOtherPlayers,opacity:s.character.opacity,grass:s.world.stats.grassRendering,patch:s.world.grassPatches.find(p=>p.id==='obj-grass-start'),rendering:s.rendering}}''')
  state['servedHTMLSHA256']=served_hash
  assert state['hiddenInGrass'] and state['hiddenFromOtherPlayers']
  assert state['grass']['crossedStalkDensityPerSquareMeter']>30
  assert state['patch']['crossedStalkCount']==state['patch']['instanceCount']*4
  assert state['patch']['minBladeHeight']>=2.25
  assert state['patch']['maxBladeHeight']<=2.6
  path=root/f'docs/screenshots/restored-grass-{quality}.png';page.screenshot(path=str(path));shots.append(str(path.relative_to(root)));captures.append(state)
  print('PASS',quality,json.dumps(state),flush=True)
  page.close()
 b.close()
assert not errors,errors
report={'status':'passed','url':base,'captures':captures,'errors':errors,'screenshots':shots,'historicalSource':'archive/nebeljagd-3d-v011-source.zip/src/world.js','note':'Chromium software-WebGL, not a physical iPad performance claim.'}
(root/'docs/grass-restoration-check.json').write_text(json.dumps(report,indent=2)+'\n')
