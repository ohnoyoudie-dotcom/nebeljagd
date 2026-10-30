"""Exercise the Tripo prop catalogue, building cleanup and real gameplay.

NEBELJAGD_URL=http://127.0.0.1:5192 python tests/tripo_props_smoke.py
NEBELJAGD_STANDALONE=1 also records hashes of actual welt/ HTML files served by
that URL. NEBELJAGD_DELIVERY_ONLY=1 verifies UI, rendering and chest integration
without repeating the full movement/destruction suite. Only the existing inspection hook relocates the avatar; all map edits,
weapon pickup, movement, roll, attacks and chest opening use normal UI/input.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5192').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
DELIVERY_ONLY = os.environ.get('NEBELJAGD_DELIVERY_ONLY') == '1'
OUT = ROOT / 'test-results/tripo-props'
OUT.mkdir(parents=True, exist_ok=True)
RETIRED = {'herbal', 'inn', 'hunter', 'kit-timber', 'kit-taverne'}
REPORT = {'status': 'running', 'url': URL, 'deliveryOnly': DELIVERY_ONLY, 'checks': [], 'errors': [], 'screenshots': []}
BASE = json.loads((ROOT / 'worldmap.json').read_text())
FIXTURE = copy.deepcopy(BASE)
FIXTURE['objects'] = []
FIXTURE['gameplay']['spawnPosition'] = [180, 171]
PROP_SETTINGS = [
    ('wagon', 'kit-tripo-wagon', 174, 150, 45, 1.25),
    ('barrel', 'kit-tripo-barrel', 180, 150, 0, 1),
    ('well', 'kit-tripo-well', 186, 150, 0, 1),
    ('rock', 'kit-tripo-01', 174, 159, 0, 1),
    ('rock', 'kit-tripo-02', 180, 159, 0, 1),
    ('rock', 'kit-tripo-03', 186, 159, 0, 1),
    ('chest', 'kit-tripo-chest', 180, 167, 45, 1.1),
]


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def monitor(page):
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)


def editor_state(page):
    return page.evaluate('nebeljagdMapTestState()')


def state(page):
    return page.evaluate('''() => {const s=nebeljagdTestState(); return {
      position:s.position, elapsed:s.elapsed, phase:s.phase, equippedWeapon:s.equippedWeapon,
      combat:s.combat, chests:s.chests, pickups:s.pickups, weaponDrops:s.weaponDrops,
      nearChest:s.nearChest, rendering:s.rendering,
      world:{source:s.world.source, objects:s.world.objects, stats:s.world.stats,
        destructibles:s.world.destructibles, projectileObstacles:s.world.projectileObstacles}
    };}''')


def wait_sim(page, seconds):
    before = page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t => nebeljagdTestState().elapsed >= t', arg=before + seconds)


def inspect(page, point, direction=math.pi):
    page.evaluate('p => nebeljagdInspect(p)', {'x': point[0], 'z': point[1], 'direction': direction,
                                            'health': 100, 'elapsed': 0})
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    wait_sim(page, .15)


def walk(page, keys, seconds, roll=False):
    if roll:
        page.wait_for_function('nebeljagdTestState().rollCooldown === 0')
    try:
        for key in keys:
            page.keyboard.down(key)
        if roll:
            page.keyboard.press('Space')
            assert page.evaluate('nebeljagdTestState().rollCooldown') > 0
        wait_sim(page, seconds)
    finally:
        for key in keys:
            page.keyboard.up(key)
    wait_sim(page, .12)


def import_map(page, value, name='tripo-props-fixture.json'):
    page.locator('#json-file-input').set_input_files({
        'name': name, 'mimeType': 'application/json', 'buffer': json.dumps(value).encode()})
    page.wait_for_function('n => nebeljagdMapTestState().map.objects.length === n', arg=len(value['objects']))


def apply_object(page, *, name, x, z, rotation, scale):
    for field, value in [('feature-name', name), ('feature-x', x), ('feature-z', z),
                         ('object-rotation', rotation), ('object-scale', scale)]:
        page.locator('#' + field).fill(str(value))
    page.locator('#properties-form button[type=submit]').click()


def add_object(page, kind, variant, x, z, rotation=0, scale=1, name=None):
    before = len(editor_state(page)['map']['objects'])
    page.locator('#palette-kind').select_option(kind)
    page.locator('#palette-variant').select_option(variant)
    page.locator('#add-object-center').click()
    page.wait_for_function('n => nebeljagdMapTestState().map.objects.length === n', arg=before + 1)
    apply_object(page, name=name or ('QA ' + variant), x=x, z=z, rotation=rotation, scale=scale)
    return editor_state(page)['map']['objects'][-1]


def capture(page, name):
    prefix = 'tripo-props-standalone' if STANDALONE else 'tripo-props'
    path = ROOT / f'docs/{prefix}-{name}.png'
    page.screenshot(path=str(path))
    REPORT['screenshots'].append(str(path.relative_to(ROOT)))


def world_point(obj, x, z):
    c, s, k = math.cos(obj['rotation']), math.sin(obj['rotation']), obj['scale']
    return [obj['position'][0] + k * (c*x+s*z), obj['position'][1] + k * (-s*x+c*z)]


def local_point(obj, pos):
    dx, dz = pos['x']-obj['position'][0], pos['z']-obj['position'][1]
    c, s, k = math.cos(obj['rotation']), math.sin(obj['rotation']), obj['scale']
    return [(c*dx-s*dz)/k, (s*dx+c*dz)/k]


def front_body(definition):
    faces = [((b['minX']+b['maxX'])/2, b['maxZ']) for b in definition['walls'] if not b.get('projectileOnly')]
    faces += [(b.get('x',0), b.get('z',0)+b['radius']) for b in definition['circles']]
    return max(faces, key=lambda face: face[1])


try:
    definitions = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {ENVIRONMENT_KIT_DEFINITIONS} from './src/map/environment-kit-definitions.js';"
        "console.log(JSON.stringify(ENVIRONMENT_KIT_DEFINITIONS));"], cwd=ROOT))
    by_id = {d['id']: d for d in definitions}
    if STANDALONE:
        REPORT['delivery'] = {
            'mode': 'Actual standalone welt/ HTML files served by a local static HTTP server',
            'fileProtocolLimitation': 'This validates HTTP-served standalone bytes; no file:// success is claimed.',
            'files': {name: {'sha256': hashlib.sha256((ROOT/'welt'/name).read_bytes()).hexdigest(),
                             'bytes': (ROOT/'welt'/name).stat().st_size}
                      for name in ['map-editor.html', 'index.html', 'nebeljagd.html']},
            'unexpectedResourceRequests': [],
        }
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
        context.add_init_script("Object.defineProperty(window, 'showSaveFilePicker', {value: undefined, configurable: true});")
        if STANDALONE:
            def check_request(request):
                parsed, origin = urlsplit(request.url), urlsplit(URL)
                if parsed.scheme not in ('http', 'https'):
                    return
                if (parsed.scheme, parsed.netloc) == (origin.scheme, origin.netloc) and (
                    request.is_navigation_request() and parsed.path in ['/map-editor.html', '/index.html', '/nebeljagd.html']
                    or parsed.path == '/favicon.ico'):
                    return
                REPORT['delivery']['unexpectedResourceRequests'].append(request.url)
            context.on('request', check_request)
        editor = context.new_page()
        editor.set_default_timeout(90000)
        monitor(editor)
        editor.goto(URL+'/map-editor.html', wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        original = editor_state(editor)['map']
        assert not [o for o in original['objects'] if o['kind']=='house' and o['variant'] in RETIRED]
        editor.locator('summary').filter(has_text='Objekte & Verteilung').click()
        editor.locator('#palette-kind').select_option('house')
        house_options = editor.locator('#palette-variant option').evaluate_all('(items) => items.map(i=>i.value)')
        assert 'kit-tripo-tavern' in house_options and not set(house_options).intersection(RETIRED), house_options
        passed('Fresh source map contains no retired buildings and the new Tripo inn remains selectable',
               {'defaultObjectCount': len(original['objects']), 'houseOptions': house_options})

        legacy = copy.deepcopy(FIXTURE)
        legacy['objects'] = [
            {'id':'qa-retired-house','kind':'house','variant':'herbal','name':'Legacy building','position':[150,140],'rotation':0,'scale':1},
            {'id':'chest-qa-retired-house','kind':'chest','variant':'wood','name':'Legacy stock','position':[150,142],'rotation':0,'scale':1},
            {'id':'qa-preserved-inn','kind':'house','variant':'kit-tripo-tavern','name':'My new inn','position':[225,150],'rotation':.3,'scale':1.2},
            {'id':'qa-preserved-tree','kind':'tree','variant':'oak','name':'My custom tree','position':[165,145],'rotation':.7,'scale':1.3},
        ]
        import_map(editor, legacy)
        expect(editor.locator('#retired-buildings-banner')).to_be_visible()
        editor.locator('#remove-retired-buildings').click()
        cleaned = editor_state(editor)['map']
        assert cleaned['objects'] == legacy['objects'][2:], cleaned['objects']
        editor.locator('#undo').click()
        assert editor_state(editor)['map']['objects'] == legacy['objects']
        editor.locator('#remove-retired-buildings').click()
        editor.reload(wait_until='domcontentloaded')
        editor.wait_for_function('window.nebeljagdMapTestState')
        expect(editor.locator('#restore-banner')).to_be_visible()
        editor.locator('#restore-draft').click()
        assert editor_state(editor)['map']['objects'] == cleaned['objects']
        passed('Legacy draft cleanup removes only old buildings and linked stock, supports Undo and preserves the new inn and unrelated edits after reload',
               {'removedIds':[o['id'] for o in legacy['objects'][:2]], 'retainedObjects':cleaned['objects']})

        import_map(editor, FIXTURE)
        palette_panel = editor.locator('details').filter(has=editor.locator('#palette-kind'))
        if palette_panel.get_attribute('open') is None:
            palette_panel.locator('summary').click()
        placed = {}
        previews = []
        for kind, variant, x, z, rotation, scale in PROP_SETTINGS:
            editor.locator('#palette-kind').select_option(kind)
            editor.locator('#palette-variant').select_option(variant)
            expect(editor.locator('#palette-preview-title')).to_contain_text('Tripo')
            preview = editor.evaluate('''async () => {
              const node=document.querySelector('#palette-preview-image svg image');
              if (!node) return null;
              const image=new Image(); image.src=node.getAttribute('href'); await image.decode();
              return {width:image.naturalWidth,height:image.naturalHeight,embedded:image.src.startsWith('data:image/webp;base64,')};
            }''')
            assert preview and preview['embedded'] and preview['width']>=128 and preview['height']>=96, (variant,preview)
            previews.append({'id':kind+':'+variant,**preview})
            placed[kind+':'+variant] = add_object(editor,kind,variant,x,z,rotation,scale)
        wagon = add_object(editor,'wagon','kit-tripo-wagon',193,150,90,.8,'QA second wagon')
        editor.locator('#focus-selection').click()
        editor.locator('#object-kind-filter').select_option('all')
        editor.locator('#zoom-out').click()
        capture(editor, 'editor')
        sword = add_object(editor,'sword','steel',174,168,name='QA sword')
        bow = add_object(editor,'bow','wood',186,168,name='QA bow')
        snapshot = editor_state(editor)['map']
        with editor.expect_download() as download:
            editor.locator('#export-json').click()
        saved = OUT/'editor-export.json'
        download.value.save_as(saved)
        assert json.loads(saved.read_text()) == snapshot
        import_map(editor,json.loads(saved.read_text()),'roundtrip.json')
        assert editor_state(editor)['map'] == snapshot
        passed('Every new prop has a real embedded preview, can be placed and transformed, and survives JSON export/reimport',
               {'previews':previews,'objects':snapshot['objects']})

        with editor.expect_popup() as popup:
            editor.locator('#playtest-world').click()
        game = popup.value
        game.set_default_timeout(120000)
        monitor(game)
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        game.goto(game.url+'&inspect=1&quality=low',wait_until='domcontentloaded')
        game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        expect(game.locator('#startBtn')).to_be_enabled()
        game.locator('#startBtn').click()
        inspect(game,[180,164])
        current = state(game)
        assert current['world']['source']=='editor'
        assert current['world']['objects']==snapshot['objects']
        kit = current['world']['stats']['environmentKit']
        static_ids = set(placed)-{'chest:kit-tripo-chest'}
        assert {model['id'] for model in kit['models']} == static_ids, kit
        assert kit['loadedModels']==6 and kit['placements']==7, kit
        assert current['rendering']['textures']>0 and current['rendering']['triangles']>10000
        capture(game,'overview')
        inspect(game,[180,154])
        capture(game,'wagon-well-barrel')
        passed('Editor playtest renders all six static models with one shared load for repeated wagon placements',
               {'kit':kit,'rendering':current['rendering']})

        chest = placed['chest:kit-tripo-chest']
        if not DELIVERY_ONLY:
            movement = []
            for key in static_ids:
                obj, definition = placed[key], by_id[key]
                x, front = front_body(definition)
                start = world_point(obj,x,front+1.8/obj['scale'])
                keys = ['w','a'] if abs(obj['rotation']-math.pi/4)<1e-6 else ['w']
                inspect(game,start,obj['rotation']+math.pi)
                walk(game,keys,.75)
                stopped = local_point(obj,state(game)['position'])
                assert front+.25/obj['scale'] <= stopped[1] <= front+.8/obj['scale'], (key,front,stopped)
                inspect(game,start,obj['rotation']+math.pi)
                walk(game,keys,.55,roll=True)
                rolled = local_point(obj,state(game)['position'])
                assert rolled[1] >= front+.25/obj['scale'], (key,front,rolled)
                movement.append({'id':key,'front':front,'walkLocal':stopped,'rollLocal':rolled})
            passed('Wagon, barrel, well and all three rocks block actual walking and rolls at their authored collision bodies',movement)

            chest_front = .57
            start = world_point(chest,0,chest_front+1.8/chest['scale'])
            inspect(game,start,chest['rotation']+math.pi)
            walk(game,['w','a'],.75)
            stopped = local_point(chest,state(game)['position'])
            assert chest_front+.25/chest['scale'] <= stopped[1] <= chest_front+.8/chest['scale'],stopped
            inspect(game,start,chest['rotation']+math.pi)
            walk(game,['w','a'],.55,roll=True)
            rolled = local_point(chest,state(game)['position'])
            assert rolled[1] >= chest_front+.25/chest['scale'],rolled
            passed('The rotated and scaled Tripo chest blocks walking and rolling before it is opened',
                   {'walkLocal':stopped,'rollLocal':rolled})

        # The normal E action and game systems must drive lid opening and drops.
        inspect(game,world_point(chest,0,1.55),chest['rotation']+math.pi)
        game.wait_for_function('id=>nebeljagdTestState().nearChest===id',arg=chest['id'])
        game.keyboard.press('e')
        game.wait_for_function('id=>nebeljagdTestState().chests.some(c=>c.id===id&&c.opened)',arg=chest['id'])
        wait_sim(game,.75)
        current = state(game)
        chest_record = next(c for c in current['chests'] if c['id']==chest['id'])
        assert chest_record['variant']=='kit-tripo-chest' and chest_record['model']=='tripo',chest_record
        assert chest_record['lidRotation'] < -1.8,chest_record
        gold = [drop for drop in current['pickups'] if drop['id'].startswith(chest['id']+'-gold-')]
        loot = [drop for drop in current['weaponDrops'] if drop['id']==chest['id']+'-weapon']
        assert len(gold)==2 and len(loot)==1,(gold,loot)
        capture(game,'chest-open')
        passed('E opens the real Tripo lid and releases the existing two gold drops and weapon loot',
               {'chest':chest_record,'gold':gold,'weapon':loot})

        if not DELIVERY_ONLY:
            # Acquire a normal map sword via E if opening the chest auto-equipped loot.
            inspect(game,sword['position'])
            wait_sim(game,.15)
            if state(game)['equippedWeapon']!='sword':
                game.keyboard.press('e')
            game.wait_for_function('nebeljagdTestState().equippedWeapon==="sword"')
            barrel = placed['barrel:kit-tripo-barrel']
            target = next(t for t in state(game)['world']['destructibles'] if t['id']==barrel['id'])
            x,front = front_body(by_id['barrel:kit-tripo-barrel'])
            inspect(game,world_point(barrel,x,front+.9),math.pi)
            for _ in range(6):
                game.keyboard.press('f')
                wait_sim(game,.75)
                target = next(t for t in state(game)['world']['destructibles'] if t['id']==barrel['id'])
                if target['destroyed']:
                    break
            assert target['destroyed'],target
            walk(game,['w'],.7)
            crossed = local_point(barrel,state(game)['position'])
            assert crossed[1] < -front-.3,(crossed,front)
            capture(game,'barrel-destroyed')
            passed('The Tripo barrel is destroyed by actual sword attacks and its removed collision permits walking through',
                   {'target':target,'crossedLocal':crossed})

            # A tall rock is a meaningful arrow obstacle; the low slab is intentionally
            # not asserted to stop arrows above its height.
            inspect(game,bow['position'])
            game.keyboard.press('e')
            game.wait_for_function('nebeljagdTestState().equippedWeapon==="bow"')
            tall = placed['rock:kit-tripo-03']
            x,front=front_body(by_id['rock:kit-tripo-03'])
            inspect(game,world_point(tall,x,front+2),math.pi)
            wait_sim(game,.7)
            before=state(game)['combat']['impacts']
            game.keyboard.press('f')
            game.wait_for_function('n=>nebeljagdTestState().combat.impacts>n',arg=before)
            impact=state(game)['combat']['lastImpact']
            assert impact['type']=='rock',impact
            passed('The tall Tripo rock stops an arrow through the live projectile collision system',impact)
            game.keyboard.press('Escape')
            expect(game.locator('#restartBtn')).to_be_visible()
            game.locator('#restartBtn').click()
            inspect(game,world_point(barrel,0,front_body(by_id['barrel:kit-tripo-barrel'])[1]+1.8),math.pi)
            restored = next(t for t in state(game)['world']['destructibles'] if t['id']==barrel['id'])
            assert not restored['destroyed'] and restored['health']==restored['maxHealth'],restored
            walk(game,['w'],.75)
            stopped=local_point(barrel,state(game)['position'])
            assert stopped[1] >= front_body(by_id['barrel:kit-tripo-barrel'])[1]+.25,stopped
            restored_chest=next(c for c in state(game)['chests'] if c['id']==chest['id'])
            assert not restored_chest['opened'] and restored_chest['lidRotation']==0,restored_chest
            capture(game,'reset')
            passed('Restart restores the barrel model, full health and solid collision, and closes the Tripo chest again',
                   {'barrel':restored,'walkLocal':stopped,'chest':restored_chest})
        if STANDALONE:
            assert not REPORT['delivery']['unexpectedResourceRequests'],REPORT['delivery']
            passed('Actual standalone editor and game run this scenario without external resource dependencies',REPORT['delivery'])
        browser.close()
    assert not REPORT['errors'],REPORT['errors']
    REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed'
    REPORT['failure']=str(error)
    raise
finally:
    report_name = 'tripo-props-check.json' if STANDALONE else 'tripo-props-gameplay-check.json'
    (ROOT/'docs'/report_name).write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],
                      'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
