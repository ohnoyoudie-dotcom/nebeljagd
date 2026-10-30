"""Check that the review page renders the same uploaded avatar as the game."""
import json, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results/avatar-preview'
OUT.mkdir(parents=True,exist_ok=True)
base=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:4174').rstrip('/')
report={'url':base+'/avatar-preview.html','checks':[],'errors':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':1280,'height':900})
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.set_default_timeout(90000)
    page.route_web_socket('**',lambda ws:None)
    page.goto(report['url'],wait_until='domcontentloaded')
    page.wait_for_function('window.nebeljagdAvatarPreviewState && nebeljagdAvatarPreviewState().loaded')
    state=page.evaluate('nebeljagdAvatarPreviewState()')
    assert state['source'].endswith('nebeljagd_player_base_v1.glb')
    assert state['stats']['triangles']==20161
    assert state['stats']['joints']==66
    assert state['stats']['geometryPreparation']['repairedVertices']==4
    assert abs(state['stats']['height']-1.82)<.001
    assert len(state['stats']['animations'])==4
    report['checks'].append({'name':'Actual textured Tripo asset loads at normalized human height','state':state})
    page.locator('#play-pause').click()
    page.locator('[data-view="front"]').click()
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/'front.png'))
    page.locator('[data-view="game"]').click()
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/'game.png'))
    for role in ('run','roll'):
        page.locator('[data-clip="'+role+'"]').click()
        page.wait_for_function('(role)=>nebeljagdAvatarPreviewState().role===role && nebeljagdAvatarPreviewState().time>.1',arg=role)
        page.locator('#play-pause').click()
        state=page.evaluate('nebeljagdAvatarPreviewState()')
        t=state['time'];page.wait_for_timeout(250)
        assert page.evaluate('nebeljagdAvatarPreviewState().time')==t
        page.locator('#animation-time').evaluate('(el)=>{el.value=Number(el.max)*.5;el.dispatchEvent(new Event("input",{bubbles:true}));}')
        state=page.evaluate('nebeljagdAvatarPreviewState()')
        assert abs(state['time']-state['duration']*.5)<.002
        assert state['playing']==False
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT/(role+'.png')))
        report['checks'].append({'name':role+' clip selection, pause and time scrub','state':state})
    page.locator('#playback-speed').select_option('0.25')
    page.locator('#replay').click()
    page.wait_for_timeout(250)
    assert page.evaluate('nebeljagdAvatarPreviewState().speed')==.25
    assert page.evaluate('nebeljagdAvatarPreviewState().playing')
    report['checks'].append({'name':'Replay and quarter speed'})
    page.set_viewport_size({'width':390,'height':844})
    page.locator('[data-clip="idle"]').click()
    page.wait_for_timeout(500)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert page.locator('#play-pause').is_visible()
    assert page.locator('#animation-time').is_visible()
    page.screenshot(path=str(OUT/'mobile.png'),full_page=True)
    report['checks'].append({'name':'390px mobile layout and controls'})
    browser.close()
report['status']='passed' if not report['errors'] else 'failed'
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'status':report['status'],'checks':len(report['checks']),'errors':report['errors']}))
assert not report['errors'],report['errors']
