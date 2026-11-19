"""Exercise map selection and teleport in the generated game. Serve dist/ on 5360 first.
Override GAME_URL for a dev or published build; artifacts stay in test-results/map-start.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/map-start'
URL = os.environ.get('GAME_URL', 'http://127.0.0.1:5360/magebrawl.html')
REPORT = {'checks': [], 'errors': [], 'url': URL}
OUT.mkdir(parents=True, exist_ok=True)

def record(name):
    REPORT['checks'].append(name)
    print('PASS', name, flush=True)

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=[
            '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle',
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width':1440,'height':1000}, has_touch=True)
        page = context.new_page(); page.set_default_timeout(240000)
        page.on('pageerror', lambda e: REPORT['errors'].append(str(e)))
        page.goto(URL, wait_until='domcontentloaded', timeout=240000)
        page.wait_for_function('window.nebeljagdTestState && !document.querySelector("#startBtn").disabled')
        state = lambda: page.evaluate('nebeljagdTestState()')
        REPORT['build'] = page.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent || "null")')
        if '127.0.0.1:5360' in URL:
            assert REPORT['build']['buildId'] == json.loads((ROOT/'dist/release.json').read_text())['buildId']
        def choose(x,z,touch=False):
            rect=page.locator('#arrivalMap').bounding_box()
            bounds=state()['world']['bounds']; span=max(bounds['maxX']-bounds['minX'],bounds['maxZ']-bounds['minZ'])/(232/256)
            px=rect['x']+rect['width']*(.5+(x-(bounds['minX']+bounds['maxX'])/2)/span)
            py=rect['y']+rect['height']*(.5+(z-(bounds['minZ']+bounds['maxZ'])/2)/span)
            (page.touchscreen.tap if touch else page.mouse.click)(px,py)
        page.click('#startBtn')
        page.wait_for_function('nebeljagdTestState().arrival.stage === "select"')
        assert state()['arrival']['height']==0 and state()['elapsed']==0
        assert page.locator('#confirmLanding').count()==0
        original=state()['arrival']['target']
        choose(590,-700)
        assert state()['arrival']['target']==original
        assert page.locator('#arrivalHint').get_attribute('data-invalid')=='true'
        record('invalid sea choice keeps the valid fallback; no extra confirm button')
        choose(-100,100)
        selected=state()['arrival']['target']; assert abs(selected['x']+100)<2 and abs(selected['z']-100)<2
        page.screenshot(path=str(OUT/'desktop-selection.png'))
        page.click('#arrivalPauseBtn')
        frozen=state()['arrival'];page.wait_for_timeout(400);assert state()['arrival']==frozen
        assert state()['elapsed']==0;record('mouse selection and pause freeze both arrival and match clock')
        page.click('#resumeBtn')
        page.wait_for_function('nebeljagdTestState().arrival.stage === "reveal"')
        choose(0,0)
        assert state()['arrival']['target']==selected
        record('selection locks before materialization')
        page.wait_for_function('nebeljagdTestState().arrival.stage === "teleport"')
        page.screenshot(path=str(OUT/'teleport.png'))
        page.wait_for_function('nebeljagdTestState().phase === "playing"')
        assert abs(state()['position']['x']-selected['x'])<.1
        assert abs(state()['position']['z']-selected['z'])<.1
        page.wait_for_function('nebeljagdTestState().elapsed > 1')
        assert not state()['arrivalTeleport']['active'] and state()['character']['visible']
        page.screenshot(path=str(OUT/'landed.png'))
        record('original avatar appears at selected point and anchored effect fades completely')
        for name,width,height in [('tablet',1024,768),('phone',390,844),('landscape',844,390)]:
            page.keyboard.press('Escape');page.set_viewport_size({'width':width,'height':height});page.click('#restartBtn')
            page.wait_for_function('nebeljagdTestState().arrival.stage === "select"')
            rect=page.locator('#arrivalMap').bounding_box()
            assert rect['x']>=0 and rect['y']>=0 and rect['x']+rect['width']<=width+1 and rect['y']+rect['height']<=height+1
            assert abs(rect['width']-rect['height'])<2
            choose(-100,100,touch=True)
            assert abs(state()['arrival']['target']['x']+100)<2
            page.screenshot(path=str(OUT/f'{name}-selection.png'))
            page.wait_for_function('nebeljagdTestState().phase === "playing"')
            record(f'{name}: visible square map, touch target, automatic teleport and restart')
        page.keyboard.down('KeyW');page.wait_for_function('nebeljagdTestState().distance > 1');page.keyboard.up('KeyW')
        record('movement works after teleport')
        REPORT['finalState']=state()
        assert not REPORT['errors'], REPORT['errors']
        REPORT['status']='passed';browser.close()

try:
    run()
except Exception as error:
    REPORT['status']='failed';REPORT['failure']=str(error)
    raise
finally:
    (OUT/'report.json').write_text(json.dumps(REPORT,indent=2))
