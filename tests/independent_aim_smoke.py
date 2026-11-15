"""Actual browser controls: independent mouse aim, two thumb pointers and cancellation."""
import os,json,subprocess,hashlib,base64,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/independent-aim';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.getenv('NEBELJAGD_URL','http://127.0.0.1:5242');ENTRY=os.getenv('NEBELJAGD_GAME_ENTRY','magebrawl.html')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[dict(id='fire',kind='fireStaff',variant='kit-tripo-lava-staff',position=[0,-14],rarity='common'),dict(id='earth',kind='earthbreakerStaff',variant='kit-tripo-earthbreaker-staff',position=[8,-14],rarity='common'),dict(id='meteor',kind='meteorStaff',variant='kit-tripo-meteor-staff',position=[-8,-14],rarity='common'),dict(id='sun',kind='sunStaff',variant='kit-tripo-sun-staff',position=[16,-14],rarity='common')]
for obj in fixture['objects']:obj.update(name=obj['id'],rotation=0,scale=1)
report=dict(checks=[],errors=[],mapSha256=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest())
def state(p):return p.evaluate('nebeljagdTestState()')
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def sim(p,dt):p.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=state(p)['elapsed']+dt)
def capture(p,name):
 (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));(OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
 if name.startswith('touch'):p.screenshot(path=str(OUT/(name+'-ui.png')))
def equip(p,x,kind):
 p.evaluate('x=>nebeljagdInspect({x,z:-14,direction:0})',x);p.keyboard.press('e');p.wait_for_function('k=>nebeljagdTestState().equippedWeapon===k',arg=kind);sim(p,.3)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for touch in [False,True]:
   if os.getenv('AIM_ONLY')=='touch' and not touch:continue
   c=browser.new_context(viewport={'width':1000,'height':760},has_touch=touch,is_mobile=touch)
   c.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
   p=c.new_page();p.set_default_timeout(120000);p.on('pageerror',lambda e:report['errors'].append(str(e)));p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None);p.route('**/favicon.ico',lambda r:r.fulfill(status=204))
   p.goto(BASE+'/'+ENTRY+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click();p.wait_for_function('nebeljagdTestState().equippedWeapon==="fireStaff"')
   if not touch:
    p.evaluate('nebeljagdInspect({x:0,z:-14,direction:Math.PI})');point=p.evaluate('nebeljagdProjectPoint({x:8,z:-14})');p.mouse.move(point['x'],point['y']);p.keyboard.down('f');before=state(p);p.keyboard.down('a');sim(p,.3);p.keyboard.up('a');s=state(p)
    assert s['position']['x']<before['position']['x']-.5;assert s['combat']['shotsFired']==0;assert abs(s['targeting']['direction']-math.pi/2)<.1;capture(p,'mouse-strafe-preview')
    p.keyboard.up('f');p.wait_for_function('nebeljagdTestState().combat.shotsFired===1');s=state(p);assert abs(s['combat']['lastSpellLaunch']['direction']-math.pi/2)<.15;passed('Mouse projectile aims right while moving left; hold previews and release casts once')
    sim(p,1);p.keyboard.down('f');p.keyboard.press('Escape');p.keyboard.up('f');sim(p,.3);assert state(p)['combat']['shotsFired']==1 and state(p)['phase']=='playing';passed('Escape cancels pending shot without casting or pausing')
    equip(p,16,'sunStaff');target=p.evaluate('nebeljagdProjectPoint({x:11,z:-10})');p.mouse.move(target['x'],target['y']);p.keyboard.down('f');p.wait_for_function('nebeljagdTestState().combat.sun.aimRange?.radius>=8');s=state(p);assert s['combat']['sun']['aim']['x']<s['position']['x'];capture(p,'mouse-area');p.keyboard.up('f');p.wait_for_function('nebeljagdTestState().combat.sun.casts===1');passed('Mouse area spell places its target independently of avatar travel direction')
   else:
    equip(p,8,'earthbreakerStaff');cdp=c.new_cdp_session(p)
    def center(selector):
     b=p.locator(selector).bounding_box();return {'x':b['x']+b['width']/2,'y':b['y']+b['height']/2}
    left=center('#joystick');right=center('#attackBtn');L=dict(left,id=1);R=dict(right,id=2)
    def touch_event(t,points):cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':points})
    touch_event('touchStart',[L]);touch_event('touchStart',[L,R]);L['x']-=30;R['x']+=56;touch_event('touchMove',[L,R]);before=state(p);sim(p,.35);s=state(p);assert s['position']['x']<before['position']['x']-.5;assert s['combat']['earthbreaker']['casts']==0;assert abs(s['targeting']['direction']-math.pi/2)<.05;capture(p,'touch-two-sticks')
    touch_event('touchEnd',[L]);sim(p,.15);before=state(p);sim(p,.2);assert abs(state(p)['position']['x']-before['position']['x'])<.05;assert state(p)['targeting']['gesture'];touch_event('touchEnd',[]);p.wait_for_function('nebeljagdTestState().combat.earthbreaker.casts===1');s=state(p);assert s['combat']['earthbreaker']['nodes'][0]['x']>s['position']['x'];passed('Two touch pointers: move left and aim right; releasing movement does not release shot')
    sim(p,2);equip(p,-8,'meteorStaff');right=center('#attackBtn');R=dict(right,id=2);touch_event('touchStart',[R]);R['x']+=36;touch_event('touchMove',[R]);p.wait_for_function('nebeljagdTestState().combat.meteor.aimRange?.radius>=15');s=state(p);a=s['combat']['meteor'];d=math.hypot(a['aim']['x']-s['position']['x'],a['aim']['z']-s['position']['z']);assert .35<d/a['aimRange']['radius']<.65;assert s['targeting']['preview']=='arc';capture(p,'touch-artillery-arc');touch_event('touchCancel',[]);assert not state(p)['combat']['meteor']['aiming'];assert state(p)['combat']['meteor']['casts']==0
    R=dict(right,id=2);touch_event('touchStart',[R]);R['x']+=56;touch_event('touchMove',[R]);p.wait_for_function('nebeljagdTestState().combat.meteor.aimRange?.radius>=8');touch_event('touchEnd',[]);p.wait_for_function('nebeljagdTestState().combat.meteor.casts===1');passed('Right aim-stick distance selects artillery landing point; arc visible; cancel and release work')
   c.close()
  assert not report['errors'],report['errors'];report['status']='passed'
 except BaseException as e:
  report.update(status='failed',failure=str(e))
  try:capture(p,'failure')
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
