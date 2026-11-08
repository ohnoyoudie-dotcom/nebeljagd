"""Four biomes and a real sea gap: final editor and gameplay browser QA.

NEBELJAGD_URL=http://127.0.0.1:5208 python tests/open_gap_smoke.py
No authoritative state is modified. Fixture starts use normal map JSON imports,
travel uses WASD, and the existing telemetry hook is read only.
"""
from __future__ import annotations
import copy, hashlib, json, math, os
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5208').rstrip('/')
STANDALONE=os.environ.get('NEBELJAGD_STANDALONE','1')=='1'
OUT=ROOT/'test-results/open-gap';OUT.mkdir(parents=True,exist_ok=True)
SOURCE=json.loads((ROOT/'worldmap.json').read_text())
SOURCE_HASH=hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
REPORT={'status':'running','url':URL,'standalone':STANDALONE,'sourceSha256':SOURCE_HASH,
        'checks':[],'errors':[],'screenshots':[],
        'limits':'Chromium software WebGL. One ordinary full traversal per bridge supplies both landing images; no device-performance claim.'}
if STANDALONE:
    REPORT['delivery']={'files':{},'unexpectedRequests':[]}
    for name in ['map-editor.html','magebrawl.html','worldmap.json']:
        data=(ROOT/'welt'/name).read_bytes()
        REPORT['delivery']['files'][name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}

def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)

def editor_state(page): return page.evaluate('nebeljagdMapTestState()')

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

def action(page, group, tool=None):
    page.locator('#editor-tab-' + group).click()
    if tool: page.locator(f'#editor-tool-{group}-{tool}').click()

def open_control(page, identifier):
    item = page.locator('#' + identifier)
    pane = item.locator('xpath=ancestor::section[contains(@class,"editor-pane")]')
    if pane.count():
        group = pane.get_attribute('id').removeprefix('editor-pane-')
        panel = item.locator('xpath=ancestor::*[@data-editor-tool-panel]')
        action(page, group, panel.first.get_attribute('data-editor-tool-panel') if panel.count() else None)
    for details in item.locator('xpath=ancestor::details').all():
        if details.get_attribute('open') is None: details.locator(':scope > summary').click()
    item.scroll_into_view_if_needed()
    return item

def import_editor(page, value):
    page.locator('#json-file-input').set_input_files({'name': 'two-access.json', 'mimeType': 'application/json',
                                                   'buffer': json.dumps(value).encode()})
    page.wait_for_function('v=>JSON.stringify(nebeljagdMapTestState().map)===JSON.stringify(v)', arg=value)

def tap(page, point):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    target = page.evaluate('p=>{const s=document.querySelector("#map-stage>svg");const q=new DOMPoint(...p).matrixTransform(s.getScreenCTM());return{x:q.x,y:q.y};}', point)
    page.mouse.click(target['x'], target['y'])

def capture(page, name):
    previous_size = page.viewport_size
    if previous_size != {'width': 1280, 'height': 800}:
        page.set_viewport_size({'width': 1280, 'height': 800})
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    path = OUT / (name + '.png'); page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))
    if page.viewport_size != previous_size: page.set_viewport_size(previous_size)

