"""Load the actual island game, inspect its map and exercise ordinary movement.

NEBELJAGD_URL=http://127.0.0.1:5207 NEBELJAGD_STANDALONE=1 python tests/island_runtime_smoke.py
Only normal game buttons/keys are used; telemetry remains read-only.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5193').rstrip('/')
STANDALONE = os.environ.get('NEBELJAGD_STANDALONE') == '1'
SOURCE = json.loads((ROOT / 'worldmap.json').read_text())
SOURCE_HASH = hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
OUT = ROOT / 'test-results/island-runtime'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {'status': 'running', 'url': URL, 'standalone': STANDALONE,
          'sourceSha256': SOURCE_HASH, 'checks': [], 'errors': [], 'screenshots': [],
          'limits': 'Chromium/SwiftShader game loading, read-only telemetry, normal keyboard movement and island minimap; no physical-device performance claim.'}
if STANDALONE:
    payload = (ROOT / 'welt/nebeljagd.html').read_bytes()
    REPORT['delivery'] = {'file': 'welt/nebeljagd.html', 'bytes': len(payload),
                          'sha256': hashlib.sha256(payload).hexdigest(), 'unexpectedRequests': []}


def passed(name, evidence):
    REPORT['checks'].append({'name': name, 'evidence': evidence})
    print('PASS', name, flush=True)


def state(page):
    return page.evaluate('''() => {
      const s=nebeljagdTestState();
      return {phase:s.phase,elapsed:s.elapsed,position:s.position,distance:s.distance,
        houses:s.houses,minimap:s.minimap,rendering:s.rendering,
        world:{mapId:s.world.mapId,mapName:s.world.mapName,source:s.world.source,
          bounds:s.world.bounds,stats:s.world.stats,objects:s.world.objects,
          groundHeight:s.world.groundHeight,isWater:s.world.isWater}};
    }''')


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1100, 'height': 760})
        page = context.new_page()
        page.set_default_timeout(120000)
        page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
        page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
        if STANDALONE:
            def resource(request):
                parsed = urlsplit(request.url)
                if parsed.scheme not in ['http', 'https']:
                    return
                if parsed.netloc == urlsplit(URL).netloc and (request.is_navigation_request() or parsed.path == '/favicon.ico'):
                    return
                REPORT['delivery']['unexpectedRequests'].append(request.url)
            context.on('request', resource)
        path = '/nebeljagd.html' if STANDALONE else '/index.html'
        page.goto(URL + path + '?quality=low', wait_until='domcontentloaded')
        page.wait_for_function('window.nebeljagdTestState && nebeljagdTestState().rendering.calls>0')
        expect(page.locator('#errorScreen')).to_be_hidden()
        expect(page.locator('#startBtn')).to_be_enabled()
        first = state(page)
        assert first['world']['mapId'] == SOURCE['id']
        assert first['world']['mapName'] == SOURCE['name']
        assert first['world']['bounds'] == SOURCE['bounds']
        assert first['world']['objects'] == SOURCE['objects']
        assert first['world']['stats']['terrainTriangles'] > 10000
        assert first['rendering']['triangles'] > 1000 and first['rendering']['textures'] > 0
        assert not first['world']['isWater']
        if STANDALONE:
            embedded = page.locator('#worldmap-snapshot').text_content()
            snapshot = json.loads(embedded)
            if snapshot is not None:
                assert snapshot == SOURCE
                assert first['world']['source'] == 'embedded'
            else:
                # Standard distribution bundles the default JSON in its JS;
                # the optional snapshot is only filled by exported custom maps.
                assert first['world']['source'] == 'project'
                assert json.loads((ROOT / 'welt/worldmap.json').read_text()) == SOURCE
        expected_houses = [o for o in SOURCE['objects'] if o['kind'] == 'house']
        assert len(first['houses']) == len(expected_houses)
        assert all(not house['roofVisible'] for house in first['houses'])
        passed('The game renders the new default island and retained roofless tavern',
               {'source': first['world']['source'], 'terrainTriangles': first['world']['stats']['terrainTriangles'],
                'terrainChunks': first['world']['stats']['terrainChunks'], 'houses': first['houses'],
                'rendering': first['rendering']})

        page.locator('#startBtn').click()
        page.wait_for_function("nebeljagdTestState().phase==='playing'")
        start = state(page)
        assert math.hypot(start['position']['x']-SOURCE['gameplay']['spawnPosition'][0],
                          start['position']['z']-SOURCE['gameplay']['spawnPosition'][1]) < 1
        try:
            page.keyboard.down('s')
            page.wait_for_function('t=>nebeljagdTestState().elapsed>=t', arg=start['elapsed'] + .8)
        finally:
            page.keyboard.up('s')
        moved = state(page)
        distance = math.hypot(moved['position']['x']-start['position']['x'], moved['position']['z']-start['position']['z'])
        assert distance > 2, moved
        assert not moved['world']['isWater']
        assert math.isfinite(moved['position']['y'])
        assert abs(moved['position']['y'] - moved['world']['groundHeight']) < .5
        passed('Normal start and keyboard walking remain usable on dry generated terrain',
               {'from': start['position'], 'to': moved['position'], 'distance': distance,
                'groundHeight': moved['world']['groundHeight']})

        page.locator('#mapMode-island').click()
        page.wait_for_function("nebeljagdTestState().minimap.mode==='island'")
        island = state(page)['minimap']
        assert island['spanMeters'] == max(SOURCE['bounds']['maxX']-SOURCE['bounds']['minX'],
                                           SOURCE['bounds']['maxZ']-SOURCE['bounds']['minZ'])
        assert island['player'] and island['canvasPixels'] >= 512
        shot = OUT / 'game-island.png'
        page.screenshot(path=str(shot))
        REPORT['screenshots'].append(str(shot.relative_to(ROOT)))
        passed('The island minimap displays the new coastline and the current player position', island)
        assert not REPORT['errors'], REPORT['errors']
        if STANDALONE:
            assert not REPORT['delivery']['unexpectedRequests'], REPORT['delivery']
        browser.close()
    assert SOURCE_HASH == hashlib.sha256((ROOT / 'worldmap.json').read_bytes()).hexdigest()
    REPORT['status'] = 'passed'
except BaseException as error:
    REPORT['status'] = 'failed'
    REPORT['failure'] = str(error)
    try:
        page.screenshot(path=str(OUT / 'failure.png'))
    except Exception:
        pass
    raise
finally:
    (OUT / 'report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': REPORT['status'], 'checks': len(REPORT['checks']), 'errors': REPORT['errors']}), flush=True)
