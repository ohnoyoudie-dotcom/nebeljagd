"""Check three blade-following sword attacks and a body-origin victory burst.

Run after building with NEBELJAGD_URL pointing at standalone files. Only an
imported fixture changes; no production map or progression values are patched.
"""
from copy import deepcopy
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5232').rstrip('/')
RELEASE=Path(os.environ.get('NEBELJAGD_RELEASE_DIR',ROOT/'welt'))
OUT=Path(os.environ.get('NEBELJAGD_QA_OUT','/tmp/nebeljagd-sword-burst-feedback-qa'))
OUT.mkdir(parents=True,exist_ok=True)
BASE=json.loads((ROOT/'worldmap.json').read_text())
MAP_HASH=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
REPORT={'status':'running','url':URL,'checks':[],'errors':[],'unexpectedRequests':[],'screenshots':[],
        'limits':'Real keyboard swings and kill in an imported test island, Chromium/SwiftShader; no physical-device performance claim.'}


def passed(name,evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence})
    print('PASS',name,flush=True)


def fixture():
    value=deepcopy(BASE);value['name']='QA · Schwertkombination und Levelaufstieg'
    value['bounds']={'minX':-90,'minZ':-90,'maxX':90,'maxZ':90}
    points=[[-80,-80],[80,-80],[80,80],[-80,80]]
    value['island']['points']=deepcopy(points)
    value['regions']=[{'id':'qa-meadow','name':'Testwiese','biome':'meadow','color':'#638b4c','label':[0,0],'points':deepcopy(points)}]
    for field in ['islets','paths','rivers','waterAreas','places','spawnAreas','barriers']:value[field]=[]
    value['barriers']=[{'id':'qa-sword-wall','name':'Sicht- und Trefferschutz','kind':'wall',
                        'variant':'kit-stone','points':[[4,8],[4,16]],'height':2,'scale':1,'gaps':[]}]
    value['gameplay']['spawnPosition']=[0,0];value['zone']['center']=[0,0]
    value.pop('landscape',None)
    value['objects']=[{'id':'qa-sword','name':'Testschwert','kind':'sword','variant':'kit-tripo-sword',
                       'rarity':'legendary','position':[-4,-4],'rotation':0,'scale':1}]
    return value


def state(page):
    return page.evaluate('''()=>{const s=nebeljagdTestState();return{
      level:s.level,health:s.health,maxHealth:s.maxHealth,elapsed:s.elapsed,defeats:s.defeats,
      effect:s.levelUpEffect,bars:s.healthBars,weapon:s.equippedItem,actors:s.practiceActors,
      cooldown:s.attackCooldown,combat:s.combat,character:s.character,position:s.position}}''')


def wait_sim(page,seconds):
    before=page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=before+seconds)


def attack(page):
    page.wait_for_function('nebeljagdTestState().attackCooldown===0')
    page.evaluate('''()=>{const a=nebeljagdTestState().practiceActors.find(a=>a.id==='practice-1');
      nebeljagdInspect({x:a.position.x-1.3,z:a.position.z,direction:Math.PI/2});}''')
    wait_sim(page,.08)
    before=state(page)['combat']['damageHits']
    page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n',arg=before,polling=25)
    result=state(page)
    assert result['combat']['damageHits']==before+1,result['combat']
    return result


def save_frame(name,data):
    shot=OUT/(name+'.png');shot.write_bytes(base64.b64decode(data.split(',',1)[1]))
    REPORT['screenshots'].append(str(shot))
    return str(shot)


