"""Real generated-game regression: visible crowns, quick fade and restore, without brown support shells."""
import base64,hashlib,json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];out=root/'test-results/tree-crown/final';out.mkdir(parents=True,exist_ok=True)
base=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5441')
m=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=root))
m['objects']=[{'id':f'tree-{i}','name':'Baum','kind':'tree','variant':'kit-user-tree1','position':[x,z],'rotation':0.25,'scale':1} for i,(x,z) in enumerate([(0,0),(9,0),(0,-10)])];m['paths']=[];m['regions'][0]['biome']='forest';m['gameplay']['spawnPosition']=[-5,0]
report={'status':'running','errors':[],'states':[],'mapSha256':hashlib.sha256((root/'worldmap.json').read_bytes()).hexdigest()}
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 p=b.new_page(viewport={'width':1280,'height':900});p.set_default_timeout(240000)
 p.on('pageerror',lambda e:report['errors'].append(str(e)))
 p.on('console',lambda e:report['errors'].append(e.text) if e.type=='error' and ('Shader' in e.text or 'VALIDATE' in e.text) else None)
 p.goto(base+'/map-editor.html',wait_until='domcontentloaded')
 p.wait_for_function('window.nebeljagdMapTestState');report['build']=p.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent)');p.evaluate('m=>localStorage.setItem("nebeljagd.worldmap.playtest.v1",JSON.stringify(m))',m)
 p.goto(base+'/'+os.environ.get('NEBELJAGD_GAME_ENTRY','magebrawl.html')+'?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
 p.click('#startBtn')
 for name,x,z in [('outside',-5,0),('edge',-2,0),('under',0,1.5),('restored',-5,0)]:
  p.evaluate('v=>nebeljagdInspect(v)',{'x':x,'z':z});p.wait_for_timeout(700)
  if name=='under':p.wait_for_function('nebeljagdTestState().world.trees[0].canopy.opacity<.06')
  elif name in ['outside','restored']:p.wait_for_function('nebeljagdTestState().world.trees[0].canopy.opacity>.999')
  s=p.evaluate('nebeljagdTestState()');report['states'].append({'pose':name,'trees':s['world']['trees']})
  (out/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1])); print(name,[(t['id'],t['canopy']['opacity']) for t in s['world']['trees']],flush=True)
 assert not report['errors'],report['errors']
 assert report['states'][0]['trees'][0]['canopy']['opacity']==1
 assert report['states'][2]['trees'][0]['canopy']['opacity']<.06,'local crown must still reveal the player'
 assert report['states'][3]['trees'][0]['canopy']['opacity']>.99,'crown must recover after leaving'
 assert all(s['trees'][1]['canopy']['opacity']==1 for s in report['states']),'unaffected tree stays opaque'
 assert all(s['trees'][0]['canopy']['barkOpacity']==1 for s in report['states']),'true branches keep their normal material'
 assert hashlib.sha256((root/'worldmap.json').read_bytes()).hexdigest()==report['mapSha256']
 report['status']='passed';(out/'report.json').write_text(json.dumps(report,indent=2));b.close()
