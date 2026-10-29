from pathlib import Path
import json
import base64
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work-smoke'
OUT.mkdir(exist_ok=True)
report={'passed':False}
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' and 'favicon' not in m.text else None)
    page.goto('http://127.0.0.1:4174/nebeljagd.html?inspect=1&quality=low',wait_until='domcontentloaded',timeout=120000)
    page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0',timeout=120000)
    page.locator('#startBtn').click(force=True)
    page.wait_for_function('nebeljagdTestState().world.stats.meadowGround?.visibleInstances>2500',timeout=120000)
    page.wait_for_function('nebeljagdTestState().world.stats.meadowGround?.pendingChunks===0',timeout=120000)
    page.keyboard.down('w')
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.firstInteractorStrength>.55",timeout=120000)
    page.wait_for_timeout(320)
    state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      meadow:s.world.stats.meadowGround,editableGrass:s.world.stats.grassRendering,
      vision:s.vision,shadows:s.shadows,rendering:s.rendering,
      position:s.position,camera:s.camera,practice:s.practiceActors};}''')
    page.keyboard.up('w')
    assert state['meadow']['enabled'] is True
    assert state['meadow']['visibleInstances']>2500
    assert state['meadow']['cardsPerTuft']==3
    assert state['meadow']['lighting']=='color-preserving-unlit'
    assert state['meadow']['colorVariation']=='per-tuft-hsl'
    assert state['meadow']['detailLayer']=='global-large-solid-blades'
    assert state['meadow']['detailLayerTone']=='brighter-green'
    assert state['meadow']['layeredMeadow'] is True
    assert state['meadow']['visibleDetailInstances']>100
    assert state['meadow']['characterParting'] is True
    assert state['meadow']['interactorCount']>=2
    assert state['meadow']['interactionMode']=='forward-biased'
    assert abs(state['meadow']['forwardWeight']-.82)<.001
    assert state['meadow']['firstInteractorStrength']>.5
    assert state['meadow']['curvatureVariation']=='per-tuft'
    assert state['meadow']['windVariation']=='per-tuft-phase-speed-amplitude'
    assert state['meadow']['recoveryModel']=='variable-directional-wake'
    assert state['meadow']['biomeAdaptiveColor'] is True
    assert state['meadow']['snowTipCoating'] is True
    assert 'snow' in state['meadow']['biomeProfiles']
    assert state['editableGrass']['bendsAwayFromPlayer'] is True
    assert state['editableGrass']['wind']['interactors']>=2
    assert state['editableGrass']['wind']['interactionMode']=='forward-biased'
    assert state['editableGrass']['wind']['firstInteractorStrength']>.5
    assert state['editableGrass']['wind']['curvatureVariation']=='per-instance-grass'
    assert state['editableGrass']['wind']['windVariation']=='per-instance-phase-speed-amplitude'
    assert state['editableGrass']['wind']['recoveryModel']=='variable-directional-wake'
    assert state['camera']['orthographicHeight']<=21
    assert state['vision']['samples']==2048
    assert state['vision']['appearance']=='single-soft-edge'
    assert 1.2<=state['vision']['edgeFeatherMeters']<=1.6
    assert state['shadows']['type']=='VSM'
    assert state['shadows']['mapSize']==2048
    assert state['shadows']['normalBias']<=.015
    data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-meadow-vision.png').write_bytes(base64.b64decode(data.split(',',1)[1]))

    page.evaluate("nebeljagdInspect({x:-285,z:-400})")
    page.wait_for_function("nebeljagdTestState().world.biome==='snow'",timeout=120000)
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.visibleInstances>900",timeout=120000)
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.pendingChunks===0",timeout=120000)
    snow_state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      biome:s.world.biome, meadow:s.world.stats.meadowGround, position:s.position};}''')
    assert snow_state['biome']=='snow'
    assert snow_state['meadow']['visibleInstances']>900
    snow_data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-snow-grass.png').write_bytes(base64.b64decode(snow_data.split(',',1)[1]))

    report={'passed':not errors,'errors':errors,'state':state,'snowState':snow_state}
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,indent=2))
if not report['passed']:
    raise SystemExit(report)