def trace_walk(page, keys, seconds, roll=False):
    """Record render-frame observations while only ordinary keyboard input moves the player."""
    try:
        for key in keys: page.keyboard.down(key)
        if roll: page.keyboard.press('Space')
        trace = page.evaluate("""async duration => {
          const samples=[]; const start=nebeljagdTestState().elapsed;
          do {
            const s=nebeljagdTestState();
            if(s.phase!=='playing') throw new Error('Travel stopped in phase '+s.phase);
            samples.push({elapsed:s.elapsed,position:s.position,isWater:s.world.isWater,
                          groundHeight:s.world.groundHeight,biome:s.world.biome,rollRemaining:s.rollRemaining});
            if(s.elapsed>=start+duration) break;
            await new Promise(requestAnimationFrame);
          } while(true);
          return samples;
        }""", seconds)
    finally:
        for key in keys: page.keyboard.up(key)
    assert len(trace) > 5, trace
    invalid=next((sample for sample in trace if sample['isWater'] or not math.isfinite(sample['position']['y'])),None)
    assert invalid is None,invalid
    steps = [(math.hypot(b['position']['x']-a['position']['x'], b['position']['z']-a['position']['z']),
              abs(b['position']['y']-a['position']['y'])) for a,b in zip(trace,trace[1:])]
    speed=8.8 if roll else SOURCE['gameplay']['walkSpeedMetersPerSecond']
    assert all(step[0] <= speed*(b['elapsed']-a['elapsed'])+.08 for step,a,b in zip(steps,trace,trace[1:])),trace
    if roll: assert any(sample['rollRemaining']>0 for sample in trace),trace
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

def inside(point, ring):
    x,z=point; result=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>z)!=(b[1]>z) and x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:
            result=not result
    return result


def is_land(point):
    return any(inside(point,land['points']) for land in [SOURCE['island'],*SOURCE.get('islets',[])])


def bridge_midpoint(bridge):
    return [(bridge['points'][0][i]+bridge['points'][-1][i])/2 for i in [0,1]]


def minimap_bridge_pixels(page, bridge):
    # Inspect the other bridge so the player marker cannot cover its midpoint.
    point=bridge_midpoint(bridge)
    result=page.evaluate("""point=>{
      const state=nebeljagdTestState().minimap,canvas=document.querySelector('#minimap');
      const scale=(256-24)/state.spanMeters*canvas.width/256;
      const x=Math.floor(canvas.width/2+(point[0]-state.center.x)*scale);
      const y=Math.floor(canvas.height/2+(point[1]-state.center.z)*scale);
      const data=canvas.getContext('2d').getImageData(x-2,y-2,5,5).data;
      const colors=[];for(let i=0;i<data.length;i+=4)colors.push([...data.slice(i,i+4)]);
      return {mode:state.mode,point,pixel:[x,y],colors};
    }""",point)
    assert result['mode']=='island'
    r,g,b,a=result['colors'][12]
    assert r>170 and g>140 and b<210 and r>b+25,result
    return result


