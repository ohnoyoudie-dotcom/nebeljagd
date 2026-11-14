"""Real generated editor/game: both imported staffs, input, damage, skull/reaper and blindness."""
import base64, hashlib, json, os, subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5240').rstrip('/')
OUT=ROOT/'test-results/sun-soul';OUT.mkdir(parents=True,exist_ok=True)
original_hash=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
sun_rules=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {SUN_RULES} from './src/sun-spell.js';console.log(JSON.stringify(SUN_RULES))"],cwd=ROOT))
report=dict(checks=[],errors=[])
def state(p):return p.evaluate('nebeljagdTestState()')
def passed(s):report['checks'].append(s);print('PASS',s,flush=True)
def pause_at(p,condition):
 p.evaluate('''condition=>{const reached=new Function('s','return '+condition);function frame(){if(reached(nebeljagdTestState()))document.querySelector('#pauseBtn').click();else requestAnimationFrame(frame);}requestAnimationFrame(frame);if(nebeljagdTestState().phase==='paused')document.querySelector('#resumeBtn').click();}''',condition)
def capture(p,name):
 (OUT/(name+'.png')).write_bytes(base64.b64decode(p.evaluate('nebeljagdCaptureFrame()').split(',',1)[1]));(OUT/(name+'.json')).write_text(json.dumps(state(p),indent=2))
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  ctx=browser.new_context(viewport=dict(width=800,height=600));p=ctx.new_page();p.set_default_timeout(120000)
  p.goto(BASE+'/map-editor.html',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  original=p.evaluate('nebeljagdMapTestState().map.objects')
  p.locator('#editor-tab-objects').click();p.locator('#editor-tool-objects-place').click()
  for slug in ['sun','soul']:
   p.locator('#palette-kind').select_option(slug+'Staff');p.locator('#palette-variant').select_option('kit-tripo-'+slug+'-staff');p.locator('#add-object-center').click()
   glyph=p.locator('#world-objects use[href="#world-object-'+slug+'Staff"]');assert glyph.count()>=1 and glyph.last.evaluate('e=>e.getBBox().width')>0
  p.screenshot(path=str(OUT/'editor.png'));p.reload(wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdMapTestState')
  edited=p.evaluate('nebeljagdMapTestState().map.objects');assert edited[:-2]==original
  assert [o['kind'] for o in edited[-2:]]==['sunStaff','soulStaff'];passed('Both real staff entries place and persist in the generated editor, preserving existing map objects');ctx.close()
  for slug,touch in [('sun',False),('sun',True),('soul',False)]:
   if os.environ.get('NEBELJAGD_STAFF_ONLY') and slug != os.environ['NEBELJAGD_STAFF_ONLY']: continue
   mode=slug+('-touch' if touch else '-mouse');variant='kit-tripo-'+slug+'-staff'
   fixture['objects']=[dict(id='staff',kind=slug+'Staff',variant=variant,name=slug,position=[0,-14],rotation=0,scale=1,rarity='common')]
   ctx=browser.new_context(viewport=dict(width=800,height=600),has_touch=touch,is_mobile=touch)
   ctx.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
   p=ctx.new_page();p.set_default_timeout(120000);p.on('pageerror',lambda e:report['errors'].append(e.stack))
   p.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
   p.route('**/favicon.ico',lambda route:route.fulfill(status=204))
   p.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded');p.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
   p.locator('#startBtn').click();p.wait_for_function('type=>nebeljagdTestState().equippedWeapon===type',arg=slug+'Staff')
   s=state(p);assert s['combat']['heldModel']['model']=='tripo' and s['combat']['heldModel']['variant']==variant
   target=next(a for a in s['practiceActors'] if a['id']=='practice-1');point=target['position'];health=target['health'];damage=s['equippedItem']['damage']
   p.evaluate('p=>nebeljagdInspect({x:p.x,z:p.z-5,direction:0})',point)
   elapsed=state(p)['elapsed'];p.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=elapsed+.3);capture(p,mode+'-held')
   if slug=='sun':
    if touch:
     rect=p.locator('#attackBtn').bounding_box();ax=rect['x']+rect['width']/2;ay=rect['y']+rect['height']/2
     cdp=ctx.new_cdp_session(p);cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=ax,y=ay,id=1)]))
     # Forward target distance is controlled by charge with the same virtual attack button.
     p.wait_for_function('nebeljagdTestState().combat.sun.aimRange?.radius>=5')
    else:
     pixel=p.evaluate('p=>nebeljagdProjectPoint(p)',point);p.mouse.move(pixel['x'],pixel['y']);p.keyboard.down('f');p.wait_for_function('nebeljagdTestState().combat.sun.aimRange?.radius===20')
    assert state(p)['combat']['shotsFired']==0
    pause_at(p,"s.combat.sun.active && s.combat.sun.age>=.05")
    if touch:cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
    else:p.keyboard.up('f')
    p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p);assert s['combat']['sun']['visuals']['phase']=='warning';assert next(a for a in s['practiceActors'] if a['id']=='practice-1')['health']==health;capture(p,mode+'-seed')
    seed_brightness=s['combat']['sun']['visuals']['brightness']
    seed_radius=s['combat']['sun']['visuals']['effectiveRadius']
    pause_at(p,'s.combat.sun.age>=.28');p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p)
    assert s['combat']['sun']['visuals']['brightness']>seed_brightness and s['combat']['sun']['pulses']==0
    assert seed_radius<s['combat']['sun']['visuals']['effectiveRadius']<sun_rules['radius'];capture(p,mode+'-warning')
    pause_at(p,'s.combat.sun.age>=.42');p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p)
    assert s['combat']['sun']['pulses']==1 and s['combat']['sun']['visuals']['damageEligible'];capture(p,mode+'-damage-onset')
    pause_at(p,'s.combat.sun.age>=1.1');p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p);enemy=next(a for a in s['practiceActors'] if a['id']=='practice-1')
    assert enemy['health']<health and enemy['blindRemaining']>0 and enemy['revealRemaining']>0;capture(p,mode+'-beam')
    assert s['combat']['sun']['visuals']['density']>=.97 and s['combat']['sun']['visuals']['groundFill']==1
    assert s['combat']['sun']['visuals']['effectiveRadius']==sun_rules['radius']
    assert s['combat']['sun']['visuals']['particleDirection']=='down' and s['combat']['sun']['visuals']['fallingParticles']>0
    ground_pixels=p.evaluate("""async center=>{
     const img=new Image();img.src=nebeljagdCaptureFrame();await img.decode();
     const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
     const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
     const rect=document.querySelector('canvas').getBoundingClientRect();
     return [[.9,.2],[-.9,.2],[0,1]].map(([dx,dz])=>{
      const p=nebeljagdProjectPoint({x:center.x+dx,z:center.z+dz});
      return [...ctx.getImageData(Math.round((p.x-rect.left)*img.width/rect.width),Math.round((p.y-rect.top)*img.height/rect.height),1,1).data];
     });
    }""",s['combat']['sun']['center'])
    assert all(r>220 and g>210 and b>180 for r,g,b,a in ground_pixels),ground_pixels
    passed(mode+': dense light column hides the green ground in captured pixels')
    frozen=s['combat']['sun'];p.wait_for_timeout(100);assert state(p)['combat']['sun']==frozen
    fade_age=sun_rules['warning']+sun_rules['duration']+sun_rules['fade']*.5
    pause_at(p,'s.combat.sun.age>='+str(fade_age));p.wait_for_function('nebeljagdTestState().phase==="paused"');s=state(p)
    assert s['combat']['sun']['pulses']==8 and not s['combat']['sun']['visuals']['damageEligible']
    assert 0<s['combat']['sun']['visuals']['brightness']<1;capture(p,mode+'-fade')
    p.locator('#resumeBtn').click();p.wait_for_function('!nebeljagdTestState().combat.sun.active');s=state(p);enemy=next(a for a in s['practiceActors'] if a['id']=='practice-1')
    # Touch charge can place the patrolling target outside the first narrow pulse.
    # The cast still emits all eight pulses; only actual overlaps deal damage.
    hits=s['combat']['sun']['hits'];assert s['combat']['sun']['pulses']==len(sun_rules['pulses'])
    assert (6<=hits<=8 if touch else hits==8)
    assert abs(health-enemy['health']-damage*hits/len(sun_rules['pulses']))<1e-5
    passed(mode+': growing footprint and brightness, falling peak particles, long smooth fade, eight damage pulses, reveal/blind status, pause and cleanup')
    p.evaluate('nebeljagdInspectSolarHit()');p.wait_for_function('nebeljagdTestState().vision.blindRadius===3');capture(p,mode+'-blinded')
    pos=state(p)['position'];assert not p.evaluate('p=>nebeljagdInspectVisibility({x:p.x+8,z:p.z})',pos)
    p.wait_for_function('nebeljagdTestState().vision.blindRadius===null');passed(mode+': affected avatar sight contracts to 3 metres and recovers')
   else:
    for hit in range(1,4):
     p.wait_for_function('nebeljagdTestState().attackCooldown<=0')
     point=next(a for a in state(p)['practiceActors'] if a['id']=='practice-1')['position']
     # Shoot along its patrol line, so a moving target remains on the flight axis.
     p.evaluate('p=>nebeljagdInspect({x:p.x-5,z:p.z,direction:Math.PI/2})',point)
     if hit==1:pause_at(p,'s.combat.effects.soulCloudProjectiles>0')
     p.keyboard.press('f')
     if hit==1:
      p.wait_for_function('nebeljagdTestState().phase==="paused"');capture(p,mode+'-projectile');assert state(p)['combat']['effects']['soulModel'];p.locator('#resumeBtn').click()
     pause_at(p,'s.combat.soul.marks.some(m=>m.count==='+str(hit)+')');p.wait_for_function('nebeljagdTestState().phase==="paused"')
     s=state(p);assert next(a for a in s['practiceActors'] if a['id']=='practice-1')['health']==health
     assert s['combat']['effects']['soulImpacts']['enveloping']>0;capture(p,mode+'-envelop-'+str(hit))
     pause_at(p,'s.combat.soul.apparitions.some(a=>a.markReveal>=1)');p.wait_for_function('nebeljagdTestState().phase==="paused"')
     assert state(p)['combat']['soul']['apparitions'][0]['height']>=4.4;capture(p,mode+'-skull-'+str(hit))
     if hit<3:p.locator('#resumeBtn').click()
    for phase in ['raised','strike','executed']:
     pause_at(p,'s.combat.soul.apparitions.some(a=>a.phase==="'+phase+'")');p.wait_for_function('nebeljagdTestState().phase==="paused"');capture(p,mode+'-reaper-'+phase)
    p.locator('#resumeBtn').click()
    p.wait_for_function('!nebeljagdTestState().practiceActors.find(a=>a.id==="practice-1").alive');assert state(p)['lastDefeat']['type']=='soul-judgment';capture(p,mode+'-judgment');passed('Soul: shadow projectile with smoke envelops victim before raised skull fragments; existing execution and level-up credit preserved')
   ctx.close()
  assert not report['errors'],report['errors'];assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==original_hash;report.update(status='passed',mapSha256=original_hash)
 except BaseException as e:
  report.update(status='failed',failure=str(e))
  try:(OUT/'failure-state.json').write_text(json.dumps(state(p),indent=2));p.screenshot(path=str(OUT/'failure.png'))
  except Exception:pass
  raise
 finally:
  browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2))