def sword_patterns(page):
    """Observe real input without advancing time or calling gameplay methods."""
    page.evaluate('nebeljagdInspect({x:-12,z:-10,direction:Math.PI/6})')
    page.evaluate('nebeljagdInspectCamera({zoom:1.8})')
    before=state(page)
    page.evaluate('''()=>{window.__swordFrames=[];window.__collectSword=true;
      const capture=()=>{if(!window.__collectSword)return;
        const s=nebeljagdTestState(),combo=s.combat.swordCombo;
        if(combo.active&&combo.progress>=.48&&combo.progress<.7
          &&!window.__swordFrames.some(frame=>frame.evidence.combat.swordCombo.swingId===combo.swingId)){
          window.__swordFrames.push({evidence:{combat:s.combat,elapsed:s.elapsed,position:s.position},image:nebeljagdCaptureFrame()});
        }requestAnimationFrame(capture);
      };requestAnimationFrame(capture);
    }''')
    ids=[]
    for index in range(3):
        page.wait_for_function('nebeljagdTestState().attackCooldown===0')
        previous=state(page)['combat']['swordCombo']['swingId']
        page.keyboard.press('f')
        page.wait_for_function('id=>nebeljagdTestState().combat.swordCombo.swingId>id',arg=previous,polling=25)
        if index==0:
            page.keyboard.press('f')
            assert state(page)['combat']['swordCombo']['swingId']==previous+1
        page.wait_for_function('n=>window.__swordFrames.length===n',arg=index+1,polling=25)
        page.wait_for_function('nebeljagdTestState().attackCooldown===0&&!nebeljagdTestState().combat.swordCombo.active')
        current=state(page)
        assert current['combat']['swordCombo']['swingId']==previous+1
        assert current['combat']['damageHits']==before['combat']['damageHits']
        assert current['effect']['emitted']==0 and current['level']==1
        ids.append(previous+1)
    frames=page.evaluate('()=>{window.__collectSword=false;return window.__swordFrames}')
    assert len(frames)==3
    for index,frame in enumerate(frames):
        combat=frame['evidence']['combat'];combo=combat['swordCombo'];trail=combat['swordTrail']
        assert combo['index']==index+1 and combo['swingId']==ids[index],combo
        assert combo['pattern']==['forehand','backhand','overhead'][index],combo
        assert .48<=combo['progress']<.65 and combo['active'],combo
        assert trail['style']=='blade-following-ribbon' and trail['trailActive'],trail
        assert trail['sampleCount']>=3 and trail['segmentCount']>=2 and trail['depthTested'],trail
        assert trail['shadingLayers']==['edge','ribbon','afterimage'] and trail['drawCalls']<=2,trail
        assert math.dist(list(trail['latestBase'].values()),list(trail['latestTip'].values()))>.3,trail
        for anchor,latest in [('base','latestBase'),('tip','latestTip')]:
            assert all(abs(combat['swordBlade'][anchor][axis]-trail[latest][axis])<.0001 for axis in ['x','y','z']),combat
        save_frame('sword-'+combo['pattern'],frame['image'])
    REPORT['swordSequence']=[frame['evidence'] for frame in frames]
    passed('Three real F attacks use distinct forehand, backhand and overhead blade trails; cooldown input cannot advance the chain',REPORT['swordSequence'])
    wait_sim(page,1.05)
    idle=state(page)
    assert idle['combat']['swordCombo']['index']==0 and not idle['combat']['swordCombo']['active']
    assert not idle['combat']['swordTrail']['trailActive'] and idle['combat']['swordTrail']['segmentCount']==0
    passed('Idle clears the combo and removes the trailing geometry',idle['combat']['swordCombo'])
    return frames


