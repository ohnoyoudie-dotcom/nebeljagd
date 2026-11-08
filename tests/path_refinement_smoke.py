"""Generated-game regression: saved path stamps and softer local visibility.

Copies the actual saved legacy stamps without repainting or changing their
parameters; only rigid translations separate the style groups for inspection.
All movement runs at Low, with one paused High render to compile both variants.
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
OUT = Path(os.environ.get('NEBELJAGD_QA_OUT', ROOT / 'test-results/path-refinement'))
OUT.mkdir(parents=True, exist_ok=True)
RELEASE = Path(os.environ.get('NEBELJAGD_RELEASE_DIR', ROOT / 'welt'))
MAP_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
REPORT = {'status': 'running', 'checks': [], 'screenshots': [], 'errors': [], 'unexpectedRequests': [],
          'limits': 'Actual generated Chromium/SwiftShader render and keyboard input; no hardware performance claim.'}


def fixture():
    data = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', '''
import fs from 'node:fs';
import {createLobbyMap} from './src/lobby-map.js';
import {ensureLandscape,vegetationSettings} from './src/map/landscape.js';
import {validateWorldmap} from './src/map/model.js';
const authored=JSON.parse(fs.readFileSync('worldmap.json','utf8'));
const map=createLobbyMap();map.name='Gespeicherte Wege und sanfte Sichtbarkeit · QA';
map.objects=[];map.spawnAreas=[];map.gameplay.spawnPosition=[-50,-50];
map.paths=[{id:'qa-cluster-main',name:'Steingruppen',kind:'main',width:3.4,points:[[-48,48],[32,48]]}];
const ledger=[];
for(const [i,type] of ['earth','forest','sand','snow','stone','mud','cobble'].entries()){
 const source=authored.landscape.terrain.filter(p=>p.type===type&&p.hardness===.55&&p.strength===1&&p.radius===2.5);
 if(!source.length)throw Error(`Saved legacy strokes absent: ${type}`);
 const xs=source.map(p=>p.position[0]),zs=source.map(p=>p.position[1]);
 const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2];
 const destination=[-36+(i%3)*24,-24+Math.floor(i/3)*24];
 const translation=destination.map((v,j)=>v-center[j]);
 ensureLandscape(map).terrain.push(...source.map(p=>({...structuredClone(p),position:p.position.map((v,j)=>v+translation[j])})));
 ledger.push({type,count:source.length,ids:source.map(p=>p.id),translation,destination});
}
const soft=structuredClone(authored.landscape.terrain.find(p=>p.type==='mud'&&p.hardness===.35&&p.strength===.8&&p.radius===6));
if(!soft)throw Error('Saved natural ground absent');soft.position=[0,26];ensureLandscape(map).terrain.push(soft);
for(const [id,x] of [['qa-local-tree',35],['qa-other-tree',48]])map.objects.push({
 id,name:id,kind:'tree',variant:'kit-user-tree1',position:[x,26],rotation:.25,scale:1});
const grass={id:'qa-hide',name:'Versteck',kind:'grass',variant:'tall',position:[35,26],radius:4,scale:1,rotation:0};
grass.vegetation={...vegetationSettings(grass),heightVariation:.3};map.objects.push(grass);
const validation=validateWorldmap(map);if(!validation.valid)throw Error(validation.errors.join('; '));
console.log(JSON.stringify({map,ledger,softId:soft.id}));
'''], cwd=ROOT))
    authored = json.loads((ROOT / 'worldmap.json').read_text())
    originals = {p['id']: p for p in authored['landscape']['terrain']}
    copies = {p['id']: p for p in data['map']['landscape']['terrain']}
    for group in data['ledger']:
        for identifier in group['ids']:
            original, copied = originals[identifier], copies[identifier]
            assert {k: v for k, v in original.items() if k != 'position'} == {
                k: v for k, v in copied.items() if k != 'position'}
            assert all(abs(copied['position'][i] - original['position'][i] - group['translation'][i]) < 1e-9
                       for i in range(2))
    (OUT / 'fixture.json').write_text(json.dumps(data['map'], ensure_ascii=False, indent=2) + '\n')
    REPORT['savedPathCopies'] = data['ledger']
    REPORT['softNaturalCopy'] = data['softId']
    return data['map']


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


def phase(page, target):
    if state(page)['phase'] != target:
        page.keyboard.press('Escape')
    wait(page, 'target=>nebeljagdTestState().phase===target', target, timeout=15000)


def move(page, x, z):
    phase(page, 'playing')
    page.evaluate('p=>nebeljagdInspect(p)', {'x': x, 'z': z})
    wait(page, 't=>nebeljagdTestState().elapsed>=t', state(page)['elapsed'] + .15)


def walk(page, key, expression, arg):
    phase(page, 'playing')
    before = state(page)
    assert before['quality'] == 'low', 'All real movement must remain Low on SwiftShader'
    page.keyboard.down(key)
    try:
        wait(page, expression, arg, timeout=45000)
    finally:
        page.keyboard.up(key)
    after = state(page)
    REPORT.setdefault('walks', []).append({'from': before['position'], 'to': after['position'],
        'simulationSeconds': after['elapsed']-before['elapsed'], 'frameMs': after['rendering']['frameMs']})


def capture(page, name, zoom=1):
    phase(page, 'paused')
    page.evaluate('zoom=>nebeljagdInspectCamera({zoom})', zoom)
    path = OUT / f'{name}.png'
    path.write_bytes(base64.b64decode(page.evaluate('nebeljagdCaptureFrame()').split(',', 1)[1]))
    REPORT['screenshots'].append(str(path))


def quality(page, setting):
    phase(page, 'paused')
    page.locator('#qualityMode').select_option(setting)
    wait(page, 'q=>nebeljagdTestState().quality===q', setting, timeout=15000)
    page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')


def trees(page):
    return {t['id']: t for t in state(page)['world']['trees']}


try:
    testmap = fixture()
    with urlopen(URL + '/magebrawl.html', timeout=60) as response:
        assert response.status == 200
        digest = hashlib.sha256(response.read()).hexdigest()
    assert digest == hashlib.sha256((RELEASE / 'magebrawl.html').read_bytes()).hexdigest()
    release = json.loads((RELEASE / 'release.json').read_text())
    REPORT.update(gameSha256=digest, buildId=release['buildId'], sourceCommit=release['sourceCommit'])
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
            stage('load untouched legacy path parameters in a temporary valid map')
            page.goto(URL+'/magebrawl.html?mapSource=editor&inspect=1&quality=low', wait_until='domcontentloaded', timeout=120000)
            wait(page, 'window.nebeljagdInspect&&nebeljagdTestState().rendering.calls>0')
            REPORT['webglContext'] = page.evaluate('document.querySelector("#game").getContext("webgl2").getContextAttributes()')
            assert REPORT['webglContext']['stencil'] is True
            assert state(page)['world']['source'] == 'editor'
            assert state(page)['world']['objects'] == testmap['objects']
            page.locator('#startBtn').click()
            wait(page, 'nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0')

            stage('saved old paths gain themed borders, mixed clusters and single stones')
            border = state(page)['world']['stats']['terrainArt']['borderStones']
            assert border['style'] == 'broken-thematic-verges'
            assert {'cobble','earth','forest','sand','stone','mud','snow'}.issubset(border['byStyle'])
            assert all(border['byStyle'][g['type']]['count'] > 0 for g in REPORT['savedPathCopies'])
            painted_clusters = [cluster for cluster in border['clusters'] if cluster['contourId'].startswith('paint:')]
            assert all(any(cluster['style'] == group['type'] and cluster['count'] > 0 for cluster in painted_clusters)
                       for group in REPORT['savedPathCopies']), 'A saved paint style has no actual emitted cluster'
            REPORT['savedPathRenderedCounts'] = {group['type']: sum(cluster['count'] for cluster in painted_clusters
                if cluster['style'] == group['type']) for group in REPORT['savedPathCopies']}
            REPORT['savedPathRenderedCountsAreComplete'] = len(border['clusters']) == border['clusterCount']
            assert border['singletonCount'] > 0 and border['largestCluster'] >= 7
            histogram = border['clusterSizeHistogram']
            assert any(2 <= int(size) <= 3 and count > 0 for size, count in histogram.items())
            assert any(4 <= int(size) <= 6 and count > 0 for size, count in histogram.items())
            assert border['gapCount'] > 0 and any(g['length'] > 4 for g in border['gaps'])
            assert all(abs(p['x']) > 6.8 or abs(p['z']-26) > 6.8 for p in border['samples']), 'Natural soft patch received border stones'
            assert any(s['minWidth'] < s['maxWidth'] and s['shapeVariants'] > 1 for s in border['byStyle'].values())
            for name,x,z in [('saved-earth-forest',-24,-24),('saved-cobble',-36,24),('varied-stone-clusters',-10,48)]:
                move(page,x,z);capture(page,name)
            passed('All seven saved .55/1/radius2.5 path styles now have borders with singletons and small/large clusters', border)

            stage('real local canopy and tall-grass entry; subtle textured hiding indication')
            original = {k: t['appearance'] for k,t in trees(page).items()}
            tree = trees(page)['qa-local-tree']; crown = tree['canopy']['footprint']
            cx,cz = crown['center']; rx,rz = crown['radiusX'],crown['radiusZ']
            line_z = cz + (1 if cz >= tree['z'] else -1)*rz*.45
            move(page,cx-rx-3,line_z)
            wait(page, '!nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().world.trees.every(t=>t.canopy.opacity>.99)')
            capture(page,'outside-canopy-and-grass',1.5)
            walk(page,'KeyD','x=>nebeljagdTestState().position.x>=x',cx)
            wait(page, '''()=>{const s=nebeljagdTestState();return s.hiddenInGrass&&
              s.character.concealmentAppearance.blend>.99&&s.world.trees.find(t=>t.id==='qa-local-tree').canopy.opacity<.055}''')
            hidden = state(page); visual = hidden['character']['concealmentAppearance']; under = trees(page)
            assert hidden['hiddenFromOtherPlayers'] and hidden['concealment'] > .01
            assert visual['style'] == 'soft-textured-concealment-v2'
            assert visual['active'] and visual['localOnly'] and visual['color'] == '#cbd8d0'
            assert visual['outline'] == 'stencil-contour' and visual['outlineWidthPixels'] == 1.4
            assert .575 <= visual['bodyOpacity'] < .59 and .065 < visual['fillOpacity'] < .075
            assert .41 < visual['outlineOpacity'] < .43 and not visual['materialsRestored']
            assert .04 <= under['qa-local-tree']['canopy']['opacity'] < .055
            assert under['qa-other-tree']['canopy']['opacity'] > .99
            assert all(t['canopy']['barkOpacity'] == 1 for t in under.values())
            assert hidden['world']['stats']['canopyFade']['minimumOpacity'] == .045
            assert hidden['world']['stats']['canopyFade']['trunkMaterialsOpaque']
            capture(page,'softer-hidden-canopy-low',1.5)
            quality(page,'high');capture(page,'softer-hidden-canopy-high',1.5);quality(page,'low')
            walk(page,'KeyD','x=>nebeljagdTestState().position.x>=x',cx+rx+4)
            wait(page, '''()=>{const s=nebeljagdTestState();return !s.hiddenInGrass&&
              s.character.concealmentAppearance.materialsRestored&&s.world.trees.every(t=>t.canopy.opacity>.99)}''')
            restored = state(page)['character']['concealmentAppearance']
            assert restored['bodyOpacity'] == 1 and restored['fillOpacity'] == 0 and restored['outlineOpacity'] == 0
            capture(page,'restored-after-real-exit',1.5)
            passed('Only the local crown fades further; subtle textured hiding compiles in Low/High and restores after walking out',
                   {'under':{k:t['canopy'] for k,t in under.items()},'hidden':visual,'restored':restored})

            stage('restart while hidden restores canopy and original character materials')
            walk(page,'KeyA','x=>nebeljagdTestState().position.x<=x',cx)
            wait(page, 'nebeljagdTestState().hiddenInGrass&&nebeljagdTestState().character.concealmentAppearance.blend>.99')
            phase(page,'paused');page.locator('#restartBtn').click()
            wait(page, '''()=>{const s=nebeljagdTestState();return s.phase==='playing'&&!s.hiddenInGrass&&
              s.character.concealmentAppearance.materialsRestored&&s.world.trees.every(t=>t.canopy.opacity>.99)}''')
            assert {k:t['appearance'] for k,t in trees(page).items()} == original
            assert state(page)['world']['objects'] == testmap['objects']
            assert not REPORT['errors'], REPORT['errors']
            assert not REPORT['unexpectedRequests'], REPORT['unexpectedRequests']
            assert hashlib.sha256((ROOT/'worldmap.json').read_bytes()).hexdigest() == MAP_HASH
            passed('Active hiding resets cleanly; original map and objects remain unchanged; no shader/browser/network errors')
            REPORT.update(status='passed', mapSha256=MAP_HASH, browser=browser.version)
        except BaseException:
            if 'page' in locals() and not page.is_closed():
                try:
                    snapshot = page.wait_for_function('()=>nebeljagdTestState()', timeout=5000).json_value()
                    (OUT/'failure-state.json').write_text(json.dumps(snapshot,indent=2))
                except Exception:
                    pass
                try:
                    page.screenshot(path=str(OUT/'failure.png'),timeout=5000)
                except Exception:
                    pass
            raise
        finally:
            browser.close()
except BaseException as error:
    REPORT.update(status='failed', failure=str(error))
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
