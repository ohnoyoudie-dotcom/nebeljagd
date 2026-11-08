"""Render the actual ornate bow and replacement arrow in the built game."""
import json,os,subprocess,hashlib,base64,math
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/bow-alignment';OUT.mkdir(parents=True,exist_ok=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['regions'][0]['biome']='desert'
fixture['objects']=[dict(id='bow',name='Verzierter Bogen',kind='bow',variant='kit-tripo-ornate-bow',position=[0,-14],rotation=0,scale=1,rarity='common')]
report={'passed':False,'errors':[],'checks':[],'sha256':hashlib.sha256((ROOT/'welt/magebrawl.html').read_bytes()).hexdigest()}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for touch in [False,True]:
   context=browser.new_context(viewport={'width':1100,'height':800},has_touch=touch,is_mobile=touch)
   context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
   page=context.new_page();page.set_default_timeout(120000)
   page.on('pageerror',lambda e:report['errors'].append(str(e)))
   page.goto(os.environ.get('NEBELJAGD_URL','http://127.0.0.1:8770')+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
   page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
   page.locator('#startBtn').click()
   page.evaluate('nebeljagdInspect({x:0,z:-14,direction:.8,health:100})')
   page.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
   page.evaluate('nebeljagdInspectCamera({zoom:2.8})')
   label='touch' if touch else 'keyboard'
   page.screenshot(path=str(OUT/(label+'-nocked.png')))
   page.evaluate('''() => {window.__arrowFrame=null;const sample=()=>{if(nebeljagdTestState().combat.arrowsFlying>0){window.__arrowFrame=nebeljagdCaptureFrame();window.__arrowState=nebeljagdTestState();return;}requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
   if touch:
    box=page.locator('#attackBtn').bounding_box()
    session=context.new_cdp_session(page)
    attack_point={'id':1,'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[attack_point]})
   else:page.keyboard.down('f')
   page.wait_for_function('nebeljagdTestState().combat.bowDraw===1')
   started=page.evaluate('nebeljagdTestState().elapsed')
   page.wait_for_function('t=>nebeljagdTestState().elapsed>t+1',arg=started)
   held=page.evaluate('nebeljagdTestState().combat')
   assert held['shotsFired']==0 and held['bowHolding'] and held['bowDraw']==1,held
   assert held['heldPose']['bow']['x']<-.22 and held['bowAlignment']['error']<.025,held
   assert held['rigPose']['rightArm']['elbow']['x']<-.22,held['rigPose']
   report['checks'].append(label+': held full draw without firing; hands and bow stay beside the torso')
   page.screenshot(path=str(OUT/(label+'-drawn.png')))
   # Reproduce the reported bug with real movement inputs while still holding.
   if touch:
    joy=page.locator('#joystick').bounding_box();cx=joy['x']+joy['width']/2;cy=joy['y']+joy['height']/2
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[attack_point,{'id':2,'x':cx-30,'y':cy}]})
   else:page.keyboard.down('a')
   page.wait_for_function('Math.abs(nebeljagdTestState().direction+Math.PI/2)<.02 && Math.abs(nebeljagdTestState().combat.bowAlignment.direction+Math.PI/2)<.02')
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[attack_point,{'id':2,'x':cx,'y':cy-30}]})
   else:
    page.keyboard.up('a');page.keyboard.down('w')
   page.wait_for_function('Math.cos(nebeljagdTestState().direction)<-.999 && Math.cos(nebeljagdTestState().combat.bowAlignment.direction)<-.999')
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[{'id':2,'x':cx,'y':cy-30}]})
   else:page.keyboard.up('w')
   held=page.evaluate('nebeljagdTestState().combat')
   assert held['shotsFired']==0 and held['bowHolding'] and held['bowDraw']==1,held
   assert held['bowAlignment']['error']<.025,held['bowAlignment']
   (OUT/(label+'-pose.json')).write_text(json.dumps(held,indent=2))
   page.screenshot(path=str(OUT/(label+'-turned.png')))
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   else:page.keyboard.up('f')
   page.wait_for_function('nebeljagdTestState().combat.arrowsFlying>0')
   page.wait_for_function('window.__arrowFrame')
   (OUT/(label+'-flight.png')).write_bytes(base64.b64decode(page.evaluate('window.__arrowFrame').split(',',1)[1]))
   state=page.evaluate('window.__arrowState')
   assert math.cos(state['combat']['arrows'][0]['direction'])<-.999,state['combat']['arrows']
   report['checks'].append(label+': held left, changed to up, kept full draw, released exactly one arrow upward')
   assert state['combat']['shotsFired']==1,state['combat']
   assert state['combat']['arrowModel']['source'].endswith('feathered spear 3d model.glb')
   assert state['combat']['arrowModel']['nominalLength']==1.05
   report['checks'].append(label+': real ornate bow picked up and one visible physical arrow fired')
   context.close()
  assert not report['errors'],report['errors'];report['passed']=True
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
