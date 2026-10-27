"""Focused responsive UI check against Vite, independent from 3D construction."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.getenv('NEBELJAGD_URL', 'http://127.0.0.1:5173').rstrip('/')
errors, checks = [], []
html = '''<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="background:#66876d"><div id="ui"></div><script type="module">
import '/src/style.css';
import {createUI} from '/src/ui.js';
const map = await (await fetch('/worldmap.json')).json();
const ui = createUI({onStart(){},onPause(){},onResume(){},onRestart(){},onDash(){},onAttack(){},onInteract(){}});
ui.setWorldmap(map); ui.setPhase('playing');
const state={phase:'playing',health:72,maxHealth:100,gold:17,zoneRadius:800,zoneCenter:{x:0,z:0},player:{x:30,z:-42,direction:Math.PI/2},visibleMapObjects:[{id:'visible-chest',kind:'chest',x:32,z:-40},{id:'visible-staff',kind:'iceStaff',x:23,z:-35,color:'#5aa5ff'}],pickups:[{id:'visible-heart',type:'heart',x:38,z:-42,collected:false},{id:'collected',type:'gold',x:30,z:-40,collected:true}]};
ui.update(state);window.minimapHarness={ui,state};
</script></body></html>'''
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True)
    for width,height,touch in [(1366,900,False),(1024,768,True),(768,1024,True),(390,844,True),(350,760,True),(844,390,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=touch,has_touch=touch,device_scale_factor=2 if touch else 1)
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.route(URL+'/minimap-harness',lambda route:route.fulfill(status=200,content_type='text/html',body=html))
        page.goto(URL+'/minimap-harness')
        page.wait_for_function('window.minimapHarness')
        info=page.evaluate('minimapHarness.ui.inspectMinimap()')
        assert info['mode']=='local' and info['spanMeters']==160,info
        assert info['player']['x']==128 and info['player']['y']==128
        assert abs(info['player']['direction']-1.5707963267948966)<1e-9
        assert {item['id'] for item in info['markers']}=={'visible-chest','visible-staff','visible-heart'}
        assert info['canvasPixels']==512 and info['displayWidth'] >= 136,info
        bounds=page.evaluate('''() => Object.fromEntries(['.map-panel','.zone-panel','.player-panel','.weapon-status','.top-tools'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}]}))''')
        box=bounds['.map-panel']
        assert box['x']>=0 and box['right']<=width and box['y']>=0 and box['bottom']<=height,(width,height,bounds)
        def overlap(a,b): return min(a['right'],b['right'])>max(a['x'],b['x']) and min(a['bottom'],b['bottom'])>max(a['y'],b['y'])
        for selector,other in bounds.items():
            if selector!='.map-panel': assert not overlap(box,other),(width,height,selector,bounds)
        page.locator('#mapMode-island').click()
        island=page.evaluate('minimapHarness.ui.inspectMinimap()')
        assert island['mode']=='island' and island['spanMeters']>=1200
        assert island['markers']==[], 'Island overview must not reveal dynamic loot.'
        assert page.locator('#mapMode-island').get_attribute('aria-pressed')=='true'
        page.locator('#mapMode-local').click()
        assert page.evaluate('minimapHarness.ui.inspectMinimap().mode')=='local'
        page.screenshot(path=str(ROOT/f'docs/screenshots/minimap-{width}x{height}.png'))
        checks.append({'viewport':[width,height],'touch':touch,'canvasWidth':info['displayWidth'],'markers':len(info['markers']),'panelsDoNotOverlap':True,'toggle':'passed'})
        context.close()
    browser.close()
assert not errors,errors
report={'status':'passed','checks':checks,'errors':errors,'note':'Focused UI rendering against Vite; final production game checked separately.'}
(ROOT/'docs/minimap-ui-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
