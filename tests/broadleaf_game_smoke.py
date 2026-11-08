"""Generated game: fine meadow blades and ears, hiding, fringe and terrain shaders."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results/natural-details';OUT.mkdir(parents=True,exist_ok=True)
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"""
import {createLobbyMap} from './src/lobby-map.js';
import {vegetationSettings,pathBrushSettings,ensureLandscape} from './src/map/landscape.js';
import {createTerrainStroke} from './src/map/landscape-brush.js';
import {validateWorldmap} from './src/map/model.js';
const map=createLobbyMap();map.regions[0].color='#639052';
map.paths=[{id:'qa-native-path',name:'Naturweg',kind:'main',width:2.8,points:[[-11,-20],[-11,5],[-13,20]]}];
const grass={id:'qa-leafy',name:'Blattbüschel',kind:'grass',variant:'tall',position:[-5,0],radius:4,scale:1,rotation:0};
grass.vegetation={...vegetationSettings(grass),heightVariation:.3};map.objects=[grass,
 {id:'qa-chest',kind:'chest',variant:'wood',position:[-3,5],scale:1,rotation:.2},
 {id:'qa-tripo-chest',kind:'chest',variant:'kit-tripo-chest',position:[1,5],scale:1,rotation:.2},
 {id:'qa-bush',kind:'bush',variant:'rei-bush',position:[-9,-7],scale:1.4,rotation:0},
 {id:'qa-staff',kind:'fireStaff',variant:'kit-tripo-lava-staff',position:[5,-7],scale:1,rotation:0},
 {id:'qa-sword',kind:'sword',variant:'kit-tripo-sword',position:[7,-7],scale:1,rotation:0},
 {id:'qa-heart',kind:'heart',variant:'healing',position:[4,6],scale:1,rotation:0}];
for(const [id,x] of [['earth',6],['cobble',14]]){
 const stroke=createTerrainStroke(map,{radius:2.5,terrain:pathBrushSettings(id),seed:14});
 stroke.sample([x,-22]);stroke.sample([x,22]);ensureLandscape(map).terrain.push(...stroke.terrain);
}
for(const object of map.objects) object.name ??= object.id;
map.gameplay.spawnPosition=[1,0];
const check=validateWorldmap(map);if(!check.valid)throw new Error(JSON.stringify(check.errors));
console.log(JSON.stringify(map));
"""],cwd=ROOT))
sourceHash=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest();errors=[];captures=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else pw.chromium.executable_path),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for quality in os.environ.get('NEBELJAGD_QA_QUALITIES','low,high').split(','):
   ctx=b.new_context(viewport={'width':1200,'height':850})
   ctx.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
   p=ctx.new_page();p.set_default_timeout(180000)
   p.on('pageerror',lambda e:errors.append(str(e)))
   p.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
   p.goto(URL+'/magebrawl.html?inspect=1&mapSource=editor&quality='+quality,wait_until='domcontentloaded')
   p.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click()
   p.wait_for_function('nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0')
   p.evaluate('nebeljagdInspect({x:1,z:0,health:100});nebeljagdInspectCamera({zoom:.9})')
   before=p.evaluate('nebeljagdTestState().elapsed');p.wait_for_function('t=>nebeljagdTestState().elapsed>t+.5',arg=before)
   s=p.evaluate('nebeljagdTestState()');stats=s['world']['stats'];patch=s['world']['grassPatches'][0]
   assert stats['grassRendering']['sourceVersion']=='nebeljagd-meadow-ears-v3'
   assert stats['grassRendering']['decorativeInstances']>0
   assert not stats['meadowGround']['enabled']
   assert patch['instanceCount']<=round(4*4*4)
   assert stats['terrainPaint']['textureBytes']<=stats['terrainPaint']['textureBudgetBytes']
   assert not s['hiddenInGrass']
   p.keyboard.press('Escape')
   (OUT/f'outside-{quality}.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
   p.keyboard.press('Escape');p.evaluate('nebeljagdInspect({x:-5,z:0})')
   p.wait_for_function('nebeljagdTestState().hiddenInGrass && nebeljagdTestState().character.opacity<.5')
   inside=p.evaluate('nebeljagdTestState()');assert inside['hiddenFromOtherPlayers']
   p.evaluate('nebeljagdInspect({x:-.5,z:0})')
   p.wait_for_function('!nebeljagdTestState().hiddenInGrass && nebeljagdTestState().character.opacity>.9')
   p.evaluate('nebeljagdInspect({x:5,z:-7})')
   p.wait_for_function('nebeljagdTestState().combat.heldModel?.type==="fireStaff"')
   held=p.evaluate('nebeljagdTestState().combat')
   assert abs(held['heldModel']['presentationScale']-.82*.88)<1e-8
   assert abs(held['heldModel']['groundPresentationScale']-.82*1.2)<1e-8
   assert held['heldGrip']['error']<.0001
   p.keyboard.press('Escape')
   (OUT/f'equipped-{quality}.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
   p.evaluate('nebeljagdInspect({x:-6,z:5});nebeljagdInspectCamera({zoom:1})')
   before=p.evaluate('nebeljagdTestState().elapsed');p.wait_for_function('t=>nebeljagdTestState().elapsed>t+.1',arg=before)
   p.keyboard.press('Escape')
   (OUT/f'native-path-{quality}.png').write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]))
   captures.append({'quality':quality,'grass':stats['grassRendering'],'patch':patch,'rendering':s['rendering'],'paint':stats['terrainPaint']})
   print('PASS',quality,'fine grass, fringe, concealment, textured paths, enlarged loot and smaller aligned hand model',flush=True)
   ctx.close()
  assert not errors,errors
  assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==sourceHash
 finally:
  b.close();(OUT/'report.json').write_text(json.dumps({'captures':captures,'errors':errors,'limits':'Functional SwiftShader rendering and allocation checks; no physical iPad FPS claim.'},indent=2))
