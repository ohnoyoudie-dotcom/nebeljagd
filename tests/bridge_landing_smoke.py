"""Focused standalone recheck after the bridge landing terrain correction.

Reuses editor evidence only for identical editor/map hashes; otherwise runs
NEBELJAGD_EDITOR_ONLY=1 first. New runtime evidence covers normal and lateral
landing transitions and the northern water-facing bridge edge, not full routes.
"""
from __future__ import annotations
import copy, hashlib, json, math, os, subprocess, sys
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5208').rstrip('/')
STANDALONE = True
OUT = ROOT / 'test-results/bridge-landings'; OUT.mkdir(parents=True,exist_ok=True)
SOURCE = json.loads((ROOT/'worldmap.json').read_text())
SOURCE_HASH = hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
BASELINE_BYTES = (ROOT/'docs/reference-layout-check.json').read_bytes()
BASELINE = json.loads(BASELINE_BYTES)
assert BASELINE['status']=='passed' and BASELINE['sourceSha256']==SOURCE_HASH
FILES = {name:{'bytes':(ROOT/'welt'/name).stat().st_size,'sha256':hashlib.sha256((ROOT/'welt'/name).read_bytes()).hexdigest()}
         for name in ['map-editor.html','magebrawl.html','worldmap.json']}
assert FILES['worldmap.json']==BASELINE['delivery']['files']['worldmap.json']
editor_same = FILES['map-editor.html']==BASELINE['delivery']['files']['map-editor.html']
if editor_same:
    editor_report = BASELINE
else:
    env=dict(os.environ,NEBELJAGD_URL=URL,NEBELJAGD_STANDALONE='1',NEBELJAGD_EDITOR_ONLY='1')
    subprocess.run([sys.executable,str(ROOT/'tests/two_access_smoke.py')],cwd=ROOT,env=env,check=True)
    editor_report=json.loads((ROOT/'test-results/reference-layout/report.json').read_text())
    assert editor_report['status']=='passed' and editor_report['editorOnly']
    assert editor_report['delivery']['files']==FILES
editor_checks=editor_report.get('editorVerification',{}).get('checks',editor_report['checks'][:6])
assert len(editor_checks)==6
REPORT={'status':'running','url':URL,'standalone':True,'sourceSha256':SOURCE_HASH,
        'scope':'Targeted post-correction checks of both eastern bridge landings and the northern water-facing edge; full bridge traversals are prior-build evidence only.',
        'editorVerification':{'mode':'reused_identical_html' if editor_same else 'repeated_editor_only',
                              'htmlSha256':FILES['map-editor.html']['sha256'],'checks':editor_checks},
        'previousFullTraversal':BASELINE.get('previousFullTraversal',{'reportSha256':hashlib.sha256(BASELINE_BYTES).hexdigest(),
                                 'gameHtmlSha256':BASELINE['delivery']['files']['magebrawl.html']['sha256'],
                                 'note':'Earlier full crossings established the fixture routes; they were not repeated on this corrected build.'}),
        'delivery':{'files':FILES,'unexpectedRequests':[]},'checks':[],'errors':[],'screenshots':[],
        'limits':'Chromium software WebGL. Player state is read only; fixture starts use ordinary JSON imports and movement uses WASD. No device-performance claim.'}

def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)

def game_state(page):
    return page.evaluate('''() => {const s=nebeljagdTestState();return {
      phase:s.phase,elapsed:s.elapsed,position:s.position,direction:s.direction,
      rollCooldown:s.rollCooldown,rollRemaining:s.rollRemaining,minimap:s.minimap,
      rendering:s.rendering,world:{mapName:s.world.mapName,source:s.world.source,
        groundHeight:s.world.groundHeight,isWater:s.world.isWater,stats:s.world.stats,
        objects:s.world.objects}};}''')

def monitor(page):
    page.set_default_timeout(120000)
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)

def capture(page, name):
    previous_size = page.viewport_size
    if previous_size != {'width': 1280, 'height': 800}:
        page.set_viewport_size({'width': 1280, 'height': 800})
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    path = OUT / (name + '.png'); page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))
    if page.viewport_size != previous_size: page.set_viewport_size(previous_size)

def trace_walk(page, keys, seconds):
    """Record render-frame observations while only ordinary keyboard input moves the player."""
    try:
        for key in keys: page.keyboard.down(key)
        trace = page.evaluate("""async duration => {
          const samples=[]; const start=nebeljagdTestState().elapsed;
          do {
            const s=nebeljagdTestState();
            if(s.phase!=='playing') throw new Error('Travel stopped in phase '+s.phase);
            samples.push({elapsed:s.elapsed,position:s.position,isWater:s.world.isWater,
                          groundHeight:s.world.groundHeight,biome:s.world.biome});
            if(s.elapsed>=start+duration) break;
            await new Promise(requestAnimationFrame);
          } while(true);
          return samples;
        }""", seconds)
    finally:
        for key in keys: page.keyboard.up(key)
    assert len(trace) > 5, trace
    assert all(not sample['isWater'] and math.isfinite(sample['position']['y']) for sample in trace)
    steps = [(math.hypot(b['position']['x']-a['position']['x'], b['position']['z']-a['position']['z']),
              abs(b['position']['y']-a['position']['y'])) for a,b in zip(trace,trace[1:])]
    assert max(step[0] for step in steps) < .75, 'no teleport across the channel: ' + str(max(steps))
    steepest = max(zip(trace,trace[1:]), key=lambda pair:abs(pair[1]['position']['y']-pair[0]['position']['y']))
    assert max(step[1] for step in steps) < .6, 'no vertical step at the deck: ' + json.dumps(steepest)
    return trace

