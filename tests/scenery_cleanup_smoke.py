"""Verify scenery retirement in the actual editor and game.

NEBELJAGD_URL=http://127.0.0.1:5193 python tests/scenery_cleanup_smoke.py
Set NEBELJAGD_STANDALONE=1 when serving actual welt/ files. Only the existing
avatar inspection hook relocates the player; edits use ordinary UI controls.
"""
from __future__ import annotations
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
BASE = json.loads((ROOT/'worldmap.json').read_text())
RETIRED = {'tree', 'rock', 'mound', 'flower'}
LOOT_KINDS = {'heart', 'chest', 'bow', 'sword', 'fireStaff', 'iceStaff'}
# Snapshot of all collectible placements before this requested scenery cleanup.
BEFORE_LOOT_SHA256 = 'c49b80d620169bd2c4cf3b672e175351101a78bb0c9f5e63f5edab32be90a0d7'
OUT = ROOT/'test-results/scenery-cleanup'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status':'running', 'url':URL, 'checks':[], 'errors':[], 'screenshots':[],
          'limits':'Chromium with CPU SwiftShader; no physical iPad performance claim.'}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def passed(name, evidence=None):
    REPORT['checks'].append({'name':name, 'evidence':evidence})
    print('PASS', name, flush=True)


def state(page):
    return page.evaluate('nebeljagdMapTestState()')


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type=='error' else None)


def capture(page, name):
    path = ROOT/f'docs/scenery-cleanup-{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def import_map(page, value):
    page.locator('#json-file-input').set_input_files({'name':'scenery-cleanup-test.json',
        'mimeType':'application/json', 'buffer':json.dumps(value).encode()})
    page.wait_for_function('n=>nebeljagdMapTestState().map.name===n', arg=value['name'])
    assert state(page)['map']==value


def open_control(page, identifier):
    control=page.locator('#'+identifier)
    for details in control.locator('xpath=ancestor::details').all():
        if details.get_attribute('open') is None:
            details.locator(':scope > summary').click()
    control.scroll_into_view_if_needed()
    return control


def drag(page, start, end):
    page.locator('#map-viewport').scroll_into_view_if_needed()
    def client(p):
        return page.evaluate("p=>{const svg=document.querySelector('#map-stage>svg');const q=new DOMPoint(...p).matrixTransform(svg.getScreenCTM());return {x:q.x,y:q.y}}", p)
    a,b=client(start),client(end)
    page.mouse.move(a['x'],a['y']); page.mouse.down()
    page.mouse.move(b['x'],b['y'],steps=10); page.mouse.up()


def object_(identifier, kind, variant, point, **kwargs):
    return {'id':identifier,'name':identifier,'kind':kind,'variant':variant,
            'position':point,'rotation':.3,'scale':1,**kwargs}


def fixture():
    presets=json.loads(subprocess.check_output(['node','--input-type=module','-e',
        "import{BIOME_PRESETS,VEGETATION_TYPES}from'./src/map/landscape.js';console.log(JSON.stringify({preset:BIOME_PRESETS[0],flowers:VEGETATION_TYPES.find(v=>v.id==='flowers').settings}));"],cwd=ROOT))
    legacy=copy.deepcopy(BASE)
    legacy['name']='Mein erhaltener Landschaftsentwurf'
    legacy['paths'][0]['width']+=.5
    legacy['objects']=[
        object_('qa-retired-tree','tree','oak',[150,140]),
        object_('qa-retired-rock','rock','granite',[154,140]),
        object_('qa-retired-tripo-rock','rock','kit-tripo-03',[158,140]),
        object_('qa-retired-mound','mound','ridge',[162,140]),
        object_('qa-retired-flowers','flower','rei-white',[170,140],radius=1.5),
        object_('qa-preserved-grass','grass','tall',[174,140],radius=2),
        object_('qa-preserved-bush','bush','rei-bush',[178,140]),
        object_('qa-preserved-chest','chest','kit-tripo-chest',[180,150]),
        object_('qa-preserved-bow','bow','wood',[184,150],rarity='rare'),
        object_('qa-preserved-inn','house','kit-tripo-tavern',[225,150]),
        object_('qa-preserved-wagon','wagon','kit-tripo-wagon',[188,150]),
    ]
    preset=copy.deepcopy(presets['preset'])
    preset.update(id='qa-old-landscape-preset',name='Alte Blumen-und-Baum-Vorlage',vegetation=presets['flowers'],brushRadius=4)
    preset.pop('label',None)
    preset['scatter'].update(density=1,minDistance=1,entries=[
        {'kind':'tree','variant':'oak','weight':1}, {'kind':'rock','variant':'granite','weight':1},
        {'kind':'flower','variant':'rei-white','weight':1}, {'kind':'grass','variant':'short','weight':1}])
    legacy['landscape']={'version':1,'presets':[preset]}
    return legacy


