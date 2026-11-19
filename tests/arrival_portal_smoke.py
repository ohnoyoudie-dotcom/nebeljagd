"""Capture and verify the real arcane arrival effect in the generated game (serve dist/ on 5360)."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'test-results/arrival-portal';out.mkdir(parents=True,exist_ok=True)
url=os.environ.get('GAME_URL','http://127.0.0.1:5360/magebrawl.html?quality=low')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1280,'height':900});page.set_default_timeout(240000);errors=[]
 page.on('pageerror',lambda e:(errors.append(str(e)),print('ERROR',e,flush=True)))
 page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' and ('Shader' in msg.text or 'VALIDATE' in msg.text) else None)
 print('LOAD',flush=True);page.goto(url,wait_until='domcontentloaded',timeout=240000)
 page.wait_for_function('window.nebeljagdTestState && !document.querySelector("#startBtn").disabled')
 expected=json.loads((ROOT/'welt/release.json').read_text()) if '5360' in url else None
 if expected: assert page.evaluate('JSON.parse(document.querySelector("#editor-build-info").textContent).buildId')==expected['buildId']
 print('READY',flush=True);page.click('#startBtn');page.wait_for_selector('#arrivalMap',state='visible')
 r=page.locator('#arrivalMap').bounding_box();span=1440/(232/256)
 page.mouse.click(r['x']+r['width']*(.5-100/span),r['y']+r['height']*(.5+100/span))
 page.wait_for_function('nebeljagdTestState().arrival.stage === "teleport" && nebeljagdTestState().arrival.progress >= .18')
 page.keyboard.press('Escape');hold=page.evaluate('nebeljagdTestState()')
 assert hold['arrivalTeleport']['portalVisible'] and not hold['character']['visible']
 assert hold['arrivalTeleport']['width']>.95
 page.click('#resumeBtn')
 page.wait_for_function('nebeljagdTestState().arrival.stage === "teleport" && nebeljagdTestState().arrival.progress >= .55')
 page.keyboard.press('Escape');s=page.evaluate('nebeljagdTestState()');print('OPEN',json.dumps(s['arrivalTeleport']),flush=True)
 assert s['phase']=='paused' and s['arrivalTeleport']['portalVisible']
 assert s['arrivalTeleport']['style']=='arcane-portal' and s['character']['visible']
 assert s['character']['arrivalStep']['walking'] and -.9<s['character']['arrivalStep']['offsetZ']<-.05
 hidden=page.add_style_tag(content='#pauseScreen{visibility:hidden!important}')
 page.screenshot(path=str(out/'portal-open.png'));hidden.evaluate('(e)=>e.remove()')
 frozen=s['arrivalTeleport'];page.wait_for_timeout(200);assert page.evaluate('nebeljagdTestState().arrivalTeleport')==frozen
 page.click('#resumeBtn');page.wait_for_function('nebeljagdTestState().phase === "playing"')
 page.wait_for_function('nebeljagdTestState().elapsed > .8')
 s=page.evaluate('nebeljagdTestState()');assert not s['arrivalTeleport']['active'];assert s['character']['visible'];assert s['character']['arrivalStep']['offsetZ']==0;assert not errors,errors
 page.screenshot(path=str(out/'portal-finished.png'))
 info=page.evaluate('JSON.parse(document.querySelector("#editor-build-info")?.textContent || "null")')
 (out/'visual-report.json').write_text(json.dumps({'status':'passed','build':info,'errors':errors,'open':frozen,'final':s['arrivalTeleport']},indent=2));print('PASS',flush=True);b.close()
