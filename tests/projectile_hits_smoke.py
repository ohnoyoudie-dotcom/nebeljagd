"""Seven actual staff shots against NPCs and cover on the authored project map.

Set NEBELJAGD_URL to the standalone welt server. The file hash must match
NEBELJAGD_RELEASE_DIR (default ROOT/welt). E/F are real input; inspect only
positions player/camera. The authored low Tripo wall is intentionally below
shot height; its taller neighboring wall must stop the shot. Updating these
map placements requires updating the corresponding capture positions below.
"""
import json,math,shutil,hashlib,base64,os
from urllib.request import urlopen
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5232').rstrip('/')
RELEASE=Path(os.environ.get('NEBELJAGD_RELEASE_DIR',ROOT/'welt'))
OUT=Path(os.environ.get('NEBELJAGD_QA_OUT',ROOT/'test-results/projectile-hits'));OUT.mkdir(parents=True,exist_ok=True)
MAP_HASH=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
R={'status':'running','errors':[],'casts':[]}
def s(p):return p.evaluate('nebeljagdTestState()')
def pos(p,x,z,d):
 p.evaluate('v=>nebeljagdInspect(v)',{'x':x,'z':z,'direction':d,'health':100,'elapsed':0})
 p.wait_for_function('nebeljagdTestState().elapsed>.06')
def cast(p,label):
 p.wait_for_function('nebeljagdTestState().attackCooldown===0&&nebeljagdTestState().combat.spellsActive===0')
 before=s(p)
 p.evaluate('''capture=>{window.__samples=[];window.__collect=true;window.__impactFrame=null;window.__impactSnapshot=null;const before=nebeljagdTestState().combat.impacts;const f=()=>{if(!window.__collect)return;const s=nebeljagdTestState();window.__samples.push({elapsed:s.elapsed,position:s.position,actors:s.practiceActors,combat:s.combat});if(capture&&!window.__impactFrame&&s.combat.impacts>before){window.__impactFrame=nebeljagdCaptureFrame();window.__impactSnapshot={position:s.position,combat:s.combat};}requestAnimationFrame(f)};requestAnimationFrame(f)}''',label.endswith('npc-direct-4m'))
 p.keyboard.press('f')
 p.wait_for_function('n=>nebeljagdTestState().combat.shotsFired>n',arg=before['combat']['shotsFired'],polling=25)
 p.wait_for_function('nebeljagdTestState().attackCooldown===0&&nebeljagdTestState().combat.spellsActive===0',polling=25)
 samples=p.evaluate('()=>{window.__collect=false;return window.__samples}')
 after=s(p)
 row={'label':label,'before':before,'after':after,'samples':samples}
 data=p.evaluate('window.__impactFrame')
 if data:
  path=OUT/(label+'-actual-impact.png');path.write_bytes(base64.b64decode(data.split(',',1)[1]))
  row['impactScreenshot']=str(path);row['impactSnapshot']=p.evaluate('window.__impactSnapshot')
 R['casts'].append(row);(OUT/'report.json').write_text(json.dumps(R,indent=2))
 print(label,json.dumps({'damageHits':after['combat']['damageHits']-before['combat']['damageHits'],'impacts':after['combat']['impacts']-before['combat']['impacts'],'lastImpact':after['combat']['lastImpact']}),flush=True)
 delta_damage=after['combat']['damageHits']-before['combat']['damageHits']
 delta_impact=after['combat']['impacts']-before['combat']['impacts']
 assert after['combat']['shotsFired']==before['combat']['shotsFired']+1
 assert delta_impact==1,(label,'Expected one impact',delta_impact)
 launch=after['combat']['lastSpellLaunch']
 assert abs(launch['tip']['y']-launch['bodyOrigin']['y'])<1e-8
 assert abs(launch['tip']['y']-launch['flightHeight'])<1e-8
 for sample in samples:
  for spell in sample['combat']['spells']:
   assert abs(spell['position']['y']-launch['flightHeight'])<1e-8
 if label.endswith('npc-direct-4m'):assert data,'Expected an actual impact screenshot'
 if '-npc-' in label:assert delta_damage==1,(label,'NPC should be hit',delta_damage)
 if '-fence-' in label:assert after['combat']['lastImpact']['type']=='fence',after['combat']['lastImpact']
 if '-tripo-wall-' in label:
  assert after['combat']['lastImpact']['type']=='wall'
  nearby=[body for body in before['world']['projectileObstacles'] if body.get('id','').startswith('barrier-wall-mvwkdy5m-3-segment-') and body.get('maxX',-100)>3 and body.get('minX',100)<6]
  assert nearby and all(after['combat']['lastSpellLaunch']['flightHeight']>body['maxY']+.13 for body in nearby)
  assert after['combat']['lastImpact']['point']['z']<-34,('Low first wall is below flight plane; hit next tall wall',after['combat']['lastImpact'])
 print('PASS',label,flush=True)
 return row
try:
 data=urlopen(URL+'/magebrawl.html',timeout=60).read()
 R['delivery']={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 assert R['delivery']['sha256']==hashlib.sha256((RELEASE/'magebrawl.html').read_bytes()).hexdigest()
 del data
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  try:
   p=b.new_page(viewport={'width':960,'height':640});p.set_default_timeout(120000)
   p.on('pageerror',lambda e:R['errors'].append(str(e)));p.on('console',lambda m:R['errors'].append(m.text) if m.type=='error' else None)
   p.goto(URL+'/magebrawl.html?inspect=1&quality=low',wait_until='domcontentloaded')
   p.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0');p.locator('#startBtn').click()
   R['initial']=s(p);print('Loaded current authored map',flush=True)
   for kind in ['fireStaff','iceStaff']:
    obj=next(o for o in s(p)['world']['objects'] if o['kind']==kind)
    pos(p,*obj['position'],0)
    p.wait_for_function('nebeljagdTestState().equippedItem||nebeljagdTestState().nearWeapon')
    if s(p)['equippedWeapon']!=kind:p.keyboard.press('e')
    p.wait_for_function('k=>nebeljagdTestState().equippedWeapon===k',arg=kind)
    a=s(p)['practiceActors'][0];pos(p,a['position']['x']-4,a['position']['z'],math.pi/2)
    p.evaluate('nebeljagdInspectCamera({zoom:3})')
    cast(p,kind+'-npc-direct-4m')
    a=s(p)['practiceActors'][0];pos(p,a['position']['x'],a['position']['z']+2.2,math.pi)
    cast(p,kind+'-npc-near-2.2m')
    pos(p,45+0.4103646773*2.2,-42.5+0.9119215052*2.2,math.atan2(-0.4103646773,-0.9119215052))
    cast(p,kind+'-fence-near-2.2m')
    if kind=='fireStaff':
     pos(p,4.5+0.2524218971*2.2,-31+0.9676172724*2.2,math.atan2(-0.2524218971,-0.9676172724))
     cast(p,kind+'-tripo-wall-near-2.2m')
   p.screenshot(path=str(OUT/'final.png'))
   assert not R['errors'],R['errors']
   assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==MAP_HASH
   R['sourceMapUnchanged']=MAP_HASH;R['status']='passed'
  finally:b.close()
except BaseException as e:R['failure']=str(e);R['status']='failed';raise
finally:(OUT/'report.json').write_text(json.dumps(R,indent=2));print('DONE',R['status'],flush=True)
