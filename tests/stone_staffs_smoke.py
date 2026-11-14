"""Real editor/game: the uploaded stone staffs, input, effects, collision and cleanup."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5242').rstrip('/')
OUT=ROOT/'test-results/stone-staffs';OUT.mkdir(parents=True,exist_ok=True)
original_hash=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
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
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');before=p.evaluate('nebeljagdMapTestState().map.objects');p.locator('#editor-tab-objects').click();p.locator('#editor-tool-objects-place').click()
  for kind,slug in [('earthbreakerStaff','earthbreaker'),('runeWallStaff','rune-wall')]:
   p.locator('#palette-kind').select_option(kind);p.locator('#palette-variant').select_option('kit-tripo-'+slug+'-staff');p.locator('#add-object-center').click();assert p.locator('#world-objects use[href="#world-object-'+kind+'"]').count()>0
  p.screenshot(path=str(OUT/'editor.png'));p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');objects=p.evaluate('nebeljagdMapTestState().map.objects');assert objects[:-2]==before;assert [o['kind'] for o in objects[-2:]]==['earthbreakerStaff','runeWallStaff'];passed('Both uploaded stone staffs place and persist in the editor');c.close()
  for kind,slug,touch in [('earthbreakerStaff','earthbreaker',False),('runeWallStaff','rune-wall',False),('runeWallStaff','rune-wall',True)]:
   if os.environ.get('STONE_ONLY') and slug!=os.environ['STONE_ONLY']:continue
   mode=slug+('-touch' if touch else '-mouse');fixture['objects']=[{'id':'staff','name':slug,'kind':kind,'variant':'kit-tripo-'+slug+'-staff','position':[0,-14],'rotation':0,'scale':1,'rarity':'common'}]
   c=browser.new_context(viewport={'width':900,'height':700},has_touch=touch,is_mobile=touch);c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');');p=c.new_page();p.set_default_timeout(120000)
   p.on('pageerror',lambda e:(report['errors'].append(str(e)),print('PAGEERROR',str(e),flush=True)));p.on('console',lambda m:(report['errors'].append(m.text),print('CONSOLEERROR',m.text,flush=True)) if m.type=='error' else None);p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
   p.goto(BASE+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('t=>nebeljagdTestState().equippedWeapon===t',arg=kind);assert state(p)['combat']['heldModel']['model']=='tripo'
   if slug=='earthbreaker':
    target=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1');health=target['health'];damage=state(p)['equippedItem']['damage'];p.evaluate('p=>nebeljagdInspect({x:p.x,z:p.z-4,direction:0})',target['position']);capture(p,mode+'-held');pause_at(p,'s.combat.earthbreaker.active && s.combat.earthbreaker.age>=.2');p.keyboard.press('f');p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['combat']['earthbreaker']['hits']==0;assert state(p)['combat']['earthbreaker']['range']==22 and state(p)['combat']['earthbreaker']['endWidth']==2.8;capture(p,mode+'-warning')
    frozen=state(p)['combat']['earthbreaker'];p.wait_for_timeout(100);assert state(p)['combat']['earthbreaker']==frozen
    pause_at(p,'s.combat.earthbreaker.age>=.72');p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['combat']['earthbreaker']['erupting']>0;capture(p,mode+'-eruption')
    pause_at(p,'s.combat.earthbreaker.age>=.99');p.wait_for_function('nebeljagdTestState().phase==="paused"');capture(p,mode+'-widening');p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.earthbreaker.active');enemy=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1');assert health-enemy['health']==damage,(health,enemy['health']);passed('Earthbreaker: real model, warning, staggered stone eruption, exactly one hit, pause and cleanup')
   else:
    p.evaluate('nebeljagdInspect({x:-8,z:-12,direction:0})');capture(p,mode+'-held')
    if touch:
     b=p.locator('#attackBtn').bounding_box();cdp=c.new_cdp_session(p);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':b['x']+b['width']/2,'y':b['y']+b['height']/2,'id':1}]})
    else:
     elapsed=state(p)['elapsed'];p.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=elapsed+.8);pixel=p.evaluate('nebeljagdProjectPoint({x:-8,z:-7})');p.mouse.move(pixel['x'],pixel['y']);p.keyboard.down('f')
    p.wait_for_function('nebeljagdTestState().combat.runeWall.aimRange?.radius===10');assert state(p)['combat']['runeWall']['valid'];capture(p,mode+'-aim');pause_at(p,'s.combat.runeWall.solid && s.combat.runeWall.age>=.1')
    if touch:cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:p.keyboard.up('f')
    p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['combat']['runeWall']['solid'] and state(p)['combat']['runeWall']['age']<=.22;capture(p,mode+'-rising')
    pause_at(p,'s.combat.runeWall.solid && s.combat.runeWall.age>=.3');p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p);assert s['combat']['runeWall']['health']==50 and s['combat']['runeWall']['barriers']==1;assert s['combat']['runeWall']['width']==7 and s['combat']['runeWall']['visuals']['stoneColor']=='#508bd7';capture(p,mode+'-standing');probe=p.evaluate('nebeljagdInspectStoneBarrier()');assert probe['hit']=='runeWall' and probe['movementShift']>.5,probe
    frozen=state(p)['combat']['runeWall'];p.wait_for_timeout(100);assert state(p)['combat']['runeWall']==frozen
    if touch:
     level=state(p)['level'];probe=p.evaluate('nebeljagdInspectStoneBarrier({damage:50})');assert probe['result']['killed'];pause_at(p,'s.combat.runeWall.visuals.phase==="crumbling"');p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['level']==level
    else:pause_at(p,'s.combat.runeWall.visuals.phase==="crumbling"');p.wait_for_function('nebeljagdTestState().phase==="paused"')
    capture(p,mode+'-crumbling');assert state(p)['combat']['runeWall']['barriers']==0
    p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.runeWall.active');assert p.evaluate('nebeljagdInspectStoneBarrier()') is None;passed(mode+': real model, charged wall footprint, warning, stone blocks/runes, solid movement/projectile cover, pause and '+('destruction' if touch else 'natural expiry')+' cleanup')
   c.close()
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==original_hash;report.update(status='passed',mapSha256=original_hash)
 except BaseException as e:
  report.update(status='failed',failure=str(e))
  try:(OUT/'failure-state.json').write_text(json.dumps(state(p),indent=2));p.screenshot(path=str(OUT/'failure.png'))
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
