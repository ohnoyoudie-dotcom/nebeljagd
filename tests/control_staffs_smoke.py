"""Actual generated editor/game: both uploaded control staffs and input paths."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/control-staffs';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.getenv('NEBELJAGD_URL','http://127.0.0.1:5242');ENTRY=os.getenv('NEBELJAGD_GAME_ENTRY','magebrawl.html')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
report=dict(checks=[],errors=[],mapSha256=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest())
def state(p):return p.evaluate('nebeljagdTestState()')
def passed(message):report['checks'].append(message);print('PASS',message,flush=True)
def pause_at(p,condition):
 p.evaluate('''condition=>{const reached=new Function('s','return '+condition);function frame(){if(reached(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(frame);}requestAnimationFrame(frame);if(nebeljagdTestState().phase==='paused')document.querySelector('#resumeBtn').click();}''',condition)
def capture(p,name,center=None):
 if center:p.evaluate('center=>nebeljagdInspectCamera({zoom:2.5,focus:center})',center)
 (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));(OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
 if center:p.evaluate('nebeljagdInspectCamera({zoom:1})')
def watch(p):
 p.set_default_timeout(120000);p.on('pageerror',lambda e:(report['errors'].append(str(e)),print('ERROR',str(e),flush=True)));p.on('console',lambda m:(report['errors'].append(m.text),print('ERROR',m.text,flush=True)) if m.type=='error' else None);p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  c=browser.new_context(viewport={'width':800,'height':600});p=c.new_page();watch(p);p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');before=p.evaluate('nebeljagdMapTestState().map.objects');p.locator('#editor-tab-objects').click();p.locator('#editor-tool-objects-place').click()
  for kind,slug in [('shadowStaff','shadow'),('clockworkStaff','clockwork')]:
   p.locator('#palette-kind').select_option(kind);p.locator('#palette-variant').select_option('kit-tripo-'+slug+'-staff');p.locator('#add-object-center').click();assert p.locator('#world-objects use[href="#world-object-'+kind+'"]').count()>0
  p.screenshot(path=str(OUT/'editor.png'));p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');objects=p.evaluate('nebeljagdMapTestState().map.objects');assert objects[:-2]==before;assert [o['kind'] for o in objects[-2:]]==['shadowStaff','clockworkStaff'];passed('Both real model previews, editor placement and saved-map reload');c.close()
  modes=[('shadowStaff','shadow',False),('clockworkStaff','clockwork',False),('shadowStaff','shadow',True),('clockworkStaff','clockwork',True)]
  if os.getenv('DESKTOP_ONLY'):modes=modes[:2]
  for kind,slug,touch in modes:
   mode=slug+('-touch' if touch else '-mouse');fixture['objects']=[dict(id='staff',name=slug,kind=kind,variant='kit-tripo-'+slug+'-staff',position=[0,-14],rarity='common',rotation=0,scale=1)]
   c=browser.new_context(viewport={'width':800,'height':600},has_touch=touch,is_mobile=touch);c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');');p=c.new_page();watch(p)
   p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('type=>nebeljagdTestState().equippedWeapon===type',arg=kind);assert state(p)['combat']['heldModel']['model']=='tripo'
   target=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1');health=target['health'];position=target['position'];origin=dict(x=position['x'],z=position['z']-7)
   p.evaluate('p=>nebeljagdInspect({...p,direction:0})',origin);elapsed=state(p)['elapsed'];p.wait_for_function('t=>nebeljagdTestState().elapsed>t+.8',arg=elapsed);capture(p,mode+'-held')
   if touch:
    b=p.locator('#attackBtn').bounding_box();x=b['x']+b['width']/2;y=b['y']+b['height']/2;cdp=c.new_cdp_session(p);cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]});ratio=(7 if slug=='shadow' else 3.5)/20
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y+8+56*ratio,'id':1}]})
   else:
    point=dict(x=position['x'],z=position['z']-(0 if slug=='shadow' else 3.5));pixel=p.evaluate('p=>nebeljagdProjectPoint(p)',point);p.mouse.move(pixel['x'],pixel['y']);p.keyboard.down('f')
   p.wait_for_function('slug=>nebeljagdTestState().combat[slug].aimRange?.radius===20',arg=slug);assert state(p)['combat'][slug]['valid'];capture(p,mode+'-aim')
   pause_at(p,('s.combat.shadow.center && s.combat.shadow.age>=.3' if slug=='shadow' else 's.combat.clockwork.guardian?.age>=.65'))
   if touch:cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   else:p.keyboard.up('f')
   p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p);effect=s['combat'][slug];center=effect['center'] if slug=='shadow' else effect['guardian']['position'];capture(p,mode+'-active');capture(p,mode+'-detail',center)
   frozen=state(p)['combat'][slug];p.wait_for_timeout(100);assert state(p)['combat'][slug]==frozen
   if slug=='shadow':
    enemy=next(a for a in s['practiceActors'] if a['id']=='practice-1');assert enemy['health']==health-8,(health,enemy);assert enemy['darkenedRemaining']>1;assert 'practice-1' in effect['indicators']['visibleTargets'];assert effect['visuals']['visible'];passed(mode+': charged aim, real GLB, lob, visible smoke field, one damage hit and darkened marker')
    p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.shadow.active');enemy=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1');assert enemy['health']==health-8;assert enemy['darkenedRemaining']==0
    p.evaluate('nebeljagdInspectShadowHit()');pause_at(p,'s.darkenedStatus.remaining>1 && s.vision.blindRadius===2.5');p.wait_for_function('nebeljagdTestState().phase==="paused"');capture(p,mode+'-darkened');pos=state(p)['position'];assert p.evaluate('p=>nebeljagdInspectVisibility({x:p.x+2,z:p.z})',pos);assert not p.evaluate('p=>nebeljagdInspectVisibility({x:p.x+4,z:p.z})',pos)
    p.locator('#resumeBtn').click();p.keyboard.down('d');elapsed=state(p)['elapsed'];p.wait_for_function('t=>nebeljagdTestState().elapsed>t+.4',arg=elapsed);p.keyboard.up('d');assert state(p)['position']['x']>pos['x']+.5;p.wait_for_function('nebeljagdTestState().darkenedStatus.remaining===0');assert p.evaluate('p=>nebeljagdInspectVisibility({x:p.x+4,z:p.z})',state(p)['position']);passed(mode+': real sight restriction, movement while darkened, exact expiry and normal vision restored')
   else:
    assert effect['guardian']['health']==25;assert effect['shots']>=1;assert effect['visuals']['visible'];passed(mode+': capsule deploys into brass guardian with tracking turret and slow projectiles')
    if touch:
     level=s['level'];result=p.evaluate('nebeljagdInspectClockworkHit(25)');assert result['killed'];pause_at(p,'s.combat.clockwork.lastEnd==="destroyed"');p.wait_for_function('nebeljagdTestState().phase==="paused"');assert state(p)['level']==level;capture(p,mode+'-destroyed');p.locator('#resumeBtn').click()
    else:
     pause_at(p,'s.combat.clockwork.hits>0');p.wait_for_function('nebeljagdTestState().phase==="paused"');enemy=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1');assert enemy['health']<=health-5;capture(p,mode+'-hit');p.locator('#resumeBtn').click()
    p.wait_for_function('!nebeljagdTestState().combat.clockwork.active && nebeljagdTestState().combat.clockwork.visuals.phase==="idle" && nebeljagdTestState().combat.clockwork.bullets.length===0');passed(mode+': '+('destruction without level reward' if touch else 'automatic damage and lifetime expiry')+'; no remaining guardian or bolts')
   p.locator('#pauseBtn').click();p.locator('#restartBtn').click();p.wait_for_function('nebeljagdTestState().combat.shadow.casts===0 && nebeljagdTestState().combat.clockwork.casts===0');assert state(p)['darkenedStatus']['remaining']==0;passed(mode+': restart clears both spells and status');c.close()
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256'];report['status']='passed'
 except BaseException as e:
  report.update(status='failed',failure=str(e))
  try:(OUT/'failure-state.json').write_text(json.dumps(state(p),indent=2));p.screenshot(path=str(OUT/'failure.png'))
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
