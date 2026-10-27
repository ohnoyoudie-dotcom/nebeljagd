"""Capture catalogue thumbnails from the actual existing Three.js game models.
Run with Vite active: NEBELJAGD_URL=http://127.0.0.1:5190 python3 scripts/capture-asset-previews.py
No source model is modified. Thumbnails are embedded in the offline editor.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get('NEBELJAGD_URL', 'http://127.0.0.1:5190').rstrip('/')
OUT = ROOT / 'assets/catalog'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--only-prefix', help='Capture only variant IDs with this prefix and preserve every other thumbnail exactly.')
args = parser.parse_args()
manifest = json.loads((OUT / 'preview-manifest.json').read_text()) if args.only_prefix else {}
errors = []
captured = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
        args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 256, 'height': 192}, device_scale_factor=1)
    page.on('pageerror', lambda error: (errors.append(str(error)), print('ERROR', str(error), flush=True)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.route('**/@vite/client', lambda route: route.fulfill(status=200, content_type='application/javascript', body='export {};'))
    print('Opening preview', flush=True)
    page.goto(URL + '/assets/catalog/preview.html', wait_until='domcontentloaded')
    print('Waiting for models', flush=True)
    page.wait_for_function('window.previewReady', timeout=90000)
    print('Models ready', flush=True)
    variants = page.evaluate('window.previewVariants')
    previews = json.loads((OUT / 'previews.json').read_text()) if args.only_prefix else {}
    entries = manifest.get('variants', [])
    for variant in variants:
        if args.only_prefix and not variant['variant'].startswith(args.only_prefix):
            continue
        key = f"{variant['kind']}:{variant['variant']}"
        print('Capture', key, flush=True)
        uri = page.evaluate('v => window.captureVariant(v.kind,v.variant)', variant)
        assert uri.startswith('data:image/webp;base64,'), key
        blob = base64.b64decode(uri.split(',', 1)[1])
        assert blob[:4] == b'RIFF' and blob[8:12] == b'WEBP'
        previews[key] = uri
        name = f"{variant['kind']}-{variant['variant']}.webp"
        (OUT / name).write_bytes(blob)
        record = {**variant, 'file': f'assets/catalog/{name}', 'bytes': len(blob),
            'sha256': hashlib.sha256(blob).hexdigest()}
        framing = page.evaluate('window.lastPreviewBounds ?? null')
        if framing is not None: record['renderedBounds'] = framing
        previous = next((i for i, item in enumerate(entries) if item['kind'] == variant['kind'] and item['variant'] == variant['variant']), None)
        if previous is None: entries.append(record)
        else: entries[previous] = record
        captured.append(key)
    browser.close()
assert not errors, errors
assert captured, 'No variants matched the requested capture prefix.'
(OUT / 'previews.json').write_text(json.dumps(previews, ensure_ascii=False, separators=(',', ':')) + '\n')
(OUT / 'preview-manifest.json').write_text(json.dumps({
    'method': '256x192 WebGL renders of the actual current runtime object models; editor thumbnails only.',
    'source': 'assets/catalog/preview.html', 'generator': 'scripts/capture-asset-previews.py',
    'variants': entries, 'errors': errors,
}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'status': 'passed', 'variants': len(entries), 'captured': captured, 'embeddedBytes': (OUT / 'previews.json').stat().st_size, 'errors': errors}))
