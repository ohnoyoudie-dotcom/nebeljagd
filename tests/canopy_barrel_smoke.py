"""Real generated-game checks: quick crown fade, hiding and breakable barrels.

Uses one temporary validated map, real walking/attacks, naturally rolled weapon
tiers and passive frame sampling. No simulation clock or gameplay overrides.
"""
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5232').rstrip('/')
WEAPONS_SUCCESSOR = os.environ.get('NEBELJAGD_QA_WEAPONS_SUCCESSOR') == '1'
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', ROOT / ('test-results/canopy-barrel-weapons-successor'
    if WEAPONS_SUCCESSOR else 'test-results/canopy-barrel')))
OUT.mkdir(parents=True, exist_ok=True)
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'checks': [], 'screenshots': [], 'errors': [], 'unexpectedRequests': [],
          'mode': 'weapons-successor' if WEAPONS_SUCCESSOR else 'full',
          'limits': 'Actual Chromium/SwiftShader input/rendering, ' + ('Low weapons-only successor' if WEAPONS_SUCCESSOR
              else 'Low movement plus one paused High capture') + '; no hardware performance claim.'}


def fixture():
    result = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import {createLobbyMap} from './src/lobby-map.js';
import {vegetationSettings} from './src/map/landscape.js';
import {makeBarrier} from './src/map/barriers.js';
import {validateWorldmap} from './src/map/model.js';
const m=createLobbyMap();m.name='Schnelle Baumkrone und Fassschaden · QA';
m.objects=[];m.paths=[];m.spawnAreas=[];m.gameplay.spawnPosition=[-28,-25];
for(const [id,x] of [['qa-tree',-20],['qa-other-tree',-8]])m.objects.push({
 id,name:id,kind:'tree',variant:'kit-user-tree1',position:[x,-25],rotation:.25,scale:1});
