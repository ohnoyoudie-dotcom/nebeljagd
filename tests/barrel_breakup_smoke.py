"""Real sword hits: variable staggered breakup of two uploaded barrel models."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/barrel-breakup';OUT.mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['regions'][0]['biome']='desert';fixture['gameplay']['spawnPosition']=[0,0]
fixture['objects']=[dict(id='sword',name='Schwert',kind='sword',variant='kit-tripo-sword',rarity='common',position=[0,0],rotation=0,scale=1)]
for i,x in enumerate([0,4]):fixture['objects'].append(dict(id=f'barrel-{i}',name='Fass',kind='barrel',variant='kit-tripo-barrel',position=[x,5],rotation=i*.4,scale=1))
report={'status':'running','checks':[],'errors':[],'bursts':[],'gameSha256':hashlib.sha256((ROOT/'welt/magebrawl.html').read_bytes()).hexdigest()}
def state(page):return page.evaluate('nebeljagdTestState()')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  context=browser.new_context(viewport={'width':960,'height':720})
  context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
  page=context.new_page();page.set_default_timeout(120000)
  page.on('pageerror',lambda e:report['errors'].append(str(e)))
  page.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
  page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
  page.locator('#startBtn').click();page.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
  for i,x in enumerate([0,4]):
   page.evaluate('x=>{nebeljagdInspect({x,z:3.3,direction:0});nebeljagdInspectCamera({zoom:2})}',x)
   page.evaluate('''()=>{window.breakFrames=[];window.breakImage=null;window.watchBreak=true;
     const before=nebeljagdTestState().world.stats.debris.bursts;
     function sample(){if(!window.watchBreak)return;const d=nebeljagdTestState().world.stats.debris;
       if(d.bursts>before){window.breakFrames.push({pending:d.pending,airborne:d.airborne,travel:d.farthestTravel});
         if(!window.breakImage&&d.pending>0&&d.airborne>0)window.breakImage=nebeljagdCaptureFrame();}
       requestAnimationFrame(sample);}requestAnimationFrame(sample);}''')
   for _ in range(4):
    if next(p for p in state(page)['world']['destructibles'] if p['id']==f'barrel-{i}')['destroyed']:break
    page.wait_for_function('nebeljagdTestState().attackCooldown===0')
    before=state(page)['combat']['damageHits'];page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n',arg=before)
   page.wait_for_function('window.breakImage!==null')
   (OUT/f'barrel-{i}-breaking.png').write_bytes(base64.b64decode(page.evaluate('window.breakImage').split(',',1)[1]))
   page.wait_for_function('()=>{const d=nebeljagdTestState().world.stats.debris;return d.active>0&&d.settled===d.active}')
   d=state(page)['world']['stats']['debris'];frames=page.evaluate('window.watchBreak=false;window.breakFrames')
   assert any(f['pending']>0 and f['airborne']>0 for f in frames),frames
   assert .7<d['farthestTravel']<3.5,d
   report['bursts'].append(d['lastBurst']);report['checks'].append(f'Barrel {i}: real sword break, staggered original fragments, compact resting radius')
   print('PASS',report['checks'][-1],flush=True)
   (OUT/f'barrel-{i}-frames.json').write_text(json.dumps(frames,indent=2))
   (OUT/f'barrel-{i}-settled.png').write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
  assert [p['delay'] for p in report['bursts'][0]['launchSamples']] != [p['delay'] for p in report['bursts'][1]['launchSamples']]
  assert not report['errors'],report['errors'];report['status']='passed'
 except BaseException as error:
  report.update(status='failed',failure=str(error));raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
