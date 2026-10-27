"""Reproduce and verify returning to preset A while preview B loads a GLB.

NEBELJAGD_SOURCE_URL=http://127.0.0.1:5173 python3 tests/landscape_preview_smoke.py
Runs the actual WebGL preview. A browser-only response override reproduces
the former guard, then the unchanged source runs with the corrected guard.
"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_SOURCE_URL', 'http://127.0.0.1:5173').rstrip('/')
FIXTURE = json.loads((ROOT / 'worldmap.json').read_text())
FIXTURE['objects'] = []
REPORT = {'status': 'running', 'url': URL, 'checks': [], 'errors': [],
          'note': 'Real Chromium/SwiftShader preview with a delayed GLB fetch; no runtime files altered.'}
CURRENT = 'if (current.key === (inFlight ? buildingSignature : signature)) return;'
FORMER = 'if (current.key === signature || inFlight && current.key === buildingSignature) return;'


def run(browser, old_guard=False):
    page = browser.new_page(viewport={'width': 800, 'height': 600})
    page.set_default_timeout(30000)
    page.route_web_socket('**', lambda ws: None)
    page.on('pageerror', lambda error: REPORT['errors'].append(str(error)))
    page.on('console', lambda message: REPORT['errors'].append(message.text) if message.type == 'error' else None)
    page.route('**/__qa-landscape-preview.html', lambda route: route.fulfill(
        content_type='text/html', body='<html><body><div id="preview" style="width:500px"></div></body></html>'))
    if old_guard:
        def original_response(route):
            response = route.fetch()
            source = response.text()
            assert CURRENT in source, 'The fixed refresh guard is absent from the served source.'
            route.fulfill(response=response, body=source.replace(CURRENT, FORMER))
        page.route('**/src/map/landscape-preview.js', original_response)
    page.goto(URL + '/__qa-landscape-preview.html', wait_until='domcontentloaded')
    page.evaluate('''async map => {
      const {createLandscapePreview} = await import('/src/map/landscape-preview.js');
      window.sampleSettings = {type:'short',height:1,density:.5};
      window.heldLoad = false;
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, options) => {
        const url = typeof input === 'string' ? input : input.url;
        if (window.holdNextModel && (url.startsWith('data:') || url.includes('.glb'))) {
          window.holdNextModel = false;
          window.heldLoad = true;
          await new Promise(resolve => { window.releaseModel = resolve; });
        }
        return originalFetch(input, options);
      };
      window.preview = createLandscapePreview(document.querySelector('#preview'), {
        getMap:()=>map, getVegetation:()=>window.sampleSettings, getPosition:()=>[-45,30],
      });
    }''', FIXTURE)
    page.wait_for_function('preview.stats.ready && !preview.stats.pending && preview.stats.settings.type==="short"')
    page.evaluate('''()=>{
      window.holdNextModel = true;
      window.sampleSettings = {type:'flowers',height:2,density:.5};
      preview.refresh();
    }''')
    page.wait_for_function('window.heldLoad && typeof window.releaseModel==="function"')
    page.evaluate('''()=>{
      window.sampleSettings = {type:'short',height:1,density:.5};
      preview.refresh();
      window.releaseModel();
    }''')
    page.wait_for_function('preview.stats.ready && !preview.stats.pending')
    result = page.evaluate('''()=>({requestedType:sampleSettings.type,type:preview.stats.settings.type,
      height:preview.stats.settings.height,renderVariant:preview.stats.patch.renderVariant,
      frames:preview.stats.frames,calls:preview.stats.calls,error:preview.stats.error})''')
    page.evaluate('preview.dispose()')
    page.close()
    return result


try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-proxy-server','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        previous = run(browser, old_guard=True)
        assert previous['type'] == 'flowers' and previous['height'] == 2, previous
        REPORT['checks'].append({'name': 'Former guard leaves stale preset B after returning to A', 'evidence': previous})
        current = run(browser)
        assert current['type'] == 'short' and current['height'] == 1 and current['renderVariant'] == 'short', current
        assert current['calls'] > 0 and current['frames'] > 0 and current['error'] is None, current
        REPORT['checks'].append({'name': 'Corrected preview finishes at the latest requested preset A after an in-flight GLB load', 'evidence': current})
        browser.close()
    assert not REPORT['errors'], REPORT['errors']
    REPORT['status'] = 'passed'
finally:
    (ROOT / 'docs/landscape-preview-check.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(REPORT, ensure_ascii=False, indent=2))
