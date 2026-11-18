import json,os,subprocess,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[1];OUT=R/'test-results/runic-chest';OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('CHECK_URL','http://127.0.0.1:5234');report={'status':'running','checks':[],'errors':[],'url':URL}
source_hash=hashlib.sha256((R/'worldmap.json').read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createLobbyMap} from './src/lobby-map.js';import {validateWorldmap} from './src/map/model.js';const map=createLobbyMap();map.id='runic-chest-check';map.paths=[];map.objects=[{id:'rune-chest',name:'Runentruhe',kind:'chest',variant:'kit-tripo-rare-chest',position:[0,0],rotation:0,scale:1},{id:'normal-chest',name:'Normale Truhe',kind:'chest',variant:'kit-tripo-chest',position:[8,0],rotation:0,scale:1}];map.gameplay.spawnPosition=[0,4.8];const v=validateWorldmap(map);if(!v.valid)throw Error(v.errors);console.log(JSON.stringify(map));"""],cwd=R))
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def st(p):return p.evaluate('nebeljagdTestState()')
def chest(p):return st(p)['chests'][0]
def wait_sim(p,t):p.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=st(p)['elapsed']+t)
def inspect(p,x,z):p.evaluate('a=>nebeljagdInspect(a)',{'x':x,'z':z})
try:
 with sync_playwright() as w:
  b=w.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  c=b.new_context(viewport={'width':1400,'height':1000},accept_downloads=True)
  c.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});localStorage.setItem('nebeljagd.worldmap.playtest.v1',"+json.dumps(json.dumps(fixture))+");")
  p=c.new_page();p.set_default_timeout(60000);p.on('pageerror',lambda e:report['errors'].append(str(e)))
  p.goto(URL+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState');report['buildId']=p.evaluate('nebeljagdMapTestState().startup.buildId')
  p.locator('#editor-tab-objects').click();p.locator('#palette-kind').select_option('chest');p.locator('#palette-variant').select_option('kit-tripo-rare-chest');assert p.locator('#palette-chest-opening').input_value()=='rune';p.locator('#add-object-center').click();assert p.evaluate('nebeljagdMapTestState().map.objects.at(-1).chestOpening')=='rune'
  p.locator('#duplicate-object').click();assert p.evaluate('nebeljagdMapTestState().map.objects.at(-1).chestOpening')=='rune'
  p.locator('#object-chest-opening').select_option('instant');p.locator('#properties-form button[type=submit]').click();assert p.evaluate('nebeljagdMapTestState().map.objects.at(-1).chestOpening')=='instant'
  with p.expect_download() as dl:p.locator('#export-json').click()
  dl.value.save_as(OUT/'editor-export.json');saved=json.loads((OUT/'editor-export.json').read_text());assert saved==p.evaluate('nebeljagdMapTestState().map')
  passed('Editor creates, copies and independently changes rune chests; JSON preserves the setting')
  p.close()
  g=c.new_page();g.set_default_timeout(180000);g.on('pageerror',lambda e:report['errors'].append(str(e)))
  g.goto(URL+('/game.html' if ':5234' in URL or ':5235' in URL else '/magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');g.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0');g.locator('#startBtn').click();print('GAME READY',flush=True)
  wait_sim(g,.3);assert chest(g)['charge']['progress']==0
  inspect(g,0,2.1);g.wait_for_function('nebeljagdTestState().chests[0].charge.progress>.12');g.keyboard.press('e');assert not chest(g)['opened'];assert chest(g)['variant']=='kit-tripo-rare-chest' and chest(g)['model']=='tripo';g.screenshot(path=str(OUT/'charging.png'))
  inspect(g,0,4.8);before=chest(g)['charge']['progress'];wait_sim(g,.65);assert abs(chest(g)['charge']['progress']-before)<.015
  wait_sim(g,1.8);assert chest(g)['charge']['progress']<before;passed('Presence charges; E cannot skip the seal; leaving grants grace then gently decays')
  inspect(g,0,2.1);g.wait_for_function('nebeljagdTestState().chests[0].charge.progress>.25');g.keyboard.press('Escape');paused=chest(g)['charge'];g.wait_for_timeout(400);assert chest(g)['charge']==paused;inspect(g,0,2.1);passed('Pause freezes charge and the rune animation')
  g.wait_for_function('nebeljagdTestState().chests[0].charge.progress>.65');g.screenshot(path=str(OUT/'charged.png'))
  g.wait_for_function('nebeljagdTestState().chests[0].opened');g.screenshot(path=str(OUT/'opening.png'))
  inspect(g,0,4.8);g.wait_for_function('nebeljagdTestState().chests[0].lidRotation < -1.88');wait_sim(g,1)
  s=st(g);loot=[d for d in s['weaponDrops'] if d['id']=='rune-chest-weapon'];assert len(loot)==1 and loot[0]['rarity'] in ['rare','epic','legendary'];assert len([d for d in s['pickups'] if d['id'].startswith('rune-chest-gold')])==2
  g.screenshot(path=str(OUT/'opened.png'));inspect(g,0,2.1);g.keyboard.press('e');wait_sim(g,.5);assert len([d for d in st(g)['weaponDrops'] if d['id']=='rune-chest-weapon'])==1;passed('Full seal opens the lid and releases exactly one premium weapon and two gold drops')
  inspect(g,8,2);g.keyboard.press('e');g.wait_for_function('nebeljagdTestState().chests[1].opened');passed('Normal chest retains immediate E interaction')
  c.close()
  touch=b.new_context(viewport={'width':1024,'height':768},has_touch=True,is_mobile=True)
  touch.add_init_script("localStorage.setItem('nebeljagd.worldmap.playtest.v1',"+json.dumps(json.dumps(fixture))+");")
  t=touch.new_page();t.set_default_timeout(180000);t.on('pageerror',lambda e:report['errors'].append(str(e)))
  t.goto(URL+('/game.html' if ':5234' in URL or ':5235' in URL else '/magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');t.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0');t.locator('#startBtn').tap();inspect(t,0,2.1)
  t.wait_for_function('nebeljagdTestState().chests[0].charge.progress>.12');expect(t.locator('#pickupPrompt')).to_be_visible();expect(t.locator('#pickupPrompt .pickup-key')).to_be_visible();expect(t.locator('#pickupPrompt kbd')).to_be_hidden();expect(t.locator('#interactButton')).to_be_hidden()
  t.screenshot(path=str(OUT/'touch-charging.png'));t.wait_for_function('nebeljagdTestState().chests[0].opened');passed('Tablet opens the rare chest by presence alone and displays progress without an E hint')
  touch.close()
  assert not report['errors'],report['errors'];assert hashlib.sha256((R/'worldmap.json').read_bytes()).hexdigest()==source_hash
  report['sourceMapUnchanged']=source_hash;report['status']='passed';b.close()
finally:(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
