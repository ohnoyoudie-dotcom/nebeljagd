"""A stale editor URL must open the current game and preserve its draft map."""
import json,os,subprocess
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
BASE=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:8770')
fixture=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {createLobbyMap} from './src/lobby-map.js';console.log(JSON.stringify(createLobbyMap()))"],cwd=ROOT))
fixture['objects']=[]
release=json.loads((ROOT/'welt/release.json').read_text())
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  context=browser.new_context(viewport={'width':1000,'height':760})
  context.add_init_script('localStorage.setItem("nebeljagd.worldmap.v1",'+json.dumps(json.dumps(fixture))+');')
  page=context.new_page();page.set_default_timeout(180000)
  page.goto(BASE+'/map-editor.html?v=b7796b1b6c1f48dbf2ac10301458206b83cfa32cb8998c8de1f359e4ff3a1dc0',wait_until='domcontentloaded')
  page.wait_for_function('window.nebeljagdMapTestState')
  draft=page.evaluate('nebeljagdMapTestState().map')
  with page.expect_popup() as opened:page.locator('#playtest-world').click()
  game=opened.value;game.set_default_timeout(180000)
  game.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
  assert parse_qs(urlsplit(game.url).query)['v']==[release['files']['magebrawl.html']['sha256']]
  assert game.evaluate('nebeljagdTestState().world.objects')==draft['objects']
  print('PASS: stale editor version replaced by current game hash; draft preserved')
 finally:browser.close()