try:
    loot=[o for o in BASE['objects'] if o['kind'] in LOOT_KINDS]
    assert len(loot)==66 and digest(loot)==BEFORE_LOOT_SHA256
    assert not any(o['kind'] in RETIRED for o in BASE['objects'])
    if STANDALONE:
        REPORT['delivery']={'mode':'Actual welt/ standalone HTML served by local HTTP',
            'files':{n:{'bytes':(ROOT/'welt'/n).stat().st_size,'sha256':hashlib.sha256((ROOT/'welt'/n).read_bytes()).hexdigest()}
                for n in ['map-editor.html','nebeljagd.html','index.html']},
            'unexpectedResourceRequests':[], 'fileProtocolTested':False}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
        context.add_init_script("Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});")
        if STANDALONE:
            def request_check(request):
                parsed,origin=urlsplit(request.url),urlsplit(URL)
                if parsed.scheme not in ['http','https']: return
                if parsed.netloc==origin.netloc and (request.is_navigation_request() and parsed.path in ['/map-editor.html','index.html','/index.html','/nebeljagd.html'] or parsed.path=='/favicon.ico'): return
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
            context.on('request',request_check)
        editor=context.new_page(); monitor(editor); editor.set_default_timeout(90000)
        response=editor.goto(URL+'/map-editor.html',wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        # The bundled HTML is too large for Chromium's DevTools response cache.
        # Hash the real served bytes directly without relying on that cache.
        if STANDALONE:
            with urlopen(URL+'/map-editor.html') as served:
                assert hashlib.sha256(served.read()).hexdigest()==REPORT['delivery']['files']['map-editor.html']['sha256']
        assert state(editor)['map']==BASE
        palette=open_control(editor,'palette-kind')
        kinds=palette.locator('option').evaluate_all('(xs)=>xs.map(x=>x.value)')
        assert not RETIRED.intersection(kinds),kinds
        for kind in ['grass','bush','house','wagon','barrel','well','heart','chest','bow','sword','fireStaff','iceStaff']: assert kind in kinds,kind
        palette.select_option('house')
        assert editor.locator('#palette-variant').input_value()=='kit-tripo-tavern'
        assert not RETIRED.intersection(editor.locator('#object-kind-filter option').evaluate_all('(xs)=>xs.map(x=>x.value)'))
        passed('Fresh map removes the four scenery categories while preserving every one of the 66 collectible placements exactly',
            {'objects':len(BASE['objects']),'lootCount':len(loot),'lootSha256':digest(loot),'selectableKinds':kinds})
        palette.select_option('grass'); capture(editor,'editor')

        for kind in RETIRED: assert editor.locator('#scatter-'+kind).count()==0,kind
        assert set(editor.locator('[id^=scatter-variant-]').evaluate_all('(xs)=>xs.map(x=>x.id.slice(16))'))=={'grass','bush'}
        assert 'flowers' not in editor.locator('#vegetation-type option').evaluate_all('(xs)=>xs.map(x=>x.value)')
        passed('Palette, object category filter, scatter controls and fresh vegetation brush no longer offer retired scenery')

        legacy=fixture(); import_map(editor,legacy)
        expect(editor.locator('#retired-scenery-banner')).to_be_visible()
        editor.locator('#remove-retired-scenery').click()
        expected={**legacy,'objects':legacy['objects'][5:]}
        assert state(editor)['map']==expected
        expect(editor.locator('#retired-scenery-banner')).to_be_hidden()
        editor.locator('#undo').click(); assert state(editor)['map']==legacy
        editor.locator('#redo').click(); assert state(editor)['map']==expected
        with editor.expect_download() as dl: editor.locator('#export-json').click()
        saved=OUT/'cleaned-worldmap.json';dl.value.save_as(saved)
        assert json.loads(saved.read_text())==expected
        editor.reload(wait_until='domcontentloaded');editor.wait_for_function('window.nebeljagdMapTestState')
        expect(editor.locator('#restore-banner')).to_be_visible();editor.locator('#restore-draft').click()
        assert state(editor)['map']==expected
        passed('Explicit old-draft cleanup is undoable, survives JSON saving and reload, and preserves loot, the inn, wagon, grass, shrubs and custom paths',
            {'removedIds':[o['id'] for o in legacy['objects'][:5]],'retainedIds':[o['id'] for o in expected['objects']]})

        open_control(editor,'landscape-preset-select').select_option('qa-old-landscape-preset')
        open_control(editor,'landscape-preset-load').click()
        assert editor.locator('#vegetation-type').input_value()=='meadow'
        assert state(editor)['landscape']['scatter']['entries']==[{'kind':'grass','variant':'short','weight':1}]
        editor.locator('#fit-map').click()
        for _ in range(4):editor.locator('#zoom-in').click()
        before=len(state(editor)['map']['objects'])
        open_control(editor,'grass-brush').click();drag(editor,[-50,14],[-36,14])
        additions=state(editor)['map']['objects'][before:]
        assert additions and all(o['kind']=='grass' for o in additions),additions
        open_control(editor,'landscape-scatter-brush').click()
        before=len(state(editor)['map']['objects']);drag(editor,[-100,100],[-80,100])
        additions=state(editor)['map']['objects'][before:]
        assert additions and all(o['kind']=='grass' for o in additions),additions
        assert not any(o['kind'] in RETIRED for o in state(editor)['map']['objects'])
        scatter_count=len(additions)
        open_control(editor,'biome-preset').select_option('qa-old-landscape-preset')
        before=state(editor)['map']
        open_control(editor,'landscape-biome-brush').click();drag(editor,[-100,100],[-80,100])
        after=state(editor)['map']
        assert after['objects']==before['objects']
        assert len(after['landscape']['biomes'])>len(before['landscape'].get('biomes',[]))
        passed('Loading an old mixed flower/tree/rock preset produces only allowed grass through painting and scatter; its biome brush cannot respawn retired objects',
            {'loadedVegetation':editor.locator('#vegetation-type').input_value(),'scatterCount':scatter_count,
             'biomeStamps':len(after['landscape']['biomes'])-len(before['landscape'].get('biomes',[]))})

        import_map(editor,BASE)
        with editor.expect_popup() as popup:editor.locator('#playtest-world').click()
        game=popup.value;monitor(game);game.set_default_timeout(120000)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        game.goto(game.url+'&inspect=1&quality=low',wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        game.locator('#startBtn').click()
        actual=game.evaluate("() => {const s=nebeljagdTestState();return {objects:s.world.objects,source:s.world.source,trees:s.world.treeCount,obstacles:s.world.projectileObstacles};}")
        assert actual['source']=='editor' and actual['objects']==BASE['objects']
        assert actual['trees']==0
        assert not any(body['type'] in RETIRED for body in actual['obstacles'])
        capture(game,'cleared-world')
        passed('The edited map reaches the real 3D game without retired scenery or leftover collision obstacles',
            {'objects':len(actual['objects']),'trees':actual['trees'],'obstacles':len(actual['obstacles'])})

        bow=next(o for o in loot if o['id']=='obj-bow-start')
        game.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1],health:100,elapsed:0})',bow['position'])
        game.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
        chest=next(o for o in loot if o['id']=='obj-chest-start')
        game.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1]+1.7,health:100,elapsed:0})',chest['position'])
        game.wait_for_function('id=>nebeljagdTestState().nearChest===id',arg=chest['id'])
        game.keyboard.press('e')
        game.wait_for_function('id=>nebeljagdTestState().chests.some(c=>c.id===id&&c.opened&&c.lidRotation < -1.8)',arg=chest['id'])
        game.wait_for_function('id=>nebeljagdTestState().weaponDrops.some(o=>o.id===id+"-weapon")',arg=chest['id'])
        assert game.evaluate("nebeljagdTestState().pickups.filter(i=>i.id.startsWith('obj-chest-start-gold-')).length") == 2
        capture(game,'retained-loot')
        passed('Retained start loot still works: the bow auto-equips and E opens the original chest with weapon and gold drops',
            game.evaluate("() => {const s=nebeljagdTestState();return {equippedWeapon:s.equippedWeapon,chest:s.chests.find(c=>c.id==='obj-chest-start'),goldDrops:s.pickups.filter(i=>i.id.startsWith('obj-chest-start-gold-'))};}"))
        if STANDALONE:
            assert not REPORT['delivery']['unexpectedResourceRequests']
            passed('The actual delivered standalone editor and game need no external resources',REPORT['delivery'])
        browser.close()
    assert not REPORT['errors'],REPORT['errors']
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error);raise
finally:
    (ROOT/'docs/scenery-cleanup-check.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
