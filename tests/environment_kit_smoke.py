"""Import and exercise the GLB environment-kit variants and the uploaded tavern.

NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/environment_kit_smoke.py
Uses real editor JSON import/export and game movement/roll/attack. Inspection
only relocates the avatar for reproducible collision checks; no map/runtime
collision or inventory state is changed through the inspection hook.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
DEFINITIONS=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {ENVIRONMENT_KIT_DEFINITIONS} from './src/map/environment-kit-definitions.js';console.log(JSON.stringify(ENVIRONMENT_KIT_DEFINITIONS));"],cwd=ROOT))
BY_ID={item['id']:item for item in DEFINITIONS}
FIXTURE=json.loads((ROOT/'worldmap.json').read_text())
FIXTURE['gameplay']['spawnPosition']=[30,-42]
FIXTURE['objects']=[]
PLACEMENTS={
 'tree:kit-pine-high':([-85,30],.1,1),
 'tree:kit-pine-young':([-75,30],.2,1),
 'tree:kit-oak-green':([-65,30],.3,1),
 'tree:kit-oak-autumn':([-55,30],.4,1),
 'wall:kit-stone':([-82,44],math.pi/4,1.25),
 'fence:kit-wood':([-70,44],-math.pi/4,1.4),
 'ruin:kit-arch':([-58,44],0,1.2),
 'rock:kit-cluster':([-46,32],.3,1),
 'rock:kit-single':([-46,42],.7,1),
 'grass:kit-tall':([-82,57],.2,1.2),
 'house:kit-timber':([-66,62],.2,1.5),
 'house:kit-taverne':([180,150],0,1),
 'crate:kit-wood':([-50,57],math.pi/2,1.6),
}
for definition in DEFINITIONS:
    point,rotation,scale=PLACEMENTS[definition['id']]
    obj={'id':'qa-'+definition['variant']+'-'+definition['kind'],'name':definition['label'],
         'kind':definition['kind'],'variant':definition['variant'],'position':point,'rotation':rotation,'scale':scale}
    if obj['kind']=='grass':obj['radius']=2
    FIXTURE['objects'].append(obj)
FIXTURE['objects'].append({'id':'qa-bow','name':'QA Holzbogen','kind':'bow','variant':'wood','rarity':'common','position':[-64,50],'rotation':0,'scale':1})
REPORT={'status':'running','url':URL,'checks':[],'errors':[],'screenshots':[],
        'note':'Actual Chromium WebGL2 and keyboard input; fixture contains every existing kit variant, not new source assets.'}


def passed(name,evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence});print('PASS',name,flush=True)


def monitor(page):
    page.route_web_socket('**',lambda ws:None)
    page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
    page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)


def map_state(page):return page.evaluate('nebeljagdMapTestState()')

def state(page):
    return page.evaluate('''()=>{const s=nebeljagdTestState();return{position:s.position,elapsed:s.elapsed,
      equippedWeapon:s.equippedWeapon,combat:s.combat,hiddenInGrass:s.hiddenInGrass,shelter:s.shelter,
      world:{source:s.world.source,objects:s.world.objects,stats:s.world.stats,importedAssets:s.world.importedAssets,
        grassPatches:s.world.grassPatches,projectileObstacles:s.world.projectileObstacles},houses:s.houses};}''')


def wait_sim(page,seconds):
    start=page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>=t',arg=start+seconds)


def inspect(page,point,direction=0):
    page.evaluate('p=>nebeljagdInspect(p)',{'x':point[0],'z':point[1],'direction':direction,'health':100})
    wait_sim(page,.12)


def walk(page,keys,seconds,roll=False):
    try:
        for key in keys:page.keyboard.down(key)
        if roll:page.keyboard.press('Space')
        wait_sim(page,seconds)
    finally:
        for key in keys:page.keyboard.up(key)
    wait_sim(page,.1)


def object_for(kind,variant):return next(o for o in FIXTURE['objects'] if o['kind']==kind and o['variant']==variant)


def world_point(obj,x,z):
    c,s=math.cos(obj['rotation']),math.sin(obj['rotation']);k=obj['scale']
    return [obj['position'][0]+k*(c*x+s*z),obj['position'][1]+k*(-s*x+c*z)]


def local_point(obj,position):
    dx,dz=position['x']-obj['position'][0],position['z']-obj['position'][1]
    c,s=math.cos(obj['rotation']),math.sin(obj['rotation']);k=obj['scale']
    return [(c*dx-s*dz)/k,(s*dx+c*dz)/k]


def capture(page,name):
    path=ROOT/f'docs/screenshots/environment-kit-{name}.png';page.screenshot(path=str(path));REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def check_offline_kit(browser):
    """Exercise standalone bytes without network; managed Chromium blocks file://."""
    context=browser.new_context(offline=True,viewport={'width':1280,'height':850})
    page=context.new_page();page.set_default_timeout(120000);monitor(page)
    requests=[]
    source=ROOT/'dist/nebeljagd.html'
    origin='http://127.0.0.1:4174'
    document_requests=[]
    def serve_document(route):
        request=route.request
        if request.is_navigation_request() and request.url.startswith(origin+'/nebeljagd.html'):
            document_requests.append(request.url)
            route.fulfill(status=200,content_type='text/html',body=source.read_bytes())
        else:
            requests.append(request.url);route.abort()
    page.route('**/*',serve_document)
    page.goto(origin+'/nebeljagd.html?inspect=1&quality=low',wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
    with page.expect_navigation(wait_until='domcontentloaded'):
        page.locator('#worldMapFile').set_input_files({'name':'offline-kit.json',
            'mimeType':'application/json','buffer':json.dumps(FIXTURE).encode()})
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().world.source==="import" && nebeljagdTestState().rendering.calls>0')
    current=state(page)
    assert current['world']['objects']==FIXTURE['objects']
    assert current['world']['stats']['loadedGLBs']==18
    assert current['world']['stats']['environmentKit']['loadedModels']==13
    assert not requests,requests
    evidence={'source':'standalone HTML served only by an in-memory route in an offline browser context',
              'limitation':'Managed Chromium blocks file:// navigation; no actual file:// opening is claimed.',
              'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'models':current['world']['stats']['environmentKit']['loadedModels'],
              'inMemoryDocumentNavigations':len(document_requests),'externalResourceRequests':requests}
    context.close()
    passed('Standalone game bytes import and render all thirteen kit models offline without external resource requests',evidence)


try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1400,'height':900},accept_downloads=True)
        editor=context.new_page();editor.set_default_timeout(120000);monitor(editor)
        editor.goto(URL+'/map-editor.html',wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        editor.locator('#json-file-input').set_input_files({'name':'environment-kit-fixture.json','mimeType':'application/json','buffer':json.dumps(FIXTURE).encode()})
        editor.wait_for_function('nebeljagdMapTestState().map.objects.some(o=>o.id==="qa-kit-stone-wall")')
        assert map_state(editor)['map']==FIXTURE
        variants=[]
        for definition in DEFINITIONS:
            editor.locator('#palette-kind').select_option(definition['kind'])
            editor.locator('#palette-variant').select_option(definition['variant'])
            expect(editor.locator('#palette-preview-image svg image')).to_be_visible()
            result=editor.evaluate('''async()=>{const image=new Image();image.src=document.querySelector('#palette-preview-image svg image').getAttribute('href');await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,embedded:image.src.startsWith('data:image/webp;base64,')};}''')
            assert result['embedded'] and result['width']>=128 and result['height']>=96
            variants.append(definition['id'])
        assert len(variants)==13
        passed('The editor imports all thirteen kit variants and shows their real embedded model previews',variants)
        with editor.expect_download() as info:editor.locator('#export-json').click()
        saved=ROOT/'test-results/environment-kit-map.json';saved.parent.mkdir(exist_ok=True);info.value.save_as(saved)
        assert json.loads(saved.read_text())==FIXTURE
        editor.locator('#json-file-input').set_input_files(str(saved));assert map_state(editor)['map']==FIXTURE
        with editor.expect_popup() as info:editor.locator('#playtest-world').click()
        game=info.value;game.set_default_timeout(120000);monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        assert state(game)['world']['objects']==FIXTURE['objects']
        assert state(game)['world']['source']=='editor'
        # Enable only the existing relocation/read-only collision inspection API.
        target=game.url+'&inspect=1&quality=low'
        game.goto(target,wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#startBtn')).to_be_enabled();game.locator('#startBtn').click()
        inspect(game,[-64,50])
        game.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
        first=state(game)
        assert first['world']['objects']==FIXTURE['objects']
        assert first['world']['stats']['loadedGLBs']==18,first['world']['stats']
        kit_stats=first['world']['stats']['environmentKit']
        assert kit_stats['loadedModels']==13 and kit_stats['placements']==13,kit_stats
        assert {model['id'] for model in kit_stats['models']}==set(BY_ID)
        tavern_model=next(model for model in kit_stats['models'] if model['id']=='house:kit-taverne')
        assert tavern_model['height']==4.8 and tavern_model['reducedDressing'] and tavern_model['omittedDetailMeshes']>0,tavern_model
        passed('The roofless tavern loads at full wall height with its selected dressing cut applied',tavern_model)
        inspect(game,[-66,35],math.pi);capture(game,'trees')

        for kind,variant,keys in [('wall','kit-stone',['w','a']),('fence','kit-wood',['w','d']),('crate','kit-wood',['a'])]:
            obj=object_for(kind,variant);definition=BY_ID[kind+':'+variant]
            body=definition['walls'][0];cx=(body['minX']+body['maxX'])/2
            front=body['maxZ'];start=world_point(obj,cx,front+2/obj['scale'])
            direction=obj['rotation']+math.pi
            inspect(game,start,direction);walk(game,keys,.8)
            stopped=local_point(obj,state(game)['position'])
            assert stopped[1]>=front+.3/obj['scale'] and stopped[1]<front+.7/obj['scale'],(kind,stopped,front)
            inspect(game,start,direction);walk(game,keys,.5,roll=True)
            rolled=local_point(obj,state(game)['position'])
            assert rolled[1]>=front+.3/obj['scale'],(kind,rolled,front)
            passed(f'Rotated and scaled {kind} blocks real walking and rolling at its visible body',{'walkLocal':stopped,'rollLocal':rolled})
            if kind=='crate':
                # Destructible crate/projectile interactions have focused node-level
                # coverage; keep this browser pass focused on its live movement body.
                continue
            # Movement and roll are over before firing from an unambiguous side.
            inspect(game,start,direction);wait_sim(game,.7)
            before=state(game)['combat']['impacts'];game.keyboard.press('f')
            game.wait_for_function('n=>nebeljagdTestState().combat.impacts>n',arg=before)
            impact=state(game)['combat']['lastImpact'];assert impact['type']==kind,(kind,impact)
            passed(f'Rotated and scaled {kind} also blocks arrows at its visible body',impact)
            wait_sim(game,.6)

        arch=object_for('ruin','kit-arch');definition=BY_ID['ruin:kit-arch']
        left,right=definition['walls'];center=(left['maxX']+right['minX'])/2
        front=max(left['maxZ'],right['maxZ']);back=min(left['minZ'],right['minZ'])
        inspect(game,world_point(arch,center,front+2),math.pi);walk(game,['w'],1.1)
        crossed=local_point(arch,state(game)['position'])
        assert crossed[1]<back-.35,(crossed,back)
        pillar_x=(left['minX']+left['maxX'])/2
        inspect(game,world_point(arch,pillar_x,front+2),math.pi);walk(game,['w'],.8)
        blocked=local_point(arch,state(game)['position']);assert blocked[1]>front,(blocked,front)
        passed('The GLB ruin arch has a traversable center while its actual pillar remains solid',{'centerCrossing':crossed,'pillarStop':blocked})

        house=object_for('house','kit-timber');definition=BY_ID['house:kit-timber']
        house_record=next(h for h in state(game)['houses'] if h['id']==house['id'])
        assert not house_record['roofVisible'] and house_record['interiorVisible'],house_record
        front=max(w['maxZ'] for w in definition['walls'])
        inspect(game,world_point(house,0,front+1.2),math.pi+house['rotation'])
        walk(game,['w'],1)
        inside=local_point(house,state(game)['position'])
        assert abs(inside[0])<definition['insideHalfWidth'] and abs(inside[1])<definition['insideHalfDepth'],inside
        assert state(game)['shelter']==house['name'],state(game)
        passed('The timber GLB house stays roofless and its visible front opening leads to the interior',{'localPosition':inside,'house':house_record})
        capture(game,'house')
        tavern=object_for('house','kit-taverne');definition=BY_ID['house:kit-taverne']
        tavern_record=next(h for h in state(game)['houses'] if h['id']==tavern['id'])
        assert not tavern_record['roofVisible'] and tavern_record['interiorVisible'],tavern_record
        inspect(game,world_point(tavern,-1.5,10.5),math.pi)
        capture(game,'taverne-exterior')
        walk(game,['w'],1)
        inside=local_point(tavern,state(game)['position'])
        assert abs(inside[0])<definition['insideHalfWidth'] and abs(inside[1])<definition['insideHalfDepth'],inside
        assert state(game)['shelter']==tavern['name'],state(game)
        tavern_record=next(h for h in state(game)['houses'] if h['id']==tavern['id'])
        assert not tavern_record['frontFacadeVisible'] and tavern_record['frontFacadeParts']>0,tavern_record
        passed('The raised tavern walls keep the entrance open, then cut away the front facade from inside',{'localPosition':inside,'house':tavern_record})
        capture(game,'taverne')
        grass=object_for('grass','kit-tall');inspect(game,grass['position'])
        game.wait_for_function('nebeljagdTestState().hiddenInGrass')
        runtime=next(patch for patch in state(game)['world']['grassPatches'] if patch['id']==grass['id'])
        assert runtime['instanceCount']>0 and runtime['height']>1
        assert runtime['assetVariant']=='kit-tall' and runtime['modelTrianglesPerInstance']==1248
        passed('The kit grass remains an editable rendered hiding area',runtime)
        inspect(game,[-63,52],math.pi);capture(game,'props')
        check_offline_kit(browser)
        browser.close()
    assert not REPORT['errors'],REPORT['errors'];REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error);raise
finally:
    (ROOT/'docs/environment-kit-check.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
