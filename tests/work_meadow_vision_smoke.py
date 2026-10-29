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
    assert state['meadow']['detailLayerTone']=='fixed-light-biome-materials'
    assert state['meadow']['biomeLayerControls']=='independent-density-height-color'
    assert state['meadow']['baseLayerBiomeTint']=='preserved-instance-color'
    assert state['meadow']['snowBaseLayer']=='disabled'
    assert state['meadow']['snowDetailStyle']=='sparse-dark-winter-tufts'
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
    assert state['meadow']['snowTipCoating'] is False
    assert 'snow' in state['meadow']['biomeProfiles']
    assert 'dunes' in state['meadow']['biomeProfiles']
    assert 'volcanic' in state['meadow']['biomeProfiles']
    assert state['editableGrass']['bendsAwayFromPlayer'] is True
    assert state['editableGrass']['biomeAdaptiveLegacyGrass'] is True
    assert state['editableGrass']['legacyBiomeAdaptedPatches']>=700
    assert state['editableGrass']['legacySuppressedGrassInstances']>1000
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
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.pendingChunks===0",timeout=120000)
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.visibleDetailInstances>5",timeout=120000)
    snow_state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      biome:s.world.biome, meadow:s.world.stats.meadowGround, position:s.position,
      terrainPaint:s.world.stats.terrainPaint, snowCover:s.world.stats.snowCover, footprints:s.snowFootprints, character:s.character, elapsed:s.elapsed};}''')
    assert snow_state['biome']=='snow'
    assert snow_state['meadow']['visibleInstances'] < state['meadow']['visibleInstances']*.08
    assert snow_state['meadow']['visibleDetailInstances']>5
    assert snow_state['meadow']['visibleDetailInstances'] < state['meadow']['visibleDetailInstances']*.35
    assert snow_state['terrainPaint']['snowRelief'] is True
    assert snow_state['terrainPaint']['snowMaskResidentChunks']>0
    assert 0.14<=snow_state['terrainPaint']['snowVisualDepthMeters']<=0.17
    assert snow_state['snowCover']['enabled'] is True
    assert snow_state['snowCover']['depthWriting'] is True
    assert snow_state['snowCover']['collisionIndependent'] is True
    assert snow_state['snowCover']['visibleInstances']>0
    assert 0.17<=snow_state['snowCover']['nominalSurfaceDepthMeters']<=0.21
    assert snow_state['snowCover']['multiScaleSurface'] is True
    assert snow_state['snowCover']['windShading'] is True
    assert snow_state['snowCover']['layerStyle']=='overlapping-irregular-powder-with-wind-drifts'
    assert snow_state['snowCover']['broadDriftAmplitudeMeters']>snow_state['snowCover']['fineDriftAmplitudeMeters']
    page.keyboard.down('w')
    page.wait_for_function("nebeljagdTestState().snowFootprints.count>0",timeout=120000)
    page.wait_for_function("nebeljagdTestState().character.snowSinkMeters>.17",timeout=10000)
    page.wait_for_function("nebeljagdTestState().character.snowClipStrength>.5",timeout=10000)
    page.wait_for_function("nebeljagdTestState().snowFootprints.wadingMounds===1",timeout=10000)
    moving_track_state=page.evaluate("nebeljagdTestState().snowFootprints")
    page.keyboard.up('w')
    page.wait_for_function("nebeljagdTestState().snowFootprints.wadingMounds===0",timeout=10000)
    track_state=page.evaluate("nebeljagdTestState().snowFootprints")
    snow_character=page.evaluate("nebeljagdTestState().character")
    assert track_state['singleInstancedDraw'] is True
    assert track_state['alignedToVisualSnowSurface'] is True
    assert track_state['fadeStartSeconds']==6
    assert track_state['lifetimeSeconds']==10
    assert track_state['trackColor']=='#dbe5e7'
    assert moving_track_state['wadingMounds']==1
    assert moving_track_state['wadingStyle']=='single-forward-ridge-only-while-moving'
    assert track_state['wadingMounds']==0
    assert track_state['recommendedVisualSinkMeters']==.22
    assert snow_character['snowWeight']>.6
    assert snow_character['snowSinkMeters']>.17
    assert snow_character['snowClipStrength']>.5
    snow_data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-snow-grass.png').write_bytes(base64.b64decode(snow_data.split(',',1)[1]))
    elapsed_now=page.evaluate("nebeljagdTestState().elapsed")
    page.evaluate("(t)=>nebeljagdInspect({x:-285,z:-400,elapsed:t+10.5})",elapsed_now)
    page.wait_for_function("nebeljagdTestState().snowFootprints.count===0",timeout=10000)

    page.evaluate("nebeljagdInspect({x:300,z:-310})")
    page.wait_for_function("nebeljagdTestState().world.biome==='heath'",timeout=120000)
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.pendingChunks===0",timeout=120000)
    heath_state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      biome:s.world.biome, meadow:s.world.stats.meadowGround, position:s.position};}''')
    assert heath_state['meadow']['visibleInstances']>snow_state['meadow']['visibleInstances']
    assert heath_state['meadow']['visibleDetailInstances']>snow_state['meadow']['visibleDetailInstances']
    heath_data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-heath-grass.png').write_bytes(base64.b64decode(heath_data.split(',',1)[1]))

    page.evaluate("nebeljagdInspect({x:-310,z:425})")
    page.wait_for_function("nebeljagdTestState().world.biome==='marsh'",timeout=120000)
    page.wait_for_function("nebeljagdTestState().world.stats.meadowGround?.pendingChunks===0",timeout=120000)
    marsh_state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      biome:s.world.biome, meadow:s.world.stats.meadowGround, position:s.position};}''')
    assert marsh_state['meadow']['visibleInstances']>snow_state['meadow']['visibleInstances']
    assert marsh_state['meadow']['visibleDetailInstances']>snow_state['meadow']['visibleDetailInstances']
    marsh_data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-marsh-grass.png').write_bytes(base64.b64decode(marsh_data.split(',',1)[1]))

    editor=browser.new_page(viewport={'width':1440,'height':900})
    editor.add_init_script("""
      window.__mapSavePickerCalls=0;
      window.__mapSaveWrites=[];
      window.showSaveFilePicker=async()=>{
        window.__mapSavePickerCalls++;
        return {
          name:'worldmap.json',
          queryPermission:async()=> 'granted',
          requestPermission:async()=> 'granted',
          createWritable:async()=>({
            write:async value=>window.__mapSaveWrites.push(String(value)),
            close:async()=>{}
          })
        };
      };
    """)
    editor_errors=[]
    editor.on('pageerror',lambda e:editor_errors.append(str(e)))
    editor.on('console',lambda m:editor_errors.append(m.text) if m.type=='error' and 'favicon' not in m.text else None)
    editor.goto('http://127.0.0.1:4174/map-editor.html',wait_until='domcontentloaded',timeout=120000)
    editor.wait_for_selector('[data-biome-choice="meadow"]',timeout=120000)
    editor.wait_for_selector('#biome-softness',timeout=120000)
    assert editor.locator('[data-biome-choice]').count()>=5
    assert editor.locator('#biome-softness').input_value()=='65'
    assert editor.locator('#landscape-section-biomes').evaluate('(e)=>e.open') is True
    assert editor.locator('details.landscape-section[open]').count()==1
    editor.locator('[data-biome-choice="snow"]').click()
    assert editor.locator('#biome-preset').input_value()=='snow'
    assert editor.locator('[data-biome-choice="snow"]').get_attribute('aria-pressed')=='true'
    assert 'Boden und Gras' in editor.locator('.biome-intro').inner_text()
    assert 'worldmap.json speichern' in editor.locator('#export-json').inner_text()
    editor.locator('#export-json').click()
    editor.wait_for_function("window.__mapSaveWrites.length===1",timeout=10000)
    editor.locator('#export-json').click()
    editor.wait_for_function("window.__mapSaveWrites.length===2",timeout=10000)
    editor.keyboard.press('Control+s')
    editor.wait_for_function("window.__mapSaveWrites.length===3",timeout=10000)
    file_save=editor.evaluate("()=>({pickerCalls:window.__mapSavePickerCalls,writes:window.__mapSaveWrites.length,state:nebeljagdMapTestState().fileSave,status:document.querySelector('#save-status').textContent})")
    assert file_save['pickerCalls']==1
    assert file_save['writes']==3
    assert file_save['state']['directSupported'] is True
    assert file_save['state']['connectedFile']=='worldmap.json'
    assert 'Gespeichert' in file_save['status']
    report={'passed':not errors and not editor_errors,'errors':errors+editor_errors,'state':state,
      'snowState':snow_state,'snowTracks':track_state,'heathState':heath_state,'marshState':marsh_state,
      'editor':{'biomeChoices':editor.locator('[data-biome-choice]').count(),'fileSave':file_save}}
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,indent=2))
if not report['passed']:
    raise SystemExit(report)