def wall_guard(page):
    """An in-range hidden target stays unharmed behind a solid wall."""
    page.wait_for_function('nebeljagdTestState().attackCooldown===0')
    page.evaluate('''()=>{const a=nebeljagdTestState().practiceActors.find(a=>a.id==='practice-2');
      nebeljagdInspect({x:3,z:a.position.z,direction:Math.PI/2});}''')
    wait_sim(page,.08)
    before=state(page);target=next(a for a in before['actors'] if a['id']=='practice-2')
    assert math.hypot(target['position']['x']-before['position']['x'],target['position']['z']-before['position']['z'])<before['weapon']['range']
    page.keyboard.press('f')
    page.wait_for_function('id=>nebeljagdTestState().combat.swordCombo.swingId>id',arg=before['combat']['swordCombo']['swingId'])
    page.wait_for_function('nebeljagdTestState().attackCooldown===0&&!nebeljagdTestState().combat.swordCombo.active')
    after=state(page);blocked=next(a for a in after['actors'] if a['id']=='practice-2')
    assert blocked['health']==target['health'] and after['combat']['damageHits']==before['combat']['damageHits']
    assert after['effect']['emitted']==1 and after['level']==2
    # Same opponent, same weapon, with a clear line from the other side.
    page.evaluate('''()=>{const a=nebeljagdTestState().practiceActors.find(a=>a.id==='practice-2');
      nebeljagdInspect({x:a.position.x+1.3,z:a.position.z,direction:-Math.PI/2});}''')
    wait_sim(page,.08)
    page.keyboard.press('f')
    page.wait_for_function('n=>nebeljagdTestState().combat.damageHits>n',arg=before['combat']['damageHits'])
    clear=state(page);hit=next(a for a in clear['actors'] if a['id']=='practice-2')
    assert clear['combat']['damageHits']==before['combat']['damageHits']+1 and hit['health']==target['health']-before['weapon']['damage']
    passed('A wall prevents an in-range sword hit; the same opponent is hit exactly once from the clear side',{'blockedTarget':blocked,'clearTarget':hit})


def record_document():
    digest=hashlib.sha256();size=0
    with urlopen(URL+'/nebeljagd.html',timeout=60) as response:
        assert response.status==200
        while chunk:=response.read(1024*1024):digest.update(chunk);size+=len(chunk)
    assert digest.hexdigest()==hashlib.sha256((RELEASE/'nebeljagd.html').read_bytes()).hexdigest()
    REPORT['delivery']={'file':str(RELEASE/'nebeljagd.html'),'bytes':size,'sha256':digest.hexdigest()}