def load_game_start(page, point, label):
    value = copy.deepcopy(SOURCE)
    value['name'] = 'Zwei Brücken · ' + label
    value['gameplay']['spawnPosition'] = point
    with page.expect_navigation(wait_until='domcontentloaded'):
        page.locator('#worldMapFile').set_input_files({'name': 'two-access-' + label + '.json',
            'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
    expect(page.locator('#errorScreen')).to_be_hidden()
    expect(page.locator('#startBtn')).to_be_enabled()
    state = game_state(page)
    assert state['world']['mapName'] == value['name'] and state['world']['source'] == 'import', state
    page.locator('#startBtn').click()
    page.wait_for_function("nebeljagdTestState().phase==='playing'")
    state = game_state(page)
    assert math.hypot(state['position']['x']-point[0], state['position']['z']-point[1]) < .5, state
    return state

def on_deck(point, bridge):
    a,b=bridge['points'][0],bridge['points'][-1]
    dx,dz=b[0]-a[0],b[1]-a[1]
    t=((point['x']-a[0])*dx+(point['z']-a[1])*dz)/(dx*dx+dz*dz)
    lateral=abs(dx*(point['z']-a[1])-dz*(point['x']-a[0]))/math.hypot(dx,dz)
    return t,lateral

try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':960,'height':600})
        def resource(request):
            parsed=urlsplit(request.url)
            if parsed.scheme not in ['http','https']:return
            if parsed.netloc==urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path=='/favicon.ico'):return
            REPORT['delivery']['unexpectedRequests'].append(request.url)
        context.on('request',resource)
        game=context.new_page();monitor(game)
        game.goto(URL+'/magebrawl.html?quality=low',wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        for label,identifier,point,entry_keys,entry_time,side_keys,side_time,exit_keys,exit_time in [
            ('north','nordbruecke',[213,-272],['w','a'],2.0,['w','d'],.7,['s','d'],2.0),
            ('south','suedbruecke',[267,268],['s','a'],1.6,['w','a'],1.0,['w','d'],2.0),
        ]:
            load_game_start(game,point,label+'-landing')
            bridge=next(path for path in SOURCE['paths'] if path['id']==identifier)
            entry=trace_walk(game,entry_keys,entry_time)
            t,lateral=on_deck(entry[-1]['position'],bridge)
            assert .75<t<1 and lateral<bridge['width']/2, (t,lateral)
            game.locator('#mapMode-island').click()
            game.wait_for_function("nebeljagdTestState().minimap.mode==='island'")
            capture(game,label+'-landing-on-deck')
            side=trace_walk(game,side_keys,side_time)
            t,lateral=on_deck(side[-1]['position'],bridge)
            assert .75<t<1 and 2.5<lateral<bridge['width']/2, (t,lateral)
            exit_trace=trace_walk(game,exit_keys,exit_time)
            t,_=on_deck(exit_trace[-1]['position'],bridge)
            assert t>1, t
            capture(game,label+'-exit')
            passed(label+' landing supports ordinary entry and off-center exit without water entry, teleport or abrupt height steps',
                   {'bridge':identifier,'entry':entry,'lateral':side,'exit':exit_trace})
        load_game_start(game,[196,-289],'north-water-edge')
        approach=trace_walk(game,['w','a'],2.7)
        t,lateral=on_deck(approach[-1]['position'],SOURCE['paths'][0])
        assert .45<t<.55 and lateral<.5, (t,lateral)
        side=trace_walk(game,['w','d'],1.5)
        continued=trace_walk(game,['w','d'],.5)
        a,b=side[-1]['position'],continued[-1]['position']
        assert math.hypot(a['x']-b['x'],a['z']-b['z'])<.3,(a,b)
        assert math.hypot(a['x']-side[0]['position']['x'],a['z']-side[0]['position']['z'])>2
        game.locator('#mapMode-island').click()
        game.wait_for_function("nebeljagdTestState().minimap.mode==='island'")
        capture(game,'north-water-edge')
        passed('The corrected runtime still blocks walking off the northern bridge into the channel',
               {'approach':approach,'side':side,'continued':continued})
        assert not REPORT['errors'],REPORT['errors']
        assert not REPORT['delivery']['unexpectedRequests'],REPORT['delivery']
        browser.close()
    assert SOURCE_HASH==hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error)
    try:game.screenshot(path=str(OUT/'failure.png'))
    except Exception:pass
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'newRuntimeChecks':len(REPORT['checks']),'editorChecks':len(editor_checks),'editorMode':REPORT['editorVerification']['mode'],'errors':REPORT['errors']}),flush=True)
