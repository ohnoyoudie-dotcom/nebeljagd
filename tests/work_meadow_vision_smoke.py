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
    state=page.evaluate('''()=>{const s=nebeljagdTestState();return {
      meadow:s.world.stats.meadowGround,vision:s.vision,shadows:s.shadows,rendering:s.rendering,
      position:s.position};}''')
    assert state['meadow']['enabled'] is True
    assert state['meadow']['visibleInstances']>2500
    assert state['meadow']['cardsPerTuft']==3
    assert state['meadow']['lighting']=='color-preserving-unlit'
    assert state['vision']['samples']==1024
    assert state['shadows']['type']=='VSM'
    assert state['shadows']['mapSize']==2048
    assert state['shadows']['normalBias']<=.015
    data=page.evaluate('nebeljagdCaptureFrame()')
    (OUT/'work-meadow-vision.png').write_bytes(base64.b64decode(data.split(',',1)[1]))
    report={'passed':not errors,'errors':errors,'state':state}
    browser.close()
(OUT/'report.json').write_text(json.dumps(report,indent=2))
if not report['passed']:
    raise SystemExit(report)