try:
    assert len(SOURCE['regions'])==4
    assert {region['biome'] for region in SOURCE['regions']}=={'snow','forest','dunes','marsh'}
    assert SOURCE['rivers']==[] and SOURCE['waterAreas']==[]
    assert len(SOURCE['islets'])==1
    assert len(SOURCE['paths'])==2 and all(path['kind']=='bridge' for path in SOURCE['paths'])
    assert all(not is_land(bridge_midpoint(path)) for path in SOURCE['paths'])
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1280,'height':800},accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        if STANDALONE:
            def resource(request):
                parsed=urlsplit(request.url)
                if parsed.scheme not in ['http','https']:return
                if parsed.netloc==urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path=='/favicon.ico'):return
                REPORT['delivery']['unexpectedRequests'].append(request.url)
            context.on('request',resource)
        editor=context.new_page();monitor(editor)
        editor.goto(URL+'/map-editor.html',wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        assert editor_state(editor)['map']==SOURCE
        assert editor.locator('#map-stage [data-feature-type="region"]').count()==4
        assert editor.locator('#map-stage [data-feature-type="river"],#map-stage [data-feature-type="waterArea"]').count()==0
        islet=SOURCE['islets'][0]
        expect(editor.locator(f'#map-stage [data-feature-type="islet"][data-feature-id="{islet["id"]}"]')).to_be_visible()
        bridges=[]
        for bridge in SOURCE['paths']:
            observation=editor.evaluate("""bridge=>{
              const element=document.querySelector('[data-feature-type="path"][data-feature-id="'+bridge.id+'"]');
              const svg=document.querySelector('#map-stage>svg');
              const p=bridge.points[0].map((v,i)=>(v+bridge.points.at(-1)[i])/2);
              const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());
              const hit=document.elementFromPoint(q.x,q.y)?.closest('[data-feature-type="path"]');
              return {id:bridge.id,clipped:!!element.closest('[clip-path]'),hit:hit?.dataset.featureId??null};
            }""",bridge)
            assert not observation['clipped'] and observation['hit']==bridge['id'],observation
            bridges.append(observation)
        capture(editor,'editor')
        passed('The exact source has four biomes and two separated landmasses; both bridges remain visible across the true empty gap without river or water-area features',
               {'regions':SOURCE['regions'],'islet':islet['id'],'bridges':bridges})

        action(editor,'more','shape')
        editor.locator('#feature-filter').select_option('islet')
        editor.locator(f'#feature-list .feature-row[data-id="{islet["id"]}"]').click()
        assert editor_state(editor)['selection']['type']=='islet'
        editor.locator('#add-vertex').click()
        edited=editor_state(editor)['map']
        assert len(edited['islets'][0]['points'])==len(islet['points'])+1
        editor.locator('#undo').click();assert editor_state(editor)['map']==SOURCE
        editor.locator('#redo').click();assert editor_state(editor)['map']==edited
        editor.locator('#undo').click();assert editor_state(editor)['map']==SOURCE
        editor.locator('#add-islet').click()
        added=editor_state(editor)['map']
        assert len(added['islets'])==2
        editor.locator('#delete-feature').click();assert editor_state(editor)['map']==SOURCE
        editor.locator('#undo').click();assert editor_state(editor)['map']==added
        editor.locator('#redo').click();assert editor_state(editor)['map']==SOURCE
        passed('The eastern islet is selectable and editable; adding/removing separate land and vertex edits have complete Undo/Redo')

        assert is_land([360,120]) and not is_land([220,0])
        action(editor,'objects','place')
        editor.locator('#palette-kind').select_option('chest');editor.locator('#place-object').click()
        tap(editor,[360,120]);assert len(editor_state(editor)['map']['objects'])==len(SOURCE['objects'])+1
        editor.locator('#undo').click();assert editor_state(editor)['map']==SOURCE
        assert editor_state(editor)['mode']=='place'
        tap(editor,[220,0]);assert editor_state(editor)['map']==SOURCE
        action(editor,'paint','vegetation');editor.locator('#grass-brush').click()
        tap(editor,[220,0]);assert editor_state(editor)['map']==SOURCE
        passed('Objects can be placed on the new eastern land while objects and grass cannot be placed in the empty sea gap')

        editor.locator('#tool-select').click()
        with editor.expect_download() as download:editor.locator('#export-json').click()
        saved=OUT/'worldmap-roundtrip.json';download.value.save_as(saved)
        assert json.loads(saved.read_text())==SOURCE
        legacy=json.loads((ROOT/'tests/fixtures/reference-channel-worldmap.json').read_text())
        import_editor(editor,legacy);import_editor(editor,SOURCE)
        passed('JSON save/open preserves the new map exactly and a valid earlier channel map without islets still imports',
               {'legacyFixture':'tests/fixtures/reference-channel-worldmap.json','legacyName':legacy['name']})

        if STANDALONE:
            with editor.expect_download() as download:open_control(editor,'export-editor').click()
            saved_html=OUT/'editor-roundtrip.html';download.value.save_as(saved_html)
            reopened=context.new_page();monitor(reopened)
            reopened.route(URL+'/qa-open-gap.html',lambda route:route.fulfill(path=str(saved_html),content_type='text/html'))
            reopened.goto(URL+'/qa-open-gap.html',wait_until='domcontentloaded')
            reopened.wait_for_function('window.nebeljagdMapTestState')
            assert editor_state(reopened)['map']==SOURCE
            action(reopened,'more','shape')
            assert reopened.locator('#add-islet').count()==1
            reopened.locator('#feature-filter').select_option('islet')
            expect(reopened.locator(f'#feature-list .feature-row[data-id="{islet["id"]}"]')).to_be_visible()
            reopened.close()
            passed('Exported standalone HTML reopens the exact map and retains the islet editing controls')

        game=context.new_page();monitor(game);game.set_viewport_size({'width':960,'height':600})
        game.goto(URL+('/magebrawl.html' if STANDALONE else '/game.html')+'?quality=low',wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState&&nebeljagdTestState().rendering.calls>0')
        assert game_state(game)['world']['mapName']==SOURCE['name']
        for label,identifier,point,keys,entry_seconds,middle_seconds,exit_seconds,expected_biome in [
            ('south','suedbruecke',[220,315],['w','d'],2.2,3.8,6.0,'dunes'),
            ('north','nordbruecke',[158,-327],['s','d'],2.0,4.8,6.3,'forest'),
        ]:
            bridge=next(path for path in SOURCE['paths'] if path['id']==identifier)
            other=next(path for path in SOURCE['paths'] if path['id']!=identifier)
            load_game_start(game,point,'open-gap-'+label)
            assert inside(point,SOURCE['island']['points'])
            entry=trace_walk(game,keys,entry_seconds)
            game.locator('#mapMode-island').click()
            game.wait_for_function("nebeljagdTestState().minimap.mode==='island'")
            capture(game,label+'-west-landing')
            middle=trace_walk(game,keys,middle_seconds-.8)
            rolling=trace_walk(game,keys,.8,roll=True)
            assert any(sample['rollRemaining']>0 and not is_land([sample['position']['x'],sample['position']['z']]) for sample in rolling),rolling
            middle+=rolling
            midpoint=middle[-1]
            assert not is_land([midpoint['position']['x'],midpoint['position']['z']]),midpoint
            assert midpoint['groundHeight']<-.9 and midpoint['position']['y']>-.9,midpoint
            pixels=minimap_bridge_pixels(game,other)
            capture(game,label+'-sea-span')
            if label=='north':
                side=trace_walk(game,['w','d'],1.5)
                continued=trace_walk(game,['w','d'],.5)
                a,b=side[-1]['position'],continued[-1]['position']
                assert math.hypot(a['x']-b['x'],a['z']-b['z'])<.3,(a,b)
                displacement=math.hypot(a['x']-side[0]['position']['x'],a['z']-side[0]['position']['z'])
                assert 2<displacement<6.5,displacement
                assert not is_land([b['x'],b['z']]),b
                capture(game,'north-water-edge')
                passed('Normal sideways walking over the empty sea stops at the northern bridge rail without snapping to either shore',
                       {'approach':side,'continued':continued})
                trace_walk(game,['s','a'],.8)
            exit_trace=trace_walk(game,keys,exit_seconds)
            end=exit_trace[-1]['position']
            assert inside([end['x'],end['z']],islet['points']),end
            assert math.hypot(end['x']-point[0],end['z']-point[1])>55
            assert entry[0]['biome']==expected_biome and exit_trace[-1]['biome']=='dunes'
            capture(game,label+'-east-landing')
            passed(label+' bridge is crossed from main land over actual sea to the eastern islet using ordinary WASD and a roll over the gap; both landings remain continuous and the other bridge is visible on the minimap',
                   {'bridge':identifier,'entry':entry,'seaSpan':middle,'exit':exit_trace,'minimapBridgePixels':pixels})
        assert not REPORT['errors'],REPORT['errors']
        if STANDALONE:assert not REPORT['delivery']['unexpectedRequests'],REPORT['delivery']
        browser.close()
    assert SOURCE_HASH==hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest()
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error)
    try:(game if 'game' in globals() else editor).screenshot(path=str(OUT/'failure.png'))
    except Exception:pass
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors']}),flush=True)
