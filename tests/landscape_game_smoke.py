"""Real game import/render checks for shared landscape data and GPU vegetation.

Run NEBELJAGD_URL=http://127.0.0.1:4174 python3 tests/landscape_game_smoke.py.
Uses the ordinary 'Eigene Karte laden' file input and the existing explicit
inspect=1 camera/player positioning helper. Does not mutate simulation settings.
"""
from __future__ import annotations
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
GAME_PATH=os.environ.get('NEBELJAGD_GAME_PATH','/nebeljagd.html')
contract=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {VEGETATION_TYPES,WIND_DEFAULTS} from './src/map/landscape.js';console.log(JSON.stringify({types:VEGETATION_TYPES,wind:WIND_DEFAULTS}));"],cwd=ROOT))
TYPES={item['id']:item for item in contract['types']}
BASE=json.loads((ROOT/'worldmap.json').read_text())
BASE['gameplay']['spawnPosition']=[-50,16]
BASE['objects']=[]
BASE['landscape']={'version':1,'terrain':[],'wind':{**contract['wind'],'strength':.7,'direction':math.pi/2,'speed':1.3},'windZones':[
    {'id':'qa-shelter','name':'QA Windschutz','position':[-64,30],'radius':4,'falloff':.5,'strength':0,'direction':0},
    {'id':'qa-local-wind','name':'QA Südwind','position':[-58,20],'radius':4,'falloff':.6,'strength':.9,'direction':math.pi},
],'biomes':[],'presets':[]}

def grass(identifier,kind,x,z,**settings):
    data={'id':identifier,'name':identifier,'kind':'grass','variant':TYPES[kind]['variant'],'position':[x,z],
          'rotation':.24,'scale':1,'radius':2,'vegetation':{**TYPES[kind]['settings'],**settings,'seed':1249}}
    BASE['objects'].append(data)

grass('qa-low-short','short',-70,20,height=.25,heightVariation=0)
grass('qa-high-tall','tall',-64,20,height=3,heightVariation=.5)
grass('qa-dense','meadow',-58,20,heightVariation=0,density=1)
grass('qa-sparse','meadow',-52,20,heightVariation=0,density=.25)
grass('qa-empty','tall',-46,20,density=0)
grass('qa-dry','dry',-70,30)
grass('qa-forest','forest',-64,30)
grass('qa-swamp','swamp',-58,30)
grass('qa-flowers','flowers',-52,30)
grass('qa-ground','meadow',-45,30,color='#668f48',groundColor=True,groundBlend=1,colorVariation=0)
grass('qa-manual','meadow',-38,30,color='#668f48',groundColor=False,colorVariation=0)
BASE['objects'].extend([
    {'id':'qa-legacy','name':'QA Altes Gras','kind':'grass','variant':'tall','position':[-76,20],'rotation':0,'scale':1,'radius':2},
    {'id':'qa-tree','name':'QA Laubbaum','kind':'tree','variant':'rei-tree01','position':[-77,33],'rotation':.7,'scale':1},
    {'id':'qa-bush','name':'QA Strauch','kind':'bush','variant':'rei-bush','position':[-73,37],'rotation':.3,'scale':1},
])
for n,point in enumerate([[-45,30],[-38,30]]):
    BASE['landscape']['terrain'].append({'id':f'qa-soil-{n}','name':'QA Farbfläche','type':'sand','position':point,'radius':4,
                                       'hardness':.8,'strength':1,'color':'#d2ae65','variation':.12,'seed':7})
REPORT={'status':'running','url':URL,'checks':[],'errors':[],'captures':[],
        'note':'Software WebGL2 in Chromium; low/high rendering and budgets checked, not physical iPad FPS.'}


def monitor(page):
    page.route_web_socket('**',lambda ws:None)
    page.on('pageerror',lambda e:REPORT['errors'].append(str(e)))
    page.on('console',lambda m:REPORT['errors'].append(m.text) if m.type=='error' else None)


def passed(name,evidence=None):
    REPORT['checks'].append({'name':name,'evidence':evidence});print('PASS',name,flush=True)


def state(page):
    return page.evaluate('''()=>{const s=nebeljagdTestState();return {phase:s.phase,quality:s.quality,
      landscape:s.world.landscape,objects:s.world.objects,stats:s.world.stats,patches:s.world.grassPatches,
      rendering:s.rendering,hidden:s.hiddenInGrass,source:s.world.source,ground:s.world.groundHeight};}''')


def ready(page):
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0',timeout=120000)
    expect(page.locator('#startBtn')).to_be_enabled(timeout=120000)


def import_map(page,data):
    page.locator('#worldMapFile').set_input_files({'name':'landscape-runtime.json','mimeType':'application/json','buffer':json.dumps(data).encode()})
    page.wait_for_url('**mapSource=import*',timeout=120000)
    page.wait_for_load_state('domcontentloaded');ready(page)
    page.wait_for_function('nebeljagdTestState().world.source==="import"')


def position(page,x=-55,z=24):
    page.locator('#startBtn').click()
    page.evaluate('p=>nebeljagdInspect({x:p[0],z:p[1],health:100,direction:Math.PI})',[x,z])
    t=page.evaluate('nebeljagdTestState().elapsed')
    page.wait_for_function('t=>nebeljagdTestState().elapsed>t+.4',arg=t)
    page.wait_for_function('!nebeljagdTestState().world.stats.terrainPaint.queuedChunks')


def patch(s,identifier):
    return next(item for item in s['patches'] if item['id']==identifier)


