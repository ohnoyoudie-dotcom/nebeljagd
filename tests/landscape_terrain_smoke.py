"""Render terrain painting through the actual game JSON importer and saved session.
Run NEBELJAGD_URL=http://127.0.0.1:5199 python3 tests/landscape_terrain_smoke.py.
"""
import json, math, os
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
url=os.environ.get('NEBELJAGD_URL','http://127.0.0.1:5199').rstrip('/')
m=json.loads((root/'worldmap.json').read_text())
terrain=[]
for i,(kind,color,position,radius) in enumerate([('sand','#c9ad70',[25,-42],5),('cobble','#a0a38d',[35,-42],5),('snow','#dce7e8',[30,-34],3),('forest','#3c5741',[20,-31],4),('earth','#8b7757',[63,-1],10),('mud','#655c45',[300,300],8)]):
 terrain.append(dict(id=f'qa-ground-{i}',name=f'QA {kind}',type=kind,color=color,position=position,radius=radius,hardness=.3,strength=1,variation=.17,seed=19+i))
m['landscape']=dict(version=1,terrain=terrain,wind=dict(enabled=True,strength=.35,speed=1,direction=.65,gusts=True,gustStrength=.35,gustFrequency=.18,turbulence=.2),windZones=[],biomes=[],presets=[])
report={'status':'running','url':url,'errors':[],'checks':[],'hardwareNote':'Chromium SwiftShader on cloud CPU; these are functional and allocation measurements, not physical iPad FPS.'}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1200,'height':800});page.set_default_timeout(120000)
 page.on('pageerror',lambda e:report['errors'].append(str(e)))
 page.on('console',lambda msg:report['errors'].append(msg.text) if msg.type=='error' else None)
 page.goto(url+'/?quality=low&inspect=1',wait_until='domcontentloaded')
 page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
 old=page.evaluate('nebeljagdTestState().world.stats')
 assert old['terrainPaint']['stamps']==0
 with page.expect_navigation(wait_until='domcontentloaded'):
  page.locator('#worldMapFile').set_input_files({'name':'terrain-qa.json','mimeType':'application/json','buffer':json.dumps(m).encode()})
 page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().world.source==="import" && nebeljagdTestState().rendering.calls>0')
 page.locator('#startBtn').click()
 page.wait_for_function('nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0')
 s=page.evaluate('nebeljagdTestState().world.stats')
 assert s['terrainPaint']['stamps']==6,s
 assert s['terrainTriangles']==old['terrainTriangles']
 assert s['terrainPaint']['residentChunks']>0
 assert s['terrainPaint']['textureBytes']<=s['terrainPaint']['textureBudgetBytes']
 assert page.evaluate('nebeljagdTestState().world.objects')==m['objects']
 report['checks'].append({'name':'actual JSON import renders painted ground and preserves all existing world objects/triangles','stats':s['terrainPaint']})
 page.screenshot(path=str(root/'docs/screenshots/landscape-terrain-painted.png'))
 before=page.evaluate('nebeljagdTestState().elapsed')
 page.evaluate('nebeljagdInspect({x:300,z:300,health:100})')
 page.wait_for_function('t=>nebeljagdTestState().elapsed>t+.1 && nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0',arg=before)
 far=page.evaluate('nebeljagdTestState().world.stats.terrainPaint')
 assert far['textureBytes']<=far['textureBudgetBytes']
 assert far['residentChunks']==1
 assert far['textureBytes']<s['terrainPaint']['textureBytes']
 report['checks'].append({'name':'distant painted ground is loaded on arrival and old paint textures released','stats':far})
 before=page.evaluate('nebeljagdTestState().elapsed')
 page.evaluate('nebeljagdInspect({x:30,z:-42,health:100})')
 page.wait_for_function('t=>nebeljagdTestState().elapsed>t+.1 && nebeljagdTestState().world.stats.terrainPaint.queuedChunks===0',arg=before)
 page.reload(wait_until='domcontentloaded')
 page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().world.source==="import" && nebeljagdTestState().rendering.calls>0')
 assert page.evaluate('nebeljagdTestState().world.stats.terrainPaint.stamps')==6
 assert page.evaluate('nebeljagdTestState().world.objects')==m['objects']
 report['checks'].append({'name':'painted ground remains after game reload from saved import document','objects':len(m['objects'])})
 b.close()
assert not report['errors'],report['errors']
report['status']='passed'
(root/'docs/landscape-terrain-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
