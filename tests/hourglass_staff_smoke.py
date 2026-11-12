"""Real generated editor/game: hourglass import, mouse/touch, warning, slow and cleanup."""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:4176').rstrip('/')
OUT = ROOT / 'test-results/hourglass-staff'
OUT.mkdir(parents=True, exist_ok=True)
map_hash = hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
fixture = json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {createLobbyMap} from './src/lobby-map.js'; console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects'] = [dict(id='hourglass',name='Sanduhrstab',kind='hourglassStaff',
    variant='kit-tripo-hourglass-staff',position=[0,-14],rotation=0,scale=1,rarity='common')]
report = dict(status='running',checks=[],errors=[])
def passed(text):
    report['checks'].append(text); print('PASS',text,flush=True)
def state(page): return page.evaluate('nebeljagdTestState()')
def actor(page): return next(a for a in state(page)['practiceActors'] if a['id']=='practice-1')
def pause_at(page,age):
    page.evaluate('''age=>{
      function frame(){if(nebeljagdTestState().combat.hourglass.age>=age)document.querySelector('#pauseBtn').click();else requestAnimationFrame(frame);}
      requestAnimationFrame(frame);
      if(nebeljagdTestState().phase==='paused')document.querySelector('#resumeBtn').click();
    }''',age)
    page.wait_for_function('nebeljagdTestState().phase==="paused"')
def capture(page,name):
    data=page.evaluate('''()=>{
      const s=nebeljagdTestState(),zoom=s.camera.zoom;
      nebeljagdInspectCamera({zoom:2,focus:s.combat.hourglass.center});
      const png=nebeljagdCaptureFrame();nebeljagdInspectCamera({zoom});return png;
    }''').split(',',1)[1]
    (OUT/(name+'.png')).write_bytes(base64.b64decode(data))
    (OUT/(name+'.json')).write_text(json.dumps(state(page),indent=2)+'\n')

def sand_coverage(page):
    # Read actual GPU pixels across the interior. Sparse points and a thin rim
    # cannot pass: substantial golden sand must fill the field between them.
    return page.evaluate('''()=>{
      const s=nebeljagdTestState(),g=s.combat.hourglass,zoom=s.camera.zoom;
      nebeljagdInspectCamera({zoom:2,focus:g.center});nebeljagdCaptureFrame();
      const game=document.querySelector('#game'),copy=document.createElement('canvas');
      copy.width=game.width;copy.height=game.height;const ctx=copy.getContext('2d');ctx.drawImage(game,0,0);
      const rect=game.getBoundingClientRect();let gold=0,total=0;
      for(const radius of [.35,.55,.75,.87])for(let i=0;i<24;i++){
        const a=i*Math.PI/12,p=nebeljagdProjectPoint({x:g.center.x+Math.cos(a)*g.radius*radius,z:g.center.z+Math.sin(a)*g.radius*radius});
        const x=Math.floor((p.x-rect.left)/rect.width*copy.width),y=Math.floor((p.y-rect.top)/rect.height*copy.height);
        if(x<0||y<0||x>=copy.width||y>=copy.height)continue;
        const [r,v,b]=ctx.getImageData(x,y,1,1).data;if(r>v*1.12&&r>b*1.4&&r>90)gold++;total++;
      }nebeljagdInspectCamera({zoom});return {gold,total,coverage:gold/Math.max(1,total)};
    }''')

