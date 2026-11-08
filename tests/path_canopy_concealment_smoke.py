"""Actual generated game: broken path borders, local crown fade and hiding.

Uses a validated temporary map, real walking and the visible quality selector.
The supported inspector positions the player outside each test area; concealment
and canopy changes come from actual movement, never state or shader overrides.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5232').rstrip('/')
RECOVERY = os.environ.get('NEBELJAGD_QA_RECOVERY') == '1'
SUCCESSOR = os.environ.get('NEBELJAGD_QA_SUCCESSOR') == '1' or RECOVERY
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', ROOT / ('test-results/path-canopy-concealment-integrated'
    if SUCCESSOR else 'test-results/path-canopy-concealment')))
OUT.mkdir(parents=True, exist_ok=True)
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'checks': [], 'screenshots': [], 'errors': [], 'unexpectedRequests': [],
          'mode': 'concealment-recovery' if RECOVERY else 'compact-successor' if SUCCESSOR else 'full',
          'limits': 'Actual Chromium/SwiftShader rendering and inputs; no hardware performance claim.'}


def fixture():
    value = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import {createLobbyMap} from './src/lobby-map.js';
import {vegetationSettings,pathBrushSettings,ensureLandscape} from './src/map/landscape.js';
import {createTerrainStroke} from './src/map/landscape-brush.js';
import {validateWorldmap} from './src/map/model.js';
const map=createLobbyMap();map.name='Wegränder, Baumkronen und Verstecken · QA';
map.objects=[];map.spawnAreas=[];map.gameplay.spawnPosition=[-45,-45];
map.paths=[
 {id:'qa-main',name:'Hauptweg',kind:'main',width:3.4,points:[[-35,-28],[-22,-28],[-22,-12]]},
 {id:'qa-trail',name:'Naturpfad',kind:'trail',width:2.6,points:[[-34,-20],[-9,-20]]}
];
const stroke=(preset,points,radius=1.7)=>{
 const terrain={...pathBrushSettings(preset),hardness:.72,strength:1};
 const brush=createTerrainStroke(map,{radius,terrain,seed:14+ensureLandscape(map).terrain.length});
 for(const p of points)brush.sample(p);ensureLandscape(map).terrain.push(...brush.terrain);
};
stroke('cobble',[[-6,-28],[12,-28]],2);
stroke('cobble',[[3,-36],[3,-20]],2);
for(const [index,preset] of ['earth','forest','gravel','sand','desert','snow','marsh'].entries())
 stroke(preset,[[-40,5+index*6],[-16,5+index*6]]);
for(const [id,x] of [['qa-tree-a',22],['qa-tree-b',37]])map.objects.push({
 id,name:id,kind:'tree',variant:'kit-user-tree1',position:[x,0],rotation:.25,scale:1});
for(const [id,position,radius] of [['qa-grass',[22,18],3.5],['qa-grass-tree',[37,0],4]]){
 const grass={id,name:id,kind:'grass',variant:'tall',position,radius,scale:1,rotation:0};
 grass.vegetation={...vegetationSettings(grass),heightVariation:.3};map.objects.push(grass);
}
const result=validateWorldmap(map);if(!result.valid)throw Error(result.errors.join('; '));
console.log(JSON.stringify(map));
'''], cwd=ROOT))
    (OUT / 'fixture.json').write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return value


def stage(name):
    REPORT['stage'] = name
    print('STAGE', name, flush=True)


def passed(name, evidence=None):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def state(page):
    return page.evaluate('nebeljagdTestState()')


def wait(page, expression, arg=None, timeout=180000):
    page.wait_for_function(expression, arg=arg, timeout=timeout)


def resume(page):
    if state(page)['phase'] == 'paused':
        page.keyboard.press('Escape')
    wait(page, 'nebeljagdTestState().phase==="playing"', timeout=15000)


def pause(page):
    if state(page)['phase'] == 'playing':
        page.keyboard.press('Escape')
    wait(page, 'nebeljagdTestState().phase==="paused"', timeout=15000)


def move(page, x, z):
    resume(page)
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z})
    wait(page, 't=>nebeljagdTestState().elapsed>=t', state(page)['elapsed'] + .15)


def walk_until(page, key, expression, arg=None):
    resume(page)
    page.keyboard.down(key)
    try:
        wait(page, expression, arg, timeout=45000)
    finally:
        page.keyboard.up(key)


def capture(page, name, zoom=1):
    pause(page)
    page.evaluate('zoom=>nebeljagdInspectCamera({zoom})', zoom)
    path = OUT / f'{name}.png'
    path.write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    REPORT['screenshots'].append(str(path))


def quality(page, value):
    pause(page)
    page.locator('#qualityMode').select_option(value)
    wait(page, 'q=>nebeljagdTestState().quality===q', value, timeout=15000)
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


def trees(page):
    return {tree['id']: tree for tree in state(page)['world']['trees']}


def appearance(page):
    return state(page)['character']['concealmentAppearance']


def start_progress_observer(page):
    progress = []
    def record(value):
        progress.append(value)
        (OUT/'movement-progress.json').write_text(json.dumps(progress[-160:],indent=2)+'\n')
        if len(progress) % 5 == 0:
            print('PROGRESS', json.dumps(value), flush=True)
    page.expose_function('__recordQaProgress', record)
    page.evaluate('''()=>{
      let lastElapsed=-1,lastWall=-Infinity;
      function sample(wall){
        const s=nebeljagdTestState();
        if(s.elapsed-lastElapsed>=.25||wall-lastWall>=2000){
          lastElapsed=s.elapsed;lastWall=wall;
          window.__recordQaProgress({wallMs:wall,elapsed:s.elapsed,phase:s.phase,position:s.position,
            moving:s.moving,quality:s.quality,hidden:s.hiddenInGrass,appearance:s.character.concealmentAppearance,
            frameMs:s.rendering.frameMs,calls:s.rendering.calls});
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }''')


try:
    testmap = fixture()
    digest = hashlib.sha256()
    with urlopen(URL + '/magebrawl.html', timeout=60) as response:
        assert response.status == 200
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
    assert digest.hexdigest() == hashlib.sha256((RELEASE / 'magebrawl.html').read_bytes()).hexdigest()
    release = json.loads((RELEASE / 'release.json').read_text())
    REPORT.update(gameSha256=digest.hexdigest(), buildId=release['buildId'], sourceCommit=release['sourceCommit'])
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),
            headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        try:
            context = browser.new_context(viewport={'width': 1280, 'height': 900})
            context.add_init_script('localStorage.setItem("nebeljagd.worldmap.playtest.v1",'+json.dumps(json.dumps(testmap))+');')
            context.route('**/favicon.ico', lambda route: route.fulfill(status=204))
            context.on('request', lambda request: REPORT['unexpectedRequests'].append(request.url)
                if request.url.startswith(('http:', 'https:')) and request.resource_type != 'document'
                and not urlsplit(request.url).path.endswith('/favicon.ico') else None)
            page = context.new_page(); page.set_default_timeout(15000)
            page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
            page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
            stage('load actual path, tree and tall-grass fixture')
            page.goto(URL+'/magebrawl.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded', timeout=120000)
            wait(page, 'window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            REPORT['webglContext'] = page.evaluate('document.querySelector("#game").getContext("webgl2").getContextAttributes()')
            assert REPORT['webglContext']['stencil'] is True
            assert state(page)['world']['source'] == 'editor'
            assert state(page)['world']['objects'] == testmap['objects']
            if RECOVERY:
                start_progress_observer(page)
            page.locator('#startBtn').click()

            original_styles = {identifier: tree['appearance'] for identifier, tree in trees(page).items()}
            if not RECOVERY:
                stage('irregular themed borders and clear native/painted crossings')
                wait(page, 'nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0')
                borders = state(page)['world']['stats']['terrainArt']['borderStones']
                assert borders['style'] == 'broken-thematic-verges' and borders['placement'] == 'outer-contour-only'
                assert 0 < borders['count'] <= borders['maximum'] and borders['gapCount'] > 0
                assert {'cobble','earth','forest','sand','stone','mud','snow'}.issubset(borders['byStyle']), borders['byStyle']
                assert all(s['count'] > 0 for s in borders['byStyle'].values())
                assert any(s['minWidth'] < s['maxWidth'] and s['shapeVariants'] > 1 for s in borders['byStyle'].values())
                assert borders['suppressed']['crossing'] > 0
                assert any(g['length'] > .3 for g in borders['gaps'])
                path_views = [('painted-union-crossing',3,-28)] if SUCCESSOR else [
                    ('native-crossing',-22,-23),('painted-union-crossing',3,-28),
                    ('path-themes-north',-28,11),('path-themes-south',-28,32)]
                for name, x, z in path_views:
                    move(page,x,z);capture(page,name)
                passed('All requested path themes use broken borders; native crossings and painted unions remain open', borders)

                baseline_trees = trees(page)
                original_styles = {identifier: tree['appearance'] for identifier, tree in baseline_trees.items()}
                for identifier in (['qa-tree-a'] if SUCCESSOR else ['qa-tree-a','qa-tree-b']):
                    stage(f'real entry and exit under {identifier}')
                    tree = trees(page)[identifier]; footprint = tree['canopy']['footprint']
                    cx, cz = footprint['center']; rx, rz = footprint['radiusX'], footprint['radiusZ']
                    line_z = cz + (1 if cz >= tree['z'] else -1) * rz * .45
                    move(page,cx-rx-2,line_z)
                    wait(page, 'nebeljagdTestState().world.trees.every(t=>t.canopy.opacity>.99)')
                    if identifier == 'qa-tree-a' and not SUCCESSOR:
                        capture(page,'canopy-before-entering',1.4)
                    walk_until(page,'KeyD','x=>nebeljagdTestState().position.x>=x',cx)
                    wait(page, 'id=>nebeljagdTestState().world.trees.find(t=>t.id===id).canopy.opacity<.10',identifier)
                    under = trees(page)
                    assert under[identifier]['canopy']['underCanopy']
                    other = 'qa-tree-b' if identifier == 'qa-tree-a' else 'qa-tree-a'
                    assert under[other]['canopy']['opacity'] > .99
                    assert {k:v['appearance'] for k,v in under.items()} == original_styles
                    assert all(t['canopy']['barkOpacity'] == 1 for t in under.values())
                    canopy_stats = state(page)['world']['stats']['canopyFade']
                    assert canopy_stats['localPlayerOnly'] and canopy_stats['trunkMaterialsOpaque']
                    assert canopy_stats['affectedTrees'] >= 1 and canopy_stats['activeBatches'] >= 1
                    capture(page,f'{identifier}-local-canopy',1.4)
                    if identifier == 'qa-tree-a':
                        quality(page,'high');capture(page,'canopy-high-quality',1.4);quality(page,'low')
                    else:
                        resume(page)
                        wait(page,'nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.blend>.95')
                        capture(page,'white-hidden-character-under-canopy',1.6)
                    walk_until(page,'KeyD','x=>nebeljagdTestState().position.x>=x',cx+rx+5)
                    wait(page, 'nebeljagdTestState().world.trees.every(t=>t.canopy.opacity>.99)')
                    passed(f'Only {identifier} fades for the local player and restores after actual walking away',
                        {'under': {key:value['canopy'] for key,value in under.items()}, 'restored': trees(page)[identifier]['canopy']})

            stage('real tall-grass entry produces translucent white body and strong outline')
            move(page,16,18)
            wait(page,'!nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.materialsRestored')
            normal = appearance(page)
            if not SUCCESSOR:
                capture(page,'character-before-hiding',1.8)
            walk_until(page,'KeyD','nebeljagdTestState().position.x>=22')
            wait(page,'nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.blend>.98')
            hidden = state(page); visual = appearance(page)
            assert hidden['concealment'] > .01 and hidden['hiddenFromOtherPlayers']
            assert visual['style'] == 'white-hidden-rim-v1' and visual['active'] and visual['localOnly']
            assert visual['color'] == '#ffffff' and visual['outline'] == 'stencil-contour'
            assert visual['bodyOpacity'] < .3 and .11 < visual['fillOpacity'] < .13 and .6 < visual['outlineOpacity'] < .64
            assert not visual['depthTest'] and not visual['materialsRestored']
            capture(page,'white-hidden-character-default',1)
            if not SUCCESSOR:
                capture(page,'white-hidden-character-low',1.8)
            quality(page,'high');capture(page,'white-hidden-character-high',1.8)
            walk_until(page,'KeyD','nebeljagdTestState().position.x>=28')
            wait(page,'!nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.materialsRestored')
            restored = appearance(page)
            assert restored['bodyOpacity'] > .99 and restored['fillOpacity'] < .01 and restored['outlineOpacity'] < .01
            capture(page,'character-restored-after-grass',1.8)
            passed('Real hiding uses white translucent fill and a strong contour in both qualities, then restores original materials',
                {'normal':normal,'hidden':visual,'restored':restored})

            stage('high-quality path shaders and restart restoration')
            move(page,3,-28);capture(page,'painted-union-high-quality')
            if not SUCCESSOR:
                move(page,-28,11);capture(page,'path-themes-high-quality')
                move(page,16,18)
                walk_until(page,'KeyD','nebeljagdTestState().position.x>=22')
                wait(page,'nebeljagdTestState().character.concealmentAppearance.blend>.95')
            pause(page);page.locator('#restartBtn').click()
            wait(page,'nebeljagdTestState().phase==="playing"&&nebeljagdTestState().character.concealmentAppearance.materialsRestored')
            wait(page,'nebeljagdTestState().world.trees.every(t=>t.canopy.opacity>.99)')
            assert not state(page)['hiddenInGrass']
            assert {k:v['appearance'] for k,v in trees(page).items()} == original_styles
            assert state(page)['world']['objects'] == testmap['objects']
            assert not REPORT['errors'],REPORT['errors']
            assert not REPORT['unexpectedRequests'],REPORT['unexpectedRequests']
            assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
            passed('Restart restores local visuals, preserves authored objects and produces no shader/browser/network errors')
            REPORT.update(status='passed',mapSha256=MAP_HASH,browser=browser.version)
        except BaseException:
            if 'page' in locals() and not page.is_closed():
                try:
                    snapshot = page.wait_for_function('()=>nebeljagdTestState()', timeout=5000).json_value()
                    (OUT/'failure-state.json').write_text(json.dumps(snapshot,indent=2))
                except Exception:
                    pass
                try:
                    page.screenshot(path=str(OUT/'failure.png'), timeout=5000)
                except Exception:
                    pass
            raise
        finally:
            browser.close()
except BaseException as error:
    REPORT.update(status='failed',failure=str(error))
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
