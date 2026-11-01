"""Check gold level badges and the one-shot celebration after a real kill.

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
OUT=Path(os.environ.get('NEBELJAGD_QA_OUT','/tmp/nebeljagd-level-up-direct-feedback-qa'))
OUT.mkdir(parents=True,exist_ok=True)
BASE=json.loads((ROOT/'worldmap.json').read_text())
MAP_HASH=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
REPORT={'status':'running','url':URL,'checks':[],'errors':[],'unexpectedRequests':[],'screenshots':[],
        'limits':'Real keyboard kill in an imported test island, Chromium/SwiftShader; no physical-device performance claim.'}


def passed(name,evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence})
    print('PASS',name,flush=True)


def fixture():
    value=deepcopy(BASE);value['name']='QA · Goldener Levelaufstieg'
    value['bounds']={'minX':-90,'minZ':-90,'maxX':90,'maxZ':90}
    points=[[-80,-80],[80,-80],[80,80],[-80,80]]
    value['island']['points']=deepcopy(points)
    value['regions']=[{'id':'qa-meadow','name':'Testwiese','biome':'meadow','color':'#638b4c','label':[0,0],'points':deepcopy(points)}]
    for field in ['islets','paths','rivers','waterAreas','places','spawnAreas','barriers']:value[field]=[]
    value['gameplay']['spawnPosition']=[0,0];value['zone']['center']=[0,0]
    value.pop('landscape',None)
    value['objects']=[{'id':'qa-sword','name':'Testschwert','kind':'sword','variant':'kit-tripo-sword',
                       'rarity':'legendary','position':[-4,-4],'rotation':0,'scale':1}]
    return value


def state(page):
    return page.evaluate('''()=>{const s=nebeljagdTestState();return{
      level:s.level,health:s.health,maxHealth:s.maxHealth,elapsed:s.elapsed,defeats:s.defeats,
      effect:s.levelUpEffect,bars:s.healthBars,weapon:s.equippedItem,actors:s.practiceActors,
      cooldown:s.attackCooldown,combat:s.combat}}''')


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
            equipped=state(page)
            target=next(a for a in equipped['actors'] if a['id']=='practice-1')
            hits=math.ceil(target['health']/equipped['weapon']['damage'])
            for index in range(hits-1):
                attack(page)
                assert state(page)['effect']['emitted']==0 and state(page)['level']==1
                print(f'Progress: nonlethal hit {index+1}/{hits}',flush=True)
            # Observe the real number pulse and capture the actual renderer
            # while its level effect is active. No CSS opacity or timers change.
            page.evaluate('''()=>{const l=document.querySelector('#playerLevel');
              window.__levelHudPulse=null;window.__levelFeedbackVisible=null;window.__levelFeedbackFrame=null;
              const observer=new MutationObserver(()=>{
                if(!l.classList.contains('is-leveling'))return;
                window.__levelHudPulse={label:l.textContent,pulsing:true};observer.disconnect();
              });observer.observe(l,{attributes:true,childList:true,subtree:true});
              const capture=()=>{const s=nebeljagdTestState();
                if(s.level!==2||!s.levelUpEffect.active||s.levelUpEffect.remaining>1.25){requestAnimationFrame(capture);return;}
                const b=document.querySelector('#healthBar');
                window.__levelFeedbackVisible={level:s.level,health:s.health,maxHealth:s.maxHealth,effect:s.levelUpEffect,
                  bar:s.healthBars.find(x=>x.id==='player'),width:b.getBoundingClientRect().width,
                  left:b.getBoundingClientRect().left,labelRight:l.getBoundingClientRect().right,label:l.textContent,
                  noticeAbsent:document.querySelector('#levelUpNotice')===null};
                window.__levelFeedbackFrame=nebeljagdCaptureFrame();
              };requestAnimationFrame(capture);
            }''')
            attack(page)
            print('Progress: final blow landed; capture actual effect',flush=True)
            page.wait_for_function('Boolean(window.__levelFeedbackFrame)&&Boolean(window.__levelHudPulse)',polling=25,timeout=20000)
            shot=OUT/'actual-kill-gold-level-up.png'
            shot.write_bytes(base64.b64decode(page.evaluate('window.__levelFeedbackFrame').split(',',1)[1]));REPORT['screenshots'].append(str(shot))
            visible=page.evaluate('window.__levelFeedbackVisible')
            assert (visible['level'],visible['health'],visible['maxHealth'])==(2,97,125),visible
            assert abs(visible['width']-initial_ui['width'])<.01 and visible['labelRight']<=visible['left']
            assert visible['label']=='2' and visible['bar']['level']==2 and abs(visible['bar']['barWidth']-1.805)<.0001
            assert visible['noticeAbsent']
            visible['hudPulse']=page.evaluate('window.__levelHudPulse')
            assert visible['hudPulse']=={'label':'2','pulsing':True}
            assert visible['effect']['active'] and visible['effect']['emitted']==1 and visible['effect']['level']==2
            assert visible['effect']['particleCount']==36 and visible['effect']['reducedMotion'] is False
            assert visible['effect']['ringCount']==2 and visible['effect']['beamVisible']
            assert 1.0<=visible['effect']['remaining']<=1.25,visible['effect']
            assert visible['bar']['levelPulse']['active'] and visible['bar']['levelPulse']['remaining']>0
            assert visible['bar']['levelPulse']['scale']>1 and visible['bar']['levelPulse']['glow']>0
            assert visible['bar']['levelBounds']['right']<-0.95
            passed('A real victory adds 25 HP and celebrates on the figure and level number without a text popup or wider health bars',visible)
            page.wait_for_function('!nebeljagdTestState().levelUpEffect.active&&!document.querySelector("#playerLevel").classList.contains("is-leveling")')
            ended=state(page)
            assert ended['effect']['emitted']==1 and ended['effect']['particleCount']==0 and ended['effect']['remaining']==0
            assert ended['effect']['ringCount']==0 and not ended['effect']['beamVisible']
            ended_bar=next(b for b in ended['bars'] if b['id']=='player')
            assert not ended_bar['levelPulse']['active'] and ended_bar['levelPulse']['remaining']==0
            assert ended_bar['levelPulse']['scale']==1 and ended_bar['levelPulse']['glow']==0
            assert not page.locator('#playerLevel').evaluate('e=>e.classList.contains("is-leveling")')
            assert ended['level']==2 and page.locator('#levelUpNotice').count()==0
            passed('The figure effect and number pulse expire after a single victory',ended['effect'])
            page.keyboard.press('Escape');page.locator('#restartBtn').click()
            page.wait_for_function('nebeljagdTestState().phase==="playing"')
            restarted=state(page)
            assert (restarted['level'],restarted['health'],restarted['maxHealth'])==(1,72,100)
            assert restarted['effect']['emitted']==0 and not restarted['effect']['active'] and restarted['effect']['particleCount']==0
            assert restarted['effect']['ringCount']==0 and not restarted['effect']['beamVisible']
            restarted_bar=next(b for b in restarted['bars'] if b['id']=='player')
            assert not restarted_bar['levelPulse']['active'] and restarted_bar['levelPulse']['scale']==1
            assert restarted_bar['levelPulse']['remaining']==0 and restarted_bar['levelPulse']['glow']==0
            assert page.locator('#levelUpNotice').count()==0
            passed('Restart clears the celebration and restores the initial level and health',restarted['effect'])
            assert not REPORT['errors'],REPORT['errors']
            assert not REPORT['unexpectedRequests'],REPORT['unexpectedRequests']
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
