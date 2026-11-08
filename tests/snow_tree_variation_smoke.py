"""Generated game: snow persistence/contact and stable biome tree appearance.

The temporary map lives in this test's fresh browser context. Inputs are real
keyboard events. The existing inspector only positions the player/camera; the
simulation clock, gameplay and rendered materials are never patched.
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
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', ROOT / 'test-results/snow-tree-variation'))
OUT.mkdir(parents=True, exist_ok=True)
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'checks': [], 'errors': [], 'unexpectedRequests': [],
          'screenshots': [], 'limits': 'Chromium/SwiftShader functional and visual checks, not hardware performance measurements.'}
GROUPS = [('meadow', -60, -45), ('snow', 60, -45), ('dunes', 60, 55), ('marsh', -60, 55)]


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def fixture():
    value = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()));"], cwd=ROOT))
    value['name'] = 'Schneekontakt und vier Baum-Biome · QA'
    boundary = [[-120, -120], [120, -120], [120, 120], [-120, 120]]
    value['bounds'] = {'minX': -120, 'maxX': 120, 'minZ': -120, 'maxZ': 120}
    value['island']['points'] = boundary
    # Ordinary moving practice opponents also leave snow prints; keep them away
    # from the player's route while exercising the real shared track pool.
    value['gameplay']['spawnPosition'] = [85, -50]
    value['zone']['initialRadius'] = 250
    value['zone']['phases'][0]['radius'] = 249
    for key in ['objects', 'paths', 'rivers', 'places', 'spawnAreas', 'barriers', 'bridges', 'waterAreas', 'islets']:
        value[key] = []
    value['regions'] = []
    quadrants = [(-120, 0, -120, 0), (0, 120, -120, 0), (0, 120, 0, 120), (-120, 0, 0, 120)]
    colors = ['#638b4c', '#dce7e8', '#c9ad6d', '#4f7970']
    for (biome, cx, cz), (x0, x1, z0, z1), color in zip(GROUPS, quadrants, colors):
        value['regions'].append({'id': f'qa-region-{biome}', 'name': biome, 'biome': biome,
            'color': color, 'label': [cx, cz], 'points': [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]})
        for index, dx in enumerate([-7, 0, 7]):
            value['objects'].append({'id': f'qa-{biome}-tree-{index}', 'name': f'{biome} Baum {index}',
                'kind': 'tree', 'variant': 'kit-user-tree1', 'position': [cx + dx, cz], 'rotation': .25, 'scale': 1})
    checked = subprocess.run(['node', '--input-type=module', '-e',
        "import {validateWorldmap} from './src/map/model.js';let s='';for await(const c of process.stdin)s+=c;const r=validateWorldmap(JSON.parse(s));if(!r.valid)throw new Error(r.errors.join('; '));"],
        input=json.dumps(value), text=True, cwd=ROOT)
    assert checked.returncode == 0
    (OUT / 'fixture.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return value


def state(page):
    return page.evaluate('nebeljagdTestState()')


def wait(page, expression, arg=None, timeout=180000):
    return page.wait_for_function(expression, arg=arg, timeout=timeout)


def wait_sim(page, duration):
    wait(page, 'end=>nebeljagdTestState().elapsed>=end', state(page)['elapsed'] + duration)


def resume(page):
    if state(page)['phase'] == 'paused':
        page.keyboard.press('Escape')
    wait(page, 'nebeljagdTestState().phase==="playing"', timeout=15000)


def move(page, x, z, direction=0):
    resume(page)
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z, 'direction': direction})
    wait_sim(page, .15)


def pause(page):
    if state(page)['phase'] == 'playing':
        page.keyboard.press('Escape')
    wait(page, 'nebeljagdTestState().phase==="paused"', timeout=15000)


def capture(page, name, zoom=1):
    page.evaluate('zoom=>nebeljagdInspectCamera({zoom})', zoom)
    path = OUT / f'{name}.png'
    path.write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    REPORT['screenshots'].append(str(path))
    return str(path)


def tree_appearances(page):
    return {tree['id']: tree['appearance'] for tree in state(page)['world']['trees'] if tree['id'].startswith('qa-')}


def snow_summary(value):
    return {key: item for key, item in value.items() if key != 'activeTracks'}


def walk(page, key, duration):
    resume(page)
    before = state(page)['elapsed']
    page.keyboard.down(key)
    try:
        wait(page, 'end=>nebeljagdTestState().elapsed>=end', before + duration)
    finally:
        page.keyboard.up(key)


def focus_paused(page, x, z):
    # The supported inspector sets player/camera position and resumes play.
    # Immediately pause through the real control before another simulation frame.
    page.evaluate('p=>{nebeljagdInspect(p);document.querySelector("#pauseBtn").click();}', {'x': x, 'z': z})
    wait(page, 'nebeljagdTestState().phase==="paused"', timeout=15000)
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


def observe_snow(page):
    # A passive RAF observer records the actual game's stamps. It never writes
    # gameplay state, time, input, materials or opacity.
    page.evaluate('''()=>{
      const qa=window.__snowQA={running:true,samples:0,peakCount:0,premature:[],
        fadeIncreases:[],removed:[],fadedIds:[],fadeExamples:[],history:[],births:{},last:{},lastTime:-1};
      const faded=new Set();let nextHistory=0;
      function observe(){
        if(!qa.running)return;
        const s=nebeljagdTestState(), f=s.snowFootprints;
        if(s.elapsed>qa.lastTime+.07){
          const current=Object.fromEntries(f.activeTracks.map(t=>[t.id,t]));
          for(const [id,t] of Object.entries(qa.last)){
            if(!current[id]){
              const age=s.elapsed-t.born;
              const removal={id,sourceId:t.sourceId,kind:t.kind,age,previousFade:t.fade};
              qa.removed.push(removal);
              if(age<f.lifetimeSeconds-.04)qa.premature.push(removal);
            }
          }
          for(const [id,t] of Object.entries(current)){
            if(!qa.births[id])qa.births[id]={...t,firstSeenAt:s.elapsed};
            const previous=qa.last[id];
            if(previous&&t.fade>previous.fade+.00001)qa.fadeIncreases.push({id,previous:previous.fade,current:t.fade});
            if(t.age>f.fadeStartSeconds+.3&&t.fade<qa.births[id].fade*.98){
              if(!faded.has(id)&&qa.fadeExamples.length<12)qa.fadeExamples.push({id,kind:t.kind,
                initialFade:qa.births[id].fade,age:t.age,fade:t.fade});
              faded.add(id);
            }
          }
          qa.samples++;qa.peakCount=Math.max(qa.peakCount,f.count);qa.last=current;qa.lastTime=s.elapsed;
          qa.fadedIds=[...faded];
          if(s.elapsed>=nextHistory){
            qa.history.push({elapsed:s.elapsed,count:f.count,footprints:f.activeFootprints,roll:f.activeRollSegments,
              expired:f.expiredCount,capacitySkipped:f.capacitySkipped,oldestAge:f.oldestActiveAgeSeconds});
            nextHistory=s.elapsed+1;
          }
        }
        requestAnimationFrame(observe);
      }
      requestAnimationFrame(observe);
    }''')


def document_hash():
    digest = hashlib.sha256()
    with urlopen(URL + '/magebrawl.html', timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
    assert digest.hexdigest() == hashlib.sha256((RELEASE / 'magebrawl.html').read_bytes()).hexdigest()
    REPORT['gameSha256'] = digest.hexdigest()
    release = json.loads((RELEASE / 'release.json').read_text())
    REPORT.update(buildId=release['buildId'], sourceCommit=release['sourceCommit'])


try:
    testmap = fixture()
    document_hash()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",' + json.dumps(json.dumps(testmap)) + ');')
            context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            context.on('request', lambda request: REPORT['unexpectedRequests'].append(request.url)
                if request.url.startswith(('http:', 'https:')) and request.resource_type != 'document'
                and not urlsplit(request.url).path.endswith('/favicon.ico') else None)
            page = context.new_page(); page.set_default_timeout(15000)
            page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
            page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
            stage('load generated game and inspect all four biome tree groups')
            page.goto(URL + '/magebrawl.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded', timeout=120000)
            wait(page, 'window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            initial = state(page)
            assert initial['world']['source'] == 'editor' and initial['world']['objects'] == testmap['objects']
            assert initial['world']['treeCount'] == 12
            appearances = tree_appearances(page)
            assert len(appearances) == 12
            for biome, _, _ in GROUPS:
                group = [appearance for identifier, appearance in appearances.items() if identifier.startswith(f'qa-{biome}-')]
                assert len(group) == 3 and len({a['barkColor'] for a in group}) >= 2, group
                assert len({a['signature'] for a in group}) == 3, group
                for appearance in group:
                    assert appearance['style'] == 'biome-tree-v1' and appearance['biome'] == biome, appearance
                    assert isinstance(appearance['seed'], int) and 0 <= appearance['seed'] <= 2**32 - 1
                    assert (appearance['frost'] > .6) if biome == 'snow' else appearance['frost'] == 0
                    assert any(w['biome'] == biome and w['weight'] > .99 for w in appearance['biomeWeights'])
            page.locator('#startBtn').click()
            for biome, x, z in GROUPS:
                stage(f'capture actual {biome} tree foliage and varied bark')
                move(page, x, z - 7)
                pause(page)
                capture(page, f'trees-{biome}', 1.1)
                if biome == 'snow':
                    stage('compile and capture snowy trees through the real high-quality control')
                    page.locator('#qualityMode').select_option('high')
                    wait(page, 'nebeljagdTestState().quality==="high"', timeout=15000)
                    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                    capture(page, 'trees-snow-high-quality', 1.1)
                    assert tree_appearances(page) == appearances
                    page.locator('#qualityMode').select_option('low')
                    wait(page, 'nebeljagdTestState().quality==="low"', timeout=15000)
            passed('All four biomes apply distinct foliage/frost and stable per-tree bark variation', appearances)

            stage('reload exact same temporary map and compare deterministic tree appearance')
            page.reload(wait_until='domcontentloaded', timeout=120000)
            wait(page, 'window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            assert tree_appearances(page) == appearances
            assert state(page)['world']['objects'] == testmap['objects']
            page.locator('#startBtn').click()
            passed('Reload preserves every tree appearance signature and authored placement')

            stage('snow walking and varied roll contact')
            move(page, 48, -88, math.pi / 2)
            wait(page, 'nebeljagdTestState().character.snowWeight>.99', timeout=15000)
            initial_snow = state(page)['snowFootprints']
            assert initial_snow['capacityPolicy'] == 'expire-before-admission-no-live-eviction'
            assert isinstance(initial_snow['activeTracks'], list)
            observe_snow(page)
            walk_start = state(page)['elapsed']
            for index, (key, duration) in enumerate([('KeyD', 3), ('KeyS', 1.8), ('KeyA', 3), ('KeyS', 1.8), ('KeyD', 3)]):
                walk(page, key, duration)
                if index == 0:
                    pause(page)
                    capture(page, 'long-walk-initial-trail')
            pause(page)
            walking = state(page)
            assert walking['elapsed'] - walk_start >= 12.6
            assert walking['snowFootprints']['footprintsCreated'] > initial_snow['footprintsCreated'] + 40
            assert walking['snowFootprints']['expiredCount'] > initial_snow['expiredCount']
            assert walking['snowFootprints']['capacitySkipped'] == 0
            focus_paused(page, 57, -78)
            capture(page, 'long-walk-age-fading-trail')
            passed('More than twelve seconds of real walking retain recent prints while older prints fade by age',
                {'duration': walking['elapsed'] - walk_start, 'snow': snow_summary(walking['snowFootprints'])})

            stage('four real rolls with delayed contact and separate irregular patches')
            rolls = []
            for index, key in enumerate(['KeyD', 'KeyW', 'KeyA', 'KeyS']):
                resume(page)
                wait(page, 'nebeljagdTestState().rollCooldown===0')
                page.keyboard.down(key)
                wait_sim(page, .12)
                before = state(page)
                old_ids = {track['id'] for track in before['snowFootprints']['activeTracks']}
                page.keyboard.press('Space')
                wait(page, 'n=>nebeljagdTestState().snowFootprints.rollSegmentsCreated>n&&nebeljagdTestState().rollRemaining===0',
                    before['snowFootprints']['rollSegmentsCreated'])
                page.keyboard.up(key)
                pause(page)
                after = state(page)
                contacts = [t for t in after['snowFootprints']['activeTracks']
                    if t['kind'] == 'roll' and t['sourceId'] == 'player' and t['id'] not in old_ids]
                assert len(contacts) >= 4, contacts
                delay = min(t['born'] for t in contacts) - before['elapsed']
                assert delay >= .12, delay
                patches = sorted({(t['contactStart'], t['contactEnd']) for t in contacts})
                assert len(patches) >= 2 and patches[0][0] >= .85, patches
                gaps = [b[0] - a[1] for a, b in zip(patches, patches[1:])]
                assert any(gap >= .10 for gap in gaps), gaps
                assert after['snowFootprints']['rollTrackWidthMeters'] == 1
                rolls.append({'delay': delay, 'patches': patches, 'gaps': gaps, 'contactCount': len(contacts),
                    'firstContact': min(contacts, key=lambda track: track['born'])})
                if index == 0:
                    capture(page, 'roll-delayed-rounded-contact-patches', 1.6)
                    frozen = after['snowFootprints']
                    page.wait_for_timeout(150)
                    assert state(page)['snowFootprints'] == frozen
                resume(page)
                page.keyboard.down(key)
                wait(page, 'nebeljagdTestState().rollCooldown===0')
                page.keyboard.up(key)
            pause(page)
            mixed = state(page)['snowFootprints']
            focus_paused(page, 65, -86)
            capture(page, 'mixed-walking-rolling-trails')
            assert mixed['capacitySkipped'] == 0
            assert mixed['activeFootprints'] > 0 and mixed['activeRollSegments'] > 0
            assert mixed['singleInstancedDraw']
            passed('Real rolls delay ground contact, form rounded separated patches, and coexist with walking tracks',
                {'rolls': rolls, 'mixedPool': snow_summary(mixed)})

            stage('observe natural fading and expiry without changing the simulation clock')
            resume(page)
            wait_sim(page, 7)
            pause(page)
            fading = state(page)['snowFootprints']
            player_fading = [t for t in fading['activeTracks'] if t['sourceId'] == 'player']
            assert player_fading and all(t['age'] > fading['fadeStartSeconds'] for t in player_fading)
            capture(page, 'snow-trails-near-natural-expiry')
            resume(page)
            wait(page, 'nebeljagdTestState().snowFootprints.activeTracks.every(t=>t.sourceId!=="player")')
            pause(page)
            observed = page.evaluate('()=>{window.__snowQA.running=false;return window.__snowQA;}')
            assert observed['samples'] > 50 and observed['peakCount'] > 96, observed['peakCount']
            assert not observed['premature'], observed['premature']
            assert not observed['fadeIncreases'], observed['fadeIncreases']
            assert len(observed['fadedIds']) > 20 and len(observed['removed']) > 40
            assert state(page)['snowFootprints']['capacitySkipped'] == 0
            observation_summary = {'samples': observed['samples'], 'peakCount': observed['peakCount'],
                'prematureRemovals': observed['premature'], 'fadeIncreases': observed['fadeIncreases'],
                'fadedTracks': len(observed['fadedIds']), 'removals': len(observed['removed']),
                'minimumRemovalAge': min(t['age'] for t in observed['removed']),
                'maximumRemovalAge': max(t['age'] for t in observed['removed']),
                'fadeExamples': observed['fadeExamples'], 'history': observed['history']}
            (OUT / 'snow-lifetime-observer.json').write_text(json.dumps(observation_summary, indent=2) + '\n')
            passed('Every observed disappearing stamp reached its lifetime; mixed load exceeds the old 96-slot limit with no eviction',
                {key: value for key, value in observation_summary.items() if key not in ['history', 'fadeExamples']})

            stage('restart clears tracks and preserves deterministic trees')
            pause(page); page.locator('#restartBtn').click()
            wait(page, 'nebeljagdTestState().phase==="playing"', timeout=15000)
            assert state(page)['snowFootprints']['count'] == 0
            assert tree_appearances(page) == appearances
            assert state(page)['world']['objects'] == testmap['objects']
            assert not REPORT['errors'], REPORT['errors']
            assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
            assert hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
            passed('Restart clears tracks, preserves tree styles and leaves the authored map untouched; no browser/shader/network errors')
            REPORT.update(status='passed', mapSha256=MAP_HASH, browser=browser.version)
        except BaseException:
            if 'page' in locals() and not page.is_closed():
                try:
                    page.screenshot(path=str(OUT / 'failure.png'))
                    (OUT / 'failure-state.json').write_text(json.dumps(state(page), indent=2))
                except Exception:
                    pass
            raise
        finally:
            browser.close()
except BaseException as error:
    REPORT.update(status='failed', failure=str(error))
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
