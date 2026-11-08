"""Render the actual ornate bow and replacement arrow in the built game."""
import json,os,subprocess,hashlib,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/bow-alignment';OUT.mkdir(parents=True,exist_ok=True)
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['regions'][0]['biome']='desert'
fixture['objects']=[dict(id='bow',name='Verzierter Bogen',kind='bow',variant='kit-tripo-ornate-bow',position=[0,-14],rotation=0,scale=1,rarity='common')]
report={'passed':False,'errors':[],'checks':[],'sha256':hashlib.sha256((ROOT/'welt/magebrawl.html').read_bytes()).hexdigest()}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for mode in ['keyboard','mouse','touch']:
   touch=mode=='touch'
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
   label=mode
   page.screenshot(path=str(OUT/(label+'-nocked.png')))
   page.evaluate('''() => {window.__arrowFrame=null;const sample=()=>{if(nebeljagdTestState().combat.arrowsFlying>0){window.__arrowFrame=nebeljagdCaptureFrame();return;}requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
   if touch:
    box=page.locator('#attackBtn').bounding_box()
    session=context.new_cdp_session(page)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}]})
   elif mode=='mouse':
    page.mouse.move(750,550);page.mouse.down()
   else:page.keyboard.down('f')
   page.wait_for_function('nebeljagdTestState().combat.bowDraw===1')
   started=page.evaluate('nebeljagdTestState().elapsed')
   page.wait_for_function('t=>nebeljagdTestState().elapsed>t+1',arg=started)
   held=page.evaluate('nebeljagdTestState().combat')
   (OUT/(label+'-pose.json')).write_text(json.dumps(held,indent=2))
   page.screenshot(path=str(OUT/(label+'-drawn.png')))
   assert held['shotsFired']==0 and held['bowHolding'] and held['bowDraw']==1,held
   assert held['hands']['right']['x']>.22 and held['heldPose']['bow']['x']>.2,held['hands']
   assert held['rigPose']['rightArm']['elbow']['z']>.2,held['rigPose']
   report['checks'].append(label+': held full draw without firing; hands and bow stay beside the torso')
   page.screenshot(path=str(OUT/(label+'-drawn.png')))
   if touch:session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
   elif mode=='mouse':page.mouse.up()
   else:page.keyboard.up('f')
   page.wait_for_function('nebeljagdTestState().combat.arrowsFlying>0')
   page.wait_for_function('window.__arrowFrame')
   (OUT/(label+'-flight.png')).write_bytes(base64.b64decode(page.evaluate('window.__arrowFrame').split(',',1)[1]))
   state=page.evaluate('nebeljagdTestState()')
   assert state['combat']['shotsFired']==1,state['combat']
   assert state['combat']['arrowModel']['source'].endswith('feathered spear 3d model.glb')
   assert state['combat']['arrowModel']['nominalLength']==1.25
   report['checks'].append(label+': real ornate bow picked up and one visible physical arrow fired')
   context.close()
  assert not report['errors'],report['errors'];report['passed']=True
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