try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        captures=[]
        for quality in ['low','high']:
            page=browser.new_page(viewport={'width':1280,'height':850});page.set_default_timeout(120000);monitor(page)
            response=page.goto(URL+GAME_PATH+'?inspect=1&quality='+quality,wait_until='domcontentloaded')
            REPORT['served_game_sha256']=hashlib.sha256(response.body()).hexdigest();ready(page)
            import_map(page,BASE);position(page)
            s=state(page)
            assert s['source']=='import' and s['objects']==BASE['objects'] and s['landscape']==BASE['landscape']
            assert s['stats']['loadedGLBs']==5
            assert {item['type'] for item in s['patches']}==set(TYPES)
            assert patch(s,'qa-dense')['instanceCount']==80
            assert patch(s,'qa-sparse')['instanceCount']==20
            assert patch(s,'qa-empty')['instanceCount']==0
            assert patch(s,'qa-low-short')['minBladeHeight']==patch(s,'qa-low-short')['maxBladeHeight']==.08
            assert 3.6375<=patch(s,'qa-high-tall')['minBladeHeight']<patch(s,'qa-high-tall')['maxBladeHeight']<=10.9125
            assert patch(s,'qa-legacy')['settings'] is None
            assert 2.25<=patch(s,'qa-legacy')['minBladeHeight']<patch(s,'qa-legacy')['maxBladeHeight']<=2.6
            assert all(item['rootAnchored'] for item in s['patches'])
            for item in s['patches']:
                for sample in item['colorSamples']:
                    assert item['rootHeightRange'][0]<=sample['rootY']<=item['rootHeightRange'][1]
            rendering=s['stats']['grassRendering'];wind=rendering['wind'];paint=s['stats']['terrainPaint']
            assert wind['gpu'] and wind['rootAnchored'] and wind['worldSpaceDirection'] and wind['zones']==2
            assert wind['settings']==BASE['landscape']['wind'] and wind['time']>0
            assert paint['stamps']==2 and paint['affectedChunks']>0 and paint['residentChunks']>0
            assert paint['extraDrawCalls']==0 and not paint['changesCollisionHeight']
            assert 0<paint['textureBytes']<=paint['textureBudgetBytes']
            assert rendering['totalInstances']<=500000
            path=ROOT/f'docs/screenshots/landscape-game-{quality}.png';page.screenshot(path=str(path))
            REPORT['captures'].append(str(path.relative_to(ROOT)))
            passed(f'{quality}: imported settings render all grass types, exact density, varied heights, anchored roots and bounded painted terrain',{
                'quality':quality,'denseCount':patch(s,'qa-dense')['instanceCount'],'sparseCount':patch(s,'qa-sparse')['instanceCount'],
                'lowHeight':patch(s,'qa-low-short')['maxBladeHeight'],'highRange':[patch(s,'qa-high-tall')['minBladeHeight'],patch(s,'qa-high-tall')['maxBladeHeight']],
                'wind':wind,'paint':paint,'rendering':s['rendering']})
            captures.append(s)
            if quality=='low':
                page.evaluate('nebeljagdInspect({x:-46,z:20,health:100})')
                page.wait_for_function('!nebeljagdTestState().hiddenInGrass')
                passed('A zero-density grass patch does not create invisible cover')
                # Reimport the same geometry with new soil colors and disabled wind.
                updated=copy.deepcopy(BASE)
                for soil in updated['landscape']['terrain']:soil['color']='#4f394a'
                updated['landscape']['wind']['enabled']=False
                # Pause shows ordinary file import controls without touching state.
                page.keyboard.press('Escape')
                with page.expect_navigation(wait_until='domcontentloaded',timeout=120000):
                    page.locator('#worldMapFile').set_input_files({'name':'updated-ground.json','mimeType':'application/json','buffer':json.dumps(updated).encode()})
                ready(page);position(page);changed=state(page)
                assert patch(changed,'qa-ground')['colorSamples'][0]['ground']!=patch(s,'qa-ground')['colorSamples'][0]['ground']
                assert patch(changed,'qa-ground')['colorSamples'][0]['vegetation']!=patch(s,'qa-ground')['colorSamples'][0]['vegetation']
                assert patch(changed,'qa-manual')['colorSamples'][0]['vegetation']==patch(s,'qa-manual')['colorSamples'][0]['vegetation']
                assert not changed['stats']['grassRendering']['wind']['settings']['enabled']
                assert changed['ground']==s['ground']
                passed('Changing saved soil automatically retints ground-matched grass, preserves manual grass colors and leaves collision height unchanged',{
                    'matchedBefore':patch(s,'qa-ground')['colorSamples'][0],'matchedAfter':patch(changed,'qa-ground')['colorSamples'][0],
                    'manualBefore':patch(s,'qa-manual')['colorSamples'][0]['vegetation'],'manualAfter':patch(changed,'qa-manual')['colorSamples'][0]['vegetation'],
                    'windDisabled':True})
            page.close()
        assert captures[0]['patches']==captures[1]['patches'], 'Quality levels changed saved vegetation density, height or colors.'
        assert captures[0]['stats']['grassRendering']['tallGrassTriangles']<captures[1]['stats']['grassRendering']['tallGrassTriangles']
        passed('Low detail keeps identical cover/density/color but uses fewer visible tall-grass triangles',{
            'low':captures[0]['stats']['grassRendering']['tallGrassTriangles'],'high':captures[1]['stats']['grassRendering']['tallGrassTriangles']})
        browser.close()
    assert not REPORT['errors'],REPORT['errors'];REPORT['status']='passed'
except BaseException as error:
    REPORT['status']='failed';REPORT['failure']=str(error);raise
finally:
    (ROOT/'docs/landscape-game-check.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':REPORT['status'],'checks':len(REPORT['checks']),'errors':REPORT['errors'],'failure':REPORT.get('failure')},ensure_ascii=False),flush=True)
