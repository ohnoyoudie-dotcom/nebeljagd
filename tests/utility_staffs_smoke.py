"""Generated editor plus real uploaded utility staffs, mouse/touch blink and projectile guard."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5242').rstrip('/')
OUT=ROOT/'test-results/utility-staffs';OUT.mkdir(parents=True,exist_ok=True)
map_hash=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
report={'checks':[],'errors':[]}
def state(p):return p.evaluate('nebeljagdTestState()')
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def pause_at(p,condition):
 p.evaluate('''condition=>{const reached=new Function('s','return '+condition);function frame(){if(reached(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(frame);}requestAnimationFrame(frame);if(nebeljagdTestState().phase==='paused')document.querySelector('#resumeBtn').click();}''',condition)
def capture(p,name):
 (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));(OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  c=browser.new_context(viewport={'width':900,'height':700});p=c.new_page();p.set_default_timeout(120000)
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');before=p.evaluate('nebeljagdMapTestState().map.objects')
  p.locator('#editor-tab-objects').click();p.locator('#editor-tool-objects-place').click()
  for slug in ['blink','reflection']:
   p.locator('#palette-kind').select_option(slug+'Staff');p.locator('#palette-variant').select_option('kit-tripo-'+slug+'-staff');p.locator('#add-object-center').click()
   assert p.locator('#world-objects use[href="#world-object-'+slug+'Staff"]').count()>0
  p.screenshot(path=str(OUT/'editor.png'));p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');objects=p.evaluate('nebeljagdMapTestState().map.objects');assert objects[:-2]==before
  assert [o['kind'] for o in objects[-2:]]==['blinkStaff','reflectionStaff'];passed('Both real utility staffs place and persist in the editor, preserving the existing map');c.close()
  for slug,touch in [('blink',False),('blink',True),('reflection',False)]:
   mode=slug+('-touch' if touch else '-mouse');variant='kit-tripo-'+slug+'-staff';fixture['objects']=[{'id':'staff','name':slug,'kind':slug+'Staff','variant':variant,'position':[0,-14],'rotation':0,'scale':1,'rarity':'common'}]
   c=browser.new_context(viewport={'width':900,'height':700},has_touch=touch,is_mobile=touch)
   c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');');p=c.new_page();p.set_default_timeout(120000)
   p.on('pageerror',lambda e:(report['errors'].append(str(e)),print('PAGEERROR',str(e),flush=True)));p.on('console',lambda m:(report['errors'].append(m.text),print('CONSOLEERROR',m.text,flush=True)) if m.type=='error' else None);p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
   p.goto(BASE+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('t=>nebeljagdTestState().equippedWeapon===t',arg=slug+'Staff');assert state(p)['combat']['heldModel']['model']=='tripo'
   p.evaluate('nebeljagdInspect({x:-8,z:-12,direction:0})');capture(p,mode+'-held')
   if slug=='blink':
    start=state(p)['position']
    if touch:
     box=p.locator('#attackBtn').bounding_box();cdp=c.new_cdp_session(p);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2,'id':1}]})
    else:
     pixel=p.evaluate('nebeljagdProjectPoint({x:-8,z:-4})');p.mouse.move(pixel['x'],pixel['y']);p.keyboard.down('f')
    p.wait_for_function('nebeljagdTestState().combat.blink.aimRange?.radius>0');first=state(p)['combat']['blink']['aimRange']['radius']
    p.wait_for_function('nebeljagdTestState().combat.blink.aimRange?.radius===8');s=state(p);assert first<=8;assert s['combat']['blink']['targetRadius']==.6;assert s['combat']['blink']['valid'];assert s['position']==start;capture(p,mode+'-aim')
    pause_at(p,'s.combat.blink.casts===1')
    if touch:cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:p.keyboard.up('f')
    p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p);distance=((s['position']['x']-start['x'])**2+(s['position']['z']-start['z'])**2)**.5;assert 6<distance<=8.01;assert s['attackCooldown']>3.5
    assert s['combat']['blink']['visuals']['active'];capture(p,mode+'-portals');frozen=state(p)['combat']['blink'];p.wait_for_timeout(100);assert state(p)['combat']['blink']==frozen
    p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.blink.visuals.active');passed(mode+': growing 8m reach, fixed small landing ring, real teleport, portals, cooldown and pause')
   else:
    hp=state(p)['health'];pause_at(p,'s.combat.reflection.active && s.combat.reflection.remaining<1.5');p.keyboard.press('f');p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['combat']['reflection']['visible'];capture(p,mode+'-shield')
    result=p.evaluate('nebeljagdInspectGuardHit()');assert result['blocked'] and state(p)['health']==hp
    pause_at(p,'s.combat.reflection.blocks===1 && s.combat.reflection.hitAge>.05');p.wait_for_function('nebeljagdTestState().phase==="paused"');capture(p,mode+'-impact')
    frozen=state(p)['combat']['reflection'];p.wait_for_timeout(100);assert state(p)['combat']['reflection']==frozen
    result=p.evaluate('nebeljagdInspectGuardHit("area")');assert result['damage']==12 and state(p)['health']==hp-12
    p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.reflection.active');assert state(p)['attackCooldown']>0
    result=p.evaluate('nebeljagdInspectGuardHit()');assert result['damage']==12
    passed('reflection: visible protective dome, projectile blocked with impact ripple, area damage admitted, pause, expiry and cooldown')
   c.close()
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==map_hash;report.update(status='passed',mapSha256=map_hash)
 except BaseException as e:
  report.update(status='failed',failure=str(e))
  try:(OUT/'failure-state.json').write_text(json.dumps(state(p),indent=2));p.screenshot(path=str(OUT/'failure.png'))
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
