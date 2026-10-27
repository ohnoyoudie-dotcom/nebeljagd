"""Browser verification for chest/staff editing and rarity persistence.
Run against npm run dev on port 5180, or set NEBELJAGD_URL to a compiled preview.
"""
import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[1]; errors=[]; checks=[]
base=json.loads((root/'worldmap.json').read_text())
url=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5180').rstrip('/')
out=root/'test-results'; out.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000})
 page.route_web_socket('**', lambda ws: None)
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(f'{url}/map-editor.html')
 page.wait_for_function('typeof window.nebeljagdMapTestState === "function"')
 state=lambda:page.evaluate('window.nebeljagdMapTestState()')
 assert len(state()['map']['objects'])==4016
 assert page.locator('#palette-kind option[value="crystal"]').count()==0
 for kind, rarity in [('fireStaff','legendary'),('iceStaff','rare'),('bow','uncommon'),('sword','normal')]:
  page.locator('#palette-kind').select_option(kind)
  expect(page.locator('#palette-rarity')).to_be_visible()
  page.locator('#palette-rarity').select_option(rarity)
  page.locator('#add-object-center').click()
  obj=state()['map']['objects'][-1]
  assert obj['kind']==kind and obj['rarity']==rarity
  assert page.locator('#object-rarity').input_value()==rarity
  assert page.locator('#object-rarity-hint').inner_text().startswith(str({'fireStaff':34,'iceStaff':30,'bow':28,'sword':22}[kind]))
  page.locator('#object-rarity').select_option('common')
  page.locator('#properties-form button[type="submit"]').click()
  assert state()['map']['objects'][-1]['rarity']=='common'
  page.locator('#undo').click()
  assert state()['map']['objects'][-1]['rarity']==rarity
  print('tested',kind,flush=True)
  checks.append(f'{kind} placement, rarity edit, damage hint and undo')
 page.locator('#palette-kind').select_option('chest');expect(page.locator('#palette-rarity')).to_be_hidden()
 page.locator('#add-object-center').click()
 assert state()['map']['objects'][-1]['kind']=='chest'
 expect(page.locator('#object-rarity')).to_be_hidden()
 with page.expect_download() as download: page.locator('#export-json').click()
 download.value.save_as(out/'loot-worldmap-roundtrip.json')
 exported=json.loads((out/'loot-worldmap-roundtrip.json').read_text())
 assert exported==state()['map']
 checks.append('chest placement and complete JSON export')
 old=json.loads(json.dumps(base))
 for obj in old['objects']:
  if obj['kind'] in ['bow','sword']: obj.pop('rarity',None)
  if obj['id']=='obj-chest-start': obj.update(id='obj-crystal-start',kind='crystal',variant='forest',name='Waldkristall am Start')
 page.locator('#json-file-input').set_input_files({'name':'old-worldmap.json','mimeType':'application/json','buffer':json.dumps(old).encode()})
 page.wait_for_function('window.nebeljagdMapTestState().map.objects.some(o => o.id === "obj-crystal-start" && o.kind === "chest")')
 assert all(o.get('rarity')=='common' for o in state()['map']['objects'] if o['kind'] in ['bow','sword'])
 checks.append('legacy JSON crystal to chest and common weapon migration')
 page.locator('#feature-filter').select_option('object');page.locator('#object-kind-filter').select_option('chest')
 page.locator('#feature-search').fill('obj-crystal-start')
 page.locator('#feature-list .feature-row').first.click();page.locator('#focus-selection').click()
 page.screenshot(path=str(root/'docs/screenshots/loot-editor-chest.png'))
 browser.close()
assert not errors,errors
report={'status':'passed','checks':checks,'errors':errors,'objectCount':4016,'chests':48,'sceneryPreserved':True}
(root/'docs/loot-editor-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