with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_EXECUTABLE') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else p.chromium.executable_path)
    browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    try:
        # Exercise the real palette without writing the authored map.
        context=browser.new_context(viewport=dict(width=960,height=720))
        editor=context.new_page();editor.set_default_timeout(120000)
        editor.goto(BASE+'/map-editor.html',wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        original=editor.evaluate('nebeljagdMapTestState().map')
        editor.locator('#editor-tab-objects').click();editor.locator('#editor-tool-objects-place').click()
        editor.locator('#palette-kind').select_option('hourglassStaff')
        editor.locator('#palette-variant').select_option('kit-tripo-hourglass-staff')
        editor.locator('#add-object-center').click()
        edited=editor.evaluate('nebeljagdMapTestState().map')
        assert edited['objects'][-1]['variant']=='kit-tripo-hourglass-staff'
        assert edited['objects'][:-1]==original['objects']
        editor.reload(wait_until='domcontentloaded');editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor.evaluate('nebeljagdMapTestState().map.objects.at(-1).variant')=='kit-tripo-hourglass-staff'
        passed('Editor placement and saved draft retain the real hourglass variant and all existing objects')
        context.close()
        for touch in [False,True]:
            mode='touch' if touch else 'mouse';print('START',mode,flush=True)
            options=dict(viewport=dict(width=960,height=720),has_touch=touch,is_mobile=touch)
            if touch:options.update(device_scale_factor=2,user_agent='Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1')
            context=browser.new_context(**options)
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(fixture))+');')
            page=context.new_page();page.set_default_timeout(120000)
            page.route('**/favicon.ico',lambda route:route.fulfill(status=204))
            page.on('pageerror',lambda error:report['errors'].append(str(error)))
            page.on('console',lambda msg:report['errors'].append(msg.text) if msg.type=='error' else None)
            page.goto(BASE+'/magebrawl.html?inspect=1&mapSource=editor&quality=low',wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect && nebeljagdTestState().rendering.calls>0')
            page.locator('#startBtn').click();page.wait_for_function('nebeljagdTestState().equippedWeapon==="hourglassStaff"')
            s=state(page);assert s['equippedItem']['variant']=='kit-tripo-hourglass-staff'
            assert s['combat']['heldModel']['model']=='tripo'
            if touch:assert s['graphicsProfile']['iPad'] and s['graphicsProfile']['pixelRatio']<=1
            point=actor(page)['position'];health=actor(page)['health']
            page.evaluate('p=>nebeljagdInspect({x:p.x-(p.touch?20:0),z:p.z-(p.touch?0:5),direction:p.touch?Math.PI/2:0})',{**point,'touch':touch})
            elapsed=state(page)['elapsed'];page.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=elapsed+.3)
            if touch:
                attack=page.locator('#attackBtn').bounding_box();ax=attack['x']+attack['width']/2;ay=attack['y']+attack['height']/2
                joy=page.locator('#joystick').bounding_box();jx=joy['x']+joy['width']/2;jy=joy['y']+joy['height']/2
                cdp=context.new_cdp_session(page)
                cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=ax,y=ay,id=1)]))
                cdp.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=ax,y=ay,id=1),dict(x=jx+joy['width']*.30,y=jy,id=2)]))
            else:
                pixel=page.evaluate('p=>nebeljagdProjectPoint(p)',point)
                page.mouse.move(pixel['x'],pixel['y']);page.keyboard.down('f')
            page.wait_for_function('nebeljagdTestState().combat.hourglass.aimRange?.radius===20')
            assert state(page)['combat']['shotsFired']==0
            # Arm before release so software GPU/RPC latency cannot skip the warning.
            page.evaluate('''()=>{function f(){if(nebeljagdTestState().combat.hourglass.age>=.15)document.querySelector('#pauseBtn').click();else requestAnimationFrame(f);}requestAnimationFrame(f);}''')
            if touch:cdp.send('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]))
            else:page.keyboard.up('f')
            page.wait_for_function('nebeljagdTestState().phase==="paused"')
            g=state(page)['combat']['hourglass'];assert g['visuals']['phase']=='warning' and g['casts']==1,g
            assert actor(page)['speedMultiplier']==1 and actor(page)['health']==health
            assert state(page)['combat']['effects']['activeProjectiles']==0
            center=g['center']
            page.evaluate('p=>nebeljagdInspect({x:p.x-4,z:p.z-4,direction:Math.PI/4})',center)
            capture(page,mode+'-warning');passed(mode+': release places a warning, with no projectile or premature slow')
            pause_at(page,1.2);capture(page,mode+'-active')
            early=actor(page);assert .35<early['speedMultiplier']<1,early
            frozen=state(page)['combat']['hourglass'];page.wait_for_timeout(150);assert state(page)['combat']['hourglass']==frozen
            pause_at(page,3);capture(page,mode+'-strong')
            coverage=sand_coverage(page);assert coverage['total']==96 and coverage['coverage']>=.18,coverage
            report.setdefault('sandCoverage',{})[mode]=coverage
            late=actor(page);assert late['speedMultiplier']<early['speedMultiplier'] and late['speedMultiplier']>=.35-1e-8,late
            assert late['travelled']>early['travelled'] and late['health']==health
            assert state(page)['combat']['hourglass']['visuals']['draws']<=6
            passed(mode+': actual practice movement slows progressively, stays mobile, deals no damage and freezes on pause')
            pause_at(page,4.95);capture(page,mode+'-dissolve')
            assert state(page)['combat']['hourglass']['visuals']['phase']=='dissolve'
            assert actor(page)['speedMultiplier']==1
            page.locator('#resumeBtn').click();page.wait_for_function('!nebeljagdTestState().combat.hourglass.active')
            assert state(page)['combat']['hourglass']['visuals']['draws']==0
            passed(mode+': sand dissolves and all field/status effects expire')
            context.close()
        assert not report['errors'],report['errors']
        assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==map_hash
        report.update(status='passed',mapSha256=map_hash,browser=browser.version)
    except BaseException as error:
        report.update(status='failed',failure=str(error))
        if 'page' in locals() and not page.is_closed():
            try:(OUT/'failure-state.json').write_text(json.dumps(state(page),indent=2))
            except Exception:pass
        raise
    finally:
        browser.close();(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