try:
    record_document()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            context=browser.new_context(viewport={'width':1280,'height':900},reduced_motion='no-preference')
            page=context.new_page();page.set_default_timeout(120000)
            page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
            page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
            context.on('request',lambda r:REPORT['unexpectedRequests'].append(r.url)
                if r.url.startswith(('http:','https:')) and r.resource_type!='document'
                and not urlsplit(r.url).path.endswith('/favicon.ico') else None)
            page.goto(URL+'/nebeljagd.html?inspect=1&quality=low',wait_until='domcontentloaded')
            page.wait_for_function('window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            testmap=fixture()
            with page.expect_navigation(wait_until='domcontentloaded'):
                page.locator('#worldMapFile').set_input_files({'name':'gold-level-up.json','mimeType':'application/json','buffer':json.dumps(testmap).encode()})
            page.wait_for_function('name=>window.nebeljagdInspect&&nebeljagdTestState().world.mapName===name&&nebeljagdTestState().rendering.calls>0',arg=testmap['name'])
            page.locator('#startBtn').click()
            page.wait_for_function('nebeljagdTestState().phase==="playing"')
            initial=state(page)
            assert initial['level']==1 and initial['effect']['emitted']==0 and not initial['effect']['active']
            initial_glow=initial['character']['levelUpGlowMaterials']
            assert initial_glow['count']>0 and initial_glow['restored'] and initial_glow['strength']==0,initial_glow
            initial_bar=next(b for b in initial['bars'] if b['id']=='player')
            assert initial_bar['levelPulse']['remaining']==0 and not initial_bar['levelPulse']['active']
            assert initial_bar['levelPulse']['scale']==1 and initial_bar['levelPulse']['glow']==0
            initial_ui=page.evaluate('''()=>{const b=document.querySelector('#healthBar'),l=document.querySelector('#playerLevel'),s=getComputedStyle(l);return{
              width:b.getBoundingClientRect().width,left:b.getBoundingClientRect().left,labelRight:l.getBoundingClientRect().right,
              background:s.backgroundImage,border:s.borderTopColor,color:s.color,fontWeight:s.fontWeight,
              noticeAbsent:document.querySelector('#levelUpNotice')===null}}''')
            assert initial_ui['noticeAbsent'] and initial_ui['labelRight']<=initial_ui['left']
            assert 'gradient(' in initial_ui['background'] and int(initial_ui['fontWeight'])>=700,initial_ui
            passed('Gold badge starts at level 1 and no celebration runs before a victory',{'ui':initial_ui,'effect':initial['effect']})
            page.evaluate('nebeljagdInspect({x:-4,z:-4})')
            page.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
            sword_frames=sword_patterns(page)
            equipped=state(page)
            target=next(a for a in equipped['actors'] if a['id']=='practice-1')
            hits=math.ceil(target['health']/equipped['weapon']['damage'])
            for index in range(hits-1):
                struck=attack(page)
                assert struck['combat']['swordCombo']['index']==index+1,struck['combat']['swordCombo']
                assert state(page)['effect']['emitted']==0 and state(page)['level']==1
                print(f'Progress: nonlethal hit {index+1}/{hits}',flush=True)
            # Capture the actual renderer at four stages of the same victory.
            # Simulation and CSS timing remain untouched; slow software WebGL
            # does not turn a real-time screenshot delay into a false expiry.
            page.evaluate('''()=>{const l=document.querySelector('#playerLevel');
              window.__levelHudPulse=null;window.__levelFeedbackFrames=[];
              const observer=new MutationObserver(()=>{
                if(!l.classList.contains('is-leveling'))return;
                window.__levelHudPulse={label:l.textContent,pulsing:true};observer.disconnect();
              });observer.observe(l,{attributes:true,childList:true,subtree:true});
              const stages=[{name:'core',age:.10},{name:'burst',age:.28},{name:'settling',age:.65},{name:'fade',age:1.15}];
              const capture=()=>{const s=nebeljagdTestState();
                const stage=stages[window.__levelFeedbackFrames.length];
                if(!stage)return;
                if(s.level!==2||!s.levelUpEffect.active||s.levelUpEffect.age<stage.age){requestAnimationFrame(capture);return;}
                const b=document.querySelector('#healthBar');
                const evidence={stage:stage.name,requestedAge:stage.age,
                  level:s.level,health:s.health,maxHealth:s.maxHealth,effect:s.levelUpEffect,character:s.character,
                  bar:s.healthBars.find(x=>x.id==='player'),width:b.getBoundingClientRect().width,
                  left:b.getBoundingClientRect().left,labelRight:l.getBoundingClientRect().right,label:l.textContent,
                  noticeAbsent:document.querySelector('#levelUpNotice')===null};
                const frame={evidence,image:nebeljagdCaptureFrame()};
                if(stage.name==='burst'){
                  nebeljagdInspectCamera({zoom:1});frame.defaultCameraImage=nebeljagdCaptureFrame();
                  nebeljagdInspectCamera({zoom:1.8});
                }
                window.__levelFeedbackFrames.push(frame);
                if(window.__levelFeedbackFrames.length<stages.length)requestAnimationFrame(capture);
              };requestAnimationFrame(capture);
            }''')
            struck=attack(page)
            assert struck['combat']['swordCombo']['index']==3,struck['combat']['swordCombo']
            print('Progress: final blow landed; capture four stages of the actual effect',flush=True)
            page.wait_for_function('window.__levelFeedbackFrames.length===4&&Boolean(window.__levelHudPulse)',polling=25,timeout=90000)
            frames=page.evaluate('window.__levelFeedbackFrames')
            REPORT['sequence']=[]
            for frame in frames:
                evidence=frame['evidence'];effect=evidence['effect']
                assert evidence['requestedAge']<=effect['age']<evidence['requestedAge']+.15,evidence
                assert effect['active'] and effect['emitted']==1 and effect['depthTested'],effect
                assert evidence['noticeAbsent'] and abs(evidence['width']-initial_ui['width'])<.01
                save_frame('actual-kill-'+evidence['stage'],frame['image'])
                if frame.get('defaultCameraImage'):save_frame('actual-kill-default-camera',frame['defaultCameraImage'])
                REPORT['sequence'].append(evidence)
            gallery=''.join(f'<figure><div class="detail"><img src="actual-kill-{entry["stage"]}.png"></div><figcaption>{entry["stage"]}: {entry["effect"]["age"]:.2f} s · 2× detail</figcaption></figure>' for entry in REPORT['sequence'])
            (OUT/'sequence.html').write_text('<!doctype html><meta charset="utf-8"><title>Level-up: actual rendered sequence</title><style>body{margin:16px;background:#14251e;color:#f0dfb4;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}figure{margin:0}.detail{aspect-ratio:4/3;overflow:hidden}img{width:100%;display:block;transform:scale(2);transform-origin:50% 54%}figcaption{padding:8px 0}</style><main>'+gallery+'</main>')
            visible=REPORT['sequence'][1]
            assert (visible['level'],visible['health'],visible['maxHealth'])==(2,97,125),visible
            assert abs(visible['width']-initial_ui['width'])<.01 and visible['labelRight']<=visible['left']
            assert visible['label']=='2' and visible['bar']['level']==2 and abs(visible['bar']['barWidth']-1.805)<.0001
            assert visible['noticeAbsent']
            visible['hudPulse']=page.evaluate('window.__levelHudPulse')
            assert visible['hudPulse']=={'label':'2','pulsing':True}
            assert visible['effect']['active'] and visible['effect']['emitted']==1 and visible['effect']['level']==2
            assert visible['effect']['style']=='core-burst'
            assert visible['effect']['particleCount']==36 and visible['effect']['reducedMotion'] is False
            early=REPORT['sequence'][0]
            assert early['effect']['coreVisible'] and early['effect']['bodyGlow']>0,early
            assert early['character']['levelUpGlow']>0,early['character']
            assert abs(early['character']['levelUpGlow']-early['effect']['bodyGlow'])<.001,early
            glow=early['character']['levelUpGlowMaterials']
            assert glow['count']==initial_glow['count'] and not glow['restored']
            assert glow['strength']>0 and glow['maxEmissiveIntensity']>initial_glow['maxEmissiveIntensity'],glow
            settled=REPORT['sequence'][2]
            assert settled['character']['levelUpGlow']==0 and settled['character']['levelUpGlowMaterials']['restored'],settled['character']
            assert visible['effect']['haloVisible'] and not visible['effect']['ribbonVisible']
            assert visible['effect']['lightIntensity']>0 and visible['effect']['depthTested']
            assert visible['effect'].get('ringCount',0)==0 and not visible['effect'].get('beamVisible',False)
            assert visible['bar']['levelPulse']['active'] and visible['bar']['levelPulse']['remaining']>0
            assert 1<visible['bar']['levelPulse']['scale']<=1.21 and visible['bar']['levelPulse']['glow']>0
            assert visible['bar']['levelBounds']['right']<-0.95
            passed('A real victory adds 25 HP with a body-origin burst, brief character glow, number pulse and unchanged health-bar width',visible)
            assert len({round(frame['effect']['age'],2) for frame in REPORT['sequence']})==4
            passed('Four actual renderer frames cover appearance, peak, settling and fade of one celebration',REPORT['sequence'])
            page.wait_for_function('!nebeljagdTestState().levelUpEffect.active&&!document.querySelector("#playerLevel").classList.contains("is-leveling")')
            ended=state(page)
            assert ended['effect']['emitted']==1 and ended['effect']['particleCount']==0 and ended['effect']['remaining']==0
            assert not ended['effect']['haloVisible'] and not ended['effect']['coreVisible'] and not ended['effect']['ribbonVisible'] and ended['effect']['lightIntensity']==0
            assert ended['effect']['bodyGlow']==0 and ended['character']['levelUpGlow']==0
            assert ended['character']['levelUpGlowMaterials']==initial_glow,ended['character']['levelUpGlowMaterials']
            ended_bar=next(b for b in ended['bars'] if b['id']=='player')
            assert not ended_bar['levelPulse']['active'] and ended_bar['levelPulse']['remaining']==0
            assert ended_bar['levelPulse']['scale']==1 and ended_bar['levelPulse']['glow']==0
            assert not page.locator('#playerLevel').evaluate('e=>e.classList.contains("is-leveling")')
            assert ended['level']==2 and page.locator('#levelUpNotice').count()==0
            passed('The figure effect and number pulse expire after a single victory',ended['effect'])
            wall_guard(page)
            page.keyboard.press('Escape');page.locator('#restartBtn').click()
            page.wait_for_function('nebeljagdTestState().phase==="playing"')
            restarted=state(page)
            assert (restarted['level'],restarted['health'],restarted['maxHealth'])==(1,72,100)
            assert restarted['effect']['emitted']==0 and not restarted['effect']['active'] and restarted['effect']['particleCount']==0
            assert not restarted['effect']['haloVisible'] and not restarted['effect']['coreVisible'] and not restarted['effect']['ribbonVisible'] and restarted['effect']['lightIntensity']==0
            assert restarted['effect']['bodyGlow']==0 and restarted['character']['levelUpGlow']==0
            assert restarted['character']['levelUpGlowMaterials']==initial_glow,restarted['character']['levelUpGlowMaterials']
            assert restarted['combat']['swordCombo']['index']==0 and restarted['combat']['swordCombo']['swingId']==0
            assert not restarted['combat']['swordTrail']['trailActive'] and restarted['combat']['swordTrail']['segmentCount']==0
            restarted_bar=next(b for b in restarted['bars'] if b['id']=='player')
            assert not restarted_bar['levelPulse']['active'] and restarted_bar['levelPulse']['scale']==1
            assert restarted_bar['levelPulse']['remaining']==0 and restarted_bar['levelPulse']['glow']==0
            assert page.locator('#levelUpNotice').count()==0
            passed('Restart clears the celebration and restores the initial level and health',restarted['effect'])
            assert not REPORT['errors'],REPORT['errors']
            assert not REPORT['unexpectedRequests'],REPORT['unexpectedRequests']
            gallery_page=context.new_page()
            gallery_page.set_viewport_size({'width':1280,'height':1000})
            # Managed Chromium disables file:// navigation. Render these
            # already captured images in memory, without new URL requests.
            gallery_document=(OUT/'sequence.html').read_text()
            for frame in frames:
                gallery_document=gallery_document.replace(f'actual-kill-{frame["evidence"]["stage"]}.png',frame['image'])
            gallery_page.set_content(gallery_document,wait_until='load')
            gallery_page.wait_for_function('Array.from(document.images).every(image=>image.complete&&image.naturalWidth>0)')
            gallery_page.screenshot(path=str(OUT/'sequence.png'),full_page=True)
            REPORT['contactSheet']=str(OUT/'sequence.png')
            REPORT['contactSheetNote']='Browser layout of four 2× detail crops. The individual PNGs retain each complete, untouched renderer frame.'
            sword_gallery=''.join(f'<figure><div class="detail"><img src="{frame["image"]}"></div><figcaption>{frame["evidence"]["combat"]["swordCombo"]["pattern"]} · progress {frame["evidence"]["combat"]["swordCombo"]["progress"]:.2f}</figcaption></figure>' for frame in sword_frames)
            gallery_page.set_content('<!doctype html><meta charset="utf-8"><title>Actual sword attack frames</title><style>body{margin:16px;background:#14251e;color:#f0dfb4;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}figure{margin:0}.detail{aspect-ratio:1;overflow:hidden}img{width:100%;display:block;transform:scale(2);transform-origin:50% 54%}figcaption{padding:8px 0}</style><main>'+sword_gallery+'</main>',wait_until='load')
            gallery_page.wait_for_function('Array.from(document.images).every(image=>image.complete&&image.naturalWidth>0)')
            gallery_page.screenshot(path=str(OUT/'sword-sequence.png'),full_page=True)
            REPORT['swordContactSheet']=str(OUT/'sword-sequence.png')
            gallery_page.close()
        except BaseException:
            try:page.screenshot(path=str(OUT/'failure.png'))
            except Exception:pass
            raise
        finally:browser.close()
    assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==MAP_HASH,'The project map changed during the browser test'
    REPORT['sourceMapUnchanged']=MAP_HASH;REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error);raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