const grass={id:'qa-grass',name:'Versteck',kind:'grass',variant:'tall',position:[-20,-25],radius:3.5,rotation:0,scale:1};
grass.vegetation={...vegetationSettings(grass),heightVariation:.3};m.objects.push(grass);
for(const [kind,variant,x] of [['sword','kit-tripo-sword',-16],['bow','kit-tripo-ornate-bow',0],['iceStaff','kit-tripo-crystal-staff',16]]){
 m.objects.push({id:`qa-${kind}`,name:kind,kind,variant,position:[x,-3],rotation:0,scale:1,rarity:'common'});
 m.objects.push({id:`qa-barrel-${kind}`,name:`Fass ${kind}`,kind:'barrel',variant:'kit-tripo-barrel',position:[x,8],rotation:0,scale:1});
}
m.objects.push({id:'qa-barrel-blocked',name:'Fass hinter Mauer',kind:'barrel',variant:'kit-tripo-barrel',position:[28,5],rotation:0,scale:1});
m.barriers=[makeBarrier('wall',[[24,0],[32,0]],{id:'qa-blocker',height:3})];
const v=validateWorldmap(m);if(!v.valid)throw Error(v.errors.join('; '));console.log(JSON.stringify(m));
'''], cwd=ROOT))
    (OUT/'fixture.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def state(page):
    return page.evaluate('nebeljagdTestState()')


def wait(page, expression, arg=None, timeout=120000):
    page.wait_for_function(expression, arg=arg, timeout=timeout)


def phase(page, target):
    if state(page)['phase'] != target:
        page.keyboard.press('Escape')
    wait(page, 'target=>nebeljagdTestState().phase===target', target, timeout=15000)


def move(page, x, z, direction=0):
    phase(page,'playing')
    page.evaluate('p=>nebeljagdInspect(p)', {'x':x,'z':z,'direction':direction})
    wait(page,'t=>nebeljagdTestState().elapsed>=t',state(page)['elapsed']+.15)


def save_capture(data, name):
    path=OUT/(name+'.png');path.write_bytes(base64.b64decode(data.split(',',1)[1]))
    REPORT['screenshots'].append(str(path))


def capture(page,name,zoom=1.5):
    phase(page,'paused');page.evaluate('zoom=>nebeljagdInspectCamera({zoom})',zoom)
    save_capture(page.evaluate('nebeljagdCaptureFrame()'),name)


def prop(page,identifier):
    return next(p for p in state(page)['world']['destructibles'] if p['id']==identifier)


def shoot(page,kind):
    phase(page,'playing')
    wait(page,'nebeljagdTestState().attackCooldown===0')
    if kind=='bow':
        aim=None
        shots_before=state(page)['combat']['shotsFired']
        page.keyboard.down('KeyF')
        try:
            wait(page,f'nebeljagdTestState().combat.shotsFired>{shots_before}',timeout=30000)
            held=state(page)['combat'];aim=held['bowAim']
            if aim:
                assert held['bowAlignment']['error']<.04,held['bowAlignment']
                aim={**aim,'alignmentError':held['bowAlignment']['error']}
        finally:
            page.keyboard.up('KeyF')
        return aim
    else:
        page.keyboard.press('KeyF')


try:
    testmap=fixture()
    with urlopen(URL+'/magebrawl.html',timeout=60) as response:
        assert response.status==200
        digest=hashlib.sha256(response.read()).hexdigest()
    assert digest==hashlib.sha256((RELEASE/'magebrawl.html').read_bytes()).hexdigest()
    release=json.loads((RELEASE/'release.json').read_text())
    REPORT.update(gameSha256=digest,buildId=release['buildId'],sourceCommit=release['sourceCommit'])
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            context=browser.new_context(viewport={'width':1100,'height':800})
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(testmap))+');')
            context.route('**/favicon.ico',lambda route:route.fulfill(status=204))
            context.on('request',lambda r:REPORT['unexpectedRequests'].append(r.url)
                if r.url.startswith(('http:','https:')) and r.resource_type!='document'
                and not urlsplit(r.url).path.endswith('/favicon.ico') else None)
            page=context.new_page();page.set_default_timeout(15000)
            page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
            page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)
            stage('load final generated game with temporary tree, weapons and barrels')
            page.goto(URL+'/magebrawl.html?mapSource=editor&inspect=1&quality=low',wait_until='domcontentloaded',timeout=120000)
            wait(page,'window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            assert state(page)['world']['source']=='editor'
            assert state(page)['world']['objects']==testmap['objects']
            page.locator('#startBtn').click()

            original={t['id']:t['appearance'] for t in state(page)['world']['trees']}
            canopy_config=state(page)['world']['stats']['canopyFade']
            assert canopy_config['enterSeconds']==.06 and canopy_config['minimumOpacity']==.045
            REPORT['canopyConfiguration']=canopy_config
            if not WEAPONS_SUCCESSOR:
                stage('uninterrupted short walk through crown and hiding grass')
                tree=next(t for t in state(page)['world']['trees'] if t['id']=='qa-tree')
                crown=tree['canopy']['footprint'];cx,cz=crown['center'];rx,rz=crown['radiusX'],crown['radiusZ']
                line_z=cz+(1 if cz>=tree['z'] else -1)*rz*.45
                move(page,cx-rx*1.5,line_z)
                wait(page,'!nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().world.trees.every(t=>t.canopy.opacity>.99)')
                page.evaluate('nebeljagdInspectCamera({zoom:1.5})')
                page.evaluate('''cx=>{window.__canopySamples=[];window.__canopyFrame=null;window.__watchCanopy=true;
                  const sample=()=>{if(!window.__watchCanopy)return;const s=nebeljagdTestState();
                    const t=s.world.trees.find(t=>t.id==='qa-tree'),o=s.world.trees.find(t=>t.id==='qa-other-tree');
                    const v={elapsed:s.elapsed,x:s.position.x,z:s.position.z,moving:s.moving,opacity:t.canopy.opacity,
                      target:t.canopy.targetOpacity,otherOpacity:o.canopy.opacity,barkOpacity:t.canopy.barkOpacity,
                      hidden:s.hiddenInGrass,appearance:structuredClone(s.character.concealmentAppearance)};
                    window.__canopySamples.push(v);
                    if(!window.__canopyFrame&&Math.abs(v.x-cx)<.45&&v.opacity<.12&&v.appearance.blend>.95)
                      window.__canopyFrame=nebeljagdCaptureFrame();
                    requestAnimationFrame(sample);};requestAnimationFrame(sample);}''',cx)
                page.keyboard.down('KeyD')
                try:
                    wait(page,'x=>nebeljagdTestState().position.x>=x',cx+rx*1.5,timeout=45000)
                finally:
                    page.keyboard.up('KeyD')
                samples=page.evaluate('()=>{window.__watchCanopy=false;return window.__canopySamples}')
                (OUT/'short-crossing-samples.json').write_text(json.dumps(samples,indent=2)+'\n')
                first_full=next(s for s in samples if s['target']<.1)
                first_clear=next(s for s in samples if s['opacity']<.12 and s['elapsed']>=first_full['elapsed'])
                assert first_clear['elapsed']-first_full['elapsed']<=.200001,(first_full,first_clear)
                assert first_clear['x']<cx,'Crown only becomes clear after reaching its center'
                assert all(s['otherOpacity']>.99 and s['barkOpacity']==1 for s in samples)
                center=min(samples,key=lambda s:abs(s['x']-cx));visual=center['appearance']
                assert center['moving'] and center['hidden'] and center['opacity']<.12
                assert visual['style']=='textured-hidden-character-v3' and visual['color']=='#e3ebe5'
                assert .395<=visual['bodyOpacity']<.415 and .285<visual['fillOpacity']<.305
                assert .53<visual['outlineOpacity']<.56 and visual['outlineWidthPixels']==1.5
                frame=page.evaluate('window.__canopyFrame');assert frame,'No actual moving midpoint capture'
                save_capture(frame,'moving-through-canopy')
                wait(page,'''()=>{const s=nebeljagdTestState();return !s.hiddenInGrass&&
                  s.character.concealmentAppearance.materialsRestored&&s.world.trees.every(t=>t.canopy.opacity>.99)}''')
                assert state(page)['world']['stats']['canopyFade']['enterSeconds']==.06
                passed('Crown clears before the moving player reaches center; near-white hiding preserves texture and restores on exit',
                    {'sampleCount':len(samples),'clearDelaySeconds':first_clear['elapsed']-first_full['elapsed'],
                     'center':center,'minimumOpacity':min(s['opacity'] for s in samples)})

                stage('one paused High-quality hiding render; return to Low before movement')
                move(page,cx,line_z)
                wait(page,'nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.blend>.99')
                phase(page,'paused');page.locator('#qualityMode').select_option('high')
                wait(page,'nebeljagdTestState().quality==="high"')
                page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                capture(page,'near-white-hiding-high')
                page.locator('#qualityMode').select_option('low')
                wait(page,'nebeljagdTestState().quality==="low"')

            stage('actual sword, bow and ice staff deplete the same barrel health')
            launches=[];damage_cases=[]
            assert all(p['maxHealth']==60 and p['health']==60 for p in state(page)['world']['destructibles'])
            for kind,x in [('sword',-16),('bow',0),('iceStaff',16)]:
                stage(f'{kind}: pickup and real attacks against standard barrel')
                move(page,x,-3)
                if state(page)['equippedWeapon']!=kind:page.keyboard.press('KeyE')
                wait(page,'kind=>nebeljagdTestState().equippedWeapon===kind',kind)
                item=state(page)['equippedItem'];damage=item['damage'];identifier='qa-barrel-'+kind
                move(page,x,6.3 if kind=='sword' else 2,direction=0)
                if kind=='sword':
                    page.evaluate('''()=>{window.__debrisFrame=null;window.__watchDebris=true;
                      const sample=()=>{if(!window.__watchDebris)return;const d=nebeljagdTestState().world.stats.debris;
                        if(d.airborne>0&&d.farthestTravel>.45){window.__debrisFrame=nebeljagdCaptureFrame();window.__watchDebris=false;}
                        else requestAnimationFrame(sample);};requestAnimationFrame(sample);}''')
                history=[60];aims=[]
                for index in range(math.ceil(60/damage)):
                    before=prop(page,identifier)['health'];combat_before=state(page)['combat']
                    aim=shoot(page,kind)
                    if kind=='bow':
                        assert aim and aim['targetId']==identifier and 0<aim['pitch']<.5,aim
                        aims.append(aim)
                    wait(page,'''p=>{const s=nebeljagdTestState(),c=s.combat,t=s.world.destructibles.find(t=>t.id===p.id);
                      return t.health<p.health||(c.shotsFired>p.shots&&c.arrowsActive===0&&c.spellsActive===0&&s.attackCooldown===0)}''',
                      {'id':identifier,'health':before,'shots':combat_before['shotsFired']},timeout=45000)
                    after=prop(page,identifier);hit=state(page)['combat']['lastDamage']
                    assert after['health']==max(0,before-damage),(kind,item,before,after,state(page)['combat'])
                    assert hit['targetId']==identifier and hit['damage']==min(damage,before),hit
                    history.append(after['health'])
                assert prop(page,identifier)['destroyed']
                launch=state(page)['world']['stats']['debris']['lastBurst'];launches.append(launch)
                assert launch['kind']=='barrel' and launch['fragments']>=8
                assert 2.4<=launch['averageHorizontalSpeed']<=4.4
                assert 2.65<=launch['averageUpwardSpeed']<=4 and 3.5<=launch['averageSpinSpeed']<=7.5
                for velocity in launch['launchSamples']:
                    assert 2.4<=math.hypot(velocity['x'],velocity['z'])<=4.4
                    assert 2.65<=velocity['y']<=4 and 3.5<=velocity['spin']<=7.5
                damage_cases.append({'weapon':kind,'rarity':item['rarity'],'damage':damage,'health':history,'launch':launch,'bowAims':aims})
                if kind=='sword':
                    wait(page,'window.__debrisFrame',timeout=30000)
                    save_capture(page.evaluate('window.__debrisFrame'),'calmer-barrel-fragments')
                if kind=='bow':
                    stage('three-meter wall still blocks the bow before a barrel')
                    wait(page,'nebeljagdTestState().attackCooldown===0&&nebeljagdTestState().combat.arrowsActive===0')
                    move(page,28,-4,direction=0);before=state(page)['combat']
                    assert shoot(page,'bow') is None,'Bow selected a barrel through a solid wall'
                    wait(page,'n=>nebeljagdTestState().combat.impacts>n',before['impacts'],timeout=45000)
                    impact=state(page)['combat']
                    assert impact['damageHits']==before['damageHits'] and prop(page,'qa-barrel-blocked')['health']==60
                    assert impact['lastImpact']['point']['z']<1,impact['lastImpact']
                    REPORT['blockedShot']=impact['lastImpact']
            assert len({json.dumps(v['launchSamples'],sort_keys=True) for v in launches})==3
            passed('Sword, bow and staff use shared60HP with real rolled damage; solid wall still blocks shots',damage_cases)
            passed('Actual barrel breaks launch calmer textured fragments with different velocities each time',launches)

            stage('restart restores barrels, canopy and character')
            phase(page,'paused');page.locator('#restartBtn').click()
            wait(page,'''()=>{const s=nebeljagdTestState();return s.phase==='playing'&&s.world.stats.debris.active===0&&
              s.world.destructibles.every(t=>!t.destroyed&&t.health===60)&&s.character.concealmentAppearance.materialsRestored}''')
            assert {t['id']:t['appearance'] for t in state(page)['world']['trees']}==original
            assert state(page)['world']['objects']==testmap['objects']
            assert not REPORT['errors'],REPORT['errors']
            assert not REPORT['unexpectedRequests'],REPORT['unexpectedRequests']
            assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()==MAP_HASH
            passed('Restart restores props and visuals without changing authored map; no shader/browser/network errors')
            REPORT.update(status='passed',mapSha256=MAP_HASH,browser=browser.version)
        except BaseException:
            if 'page' in locals() and not page.is_closed():
                try:(OUT/'failure-state.json').write_text(json.dumps(page.wait_for_function('()=>nebeljagdTestState()',timeout=5000).json_value(),indent=2))
                except Exception:pass
                try:page.screenshot(path=str(OUT/'failure.png'),timeout=5000)
                except Exception:pass
            raise
        finally:
            browser.close()
except BaseException as error:
    REPORT.update(status='failed',failure=str(error))
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
